import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isAdmin } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { upload, UPLOADS_PUBLIC_PATH } from "@/middleware/upload";
import * as repo from "./notifications.repository";
import * as announcementRepo from "@/modules/announcements/announcement.repository";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const unreadOnly = req.query.unreadOnly === "true";
    const [notifications, unreadCount] = await Promise.all([
      repo.listNotifications(req.user!.userId, unreadOnly),
      repo.unreadCount(req.user!.userId),
    ]);
    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/:id/read", async (req, res, next) => {
  try {
    await repo.markRead(req.params.id, req.user!.userId);
    res.json({ message: "Marked as read." });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/read-all", async (req, res, next) => {
  try {
    await repo.markAllRead(req.user!.userId);
    res.json({ message: "All notifications marked as read." });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.get("/announcements", async (req, res, next) => {
  try {
    res.json({ announcements: await announcementRepo.getAnnouncements(req.user?.role) });
  } catch (err) {
    next(err);
  }
});

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
    } catch (err) {
      next(err);
    }
  },
);
