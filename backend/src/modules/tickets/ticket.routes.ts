import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";

import { authenticate } from "@/middleware/auth";
import { upload, UPLOADS_PUBLIC_PATH } from "@/middleware/upload";
import { validate } from "@/middleware/validate";
import { requirePermission } from "@/middleware/permissions";

import * as repo from "./ticket.repository";
import { notify } from "@/modules/notifications/notifications.repository";
import { User, AuditLog, Ticket } from "@/db/models";
import { Employee } from "@/db/models";
import {
  classifyTicket,
  summarizeTicketThread,
  generateSuggestedReply,
} from "@/services/ai.service";
import * as messageRepo from "./ticketMessage.repository";
import {
  calculatePredictiveSlaRisk,
  enrichTicketsWithSlaRisk,
} from "@/services/predictiveSla.service";
import { detectTicketAnomalies } from "@/services/anomalyDetection.service";
import { getHelpdeskExecutiveAnalytics } from "@/services/analytics.service";
import {
  findSimilarTickets,
  detectRecurringIssueGroups,
} from "@/services/similarTickets.service";

import type { AuthUser } from "@/types/express";

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const ticketRouter = Router();

ticketRouter.use(authenticate);
ticketRouter.use(requirePermission("tickets.view"));

/* =========================================================
   CREATE TICKET
   Employee creates a ticket.
   Optional attachment supported.
========================================================= */

const createTicketSchema = z.object({
  category: z.enum([
    "HR",
    "Payroll",
    "Leave",
    "Attendance",
    "Recruitment",
    "Employee Referral",
    "IT Support",
    "Complaint",
  ]),

  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),

  subject: z.string().min(3),

  description: z.string().min(5),

  attachment: z.string().optional(),
});

