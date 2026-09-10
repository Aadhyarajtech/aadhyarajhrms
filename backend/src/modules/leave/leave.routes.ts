import { Router } from "express";
import { z } from "zod";

import { authenticate } from "@/middleware/auth";
import { isManagerOrAbove } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";

import * as repo from "./leave.repository";
import {
  generateLeaveReason,
  analyzeLeaveConflict,
  analyzeLeaveAnalytics,
  analyzeLeavePatterns,
  analyzeLeaveApproval,
} from "./leaveAi.service";
import { getEmployeeById } from "@/modules/employees/employees.repository";
import { notify } from "@/modules/notifications/notifications.repository";

export const leaveRouter = Router();

/**
 * Every Leave route requires authentication.
 */
leaveRouter.use(authenticate);

/**
 * ============================================================
 * LEAVE TYPES
 * ============================================================
 */

/**
 * GET /types
 *
 * All authenticated employees can see available leave types.
 */
leaveRouter.get("/types", async (_req, res, next) => {
  try {
    const leaveTypes = await repo.listLeaveTypes();
    res.json({ leaveTypes });
  } catch (err) {
    next(err);
  }
});

/**
 * ============================================================
 * LEAVE BALANCES
 * ============================================================
 *
 * SUPER_ADMIN / HR_ADMIN
 *   -> Can request any employee's balance.
 *
 * Everyone else
 *   -> Can only request their own balance.
 */
leaveRouter.get("/balances", async (req, res, next) => {
  try {
    const requester = req.user!;

    const requestedEmployeeId =
      typeof req.query.employeeId === "string"
        ? req.query.employeeId
        : undefined;

    const isAdminUser =
      requester.role === "SUPER_ADMIN" || requester.role === "HR_ADMIN";

    let employeeId: string;

    if (isAdminUser && requestedEmployeeId) {
      employeeId = requestedEmployeeId;
    } else {
      if (!requester.employeeId) {
        throw AppError.forbidden("Employee profile is required.");
      }

      employeeId = requester.employeeId;
    }

    const year = req.query.year
      ? Number(req.query.year)
      : new Date().getFullYear();

    if (!Number.isInteger(year) || year < 2000) {
      throw AppError.badRequest("Invalid leave year.");
    }

    const balances = await repo.listBalancesForEmployee(employeeId, year);

    res.json({ balances });
  } catch (err) {
    next(err);
  }
});

/**
 * ============================================================
 * LEAVE REQUESTS
 * ============================================================
 *
 * Admin:
 *   Can view all requests.
 *
 * Employee:
 *   Can view own requests.
 *
 * Manager:
 *   Can view their direct team's requests when scope=team.
 */
leaveRouter.get("/requests", async (req, res, next) => {
  try {
    const { role, employeeId } = req.user!;

    const isPrivileged =
      role === "SUPER_ADMIN" || role === "HR_ADMIN";

    const filters: {
      status?: string;
      approverId?: string;
      employeeId?: string;
    } = {
      status:
        typeof req.query.status === "string"
          ? req.query.status
          : undefined,
    };

    if (req.query.scope === "team") {
      /*
       * MANAGER
       *   -> Only direct reports.
       *
       * HR_ADMIN / SUPER_ADMIN
       *   -> Can view all team leave requests.
       *
       * This keeps the Team Approvals screen usable for
       * administrators while preserving manager-level
       * access restrictions.
       */
      if (role === "MANAGER") {
        if (!employeeId) {
          throw AppError.forbidden(
            "Employee profile is required.",
          );
        }

        filters.approverId = employeeId;
      } else if (!isPrivileged) {
        throw AppError.forbidden(
          "You are not authorized to view team leave requests.",
        );
      }
    } else if (isPrivileged) {
      /*
       * HR_ADMIN / SUPER_ADMIN may optionally filter
       * requests by employee.
       */
      if (typeof req.query.employeeId === "string") {
        filters.employeeId = req.query.employeeId;
      }
    } else {
      /*
       * Normal employees can only see their own requests.
       */
      if (!employeeId) {
        throw AppError.forbidden(
          "Employee profile is required.",
        );
      }

      filters.employeeId = employeeId;
    }

    const requests = await repo.listRequests(filters);

    res.json({ requests });
  } catch (err) {
    next(err);
  }
});
/**
 * ============================================================
 * LEAVE CALENDAR
 * ============================================================
 */
leaveRouter.get("/calendar", async (req, res, next) => {
  try {
    const now = new Date();

    const month = req.query.month
      ? Number(req.query.month)
      : now.getMonth() + 1;

    const year = req.query.year ? Number(req.query.year) : now.getFullYear();

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw AppError.badRequest("Invalid month.");
    }

    if (!Number.isInteger(year) || year < 2000) {
      throw AppError.badRequest("Invalid year.");
    }

    const entries = await repo.getLeaveCalendar(month, year);

    res.json({ entries });
  } catch (err) {
    next(err);
  }
});

