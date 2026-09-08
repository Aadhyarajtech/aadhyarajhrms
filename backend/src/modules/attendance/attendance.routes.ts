import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isAdmin, isManagerOrAbove } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import * as repo from "./attendance.repository";
import {
  createAttendanceExcel,
  createAttendancePdf,
  buildAttendanceRows,
} from "./attendance.export";
import { getEmployeeById } from "../employees/employees.repository";
import * as shiftRepo from "./shift.repository";

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

function parseExportFormat(value: unknown): "xlsx" | "pdf" {
  const format = typeof value === "string" ? value.toLowerCase() : "xlsx";
  if (format !== "xlsx" && format !== "pdf") {
    throw AppError.badRequest("Export format must be xlsx or pdf.");
  }
  return format;
}

async function sendAttendanceExport(
  res: any,
  rows: any[],
  format: "xlsx" | "pdf",
  filenameBase: string,
) {
  const exportRows = buildAttendanceRows(rows);
  if (format === "xlsx") {
    const buffer = await createAttendanceExcel(exportRows);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filenameBase}.xlsx"`,
    );
    res.send(buffer);
    return;
  }
  const buffer = await createAttendancePdf(exportRows);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filenameBase}.pdf"`,
  );
  res.send(buffer);
}

const shiftGeofenceSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().positive().max(100000),
});

const shiftPayloadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().max(30).optional().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  standardHours: z.number().positive().max(24),
  graceMinutes: z.number().min(0).max(1440).optional(),
  breakMinutes: z.number().min(0).max(1440).optional(),
  overtimeAfterHours: z.number().positive().max(24).optional(),
  departmentId: z.string().trim().nullable().optional(),
  employeeIds: z.array(z.string().trim()).optional(),
  geofence: shiftGeofenceSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});

const shiftUpdateSchema = shiftPayloadSchema.partial();

