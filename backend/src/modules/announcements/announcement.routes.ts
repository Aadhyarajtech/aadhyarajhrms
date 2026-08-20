import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";

import { authenticate } from "@/middleware/auth";
import {
  upload,
  UPLOADS_PUBLIC_PATH,
} from "@/middleware/upload";

import type { AuthUser } from "@/types/express";

import * as notificationRepo from "@/modules/notifications/notifications.repository";
import * as repo from "./announcement.repository";

/* =========================================================
   TYPES
========================================================= */

interface AuthenticatedRequest
  extends Request {
  user?: AuthUser;
}

/* =========================================================
   ROUTER
========================================================= */

export const announcementRouter =
  Router();

announcementRouter.use(authenticate);

/* =========================================================
   CONSTANTS
========================================================= */

const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "HR_ADMIN",
] as const;

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

function parseBoolean(
  value: unknown,
): boolean | undefined {
  if (
    value === true ||
    value === "true" ||
    value === "1"
  ) {
    return true;
  }

  if (
    value === false ||
    value === "false" ||
    value === "0"
  ) {
    return false;
  }

  return undefined;
}

function parseStringArray(
  value: unknown,
): string[] {
  if (Array.isArray(value)) {
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed =
      value.trim();

    if (!trimmed) {
      return [];
    }

    try {
      const parsed =
        JSON.parse(trimmed);

      if (Array.isArray(parsed)) {
        return parsed
          .map(String)
          .map((item) =>
            item.trim(),
          )
          .filter(Boolean);
      }
    } catch {
      return trimmed
        .split(",")
        .map((item) =>
          item.trim(),
        )
        .filter(Boolean);
    }
  }

  return [];
}

function hasAdminAccess(
  user: AuthUser,
) {
  const role = String(
    user.role,
  );

  return ADMIN_ROLES.includes(
    role as (typeof ADMIN_ROLES)[number],
  );
}

/* =========================================================
   CREATE SCHEMA
========================================================= */

const createAnnouncementSchema =
  z.object({
    title: z
      .string()
      .trim()
      .min(3)
      .max(200),

    body: z
      .string()
      .trim()
      .min(5)
      .max(10000),

    type: z.enum(
      ANNOUNCEMENT_TYPES,
    ),

    audience: z.enum(
      ANNOUNCEMENT_AUDIENCES,
    ),

    pinned:
      z.boolean().optional(),

    scheduledAt:
      z.string().optional(),

    showBanner:
      z.boolean().optional(),

    requiresAcknowledgement:
      z.boolean().optional(),

    channels:
      z
        .array(
          z.enum(
            ANNOUNCEMENT_CHANNELS,
          ),
        )
        .optional(),

    departments:
      z
        .array(z.string())
        .optional(),

    locations:
      z
        .array(z.string())
        .optional(),

    targetRoles:
      z
        .array(z.string())
        .optional(),

    calendarEnabled:
      z.boolean().optional(),

    eventStartAt:
      z.string().optional(),

    eventEndAt:
      z.string().optional(),

    eventLocation:
      z.string().max(500).optional(),
  });

/* =========================================================
   CREATE ANNOUNCEMENT
========================================================= */

