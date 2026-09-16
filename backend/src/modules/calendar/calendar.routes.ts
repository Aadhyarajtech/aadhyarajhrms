import { Router } from "express";
import { z } from "zod";

import { authenticate } from "@/middleware/auth";

import * as repo from "./calendar.repository";
import * as aiService from "./calendar.ai.service";
import * as aiGroq from "./calendar.ai.groq";

const calendarRouter = Router();

calendarRouter.use(authenticate);

/* =========================================================
   HELPERS
========================================================= */

const ADMIN_ROLES = new Set([
  "SUPER_ADMIN",
  "HR_ADMIN",
]);

function canManageCalendar(req: any) {
  return ADMIN_ROLES.has(req.user?.role);
}

function getEmployeeId(req: any) {
  return (
    req.user?.employeeId ??
    req.user?.employee?.id ??
    null
  );
}

/* =========================================================
   VALIDATION
========================================================= */

const createEventSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(300),

  description: z
    .string()
    .trim()
    .max(5000)
    .optional(),

  type: z
    .enum([
      "MEETING",
      "FOCUS_TIME",
      "BREAK",
      "TASK",
      "COMPANY_EVENT",
      "OTHER",
    ])
    .optional(),

  employeeId: z
    .string()
    .min(1),

  participantIds: z
    .array(z.string().min(1))
    .optional(),

  startAt: z
    .string()
    .min(1),

  endAt: z
    .string()
    .min(1),

  location: z
    .string()
    .trim()
    .max(500)
    .optional(),

  isRecurring: z
    .boolean()
    .optional(),

  recurrenceRule: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional(),

  isImportant: z
    .boolean()
    .optional(),

  isCritical: z
    .boolean()
    .optional(),
});

const updateEventSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .optional(),

  description: z
    .string()
    .trim()
    .max(5000)
    .optional(),

  type: z
    .enum([
      "MEETING",
      "FOCUS_TIME",
      "BREAK",
      "TASK",
      "COMPANY_EVENT",
      "OTHER",
    ])
    .optional(),

  participantIds: z
    .array(z.string().min(1))
    .optional(),

  startAt: z
    .string()
    .min(1)
    .optional(),

  endAt: z
    .string()
    .min(1)
    .optional(),

  location: z
    .string()
    .trim()
    .max(500)
    .optional(),

  isRecurring: z
    .boolean()
    .optional(),

  recurrenceRule: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional(),

  isImportant: z
    .boolean()
    .optional(),

  isCritical: z
    .boolean()
    .optional(),

  status: z
    .enum([
      "SCHEDULED",
      "COMPLETED",
      "CANCELLED",
    ])
    .optional(),
});

/* =========================================================
   GET MY CALENDAR
========================================================= */

calendarRouter.get("/", async (req, res, next) => {
  try {
    const employeeId =
      typeof req.query.employeeId === "string"
        ? req.query.employeeId
        : getEmployeeId(req);

    if (!employeeId) {
      return res.status(400).json({
        message: "Employee ID is required.",
      });
    }

    /*
     * Employees can only request their own calendar.
     * HR/Admin can request another employee's calendar.
     */
    if (
      !canManageCalendar(req) &&
      employeeId !== getEmployeeId(req)
    ) {
      return res.status(403).json({
        message:
          "You can only view your own calendar.",
      });
    }

    const startAt =
      typeof req.query.startAt === "string"
        ? req.query.startAt
        : undefined;

    const endAt =
      typeof req.query.endAt === "string"
        ? req.query.endAt
        : undefined;

    const events = await repo.listEvents({
      employeeId,
      startAt,
      endAt,
    });

    return res.json({ events });
  } catch (error) {
    return next(error);
  }
});

/* =========================================================
   AI CALENDAR FEATURES

   IMPORTANT:
   All /ai/... routes are intentionally placed
   BEFORE /:id.
========================================================= */

/* =========================================================
   1. EMPLOYEE SCHEDULE
========================================================= */

