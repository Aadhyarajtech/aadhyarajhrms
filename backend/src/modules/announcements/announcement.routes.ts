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

import * as notificationRepo from "@/modules/notifications/notifications.repository";
import * as repo from "./announcement.repository";

/* =========================================================
   TYPES
========================================================= */

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/* =========================================================
   ROUTER
========================================================= */

export const announcementRouter = Router();

announcementRouter.use(authenticate);

/* =========================================================
   CONSTANTS
========================================================= */

const ADMIN_ROLES = ["SUPER_ADMIN", "HR_ADMIN"] as const;

const ANNOUNCEMENT_TYPES = [
  "HOLIDAY_NOTICE",
  "COMPANY_EVENT",
  "POLICY_UPDATE",
  "EMPLOYEE_RECOGNITION",
  "MEETING_NOTICE",
  "BENEFITS_UPDATE",
  "TRAINING_LD",
  "GENERAL_NOTICE",
] as const;

const ANNOUNCEMENT_AUDIENCES = [
  "ALL",
  "HR_ADMIN",
  "FINANCE",
  "MANAGER",
  "RECRUITER",
  "IT_SUPPORT",
  "EMPLOYEE",
  "DEPARTMENT",
  "TARGETED_GROUP",
] as const;

const ANNOUNCEMENT_CHANNELS = [
  "IN_APP",
  "EMAIL",
  "BANNER",
  "CALENDAR",
] as const;

/* =========================================================
   HELPERS
========================================================= */

function parseBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === "1") {
    return true;
  }

  if (value === false || value === "false" || value === "0") {
    return false;
  }

  return undefined;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed)) {
        return parsed
          .map(String)
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function hasAdminAccess(user: AuthUser) {
  const role = String(user.role);

  return ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
}

/* =========================================================
   DATE VALIDATION HELPERS
========================================================= */

function isValidDateString(value?: string): boolean {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  return !Number.isNaN(date.getTime());
}

function validateCalendarDates(
  calendarEnabled: boolean,
  eventStartAt?: string,
  eventEndAt?: string,
) {
  if (calendarEnabled && !eventStartAt) {
    return "Calendar events require an event start date and time.";
  }

  if (eventStartAt && !isValidDateString(eventStartAt)) {
    return "Invalid calendar event start date and time.";
  }

  if (eventEndAt && !isValidDateString(eventEndAt)) {
    return "Invalid calendar event end date and time.";
  }

  if (eventStartAt && eventEndAt) {
    const start = new Date(eventStartAt).getTime();
    const end = new Date(eventEndAt).getTime();

    if (end < start) {
      return "Event end time cannot be before event start time.";
    }
  }

  return null;
}

function validateFutureScheduledAt(scheduledAt?: string): string | null {
  if (!scheduledAt) {
    return null;
  }

  const scheduledDate = new Date(scheduledAt);

  if (Number.isNaN(scheduledDate.getTime())) {
    return "Invalid scheduled publish date and time.";
  }

  if (scheduledDate.getTime() <= Date.now()) {
    return "Scheduled publish date and time must be in the future.";
  }

  return null;
}

/* =========================================================
   CREATE SCHEMA
========================================================= */

const createAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(200),

  body: z.string().trim().min(5).max(10000),

  type: z.enum(ANNOUNCEMENT_TYPES),

  audience: z.enum(ANNOUNCEMENT_AUDIENCES),

  pinned: z.boolean().optional(),

  scheduledAt: z.string().optional(),

  showBanner: z.boolean().optional(),

  requiresAcknowledgement: z.boolean().optional(),

  channels: z.array(z.enum(ANNOUNCEMENT_CHANNELS)).optional(),

  departments: z.array(z.string()).optional(),

  locations: z.array(z.string()).optional(),

  targetRoles: z.array(z.string()).optional(),

  calendarEnabled: z.boolean().optional(),

  eventStartAt: z.string().optional(),

  eventEndAt: z.string().optional(),

  eventLocation: z.string().max(500).optional(),
});

/* =========================================================
   CREATE ANNOUNCEMENT
========================================================= */

