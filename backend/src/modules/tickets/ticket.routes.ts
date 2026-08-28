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

import * as repo from "./ticket.repository";
import { notify } from "@/modules/notifications/notifications.repository";
import { User, AuditLog } from "@/db/models";
import { Employee } from "@/db/models";

import type { AuthUser } from "@/types/express";

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const ticketRouter = Router();

ticketRouter.use(authenticate);

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

      const ticket = await repo.createTicket({
        employeeId: req.user.employeeId,
        managerId: employee?.managerId ?? null,
        category: parsed.data.category,
        priority: parsed.data.priority,
        subject: parsed.data.subject,
        description: parsed.data.description,
        attachment,
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

      return res.status(201).json({
        ticket,
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

      /* SUPER ADMIN → ALL TICKETS */

      if (role === "SUPER_ADMIN") {
        const tickets = await repo.getTickets();

        return res.json({
          tickets,
        });
      }

      /* HR ADMIN → HR TICKETS */

      if (role === "HR_ADMIN") {
        const tickets = await repo.getTicketsByAssignees(["HR_ADMIN"]);

        return res.json({
          tickets,
        });
      }

      /* FINANCE → PAYROLL TICKETS */

      if (role === "FINANCE") {
        const tickets = await repo.getTicketsByAssignees(["FINANCE"]);

        return res.json({
          tickets,
        });
      }

      /* MANAGER → TEAM GRIEVANCE TICKETS */

      if (role === "MANAGER") {
        if (!req.user.employeeId) {
          return res.status(401).json({
            error: {
              message: "Manager employee profile not found",
            },
          });
        }

        const tickets = await repo.getTeamGrievanceTickets(req.user.employeeId);

        return res.json({
          tickets,
        });
      }

      /* IT SUPPORT → IT TICKETS */

      if (role === "IT_SUPPORT") {
        const tickets = await repo.getTicketsByAssignees(["IT_SUPPORT"]);

        return res.json({
          tickets,
        });
      }

      return res.status(403).json({
        error: {
          message: "You are not authorized to access tickets",
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   MY TICKETS

   IMPORTANT:
   Employee sees ONLY tickets raised by that employee.

   This includes:
   - Old tickets
   - New tickets

   It does NOT show other employees' tickets.
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

      console.log("[Tickets] My Tickets employeeId:", req.user.employeeId);

      const tickets = await repo.getMyTickets(req.user.employeeId);

      console.log(`[Tickets] Found ${tickets.length} ticket(s)`);

      return res.json({
        tickets,
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

      // Managers may update:
      // 1. their own tickets, OR
      // 2. Complaint/grievance tickets assigned to their team.
      //
      // They must never be able to update another Manager's team grievance.
      if (String(req.user.role) === "MANAGER") {
        if (!req.user.employeeId) {
          return res.status(401).json({
            error: {
              message: "Manager employee profile not found",
            },
          });
        }

        const isOwnTicket = existingTicket?.employeeId === req.user.employeeId;

        const managerTicket = isOwnTicket
          ? null
          : await repo.getTeamGrievanceTicket(
              req.params.id,
              req.user.employeeId,
            );

        if (!isOwnTicket && !managerTicket) {
          return res.status(403).json({
            error: {
              message: "You are not authorized to update this ticket",
            },
          });
        }
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

      const role = String(req.user.role);

      /* =====================================================
         SUPER ADMIN
      ===================================================== */

      if (role === "SUPER_ADMIN") {
        return res.json({
          ticket,
        });
      }

      /* =====================================================
         EMPLOYEE
         Employee can view their own ticket.
      ===================================================== */

      if (req.user.employeeId && ticket.employeeId === req.user.employeeId) {
        return res.json({
          ticket,
        });
      }

      /* =====================================================
         ROLE-BASED ACCESS
      ===================================================== */

      // MANAGER → only Complaint tickets assigned to this manager.
      if (role === "MANAGER") {
        if (!req.user.employeeId) {
          return res.status(401).json({
            error: {
              message: "Manager employee profile not found",
            },
          });
        }

        // Managers can access only grievance/Complaint tickets assigned
        // to their own team. The authenticated employeeId is the only
        // manager scope used here.
        const managerTicket =
          ticket.category === "Complaint"
            ? await repo.getTeamGrievanceTicket(
                req.params.id,
                req.user.employeeId,
              )
            : null;

        if (managerTicket) {
          return res.json({
            ticket: managerTicket,
          });
        }

        return res.status(403).json({
          error: {
            message: "You are not authorized to view this team grievance",
          },
        });
      }

      const allowedAssignees: Record<string, string[]> = {
        HR_ADMIN: ["HR_ADMIN"],
        FINANCE: ["FINANCE"],
        IT_SUPPORT: ["IT_SUPPORT"],
      };

      const allowed = allowedAssignees[role];

      if (allowed && ticket.assignedTo && allowed.includes(ticket.assignedTo)) {
        return res.json({
          ticket,
        });
      }

      return res.status(403).json({
        error: {
          message: "You are not authorized to view this ticket",
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
