import { Notification, Announcement } from "@/db/models";
import { nowIso } from "@/db/connection";

export type NotificationType =
  | "LEAVE_REQUEST"
  | "LEAVE_DECISION"
  | "ANNOUNCEMENT"
  | "PAYROLL"
  | "PERFORMANCE"
  | "RECRUITMENT"
  | "TICKET_MESSAGE"
  | "SYSTEM"
  | "DOCUMENT_REQUESTED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_READY";

function toApiDoc(doc: any) {
  if (!doc) return undefined;

  const { _id, ...rest } = doc;

  return {
    id: _id,
    ...rest,
  };
}

export async function notify(input: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}) {
  const doc = await Notification.create({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link ?? null,
    isRead: false,
    createdAt: nowIso(),
  });

  return doc._id;
}

export async function listNotifications(userId: string, unreadOnly = false) {
  const query: Record<string, any> = {
    userId,
  };

  if (unreadOnly) {
    query.isRead = false;
  }

  const rows = await Notification.find(query)
    .sort({
      createdAt: -1,
    })
    .limit(50)
    .lean();

  return rows.map(toApiDoc);
}

export async function unreadCount(userId: string) {
  return Notification.countDocuments({
    userId,
    isRead: false,
  });
}

export async function markRead(id: string, userId: string) {
  await Notification.updateOne(
    {
      _id: id,
      userId,
    },
    {
      $set: {
        isRead: true,
      },
    },
  );
}

export async function markAllRead(userId: string) {
  await Notification.updateMany(
    {
      userId,
    },
    {
      $set: {
        isRead: true,
      },
    },
  );
}

export async function listAnnouncements() {
  const rows = await Announcement.find({})
    .sort({
      pinned: -1,
      createdAt: -1,
    })
    .lean();

  return rows.map(toApiDoc);
}

export async function createAnnouncement(input: {
  title: string;
  body: string;
  pinned?: boolean;
  audience?: string;
}) {
  const doc = await Announcement.create({
    title: input.title,
    body: input.body,
    pinned: !!input.pinned,
    audience: input.audience ?? "ALL",
    createdAt: nowIso(),
  });

  return toApiDoc((await Announcement.findById(doc._id).lean())!);
}