/**
 * ============================================================
 * ON-LEAVE TODAY
 * ============================================================
 */
leaveRouter.get("/summary/on-leave-today", async (_req, res, next) => {
  try {
    const count = await repo.onLeaveToday();
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

/**
 * ============================================================
 * AI LEAVE REASON / DESCRIPTION
 * ============================================================
 */
const aiReasonSchema = z.object({
  reason: z.string().min(3).max(500),
});

leaveRouter.post(
  "/ai/reason",
  validate(aiReasonSchema),
  async (req, res, next) => {
    try {
      const result = await generateLeaveReason(req.body.reason);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * ============================================================
 * AI LEAVE CONFLICT & TEAM IMPACT
 * ============================================================
 *
 * Checks overlapping APPROVED/PENDING leave for the employee's
 * relevant team and returns a deterministic conflict analysis.
 */
const aiConflictSchema = z.object({
  employeeId: z.string().min(1, "Employee ID is required."),
  startDate: z.string().min(1, "Start date is required."),
  endDate: z.string().min(1, "End date is required."),
});

leaveRouter.post(
  "/ai/conflict",
  validate(aiConflictSchema),
  async (req, res, next) => {
    try {
      const conflict = await analyzeLeaveConflict({
        employeeId: req.body.employeeId,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
      });

      res.json(conflict);
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
 * AI LEAVE APPROVAL ASSISTANT
 * ============================================================
 *
 * Provides an AI-assisted recommendation for a pending
 * leave request.
 *
 * The recommendation is calculated from HRMS data.
 * AI only explains the calculated result.
 *
 * MANAGER
 *   -> Can analyze requests from direct reports.
 *
 * HR_ADMIN / SUPER_ADMIN
 *   -> Can analyze requests across the organization.
 */

const aiApprovalSchema = z.object({
  requestId: z.string().min(1, "Leave request ID is required."),
});

leaveRouter.post(
  "/ai/approval",
  isManagerOrAbove,
  validate(aiApprovalSchema),
  async (req, res, next) => {
    try {
      const requester = req.user!;

      if (!requester.employeeId) {
        throw AppError.forbidden(
          "Employee profile is required.",
        );
      }

      if (
        requester.role !== "SUPER_ADMIN" &&
        requester.role !== "HR_ADMIN" &&
        requester.role !== "MANAGER"
      ) {
        throw AppError.forbidden(
          "Only managers and administrators can use the leave approval assistant.",
        );
      }

      const result = await analyzeLeaveApproval({
        requestId: req.body.requestId,
        requesterRole: requester.role,
        requesterEmployeeId: requester.employeeId,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
/**
 * ============================================================
 * AI LEAVE PATTERN DETECTION
 * ============================================================
 *
 * SUPER_ADMIN / HR_ADMIN
 *   -> Organization patterns by default.
 *   -> Can optionally analyze a specific employee.
 *
 * MANAGER
 *   -> Team patterns by default.
 *   -> Can optionally analyze one of their direct reports.
 *
 * Other employees
 *   -> Not allowed to access management pattern analysis.
 */
const aiPatternsSchema = z.object({
  startDate: z.string().min(1, "Start date is required."),
  endDate: z.string().min(1, "End date is required."),
  employeeId: z.string().min(1).optional(),
});

leaveRouter.post(
  "/ai/patterns",
  isManagerOrAbove,
  validate(aiPatternsSchema),
  async (req, res, next) => {
    try {
      const requester = req.user!;

      if (!requester.employeeId) {
        throw AppError.forbidden("Employee profile is required.");
      }

      if (
        requester.role !== "SUPER_ADMIN" &&
        requester.role !== "HR_ADMIN" &&
        requester.role !== "MANAGER"
      ) {
        throw AppError.forbidden(
          "Only managers and administrators can access leave pattern analysis.",
        );
      }

      const patterns = await analyzeLeavePatterns({
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        requesterRole: requester.role,
        requesterEmployeeId: requester.employeeId,
        employeeId: req.body.employeeId,
      });

      res.json(patterns);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * ============================================================
 * AI LEAVE ANALYTICS
 * ============================================================
 *
 * SUPER_ADMIN / HR_ADMIN
 *   -> Organization analytics by default.
 *   -> Can optionally analyze a specific employee.
 *
 * MANAGER
 *   -> Team analytics by default.
 *   -> Can optionally analyze one of their direct reports.
 *
 * Other employees
 *   -> Not allowed to access management analytics.
 *
 * The AI service performs the scope authorization again using
 * the authenticated requester information, so the employee ID
 * used for analysis is never trusted from the client alone.
 */
const aiAnalyticsSchema = z.object({
  startDate: z.string().min(1, "Start date is required."),
  endDate: z.string().min(1, "End date is required."),
  employeeId: z.string().min(1).optional(),
});

leaveRouter.post(
  "/ai/analytics",
  isManagerOrAbove,
  validate(aiAnalyticsSchema),
  async (req, res, next) => {
    try {
      const requester = req.user!;

      if (!requester.employeeId) {
        throw AppError.forbidden("Employee profile is required.");
      }

      if (
        requester.role !== "SUPER_ADMIN" &&
        requester.role !== "HR_ADMIN" &&
        requester.role !== "MANAGER"
      ) {
        throw AppError.forbidden(
          "Only managers and administrators can access leave analytics.",
        );
      }

      const analytics = await analyzeLeaveAnalytics({
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        requesterRole: requester.role,
        requesterEmployeeId: requester.employeeId,
        employeeId: req.body.employeeId,
      });

      res.json(analytics);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * ============================================================
 * CREATE LEAVE REQUEST
 * ============================================================
 */

const createRequestSchema = z.object({
  leaveTypeId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().min(3, "Please add a short reason for this leave."),
});

leaveRouter.post(
  "/requests",
  validate(createRequestSchema),
  async (req, res, next) => {
    try {
      if (!req.user!.employeeId) {
        throw AppError.forbidden("Only employees can apply for leave.");
      }

      const request = await repo.createRequest({
        employeeId: req.user!.employeeId,
        ...req.body,
      });

      /**
       * Notify the employee's manager.
       */
      const employee = (await getEmployeeById(req.user!.employeeId)) as any;

      if (employee?.managerId) {
        const manager = (await getEmployeeById(employee.managerId)) as any;

        if (manager) {
          await notify({
            userId: manager.userId,
            type: "LEAVE_REQUEST",
            title: "New leave request to review",
            message:
              `${employee.firstName} ${employee.lastName} ` +
              `requested ${request.totalDays} day(s) of leave.`,
            link: "/leave?tab=team",
          });
        }
      }

      res.status(201).json({ request });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * ============================================================
 * LEAVE DECISION
 * ============================================================
 *
 * SUPER_ADMIN / HR_ADMIN / MANAGER
 *
 * The repository is responsible for validating that a Manager
 * is actually the employee's assigned manager. The authenticated
 * employeeId is always passed to the repository; it is never
 * accepted from the request body or query string.
 */
const decisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  decisionNote: z
    .string()
    .trim()
    .max(500, "Decision note must be 500 characters or less.")
    .optional(),
});

leaveRouter.post(
  "/requests/:id/decide",
  isManagerOrAbove,
  validate(decisionSchema),
  async (req, res, next) => {
    try {
      if (!req.user!.employeeId) {
        throw AppError.forbidden(
          "Employee profile is required.",
        );
      }

      const decisionNote =
        typeof req.body.decisionNote === "string"
          ? req.body.decisionNote.trim() || undefined
          : undefined;

      const canApproveAny =
  req.user!.role === "SUPER_ADMIN" ||
  req.user!.role === "HR_ADMIN";

const request = await repo.decideRequest(
  req.params.id,
  req.user!.employeeId,
  req.body.status,
  decisionNote,
  {
    canApproveAny,
  },
);

      if (!request) {
        throw AppError.notFound(
          "Leave request not found.",
        );
      }

      /*
       * Notify the employee about the decision.
       *
       * IMPORTANT:
       * Notification failure must NOT make an already completed
       * leave approval/rejection appear as a failed operation.
       */
      try {
        const employee = (await getEmployeeById(
          (request as any).employeeId,
        )) as any;

        if (!employee) {
          console.warn(
            "[Leave Decision Notification] Employee not found:",
            (request as any).employeeId,
          );
        } else if (!employee.userId) {
          console.warn(
            "[Leave Decision Notification] Employee has no userId:",
            (request as any).employeeId,
          );
        } else {
          await notify({
            userId: employee.userId,
            type: "LEAVE_DECISION",
            title:
              `Your leave request was ${req.body.status.toLowerCase()}`,
            message:
              req.body.decisionNote ||
              `Your request for ${(request as any).totalDays} day(s) ` +
                `was ${req.body.status.toLowerCase()}.`,
            link: "/leave",
          });
        }
      } catch (notificationError) {
        console.error(
          "[Leave Decision Notification] Failed to notify employee. " +
            "Leave decision was already completed successfully.",
          notificationError,
        );
      }

      /*
       * Always return the successfully processed request even if
       * notification delivery fails.
       */
      res.json({ request });
    } catch (err) {
      next(err);
    }
  },
);
/**
 * ============================================================
 * CANCEL LEAVE REQUEST
 * ============================================================
 *
 * A user can cancel their own request.
 *
 * The repository receives the authenticated employee ID, so
 * another employee's request cannot be cancelled through this
 * route.
 */
leaveRouter.post("/requests/:id/cancel", async (req, res, next) => {
  try {
    if (!req.user!.employeeId) {
      throw AppError.forbidden("Employee profile is required.");
    }

    const request = await repo.cancelRequest(
      req.params.id,
      req.user!.employeeId,
    );

    res.json({ request });
  } catch (err) {
    next(err);
  }
});
