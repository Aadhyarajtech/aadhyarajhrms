import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isManagerOrAbove } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import * as repo from "./attendance.repository";
import { askAttendanceAI } from "./attendance.askai";
import {getEmployeeAttendanceAnomalies,} from "./attendance.anomaly";
import {  generateAttendanceAnomalyInsights,} from "./attendance.ai";
import { getEmployeeById } from "../employees/employees.repository";
import {
  getAttendanceForecast,
} from "./attendance.forecast";
import { generateAttendanceForecastInsights } from "./attendance.forecast.ai";
import { getAttendancePatterns } from "./attendance.pattern";
import {analyzeAttendanceForRegularization,} from "./attendance.regularization.ai";
import { resolveAttendanceScope } from "./attendance.scope";

export const attendanceRouter = Router();

attendanceRouter.use(authenticate);

// ===========================================================================
// TODAY
// ===========================================================================

attendanceRouter.get("/today", async (req, res, next) => {
  try {
    if (!req.user!.employeeId) {
      return res.json({ record: null });
    }

    res.json({
      record: (await repo.getTodayRecord(req.user!.employeeId)) ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ===========================================================================
// CHECK IN
// ===========================================================================

attendanceRouter.post("/check-in", async (req, res, next) => {
  try {
    if (!req.user!.employeeId) {
      throw AppError.forbidden("Only employees can check in.");
    }

    res.json({
      record: await repo.checkIn(req.user!.employeeId),
    });
  } catch (err) {
    next(err);
  }
});

// ===========================================================================
// CHECK OUT
// ===========================================================================

attendanceRouter.post("/check-out", async (req, res, next) => {
  try {
    if (!req.user!.employeeId) {
      throw AppError.forbidden("Only employees can check out.");
    }

    const record = await repo.checkOut(req.user!.employeeId);

    if (!record) {
      throw AppError.badRequest(
        "You need to check in before you can check out.",
      );
    }

    res.json({ record });
  } catch (err) {
    next(err);
  }
});

// ===========================================================================
// MY ATTENDANCE
// ===========================================================================

attendanceRouter.get("/me", async (req, res, next) => {
  try {
    const month = req.query.month ? Number(req.query.month) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;

    res.json({
      records: await repo.listForEmployee(
        req.user!.employeeId!,
        month,
        year,
      ),
    });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get("/ai-anomalies", async (req, res, next) => {
  try {
    const month = req.query.month
      ? Number(req.query.month)
      : undefined;

    const year = req.query.year
      ? Number(req.query.year)
      : undefined;

    if (
      month !== undefined &&
      (!Number.isInteger(month) || month < 1 || month > 12)
    ) {
      throw AppError.badRequest("Invalid month.");
    }

    if (
      year !== undefined &&
      (!Number.isInteger(year) || year < 2000 || year > 2100)
    ) {
      throw AppError.badRequest("Invalid year.");
    }

    const requestedEmployeeId =
      typeof req.query.employeeId === "string"
        ? req.query.employeeId
        : undefined;

    console.log("AI ANOMALY REQUEST:", {
      month,
      year,
      requestedEmployeeId,
    });

    // Resolve the correct attendance scope
    const scope = await resolveAttendanceScope(
      {
        userId: req.user!.userId,
        employeeId: req.user!.employeeId,
        role: req.user!.role,
      },
      requestedEmployeeId,
    );

    // Generate anomaly results for every employee in the scope
    const anomalyResults = [];

    for (const employeeId of scope.employeeIds) {
      const result = await getEmployeeAttendanceAnomalies(
        employeeId,
        month,
        year,
      );

      anomalyResults.push(result);
    }

    // Combine anomalies from all employees
    const anomalies = anomalyResults.flatMap(
      (result: any) => result.anomalies ?? [],
    );

    // Build combined summary
    const summary = anomalies.reduce(
      (acc, anomaly) => {
        acc.total += 1;

        if (anomaly.severity === "HIGH") {
          acc.high += 1;
        } else if (anomaly.severity === "MEDIUM") {
          acc.medium += 1;
        } else {
          acc.low += 1;
        }

        return acc;
      },
      {
        total: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    );

    // Use the first result for the period
    const firstResult = anomalyResults[0];

    // Generate AI explanation from the first available result.
    // The deterministic anomaly detection remains the source of truth.
    let ai = {
      summary: "No significant attendance anomalies were detected.",
      recommendation:
        "Continue maintaining a consistent attendance pattern.",
    };

    if (firstResult) {
      ai = await generateAttendanceAnomalyInsights(firstResult);
    }

    res.json({
      period: firstResult?.period ?? {
        month: month ?? new Date().getMonth() + 1,
        year: year ?? new Date().getFullYear(),
        startDate: "",
        endDate: "",
      },
      anomalies,
      summary,
      ai,
      scope: {
        mode: scope.mode,
        employeeId: scope.employeeId,
        label: scope.label,
        employeeCount: scope.employeeIds.length,
      },
    });
  } catch (err) {
    next(err);
  }
});
attendanceRouter.get("/ai-forecast", async (req, res, next) => {
  try {
    const months = req.query.months
      ? Number(req.query.months)
      : 6;

    if (
      !Number.isInteger(months) ||
      months < 3 ||
      months > 12
    ) {
      throw AppError.badRequest(
        "Forecast history must be between 3 and 12 months.",
      );
    }

    const requestedEmployeeId =
      typeof req.query.employeeId === "string"
        ? req.query.employeeId
        : undefined;

    console.log("AI FORECAST REQUEST:", {
      months,
      requestedEmployeeId,
    });

    const scope = await resolveAttendanceScope(
      {
        userId: req.user!.userId,
        employeeId: req.user!.employeeId,
        role: req.user!.role,
      },
      requestedEmployeeId,
    );

    const forecastResults = [];

    for (const employeeId of scope.employeeIds) {
      const result = await getAttendanceForecast(
        employeeId,
        months,
      );

      forecastResults.push(result);
    }

    // -----------------------------------------------------------------------
    // No employees in scope
    // -----------------------------------------------------------------------

    if (forecastResults.length === 0) {
      return res.json({
        period: {
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
        },
        historicalData: [],
        forecast: {
          predictedAttendanceRate: 0,
          direction: "STABLE",
          confidence: "LOW",
        },
        summary: {
          averageAttendanceRate: 0,
          bestMonth: null,
          lowestMonth: null,
        },
        recommendation:
          "There is not enough attendance data to generate a reliable forecast.",
        scope: {
          mode: scope.mode,
          employeeId: scope.employeeId,
          label: scope.label,
          employeeCount: scope.employeeIds.length,
        },
      });
    }

    // -----------------------------------------------------------------------
    // Single employee
    //
    // Preserve the existing Forecast response exactly.
    // -----------------------------------------------------------------------

    if (forecastResults.length === 1) {
      return res.json({
        ...forecastResults[0],
        scope: {
          mode: scope.mode,
          employeeId: scope.employeeId,
          label: scope.label,
          employeeCount: scope.employeeIds.length,
        },
      });
    }

    // -----------------------------------------------------------------------
    // Overall / Team Forecast
    //
    // Aggregate the existing employee-level forecast results.
    // -----------------------------------------------------------------------

    const historicalMap = new Map<
      string,
      {
        totalRate: number;
        count: number;
        workingDays: number;
      }
    >();

    for (const result of forecastResults) {
      for (const item of result.historicalData) {
        const existing = historicalMap.get(item.month) ?? {
          totalRate: 0,
          count: 0,
          workingDays: 0,
        };

        existing.totalRate += item.attendanceRate;
        existing.count += 1;
        existing.workingDays += item.workingDays;

        historicalMap.set(item.month, existing);
      }
    }

    const historicalData = Array.from(
      historicalMap.entries(),
    ).map(([month, value]) => ({
      month,
      attendanceRate:
        value.count > 0
          ? Math.round(
              value.totalRate / value.count,
            )
          : 0,
      workingDays: value.workingDays,
    }));

    // -----------------------------------------------------------------------
    // Aggregate forecast
    // -----------------------------------------------------------------------

    const predictedAttendanceRate = Math.round(
      forecastResults.reduce(
        (sum, result) =>
          sum +
          result.forecast.predictedAttendanceRate,
        0,
      ) / forecastResults.length,
    );

    const improvingCount =
      forecastResults.filter(
        (result) =>
          result.forecast.direction === "IMPROVING",
      ).length;

    const decliningCount =
      forecastResults.filter(
        (result) =>
          result.forecast.direction === "DECLINING",
      ).length;

    let direction:
      | "IMPROVING"
      | "DECLINING"
      | "STABLE" = "STABLE";

    if (improvingCount > decliningCount) {
      direction = "IMPROVING";
    } else if (decliningCount > improvingCount) {
      direction = "DECLINING";
    }

    const highConfidenceCount =
      forecastResults.filter(
        (result) =>
          result.forecast.confidence === "HIGH",
      ).length;

    const mediumOrHighConfidenceCount =
      forecastResults.filter(
        (result) =>
          result.forecast.confidence === "HIGH" ||
          result.forecast.confidence === "MEDIUM",
      ).length;

    let confidence:
      | "HIGH"
      | "MEDIUM"
      | "LOW" = "LOW";

    if (
      highConfidenceCount ===
      forecastResults.length
    ) {
      confidence = "HIGH";
    } else if (
      mediumOrHighConfidenceCount >
      0
    ) {
      confidence = "MEDIUM";
    }

    // -----------------------------------------------------------------------
    // Best / lowest month
    // -----------------------------------------------------------------------

    const monthsWithData =
      historicalData.filter(
        (item) => item.workingDays > 0,
      );

    const best =
      [...monthsWithData].sort(
        (a, b) =>
          b.attendanceRate -
          a.attendanceRate,
      )[0];

    const lowest =
      [...monthsWithData].sort(
        (a, b) =>
          a.attendanceRate -
          b.attendanceRate,
      )[0];

    // -----------------------------------------------------------------------
    // Recommendation
    // -----------------------------------------------------------------------

    let recommendation =
      "Maintain the current attendance consistency across the team.";

    if (direction === "IMPROVING") {
      recommendation =
        "The overall attendance trend is improving. Continue maintaining this consistency.";
    }

    if (direction === "DECLINING") {
      recommendation =
        "The overall attendance trend is declining. Review recent attendance patterns and focus on improving consistency.";
    }

    if (predictedAttendanceRate < 75) {
      recommendation =
        "The forecast indicates lower attendance consistency. Review recent attendance patterns and focus on improving consistency.";
    }

    const firstResult = forecastResults[0];

    return res.json({
      period: firstResult.period,

      historicalData,

      forecast: {
        predictedAttendanceRate,
        direction,
        confidence,
      },

      summary: {
        averageAttendanceRate: Math.round(
          forecastResults.reduce(
            (sum, result) =>
              sum +
              result.summary.averageAttendanceRate,
            0,
          ) / forecastResults.length,
        ),

        bestMonth:
          best?.month ?? null,

        lowestMonth:
          lowest?.month ?? null,
      },

      recommendation,

      scope: {
        mode: scope.mode,
        employeeId: scope.employeeId,
        label: scope.label,
        employeeCount: scope.employeeIds.length,
      },
    });
  } catch (err) {
    next(err);
  }
});
// ===========================================================================
// AI ATTENDANCE PATTERN ANALYSIS
// ===========================================================================

attendanceRouter.get(
  "/ai-patterns",
  async (req, res, next) => {
    try {
      const months = req.query.months
        ? Number(req.query.months)
        : 6;

      if (
        !Number.isInteger(months) ||
        months < 3 ||
        months > 12
      ) {
        throw AppError.badRequest(
          "Months must be between 3 and 12.",
        );
      }

      const requestedEmployeeId =
        typeof req.query.employeeId === "string"
          ? req.query.employeeId
          : undefined;

      console.log("AI PATTERN REQUEST:", {
        months,
        requestedEmployeeId,
      });

      // ---------------------------------------------------------------------
      // Resolve the correct attendance scope
      //
      // SUPER_ADMIN / HR_ADMIN:
      //   no employee -> All Employees
      //   employee     -> selected employee
      //
      // MANAGER:
      //   no employee -> My Team
      //   employee     -> selected team employee
      //
      // EMPLOYEE:
      //   own attendance only
      // ---------------------------------------------------------------------

      const scope = await resolveAttendanceScope(
        {
          userId: req.user!.userId,
          employeeId: req.user!.employeeId,
          role: req.user!.role,
        },
        requestedEmployeeId,
      );

      // ---------------------------------------------------------------------
      // Generate pattern analysis for every employee in scope
      // ---------------------------------------------------------------------

      const patternResults = await Promise.all(
  scope.employeeIds.map((employeeId) =>
    getAttendancePatterns(employeeId, months)
  )
);
      // ---------------------------------------------------------------------
      // No employees in scope
      // ---------------------------------------------------------------------

      if (patternResults.length === 0) {
        return res.json({
          period: {
            start: "",
            end: new Date()
              .toISOString()
              .slice(0, 10),
            months,
          },

          summary: {
            attendanceRate: 0,
            recent30DayRate: 0,
            strongestDay: null,
            weakestDay: null,
          },

          weekdayAnalysis: [],
          
          variations: {
            attendancePercentagePoints: 0,
            checkInMinutes: 0,
            workHours: 0,
          },

          patterns: [],

          recommendations: [
            "No attendance data is available for the selected scope.",
          ],

          scope: {
            mode: scope.mode,
            employeeId: scope.employeeId,
            label: scope.label,
            employeeCount:
              scope.employeeIds.length,
          },
        });
      }

      // ---------------------------------------------------------------------
      // Single employee
      //
      // Preserve the existing service response.
      // ---------------------------------------------------------------------

      if (patternResults.length === 1) {
        return res.json({
          ...patternResults[0],

          scope: {
            mode: scope.mode,
            employeeId: scope.employeeId,
            label: scope.label,
            employeeCount:
              scope.employeeIds.length,
          },
        });
      }

      // ---------------------------------------------------------------------
      // Overall / Team aggregation
      // ---------------------------------------------------------------------

      const weekdays = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ];

      const weekdayAnalysis =
        weekdays.map((day) => {
          const dayResults =
            patternResults
              .map((result) =>
                result.weekdayAnalysis.find(
                  (item) => item.day === day,
                ),
              )
              .filter(Boolean);

          const totalDays =
            dayResults.reduce(
              (sum, item) =>
                sum + item!.totalDays,
              0,
            );

          const attendedEquivalent =
            dayResults.reduce(
              (sum, item) =>
                sum +
                item!.attendedEquivalent,
              0,
            );

          const checkInValues =
            dayResults
              .filter(
                (item) =>
                  item!.averageCheckInMinutes !==
                  null,
              )
              .map(
                (item) =>
                  item!.averageCheckInMinutes!,
              );

          const workHourValues =
            dayResults
              .filter(
                (item) =>
                  item!.averageWorkHours !==
                  null,
              )
              .map(
                (item) =>
                  item!.averageWorkHours!,
              );

          return {
            day,
            totalDays,
            attendedEquivalent,

            attendanceRate:
              totalDays > 0
                ? Math.round(
                    (attendedEquivalent /
                      totalDays) *
                      100,
                  )
                : 0,

            averageCheckInMinutes:
              checkInValues.length > 0
                ? Math.round(
                    checkInValues.reduce(
                      (sum, value) =>
                        sum + value,
                      0,
                    ) /
                      checkInValues.length,
                  )
                : null,

            averageWorkHours:
              workHourValues.length > 0
                ? Math.round(
                    (workHourValues.reduce(
                      (sum, value) =>
                        sum + value,
                      0,
                    ) /
                      workHourValues.length) *
                      100,
                  ) / 100
                : null,
          };
        });

      // ---------------------------------------------------------------------
      // Overall attendance
      // ---------------------------------------------------------------------

      const totalDays =
        weekdayAnalysis.reduce(
          (sum, item) =>
            sum + item.totalDays,
          0,
        );

      const totalAttendedEquivalent =
        weekdayAnalysis.reduce(
          (sum, item) =>
            sum +
            item.attendedEquivalent,
          0,
        );

      const attendanceRate =
        totalDays > 0
          ? Math.round(
              (totalAttendedEquivalent /
                totalDays) *
                100,
            )
          : 0;

      // ---------------------------------------------------------------------
      // Recent 30-day attendance
      // ---------------------------------------------------------------------

      const recent30DayRate =
        Math.round(
          patternResults.reduce(
            (sum, result) =>
              sum +
              result.summary.recent30DayRate,
            0,
          ) /
            patternResults.length,
        );

      // ---------------------------------------------------------------------
      // Strongest / weakest day
      // ---------------------------------------------------------------------

      const activeWeekdays =
        weekdayAnalysis.filter(
          (item) =>
            item.totalDays > 0,
        );

      const strongestDay =
        activeWeekdays.length > 0
          ? [...activeWeekdays].sort(
              (a, b) =>
                b.attendanceRate -
                a.attendanceRate,
            )[0].day
          : null;

      const weakestDay =
        activeWeekdays.length > 0
          ? [...activeWeekdays].sort(
              (a, b) =>
                a.attendanceRate -
                b.attendanceRate,
            )[0].day
          : null;

      // ---------------------------------------------------------------------
      // Overall variations
      // ---------------------------------------------------------------------

      const attendanceRates =
        activeWeekdays.map(
          (item) =>
            item.attendanceRate,
        );

      const attendanceVariation =
        attendanceRates.length > 0
          ? Math.max(
              ...attendanceRates,
            ) -
            Math.min(
              ...attendanceRates,
            )
          : 0;

      const checkInValues =
        activeWeekdays
          .filter(
            (item) =>
              item.averageCheckInMinutes !==
              null,
          )
          .map(
            (item) =>
              item.averageCheckInMinutes!,
          );

      const checkInVariation =
        checkInValues.length > 0
          ? Math.max(
              ...checkInValues,
            ) -
            Math.min(
              ...checkInValues,
            )
          : 0;

      const workHourValues =
        activeWeekdays
          .filter(
            (item) =>
              item.averageWorkHours !==
              null,
          )
          .map(
            (item) =>
              item.averageWorkHours!,
          );

      const workHourVariation =
        workHourValues.length > 0
          ? Math.max(
              ...workHourValues,
            ) -
            Math.min(
              ...workHourValues,
            )
          : 0;

      // ---------------------------------------------------------------------
      // Aggregate detected patterns
      // ---------------------------------------------------------------------

      const patterns = patternResults
        .flatMap(
          (result) =>
            result.patterns,
        )
        .filter(
          (pattern, index, array) =>
            index ===
            array.findIndex(
              (item) =>
                item.title ===
                pattern.title,
            ),
        );

      // ---------------------------------------------------------------------
      // Aggregate recommendations
      // ---------------------------------------------------------------------

      const recommendations =
        patternResults
          .flatMap(
            (result) =>
              result.recommendations,
          )
          .filter(
            (recommendation, index, array) =>
              index ===
              array.indexOf(
                recommendation,
              ),
          )
          .slice(0, 5);

      if (
        recommendations.length === 0
      ) {
        recommendations.push(
          "Attendance patterns are relatively consistent across the selected scope.",
        );
      }

      // ---------------------------------------------------------------------
      // Return
      // ---------------------------------------------------------------------

      const firstResult =
        patternResults[0];

      return res.json({
        period: firstResult.period,

        summary: {
          attendanceRate,
          recent30DayRate,
          strongestDay,
          weakestDay,
        },

        weekdayAnalysis,

        variations: {
          attendancePercentagePoints:
            attendanceVariation,

          checkInMinutes:
            checkInVariation,

          workHours:
            Math.round(
              workHourVariation *
                100,
            ) / 100,
        },

        patterns,

        recommendations,

        scope: {
          mode: scope.mode,
          employeeId: scope.employeeId,
          label: scope.label,
          employeeCount:
            scope.employeeIds.length,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ===========================================================================
// EMPLOYEE ATTENDANCE
// ===========================================================================

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
        (!Number.isInteger(year) || year < 2000)
      ) {
        throw AppError.badRequest("Invalid attendance year.");
      }

      res.json({
        records: await repo.listForEmployee(
          req.params.employeeId,
          month,
          year,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ===========================================================================
// ATTENDANCE BY DATE
// ===========================================================================

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

// ===========================================================================
// TODAY SUMMARY
// ===========================================================================

attendanceRouter.get("/summary/today", async (_req, res, next) => {
  try {
    res.json(await repo.getTodaySummary());
  } catch (err) {
    next(err);
  }
});

// ===========================================================================
// ATTENDANCE TREND
// ===========================================================================

attendanceRouter.get(
  "/analytics/trend",
  isManagerOrAbove,
  async (req, res, next) => {
    try {
      const months = req.query.months
        ? Number(req.query.months)
        : 6;

      if (
        !Number.isInteger(months) ||
        months < 1 ||
        months > 24
      ) {
        throw AppError.badRequest(
          "Months must be an integer between 1 and 24.",
        );
      }

      const { role, employeeId } = req.user!;

      const managerId =
        role === "MANAGER" && employeeId
          ? employeeId
          : undefined;

      res.json({
        data: await repo.getMonthlyAttendanceTrend(
          months,
          managerId,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ===========================================================================
// REGULARIZATION SCHEMAS
// ===========================================================================

const regularizationSchema = z.object({
  date: z.string(),
  note: z
    .string()
    .min(3, "Please describe the reason for regularization."),
});

const regularizationDecisionSchema = z.object({
  decisionNote: z
    .string()
    .trim()
    .max(1000, "Decision note must not exceed 1000 characters.")
    .optional()
    .default(""),
});

// ===========================================================================
// TEAM REGULARIZATION REQUESTS
// ===========================================================================

attendanceRouter.get(
  "/regularization/team",
  isManagerOrAbove,
  async (req, res, next) => {
    try {
      const { role, employeeId } = req.user!;

      const allowedRoles = [
        "MANAGER",
        "HR_ADMIN",
        "SUPER_ADMIN",
      ];

      if (!allowedRoles.includes(role)) {
        throw AppError.forbidden(
          "You are not authorized to review regularization requests.",
        );
      }

      const status =
        typeof req.query.status === "string"
          ? req.query.status.toUpperCase()
          : undefined;

      if (
        status &&
        ![
          "PENDING",
          "APPROVED",
          "REJECTED",
          "CANCELLED",
        ].includes(status)
      ) {
        throw AppError.badRequest(
          "Invalid regularization request status.",
        );
      }

      // ---------------------------------------------------------------------
      // Manager
      // -> only their direct reports
      //
      // HR_ADMIN / SUPER_ADMIN
      // -> all employees
      // ---------------------------------------------------------------------

      const includeAll =
        role === "HR_ADMIN" ||
        role === "SUPER_ADMIN";

      if (!includeAll && !employeeId) {
        throw AppError.forbidden(
          "Manager employee profile not found.",
        );
      }

      res.json({
        requests:
          await repo.listTeamRegularizationRequests(
            employeeId ?? "",
            status,
            includeAll,
          ),
      });
    } catch (err) {
      next(err);
    }
  },
);
// ===========================================================================
// APPROVE REGULARIZATION
// ===========================================================================

attendanceRouter.post(
  "/regularization/:requestId/approve",
  isManagerOrAbove,
  validate(regularizationDecisionSchema),
  async (req, res, next) => {
    try {
      const { role, employeeId } = req.user!;

      const allowedRoles = [
        "MANAGER",
        "HR_ADMIN",
        "SUPER_ADMIN",
      ];

      if (!allowedRoles.includes(role)) {
        throw AppError.forbidden(
          "You are not authorized to approve regularization requests.",
        );
      }

      if (!employeeId) {
        throw AppError.forbidden(
          "Approver employee profile not found.",
        );
      }

      const { decisionNote } = req.body as z.infer<
        typeof regularizationDecisionSchema
      >;

      const includeAll =
        role === "HR_ADMIN" ||
        role === "SUPER_ADMIN";

      res.json({
        result: await repo.approveRegularization(
          req.params.requestId,
          employeeId,
          decisionNote,
          includeAll,
        ),
        message:
          "Attendance regularization approved successfully.",
      });
    } catch (err) {
      next(err);
    }
  },
);
// ===========================================================================
// REJECT REGULARIZATION
// ===========================================================================

attendanceRouter.post(
  "/regularization/:requestId/reject",
  isManagerOrAbove,
  validate(
    regularizationDecisionSchema.extend({
      decisionNote: z
        .string()
        .trim()
        .min(3, "Please provide a rejection reason.")
        .max(
          1000,
          "Decision note must not exceed 1000 characters.",
        ),
    }),
  ),
  async (req, res, next) => {
    try {
      const { role, employeeId } = req.user!;

      const allowedRoles = [
        "MANAGER",
        "HR_ADMIN",
        "SUPER_ADMIN",
      ];

      if (!allowedRoles.includes(role)) {
        throw AppError.forbidden(
          "You are not authorized to reject regularization requests.",
        );
      }

      if (!employeeId) {
        throw AppError.forbidden(
          "Approver employee profile not found.",
        );
      }

      const { decisionNote } = req.body as {
        decisionNote: string;
      };

      const includeAll =
        role === "HR_ADMIN" ||
        role === "SUPER_ADMIN";

      res.json({
        request: await repo.rejectRegularization(
          req.params.requestId,
          employeeId,
          decisionNote,
          includeAll,
        ),
        message:
          "Attendance regularization rejected successfully.",
      });
    } catch (err) {
      next(err);
    }
  },
);
// ===========================================================================
// SMART REGULARIZATION ASSISTANT
// ===========================================================================

attendanceRouter.get(
  "/smart-regularization",
  async (req, res, next) => {
    try {
      const requestedEmployeeId =
        typeof req.query.employeeId === "string"
          ? req.query.employeeId
          : undefined;

      const date =
        typeof req.query.date === "string"
          ? req.query.date
          : "";

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw AppError.badRequest(
          "Invalid attendance date.",
        );
      }

      const scope = await resolveAttendanceScope(
        {
          userId: req.user!.userId,
          employeeId: req.user!.employeeId,
          role: req.user!.role,
        },
        requestedEmployeeId,
      );

      // Smart Regularization is date-specific,
      // so it can only analyze one employee at a time.
      if (scope.employeeIds.length !== 1) {
        throw AppError.badRequest(
          "Please select a specific employee for Smart Regularization.",
        );
      }

      const result =
        await analyzeAttendanceForRegularization(
          scope.employeeIds[0],
          date,
        );

      return res.json({
        ...result,
        scope: {
          mode: scope.mode,
          employeeId: scope.employeeId,
          label: scope.label,
          employeeCount: scope.employeeIds.length,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
// ===========================================================================
// REQUEST REGULARIZATION
// ===========================================================================

attendanceRouter.post(
  "/regularize",
  validate(regularizationSchema),
  async (req, res, next) => {
    try {
      if (!req.user!.employeeId) {
        throw AppError.forbidden(
          "Employee profile not found.",
        );
      }

      const { date, note } = req.body as z.infer<
        typeof regularizationSchema
      >;

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

// ===========================================================================
// AI ATTENDANCE INSIGHTS
// ===========================================================================
//
// Example:
// GET /api/attendance/ai-insights
//     ?startDate=2026-09-04
//     &endDate=2026-09-04
//
// Example for a range:
// GET /api/attendance/ai-insights
//     ?startDate=2026-09-01
//     &endDate=2026-09-04
//
// The attendance scope is resolved from the authenticated user
// and the optional employeeId selected by an authorized manager/admin.
// ===========================================================================
attendanceRouter.get("/ai-insights", async (req, res, next) => {
  try {
    const startDate = String(req.query.startDate || "");
    const endDate = String(req.query.endDate || "");

    if (!startDate || !endDate) {
      throw AppError.badRequest(
        "startDate and endDate are required",
      );
    }

    const requestedEmployeeId =
      typeof req.query.employeeId === "string"
        ? req.query.employeeId
        : undefined;
    console.log("AI INSIGHTS REQUEST:", {
      startDate,
      endDate,
      requestedEmployeeId,
    });
    const scope = await resolveAttendanceScope(
      {
        userId: req.user!.userId,
        employeeId: req.user!.employeeId,
        role: req.user!.role,
      },
      requestedEmployeeId,
    );

    const insights =
      await repo.getAiAttendanceInsightsForEmployees(
        scope.employeeIds,
        startDate,
        endDate,
      );

   res.json({
  insights,
  scope: {
    mode: scope.mode,
    employeeId: scope.employeeId,
    label: scope.label,
    employeeCount: scope.employeeIds.length,
  },
});
  } catch (error) {
    next(error);
  }
});
// ===========================================================================
// ASK AI
// ===========================================================================

const askAISchema = z.object({
  question: z
    .string()
    .trim()
    .min(2, "Please enter a question.")
    .max(500, "Question must not exceed 500 characters."),

  employeeId: z
    .string()
    .trim()
    .optional(),
});

attendanceRouter.post(
  "/ask-ai",
  validate(askAISchema),
  async (req, res, next) => {
    try {
      const {
        question,
        employeeId: requestedEmployeeId,
      } = req.body as z.infer<
        typeof askAISchema
      >;

      // ---------------------------------------------------------------------
      // Resolve attendance scope
      //
      // If an employee is selected:
      //   -> selected employee
      //
      // If no employee is selected:
      //   SUPER_ADMIN / HR_ADMIN -> All Employees
      //   MANAGER                 -> My Team
      //   EMPLOYEE                -> Own attendance
      // ---------------------------------------------------------------------

      const scope = await resolveAttendanceScope(
        {
          userId: req.user!.userId,
          employeeId: req.user!.employeeId,
          role: req.user!.role,
        },
        requestedEmployeeId,
      );

      const result = await askAttendanceAI(
        scope.employeeIds,
        question,
      );

      return res.json({
        answer: result.answer,

        scope: {
          mode: scope.mode,
          employeeId: scope.employeeId,
          label: scope.label,
          employeeCount:
            scope.employeeIds.length,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);