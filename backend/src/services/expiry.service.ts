import { env } from "@/config/env";
import {
  AttendanceRegularizationRequest,
  LeaveRequest,
  Notification,
  Ticket,
} from "@/db/models";
import Announcement from "@/modules/announcements/announcement.model";

const DAY_MS = 24 * 60 * 60 * 1000;

function expiryFrom(value: string, days: number) {
  const base = new Date(value);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + days * DAY_MS).toISOString();
}

export async function backfillExpiryDates() {
  const now = new Date().toISOString();

  const [leaveRows, regularizationRows, ticketRows, notificationRows, announcementRows] =
    await Promise.all([
      LeaveRequest.find({ expiresAt: { $exists: false } })
        .select("_id appliedAt")
        .lean(),
      AttendanceRegularizationRequest.find({ expiresAt: { $exists: false } })
        .select("_id requestedAt")
        .lean(),
      Ticket.find({ expiresAt: { $exists: false } })
        .select("_id createdAt expiryDays")
        .lean(),
      Notification.find({ expiresAt: { $exists: false } })
        .select("_id createdAt")
        .lean(),
      Announcement.find({ expiresAt: { $exists: false } })
        .select("_id createdAt publishedAt status expiryDays")
        .lean(),
    ]);

  await Promise.all([
    LeaveRequest.bulkWrite(
      leaveRows.flatMap((row: any) => {
        const expiresAt = expiryFrom(row.appliedAt, env.leaveRequestExpiryDays);
        return expiresAt
          ? [{ updateOne: { filter: { _id: row._id }, update: { $set: { expiresAt, expiredAt: null } } } }]
          : [];
      }),
    ),
    AttendanceRegularizationRequest.bulkWrite(
      regularizationRows.flatMap((row: any) => {
        const expiresAt = expiryFrom(row.requestedAt, env.regularizationExpiryDays);
        return expiresAt
          ? [{ updateOne: { filter: { _id: row._id }, update: { $set: { expiresAt, expiredAt: null } } } }]
          : [];
      }),
    ),
    Ticket.bulkWrite(
      ticketRows.flatMap((row: any) => {
        const expiresAt = expiryFrom(row.createdAt, Number(row.expiryDays ?? env.ticketExpiryDays));
        return expiresAt
          ? [{ updateOne: { filter: { _id: row._id }, update: { $set: { expiresAt, expiredAt: null } } } }]
          : [];
      }),
    ),
    Notification.bulkWrite(
      notificationRows.flatMap((row: any) => {
        const expiresAt = expiryFrom(row.createdAt, env.notificationExpiryDays);
        return expiresAt
          ? [{ updateOne: { filter: { _id: row._id }, update: { $set: { expiresAt, expiredAt: null, status: "ACTIVE" } } } }]
          : [];
      }),
    ),
    // Announcement IDs are application-defined strings (ann_*). Use the
    // native collection so old custom IDs are never cast to ObjectId.
    Announcement.collection.bulkWrite(
      announcementRows.flatMap((row: any) => {
        const source = row.publishedAt || row.createdAt;
        const expiresAt = expiryFrom(source, Number(row.expiryDays ?? env.announcementExpiryDays));
        return expiresAt
          ? [{ updateOne: { filter: { _id: row._id }, update: { $set: { expiresAt, expiredAt: null } } } }]
          : [];
      }),
    ),
  ]);

  return now;
}

export async function expireTimedRecords() {
  const now = new Date().toISOString();
  await backfillExpiryDates();

  const [leave, regularization, tickets, notifications, announcements] =
    await Promise.all([
      LeaveRequest.updateMany(
        { status: "PENDING", expiresAt: { $lte: now } },
        { $set: { status: "EXPIRED", expiredAt: now, decidedAt: now } },
      ),
      AttendanceRegularizationRequest.updateMany(
        { status: "PENDING", expiresAt: { $lte: now } },
        { $set: { status: "EXPIRED", expiredAt: now, decidedAt: now } },
      ),
      Ticket.updateMany(
        { status: { $in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE"] }, expiresAt: { $lte: now } },
        { $set: { status: "EXPIRED", expiredAt: now, updatedAt: now } },
      ),
      Notification.deleteMany({
        $or: [
          { expiresAt: { $lte: now } },
          { status: "EXPIRED" },
        ],
      }),
      Announcement.collection.updateMany(
        { status: "PUBLISHED", expiresAt: { $lte: now } },
        { $set: { status: "EXPIRED", expiredAt: now, updatedAt: now } },
      ),
    ]);

  return {
    leave: leave.modifiedCount,
    regularization: regularization.modifiedCount,
    tickets: tickets.modifiedCount,
    notifications: notifications.deletedCount,
    announcements: announcements.modifiedCount,
  };
}
