/**
 * Compensatory-off persistence for Attendance.
 *
 * This repository owns Comp-Off credit, expiry, balance, history and usage
 * operations. Attendance policy/job layers should call these functions rather
 * than manipulating CompOff documents directly.
 */

import { CompOff } from "@/db/models";
import { nowIso } from "@/db/connection";

export type CompOffStatus = "AVAILABLE" | "PARTIALLY_USED" | "USED" | "EXPIRED";

interface CompOffApiRecord {
  id: string;
  [key: string]: unknown;
}

function toApiRecord(doc: unknown): CompOffApiRecord | undefined {
  if (!doc || typeof doc !== "object") return undefined;

  const record = doc as Record<string, unknown>;
  const id = record._id;
  const { _id: _ignored, __v: _version, ...rest } = record;

  return {
    id: String(id),
    ...rest,
  };
}

function assertEmployeeId(employeeId: string): void {
  if (!employeeId?.trim()) throw new Error("Employee ID is required.");
}

function assertAttendanceId(attendanceId: string): void {
  if (!attendanceId?.trim()) throw new Error("Attendance ID is required.");
}

function assertDate(date: string, fieldName: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format.`);
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`${fieldName} is not a valid calendar date.`);
  }
}

function assertNonNegativeNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }
}

function normalizeNote(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  const note = value?.trim() || null;
  if (note && note.length > 1000) {
    throw new Error(`${fieldName} must not exceed 1000 characters.`);
  }
  return note;
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Credits overtime as Comp-Off. The attendanceId makes this operation
 * idempotent, so scheduled jobs can safely run more than once.
 */
export async function creditCompOff(params: {
  employeeId: string;
  attendanceId: string;
  earnedHours: number;
  earnedDate: string;
  expiryDays?: number;
  note?: string | null;
}) {
  assertEmployeeId(params.employeeId);
  assertAttendanceId(params.attendanceId);
  assertDate(params.earnedDate, "Earned date");
  assertNonNegativeNumber(params.earnedHours, "Earned hours");

  const earnedHours = roundHours(params.earnedHours);
  if (earnedHours <= 0) return undefined;

  const note = normalizeNote(params.note, "Comp-Off note");

  const expiryDays = params.expiryDays ?? 30;
  if (!Number.isInteger(expiryDays) || expiryDays < 0 || expiryDays > 3650) {
    throw new Error("Expiry days must be an integer between 0 and 3650.");
  }

  const existing = await CompOff.findOne({
    employeeId: params.employeeId,
    attendanceId: params.attendanceId,
  }).lean();

  if (existing) return toApiRecord(existing);

  const now = nowIso();
  const expiresAt = addDays(
    new Date(`${params.earnedDate}T23:59:59.999Z`),
    expiryDays,
  ).toISOString();

  try {
    const created = await CompOff.create({
      employeeId: params.employeeId,
      attendanceId: params.attendanceId,
      earnedHours,
      earnedDate: params.earnedDate,
      expiresAt,
      usedHours: 0,
      remainingHours: earnedHours,
      status: "AVAILABLE",
      note: params.note?.trim() || null,
      usedDate: null,
      useNote: null,
      createdAt: now,
      updatedAt: now,
    });

    return toApiRecord(created.toObject());
  } catch (error: unknown) {
    // attendanceId is unique. If another worker credited the same attendance
    // concurrently, return the existing credit instead of failing the job.
    const duplicate = await CompOff.findOne({
      employeeId: params.employeeId,
      attendanceId: params.attendanceId,
    }).lean();

    if (duplicate) return toApiRecord(duplicate);
    throw error;
  }
}

/** Marks all currently available expired credits as EXPIRED. */
export async function expireCompOffs(
  referenceDate = new Date(),
): Promise<number> {
  if (Number.isNaN(referenceDate.getTime())) {
    throw new Error("Invalid reference date.");
  }

  const iso = referenceDate.toISOString();
  const result = await CompOff.updateMany(
    {
      status: { $in: ["AVAILABLE", "PARTIALLY_USED"] },
      remainingHours: { $gt: 0 },
      expiresAt: { $lt: iso },
    },
    {
      $set: {
        status: "EXPIRED",
        updatedAt: iso,
      },
    },
  );

  return result.modifiedCount ?? 0;
}

/** Returns the complete Comp-Off history for one employee. */
export async function listEmployeeCompOffs(employeeId: string) {
  assertEmployeeId(employeeId);
  await expireCompOffs();

  const rows = await CompOff.find({ employeeId })
    .sort({ earnedDate: -1, createdAt: -1 })
    .lean();

  return rows.map(toApiRecord).filter(Boolean);
}

/** Returns the currently usable Comp-Off balance in hours. */
export async function getEmployeeCompOffBalance(
  employeeId: string,
): Promise<number> {
  assertEmployeeId(employeeId);
  await expireCompOffs();

  const rows = await CompOff.find({
    employeeId,
    status: { $in: ["AVAILABLE", "PARTIALLY_USED"] },
    remainingHours: { $gt: 0 },
  })
    .select({ remainingHours: 1 })
    .lean();

  const balance = rows.reduce(
    (total, row) => total + Number(row.remainingHours || 0),
    0,
  );

  return roundHours(balance);
}

/**
 * Uses the oldest-expiring credits first (FIFO by expiry date).
 *
 * The balance is checked before any document is changed. This prevents a
 * failed request from partially consuming several credits and then reporting
 * insufficient balance.
 */
export async function useCompOff(params: {
  employeeId: string;
  hours: number;
  usedDate: string;
  note?: string | null;
}): Promise<number> {
  assertEmployeeId(params.employeeId);
  assertDate(params.usedDate, "Used date");
  assertNonNegativeNumber(params.hours, "Comp-Off usage");

  const hours = roundHours(params.hours);
  if (hours <= 0) {
    throw new Error("Comp-Off usage must be greater than zero.");
  }

  await expireCompOffs(new Date(`${params.usedDate}T23:59:59.999Z`));

  const usedDateIso = new Date(
    `${params.usedDate}T00:00:00.000Z`,
  ).toISOString();
  const credits = await CompOff.find({
    employeeId: params.employeeId,
    status: { $in: ["AVAILABLE", "PARTIALLY_USED"] },
    remainingHours: { $gt: 0 },
    earnedDate: { $lte: params.usedDate },
    expiresAt: { $gte: usedDateIso },
  }).sort({ expiresAt: 1, earnedDate: 1, createdAt: 1 });

  const totalAvailable = roundHours(
    credits.reduce(
      (total, credit) => total + Number(credit.remainingHours || 0),
      0,
    ),
  );

  if (totalAvailable < hours) {
    throw new Error(
      `Insufficient Comp-Off balance. Available: ${totalAvailable} hours; requested: ${hours} hours.`,
    );
  }

  let remainingToUse = hours;
  const now = nowIso();
  const useNote = normalizeNote(params.note, "Comp-Off usage note");

  for (const credit of credits) {
    if (remainingToUse <= 0) break;

    const available = roundHours(Number(credit.remainingHours || 0));
    const used = roundHours(Math.min(available, remainingToUse));
    if (used <= 0) continue;

    const newUsedHours = roundHours(Number(credit.usedHours || 0) + used);
    const newRemainingHours = roundHours(available - used);

    credit.usedHours = newUsedHours;
    credit.remainingHours = newRemainingHours;
    credit.status = newRemainingHours <= 0 ? "USED" : "PARTIALLY_USED";
    credit.usedDate = params.usedDate;
    credit.useNote = useNote;
    credit.updatedAt = now;

    await credit.save();
    remainingToUse = roundHours(remainingToUse - used);
  }

  if (remainingToUse > 0) {
    // This should only be reachable if another process changed the balance
    // between the initial read and save operations.
    throw new Error(
      "Comp-Off balance changed while processing the request. Please retry.",
    );
  }

  return getEmployeeCompOffBalance(params.employeeId);
}