announcementRouter.post(
  "/",
  upload.single("attachment"),

  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      /* ---------------------------------------------------
         AUTHENTICATION
      --------------------------------------------------- */

      if (!req.user) {
        return res.status(401).json({
          error: {
            message:
              "Unauthorized",
          },
        });
      }

      /* ---------------------------------------------------
         ADMIN CHECK
      --------------------------------------------------- */

      if (
        !hasAdminAccess(
          req.user,
        )
      ) {
        return res.status(403).json({
          error: {
            message:
              "You are not authorized to create announcements",
          },
        });
      }

      /* ---------------------------------------------------
         EMPLOYEE CHECK
      --------------------------------------------------- */

      if (!req.user.employeeId) {
        return res.status(401).json({
          error: {
            message:
              "Employee not found",
          },
        });
      }

      /* ---------------------------------------------------
         PARSE FORM DATA
      --------------------------------------------------- */

      const pinned =
        parseBoolean(
          req.body.pinned,
        );

      const showBanner =
        parseBoolean(
          req.body.showBanner,
        );

      const requiresAcknowledgement =
        parseBoolean(
          req.body
            .requiresAcknowledgement,
        );

      const calendarEnabled =
        parseBoolean(
          req.body
            .calendarEnabled,
        );

      /* ---------------------------------------------------
         NOTIFICATION CHANNELS

         Frontend may send either:
         - channels
         - notificationMethods

         Normalize both into channels.
      --------------------------------------------------- */

      const channels =
        parseStringArray(
          req.body.channels ??
            req.body.notificationMethods,
        );

      /* ---------------------------------------------------
         PUBLISH MODE

         NOW       -> publish immediately
         SCHEDULED -> scheduledAt is required
      --------------------------------------------------- */

      const publishMode =
        String(
          req.body.publishMode ?? "NOW",
        ).toUpperCase();

      if (
        publishMode === "SCHEDULED" &&
        !req.body.scheduledAt
      ) {
        return res.status(400).json({
          error: {
            message:
              "Scheduled publish date and time are required.",
          },
        });
      }

      const departments =
        parseStringArray(
          req.body.departments,
        );

      const locations =
        parseStringArray(
          req.body.locations,
        );

      const targetRoles =
        parseStringArray(
          req.body.targetRoles,
        );

      /* ---------------------------------------------------
         VALIDATION
      --------------------------------------------------- */

      const parsed =
        createAnnouncementSchema.safeParse(
          {
            ...req.body,

            pinned,

            showBanner,

            requiresAcknowledgement,

            calendarEnabled,

            channels:
              channels.length > 0
                ? channels
                : undefined,

            departments,

            locations,

            targetRoles,
          },
        );

      if (!parsed.success) {
        console.error(
          "[Announcements] Validation failed:",
          JSON.stringify(
            parsed.error.flatten(),
            null,
            2,
          ),
        );

        return res.status(400).json({
          error: {
            message:
              "Invalid announcement information",

            details:
              parsed.error.flatten(),
          },
        });
      }

      /* ---------------------------------------------------
         ATTACHMENT
      --------------------------------------------------- */

      const attachment =
        req.file
          ? `${UPLOADS_PUBLIC_PATH}/${req.file.filename}`
          : "";

      /* ---------------------------------------------------
         CREATE
      --------------------------------------------------- */

      const announcement =
        await repo.createAnnouncement({
          title:
            parsed.data.title,

          body:
            parsed.data.body,

          type:
            parsed.data.type,

          audience:
            parsed.data.audience,

          departments:
            parsed.data
              .departments ?? [],

          locations:
            parsed.data
              .locations ?? [],

          targetRoles:
            parsed.data
              .targetRoles ?? [],

          pinned:
            parsed.data
              .pinned ?? false,

          attachment,

          createdBy:
            req.user.employeeId,

          scheduledAt:
            parsed.data
              .scheduledAt,

          showBanner:
            parsed.data
              .showBanner ?? false,

          requiresAcknowledgement:
            parsed.data
              .requiresAcknowledgement ??
            parsed.data.type ===
              "POLICY_UPDATE",

          channels:
            parsed.data.channels ??
            ["IN_APP"],

          calendarEnabled:
            parsed.data
              .calendarEnabled ??
            false,

          eventStartAt:
            parsed.data
              .eventStartAt,

          eventEndAt:
            parsed.data
              .eventEndAt,

          eventLocation:
            parsed.data
              .eventLocation,
        });

      /* ---------------------------------------------------
         NOTIFICATION FOR PUBLISHED ANNOUNCEMENT
      --------------------------------------------------- */

      if (
        announcement &&
        announcement.status ===
          "PUBLISHED"
      ) {
        const deliveryInput = {
          title: announcement.title,
          body: announcement.body,
          audience: announcement.audience,
          departments: announcement.departments ?? [],
          locations: announcement.locations ?? [],
          targetRoles: announcement.targetRoles ?? [],
        };

        const channels = announcement.channels ?? ["IN_APP"];

        console.log(
          "[Announcements] Immediate delivery:",
          {
            title: announcement.title,
            audience: announcement.audience,
            departments: announcement.departments ?? [],
            locations: announcement.locations ?? [],
            targetRoles: announcement.targetRoles ?? [],
            channels,
          },
        );

        if (channels.includes("IN_APP")) {
          await notificationRepo.broadcastAnnouncementNotification(
            deliveryInput,
          );
        }

        if (channels.includes("EMAIL")) {
          await notificationRepo.broadcastAnnouncementEmail(
            deliveryInput,
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
            message:
              "Unauthorized",
          },
        });
      }

      const announcements =
        await repo.getAnnouncements(
          String(
            req.user.role,
          ),
          req.user
            .employeeId ?? "",
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
   GET SINGLE ANNOUNCEMENT
========================================================= */

announcementRouter.get(
  "/:id",

  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message:
              "Unauthorized",
          },
        });
      }

      const announcement =
        await repo.getAnnouncementWithReceipt(
          req.params.id,
          req.user
            .employeeId ?? "",
        );

      if (!announcement) {
        return res.status(404).json({
          error: {
            message:
              "Announcement not found",
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
   MARK ANNOUNCEMENT READ
========================================================= */

announcementRouter.post(
  "/:id/read",

  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message:
              "Unauthorized",
          },
        });
      }

      if (!req.user.employeeId) {
        return res.status(401).json({
          error: {
            message:
              "Employee not found",
          },
        });
      }

      await repo.markAnnouncementRead(
        req.params.id,
        req.user.employeeId,
      );

      return res.json({
        message:
          "Announcement marked as read.",
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   ACKNOWLEDGE POLICY
========================================================= */
/* =========================================================
   ACKNOWLEDGE ANNOUNCEMENT
========================================================= */

announcementRouter.post(
  "/:id/acknowledge",
  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
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

      const announcement =
        await repo.getAnnouncement(
          req.params.id,
        );

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
         allow acknowledgement even if the old record
         does not have requiresAcknowledgement === true.
      --------------------------------------------- */

      const acknowledgementRequired =
        announcement.requiresAcknowledgement === true ||
        announcement.type === "POLICY_UPDATE";

      if (!acknowledgementRequired) {
        return res.status(403).json({
          error: {
            message:
              "Acknowledgement is not required for this announcement.",
          },
        });
      }

      /* ---------------------------------------------
         ACKNOWLEDGE
      --------------------------------------------- */

      await repo.acknowledgePolicyAnnouncement(
        req.params.id,
        req.user.employeeId,
      );

      /* ---------------------------------------------
         SUCCESS
      --------------------------------------------- */

      return res.json({
        message:
          "Announcement acknowledged successfully.",
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
            message:
              "Unauthorized",
          },
        });
      }

      if (
        !hasAdminAccess(
          req.user,
        )
      ) {
        return res.status(403).json({
          error: {
            message:
              "Only HR and Super Admin can view read status.",
          },
        });
      }

      const status =
        await repo.listAnnouncementReadStatus(
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
   UPDATE SCHEMA
========================================================= */

const updateAnnouncementSchema =
  z.object({
    title: z
      .string()
      .trim()
      .min(3)
      .max(200)
      .optional(),

    body: z
      .string()
      .trim()
      .min(5)
      .max(10000)
      .optional(),

    type: z
      .enum(
        ANNOUNCEMENT_TYPES,
      )
      .optional(),

    audience: z
      .enum(
        ANNOUNCEMENT_AUDIENCES,
      )
      .optional(),

    pinned:
      z.boolean().optional(),

    attachment:
      z.string().optional(),

    departments:
      z
        .array(z.string())
        .optional(),

    locations:
      z
        .array(z.string())
        .optional(),

    targetRoles:
      z
        .array(z.string())
        .optional(),

    channels:
      z
        .array(
          z.enum(
            ANNOUNCEMENT_CHANNELS,
          ),
        )
        .optional(),

    showBanner:
      z.boolean().optional(),

    requiresAcknowledgement:
      z.boolean().optional(),

    scheduledAt:
      z.string().optional(),

    calendarEnabled:
      z.boolean().optional(),

    eventStartAt:
      z.string().optional(),

    eventEndAt:
      z.string().optional(),

    eventLocation:
      z.string().max(500).optional(),
  });

/* =========================================================
   UPDATE ANNOUNCEMENT
========================================================= */

announcementRouter.patch(
  "/:id",
  upload.single("attachment"),

  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message:
              "Unauthorized",
          },
        });
      }

      if (
        !hasAdminAccess(
          req.user,
        )
      ) {
        return res.status(403).json({
          error: {
            message:
              "You are not authorized to update announcements",
          },
        });
      }

      /* ---------------------------------------------------
         Parse values
      --------------------------------------------------- */

      const pinned =
        parseBoolean(
          req.body.pinned,
        );

      const showBanner =
        parseBoolean(
          req.body.showBanner,
        );

      const requiresAcknowledgement =
        parseBoolean(
          req.body
            .requiresAcknowledgement,
        );

      const calendarEnabled =
        parseBoolean(
          req.body
            .calendarEnabled,
        );

      /* ---------------------------------------------------
   NOTIFICATION CHANNELS

   Frontend may send either:
   - channels
   - notificationMethods

   Normalize both into channels.
--------------------------------------------------- */

