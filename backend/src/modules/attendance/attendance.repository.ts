import {
  Attendance,
  AttendanceRegularizationRequest,
  PayrollRun,
  Employee,
  Department,
  Shift,
  User,
} from "@/db/models";
import { nowIso } from "@/db/connection";
import { AppError } from "@/utils/errors";
import { calculateAttendance } from "@/modules/attendance/attendance.policy";
import { notify } from "@/modules/notifications/notifications.repository";
import { sendRegularizationDecisionEmail } from "@/services/email.service";

type AttendanceApiRecord = Record<string, any> & { id: string };

const IST_TIME_ZONE = "Asia/Kolkata";

async function assertAttendancePeriodUnlocked(
  employeeId: string,
  date: string,
) {
  const [yearText, monthText] = date.split("-");
  const month = Number(monthText);
  const year = Number(yearText);
  if (!Number.isInteger(month) || !Number.isInteger(year)) return;
  const lockedRun = await PayrollRun.findOne({
    month,
    year,
    status: {
      $in: ["ATTENDANCE_LOCKED", "PROCESSED", "HR_REVIEW", "APPROVED", "PAID"],
    },
  })
    .select("_id")
    .lean();
  if (lockedRun)
    throw AppError.badRequest("Attendance is locked for this payroll period.");
}

function todayDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isValidDateString(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

function roundHours(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function toApiRecord(doc: any): AttendanceApiRecord | undefined {
  if (!doc) return undefined;
  const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const { _id, ...rest } = plain;
  return { id: _id, ...rest };
}

function getHoursBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return 0;
  }

  return roundHours((endMs - startMs) / 3_600_000);
}