calendarRouter.get(
  "/ai/schedule/:employeeId",
  async (req, res, next) => {
    try {
      const employeeId =
        req.params.employeeId;

      if (!employeeId) {
        return res.status(400).json({
          message: "Employee ID is required.",
        });
      }

      /*
       * Employees can analyze only their own schedule.
       * HR/Admin can analyze another employee's schedule.
       */
      if (
        !canManageCalendar(req) &&
        employeeId !== getEmployeeId(req)
      ) {
        return res.status(403).json({
          message:
            "You can only analyze your own schedule.",
        });
      }

      const startAt =
        typeof req.query.startAt === "string"
          ? req.query.startAt
          : null;

      const endAt =
        typeof req.query.endAt === "string"
          ? req.query.endAt
          : null;

      if (!startAt || !endAt) {
        return res.status(400).json({
          message:
            "startAt and endAt are required.",
        });
      }

      const events =
        await repo.getEmployeeSchedule({
          employeeId,
          startAt,
          endAt,
        });

      return res.json({ events });
    } catch (error) {
      return next(error);
    }
  },
);

/* =========================================================
   2. AI TEAM CALENDAR CONFLICT RESOLVER
========================================================= */

calendarRouter.get(
  "/ai/conflict/:employeeId",
  async (req, res, next) => {
    try {
      const employeeId =
        req.params.employeeId;

      if (!employeeId) {
        return res.status(400).json({
          message: "Employee ID is required.",
        });
      }

      if (
        !canManageCalendar(req) &&
        employeeId !== getEmployeeId(req)
      ) {
        return res.status(403).json({
          message:
            "You can only analyze your own calendar.",
        });
      }

      const startAt =
        typeof req.query.startAt === "string"
          ? req.query.startAt
          : null;

      const endAt =
        typeof req.query.endAt === "string"
          ? req.query.endAt
          : null;

      if (!startAt || !endAt) {
        return res.status(400).json({
          message:
            "startAt and endAt are required.",
        });
      }

      /* -----------------------------------------------
         Deterministic conflict analysis
      ------------------------------------------------ */

      const conflictData =
        await aiService.analyzeCalendarConflict({
          employeeId,
          startAt,
          endAt,
        });

      /* -----------------------------------------------
         AI explanation
      ------------------------------------------------ */

      const ai =
        await aiGroq.generateCalendarConflictAI({
          employeeId,
          startAt,
          endAt,
          conflictData,
        });

      return res.json({
        ...conflictData,
        ai,
      });
    } catch (error) {
      return next(error);
    }
  },
);

/* =========================================================
   3. AI EMPLOYEE CALENDAR HEALTH
========================================================= */

calendarRouter.get(
  "/ai/health/:employeeId",
  async (req, res, next) => {
    try {
      const employeeId =
        req.params.employeeId;

      if (!employeeId) {
        return res.status(400).json({
          message: "Employee ID is required.",
        });
      }

      if (
        !canManageCalendar(req) &&
        employeeId !== getEmployeeId(req)
      ) {
        return res.status(403).json({
          message:
            "You can only analyze your own calendar.",
        });
      }

      const startAt =
        typeof req.query.startAt === "string"
          ? req.query.startAt
          : null;

      const endAt =
        typeof req.query.endAt === "string"
          ? req.query.endAt
          : null;

      if (!startAt || !endAt) {
        return res.status(400).json({
          message:
            "startAt and endAt are required.",
        });
      }

      /* -----------------------------------------------
         Deterministic health calculation
      ------------------------------------------------ */

      const healthData =
        await aiService.analyzeCalendarHealth({
          employeeId,
          startAt,
          endAt,
        });

      /* -----------------------------------------------
         AI interpretation
      ------------------------------------------------ */

      const ai =
        await aiGroq.generateCalendarHealthAI({
          employeeId,
          healthData,
        });

      return res.json({
        ...healthData,
        ai,
      });
    } catch (error) {
      return next(error);
    }
  },
);

