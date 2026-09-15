/**
 * Attendance policy engine.
 *
 * Pure, deterministic attendance calculations. Database reads/writes remain in
 * repository/job layers so employee, department and shift configuration can be
 * supplied without coupling this module to persistence.
 */

export type AttendancePolicyStatus =
  | "PRESENT"
  | "ABSENT"
  | "HALF_DAY"
  | "WORK_FROM_HOME"
  | "ON_LEAVE"
  | "HOLIDAY"
  | "WEEKEND"
  | "LATE"
  | "EARLY_DEPARTURE";

export interface AttendancePolicy {
  shiftStart: string; // HH:mm
  shiftEnd: string; // HH:mm
  standardHours: number;
  graceMinutes: number;
  halfDayHours: number;
  overtimeAfterHours: number;
  breakMinutes: number;
}

export interface AttendanceCalculation {
  scheduledHours: number;
  grossHours: number;
  breakHours: number;
  effectiveHours: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeHours: number;
  isLate: boolean;
  isEarlyDeparture: boolean;
  status: AttendancePolicyStatus;
}

const DEFAULT_POLICY: AttendancePolicy = {
  shiftStart: "10:00",
  shiftEnd: "19:00",
  standardHours: 8,
  graceMinutes: 15,
  halfDayHours: 4,
  overtimeAfterHours: 8,
  breakMinutes: 60,
};

const MINUTES_PER_DAY = 24 * 60;
const ATTENDANCE_TIME_ZONE = "Asia/Kolkata";

function assertFiniteNonNegative(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a finite non-negative number.`);
  }
}

function timeToMinutes(value: string): number {
  const match = /^\d{2}:\d{2}$/.exec(value.trim());
  if (!match) throw new Error(`Invalid time: ${value}`);

  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(3, 5));

  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid time: ${value}`);
  }

  return hours * 60 + minutes;
}

function timestamp(value: string, fieldName: string): number {
  const result = new Date(value).getTime();
  if (!Number.isFinite(result)) throw new Error(`Invalid ${fieldName}.`);
  return result;
}