function parseTimeToMinutes(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getLocalMinutes(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

async function getEmployeeShift(employeeId: string) {
  const employee = await Employee.findById(employeeId)
    .select("shiftId departmentId")
    .lean();

  if (!employee?.shiftId) return null;

  const shift = await Shift.findOne({
    _id: employee.shiftId,
    isActive: true,
  }).lean();

  if (!shift) return null;
  if (shift.departmentId && shift.departmentId !== employee.departmentId)
    return null;

  return shift;
}

function assertValidLocation(location?: {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
}) {
  if (!location) return;

  if (
    location.latitude !== undefined &&
    (!Number.isFinite(location.latitude) ||
      location.latitude < -90 ||
      location.latitude > 90)
  ) {
    throw new Error("Invalid latitude.");
  }

  if (
    location.longitude !== undefined &&
    (!Number.isFinite(location.longitude) ||
      location.longitude < -180 ||
      location.longitude > 180)
  ) {
    throw new Error("Invalid longitude.");
  }

  if (
    location.accuracy !== undefined &&
    (!Number.isFinite(location.accuracy) || location.accuracy < 0)
  ) {
    throw new Error("Invalid location accuracy.");
  }

  const hasLatitude = location.latitude !== undefined;
  const hasLongitude = location.longitude !== undefined;

  if (hasLatitude !== hasLongitude) {
    throw new Error("Latitude and longitude must be provided together.");
  }
}

function distanceInMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const earthRadius = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(latitude2 - latitude1);
  const dLon = toRadians(longitude2 - longitude1);
  const lat1 = toRadians(latitude1);
  const lat2 = toRadians(latitude2);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function assertWithinShiftGeofence(
  location: { latitude?: number; longitude?: number } | undefined,
  shift: any,
) {
  const geofence = shift?.geofence;
  if (!geofence) return;
  if (location?.latitude === undefined || location?.longitude === undefined) {
    throw new Error("Location is required for this shift.");
  }
  const geofenceLatitude = Number(geofence.latitude);
  const geofenceLongitude = Number(geofence.longitude);
  const radiusMeters = Number(geofence.radiusMeters);

  if (
    !Number.isFinite(geofenceLatitude) ||
    geofenceLatitude < -90 ||
    geofenceLatitude > 90 ||
    !Number.isFinite(geofenceLongitude) ||
    geofenceLongitude < -180 ||
    geofenceLongitude > 180 ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters <= 0
  ) {
    throw new Error("Invalid shift attendance geofence configuration.");
  }

  const distance = distanceInMeters(
    location.latitude,
    location.longitude,
    geofenceLatitude,
    geofenceLongitude,
  );
  if (distance > radiusMeters) {
    throw new Error("You are outside the allowed attendance location.");
  }
}

function getBreakMinutes(
  breaks: Array<{
    start: string;
    end: string | null;
    durationMinutes: number;
  }> = [],
): number {
  return Math.round(
    breaks.reduce((total, item) => {
      const startMs = new Date(item.start).getTime();
      const endMs = item.end ? new Date(item.end).getTime() : NaN;
      const duration =
        Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
          ? (endMs - startMs) / 60_000
          : Number(item.durationMinutes ?? 0);
      return total + Math.max(0, duration);
    }, 0),
  );
}

async function notifyAttendanceException(params: {
  employeeId: string;
  type: "ATTENDANCE_LATE" | "ATTENDANCE_EARLY_DEPARTURE" | "SYSTEM";
  title: string;
  message: string;
}): Promise<void> {
  const employee = await Employee.findById(params.employeeId)
    .select("userId managerId firstName lastName")
    .lean();
  if (!employee) return;

  const recipientIds = new Set<string>();
  if (employee.managerId) {
    const manager = await Employee.findById(employee.managerId)
      .select("userId")
      .lean();
    if (manager?.userId) recipientIds.add(String(manager.userId));
  }

  const hrUsers = await User.find({
    role: { $in: ["HR_ADMIN", "SUPER_ADMIN"] },
  })
    .select("_id")
    .lean();
  for (const user of hrUsers) recipientIds.add(String(user._id));

  if (recipientIds.size === 0) {
    console.error(
      "[Attendance] No manager/HR recipients found for attendance notification",
      {
        employeeId: params.employeeId,
        type: params.type,
      },
    );
    return;
  }

  await Promise.all(
    Array.from(recipientIds).map(async (userId) => {
      try {
        await notify({
          userId,
          type: params.type,
          title: params.title,
          message: params.message,
          link: "/attendance",
        });
      } catch (notificationError) {
        console.error("[Attendance] Failed to send attendance notification", {
          employeeId: params.employeeId,
          recipientUserId: userId,
          type: params.type,
          error:
            notificationError instanceof Error
              ? notificationError.message
              : notificationError,
        });
      }
    }),
  );
}

function calculateAttendanceMetrics(
  checkIn: string | null,
  checkOut: string | null,
  shift: any,
  breakMinutes = 0,
) {
  const calculation = calculateAttendance(checkIn, checkOut, breakMinutes, {
    shiftStart: String(shift?.startTime ?? "10:00"),
    shiftEnd: String(shift?.endTime ?? "19:00"),
    standardHours: Number(shift?.standardHours ?? 8),
    graceMinutes: Number(shift?.graceMinutes ?? 15),
    halfDayHours: Number(shift?.halfDayHours ?? 4),
    overtimeAfterHours: Number(
      shift?.overtimeAfterHours ?? shift?.standardHours ?? 8,
    ),
    breakMinutes: Number(shift?.breakMinutes ?? 60),
  });

  return {
    workHours: checkOut ? calculation.grossHours : null,
    effectiveWorkHours: checkOut ? calculation.effectiveHours : null,
    breakMinutes: Math.round(calculation.breakHours * 60),
    lateMinutes: calculation.lateMinutes,
    earlyDepartureMinutes: calculation.earlyDepartureMinutes,
    overtimeHours: calculation.overtimeHours,
    status: calculation.status,
  };
}

async function findOrCreateToday(employeeId: string) {
  const date = todayDateString();
  let attendance = await Attendance.findOne({ employeeId, date }).lean();

  if (!attendance) {
    const now = nowIso();
    const shift = await getEmployeeShift(employeeId);
    try {
      await Attendance.create({
        employeeId,
        date,
        shiftId: shift?._id ?? null,
        checkIn: null,
        checkOut: null,
        status: "PRESENT",
        workHours: null,
        effectiveWorkHours: null,
        breakMinutes: 0,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeHours: 0,
        checkInLatitude: null,
        checkInLongitude: null,
        checkInAccuracy: null,
        checkOutLatitude: null,
        checkOutLongitude: null,
        checkOutAccuracy: null,
        earlyDepartureReason: null,
        compOffCredited: false,
        isRegularized: false,
        note: null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }

    attendance = await Attendance.findOne({ employeeId, date }).lean();
  }

  return attendance;
}

export async function getTodayRecord(employeeId: string) {
  const row = await Attendance.findOne({
    employeeId,
    date: todayDateString(),
  }).lean();

  return toApiRecord(row);
}

export async function checkIn(
  employeeId: string,
  location?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  },
) {
  assertValidLocation(location);

  const employee = await Employee.findById(employeeId)
    .select("_id status")
    .lean();

  if (!employee) {
    throw new Error("Employee not found.");
  }

  if (employee.status === "INACTIVE") {
    throw new Error("Inactive employees cannot record attendance.");
  }

  await assertAttendancePeriodUnlocked(employeeId, todayDateString());
  const existing = await findOrCreateToday(employeeId);

  if (!existing) {
    throw new Error("Unable to create or load today's attendance record.");
  }

  if (existing.checkOut) {
    throw new Error("Today's attendance has already been checked out.");
  }

  if (!existing.checkIn) {
    const now = nowIso();
    const shift = await getEmployeeShift(employeeId);
    assertWithinShiftGeofence(location, shift);
    const metrics = calculateAttendanceMetrics(
      now,
      null,
      shift,
      existing?.breakMinutes ?? 0,
    );

    const updateResult = await Attendance.updateOne(
      { _id: existing._id, checkIn: null, checkOut: null },
      {
        $set: {
          checkIn: now,
          shiftId: shift?._id ?? existing.shiftId ?? null,
          status: metrics.status,
          lateMinutes: metrics.lateMinutes,
          checkInLatitude: location?.latitude ?? null,
          checkInLongitude: location?.longitude ?? null,
          checkInAccuracy: location?.accuracy ?? null,
          updatedAt: now,
        },
        $push: {
          auditTrail: {
            action: "CHECK_IN",
            actorId: employeeId,
            actorRole: "EMPLOYEE",
            at: now,
            note: null,
          },
        },
      },
    );

    if (updateResult.matchedCount === 0) {
      const latest = await getTodayRecord(employeeId);
      if (latest?.checkIn) return latest;
      throw new Error(
        "Attendance was updated by another request. Please try again.",
      );
    }

    if (metrics.lateMinutes > 0) {
      const localTime = new Intl.DateTimeFormat("en-IN", {
        timeZone: IST_TIME_ZONE,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(now));

      await notifyAttendanceException({
        employeeId,
        type: "ATTENDANCE_LATE",
        title: "Late arrival recorded",
        message: `Late arrival of ${metrics.lateMinutes} minute(s) was recorded at ${localTime}.`,
      });
    }
  }

  return getTodayRecord(employeeId);
}

export async function checkOut(
  employeeId: string,
  options?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    breakMinutes?: number;
    earlyDepartureReason?: string;
  },
) {
  assertValidLocation(options);

  const existing = await getTodayRecord(employeeId);
  await assertAttendancePeriodUnlocked(
    employeeId,
    existing?.date ?? todayDateString(),
  );
  if (!existing || !existing.checkIn) {
    throw new Error("Check-in is required before check-out.");
  }

  if (existing.checkOut) {
    return existing;
  }

  if ((existing.breaks ?? []).some((item: any) => !item.end)) {
    throw new Error("End the active break before checking out.");
  }

  const now = nowIso();
  const shift = await getEmployeeShift(employeeId);
  assertWithinShiftGeofence(options, shift);
  const breakMinutes = Math.max(
    0,
    Number(
      options?.breakMinutes ??
        existing.breakMinutes ??
        getBreakMinutes(existing.breaks ?? []),
    ),
  );
  const metrics = calculateAttendanceMetrics(
    existing.checkIn,
    now,
    shift,
    breakMinutes,
  );

  if (
    metrics.earlyDepartureMinutes > 0 &&
    !String(options?.earlyDepartureReason ?? "").trim()
  ) {
    throw AppError.badRequest("A reason is required for early departure.");
  }

  const updateResult = await Attendance.updateOne(
    { _id: existing.id, checkIn: { $ne: null }, checkOut: null },
    {
      $set: {
        checkOut: now,
        workHours: metrics.workHours,
        effectiveWorkHours: metrics.effectiveWorkHours,
        breakMinutes: metrics.breakMinutes,
        lateMinutes: metrics.lateMinutes,
        earlyDepartureMinutes: metrics.earlyDepartureMinutes,
        overtimeHours: metrics.overtimeHours,
        status: metrics.status,
        checkOutLatitude:
          options?.latitude ?? existing.checkOutLatitude ?? null,
        checkOutLongitude:
          options?.longitude ?? existing.checkOutLongitude ?? null,
        checkOutAccuracy:
          options?.accuracy ?? existing.checkOutAccuracy ?? null,
        earlyDepartureReason:
          metrics.earlyDepartureMinutes > 0
            ? String(options?.earlyDepartureReason).trim()
            : null,
        updatedAt: now,
      },
      $push: {
        auditTrail: {
          action: "CHECK_OUT",
          actorId: employeeId,
          actorRole: "EMPLOYEE",
          at: now,
          note:
            metrics.earlyDepartureMinutes > 0
              ? String(options?.earlyDepartureReason).trim()
              : null,
        },
      },
    },
  );

  if (updateResult.matchedCount === 0) {
    const latest = await getTodayRecord(employeeId);
    if (latest?.checkOut) return latest;
    throw new Error(
      "Attendance was updated by another request. Please try again.",
    );
  }

  if (metrics.earlyDepartureMinutes > 0) {
    const localTime = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIME_ZONE,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(now));
    await notifyAttendanceException({
      employeeId,
      type: "ATTENDANCE_EARLY_DEPARTURE",
      title: "Early departure recorded",
      message: `Early departure of ${metrics.earlyDepartureMinutes} minute(s) was recorded at ${localTime}. Reason: ${String(options?.earlyDepartureReason).trim()}`,
    });
  }

  if (metrics.overtimeHours > 0) {
    await notifyAttendanceException({
      employeeId,
      type: "SYSTEM",
      title: "Overtime threshold reached",
      message: `${metrics.overtimeHours} hour(s) of overtime were recorded for today.`,
    });
  }

  return getTodayRecord(employeeId);
}

export async function startBreak(employeeId: string) {
  await assertAttendancePeriodUnlocked(employeeId, todayDateString());
  const attendance = await Attendance.findOne({
    employeeId,
    date: todayDateString(),
  }).lean();

  if (!attendance?.checkIn) {
    throw new Error("Check-in is required before starting a break.");
  }
  if (attendance.checkOut) {
    throw new Error("Today's attendance has already been checked out.");
  }
  if ((attendance.breaks ?? []).some((item) => !item.end)) {
    throw new Error("A break is already in progress.");
  }

  const now = nowIso();
  const updateResult = await Attendance.updateOne(
    {
      _id: attendance._id,
      checkIn: { $ne: null },
      checkOut: null,
      breaks: { $not: { $elemMatch: { end: null } } },
    },
    {
      $push: {
        breaks: { start: now, end: null, durationMinutes: 0 },
        auditTrail: {
          action: "BREAK_RECORDED",
          actorId: employeeId,
          actorRole: "EMPLOYEE",
          at: now,
          note: "Break started.",
        },
      },
      $set: { updatedAt: now },
    },
  );

  if (updateResult.matchedCount === 0) {
    throw new Error(
      "A break was started or attendance was updated by another request.",
    );
  }

  return getTodayRecord(employeeId);
}

export async function endBreak(employeeId: string) {
  await assertAttendancePeriodUnlocked(employeeId, todayDateString());
  const attendance = await Attendance.findOne({
    employeeId,
    date: todayDateString(),
  }).lean();

  if (!attendance?.checkIn) {
    throw new Error("Check-in is required before ending a break.");
  }
  if (attendance.checkOut) {
    throw new Error("Today's attendance has already been checked out.");
  }

  const openIndex = (attendance.breaks ?? []).findIndex((item) => !item.end);
  if (openIndex < 0) throw new Error("No active break was found.");

  const openBreak = attendance.breaks[openIndex];
  const now = nowIso();
  const startMs = new Date(openBreak.start).getTime();
  const endMs = new Date(now).getTime();

  if (!Number.isFinite(startMs) || endMs <= startMs) {
    throw new Error("Invalid break timing.");
  }

  const durationMinutes = Math.round((endMs - startMs) / 60_000);
  const breaks = (attendance.breaks ?? []).map((item, index) =>
    index === openIndex ? { ...item, end: now, durationMinutes } : item,
  );
  const breakMinutes = getBreakMinutes(breaks);
  const shift = await getEmployeeShift(employeeId);
  const metrics = calculateAttendanceMetrics(
    attendance.checkIn,
    attendance.checkOut,
    shift,
    breakMinutes,
  );

  const updateResult = await Attendance.updateOne(
    {
      _id: attendance._id,
      checkIn: { $ne: null },
      checkOut: null,
      breaks: { $elemMatch: { end: null } },
    },
    {
      $set: {
        breaks,
        breakMinutes,
        workHours: metrics.workHours,
        effectiveWorkHours: metrics.effectiveWorkHours,
        overtimeHours: metrics.overtimeHours,
        lateMinutes: metrics.lateMinutes,
        earlyDepartureMinutes: metrics.earlyDepartureMinutes,
        status: metrics.status,
        updatedAt: now,
      },
      $push: {
        auditTrail: {
          action: "BREAK_RECORDED",
          actorId: employeeId,
          actorRole: "EMPLOYEE",
          at: now,
          note: `Break ended. Duration: ${durationMinutes} minute(s).`,
        },
      },
    },
  );

  if (updateResult.matchedCount === 0) {
    throw new Error(
      "The active break was already ended or attendance was updated.",
    );
  }

  return getTodayRecord(employeeId);
}

export async function getMonthlyEmployeeSummary(
  employeeId: string,
  month?: number,
  year?: number,
) {
  const rows = (await listForEmployee(employeeId, month, year)).filter(
    Boolean,
  ) as AttendanceApiRecord[];
  const summary = {
    totalDays: rows.length,
    presentDays: 0,
    absentDays: 0,
    leaveDays: 0,
    halfDays: 0,
    weekendDays: 0,
    holidayDays: 0,
    lateDays: 0,
    earlyDepartureDays: 0,
    overtimeHours: 0,
    totalWorkHours: 0,
    totalEffectiveWorkHours: 0,
    totalBreakMinutes: 0,
    regularizedDays: 0,
  };

  for (const row of rows) {
    if (
      ["PRESENT", "WORK_FROM_HOME", "LATE", "EARLY_DEPARTURE"].includes(
        row.status,
      )
    ) {
      summary.presentDays++;
    } else if (row.status === "ABSENT") summary.absentDays++;
    else if (row.status === "ON_LEAVE") summary.leaveDays++;
    else if (row.status === "HALF_DAY") summary.halfDays++;
    else if (row.status === "WEEKEND") summary.weekendDays++;
    else if (row.status === "HOLIDAY") summary.holidayDays++;

    if (Number(row.lateMinutes ?? 0) > 0) summary.lateDays++;
    if (Number(row.earlyDepartureMinutes ?? 0) > 0)
      summary.earlyDepartureDays++;
    if (row.isRegularized) summary.regularizedDays++;
    summary.overtimeHours += Number(row.overtimeHours ?? 0);
    summary.totalWorkHours += Number(row.workHours ?? 0);
    summary.totalEffectiveWorkHours += Number(row.effectiveWorkHours ?? 0);
    summary.totalBreakMinutes += Number(row.breakMinutes ?? 0);
  }

  summary.overtimeHours = roundHours(summary.overtimeHours);
  summary.totalWorkHours = roundHours(summary.totalWorkHours);
  summary.totalEffectiveWorkHours = roundHours(summary.totalEffectiveWorkHours);
  summary.totalBreakMinutes = Math.round(summary.totalBreakMinutes);
  return summary;
}

export async function getLateArrivalAnalytics(employeeId?: string, months = 6) {
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw new Error("Months must be an integer between 1 and 24.");
  }

  const query: Record<string, any> = {};
  if (employeeId) query.employeeId = employeeId;

  const rows = await Attendance.find(query)
    .select("employeeId date lateMinutes")
    .sort({ date: 1 })
    .lean();

  const nowParts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const currentYear = Number(
    nowParts.find((p) => p.type === "year")?.value ?? new Date().getFullYear(),
  );
  const currentMonth = Number(
    nowParts.find((p) => p.type === "month")?.value ??
      new Date().getMonth() + 1,
  );

  const buckets = new Map<
    string,
    { month: string; lateDays: number; lateMinutes: number }
  >();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(currentYear, currentMonth - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, {
      month: d.toLocaleString("en-IN", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      lateDays: 0,
      lateMinutes: 0,
    });
  }

  for (const row of rows) {
    const bucket = buckets.get(String(row.date).slice(0, 7));
    const lateMinutes = Number(row.lateMinutes ?? 0);
    if (bucket && lateMinutes > 0) {
      bucket.lateDays++;
      bucket.lateMinutes += lateMinutes;
    }
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    lateMinutes: Math.round(bucket.lateMinutes),
    averageLateMinutes: bucket.lateDays
      ? Math.round(bucket.lateMinutes / bucket.lateDays)
      : 0,
  }));
}