/* =========================================================
   4. AI MEETING NECESSITY SCORE
========================================================= */

calendarRouter.get(
  "/ai/meeting-necessity/:eventId",
  async (req, res, next) => {
    try {
      const eventId =
        req.params.eventId;

      if (!eventId) {
        return res.status(400).json({
          message: "Event ID is required.",
        });
      }

      const event =
        await repo.getEvent(eventId);

      if (!event) {
        return res.status(404).json({
          message:
            "Calendar event not found.",
        });
      }

      const employeeId =
        getEmployeeId(req);

      const canAccess =
        canManageCalendar(req) ||
        event.employeeId === employeeId ||
        (
          !!employeeId &&
          event.participantIds?.includes(
            employeeId,
          )
        );

      if (!canAccess) {
        return res.status(403).json({
          message:
            "You do not have access to this meeting.",
        });
      }

      const analysisEmployeeId =
        employeeId ?? event.employeeId;

      /* -----------------------------------------------
         Deterministic analysis
      ------------------------------------------------ */

      const meetingData =
        await aiService.analyzeMeetingNecessity({
          employeeId:
            analysisEmployeeId,
          eventId,
        });

      /* -----------------------------------------------
         Retrieve meeting history
      ------------------------------------------------ */

      const history =
        await repo.getMeetingHistory({
          employeeId:
            analysisEmployeeId,

          title:
            event.title,

          participantIds:
            event.participantIds ?? [],

          before:
            event.startAt,

          limit: 20,
        });

      /* -----------------------------------------------
         AI explanation
      ------------------------------------------------ */

      const ai =
        await aiGroq.generateMeetingNecessityAI({
          eventId,
          meetingData,
          history,
        });

      return res.json({
        ...meetingData,
        ai,
      });
    } catch (error) {
      return next(error);
    }
  },
);

/* =========================================================
   5. AI SCHEDULE OPTIMIZER
========================================================= */

calendarRouter.get(
  "/ai/optimize/:employeeId",
  async (req, res, next) => {
    try {
      const employeeId =
        req.params.employeeId;

      if (!employeeId) {
        return res.status(400).json({
          message:
            "Employee ID is required.",
        });
      }

      if (
        !canManageCalendar(req) &&
        employeeId !== getEmployeeId(req)
      ) {
        return res.status(403).json({
          message:
            "You can only optimize your own schedule.",
        });
      }

      const startAt =
        typeof req.query.startAt === "string"
          ? req.query.startAt
          : null;

      const endAt =
        typeof req.query.endAt === "string"
          ? req.query.endAt
          : null;

      if (!startAt || !endAt) {
        return res.status(400).json({
          message:
            "startAt and endAt are required.",
        });
      }

      /* -----------------------------------------------
         Deterministic optimization
      ------------------------------------------------ */

      const optimizationData =
        await aiService.optimizeSchedule({
          employeeId,
          startAt,
          endAt,
        });

      /* -----------------------------------------------
         Get complete schedule for AI context
      ------------------------------------------------ */

      const scheduleData =
        await repo.getEmployeeSchedule({
          employeeId,
          startAt,
          endAt,
        });

      /* -----------------------------------------------
         AI recommendations
      ------------------------------------------------ */

      const ai =
        await aiGroq.generateScheduleOptimizerAI({
          employeeId,
          scheduleData,
          optimizationData,
        });

      return res.json({
        ...optimizationData,
        ai,
      });
    } catch (error) {
      return next(error);
    }
  },
);

/* =========================================================
   GET SINGLE EVENT
========================================================= */

