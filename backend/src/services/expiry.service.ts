import { LeaveRequest, AttendanceRegularizationRequest, Notification, Ticket } from "@/db/models";
import Announcement from "@/modules/announcements/announcement.model";

const MS_DAY = 24 * 60 * 60 * 1000;

function istEndOfDay(dateString: string) {
  return new Date(`${dateString}T18:29:59.999Z`).toISOString();
}

function addDays(iso: string, days: number) {
  return new Date(new Date(iso).getTime() + days * MS_DAY).toISOString();
}

function leaveExpiry(startDate: string, appliedAt: string) {
  const now = new Date(appliedAt);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const tomorrowDate = new Date(`${today}T00:00:00.000Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  if (startDate <= today) return istEndOfDay(today);
  if (startDate === tomorrow) return istEndOfDay(tomorrow);
  return addDays(appliedAt, 2);
}

export async function backfillExpiryDates() {
  const now = new Date().toISOString();
  const leaves = await LeaveRequest.find({ expiresAt: null }).select("_id startDate appliedAt").lean();
  if (leaves.length) await LeaveRequest.collection.bulkWrite(leaves.map((r:any)=>({updateOne:{filter:{_id:r._id,expiresAt:null},update:{$set:{expiresAt:leaveExpiry(r.startDate,r.appliedAt)}}}})));

  const regs = await AttendanceRegularizationRequest.find({ expiresAt: null }).select("_id requestedAt").lean();
  if (regs.length) await AttendanceRegularizationRequest.collection.bulkWrite(regs.map((r:any)=>({updateOne:{filter:{_id:r._id,expiresAt:null},update:{$set:{expiresAt:addDays(r.requestedAt,1)}}}})));

  const tickets = await Ticket.find({ expiresAt: null }).select("_id createdAt").lean();
  if (tickets.length) await Ticket.collection.bulkWrite(tickets.map((r:any)=>({updateOne:{filter:{_id:r._id,expiresAt:null},update:{$set:{expiresAt:addDays(r.createdAt,3)}}}})));

  const notifications = await Notification.find({ expiresAt: null }).select("_id createdAt").lean();
  if (notifications.length) await Notification.collection.bulkWrite(notifications.map((r:any)=>({updateOne:{filter:{_id:r._id,expiresAt:null},update:{$set:{expiresAt:addDays(r.createdAt,2),status:"ACTIVE"}}}})));

  const announcements = await Announcement.find({ status: "PUBLISHED", expiresAt: "" }).select("_id publishedAt createdAt").lean();
  if (announcements.length) await Announcement.collection.bulkWrite(announcements.map((r:any)=>({updateOne:{filter:{_id:r._id,expiresAt:""},update:{$set:{expiresAt:addDays(r.publishedAt || r.createdAt,7)}}}})));
  return now;
}

export async function expireTimedRecords() {
  const now = new Date().toISOString();
  await backfillExpiryDates();
  await Promise.all([
    LeaveRequest.updateMany({ status: "PENDING", expiresAt: { $lte: now } }, {$set:{status:"EXPIRED",expiredAt:now}}),
    AttendanceRegularizationRequest.updateMany({ status: "PENDING", expiresAt: { $lte: now } }, {$set:{status:"EXPIRED",expiredAt:now}}),
    Ticket.updateMany({ status: { $in:["OPEN","IN_PROGRESS","WAITING_FOR_EMPLOYEE"] }, expiresAt: { $lte: now } }, {$set:{status:"EXPIRED",expiredAt:now,updatedAt:now}}),
    Notification.updateMany({ status: "ACTIVE", expiresAt: { $lte: now } }, {$set:{status:"EXPIRED",expiredAt:now}}),
    Announcement.collection.updateMany({ status: "PUBLISHED", expiresAt: { $ne:"", $lte: now } }, {$set:{status:"EXPIRED",expiredAt:now}}),
  ]);
}