announcementRouter.post(
  "/",
  upload.single("attachment"),

  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      /* ---------------------------------------------------
         AUTHENTICATION
      --------------------------------------------------- */

      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      /* ---------------------------------------------------
         ADMIN CHECK
      --------------------------------------------------- */

      if (!hasAdminAccess(req.user)) {
        return res.status(403).json({
          error: {
            message: "You are not authorized to create announcements",
          },
        });
      }

      /* ---------------------------------------------------
         EMPLOYEE CHECK
      --------------------------------------------------- */

      if (!req.user.employeeId) {
        return res.status(401).json({
          error: {
            message: "Employee not found",
          },
        });
      }

      /* ---------------------------------------------------
         PARSE FORM DATA
      --------------------------------------------------- */

      const pinned = parseBoolean(req.body.pinned);

      const showBanner = parseBoolean(req.body.showBanner);

      const requiresAcknowledgement = parseBoolean(
        req.body.requiresAcknowledgement,
      );

      /* ---------------------------------------------------
         NOTIFICATION CHANNELS

         Frontend may send:
         - channels
         - notificationMethods

         Normalize both.
      --------------------------------------------------- */

      const requestedChannels = parseStringArray(
        req.body.channels ?? req.body.notificationMethods,
      );

      // IN_APP is the safe default when no channel is selected.
      // Never allow an empty channel array to silently disable delivery.
      const channels = Array.from(
        new Set(
          (requestedChannels.length > 0 ? requestedChannels : ["IN_APP"])
            .map((channel) => String(channel).trim().toUpperCase())
            .filter(Boolean),
        ),
      );

      if (channels.length === 0) {
        return res.status(400).json({
          error: {
            message: "At least one notification channel is required.",
          },
        });
      }

      /* ---------------------------------------------------
         CALENDAR

         CALENDAR channel is the canonical source of truth.

         Even if frontend forgets to send:
         calendarEnabled=true

         CALENDAR in channels will enable it.
      --------------------------------------------------- */

      const requestedCalendarEnabled = parseBoolean(req.body.calendarEnabled);

      const calendarEnabled = channels.includes("CALENDAR");

      // BANNER is controlled by the selected notification channel.
      const normalizedShowBanner = channels.includes("BANNER");

      const eventStartAt =
        String(req.body.eventStartAt ?? "").trim() || undefined;

      const eventEndAt = String(req.body.eventEndAt ?? "").trim() || undefined;

      const eventLocation =
        String(req.body.eventLocation ?? "").trim() || undefined;

      /* ---------------------------------------------------
         CALENDAR DATE VALIDATION
      --------------------------------------------------- */

      const calendarDateError = validateCalendarDates(
        calendarEnabled,
        eventStartAt,
        eventEndAt,
      );

      if (calendarDateError) {
        return res.status(400).json({
          error: {
            message: calendarDateError,
          },
        });
      }

      /* ---------------------------------------------------
         PUBLISH MODE

         NOW       -> publish immediately
         SCHEDULED -> scheduledAt required
      --------------------------------------------------- */

      const publishMode = String(req.body.publishMode ?? "NOW").toUpperCase();

      if (publishMode === "SCHEDULED" && !req.body.scheduledAt) {
        return res.status(400).json({
          error: {
            message: "Scheduled publish date and time are required.",
          },
        });
      }

      if (publishMode === "SCHEDULED") {
        const scheduledDateError = validateFutureScheduledAt(
          String(req.body.scheduledAt),
        );

        if (scheduledDateError) {
          return res.status(400).json({
            error: {
              message: scheduledDateError,
            },
          });
        }
      }

      /* ---------------------------------------------------
         TARGETING
      --------------------------------------------------- */

      const departments = parseStringArray(req.body.departments);

      const locations = parseStringArray(req.body.locations);

      const targetRoles = parseStringArray(req.body.targetRoles);

      /* ---------------------------------------------------
         VALIDATION
      --------------------------------------------------- */

      const parsed = createAnnouncementSchema.safeParse({
        ...req.body,

        pinned,

        showBanner: normalizedShowBanner,

        requiresAcknowledgement,

        calendarEnabled,

        channels,

        departments,

        locations,

        targetRoles,

        eventStartAt,

        eventEndAt,

        eventLocation,
      });

      if (!parsed.success) {
        console.error(
          "[Announcements] Validation failed:",
          JSON.stringify(parsed.error.flatten(), null, 2),
        );

        return res.status(400).json({
          error: {
            message: "Invalid announcement information",

            details: parsed.error.flatten(),
          },
        });
      }

      /* ---------------------------------------------------
         ATTACHMENT
      --------------------------------------------------- */

      const attachment = req.file
        ? `${UPLOADS_PUBLIC_PATH}/${req.file.filename}`
        : "";

      /* ---------------------------------------------------
         CREATE
      --------------------------------------------------- */

      const announcement = await repo.createAnnouncement({
        title: parsed.data.title,

        body: parsed.data.body,

        type: parsed.data.type,

        audience: parsed.data.audience,

        departments: parsed.data.departments ?? [],

        locations: parsed.data.locations ?? [],

        targetRoles: parsed.data.targetRoles ?? [],

        pinned: parsed.data.pinned ?? false,

        attachment,

        createdBy: req.user.userId,

        scheduledAt: parsed.data.scheduledAt,

        showBanner: parsed.data.showBanner ?? normalizedShowBanner,

        requiresAcknowledgement:
          parsed.data.requiresAcknowledgement ??
          parsed.data.type === "POLICY_UPDATE",

        channels: parsed.data.channels?.length
          ? parsed.data.channels
          : ["IN_APP"],

        calendarEnabled: calendarEnabled,

        eventStartAt: eventStartAt,

        eventEndAt: eventEndAt,

        eventLocation: eventLocation,
      });

      /* ---------------------------------------------------
         NOTIFICATION FOR PUBLISHED ANNOUNCEMENT
      --------------------------------------------------- */

      if (announcement && announcement.status === "PUBLISHED") {
        const effectiveChannels = announcement.channels?.length
          ? announcement.channels
          : ["IN_APP"];

        console.log("[Announcements] Immediate broadcast:", {
          title: announcement.title,

          audience: announcement.audience,

          departments: announcement.departments ?? [],

          locations: announcement.locations ?? [],

          targetRoles: announcement.targetRoles ?? [],

          channels: effectiveChannels,

          showBanner: announcement.showBanner ?? false,

          calendarEnabled: announcement.calendarEnabled ?? false,
        });

        /* -----------------------------------------------
           IN-APP NOTIFICATION
        ----------------------------------------------- */

        if (effectiveChannels.includes("IN_APP")) {
          await notificationRepo.broadcastAnnouncementNotification({
            title: announcement.title,

            body: announcement.body,

            audience: announcement.audience,

            departments: announcement.departments ?? [],

            locations: announcement.locations ?? [],

            targetRoles: announcement.targetRoles ?? [],
          });
        }

        /* -----------------------------------------------
           EMAIL NOTIFICATION
        ----------------------------------------------- */

        if (effectiveChannels.includes("EMAIL")) {
          const emailResult = await notificationRepo.broadcastAnnouncementEmail(
            {
              title: announcement.title,

              body: announcement.body,

              audience: announcement.audience,

              departments: announcement.departments ?? [],

              locations: announcement.locations ?? [],

              targetRoles: announcement.targetRoles ?? [],
            },
          );

          console.log(
            `[Announcements] Immediate email broadcast completed: ${announcement.title}. Sent: ${emailResult?.sent ?? 0}, Failed: ${emailResult?.failed ?? 0}`,
          );
        }

        if (effectiveChannels.includes("BANNER")) {
          console.log(
            `[Announcements] Dashboard banner enabled: ${announcement.title}`,
          );
        }

        if (effectiveChannels.includes("CALENDAR")) {
          console.log(
            `[Announcements] Calendar event enabled: ${announcement.title}. Start: ${announcement.eventStartAt ?? "N/A"}, End: ${announcement.eventEndAt ?? "N/A"}`,
          );
        }
      }

      return res.status(201).json({
        announcement,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   GET ALL ANNOUNCEMENTS
========================================================= */

announcementRouter.get(
  "/",
  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      // IMPORTANT:
      // AnnouncementReceipt.userId stores the authenticated USER ID,
      // not Employee._id.
      const userId =
        (req.user as any).id ??
        (req.user as any).userId;

      if (!userId) {
        return res.status(401).json({
          error: {
            message: "Authenticated user ID not found",
          },
        });
      }

      const announcements = await repo.getAnnouncements(
        String(req.user.role),
        String(userId),
      );

      return res.json({
        announcements,
      });
    } catch (err) {
      next(err);
    }
  },
);
/* =========================================================
   READ STATUS
========================================================= */

announcementRouter.get(
  "/:id/status",

  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      if (!hasAdminAccess(req.user)) {
        return res.status(403).json({
          error: {
            message: "You are not authorized to view read receipts",
          },
        });
      }

      const announcement = await repo.getAnnouncement(req.params.id);

      if (!announcement) {
        return res.status(404).json({
          error: {
            message: "Announcement not found",
          },
        });
      }

      const status = await repo.listAnnouncementReadStatus(
        req.params.id,
      );

      return res.json({
        status,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   GET SINGLE ANNOUNCEMENT
========================================================= */

announcementRouter.get(
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

      const userId =
  (req.user as any).id ??
  (req.user as any).userId;

const announcement =
  await repo.getAnnouncementWithReceipt(
    req.params.id,
    String(userId ?? ""),
  );
      if (!announcement) {
        return res.status(404).json({
          error: {
            message: "Announcement not found",
          },
        });
      }

      // GET is read-only. Notification delivery happens only when an announcement
      // is created/published or explicitly rescheduled. Never broadcast from a read endpoint.

      return res.json({
        announcement,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   MARK ANNOUNCEMENT READ
========================================================= */

announcementRouter.post(
  "/:id/read",

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

      await repo.markAnnouncementRead(req.params.id, req.user.userId);

      return res.json({
        message: "Announcement marked as read.",
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   ACKNOWLEDGE ANNOUNCEMENT
========================================================= */

announcementRouter.post(
  "/:id/acknowledge",

  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      /* ---------------------------------------------
         AUTHENTICATION
      --------------------------------------------- */

      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      /* ---------------------------------------------
         EMPLOYEE CHECK
      --------------------------------------------- */

      if (!req.user.employeeId) {
        return res.status(401).json({
          error: {
            message: "Employee not found",
          },
        });
      }

      /* ---------------------------------------------
         GET ANNOUNCEMENT
      --------------------------------------------- */

      const announcement = await repo.getAnnouncement(req.params.id);

      if (!announcement) {
        return res.status(404).json({
          error: {
            message: "Announcement not found",
          },
        });
      }

      /* ---------------------------------------------
         ACKNOWLEDGEMENT CHECK

         New announcements:
         requiresAcknowledgement === true

         Older POLICY_UPDATE announcements:
         allow acknowledgement.
      --------------------------------------------- */

      const acknowledgementRequired =
        announcement.requiresAcknowledgement === true ||
        announcement.type === "POLICY_UPDATE";

      if (!acknowledgementRequired) {
        return res.status(403).json({
          error: {
            message: "Acknowledgement is not required for this announcement.",
          },
        });
      }

      /* ---------------------------------------------
         ACKNOWLEDGE
      --------------------------------------------- */

      await repo.acknowledgePolicyAnnouncement(req.params.id, req.user.userId);

      return res.json({
        message: "Announcement acknowledged successfully.",
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   UPDATE SCHEMA
========================================================= */

const updateAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),

  body: z.string().trim().min(5).max(10000).optional(),

  type: z.enum(ANNOUNCEMENT_TYPES).optional(),

  audience: z.enum(ANNOUNCEMENT_AUDIENCES).optional(),

  pinned: z.boolean().optional(),

  attachment: z.string().optional(),

  departments: z.array(z.string()).optional(),

  locations: z.array(z.string()).optional(),

  targetRoles: z.array(z.string()).optional(),

  channels: z.array(z.enum(ANNOUNCEMENT_CHANNELS)).optional(),

  showBanner: z.boolean().optional(),

  requiresAcknowledgement: z.boolean().optional(),

  scheduledAt: z.string().optional(),

  calendarEnabled: z.boolean().optional(),

  eventStartAt: z.string().optional(),

  eventEndAt: z.string().optional(),

  eventLocation: z.string().max(500).optional(),
});

/* =========================================================
   UPDATE ANNOUNCEMENT
========================================================= */

announcementRouter.patch(
  "/:id",
  upload.single("attachment"),

  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      /* ---------------------------------------------------
         AUTHENTICATION
      --------------------------------------------------- */

      if (!req.user) {
        return res.status(401).json({
          error: {
            message: "Unauthorized",
          },
        });
      }

      /* ---------------------------------------------------
         ADMIN CHECK
      --------------------------------------------------- */

      if (!hasAdminAccess(req.user)) {
        return res.status(403).json({
          error: {
            message: "You are not authorized to update announcements",
          },
        });
      }

      /* ---------------------------------------------------
         PARSE VALUES
      --------------------------------------------------- */

      const pinned = parseBoolean(req.body.pinned);

      const showBanner = parseBoolean(req.body.showBanner);

      const requiresAcknowledgement = parseBoolean(
        req.body.requiresAcknowledgement,
      );

      /* ---------------------------------------------------
         NOTIFICATION CHANNELS
      --------------------------------------------------- */

      const requestedChannels = parseStringArray(
        req.body.channels ?? req.body.notificationMethods,
      );

      const channels = Array.from(
        new Set(
          (requestedChannels.length > 0 ? requestedChannels : ["IN_APP"])
            .map((channel) => String(channel).trim().toUpperCase())
            .filter(Boolean),
        ),
      );

      if (channels.length === 0) {
        return res.status(400).json({
          error: {
            message: "At least one notification channel is required.",
          },
        });
      }

      /* ---------------------------------------------------
         CALENDAR

         CALENDAR channel automatically enables
         calendarEnabled.
      --------------------------------------------------- */

      const requestedCalendarEnabled = parseBoolean(req.body.calendarEnabled);

      const calendarEnabled = channels.includes("CALENDAR");

      // BANNER is controlled by the selected notification channel.
      const normalizedShowBanner = channels.includes("BANNER");

      const eventStartAt =
        String(req.body.eventStartAt ?? "").trim() || undefined;

      const eventEndAt = String(req.body.eventEndAt ?? "").trim() || undefined;

      const eventLocation =
        String(req.body.eventLocation ?? "").trim() || undefined;

      /* ---------------------------------------------------
         CALENDAR DATE VALIDATION
      --------------------------------------------------- */

      const calendarDateError = validateCalendarDates(
        calendarEnabled,
        eventStartAt,
        eventEndAt,
      );

      if (calendarDateError) {
        return res.status(400).json({
          error: {
            message: calendarDateError,
          },
        });
      }

      /* ---------------------------------------------------
         PUBLISH MODE
      --------------------------------------------------- */

      const publishMode = String(req.body.publishMode ?? "NOW").toUpperCase();

      if (publishMode === "SCHEDULED" && !req.body.scheduledAt) {
        return res.status(400).json({
          error: {
            message: "Scheduled publish date and time are required.",
          },
        });
      }

      // Any explicit scheduledAt on an update must remain in the future.
      // This prevents editing an announcement into a past schedule that would
      // otherwise be published immediately by the repository.
      if (req.body.scheduledAt) {
        const scheduledDateError = validateFutureScheduledAt(
          String(req.body.scheduledAt),
        );

        if (scheduledDateError) {
          return res.status(400).json({
            error: {
              message: scheduledDateError,
            },
          });
        }
      }

      /* ---------------------------------------------------
         TARGETING
      --------------------------------------------------- */

      const departments = parseStringArray(req.body.departments);

      const locations = parseStringArray(req.body.locations);

      const targetRoles = parseStringArray(req.body.targetRoles);

      /* ---------------------------------------------------
         VALIDATION
      --------------------------------------------------- */

      const parsed = updateAnnouncementSchema.safeParse({
        ...req.body,

        pinned,

        showBanner: normalizedShowBanner,

        requiresAcknowledgement,

        calendarEnabled,

        channels: channels.length > 0 ? channels : undefined,

        departments,

        locations,

        targetRoles,

        eventStartAt,

        eventEndAt,

        eventLocation,
      });

      if (!parsed.success) {
        console.error(
          "[Announcements] Update validation failed:",
          JSON.stringify(parsed.error.flatten(), null, 2),
        );

        return res.status(400).json({
          error: {
            message: "Invalid announcement information",

            details: parsed.error.flatten(),
          },
        });
      }

      /* ---------------------------------------------------
         UPDATE DATA
      --------------------------------------------------- */

      const updateData = {
        ...parsed.data,

        channels,

        showBanner: normalizedShowBanner,

        calendarEnabled,

        eventStartAt: calendarEnabled ? eventStartAt : undefined,

        eventEndAt: calendarEnabled ? eventEndAt : undefined,

        eventLocation: calendarEnabled ? eventLocation : undefined,
      };

      if (req.file) {
        updateData.attachment = `${UPLOADS_PUBLIC_PATH}/${req.file.filename}`;
      }

      /* ---------------------------------------------------
         UPDATE
      --------------------------------------------------- */

      const announcement = await repo.updateAnnouncement(
        req.params.id,
        updateData,
      );

      if (!announcement) {
        return res.status(404).json({
          error: {
            message: "Announcement not found",
          },
        });
      }

      return res.json({
        announcement,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   DELETE ANNOUNCEMENT
========================================================= */

announcementRouter.delete(
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

      if (!hasAdminAccess(req.user)) {
        return res.status(403).json({
          error: {
            message: "You are not authorized to delete announcements",
          },
        });
      }

      const announcement = await repo.deleteAnnouncement(req.params.id);

      if (!announcement) {
        return res.status(404).json({
          error: {
            message: "Announcement not found",
          },
        });
      }

      return res.json({
        message: "Announcement deleted successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);
