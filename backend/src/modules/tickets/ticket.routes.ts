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
import { User } from "@/db/models";
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

      // Fetch existing ticket so we can detect status changes.
      const existingTicket = await repo.getTicket(req.params.id);

      // Managers may update:
      // 1. their own tickets, OR
      // 2. Complaint tickets assigned to their team.
      //
      // They must not be able to update another manager's team grievance.
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

        const managerTicket = await repo.getTeamGrievanceTicket(
          req.params.id,
          req.user.employeeId,
        );

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