const channels =
  parseStringArray(
    req.body.channels ??
      req.body.notificationMethods,
  );

/* ---------------------------------------------------
   PUBLISH MODE

   Frontend sends:
   - NOW
   - SCHEDULED

   Backend ultimately uses scheduledAt.
--------------------------------------------------- */

const publishMode =
  String(
    req.body.publishMode ?? "NOW",
  ).toUpperCase();

if (
  publishMode === "SCHEDULED" &&
  !req.body.scheduledAt
) {
  return res.status(400).json({
    error: {
      message:
        "Scheduled publish date and time are required.",
    },
  });
}

      const departments =
        parseStringArray(
          req.body.departments,
        );

      const locations =
        parseStringArray(
          req.body.locations,
        );

      const targetRoles =
        parseStringArray(
          req.body.targetRoles,
        );

      /* ---------------------------------------------------
         Validation
      --------------------------------------------------- */

      const parsed =
        updateAnnouncementSchema.safeParse(
          {
            ...req.body,

            pinned,

            showBanner,

            requiresAcknowledgement,

            calendarEnabled,

            channels:
              channels.length > 0
                ? channels
                : undefined,

            departments,

            locations,

            targetRoles,
          },
        );

      if (!parsed.success) {
        return res.status(400).json({
          error: {
            message:
              "Invalid announcement information",

            details:
              parsed.error.flatten(),
          },
        });
      }

      /* ---------------------------------------------------
         Update data
      --------------------------------------------------- */

      const updateData = {
        ...parsed.data,
      };

      if (req.file) {
        updateData.attachment =
          `${UPLOADS_PUBLIC_PATH}/${req.file.filename}`;
      }

      const announcement =
        await repo.updateAnnouncement(
          req.params.id,
          updateData,
        );

      if (!announcement) {
        return res.status(404).json({
          error: {
            message:
              "Announcement not found",
          },
        });
      }

      /* ---------------------------------------------------
         RE-DELIVER UPDATED PUBLISHED ANNOUNCEMENT

         Editing a published announcement must update the
         employee experience too. This re-runs recipient
         targeting using the NEW department/location/role
         values and sends the selected channels.
      --------------------------------------------------- */

      if (announcement.status === "PUBLISHED") {
        const deliveryInput = {
          title: announcement.title,
          body: announcement.body,
          audience: announcement.audience,
          departments: announcement.departments ?? [],
          locations: announcement.locations ?? [],
          targetRoles: announcement.targetRoles ?? [],
        };

        const deliveryChannels =
          announcement.channels ?? ["IN_APP"];

        console.log(
          "[Announcements] Updated published announcement delivery:",
          {
            title: announcement.title,
            audience: announcement.audience,
            departments: announcement.departments ?? [],
            locations: announcement.locations ?? [],
            targetRoles: announcement.targetRoles ?? [],
            channels: deliveryChannels,
          },
        );

        if (deliveryChannels.includes("IN_APP")) {
          await notificationRepo.broadcastAnnouncementNotification(
            deliveryInput,
          );
        }

        if (deliveryChannels.includes("EMAIL")) {
          await notificationRepo.broadcastAnnouncementEmail(
            deliveryInput,
          );
        }
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

  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            message:
              "Unauthorized",
          },
        });
      }

      if (
        !hasAdminAccess(
          req.user,
        )
      ) {
        return res.status(403).json({
          error: {
            message:
              "You are not authorized to delete announcements",
          },
        });
      }

      const announcement =
        await repo.deleteAnnouncement(
          req.params.id,
        );

      if (!announcement) {
        return res.status(404).json({
          error: {
            message:
              "Announcement not found",
          },
        });
      }

      return res.json({
        message:
          "Announcement deleted successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);