export async function listForEmployee(
  employeeId: string,
  month?: number,
  year?: number,
) {
  const now = new Date();
  const istParts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const currentYear = Number(
    istParts.find((part) => part.type === "year")?.value ?? now.getFullYear(),
  );
  const currentMonth = Number(
    istParts.find((part) => part.type === "month")?.value ?? now.getMonth() + 1,
  );

  const m = month ?? currentMonth;
  const y = year ?? currentYear;

  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error("Month must be between 1 and 12.");
  }
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw new Error("Invalid attendance year.");
  }

  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;
  const monthEndExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const rows = await Attendance.find({
    employeeId,
    date: { $gte: monthStart, $lt: monthEndExclusive },
  })
    .sort({ date: 1 })
    .lean();

  return rows.map(toApiRecord);
}

export async function listForDate(date: string, managerId?: string) {
  if (!isValidDateString(date)) {
    throw new Error("Invalid attendance date.");
  }

  let employeeIds: string[] | undefined;

  if (managerId) {
    const employees = await Employee.find({
      managerId,
      status: "ACTIVE",
    })
      .select("_id")
      .lean();

    employeeIds = employees.map((employee) => employee._id);

    if (employeeIds.length === 0) return [];
  }

  const query: Record<string, any> = { date };

  if (employeeIds) {
    query.employeeId = { $in: employeeIds };
  }

  const rows = await Attendance.find(query).sort({ checkIn: 1 }).lean();
  if (rows.length === 0) return [];

  const attendanceEmployeeIds = [...new Set(rows.map((r) => r.employeeId))];

  const employees = await Employee.find({
    _id: { $in: attendanceEmployeeIds },
  }).lean();

  const empMap = new Map(employees.map((e) => [e._id, e]));

  const departmentIds = [
    ...new Set(employees.map((e) => e.departmentId).filter(Boolean)),
  ];

  const departments = await Department.find({
    _id: { $in: departmentIds },
  }).lean();

  const deptMap = new Map(departments.map((d) => [d._id, d]));

  return rows.map((r) => {
    const emp = empMap.get(r.employeeId);
    const { _id, ...rest } = r;

    return {
      id: _id,
      ...rest,
      firstName: emp?.firstName ?? null,
      lastName: emp?.lastName ?? null,
      employeeCode: emp?.employeeCode ?? null,
      departmentName: emp
        ? (deptMap.get(emp.departmentId)?.name ?? null)
        : null,
    };
  });
}

