import { env } from "@/config/env";
import {
  AttendanceRegularizationRequest,
  LeaveRequest,
  Notification,
  Ticket,
} from "@/db/models";
import Announcement from "@/modules/announcements/announcement.model";

const DAY_MS = 24 * 60 * 60 * 1000;

async function updateExpiryDates(
  model: { updateOne: (filter: any, update: any) => Promise<unknown> },
  rows: any[],
  getExpiry: (row: any) => string | null,
  extraFields?: Record<string, unknown>,
) {
  if (rows.length === 0) return;

  await Promise.all(
    rows.flatMap((row) => {
      const expiresAt = getExpiry(row);
      if (!expiresAt) return [];

      return [
        model.updateOne(
          { _id: row._id },
          {
            $set: {
              expiresAt,
              expiredAt: null,
              ...(extraFields ?? {}),
            },
          },
        ),
      ];
    }),
  );
}

async function updateAnnouncementExpiryDates(rows: any[]) {
  if (rows.length === 0) return;

  await Promise.all(
    rows.flatMap((row) => {
      const source = row.publishedAt || row.createdAt;
      const expiresAt = expiryFrom(
        source,
        Number(row.expiryDays ?? env.announcementExpiryDays),
      );

      if (!expiresAt) return [];

      return [
        Announcement.collection.updateOne(
          { _id: row._id },
          { $set: { expiresAt, expiredAt: null } },
        ),
      ];
    }),
  );
}

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
    updateExpiryDates(
      LeaveRequest,
      leaveRows,
      (row) => expiryFrom(row.appliedAt, env.leaveRequestExpiryDays),
    ),
    updateExpiryDates(
      AttendanceRegularizationRequest,
      regularizationRows,
      (row) => expiryFrom(row.requestedAt, env.regularizationExpiryDays),
    ),
    updateExpiryDates(
      Ticket,
      ticketRows,
      (row) => expiryFrom(row.createdAt, Number(row.expiryDays ?? env.ticketExpiryDays)),
    ),
    updateExpiryDates(
      Notification,
      notificationRows,
      (row) => expiryFrom(row.createdAt, env.notificationExpiryDays),
      { status: "ACTIVE" },
    ),
    updateAnnouncementExpiryDates(announcementRows),
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
        {
          status: { $in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE"] },
          expiresAt: { $lte: now },
        },
        { $set: { status: "EXPIRED", expiredAt: now, updatedAt: now } },
      ),
      Notification.deleteMany({
        $or: [{ expiresAt: { $lte: now } }, { status: "EXPIRED" }],
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