// Shift configuration is restricted to HR/admin users. Attendance punching
// continues to use the shift data independently of these management routes.
attendanceRouter.get("/shifts", isAdmin, async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    res.json({ shifts: await shiftRepo.listShifts(includeInactive) });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get(
  "/shifts/employee/:employeeId",
  isAdmin,
  async (req, res, next) => {
    try {
      res.json({
        shift:
          (await shiftRepo.getEmployeeShift(req.params.employeeId)) ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

attendanceRouter.get("/shifts/:id", isAdmin, async (req, res, next) => {
  try {
    const shift = await shiftRepo.getShift(req.params.id);
    if (!shift) throw AppError.notFound("Shift not found.");
    res.json({ shift });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.post(
  "/shifts",
  isAdmin,
  validate(shiftPayloadSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({ shift: await shiftRepo.createShift(req.body) });
    } catch (err) {
      next(err);
    }
  },
);

attendanceRouter.patch(
  "/shifts/:id",
  isAdmin,
  validate(shiftUpdateSchema),
  async (req, res, next) => {
    try {
      res.json({ shift: await shiftRepo.updateShift(req.params.id, req.body) });
    } catch (err) {
      next(err);
    }
  },
);

attendanceRouter.post(
  "/shifts/:id/assign",
  isAdmin,
  validate(z.object({ employeeIds: z.array(z.string().trim()) })),
  async (req, res, next) => {
    try {
      res.json({
        shift: await shiftRepo.assignShiftToEmployees(
          req.params.id,
          req.body.employeeIds,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

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

const attendanceLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000).optional(),
});

const checkOutSchema = attendanceLocationSchema.extend({
  breakMinutes: z.number().min(0).max(1440).optional(),
  earlyDepartureReason: z.string().trim().max(1000).optional(),
});

attendanceRouter.post(
  "/check-in",
  validate(attendanceLocationSchema),
  async (req, res, next) => {
    try {
      if (!req.user!.employeeId)
        throw AppError.forbidden("Only employees can check in.");

      const location = req.body as z.infer<typeof attendanceLocationSchema>;
      res.json({
        record: await repo.checkIn(req.user!.employeeId, location),
      });
    } catch (err) {
      next(err);
    }
  },
);

attendanceRouter.post(
  "/check-out",
  validate(checkOutSchema),
  async (req, res, next) => {
    try {
      if (!req.user!.employeeId)
        throw AppError.forbidden("Only employees can check out.");

      const options = req.body as z.infer<typeof checkOutSchema>;
      const record = await repo.checkOut(req.user!.employeeId, options);

      if (!record)
        throw AppError.badRequest(
          "You need to check in before you can check out.",
        );

      res.json({ record });
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "A reason is required for early departure."
      ) {
        next(AppError.badRequest(err.message));
        return;
      }
      next(err);
    }
  },
);

attendanceRouter.post("/break/start", async (req, res, next) => {
  try {
    if (!req.user!.employeeId)
      throw AppError.forbidden("Only employees can start a break.");

    res.json({
      record: await repo.startBreak(req.user!.employeeId),
    });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.post("/break/end", async (req, res, next) => {
  try {
    if (!req.user!.employeeId)
      throw AppError.forbidden("Only employees can end a break.");

    res.json({
      record: await repo.endBreak(req.user!.employeeId),
    });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get("/me", async (req, res, next) => {
  try {
    if (!req.user!.employeeId) {
      throw AppError.forbidden("Employee profile not found.");
    }

    const month = req.query.month ? Number(req.query.month) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;

    if (
      month !== undefined &&
      (!Number.isInteger(month) || month < 1 || month > 12)
    ) {
      throw AppError.badRequest("Invalid attendance month.");
    }

    if (
      year !== undefined &&
      (!Number.isInteger(year) || year < 2000 || year > 2100)
    ) {
      throw AppError.badRequest("Invalid attendance year.");
    }

    res.json({
      records: await repo.listForEmployee(req.user!.employeeId, month, year),
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

      if (
        year !== undefined &&
        (!Number.isInteger(year) || year < 2000 || year > 2100)
      ) {
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
      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== date
      ) {
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

attendanceRouter.get("/export/me", async (req, res, next) => {
  try {
    if (!req.user!.employeeId)
      throw AppError.forbidden("Employee profile not found.");
    const month = req.query.month ? Number(req.query.month) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;
    if (
      month !== undefined &&
      (!Number.isInteger(month) || month < 1 || month > 12)
    ) {
      throw AppError.badRequest("Invalid attendance month.");
    }
    if (
      year !== undefined &&
      (!Number.isInteger(year) || year < 2000 || year > 2100)
    ) {
      throw AppError.badRequest("Invalid attendance year.");
    }
    const format = parseExportFormat(req.query.format);
    const employee = (await getEmployeeById(req.user!.employeeId)) as any;
    const records = await repo.listForEmployee(
      req.user!.employeeId,
      month,
      year,
    );
    const rows = (records ?? []).map((record: any) => ({
      ...record,
      firstName: employee?.firstName ?? "",
      lastName: employee?.lastName ?? "",
      employeeCode: employee?.employeeCode ?? "",
      departmentName: employee?.departmentName ?? "",
    }));
    await sendAttendanceExport(
      res,
      rows,
      format,
      `attendance-${year ?? "current"}-${month ?? "month"}`,
    );
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get(
  "/export/team",
  isManagerOrAbove,
  async (req, res, next) => {
    try {
      const { role, employeeId } = req.user!;
      const date = typeof req.query.date === "string" ? req.query.date : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw AppError.badRequest("Invalid attendance date.");
      if (role === "MANAGER" && !employeeId)
        throw AppError.forbidden("Manager employee profile not found.");
      const format = parseExportFormat(req.query.format);
      const records = await repo.listForDate(
        date,
        role === "MANAGER" ? (employeeId ?? undefined) : undefined,
      );
      await sendAttendanceExport(
        res,
        records,
        format,
        `team-attendance-${date}`,
      );
    } catch (err) {
      next(err);
    }
  },
);

attendanceRouter.get(
  "/summary/today",
  isManagerOrAbove,
  async (_req, res, next) => {
    try {
      res.json(await repo.getTodaySummary());
    } catch (err) {
      next(err);
    }
  },
);

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
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid attendance date."),
  note: z
    .string()
    .trim()
    .min(3, "Please describe the reason for regularization.")
    .max(1000, "Regularization reason must not exceed 1000 characters."),
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
