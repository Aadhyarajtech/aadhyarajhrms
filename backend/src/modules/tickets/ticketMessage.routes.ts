import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";

import { authenticate } from "@/middleware/auth";
import { ticketAttachmentUpload } from "@/middleware/upload";
import { findGridFsFile, storeGridFsFile, streamGridFsFile } from "@/services/gridfsStorage.service";

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
  "/:id/attachments/:fileId",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return res.status(401).json({ error: { message: "Unauthorized" } });
      const ticket = await ticketRepo.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ error: { message: "Ticket not found" } });
      if (!ticketRepo.isUserAuthorizedForTicket(ticket, req.user)) return res.status(403).json({ error: { message: "You are not authorized to view this attachment" } });
      const file = await findGridFsFile(req.params.fileId);
      if (!file || file.metadata?.category !== "ticket-attachment") return res.status(404).json({ error: { message: "Attachment not found" } });
      const attachmentUrl = `/api/tickets/${req.params.id}/attachments/${req.params.fileId}`;
      const messages = await messageRepo.getTicketMessages(req.params.id);
      if (!messages.some((message: any) => message.attachment === attachmentUrl)) return res.status(404).json({ error: { message: "Attachment not found" } });
      res.setHeader("Content-Type", file.contentType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${String(file.filename || "attachment").replace(/[^a-zA-Z0-9._ -]/g, "_")}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      streamGridFsFile(req.params.fileId, res);
    } catch (error) { next(error); }
  },
);

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

      if (!ticketRepo.isUserAuthorizedForTicket(ticket, req.user)) {
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
  ticketAttachmentUpload.single("attachment"),
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
      let attachment = "";

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

      if (!ticketRepo.isUserAuthorizedForTicket(ticket, req.user)) {
        return res.status(403).json({
          error: {
            message: "You are not authorized to reply to this ticket",
          },
        });
      }

      const role = String(req.user.role);

      if (uploadedFile) {
        const storedAttachment = await storeGridFsFile({
          buffer: uploadedFile.buffer,
          filename: uploadedFile.originalname,
          contentType: uploadedFile.mimetype,
          category: "ticket-attachment",
        });
        attachment = `/api/tickets/${ticketId}/attachments/${storedAttachment.id}`;
      }

      const message = await messageRepo.createTicketMessage({
        ticketId,
        employeeId: req.user.employeeId || req.user.userId || "SYSTEM",
        senderName: req.user.name || (role === "EMPLOYEE" ? "Employee" : "Staff"),
        senderRole: role || "EMPLOYEE",
        message: parsed.data.message,
        attachment,
      });

      // When support staff replies to an OPEN ticket, auto-transition to IN_PROGRESS
      if (role !== "EMPLOYEE" && ticket.status === "OPEN") {
        try {
          await ticketRepo.updateTicketStatus(ticketId, "IN_PROGRESS");
        } catch (statusErr) {
          console.warn("Failed to auto-advance ticket status to IN_PROGRESS", statusErr);
        }
      }

      // Create notifications for relevant users (do not notify the sender)
      try {
        const ticketOwnerEmp = await Employee.findById(
          ticket.employeeId,
        ).lean();

        const senderUserId = req.user.userId;

        if (role === "EMPLOYEE") {
          // Notify assigned role users (e.g., ADMIN, FINANCE, MANAGER, IT_SUPPORT)
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