ticketRouter.post(
  "/",
  upload.single("attachment"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.employeeId) {
        return res.status(401).json({
          error: {
            message: "Employee not found",
          },
        });
      }

      const parsed = createTicketSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: {
            message: "Invalid ticket information",
            details: parsed.error.flatten(),
          },
        });
      }

      const uploadedFile = req.file;

      const attachment = uploadedFile
        ? `${UPLOADS_PUBLIC_PATH}/${uploadedFile.filename}`
        : "";

      // Complaints belong to the employee's direct manager.
      // Resolve the manager from the employee record so the repository
      // can store assignedManagerId for manager-scoped grievance access.
      const employee = await Employee.findById(req.user.employeeId).lean();

      // AI classification (non-blocking — if it fails, we proceed without it)
      const aiResult = await classifyTicket(
        parsed.data.subject,
        parsed.data.description,
        parsed.data.category,
      );

      // Auto-elevate priority to HIGH if AI detects high urgency (financial/work blocker, harassment)
      const effectivePriority =
        aiResult?.priority === "HIGH" ? "HIGH" : parsed.data.priority;

      const ticket = await repo.createTicket({
        employeeId: req.user.employeeId,
        managerId: employee?.managerId ?? null,
        category: parsed.data.category,
        priority: effectivePriority,
        subject: parsed.data.subject,
        description: parsed.data.description,
        attachment,
        aiCategory: aiResult?.category ?? null,
        aiIntent: aiResult?.intent ?? null,
        aiConfidence: aiResult?.confidence ?? null,
        aiReason: aiResult?.reason ?? null,
        aiPriority: aiResult?.priority ?? null,
        aiPriorityReason: aiResult?.priorityReason ?? null,
        aiSentiment: aiResult?.sentiment ?? null,
      });

      // Notify role owners (e.g., HR_ADMIN, FINANCE, MANAGER, IT_SUPPORT)
      try {
        const recipients = await User.find({
          role: ticket.assignedTo,
          isActive: true,
        }).lean();
        for (const r of recipients) {
          if (r._id === req.user.userId) continue;
          await notify({
            userId: r._id,
            type: "TICKET_MESSAGE",
            title: `${req.user.name || "Employee"} raised a new ${ticket.category} ticket`,
            message: `${ticket.ticketId} — ${ticket.subject}`,
            link: `/app/tickets/${ticket._id}`,
          });
        }
      } catch (err) {
        console.error("Failed to send ticket notifications", err);
      }

      // A Complaint is also routed to the employee's direct manager.
      if (ticket.category === "Complaint" && ticket.assignedManagerId) {
        try {
          const manager = await Employee.findById(
            ticket.assignedManagerId,
          ).lean();

          if (manager?.userId && manager.userId !== req.user.userId) {
            await notify({
              userId: manager.userId,
              type: "TICKET_MESSAGE",
              title: `${req.user.name || "Employee"} raised a grievance`,
              message: `${ticket.ticketId} — ${ticket.subject}`,
              link: `/app/tickets/${ticket._id}`,
            });
          }
        } catch (err) {
          console.error(
            "Failed to notify employee's manager about grievance",
            err,
          );
        }
      }

      const risk = calculatePredictiveSlaRisk(ticket);
      return res.status(201).json({
        ticket: { ...ticket, ...risk },
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   GET TICKETS
   Role-based ticket management.

   SUPER_ADMIN → ALL
   HR_ADMIN    → HR assigned tickets
   FINANCE     → Payroll assigned tickets
   MANAGER     → Team grievance tickets assigned to that manager
   IT_SUPPORT  → IT assigned tickets
========================================================= */

ticketRouter.get(
  "/",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      const role = String(req.user.role);

      const allowedRoles = [
        "SUPER_ADMIN",
        "HR_ADMIN",
        "FINANCE",
        "MANAGER",
        "IT_SUPPORT",
      ];

      if (!allowedRoles.includes(role)) {
        return res.status(403).json({
          error: {
            message: "You are not authorized to access tickets",
          },
        });
      }

      if (role === "MANAGER" && !req.user.employeeId) {
        return res.status(401).json({
          error: {
            message: "Manager employee profile not found",
          },
        });
      }

      const rawTickets = await repo.getTicketsForDepartment(
        role,
        req.user.employeeId,
      );

      // Enrich all tickets with predictive SLA breach evaluations
      const tickets = enrichTicketsWithSlaRisk(rawTickets);
      return res.json({
        tickets,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   MY TICKETS
========================================================= */

ticketRouter.get(
  "/my",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.employeeId) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      const rawTickets = await repo.getMyTickets(req.user.employeeId);
      const tickets = enrichTicketsWithSlaRisk(rawTickets);

      return res.json({
        tickets,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   EXECUTIVE AI HELPDESK ANALYTICS (Phase 5)
========================================================= */

function getDepartmentFilterForRole(role: string) {
  if (role === "SUPER_ADMIN" || role === "HR_ADMIN") {
    return undefined; // Global access for HR Manager and Super Admin
  }
  if (role === "IT_SUPPORT") {
    return { assignedTo: ["IT_SUPPORT"], categories: ["IT Support"] };
  }
  if (role === "FINANCE") {
    return { assignedTo: ["FINANCE"], categories: ["Payroll"] };
  }
  return undefined;
}

ticketRouter.get(
  "/analytics",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { message: "Unauthorized" },
        });
      }

      const role = String(req.user.role);
      const allowedRoles = [
        "SUPER_ADMIN",
        "HR_ADMIN",
        "FINANCE",
        "MANAGER",
        "IT_SUPPORT",
      ];
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({
          error: {
            message:
              "Executive analytics is restricted to support staff and administrators",
          },
        });
      }

      const departmentFilter = getDepartmentFilterForRole(role);
      const analytics = await getHelpdeskExecutiveAnalytics(departmentFilter);
      return res.json({
        success: true,
        analytics,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   TREND & OUTAGE ANOMALY DETECTION (Phase 5)
========================================================= */
ticketRouter.get(
  "/anomalies",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { message: "Unauthorized" },
        });
      }

      const role = String(req.user.role);
      const departmentFilter = getDepartmentFilterForRole(role);
      const query: any = {};
      if (departmentFilter) {
        query.$or = [
          { assignedTo: { $in: departmentFilter.assignedTo } },
          { category: { $in: departmentFilter.categories } },
        ];
      }

      const rawTickets = await Ticket.find(query)
        .sort({ createdAt: -1 })
        .limit(150)
        .lean();
      const anomalies = detectTicketAnomalies(rawTickets as any, 24);

      return res.json({
        success: true,
        anomalies,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   RECURRING ISSUE DETECTION (Phase 5)
   Clusters active tickets reporting the exact same problem
========================================================= */
ticketRouter.get(
  "/recurring-issues",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { message: "Unauthorized" },
        });
      }

      const role = String(req.user.role);
      const departmentFilter = getDepartmentFilterForRole(role);
      const windowHours = req.query.windowHours
        ? Number(req.query.windowHours)
        : 48;
      const groups = await detectRecurringIssueGroups(
        2,
        windowHours,
        departmentFilter,
      );

      return res.json({
        success: true,
        groups,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   CLUSTER BROADCAST MESSAGE (Phase 5)
   Sends a unified message and optional status update to all
   tickets in a cluster or recurring issue group simultaneously.
========================================================= */

const broadcastBatchSchema = z.object({
  ticketIds: z.array(z.string()).min(1, "At least one ticket ID required"),
  message: z.string().min(3, "Message must be at least 3 characters"),
  updateStatus: z
    .enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
    .optional(),
});

ticketRouter.post(
  "/broadcast-batch",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: "Unauthorized" } });
      }

      const role = String(req.user.role || "");
      const allowedRoles = [
        "SUPER_ADMIN",
        "HR_ADMIN",
        "FINANCE",
        "MANAGER",
        "IT_SUPPORT",
      ];
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({
          error: {
            message: "You do not have permission to broadcast cluster messages",
          },
        });
      }

      const parsed = broadcastBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: {
            message: "Validation failed",
            details: parsed.error.flatten().fieldErrors,
          },
        });
      }

      const {
        ticketIds,
        message: broadcastMessage,
        updateStatus,
      } = parsed.data;

      // Find tickets by _id or ticketId
      const tickets = await Ticket.find({
        $or: [{ _id: { $in: ticketIds } }, { ticketId: { $in: ticketIds } }],
      });

      if (!tickets || tickets.length === 0) {
        return res.status(404).json({
          error: { message: "No matching tickets found to broadcast to" },
        });
      }

      // Department authorization check
      const unauthorized = tickets.some(
        (t) => !repo.isUserAuthorizedForTicket(t, req.user!),
      );
      if (unauthorized && role !== "SUPER_ADMIN" && role !== "HR_ADMIN") {
        return res.status(403).json({
          error: {
            message:
              "You are not authorized to broadcast to tickets outside your department",
          },
        });
      }

      const senderEmployeeId =
        req.user.employeeId || req.user.userId || "STAFF";
      const senderName = req.user.name || "Support Staff";
      const senderRole = req.user.role || "HR_ADMIN";

      const results: Array<{
        ticketId: string;
        status: string;
        messageId: string;
      }> = [];

      for (const ticket of tickets) {
        const ticketIdStr = String(ticket._id);

        // 1. Create message in ticket conversation
        const createdMsg = await messageRepo.createTicketMessage({
          ticketId: ticketIdStr,
          employeeId: senderEmployeeId,
          senderName: `${senderName} (Broadcast)`,
          senderRole,
          message: broadcastMessage,
        });

        // 2. Update status if specified
        let currentStatus = ticket.status;
        if (updateStatus && updateStatus !== ticket.status) {
          await repo.updateTicketStatus(ticketIdStr, updateStatus);
          currentStatus = updateStatus;
        }

        // 3. Notify ticket owner employee
        try {
          const ownerEmp = await Employee.findById(ticket.employeeId).lean();
          if (ownerEmp?.userId && ownerEmp.userId !== req.user.userId) {
            await notify({
              userId: ownerEmp.userId,
              type: "TICKET_MESSAGE",
              title: `${senderName} posted an update on ticket ${ticket.ticketId}`,
              message: broadcastMessage.slice(0, 100),
              link: `/app/tickets/${ticket._id}`,
            });
          }
        } catch (notifErr) {
          console.warn(
            "Broadcast notification failed for ticket",
            ticket.ticketId,
            notifErr,
          );
        }

        results.push({
          ticketId: ticket.ticketId,
          status: currentStatus,
          messageId: String((createdMsg as any)?._id || ""),
        });
      }

      // Record permanent audit entry
      try {
        await AuditLog.create({
          userId: req.user.userId,
          action: "TICKET_CLUSTER_BROADCAST",
          entity: "Ticket",
          entityId: tickets[0]._id,
          metadata: JSON.stringify({
            ticketCount: tickets.length,
            ticketIds: tickets.map((t) => t.ticketId),
            updateStatus: updateStatus || null,
            senderRole,
          }),
          ipAddress: req.ip || null,
        });
      } catch (auditErr) {
        console.warn("Failed to record audit log for broadcast", auditErr);
      }

      return res.status(200).json({
        success: true,
        sentCount: results.length,
        results,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   UPDATE TICKET STATUS

   Assigned role / authorized user can update status.
========================================================= */

const updateSchema = z.object({
  status: z.enum([
    "OPEN",
    "IN_PROGRESS",
    "WAITING_FOR_EMPLOYEE",
    "RESOLVED",
    "CLOSED",
  ]),
});

const escalateSchema = z.object({
  escalatedTo: z.enum(["HR_ADMIN", "SUPER_ADMIN"]),
  reason: z.string().trim().min(3).max(1000),
});

ticketRouter.patch(
  "/:id",
  validate(updateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      // Fetch the existing ticket first so we can enforce the Manager's
      // team-only boundary and correctly notify the ticket owner.
      const existingTicket = await repo.getTicket(req.params.id);

      if (!existingTicket) {
        return res.status(404).json({
          error: {
            message: "Ticket not found",
          },
        });
      }

      if (!repo.isUserAuthorizedForTicket(existingTicket, req.user)) {
        return res.status(403).json({
          error: {
            message: "You are not authorized to update this ticket",
          },
        });
      }

      const ticket = await repo.updateTicketStatus(
        req.params.id,
        req.body.status,
      );

      if (!ticket) {
        return res.status(404).json({
          error: {
            message: "Ticket not found",
          },
        });
      }

      // If status changed, notify relevant users
      try {
        const prevStatus = existingTicket?.status;
        const newStatus = ticket?.status;

        if (prevStatus && newStatus && prevStatus !== newStatus) {
          const senderUserId = req.user.userId;

          // If the change is made by the employee (ticket owner), notify assignees
          if (String(req.user.role) === "EMPLOYEE") {
            const recipients = await User.find({
              role: ticket.assignedTo,
              isActive: true,
            }).lean();
            for (const r of recipients) {
              if (r._id === senderUserId) continue;
              await notify({
                userId: r._id,
                type: "TICKET_MESSAGE",
                title: `${req.user.name || "Employee"} changed ticket status to ${newStatus}`,
                message: `${ticket.ticketId} — ${ticket.subject}`,
                link: `/app/tickets/${ticket._id}`,
              });
            }
          } else {
            // Change is made by admin/staff — notify the ticket owner
            const ticketOwnerEmp = await Employee.findById(
              ticket.employeeId,
            ).lean();
            if (
              ticketOwnerEmp &&
              ticketOwnerEmp.userId &&
              ticketOwnerEmp.userId !== senderUserId
            ) {
              await notify({
                userId: ticketOwnerEmp.userId,
                type: "TICKET_MESSAGE",
                title: `${req.user.name || "Staff"} changed your ticket status to ${newStatus}`,
                message: `${ticket.ticketId} — ${ticket.subject}`,
                link: `/app/tickets/${ticket._id}`,
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to send status change notifications", err);
      }

      return res.json({
        ticket,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   ESCALATE MANAGER GRIEVANCE

   Manager may escalate only an assigned Complaint from their
   direct-report team. The repository performs the ownership
   check again before changing the ticket.
========================================================= */

ticketRouter.post(
  "/:id/escalate",
  validate(escalateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      if (String(req.user.role) !== "MANAGER") {
        return res.status(403).json({
          error: {
            message: "Only Managers can escalate team grievances",
          },
        });
      }

      if (!req.user.employeeId) {
        return res.status(401).json({
          error: {
            message: "Manager employee profile not found",
          },
        });
      }

      const parsed = escalateSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: {
            message: "Invalid escalation information",
            details: parsed.error.flatten(),
          },
        });
      }

      // Verify the Manager is allowed to act on this exact grievance
      // before attempting the state-changing operation.
      const teamTicket = await repo.getTeamGrievanceTicket(
        req.params.id,
        req.user.employeeId,
      );

      if (!teamTicket) {
        return res.status(403).json({
          error: {
            message: "You are not authorized to escalate this grievance",
          },
        });
      }

      if ((teamTicket as any).isEscalated) {
        return res.status(409).json({
          error: {
            message: "This grievance has already been escalated",
          },
        });
      }

      const ticket = await repo.escalateTeamGrievance(
        req.params.id,
        req.user.employeeId,
        parsed.data.escalatedTo,
        parsed.data.reason,
      );

      // Record a permanent audit entry for the escalation.
      try {
        await AuditLog.create({
          userId: req.user.userId,
          action: "TICKET_ESCALATED",
          entity: "Ticket",
          entityId: ticket._id,
          metadata: JSON.stringify({
            ticketId: ticket.ticketId,
            escalatedTo: parsed.data.escalatedTo,
            reason: parsed.data.reason,
            managerEmployeeId: req.user.employeeId,
          }),
          ipAddress: req.ip || null,
          createdAt: new Date().toISOString(),
        });
      } catch (auditError) {
        // Escalation itself has succeeded; do not roll it back because
        // an audit write failed. Surface the error in server logs.
        console.error(
          "Failed to create ticket escalation audit log",
          auditError,
        );
      }

      // Notify the employee who raised the grievance.
      try {
        const owner = await Employee.findById(ticket.employeeId).lean();

        if (owner?.userId && owner.userId !== req.user.userId) {
          await notify({
            userId: owner.userId,
            type: "TICKET_MESSAGE",
            title: "Your grievance has been escalated",
            message: `${ticket.ticketId} — ${ticket.subject}`,
            link: `/app/tickets/${ticket._id}`,
          });
        }
      } catch (notificationError) {
        console.error(
          "Failed to notify employee about grievance escalation",
          notificationError,
        );
      }

      // Notify active users who own the escalation destination role.
      try {
        const recipients = await User.find({
          role: parsed.data.escalatedTo,
          isActive: true,
        }).lean();

        for (const recipient of recipients) {
          if (recipient._id === req.user.userId) continue;

          await notify({
            userId: recipient._id,
            type: "TICKET_MESSAGE",
            title: "Grievance escalated for your attention",
            message: `${ticket.ticketId} — ${ticket.subject}`,
            link: `/app/tickets/${ticket._id}`,
          });
        }
      } catch (notificationError) {
        console.error(
          "Failed to notify escalation recipients",
          notificationError,
        );
      }

      return res.json({
        ticket,
        message: "Grievance escalated successfully",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";

      if (
        message === "Invalid escalation target." ||
        message === "Escalation reason is required." ||
        message === "Escalation reason must not exceed 1000 characters."
      ) {
        return res.status(400).json({
          error: {
            message,
          },
        });
      }

      if (
        message === "Grievance not found or not assigned to this manager." ||
        message.includes("no longer assigned to this manager")
      ) {
        return res.status(403).json({
          error: {
            message: "You are not authorized to escalate this grievance",
          },
        });
      }

      if (message === "This grievance has already been escalated.") {
        return res.status(409).json({
          error: {
            message,
          },
        });
      }

      next(err);
    }
  },
);

/* =========================================================
   GRIEVANCE SLA / ESCALATION HISTORY
   Manager can inspect SLA state and escalation history only for
   grievances belonging to their direct-report team.
========================================================= */

ticketRouter.get(
  "/:id/escalation-history",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      if (String(req.user.role) !== "MANAGER") {
        return res.status(403).json({
          error: {
            message: "Only Managers can view team grievance escalation history",
          },
        });
      }

      if (!req.user.employeeId) {
        return res.status(401).json({
          error: {
            message: "Manager employee profile not found",
          },
        });
      }

      const history = await repo.getGrievanceEscalationHistory(
        req.params.id,
        req.user.employeeId,
      );

      return res.json({
        history,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";

      if (message === "Grievance not found or not assigned to this manager.") {
        return res.status(403).json({
          error: {
            message: "You are not authorized to view this grievance history",
          },
        });
      }

      next(err);
    }
  },
);

ticketRouter.post(
  "/sla/refresh",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      // This endpoint is intentionally restricted. It is useful for an
      // internal scheduler/health process, but must not be exposed as a
      // Manager action that can mutate arbitrary tickets.
      if (!["SUPER_ADMIN", "HR_ADMIN"].includes(String(req.user.role))) {
        return res.status(403).json({
          error: {
            message: "Only HR Admin or Super Admin can refresh grievance SLA",
          },
        });
      }

      const result = await repo.refreshOpenGrievanceSla();

      return res.json({
        ...result,
        message: "Open grievance SLA statuses refreshed successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   GET SINGLE TICKET

   Access rules:

   SUPER_ADMIN → All tickets

   Employee → Only tickets raised by themselves

   HR_ADMIN → Tickets assigned to HR_ADMIN

   FINANCE → Tickets assigned to FINANCE

   MANAGER → Tickets assigned to MANAGER

   IT_SUPPORT → Tickets assigned to IT_SUPPORT
========================================================= */

ticketRouter.get(
  "/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      const ticket = await repo.getTicket(req.params.id);

      if (!ticket) {
        return res.status(404).json({
          error: {
            message: "Ticket not found",
          },
        });
      }

      const risk = calculatePredictiveSlaRisk(ticket);
      const enrichedTicket = { ...ticket, ...risk };

      if (!repo.isUserAuthorizedForTicket(ticket, req.user)) {
        return res.status(403).json({
          error: {
            message: "You are not authorized to view this ticket",
          },
        });
      }

      return res.json({
        ticket: enrichedTicket,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   SIMILAR TICKET DETECTION (Phase 5)
   Identifies other tickets reporting the exact same problem
========================================================= */
ticketRouter.get(
  "/:id/similar",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { message: "Unauthorized" },
        });
      }

      const result = await findSimilarTickets(req.params.id);

      return res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   AI CLASSIFY
   Pre-submission classification endpoint.
   Frontend calls this before creating a ticket so the employee
   can see the AI suggestion and optionally accept it.
========================================================= */

const classifySchema = z.object({
  subject: z.string().min(3),
  description: z.string().min(5),
  category: z.string().optional(),
});

ticketRouter.post(
  "/classify",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.employeeId) {
        return res.status(401).json({
          error: { message: "Authentication required" },
        });
      }

      const parsed = classifySchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: {
            message: "Subject and description are required",
            details: parsed.error.flatten(),
          },
        });
      }

      const result = await classifyTicket(
        parsed.data.subject,
        parsed.data.description,
        parsed.data.category,
      );

      if (!result) {
        return res.json({
          classified: false,
          message: "AI classification is not available",
        });
      }

      return res.json({
        classified: true,
        category: result.category,
        intent: result.intent,
        confidence: result.confidence,
        reason: result.reason,
        priority: result.priority,
        priorityReason: result.priorityReason,
        sentiment: result.sentiment,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   ANALYZE EXISTING TICKET WITH AI
   Allows HR/Admin to trigger AI classification on an existing
   ticket and persist the insights directly into the database.
========================================================= */

ticketRouter.post(
  "/:id/analyze-ai",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { message: "Authentication required" },
        });
      }

      const ticket = await repo.getTicket(req.params.id);

      if (!ticket) {
        return res.status(404).json({
          error: { message: "Ticket not found" },
        });
      }

      const result = await classifyTicket(
        ticket.subject,
        ticket.description,
        ticket.category,
      );

      if (!result) {
        return res.status(500).json({
          error: { message: "AI classification failed" },
        });
      }

      // Update ticket in database
      const updateFields: any = {
        aiCategory: result.category,
        aiIntent: result.intent,
        aiConfidence: result.confidence,
        aiReason: result.reason,
        aiPriority: result.priority,
        aiPriorityReason: result.priorityReason,
        aiSentiment: result.sentiment,
        updatedAt: new Date().toISOString(),
      };

      if (result.priority === "HIGH") {
        updateFields.priority = "HIGH";
      }

      // Smart Re-routing: If AI is confident (>= 0.70) and category differs from current,
      // re-route to the proper department and update category
      if (result.confidence >= 0.7 && result.category !== ticket.category) {
        updateFields.category = result.category;
        updateFields.assignedTo = repo.assignDepartment(result.category);
      }

      const updatedTicket = await Ticket.findByIdAndUpdate(
        req.params.id,
        { $set: updateFields },
        { new: true },
      ).lean();

      return res.json({
        success: true,
        ticket: updatedTicket,
        ai: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   PHASE 3: SUMMARIZE TICKET THREAD
   Staff-only endpoint. Generates a 3-bullet executive summary
   of the ticket and its conversation history.
========================================================= */

const STAFF_ROLES = [
  "HR_ADMIN",
  "FINANCE",
  "IT_SUPPORT",
  "SUPER_ADMIN",
  "MANAGER",
];

ticketRouter.post(
  "/:id/summarize",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { message: "Authentication required" },
        });
      }

      const role = String(req.user.role);
      if (!STAFF_ROLES.includes(role)) {
        return res.status(403).json({
          error: { message: "Only support staff can use AI summarization" },
        });
      }

      const ticket = await repo.getTicket(req.params.id);
      if (!ticket) {
        return res.status(404).json({
          error: { message: "Ticket not found" },
        });
      }

      if (!repo.isUserAuthorizedForTicket(ticket, req.user)) {
        return res.status(403).json({
          error: { message: "You are not authorized to access this ticket" },
        });
      }

      // Fetch all messages for this ticket
      const messages = await messageRepo.getTicketMessages(req.params.id);

      // Fetch employee profile for real identity context
      const employee = ticket.employeeId
        ? await Employee.findById(ticket.employeeId).lean()
        : null;

      const employeeName = employee
        ? `${employee.firstName || ""} ${employee.lastName || ""}`.trim() ||
          undefined
        : undefined;

      const ticketContext = {
        ticketId: ticket.ticketId,
        subject: ticket.subject,
        description: ticket.description || "",
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        employeeName,
        agentName: req.user?.name || undefined,
        agentRole: String(req.user?.role || "Staff"),
      };

      const messageContexts = (messages || []).map((m: any) => ({
        senderName: m.senderName || "Unknown",
        senderRole: m.senderRole || "EMPLOYEE",
        message: m.message || "",
        createdAt: m.createdAt || new Date().toISOString(),
      }));

      const summary = await summarizeTicketThread(
        ticketContext,
        messageContexts,
      );

      return res.json({
        success: true,
        summary,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   PHASE 3: AI SUGGESTED REPLY
   Staff-only endpoint. Generates a context-aware draft reply
   for HR support agents with selectable tone.
========================================================= */

const suggestReplySchema = z.object({
  tone: z.enum(["empathetic", "formal", "concise"]).default("empathetic"),
  prompt: z.string().optional(),
  instruction: z.string().optional(),
});

ticketRouter.post(
  "/:id/suggest-reply",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { message: "Authentication required" },
        });
      }

      const role = String(req.user.role);
      if (!STAFF_ROLES.includes(role)) {
        return res.status(403).json({
          error: { message: "Only support staff can use AI reply suggestions" },
        });
      }

      const ticket = await repo.getTicket(req.params.id);
      if (!ticket) {
        return res.status(404).json({
          error: { message: "Ticket not found" },
        });
      }

      if (!repo.isUserAuthorizedForTicket(ticket, req.user)) {
        return res.status(403).json({
          error: { message: "You are not authorized to access this ticket" },
        });
      }

      const parsed = suggestReplySchema.safeParse(req.body || {});
      const tone = parsed.success ? parsed.data.tone : "empathetic";
      const instruction = parsed.success
        ? (parsed.data.instruction || parsed.data.prompt)?.trim() || undefined
        : undefined;

      // Fetch all messages for this ticket
      const messages = await messageRepo.getTicketMessages(req.params.id);

      // Fetch employee profile for real identity context
      const employee = ticket.employeeId
        ? await Employee.findById(ticket.employeeId).lean()
        : null;

      const employeeName = employee
        ? `${employee.firstName || ""} ${employee.lastName || ""}`.trim() ||
          undefined
        : undefined;

      const ticketContext = {
        ticketId: ticket.ticketId,
        subject: ticket.subject,
        description: ticket.description || "",
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        employeeName,
        agentName: req.user?.name || undefined,
        agentRole: String(req.user?.role || "Staff"),
      };

      const messageContexts = (messages || []).map((m: any) => ({
        senderName: m.senderName || "Unknown",
        senderRole: m.senderRole || "EMPLOYEE",
        message: m.message || "",
        createdAt: m.createdAt || new Date().toISOString(),
      }));

      const result = await generateSuggestedReply(
        ticketContext,
        messageContexts,
        tone,
        instruction,
      );

      return res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);
