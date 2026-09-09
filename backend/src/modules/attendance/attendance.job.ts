/**
 * Attendance automatic-processing jobs.
 *
 * Responsibilities:
 * - create non-working-day / approved-leave records without overwriting punches;
 * - finalize missing punches for completed working days as ABSENT;
 * - expire old Comp-Off credits;
 * - convert finalized overtime into Comp-Off credits exactly once;
 * - run safely on an IST cron schedule and after application restarts.
 */

import cron from "node-cron";
import {
  Attendance,
  Employee,
  Holiday,
  LeaveRequest,
  Shift,
} from "@/db/models";
import { logger } from "@/utils/logger";
import { notify } from "@/modules/notifications/notifications.repository";
import { creditCompOff, expireCompOffs } from "./compOff.repository";
import { isValidDateString, isWeekendDate } from "./attendance.policy";

const ATTENDANCE_TIMEZONE = "Asia/Kolkata";
const COMP_OFF_EXPIRY_DAYS = 30;

/** Returns the HRMS business date in India (YYYY-MM-DD). */
export function localDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ATTENDANCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function previousCompletedBusinessDate(date: string): Promise<string> {
  if (!isValidDateString(date)) {
    throw new Error(`Invalid attendance date: ${date}`);
  }

  const value = new Date(`${date}T00:00:00.000Z`);
  do {
    value.setUTCDate(value.getUTCDate() - 1);
  } while (
    isWeekendDate(value.toISOString().slice(0, 10)) ||
    (await Holiday.exists({ date: value.toISOString().slice(0, 10) }))
  );

  return value.toISOString().slice(0, 10);
}

async function hasApprovedLeave(
  employeeId: string,
  date: string,
): Promise<boolean> {
  const leave = await LeaveRequest.findOne({
    employeeId,
    startDate: { $lte: date },
    endDate: { $gte: date },
    status: "APPROVED",
  })
    .select("_id")
    .lean();

  return Boolean(leave);
}

async function attendanceExists(
  employeeId: string,
  date: string,
): Promise<boolean> {
  const existing = await Attendance.findOne({ employeeId, date })
    .select("_id")
    .lean();
  return Boolean(existing);
}

async function createIfMissing(
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    await Attendance.create(data);
    return true;
  } catch (error) {
    // The attendance model has a unique employeeId/date index. A concurrent
    // request/job may create the same row after our existence check; that is
    // safe and must not make the scheduled job fail.
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000,
  );
}

/**
 * Creates records for holidays, weekly offs and approved leave only.
 * Working-day absence is deliberately handled by the end-of-day job.
 */
