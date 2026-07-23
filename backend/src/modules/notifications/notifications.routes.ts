import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isAdmin } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import * as repo from "./notifications.repository";

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

notificationsRouter.get("/announcements", async (_req, res, next) => {
  try {
    res.json({ announcements: await repo.listAnnouncements() });
  } catch (err) {
    next(err);
  }
});

const announcementSchema = z.object({
  title: z.string().min(2),
  body: z.string().min(2),
  pinned: z.boolean().optional(),
  audience: z.string().optional(),
});

notificationsRouter.post("/announcements", isAdmin, validate(announcementSchema), async (req, res, next) => {
  try {
    res.status(201).json({ announcement: await repo.createAnnouncement(req.body) });
  } catch (err) {
    next(err);
  }
});
