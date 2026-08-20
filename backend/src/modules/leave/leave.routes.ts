import { Router } from "express";
import { z } from "zod";

import { authenticate } from "@/middleware/auth";
import { isManagerOrAbove } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";

import * as repo from "./leave.repository";

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
leaveRouter.get(
  "/types",
  async (_req, res, next) => {
    try {
      const leaveTypes =
        await repo.listLeaveTypes();

      res.json({ leaveTypes });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ============================================================
 * LEAVE BALANCES
 * ============================================================
 *
 * Security rules:
 *
 * SUPER_ADMIN / HR_ADMIN
 *   -> Can request any employee's balance.
 *
 * Everyone else
 *   -> Can only request their own balance.
 *
 * This prevents:
 *
 * /leave/balances?employeeId=someone_else
 *
 * from exposing another employee's leave balance.
 */
leaveRouter.get(
  "/balances",
  async (req, res, next) => {
    try {
      const requester = req.user!;

      const requestedEmployeeId =
        typeof req.query.employeeId === "string"
          ? req.query.employeeId
          : undefined;

      const isAdminUser =
        requester.role === "SUPER_ADMIN" ||
        requester.role === "HR_ADMIN";

      let employeeId: string;

      if (isAdminUser && requestedEmployeeId) {
        employeeId = requestedEmployeeId;
      } else {
        if (!requester.employeeId) {
          throw AppError.forbidden(
            "Employee profile is required."
          );
        }

        employeeId = requester.employeeId;
      }

      const year = req.query.year
        ? Number(req.query.year)
        : new Date().getFullYear();

      if (!Number.isInteger(year) || year < 2000) {
        throw AppError.badRequest(
          "Invalid leave year."
        );
      }

      const balances =
        await repo.listBalancesForEmployee(
          employeeId,
          year
        );

      res.json({ balances });
    } catch (err) {
      next(err);
    }
  }
);

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
 *   Can view their team when scope=team.
 */
leaveRouter.get(
  "/requests",
  async (req, res, next) => {
    try {
      const { role, employeeId } = req.user!;

      const isPrivileged =
        role === "SUPER_ADMIN" ||
        role === "HR_ADMIN";

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

      /**
       * Team scope:
       *
       * The employee's own manager/approver
       * can see the requests assigned to them.
       */
      if (
        req.query.scope === "team" &&
        employeeId
      ) {
        filters.approverId = employeeId;
      }

      /**
       * Admin can optionally filter by employee.
       */
      else if (isPrivileged) {
        if (
          typeof req.query.employeeId === "string"
        ) {
          filters.employeeId =
            req.query.employeeId;
        }
      }

      /**
       * Normal users can only see their own requests.
       */
      else {
        if (!employeeId) {
          throw AppError.forbidden(
            "Employee profile is required."
          );
        }

        filters.employeeId = employeeId;
      }

      const requests =
        await repo.listRequests(filters);

      res.json({ requests });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ============================================================
 * LEAVE CALENDAR
 * ============================================================
 *
 * Leave calendar data is not an employee's private balance.
 * It is used by the HRMS calendar/leave view.
 *
 * Authentication is required.
 */
leaveRouter.get(
  "/calendar",
  async (req, res, next) => {
    try {
      const now = new Date();

      const month = req.query.month
        ? Number(req.query.month)
        : now.getMonth() + 1;

      const year = req.query.year
        ? Number(req.query.year)
        : now.getFullYear();

      if (
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12
      ) {
        throw AppError.badRequest(
          "Invalid month."
        );
      }

      if (
        !Number.isInteger(year) ||
        year < 2000
      ) {
        throw AppError.badRequest(
          "Invalid year."
        );
      }

      const entries =
        await repo.getLeaveCalendar(
          month,
          year
        );

      res.json({ entries });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ============================================================
 * ON-LEAVE TODAY
 * ============================================================
 *
 * Used for dashboard summary.
 */
leaveRouter.get(
  "/summary/on-leave-today",
  async (_req, res, next) => {
    try {
      const count =
        await repo.onLeaveToday();

      res.json({ count });
    } catch (err) {
      next(err);
    }
  }
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
  reason: z
    .string()
    .min(
      3,
      "Please add a short reason for this leave."
    ),
});

/**
 * POST /requests
 *
 * Any authenticated employee with an employee
 * profile can apply for leave.
 */
leaveRouter.post(
  "/requests",
  validate(createRequestSchema),
  async (req, res, next) => {
    try {
      if (!req.user!.employeeId) {
        throw AppError.forbidden(
          "Only employees can apply for leave."
        );
      }

      const request =
        await repo.createRequest({
          employeeId:
            req.user!.employeeId,
          ...req.body,
        });

      /**
       * Notify the employee's manager.
       */
      const employee =
        (await getEmployeeById(
          req.user!.employeeId
        )) as any;

      if (employee?.managerId) {
        const manager =
          (await getEmployeeById(
            employee.managerId
          )) as any;

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
  }
);

/**
 * ============================================================
 * LEAVE DECISION
 * ============================================================
 *
 * SUPER_ADMIN / HR_ADMIN / MANAGER
 */
const decisionSchema = z.object({
  status: z.enum([
    "APPROVED",
    "REJECTED",
  ]),
  decisionNote: z.string().optional(),
});

leaveRouter.post(
  "/requests/:id/decide",
  isManagerOrAbove,
  validate(decisionSchema),
  async (req, res, next) => {
    try {
      if (!req.user!.employeeId) {
        throw AppError.forbidden(
          "Employee profile is required."
        );
      }

      const request =
        await repo.decideRequest(
          req.params.id,
          req.user!.employeeId,
          req.body.status,
          req.body.decisionNote
        );

      if (!request) {
        throw AppError.notFound(
          "Leave request not found."
        );
      }

      /**
       * Notify the employee about the decision.
       */
      const employee =
        (await getEmployeeById(
          (request as any).employeeId
        )) as any;

      if (employee) {
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

      res.json({ request });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ============================================================
 * CANCEL LEAVE REQUEST
 * ============================================================
 *
 * A user can cancel their own request.
 *
 * Repository layer receives the authenticated
 * employee ID, so another employee's request
 * cannot be cancelled through this route.
 */
leaveRouter.post(
  "/requests/:id/cancel",
  async (req, res, next) => {
    try {
      if (!req.user!.employeeId) {
        throw AppError.forbidden(
          "Employee profile is required."
        );
      }

      const request =
        await repo.cancelRequest(
          req.params.id,
          req.user!.employeeId
        );

      res.json({ request });
    } catch (err) {
      next(err);
    }
  }
);