export async function processMissingAttendance(date: string): Promise<void> {
  if (!isValidDateString(date))
    throw new Error(`Invalid attendance date: ${date}`);

  const employees = await Employee.find({
    status: "ACTIVE",
    isArchived: { $ne: true },
  })
    .select("_id shiftId")
    .lean();

  if (!employees.length) return;

  const holiday = await Holiday.findOne({ date }).lean();
  const weekend = isWeekendDate(date);
  const now = new Date().toISOString();

  const shiftIds = Array.from(
    new Set(
      employees
        .map((employee) => employee.shiftId)
        .filter((shiftId): shiftId is string => Boolean(shiftId)),
    ),
  );
  const shifts = shiftIds.length
    ? await Shift.find({ _id: { $in: shiftIds }, isActive: true })
        .select("_id")
        .lean()
    : [];
  const activeShiftIds = new Set(shifts.map((shift) => String(shift._id)));

  for (const employee of employees) {
    const shiftId =
      employee.shiftId && activeShiftIds.has(String(employee.shiftId))
        ? employee.shiftId
        : null;
    if (await attendanceExists(employee._id, date)) continue;

    if (holiday || weekend) {
      await createIfMissing({
        employeeId: employee._id,
        date,
        shiftId,
        checkIn: null,
        checkOut: null,
        status: holiday ? "HOLIDAY" : "WEEKEND",
        workHours: 0,
        effectiveWorkHours: 0,
        breakMinutes: 0,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeHours: 0,
        isRegularized: false,
        compOffCredited: false,
        note: holiday ? `Public holiday: ${holiday.name}` : "Weekly off",
        auditTrail: [],
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    if (await hasApprovedLeave(employee._id, date)) {
      await createIfMissing({
        employeeId: employee._id,
        date,
        shiftId,
        checkIn: null,
        checkOut: null,
        status: "ON_LEAVE",
        workHours: 0,
        effectiveWorkHours: 0,
        breakMinutes: 0,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeHours: 0,
        isRegularized: false,
        compOffCredited: false,
        note: "Approved leave",
        auditTrail: [],
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

/**
 * Finalizes a completed working day. Existing records are never overwritten,
 * so a late/manual punch or regularization remains intact.
 */
export async function processCompletedWorkingDay(date: string): Promise<void> {
  if (!isValidDateString(date))
    throw new Error(`Invalid attendance date: ${date}`);
  if (isWeekendDate(date) || (await Holiday.exists({ date }))) return;

  const employees = await Employee.find({
    status: "ACTIVE",
    isArchived: { $ne: true },
  })
    .select("_id shiftId")
    .lean();

  if (!employees.length) return;

  const now = new Date().toISOString();

  for (const employee of employees) {
    if (await attendanceExists(employee._id, date)) continue;
    if (await hasApprovedLeave(employee._id, date)) continue;

    await createIfMissing({
      employeeId: employee._id,
      date,
      shiftId: employee.shiftId ?? null,
      checkIn: null,
      checkOut: null,
      status: "ABSENT",
      workHours: 0,
      effectiveWorkHours: 0,
      breakMinutes: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      overtimeHours: 0,
      isRegularized: false,
      compOffCredited: false,
      note: "No check-in recorded",
      auditTrail: [],
      createdAt: now,
      updatedAt: now,
    });
  }
}

/** Credits overtime recorded on finalized attendance rows as Comp-Off. */
export async function processCompOff(date?: string): Promise<void> {
  await expireCompOffs();

  const query: Record<string, unknown> = {
    checkIn: { $ne: null },
    checkOut: { $ne: null },
    overtimeHours: { $gt: 0 },
    compOffCredited: { $ne: true },
  };

  if (date !== undefined) {
    if (!isValidDateString(date))
      throw new Error(`Invalid attendance date: ${date}`);
    query.date = date;
  }

  const rows = await Attendance.find(query).lean();
  if (!rows.length) return;

  for (const row of rows) {
    const overtimeHours = Number(row.overtimeHours || 0);
    if (!Number.isFinite(overtimeHours) || overtimeHours <= 0) continue;

    try {
      await creditCompOff({
        employeeId: row.employeeId,
        attendanceId: row._id,
        earnedHours: overtimeHours,
        earnedDate: row.date,
        expiryDays: COMP_OFF_EXPIRY_DAYS,
        note: "Comp-Off earned from recorded overtime.",
      });

      const creditedAt = new Date().toISOString();
      const employee = await Employee.findById(row.employeeId)
        .select("userId")
        .lean();

      const updateResult = await Attendance.updateOne(
        { _id: row._id, compOffCredited: { $ne: true } },
        {
          $set: {
            compOffCredited: true,
            updatedAt: creditedAt,
          },
          $push: {
            auditTrail: {
              action: "OVERTIME_CREDITED",
              actorId: "SYSTEM",
              actorRole: "SUPER_ADMIN",
              at: creditedAt,
              note: `Overtime ${overtimeHours} hour(s) credited as Comp-Off.`,
            },
          },
        },
      );

      if (updateResult.matchedCount > 0 && employee?.userId) {
        try {
          await notify({
            userId: employee.userId,
            type: "ATTENDANCE_COMP_OFF",
            title: "Comp-Off credited",
            message: `${overtimeHours} hour(s) of overtime from ${row.date} have been credited as Comp-Off. Comp-Off expires after ${COMP_OFF_EXPIRY_DAYS} days.`,
            link: "/attendance",
          });
        } catch (notificationError) {
          logger.error("[Attendance] Failed to send Comp-Off notification", {
            attendanceId: row._id,
            employeeId: row.employeeId,
            message:
              notificationError instanceof Error
                ? notificationError.message
                : String(notificationError),
          });
        }
      }
    } catch (error) {
      logger.error("[Attendance] Failed to credit Comp-Off", {
        attendanceId: row._id,
        employeeId: row.employeeId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** Runs the date-finalization workflow for a completed day. */
export async function runAttendanceDailyProcessing(
  date = localDateString(),
): Promise<void> {
  const completedDate = await previousCompletedBusinessDate(date);
  await processCompletedWorkingDay(completedDate);
  await processCompOff(completedDate);
}

/** Runs the start-of-day preparation for the current business date. */
export async function runAttendanceMorningProcessing(
  date = localDateString(),
): Promise<void> {
  await processMissingAttendance(date);
  await processCompOff(await previousCompletedBusinessDate(date));
}

/**
 * Starts the Attendance scheduler.
 *
 * 00:05 IST: create today's holiday/weekly-off/approved-leave records.
 * 23:05 IST: finalize yesterday's missing attendance and credit its overtime.
 */
let attendanceJobsStarted = false;

export function startAttendanceJobs(): void {
  if (attendanceJobsStarted) {
    logger.warn("[Attendance] Automatic jobs are already scheduled.");
    return;
  }
  attendanceJobsStarted = true;

  cron.schedule(
    "5 0 * * *",
    async () => {
      try {
        await runAttendanceMorningProcessing();
        logger.info("[Attendance] Morning processing completed.");
      } catch (error) {
        logger.error("[Attendance] Morning processing failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    { timezone: ATTENDANCE_TIMEZONE },
  );

  cron.schedule(
    "5 23 * * *",
    async () => {
      try {
        await runAttendanceDailyProcessing();
        logger.info("[Attendance] Daily finalization completed.");
      } catch (error) {
        logger.error("[Attendance] Daily finalization failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    { timezone: ATTENDANCE_TIMEZONE },
  );

  logger.info("[Attendance] Automatic jobs scheduled for 00:05 and 23:05 IST.");
}
