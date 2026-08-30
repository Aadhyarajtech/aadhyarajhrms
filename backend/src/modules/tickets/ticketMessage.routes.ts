import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";

import { authenticate } from "@/middleware/auth";
import { upload, UPLOADS_PUBLIC_PATH } from "@/middleware/upload";

import type { AuthUser } from "@/types/express";

import * as messageRepo from "./ticketMessage.repository";
import * as ticketRepo from "./ticket.repository";
import { notify } from "@/modules/notifications/notifications.repository";
import { User, Employee } from "@/db/models";

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const ticketMessageRouter = Router();

ticketMessageRouter.use(authenticate);

/* =========================================================
   GET TICKET MESSAGES
   GET /api/tickets/:id/messages
========================================================= */

ticketMessageRouter.get(
  "/:id/messages",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      const ticketId = req.params.id;

      if (!ticketId) {
        return res.status(400).json({
          error: {
            message: "Ticket ID is required",
          },
        });
      }

      const ticket = await ticketRepo.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({
          error: {
            message: "Ticket not found",
          },
        });
      }

      const role = String(req.user.role);

      let allowed = false;

      if (role === "SUPER_ADMIN") {
        allowed = true;
      }

      if (req.user.employeeId && ticket.employeeId === req.user.employeeId) {
        allowed = true;
      }

      const allowedAssignees: Record<string, string[]> = {
        HR_ADMIN: ["HR_ADMIN"],
        FINANCE: ["FINANCE"],
        IT_SUPPORT: ["IT_SUPPORT"],
      };

      if (
        role === "MANAGER" &&
        req.user.employeeId &&
        ticket.category === "Complaint" &&
        ticket.assignedManagerId === req.user.employeeId
      ) {
        allowed = true;
      }

      if (
        role !== "MANAGER" &&
        allowedAssignees[role] &&
        ticket.assignedTo &&
        allowedAssignees[role].includes(ticket.assignedTo)
      ) {
        allowed = true;
      }

      if (!allowed) {
        return res.status(403).json({
          error: {
            message: "You are not authorized to view this ticket",
          },
        });
      }

      const messages = await messageRepo.getTicketMessages(ticketId);

      return res.json({
        messages,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   CREATE TICKET MESSAGE
   POST /api/tickets/:id/messages

   Supports:
   - text
   - attachment
========================================================= */

const createMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .max(5000, "Message cannot exceed 5000 characters")
    .optional()
    .default(""),
});

ticketMessageRouter.post(
  "/:id/messages",
  upload.single("attachment"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      if (!req.user.employeeId) {
        return res.status(401).json({
          error: {
            message: "Employee not found",
          },
        });
      }

      const ticketId = req.params.id;

      if (!ticketId) {
        return res.status(400).json({
          error: {
            message: "Ticket ID is required",
          },
        });
      }

      const parsed = createMessageSchema.safeParse({
        message: req.body.message || "",
      });

      if (!parsed.success) {
        return res.status(400).json({
          error: {
            message: "Invalid message",
            details: parsed.error.flatten(),
          },
        });
      }

      const uploadedFile = req.file;

      const attachment = uploadedFile
        ? `${UPLOADS_PUBLIC_PATH}/${uploadedFile.filename}`
        : "";

      if (!parsed.data.message.trim() && !attachment) {
        return res.status(400).json({
          error: {
            message: "Please enter a message or attach a file",
          },
        });
      }

      const ticket = await ticketRepo.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({
          error: {
            message: "Ticket not found",
          },
        });
      }

      const role = String(req.user.role);

      let allowed = false;

      if (role === "SUPER_ADMIN") {
        allowed = true;
      }

      if (req.user.employeeId && ticket.employeeId === req.user.employeeId) {
        allowed = true;
      }

      const allowedAssignees: Record<string, string[]> = {
        HR_ADMIN: ["HR_ADMIN"],
        FINANCE: ["FINANCE"],
        IT_SUPPORT: ["IT_SUPPORT"],
      };

      if (
        role === "MANAGER" &&
        req.user.employeeId &&
        ticket.category === "Complaint" &&
        ticket.assignedManagerId === req.user.employeeId
      ) {
        allowed = true;
      }

      if (
        role !== "MANAGER" &&
        allowedAssignees[role] &&
        ticket.assignedTo &&
        allowedAssignees[role].includes(ticket.assignedTo)
      ) {
        allowed = true;
      }

      if (!allowed) {
        return res.status(403).json({
          error: {
            message: "You are not authorized to reply to this ticket",
          },
        });
      }

      const message = await messageRepo.createTicketMessage({
        ticketId,
        employeeId: req.user.employeeId,
        senderName: req.user.name || req.user.employeeId,
        senderRole: role || "EMPLOYEE",
        message: parsed.data.message,
        attachment,
      });

      // Create notifications for relevant users (do not notify the sender)
      try {
        const ticketOwnerEmp = await Employee.findById(
          ticket.employeeId,
        ).lean();

        const senderUserId = req.user.userId;

        if (role === "EMPLOYEE") {
          // Notify assigned role users (e.g., HR_ADMIN, FINANCE, MANAGER, IT_SUPPORT)
          const recipients = await User.find({
            role: ticket.assignedTo,
            isActive: true,
          }).lean();
          for (const r of recipients) {
            if (r._id === senderUserId) continue;
            await notify({
              userId: r._id,
              type: "TICKET_MESSAGE",
              title: `${req.user.name || "An employee"} sent a new message`,
              message: `${ticket.ticketId}`,
              link: `/app/tickets/${ticket._id}`,
            });
          }
        } else {
          // Sender is admin/staff — notify ticket owner employee's user account
          if (
            ticketOwnerEmp &&
            ticketOwnerEmp.userId &&
            ticketOwnerEmp.userId !== senderUserId
          ) {
            await notify({
              userId: ticketOwnerEmp.userId,
              type: "TICKET_MESSAGE",
              title: `${req.user.name || "Staff"} replied to your ticket`,
              message: `${ticket.ticketId}`,
              link: `/app/tickets/${ticket._id}`,
            });
          }
        }
      } catch (err) {
        // Notification failure should not break message creation
        console.error("Failed to send ticket notifications", err);
      }

      return res.status(201).json({ message });
    } catch (err) {
      next(err);
    }
  },
);