function localClockMinutes(value: string, fieldName: string): number {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${fieldName}.`);

  // Attendance shifts are configured in the application's attendance
  // timezone, not in the Node.js process timezone.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ATTENDANCE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return hour * 60 + minute;
}

function isOvernightShift(shiftStart: string, shiftEnd: string): boolean {
  return timeToMinutes(shiftEnd) <= timeToMinutes(shiftStart);
}

function roundHoursInternal(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hoursBetween(start: string, end: string): number {
  const startTimestamp = timestamp(start, "check-in time");
  const endTimestamp = timestamp(end, "check-out time");
  if (endTimestamp < startTimestamp) return 0;
  return (endTimestamp - startTimestamp) / 3_600_000;
}

function scheduledHours(policy: AttendancePolicy): number {
  // standardHours is the contractual working-hours value, including for
  // overnight shifts. The clock span is validated separately.
  return policy.standardHours;
}

export function normalizeAttendancePolicy(
  policy?: Partial<AttendancePolicy> | null,
): AttendancePolicy {
  const merged: AttendancePolicy = {
    ...DEFAULT_POLICY,
    ...(policy ?? {}),
  };

  timeToMinutes(merged.shiftStart);
  timeToMinutes(merged.shiftEnd);

  if (!Number.isFinite(merged.standardHours) || merged.standardHours <= 0) {
    throw new Error("Standard working hours must be greater than zero.");
  }
  assertFiniteNonNegative(merged.graceMinutes, "Grace period");
  assertFiniteNonNegative(merged.halfDayHours, "Half-day threshold");
  assertFiniteNonNegative(merged.overtimeAfterHours, "Overtime threshold");
  assertFiniteNonNegative(merged.breakMinutes, "Break minutes");

  if (merged.halfDayHours > merged.standardHours) {
    throw new Error("Invalid half-day threshold.");
  }
  if (merged.overtimeAfterHours < merged.standardHours) {
    throw new Error(
      "Overtime threshold cannot be lower than standard working hours.",
    );
  }
  if (merged.graceMinutes > MINUTES_PER_DAY) {
    throw new Error("Grace period cannot exceed 24 hours.");
  }
  if (merged.breakMinutes > MINUTES_PER_DAY) {
    throw new Error("Break minutes cannot exceed 24 hours.");
  }

  return merged;
}

export function calculateLateMinutes(
  checkIn: string,
  shiftStart: string,
  graceMinutes: number,
  shiftEnd?: string,
): number {
  assertFiniteNonNegative(graceMinutes, "Grace period");
  const actual = localClockMinutes(checkIn, "check-in time");
  const start = timeToMinutes(shiftStart);

  // Optional shiftEnd makes the helper correct for overnight shifts while
  // preserving compatibility with existing three-argument callers.
  if (shiftEnd && isOvernightShift(shiftStart, shiftEnd)) {
    const end = timeToMinutes(shiftEnd);
    if (actual < end) return 0; // after midnight: same overnight shift
  }

  return Math.max(0, Math.round(actual - start - graceMinutes));
}

export function calculateEarlyDepartureMinutes(
  checkOut: string,
  shiftEnd: string,
  shiftStart?: string,
): number {
  const actual = localClockMinutes(checkOut, "check-out time");
  const end = timeToMinutes(shiftEnd);

  if (shiftStart && isOvernightShift(shiftStart, shiftEnd)) {
    const start = timeToMinutes(shiftStart);
    const actualElapsed =
      actual >= start ? actual - start : actual + MINUTES_PER_DAY - start;
    const scheduledElapsed = end + MINUTES_PER_DAY - start;
    return Math.max(0, Math.round(scheduledElapsed - actualElapsed));
  }

  return Math.max(0, Math.round(end - actual));
}

export function calculateAttendance(
  checkIn: string | null,
  checkOut: string | null,
  breakMinutes = 0,
  policyInput?: Partial<AttendancePolicy> | null,
): AttendanceCalculation {
  const policy = normalizeAttendancePolicy(policyInput);
  assertFiniteNonNegative(breakMinutes, "Break minutes");

  const scheduled = scheduledHours(policy);

  if (!checkIn) {
    return {
      scheduledHours: scheduled,
      grossHours: 0,
      breakHours: 0,
      effectiveHours: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      overtimeHours: 0,
      isLate: false,
      isEarlyDeparture: false,
      status: "ABSENT",
    };
  }

  const lateMinutes = calculateLateMinutes(
    checkIn,
    policy.shiftStart,
    policy.graceMinutes,
    policy.shiftEnd,
  );

  if (!checkOut) {
    return {
      scheduledHours: scheduled,
      grossHours: 0,
      breakHours: roundHoursInternal(breakMinutes / 60),
      effectiveHours: 0,
      lateMinutes,
      earlyDepartureMinutes: 0,
      overtimeHours: 0,
      isLate: lateMinutes > 0,
      isEarlyDeparture: false,
      status: lateMinutes > 0 ? "LATE" : "PRESENT",
    };
  }

  const grossHours = hoursBetween(checkIn, checkOut);
  const breakHours = Math.min(breakMinutes / 60, grossHours);
  const effectiveHours = Math.max(0, grossHours - breakHours);
  const earlyDepartureMinutes = calculateEarlyDepartureMinutes(
    checkOut,
    policy.shiftEnd,
    policy.shiftStart,
  );
  const overtimeHours = Math.max(0, effectiveHours - policy.overtimeAfterHours);

  // Keep exception statuses specific to what happened at checkout.
  // Early departure takes precedence over the half-day threshold so a
  // checkout before shift end is reported as EARLY_DEPARTURE.
  // Overtime is tracked independently through overtimeHours because the
  // database model does not persist an OVERTIME attendance status.
  let status: AttendancePolicyStatus = "PRESENT";
  if (earlyDepartureMinutes > 0) {
    status = "EARLY_DEPARTURE";
  } else if (effectiveHours < policy.halfDayHours) {
    status = "HALF_DAY";
  } else if (lateMinutes > 0) {
    status = "LATE";
  }

  return {
    scheduledHours: scheduled,
    grossHours: roundHoursInternal(grossHours),
    breakHours: roundHoursInternal(breakHours),
    effectiveHours: roundHoursInternal(effectiveHours),
    lateMinutes,
    earlyDepartureMinutes,
    overtimeHours: roundHoursInternal(overtimeHours),
    isLate: lateMinutes > 0,
    isEarlyDeparture: earlyDepartureMinutes > 0,
    status,
  };
}

export function isValidDateString(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function isWeekendDate(date: string): boolean {
  if (!isValidDateString(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function roundHours(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Hours value must be a finite number.");
  }
  return roundHoursInternal(value);
}
