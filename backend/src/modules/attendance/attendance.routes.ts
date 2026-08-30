import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isManagerOrAbove } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import * as repo from "./attendance.repository";
import { getEmployeeById } from "../employees/employees.repository";

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

attendanceRouter.get("/today", async (req, res, next) => {
  try {
    if (!req.user!.employeeId) return res.json({ record: null });
    res.json({
      record: (await repo.getTodayRecord(req.user!.employeeId)) ?? null,
    });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.post("/check-in", async (req, res, next) => {
  try {
    if (!req.user!.employeeId)
      throw AppError.forbidden("Only employees can check in.");
    res.json({ record: await repo.checkIn(req.user!.employeeId) });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.post("/check-out", async (req, res, next) => {
  try {
    if (!req.user!.employeeId)
      throw AppError.forbidden("Only employees can check out.");
    const record = await repo.checkOut(req.user!.employeeId);
    if (!record)
      throw AppError.badRequest(
        "You need to check in before you can check out.",
      );
    res.json({ record });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get("/me", async (req, res, next) => {
  try {
    const month = req.query.month ? Number(req.query.month) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;
    res.json({
      records: await repo.listForEmployee(req.user!.employeeId!, month, year),
    });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get(
  "/employee/:employeeId",
  isManagerOrAbove,
  async (req, res, next) => {
    try {
      const { role, employeeId: requesterEmployeeId } = req.user!;

      // Managers can only view attendance of their direct reports
      if (role === "MANAGER") {
        if (!requesterEmployeeId) {
          throw AppError.forbidden("Manager employee profile not found.");
        }

        const employee = (await getEmployeeById(req.params.employeeId)) as any;

        if (!employee) {
          throw AppError.notFound("Employee not found.");
        }

        if (employee.managerId !== requesterEmployeeId) {
          throw AppError.forbidden(
            "You can only view attendance of your direct reports.",
          );
        }
      }

      const month = req.query.month ? Number(req.query.month) : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;

      if (
        month !== undefined &&
        (!Number.isInteger(month) || month < 1 || month > 12)
      ) {
        throw AppError.badRequest("Invalid attendance month.");
      }

      if (year !== undefined && (!Number.isInteger(year) || year < 2000)) {
        throw AppError.badRequest("Invalid attendance year.");
      }

      res.json({
        records: await repo.listForEmployee(req.params.employeeId, month, year),
      });
    } catch (err) {
      next(err);
    }
  },
);

attendanceRouter.get(
  "/by-date/:date",
  isManagerOrAbove,
  async (req, res, next) => {
    try {
      const { role, employeeId } = req.user!;

      // Managers may only receive records for their own direct reports.
      // The manager ID always comes from the authenticated user; it is never
      // accepted from query/body input.
      let managerId: string | undefined;

      if (role === "MANAGER") {
        if (!employeeId) {
          throw AppError.forbidden("Manager employee profile not found.");
        }
        managerId = employeeId;
      }

      const date = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw AppError.badRequest("Invalid attendance date.");
      }

      const parsedDate = new Date(`${date}T00:00:00.000Z`);
      if (Number.isNaN(parsedDate.getTime())) {
        throw AppError.badRequest("Invalid attendance date.");
      }

      res.json({
        records: await repo.listForDate(date, managerId),
      });
    } catch (err) {
      next(err);
    }
  },
);

attendanceRouter.get("/summary/today", async (_req, res, next) => {
  try {
    res.json(await repo.getTodaySummary());
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get(
  "/analytics/trend",
  isManagerOrAbove,
  async (req, res, next) => {
    try {
      const months = req.query.months ? Number(req.query.months) : 6;

      if (!Number.isInteger(months) || months < 1 || months > 24) {
        throw AppError.badRequest(
          "Months must be an integer between 1 and 24.",
        );
      }

      const { role, employeeId } = req.user!;

      const managerId =
        role === "MANAGER" && employeeId ? employeeId : undefined;

      res.json({
        data: await repo.getMonthlyAttendanceTrend(months, managerId),
      });
    } catch (err) {
      next(err);
    }
  },
);

const regularizationSchema = z.object({
  date: z.string(),
  note: z.string().min(3, "Please describe the reason for regularization."),
});

const regularizationDecisionSchema = z.object({
  decisionNote: z
    .string()
    .trim()
    .max(1000, "Decision note must not exceed 1000 characters.")
    .optional()
    .default(""),
});

attendanceRouter.get(
  "/regularization/team",
  isManagerOrAbove,
  async (req, res, next) => {
    try {
      const { role, employeeId } = req.user!;

      if (role !== "MANAGER") {
        throw AppError.forbidden(
          "Only Managers can review team regularization requests.",
        );
      }

      if (!employeeId) {
        throw AppError.forbidden("Manager employee profile not found.");
      }

      const status =
        typeof req.query.status === "string"
          ? req.query.status.toUpperCase()
          : undefined;

      if (
        status &&
        !["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(status)
      ) {
        throw AppError.badRequest("Invalid regularization request status.");
      }

      res.json({
        requests: await repo.listTeamRegularizationRequests(employeeId, status),
      });
    } catch (err) {
      next(err);
    }
  },
);

attendanceRouter.post(
  "/regularization/:requestId/approve",
  isManagerOrAbove,
  validate(regularizationDecisionSchema),
  async (req, res, next) => {
    try {
      const { role, employeeId } = req.user!;

      if (role !== "MANAGER") {
        throw AppError.forbidden(
          "Only Managers can approve team regularization requests.",
        );
      }

      if (!employeeId) {
        throw AppError.forbidden("Manager employee profile not found.");
      }

      const { decisionNote } = req.body as z.infer<
        typeof regularizationDecisionSchema
      >;

      res.json({
        result: await repo.approveRegularization(
          req.params.requestId,
          employeeId,
          decisionNote,
        ),
        message: "Attendance regularization approved successfully.",
      });
    } catch (err) {
      next(err);
    }
  },
);

attendanceRouter.post(
  "/regularization/:requestId/reject",
  isManagerOrAbove,
  validate(
    regularizationDecisionSchema.extend({
      decisionNote: z
        .string()
        .trim()
        .min(3, "Please provide a rejection reason.")
        .max(1000, "Decision note must not exceed 1000 characters."),
    }),
  ),
  async (req, res, next) => {
    try {
      const { role, employeeId } = req.user!;

      if (role !== "MANAGER") {
        throw AppError.forbidden(
          "Only Managers can reject team regularization requests.",
        );
      }

      if (!employeeId) {
        throw AppError.forbidden("Manager employee profile not found.");
      }

      const { decisionNote } = req.body as { decisionNote: string };

      res.json({
        request: await repo.rejectRegularization(
          req.params.requestId,
          employeeId,
          decisionNote,
        ),
        message: "Attendance regularization rejected successfully.",
      });
    } catch (err) {
      next(err);
    }
  },
);

attendanceRouter.post(
  "/regularize",
  validate(regularizationSchema),
  async (req, res, next) => {
    try {
      if (!req.user!.employeeId) throw AppError.forbidden();
      const { date, note } = req.body as z.infer<typeof regularizationSchema>;
      res.json({
        record: await repo.requestRegularization(
          req.user!.employeeId,
          date,
          note,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);