export async function getTodaySummary() {
  const today = todayDateString();

  const [present, total] = await Promise.all([
    Attendance.countDocuments({
      date: today,
      status: {
        $in: [
          "PRESENT",
          "WORK_FROM_HOME",
          "HALF_DAY",
          "LATE",
          "EARLY_DEPARTURE",
        ],
      },
    }),
    Employee.countDocuments({ status: "ACTIVE" }),
  ]);

  return { present, total, date: today, isToday: true };
}

export async function requestRegularization(
  employeeId: string,
  date: string,
  note: string,
) {
  if (!isValidDateString(date)) {
    throw new Error("Invalid attendance date.");
  }

  const reason = note.trim();

  if (!reason) {
    throw new Error("Regularization reason is required.");
  }

  if (reason.length > 1000) {
    throw new Error("Regularization reason must not exceed 1000 characters.");
  }

  const existingPending = await AttendanceRegularizationRequest.findOne({
    employeeId,
    date,
    status: "PENDING",
  }).lean();

  if (existingPending) {
    throw new Error(
      "A regularization request is already pending for this date.",
    );
  }

  const attendance = await Attendance.findOne({ employeeId, date }).lean();

  const requestedCheckIn = attendance?.checkIn ?? null;
  const requestedCheckOut = attendance?.checkOut ?? null;
  const requestedStatus =
    attendance?.status &&
    ["PRESENT", "ABSENT", "HALF_DAY", "WORK_FROM_HOME", "ON_LEAVE"].includes(
      attendance.status,
    )
      ? attendance.status
      : "PRESENT";

  await assertAttendancePeriodUnlocked(employeeId, date);
  const now = nowIso();

  const request = await AttendanceRegularizationRequest.create({
    employeeId,
    attendanceId: attendance?._id ?? null,
    date,
    requestedCheckIn,
    requestedCheckOut,
    requestedStatus,
    reason,
    status: "PENDING",
    approverId: null,
    decisionNote: null,
    requestedAt: now,
    decidedAt: null,
    auditTrail: [
      {
        action: "REQUESTED",
        actorId: employeeId,
        actorRole: "EMPLOYEE",
        at: now,
        note: reason,
      },
    ],
  });

  return toApiRecord(request);
}

export async function listTeamRegularizationRequests(
  managerId: string,
  status?: string,
  includeAll = false,
) {
  const employees = await Employee.find(
    includeAll ? { status: "ACTIVE" } : { managerId, status: "ACTIVE" },
  )
    .select("_id firstName lastName employeeCode departmentId")
    .lean();

  if (employees.length === 0) return [];

  const employeeIds = employees.map((employee) => employee._id);
  const query: Record<string, any> = {
    employeeId: { $in: employeeIds },
  };

  if (status) {
    const allowedStatuses = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];

    if (!allowedStatuses.includes(status)) {
      throw new Error("Invalid regularization request status.");
    }

    query.status = status;
  }

  const requests = await AttendanceRegularizationRequest.find(query)
    .sort({ requestedAt: -1 })
    .lean();

  const employeeMap = new Map(
    employees.map((employee) => [employee._id, employee]),
  );

  return requests.map((request) => {
    const employee = employeeMap.get(request.employeeId);

    return {
      ...toApiRecord(request),
      firstName: employee?.firstName ?? null,
      lastName: employee?.lastName ?? null,
      employeeCode: employee?.employeeCode ?? null,
    };
  });
}