calendarRouter.get(
  "/:id",
  async (req, res, next) => {
    try {
      const event =
        await repo.getEvent(req.params.id);

      if (!event) {
        return res.status(404).json({
          message:
            "Calendar event not found.",
        });
      }

      const employeeId =
        getEmployeeId(req);

      const canAccess =
        canManageCalendar(req) ||
        event.employeeId === employeeId ||
        (
          !!employeeId &&
          event.participantIds?.includes(
            employeeId,
          )
        );

      if (!canAccess) {
        return res.status(403).json({
          message:
            "You do not have access to this calendar event.",
        });
      }

      return res.json({ event });
    } catch (error) {
      return next(error);
    }
  },
);

/* =========================================================
   CREATE EVENT
========================================================= */

calendarRouter.post(
  "/",
  async (req, res, next) => {
    try {
      const parsed =
        createEventSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        return res.status(400).json({
          message:
            "Invalid calendar event data.",
          errors:
            parsed.error.flatten(),
        });
      }

      const employeeId =
        getEmployeeId(req);

      if (!employeeId) {
        return res.status(400).json({
          message:
            "Employee profile is required.",
        });
      }

      /*
       * Normal employees create events
       * for themselves.
       * HR/Admin can create events for
       * another employee.
       */
      if (
        !canManageCalendar(req) &&
        parsed.data.employeeId !== employeeId
      ) {
        return res.status(403).json({
          message:
            "You can only create events for yourself.",
        });
      }

      const event =
        await repo.createEvent({
          ...parsed.data,
          source: "MANUAL",
          sourceId: null,
        });

      return res.status(201).json({ event });
    } catch (error) {
      return next(error);
    }
  },
);

/* =========================================================
   UPDATE EVENT
========================================================= */

calendarRouter.patch(
  "/:id",
  async (req, res, next) => {
    try {
      const parsed =
        updateEventSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        return res.status(400).json({
          message:
            "Invalid calendar event data.",
          errors:
            parsed.error.flatten(),
        });
      }

      const existing =
        await repo.getEvent(
          req.params.id,
        );

      if (!existing) {
        return res.status(404).json({
          message:
            "Calendar event not found.",
        });
      }

      const employeeId =
        getEmployeeId(req);

      const canEdit =
        canManageCalendar(req) ||
        existing.employeeId === employeeId;

      if (!canEdit) {
        return res.status(403).json({
          message:
            "You can only edit your own calendar events.",
        });
      }

      const event =
        await repo.updateEvent(
          req.params.id,
          parsed.data,
        );

      return res.json({ event });
    } catch (error) {
      return next(error);
    }
  },
);

/* =========================================================
   CANCEL EVENT
========================================================= */

calendarRouter.post(
  "/:id/cancel",
  async (req, res, next) => {
    try {
      const existing =
        await repo.getEvent(
          req.params.id,
        );

      if (!existing) {
        return res.status(404).json({
          message:
            "Calendar event not found.",
        });
      }

      const employeeId =
        getEmployeeId(req);

      const canEdit =
        canManageCalendar(req) ||
        existing.employeeId === employeeId;

      if (!canEdit) {
        return res.status(403).json({
          message:
            "You can only cancel your own calendar events.",
        });
      }

      const event =
        await repo.cancelEvent(
          req.params.id,
        );

      return res.json({ event });
    } catch (error) {
      return next(error);
    }
  },
);

/* =========================================================
   DELETE EVENT
========================================================= */

calendarRouter.delete(
  "/:id",
  async (req, res, next) => {
    try {
      const existing =
        await repo.getEvent(
          req.params.id,
        );

      if (!existing) {
        return res.status(404).json({
          message:
            "Calendar event not found.",
        });
      }

      const employeeId =
        getEmployeeId(req);

      const canDelete =
        canManageCalendar(req) ||
        existing.employeeId === employeeId;

      if (!canDelete) {
        return res.status(403).json({
          message:
            "You can only delete your own calendar events.",
        });
      }

      await repo.deleteEvent(
        req.params.id,
      );

      return res.json({
        success: true,
      });
    } catch (error) {
      return next(error);
    }
  },
);

/* =========================================================
   EXPORT
========================================================= */

export default calendarRouter;