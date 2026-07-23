import { Employee, LeaveRequest, JobPosting, Attendance, Holiday, Candidate, Designation, LeaveType } from "@/db/models";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getKpis() {
  const today = isoToday();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

  const [headcount, newHires30d, exits90d, pendingLeave, openRoles] = await Promise.all([
    Employee.countDocuments({ status: "ACTIVE" }),
    Employee.countDocuments({ dateOfJoining: { $gte: thirtyDaysAgo } }),
    Employee.countDocuments({ dateOfExit: { $ne: null, $gte: ninetyDaysAgo } }),
    LeaveRequest.countDocuments({ status: "PENDING" }),
    JobPosting.countDocuments({ status: "OPEN" }),
  ]);

  // Attendance is most meaningful on the most recent day people actually worked —
  // falls back gracefully on weekends/holidays instead of reporting a misleading zero.
  const attendanceDateRow = await Attendance.findOne({ date: { $lte: today } }).sort({ date: -1 }).lean();
  const attendanceDate = attendanceDateRow?.date ?? today;

  const [presentToday, onLeaveToday] = await Promise.all([
    Attendance.countDocuments({ date: attendanceDate, status: { $in: ["PRESENT", "WORK_FROM_HOME", "HALF_DAY"] } }),
    LeaveRequest.countDocuments({ status: "APPROVED", startDate: { $lte: attendanceDate }, endDate: { $gte: attendanceDate } }),
  ]);

  const attritionRate = headcount > 0 ? Math.round((exits90d / (headcount + exits90d)) * 1000) / 10 : 0;
  const attendanceRate = headcount > 0 ? Math.round((presentToday / headcount) * 100) : 0;
  const isToday = attendanceDate === today;

  return {
    headcount,
    newHires30d,
    exits90d,
    pendingLeave,
    openRoles,
    presentToday,
    onLeaveToday,
    attritionRate,
    attendanceRate,
    attendanceDate,
    attendanceIsToday: isToday,
  };
}

function dayDiff(todayMd: string, targetMd: string): number {
  const toDayOfYear = (md: string) => {
    const [m, d] = md.split("-").map(Number);
    return new Date(2001, m - 1, d).getTime();
  };
  const diffMs = toDayOfYear(targetMd) - toDayOfYear(todayMd);
  const days = Math.round(diffMs / 86_400_000);
  return days < 0 ? days + 365 : days;
}

export async function getUpcomingBirthdays() {
  const rows = await Employee.find({ status: "ACTIVE", dateOfBirth: { $ne: null } })
    .select("firstName lastName avatarUrl dateOfBirth")
    .lean();
  const todayMd = new Date().toISOString().slice(5, 10);
  const upcoming = rows
    .map((r) => ({
      id: r._id,
      firstName: r.firstName,
      lastName: r.lastName,
      avatarUrl: r.avatarUrl,
      dateOfBirth: r.dateOfBirth,
      md: (r.dateOfBirth as string).slice(5, 10),
    }))
    .map((r) => ({ ...r, diff: dayDiff(todayMd, r.md) }))
    .filter((r) => r.diff >= 0 && r.diff <= 30)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 6);
  return upcoming;
}

export async function getUpcomingAnniversaries() {
  const rows = await Employee.find({ status: "ACTIVE" }).select("firstName lastName avatarUrl dateOfJoining").lean();
  const todayMd = new Date().toISOString().slice(5, 10);
  const currentYear = new Date().getFullYear();
  const upcoming = rows
    .map((r) => ({
      id: r._id,
      firstName: r.firstName,
      lastName: r.lastName,
      avatarUrl: r.avatarUrl,
      dateOfJoining: r.dateOfJoining,
      md: (r.dateOfJoining as string).slice(5, 10),
      years: currentYear - Number((r.dateOfJoining as string).slice(0, 4)),
    }))
    .map((r) => ({ ...r, diff: dayDiff(todayMd, r.md) }))
    .filter((r) => r.diff >= 0 && r.diff <= 30 && r.years > 0)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 6);
  return upcoming;
}

export async function getRecentActivity(limit = 8) {
  const [leaveRows, hireRows, candidateRows] = await Promise.all([
    LeaveRequest.find({}).select("employeeId leaveTypeId status appliedAt").lean(),
    Employee.find({}).select("firstName lastName status designationId createdAt").lean(),
    Candidate.find({}).select("jobPostingId firstName lastName stage appliedAt").lean(),
  ]);

  const employeeIds = [...new Set(leaveRows.map((r) => r.employeeId))];
  const leaveTypeIds = [...new Set(leaveRows.map((r) => r.leaveTypeId))];
  const designationIds = [...new Set(hireRows.map((r) => r.designationId))];
  const jobIds = [...new Set(candidateRows.map((r) => r.jobPostingId))];

  const [employees, leaveTypes, designations, jobs] = await Promise.all([
    Employee.find({ _id: { $in: employeeIds } }).select("firstName lastName").lean(),
    LeaveType.find({ _id: { $in: leaveTypeIds } }).select("name").lean(),
    Designation.find({ _id: { $in: designationIds } }).select("title").lean(),
    JobPosting.find({ _id: { $in: jobIds } }).select("title").lean(),
  ]);

  const empMap = new Map(employees.map((e) => [e._id, e]));
  const typeMap = new Map(leaveTypes.map((t) => [t._id, t]));
  const desMap = new Map(designations.map((d) => [d._id, d]));
  const jobMap = new Map(jobs.map((j) => [j._id, j]));

  const activity: { kind: string; at: string; firstName: string; lastName: string; detail: string; label: string | null }[] = [];

  for (const r of leaveRows) {
    const emp = empMap.get(r.employeeId);
    activity.push({
      kind: "leave",
      at: r.appliedAt,
      firstName: emp?.firstName ?? "",
      lastName: emp?.lastName ?? "",
      detail: r.status,
      label: typeMap.get(r.leaveTypeId)?.name ?? null,
    });
  }
  for (const r of hireRows) {
    activity.push({
      kind: "hire",
      at: r.createdAt,
      firstName: r.firstName,
      lastName: r.lastName,
      detail: r.status,
      label: desMap.get(r.designationId)?.title ?? null,
    });
  }
  for (const r of candidateRows) {
    activity.push({
      kind: "candidate",
      at: r.appliedAt,
      firstName: r.firstName,
      lastName: r.lastName,
      detail: r.stage,
      label: jobMap.get(r.jobPostingId)?.title ?? null,
    });
  }

  return activity.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

export async function getUpcomingHolidays(limit = 4) {
  const today = isoToday();
  const rows = await Holiday.find({ date: { $gte: today } }).sort({ date: 1 }).limit(limit).lean();
  return rows.map((r) => {
    const { _id, ...rest } = r;
    return { id: _id, ...rest };
  });
}