export async function approveRegularization(
  requestId: string,
  managerId: string,
  decisionNote = "",
  includeAll = false,
) {
  const request = await AttendanceRegularizationRequest.findOne({
    _id: requestId,
    status: "PENDING",
  }).lean();

  if (!request) {
    throw new Error("Pending regularization request not found.");
  }
  await assertAttendancePeriodUnlocked(request.employeeId, request.date);

  const employee = await Employee.findOne(
    includeAll
      ? { _id: request.employeeId, status: "ACTIVE" }
      : { _id: request.employeeId, managerId, status: "ACTIVE" },
  ).lean();

  if (!employee) {
    throw new Error(
      "You are not authorized to approve this regularization request.",
    );
  }

  const note = decisionNote.trim();
  if (note.length > 1000) {
    throw new Error("Decision note must not exceed 1000 characters.");
  }

  const now = nowIso();
  const shift = await getEmployeeShift(request.employeeId);

  const metrics = calculateAttendanceMetrics(
    request.requestedCheckIn,
    request.requestedCheckOut,
    shift,
    0,
  );

  const requestedStatus = request.requestedStatus;
  const approvedStatus =
    requestedStatus === "ABSENT" ||
    requestedStatus === "WORK_FROM_HOME" ||
    requestedStatus === "ON_LEAVE"
      ? requestedStatus
      : requestedStatus === "HALF_DAY"
        ? "HALF_DAY"
        : metrics.status;

  let attendance = request.attendanceId
    ? await Attendance.findOne({ _id: request.attendanceId }).lean()
    : await Attendance.findOne({
        employeeId: request.employeeId,
        date: request.date,
      }).lean();

  if (attendance) {
    await Attendance.updateOne(
      { _id: attendance._id },
      {
        $set: {
          checkIn: request.requestedCheckIn,
          checkOut: request.requestedCheckOut,
          shiftId: shift?._id ?? attendance.shiftId ?? null,
          status: approvedStatus,
          workHours: metrics.workHours,
          effectiveWorkHours: metrics.effectiveWorkHours,
          breakMinutes: metrics.breakMinutes,
          lateMinutes: metrics.lateMinutes,
          earlyDepartureMinutes: metrics.earlyDepartureMinutes,
          overtimeHours: metrics.overtimeHours,
          earlyDepartureReason:
            metrics.earlyDepartureMinutes > 0 ? request.reason : null,
          isRegularized: true,
          note: request.reason,
          updatedAt: now,
        },
        $push: {
          auditTrail: {
            action: "REGULARIZATION_APPROVED",
            actorId: managerId,
            actorRole: "MANAGER",
            at: now,
            note: note || request.reason,
          },
        },
      },
    );
  } else {
    await Attendance.create({
      employeeId: request.employeeId,
      date: request.date,
      shiftId: shift?._id ?? null,
      checkIn: request.requestedCheckIn,
      checkOut: request.requestedCheckOut,
      status: approvedStatus,
      workHours: metrics.workHours,
      effectiveWorkHours: metrics.effectiveWorkHours,
      breakMinutes: metrics.breakMinutes,
      lateMinutes: metrics.lateMinutes,
      earlyDepartureMinutes: metrics.earlyDepartureMinutes,
      overtimeHours: metrics.overtimeHours,
      checkInLatitude: null,
      checkInLongitude: null,
      checkInAccuracy: null,
      checkOutLatitude: null,
      checkOutLongitude: null,
      checkOutAccuracy: null,
      earlyDepartureReason:
        metrics.earlyDepartureMinutes > 0 ? request.reason : null,
      compOffCredited: false,
      isRegularized: true,
      note: request.reason,
      auditTrail: [
        {
          action: "REGULARIZATION_APPROVED",
          actorId: managerId,
          actorRole: "MANAGER",
          at: now,
          note: note || request.reason,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    attendance = await Attendance.findOne({
      employeeId: request.employeeId,
      date: request.date,
    }).lean();
  }

  const updatedRequest = await AttendanceRegularizationRequest.findOneAndUpdate(
    {
      _id: requestId,
      status: "PENDING",
    },
    {
      $set: {
        status: "APPROVED",
        approverId: managerId,
        decisionNote: note || null,
        decidedAt: now,
        approvedCheckIn: request.requestedCheckIn,
        approvedCheckOut: request.requestedCheckOut,
        approvedStatus,
        auditTrail: [
          ...(request.auditTrail ?? []),
          {
            action: "APPROVED",
            actorId: managerId,
            actorRole: "MANAGER",
            at: now,
            note: note || null,
          },
        ],
      },
    },
    { new: true },
  ).lean();

  if (!updatedRequest) {
    throw new Error("Regularization request was already processed.");
  }

  const employeeUser = await Employee.findById(updatedRequest.employeeId)
    .select("userId firstName lastName")
    .lean();

  if (employeeUser?.userId) {
    try {
      await notify({
        userId: employeeUser.userId,
        type: "ATTENDANCE_REGULARIZATION_DECISION",
        title: "Regularization Approved",
        message: `Your attendance regularization request for ${updatedRequest.date} has been approved.`,
        link: "/app/attendance",
      });
    } catch (error) {
      console.error(
        "[Regularization Notification] Failed to notify employee:",
        error,
      );
    }

    try {
      const employeeAccount = await User.findById(employeeUser.userId)
        .select("email")
        .lean();
      if (employeeAccount?.email) {
        void sendRegularizationDecisionEmail({
          to: employeeAccount.email,
          employeeName: `${employeeUser.firstName} ${employeeUser.lastName}`,
          date: updatedRequest.date,
          status: "APPROVED",
          decisionNote: updatedRequest.decisionNote,
        }).catch((error) =>
          console.error(
            "[Regularization Email] Failed to notify employee:",
            error,
          ),
        );
      }
    } catch (error) {
      console.error(
        "[Regularization Email] Failed to load employee email:",
        error,
      );
    }
  }

  return {
    request: toApiRecord(updatedRequest),
    attendance: toApiRecord(attendance),
  };
}

export async function rejectRegularization(
  requestId: string,
  managerId: string,
  decisionNote: string,
  includeAll = false,
) {
  const note = decisionNote.trim();

  if (!note) {
    throw new Error("A rejection reason is required.");
  }

  if (note.length > 1000) {
    throw new Error("Rejection reason must not exceed 1000 characters.");
  }

  const request = await AttendanceRegularizationRequest.findOne({
    _id: requestId,
    status: "PENDING",
  }).lean();

  if (!request) {
    throw new Error("Pending regularization request not found.");
  }
  await assertAttendancePeriodUnlocked(request.employeeId, request.date);

  const employee = await Employee.findOne(
    includeAll
      ? { _id: request.employeeId, status: "ACTIVE" }
      : { _id: request.employeeId, managerId, status: "ACTIVE" },
  ).lean();

  if (!employee) {
    throw new Error(
      "You are not authorized to reject this regularization request.",
    );
  }

  const now = nowIso();
  const updatedRequest = await AttendanceRegularizationRequest.findOneAndUpdate(
    {
      _id: requestId,
      status: "PENDING",
    },
    {
      $set: {
        status: "REJECTED",
        approverId: managerId,
        decisionNote: note,
        decidedAt: now,
        auditTrail: [
          ...(request.auditTrail ?? []),
          {
            action: "REJECTED",
            actorId: managerId,
            actorRole: "MANAGER",
            at: now,
            note,
          },
        ],
      },
    },
    { new: true },
  ).lean();

  if (!updatedRequest) {
    throw new Error("Regularization request was already processed.");
  }

  const employeeUser = await Employee.findById(updatedRequest.employeeId)
    .select("userId firstName lastName")
    .lean();

  if (employeeUser?.userId) {
    try {
      await notify({
        userId: employeeUser.userId,
        type: "ATTENDANCE_REGULARIZATION_DECISION",
        title: "Regularization Rejected",
        message: `Your attendance regularization request for ${updatedRequest.date} has been rejected.`,
        link: "/app/attendance",
      });
    } catch (error) {
      console.error(
        "[Regularization Notification] Failed to notify employee:",
        error,
      );
    }

    try {
      const employeeAccount = await User.findById(employeeUser.userId)
        .select("email")
        .lean();
      if (employeeAccount?.email) {
        void sendRegularizationDecisionEmail({
          to: employeeAccount.email,
          employeeName: `${employeeUser.firstName} ${employeeUser.lastName}`,
          date: updatedRequest.date,
          status: "REJECTED",
          decisionNote: updatedRequest.decisionNote,
        }).catch((error) =>
          console.error(
            "[Regularization Email] Failed to notify employee:",
            error,
          ),
        );
      }
    } catch (error) {
      console.error(
        "[Regularization Email] Failed to load employee email:",
        error,
      );
    }
  }

  return toApiRecord(updatedRequest);
}

export async function getMonthlyAttendanceTrend(
  months = 6,
  managerId?: string,
) {
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw new Error("Months must be an integer between 1 and 24.");
  }

  let employeeIds: string[] | undefined;

  if (managerId) {
    const employees = await Employee.find({
      managerId,
      status: "ACTIVE",
    })
      .select("_id")
      .lean();

    employeeIds = employees.map((employee) => employee._id);

    if (employeeIds.length === 0) {
      return buildEmptyTrend(months);
    }
  }

  const query: Record<string, any> = {};
  if (employeeIds) {
    query.employeeId = { $in: employeeIds };
  }

  const rows = await Attendance.find(query)
    .select("employeeId date status")
    .lean();

  const result: { month: string; presentRate: number }[] = [];
  const nowParts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const currentYear = Number(
    nowParts.find((part) => part.type === "year")?.value ??
      new Date().getFullYear(),
  );
  const currentMonth = Number(
    nowParts.find((part) => part.type === "month")?.value ??
      new Date().getMonth() + 1,
  );

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(currentYear, currentMonth - 1 - i, 1));
    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthRows = rows.filter((r) => r.date.startsWith(`${monthKey}-`));

    const presentCount = monthRows.filter((r) =>
      [
        "PRESENT",
        "WORK_FROM_HOME",
        "HALF_DAY",
        "LATE",
        "EARLY_DEPARTURE",
      ].includes(r.status),
    ).length;

    const rate = monthRows.length
      ? Math.round((presentCount / monthRows.length) * 100)
      : 0;

    result.push({
      month: d.toLocaleString("en-IN", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      presentRate: rate,
    });
  }

  return result;
}

function buildEmptyTrend(months: number) {
  const result: { month: string; presentRate: number }[] = [];
  const nowParts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const currentYear = Number(
    nowParts.find((part) => part.type === "year")?.value ??
      new Date().getFullYear(),
  );
  const currentMonth = Number(
    nowParts.find((part) => part.type === "month")?.value ??
      new Date().getMonth() + 1,
  );

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(currentYear, currentMonth - 1 - i, 1));
    result.push({
      month: d.toLocaleString("en-IN", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      presentRate: 0,
    });
  }

  return result;
}

// AI ATTENDANCE INSIGHTS
// ===========================================================================
// Uses the startDate and endDate selected by the employee.
//
// Same date:
//   startDate = 2026-09-04
//   endDate   = 2026-09-04
//
// Range:
//   startDate = 2026-09-01
//   endDate   = 2026-09-04
//
// ===========================================================================

export async function getAiAttendanceInsights(
  employeeId: string,
  startDate: string,
  endDate: string,
) {
  // -------------------------------------------------------------------------
  // Validate date format
  // -------------------------------------------------------------------------

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  ) {
    throw new Error("Invalid attendance date range.");
  }

  // -------------------------------------------------------------------------
  // Validate date values
  // -------------------------------------------------------------------------

  const parsedStart = new Date(`${startDate}T00:00:00.000Z`);

  const parsedEnd = new Date(`${endDate}T00:00:00.000Z`);

  if (
    Number.isNaN(parsedStart.getTime()) ||
    Number.isNaN(parsedEnd.getTime())
  ) {
    throw new Error("Invalid attendance date range.");
  }

  // -------------------------------------------------------------------------
  // Validate order
  // -------------------------------------------------------------------------

  if (startDate > endDate) {
    throw new Error("End date cannot be before start date.");
  }

  // -------------------------------------------------------------------------
  // Get employee
  // -------------------------------------------------------------------------

  const employee = await Employee.findById(employeeId)
    .select("_id firstName lastName employeeCode dateOfJoining dateOfExit")
    .lean();

  if (!employee) {
    throw new Error("Employee not found.");
  }

  // -------------------------------------------------------------------------
  // Respect employee employment period
  // -------------------------------------------------------------------------

  const effectiveStart =
    startDate < employee.dateOfJoining ? employee.dateOfJoining : startDate;

  const effectiveEnd =
    employee.dateOfExit && endDate > employee.dateOfExit
      ? employee.dateOfExit
      : endDate;

  // Employee was not employed during selected period
  if (effectiveStart > effectiveEnd) {
    return {
      period: {
        start: startDate,
        end: endDate,
        daysAnalyzed: 0,
      },

      summary: {
        attendanceRate: 0,
        presentDays: 0,
        wfhDays: 0,
        leaveDays: 0,
        absentDays: 0,
        halfDays: 0,
        averageWorkHours: 0,
        regularizedDays: 0,
      },

      timing: {
        lateCheckIns: 0,
        lateCheckInRate: 0,
        earlyCheckOuts: 0,
        earlyCheckoutRate: 0,
        missingCheckoutDays: 0,
      },

      trend: {
        direction: "STABLE" as const,
        change: 0,
        recentRate: 0,
        previousRate: 0,
      },

      patterns: [],

      recommendations: [
        "No attendance data is available for the selected period.",
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Get attendance records
  // -------------------------------------------------------------------------

  const records = await Attendance.find({
    employeeId,

    date: {
      $gte: effectiveStart,
      $lte: effectiveEnd,
    },
  })
    .sort({ date: 1 })
    .lean();

  // -------------------------------------------------------------------------
  // No attendance records
  // -------------------------------------------------------------------------

  if (!records.length) {
    return {
      period: {
        start: startDate,
        end: endDate,
        daysAnalyzed: 0,
      },

      summary: {
        attendanceRate: 0,
        presentDays: 0,
        wfhDays: 0,
        leaveDays: 0,
        absentDays: 0,
        halfDays: 0,
        averageWorkHours: 0,
        regularizedDays: 0,
      },

      timing: {
        lateCheckIns: 0,
        lateCheckInRate: 0,
        earlyCheckOuts: 0,
        earlyCheckoutRate: 0,
        missingCheckoutDays: 0,
      },

      trend: {
        direction: "STABLE" as const,
        change: 0,
        recentRate: 0,
        previousRate: 0,
      },

      patterns: [],

      recommendations: [
        "No attendance data is available for the selected date range.",
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Status counts
  // -------------------------------------------------------------------------

  const presentDays = records.filter((r) => r.status === "PRESENT").length;

  const wfhDays = records.filter((r) => r.status === "WORK_FROM_HOME").length;

  const leaveDays = records.filter((r) => r.status === "ON_LEAVE").length;

  const absentDays = records.filter((r) => r.status === "ABSENT").length;

  const halfDays = records.filter((r) => r.status === "HALF_DAY").length;

  const regularizedDays = records.filter((r) => r.isRegularized).length;

  // -------------------------------------------------------------------------
  // Attendance eligibility
  //
  // ON_LEAVE, HOLIDAY and WEEKEND are excluded.
  //
  // Missing records are NOT treated as absent.
  // -------------------------------------------------------------------------

  const eligibleRecords = records.filter(
    (r) =>
      r.status !== "ON_LEAVE" &&
      r.status !== "HOLIDAY" &&
      r.status !== "WEEKEND",
  );

  // -------------------------------------------------------------------------
  // Attendance equivalent
  //
  // PRESENT       = 1
  // WORK_FROM_HOME = 1
  // HALF_DAY      = 0.5
  // ABSENT        = 0
  // -------------------------------------------------------------------------

  const attendanceEquivalent = eligibleRecords.reduce((total, record) => {
    if (record.status === "PRESENT" || record.status === "WORK_FROM_HOME") {
      return total + 1;
    }

    if (record.status === "HALF_DAY") {
      return total + 0.5;
    }

    return total;
  }, 0);

  const attendanceRate =
    eligibleRecords.length > 0
      ? Math.round((attendanceEquivalent / eligibleRecords.length) * 100)
      : 0;

  // -------------------------------------------------------------------------
  // Working hours
  // -------------------------------------------------------------------------

  const workingRecords = records.filter(
    (r) =>
      (r.status === "PRESENT" ||
        r.status === "WORK_FROM_HOME" ||
        r.status === "HALF_DAY") &&
      r.workHours !== null &&
      r.workHours !== undefined,
  );

  const totalHours = workingRecords.reduce(
    (sum, record) => sum + Number(record.workHours ?? 0),
    0,
  );

  const averageWorkHours =
    workingRecords.length > 0
      ? Math.round((totalHours / workingRecords.length) * 100) / 100
      : 0;

  // -------------------------------------------------------------------------
  // Timing analysis
  //
  // IMPORTANT:
  // We do NOT assume a universal 9:30 AM / 5:30 PM schedule.
  //
  // Therefore:
  // - lateCheckIns = 0
  // - earlyCheckOuts = 0
  //
  // until actual employee shift/grace-period data is available.
  // -------------------------------------------------------------------------

  const lateCheckIns = 0;
  const lateCheckInRate = 0;

  const earlyCheckOuts = 0;
  const earlyCheckoutRate = 0;

  // -------------------------------------------------------------------------
  // Missing checkout
  // -------------------------------------------------------------------------

  const missingCheckoutDays = workingRecords.filter(
    (r) => r.checkIn && !r.checkOut,
  ).length;

  // -------------------------------------------------------------------------
  // Trend calculation
  // -------------------------------------------------------------------------

  let recentRate = attendanceRate;
  let previousRate = attendanceRate;
  let trendChange = 0;

  let trendDirection: "IMPROVING" | "DECLINING" | "STABLE" = "STABLE";

  if (startDate !== endDate && eligibleRecords.length >= 2) {
    const midpoint =
      parsedStart.getTime() + (parsedEnd.getTime() - parsedStart.getTime()) / 2;

    const previousRecords = eligibleRecords.filter(
      (record) => new Date(`${record.date}T00:00:00.000Z`).getTime() < midpoint,
    );

    const recentRecords = eligibleRecords.filter(
      (record) =>
        new Date(`${record.date}T00:00:00.000Z`).getTime() >= midpoint,
    );

    const calculateRate = (items: typeof eligibleRecords) => {
      if (!items.length) {
        return 0;
      }

      const equivalent = items.reduce((total, record) => {
        if (record.status === "PRESENT" || record.status === "WORK_FROM_HOME") {
          return total + 1;
        }

        if (record.status === "HALF_DAY") {
          return total + 0.5;
        }

        return total;
      }, 0);

      return Math.round((equivalent / items.length) * 100);
    };

    if (previousRecords.length > 0 && recentRecords.length > 0) {
      previousRate = calculateRate(previousRecords);

      recentRate = calculateRate(recentRecords);

      trendChange = recentRate - previousRate;

      // Stable if change is less than 2 percentage points
      if (trendChange >= 2) {
        trendDirection = "IMPROVING";
      } else if (trendChange <= -2) {
        trendDirection = "DECLINING";
      } else {
        trendDirection = "STABLE";
      }
    }
  }

  // -------------------------------------------------------------------------
  // Patterns
  // -------------------------------------------------------------------------

  const patterns: {
    type: "POSITIVE" | "WARNING" | "INFO";

    title: string;
    description: string;
  }[] = [];

  const recommendations: string[] = [];

  // -------------------------------------------------------------------------
  // Attendance pattern
  // -------------------------------------------------------------------------

  if (attendanceRate >= 90) {
    patterns.push({
      type: "POSITIVE",

      title: "Strong attendance",

      description: `Your attendance rate is ${attendanceRate}%, indicating a consistent attendance pattern.`,
    });
  } else if (attendanceRate >= 75) {
    patterns.push({
      type: "INFO",

      title: "Moderate attendance",

      description: `Your attendance rate is ${attendanceRate}%. There is some room to improve consistency.`,
    });
  } else {
    patterns.push({
      type: "WARNING",

      title: "Attendance needs attention",

      description: `Your attendance rate is ${attendanceRate}%, which indicates lower attendance consistency during the selected period.`,
    });

    recommendations.push(
      "Try to maintain consistent attendance and review any recorded absence patterns.",
    );
  }

  // -------------------------------------------------------------------------
  // Working hours
  // -------------------------------------------------------------------------

  if (averageWorkHours >= 8) {
    patterns.push({
      type: "POSITIVE",

      title: "Healthy working hours",

      description: `Your average recorded working time is ${averageWorkHours} hours per working day.`,
    });
  } else if (averageWorkHours > 0) {
    patterns.push({
      type: "INFO",

      title: "Working hours",

      description: `Your average recorded working time is ${averageWorkHours} hours per working day.`,
    });
  }

  // -------------------------------------------------------------------------
  // Missing checkout
  // -------------------------------------------------------------------------

  if (missingCheckoutDays > 0) {
    patterns.push({
      type: "WARNING",

      title: "Missing checkout records",

      description: `${missingCheckoutDays} working day(s) have a check-in but no check-out.`,
    });

    recommendations.push(
      "Remember to check out at the end of your workday so your working hours are recorded accurately.",
    );
  }

  // -------------------------------------------------------------------------
  // Regularization
  // -------------------------------------------------------------------------

  if (regularizedDays > 2) {
    patterns.push({
      type: "INFO",

      title: "Regularization activity",

      description: `${regularizedDays} attendance record(s) were regularized during this period.`,
    });

    recommendations.push(
      "Try to record your attendance correctly on the day itself to reduce the need for regularization.",
    );
  }

  // -------------------------------------------------------------------------
  // Improving trend
  // -------------------------------------------------------------------------

  if (trendDirection === "IMPROVING") {
    patterns.push({
      type: "POSITIVE",

      title: "Attendance is improving",

      description: `Your recent attendance rate improved by ${trendChange} percentage points compared with the earlier period.`,
    });
  }

  // -------------------------------------------------------------------------
  // Declining trend
  // -------------------------------------------------------------------------

  if (trendDirection === "DECLINING") {
    patterns.push({
      type: "WARNING",

      title: "Attendance trend is declining",

      description: `Your recent attendance rate decreased by ${Math.abs(
        trendChange,
      )} percentage points.`,
    });

    recommendations.push(
      "Pay attention to your recent attendance pattern and try to maintain consistency.",
    );
  }

  // -------------------------------------------------------------------------
  // WFH
  // -------------------------------------------------------------------------

  if (wfhDays > 0) {
    patterns.push({
      type: "INFO",

      title: "Work-from-home usage",

      description: `You recorded ${wfhDays} work-from-home day(s) during the selected period.`,
    });
  }

  // -------------------------------------------------------------------------
  // Leave
  // -------------------------------------------------------------------------

  if (leaveDays > 0) {
    patterns.push({
      type: "INFO",

      title: "Leave records",

      description: `${leaveDays} leave day(s) were recorded during the selected period.`,
    });
  }

  // -------------------------------------------------------------------------
  // Default recommendation
  // -------------------------------------------------------------------------

  if (!recommendations.length) {
    recommendations.push(
      "Your attendance pattern looks healthy. Continue maintaining your current consistency.",
    );
  }

  // -------------------------------------------------------------------------
  // Final response
  // -------------------------------------------------------------------------

  return {
    period: {
      start: startDate,
      end: endDate,
      daysAnalyzed: records.length,
    },

    summary: {
      attendanceRate,
      presentDays,
      wfhDays,
      leaveDays,
      absentDays,
      halfDays,
      averageWorkHours,
      regularizedDays,
    },

    timing: {
      lateCheckIns,
      lateCheckInRate,
      earlyCheckOuts,
      earlyCheckoutRate,
      missingCheckoutDays,
    },

    trend: {
      direction: trendDirection,
      change: trendChange,
      recentRate,
      previousRate,
    },

    patterns,

    recommendations,
  };
}
// ===========================================================================
// AI ATTENDANCE INSIGHTS - MULTI EMPLOYEE
// ===========================================================================
// Used by management views.
//
// employeeIds:
//   [employeeId]     -> selected employee
//   [id1, id2, ...]  -> overall/team analytics
//
// Existing getAiAttendanceInsights() remains unchanged.
// ===========================================================================

export async function getAiAttendanceInsightsForEmployees(
  employeeIds: string[],
  startDate: string,
  endDate: string,
) {
  if (!employeeIds.length) {
    return {
      period: {
        start: startDate,
        end: endDate,
        daysAnalyzed: 0,
      },

      summary: {
        attendanceRate: 0,
        presentDays: 0,
        wfhDays: 0,
        leaveDays: 0,
        absentDays: 0,
        halfDays: 0,
        averageWorkHours: 0,
        regularizedDays: 0,
      },

      timing: {
        lateCheckIns: 0,
        lateCheckInRate: 0,
        earlyCheckOuts: 0,
        earlyCheckoutRate: 0,
        missingCheckoutDays: 0,
      },

      trend: {
        direction: "STABLE" as const,
        change: 0,
        recentRate: 0,
        previousRate: 0,
      },

      patterns: [],

      recommendations: ["No employees are available for attendance analysis."],
    };
  }

  // -------------------------------------------------------------------------
  // Validate dates
  // -------------------------------------------------------------------------

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  ) {
    throw new Error("Invalid attendance date range.");
  }

  if (startDate > endDate) {
    throw new Error("End date cannot be before start date.");
  }

  // -------------------------------------------------------------------------
  // Get employees
  // -------------------------------------------------------------------------

  const employees = await Employee.find({
    _id: {
      $in: employeeIds,
    },
  })
    .select("_id firstName lastName employeeCode dateOfJoining dateOfExit")
    .lean();

  if (!employees.length) {
    return {
      period: {
        start: startDate,
        end: endDate,
        daysAnalyzed: 0,
      },

      summary: {
        attendanceRate: 0,
        presentDays: 0,
        wfhDays: 0,
        leaveDays: 0,
        absentDays: 0,
        halfDays: 0,
        averageWorkHours: 0,
        regularizedDays: 0,
      },

      timing: {
        lateCheckIns: 0,
        lateCheckInRate: 0,
        earlyCheckOuts: 0,
        earlyCheckoutRate: 0,
        missingCheckoutDays: 0,
      },

      trend: {
        direction: "STABLE" as const,
        change: 0,
        recentRate: 0,
        previousRate: 0,
      },

      patterns: [],

      recommendations: [
        "No attendance data is available for the selected employees.",
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Get attendance records
  // -------------------------------------------------------------------------

  const records = await Attendance.find({
    employeeId: {
      $in: employees.map((employee) => employee._id),
    },

    date: {
      $gte: startDate,
      $lte: endDate,
    },
  })
    .sort({
      date: 1,
    })
    .lean();

  // -------------------------------------------------------------------------
  // Employee employment-period filtering
  // -------------------------------------------------------------------------

  const employeeMap = new Map(
    employees.map((employee) => [employee._id, employee]),
  );

  const validRecords = records.filter((record) => {
    const employee = employeeMap.get(record.employeeId);

    if (!employee) {
      return false;
    }

    if (record.date < employee.dateOfJoining) {
      return false;
    }

    if (employee.dateOfExit && record.date > employee.dateOfExit) {
      return false;
    }

    return true;
  });

  // -------------------------------------------------------------------------
  // Status counts
  // -------------------------------------------------------------------------

  const presentDays = validRecords.filter((r) => r.status === "PRESENT").length;

  const wfhDays = validRecords.filter(
    (r) => r.status === "WORK_FROM_HOME",
  ).length;

  const leaveDays = validRecords.filter((r) => r.status === "ON_LEAVE").length;

  const absentDays = validRecords.filter((r) => r.status === "ABSENT").length;

  const halfDays = validRecords.filter((r) => r.status === "HALF_DAY").length;

  const regularizedDays = validRecords.filter((r) => r.isRegularized).length;

  // -------------------------------------------------------------------------
  // Attendance eligibility
  //
  // ON_LEAVE, HOLIDAY and WEEKEND are excluded.
  // Missing records are NOT treated as absent.
  // -------------------------------------------------------------------------

  const eligibleRecords = validRecords.filter(
    (r) =>
      r.status !== "ON_LEAVE" &&
      r.status !== "HOLIDAY" &&
      r.status !== "WEEKEND",
  );

  // -------------------------------------------------------------------------
  // Attendance equivalent
  //
  // PRESENT        = 1
  // WORK_FROM_HOME = 1
  // HALF_DAY       = 0.5
  // ABSENT         = 0
  // -------------------------------------------------------------------------

  const attendanceEquivalent = eligibleRecords.reduce((total, record) => {
    if (record.status === "PRESENT" || record.status === "WORK_FROM_HOME") {
      return total + 1;
    }

    if (record.status === "HALF_DAY") {
      return total + 0.5;
    }

    return total;
  }, 0);

  const attendanceRate =
    eligibleRecords.length > 0
      ? Math.round((attendanceEquivalent / eligibleRecords.length) * 100)
      : 0;

  // -------------------------------------------------------------------------
  // Working hours
  // -------------------------------------------------------------------------

  const workingRecords = validRecords.filter(
    (r) =>
      (r.status === "PRESENT" ||
        r.status === "WORK_FROM_HOME" ||
        r.status === "HALF_DAY") &&
      r.workHours !== null &&
      r.workHours !== undefined,
  );

  const totalHours = workingRecords.reduce(
    (sum, record) => sum + Number(record.workHours ?? 0),
    0,
  );

  const averageWorkHours =
    workingRecords.length > 0
      ? Math.round((totalHours / workingRecords.length) * 100) / 100
      : 0;

  // -------------------------------------------------------------------------
  // Timing
  //
  // We intentionally do not assume a universal shift time.
  // -------------------------------------------------------------------------

  const lateCheckIns = 0;
  const lateCheckInRate = 0;

  const earlyCheckOuts = 0;
  const earlyCheckoutRate = 0;

  // -------------------------------------------------------------------------
  // Missing checkout
  // -------------------------------------------------------------------------

  const missingCheckoutDays = workingRecords.filter(
    (r) => r.checkIn && !r.checkOut,
  ).length;

  // -------------------------------------------------------------------------
  // Trend
  // -------------------------------------------------------------------------

  let recentRate = attendanceRate;
  let previousRate = attendanceRate;
  let trendChange = 0;

  let trendDirection: "IMPROVING" | "DECLINING" | "STABLE" = "STABLE";

  if (startDate !== endDate && eligibleRecords.length >= 2) {
    const startTime = new Date(`${startDate}T00:00:00.000Z`).getTime();

    const endTime = new Date(`${endDate}T00:00:00.000Z`).getTime();

    const midpoint = startTime + (endTime - startTime) / 2;

    const previousRecords = eligibleRecords.filter(
      (record) => new Date(`${record.date}T00:00:00.000Z`).getTime() < midpoint,
    );

    const recentRecords = eligibleRecords.filter(
      (record) =>
        new Date(`${record.date}T00:00:00.000Z`).getTime() >= midpoint,
    );

    const calculateRate = (items: typeof eligibleRecords) => {
      if (!items.length) {
        return 0;
      }

      const equivalent = items.reduce((total, record) => {
        if (record.status === "PRESENT" || record.status === "WORK_FROM_HOME") {
          return total + 1;
        }

        if (record.status === "HALF_DAY") {
          return total + 0.5;
        }

        return total;
      }, 0);

      return Math.round((equivalent / items.length) * 100);
    };

    if (previousRecords.length && recentRecords.length) {
      previousRate = calculateRate(previousRecords);

      recentRate = calculateRate(recentRecords);

      trendChange = recentRate - previousRate;

      if (trendChange >= 2) {
        trendDirection = "IMPROVING";
      } else if (trendChange <= -2) {
        trendDirection = "DECLINING";
      } else {
        trendDirection = "STABLE";
      }
    }
  }

  // -------------------------------------------------------------------------
  // Patterns
  // -------------------------------------------------------------------------

  const patterns: {
    type: "POSITIVE" | "WARNING" | "INFO";
    title: string;
    description: string;
  }[] = [];

  const recommendations: string[] = [];

  if (attendanceRate >= 90) {
    patterns.push({
      type: "POSITIVE",
      title: "Strong overall attendance",
      description: `The selected employee group has an overall attendance rate of ${attendanceRate}%.`,
    });
  } else if (attendanceRate >= 75) {
    patterns.push({
      type: "INFO",
      title: "Moderate overall attendance",
      description: `The selected employee group has an overall attendance rate of ${attendanceRate}%.`,
    });
  } else {
    patterns.push({
      type: "WARNING",
      title: "Attendance needs attention",
      description: `The selected employee group has an overall attendance rate of ${attendanceRate}%.`,
    });

    recommendations.push(
      "Review attendance patterns for employees with repeated absences or half-days.",
    );
  }

  if (averageWorkHours >= 8) {
    patterns.push({
      type: "POSITIVE",
      title: "Healthy working hours",
      description: `Average recorded working time is ${averageWorkHours} hours per working day.`,
    });
  } else if (averageWorkHours > 0) {
    patterns.push({
      type: "INFO",
      title: "Working hours",
      description: `Average recorded working time is ${averageWorkHours} hours per working day.`,
    });
  }

  if (missingCheckoutDays > 0) {
    patterns.push({
      type: "WARNING",
      title: "Missing checkout records",
      description: `${missingCheckoutDays} working day(s) have a check-in but no check-out.`,
    });

    recommendations.push(
      "Review missing checkout records and remind employees to complete their attendance.",
    );
  }

  if (regularizedDays > 0) {
    patterns.push({
      type: "INFO",
      title: "Regularization activity",
      description: `${regularizedDays} attendance record(s) were regularized during this period.`,
    });
  }

  if (trendDirection === "IMPROVING") {
    patterns.push({
      type: "POSITIVE",
      title: "Attendance is improving",
      description: `Recent attendance improved by ${trendChange} percentage points.`,
    });
  }

  if (trendDirection === "DECLINING") {
    patterns.push({
      type: "WARNING",
      title: "Attendance trend is declining",
      description: `Recent attendance decreased by ${Math.abs(
        trendChange,
      )} percentage points.`,
    });

    recommendations.push(
      "Review recent attendance trends and identify employees who may need attention.",
    );
  }

  if (wfhDays > 0) {
    patterns.push({
      type: "INFO",
      title: "Work-from-home usage",
      description: `${wfhDays} work-from-home attendance record(s) were recorded.`,
    });
  }

  if (leaveDays > 0) {
    patterns.push({
      type: "INFO",
      title: "Leave records",
      description: `${leaveDays} leave day(s) were recorded.`,
    });
  }

  if (!recommendations.length) {
    recommendations.push(
      "Overall attendance looks healthy. Continue monitoring consistency and attendance exceptions.",
    );
  }

  return {
    period: {
      start: startDate,
      end: endDate,
      daysAnalyzed: validRecords.length,
    },

    summary: {
      attendanceRate,
      presentDays,
      wfhDays,
      leaveDays,
      absentDays,
      halfDays,
      averageWorkHours,
      regularizedDays,
    },

    timing: {
      lateCheckIns,
      lateCheckInRate,
      earlyCheckOuts,
      earlyCheckoutRate,
      missingCheckoutDays,
    },

    trend: {
      direction: trendDirection,
      change: trendChange,
      recentRate,
      previousRate,
    },

    patterns,

    recommendations,
  };
}
