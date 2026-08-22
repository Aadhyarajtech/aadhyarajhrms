import { Router } from "express";
import { z } from "zod";

import { authenticate } from "@/middleware/auth";
import { isAdmin } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
<<<<<<< HEAD
import { upload, UPLOADS_PUBLIC_PATH } from "@/middleware/upload";
=======

import {
  ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_CHANNELS,
  ANNOUNCEMENT_STATUSES,
} from "@/modules/announcements/announcement.model";

>>>>>>> f8f0289 (Added feature to check performance of the employees)
import * as repo from "./notifications.repository";
import * as announcementRepo from "@/modules/announcements/announcement.repository";

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

/* =========================================================
   NOTIFICATIONS
========================================================= */

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const unreadOnly = req.query.unreadOnly === "true";

    const [notifications, unreadCount] = await Promise.all([
      repo.listNotifications(req.user!.userId, unreadOnly),
      repo.unreadCount(req.user!.userId),
    ]);

    res.json({
      notifications,
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/:id/read", async (req, res, next) => {
  try {
    await repo.markRead(req.params.id, req.user!.userId);

    res.json({
      message: "Marked as read.",
    });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/read-all", async (req, res, next) => {
  try {
    await repo.markAllRead(req.user!.userId);

    res.json({
      message: "All notifications marked as read.",
    });
  } catch (err) {
    next(err);
  }
});

<<<<<<< HEAD
notificationsRouter.get("/announcements", async (req, res, next) => {
  try {
    res.json({ announcements: await announcementRepo.getAnnouncements(req.user?.role) });
=======
/* =========================================================
   ANNOUNCEMENTS — LEGACY COMPATIBILITY ROUTES

   The canonical announcement API is now:

     /api/announcements

   These existing /api/notifications/announcements
   routes remain so existing frontend code does not break.
========================================================= */

const announcementSchema = z.object({
  title: z.string().min(2).max(200),

  body: z.string().min(2),

  type: z.enum(ANNOUNCEMENT_TYPES).optional(),

  audience: z.enum(ANNOUNCEMENT_AUDIENCES).optional(),

  departments: z.array(z.string()).optional(),

  locations: z.array(z.string()).optional(),

  targetRoles: z.array(z.string()).optional(),

  channels: z
    .array(z.enum(ANNOUNCEMENT_CHANNELS))
    .min(1, "At least one notification channel is required.")
    .optional(),

  /*
   * Kept for compatibility with existing
   * frontend payloads. The repository derives
   * the final value from `channels`.
   */
  showBanner: z.boolean().optional(),

  requiresAcknowledgement: z.boolean().optional(),

  pinned: z.boolean().optional(),

  attachment: z.string().optional(),

  status: z.enum(ANNOUNCEMENT_STATUSES).optional(),

  scheduledAt: z.string().optional(),

  publishedAt: z.string().optional(),

  /*
   * Kept for compatibility. The repository
   * derives this from the CALENDAR channel.
   */
  calendarEnabled: z.boolean().optional(),

  eventStartAt: z.string().optional(),

  eventEndAt: z.string().optional(),

  eventLocation: z.string().optional(),
});

notificationsRouter.get("/announcements", async (_req, res, next) => {
  try {
    const announcements = await repo.listAnnouncements();

    res.json({
      announcements,
    });
>>>>>>> f8f0289 (Added feature to check performance of the employees)
  } catch (err) {
    next(err);
  }
});

<<<<<<< HEAD
const announcementSchema = z.object({
  title: z.string().min(2),
  body: z.string().min(2),
  type: z.string().optional(),
  pinned: z.union([z.boolean(), z.string()]).optional(),
  audience: z.string().optional(),
});

notificationsRouter.post(
  "/announcements",
  isAdmin,
  upload.single("attachment"),
  validate(announcementSchema),
  async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: "Unauthorized" } });
      }

      if (!req.user.employeeId) {
        return res.status(401).json({ error: { message: "Employee not found" } });
      }

      // Parse pinned which may be a string from multipart/form-data
      const pinned =
        req.body.pinned === "true"
          ? true
          : req.body.pinned === "false"
          ? false
          : req.body.pinned;

      const attachment = req.file ? `${UPLOADS_PUBLIC_PATH}/${req.file.filename}` : "";

          const announcement = await announcementRepo.createAnnouncement({
        title: req.body.title,
        body: req.body.body,
        type: req.body.type ?? "GENERAL_NOTICE",
        audience: req.body.audience ?? "ALL",
        pinned: pinned === true,
        attachment,
        createdBy: req.user.employeeId,
      });

      if (announcement) {
        await repo.broadcastAnnouncementNotification({
          title: announcement.title,
          body: announcement.body,
          audience: announcement.audience,
        });
      }

      return res.status(201).json({ announcement });
=======
notificationsRouter.post(
  "/announcements",
  isAdmin,
  validate(announcementSchema),
  async (req, res, next) => {
    try {
      const announcement = await repo.createAnnouncement({
        ...req.body,
        createdBy: req.user!.userId,
      });

      res.status(201).json({
        announcement,
      });
>>>>>>> f8f0289 (Added feature to check performance of the employees)
    } catch (err) {
      next(err);
    }
  },
);
<<<<<<< HEAD
=======

notificationsRouter.get("/announcements/:id", async (req, res, next) => {
  try {
    const announcement = await repo.getAnnouncement(req.params.id);

    if (!announcement) {
      return res.status(404).json({
        message: "Announcement not found.",
      });
    }

    res.json({
      announcement,
    });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.patch(
  "/announcements/:id",
  isAdmin,
  validate(announcementSchema.partial()),
  async (req, res, next) => {
    try {
      const announcement = await repo.updateAnnouncement(
        req.params.id,
        req.body,
      );

      if (!announcement) {
        return res.status(404).json({
          message: "Announcement not found.",
        });
      }

      res.json({
        announcement,
      });
    } catch (err) {
      next(err);
    }
  },
);

notificationsRouter.delete(
  "/announcements/:id",
  isAdmin,
  async (req, res, next) => {
    try {
      const deleted = await repo.deleteAnnouncement(req.params.id);

      if (!deleted) {
        return res.status(404).json({
          message: "Announcement not found.",
        });
      }

      res.json({
        message: "Announcement deleted.",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default notificationsRouter;
>>>>>>> f8f0289 (Added feature to check performance of the employees)
