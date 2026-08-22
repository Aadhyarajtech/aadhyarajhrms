import { Attendance, Employee, Department } from "@/db/models";
import { nowIso } from "@/db/connection";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function toApiRecord(doc: any) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export async function getTodayRecord(employeeId: string) {
  const row = await Attendance.findOne({
    employeeId,
    date: todayDateString(),
  }).lean();
  return toApiRecord(row);
}

export async function checkIn(employeeId: string) {
  const existing = await getTodayRecord(employeeId);
  if (existing) return existing;

  const now = nowIso();
  await Attendance.create({
    employeeId,
    date: todayDateString(),
    checkIn: now,
    status: "PRESENT",
    createdAt: now,
  });
  return getTodayRecord(employeeId);
}

export async function checkOut(employeeId: string) {
  const existing = (await getTodayRecord(employeeId)) as any;
  if (!existing || !existing.checkIn) return undefined;
  const now = new Date();
  const checkInTime = new Date(existing.checkIn);
  const hours =
    Math.round(((now.getTime() - checkInTime.getTime()) / 3_600_000) * 100) /
    100;

  await Attendance.updateOne(
    { _id: existing.id },
    { $set: { checkOut: now.toISOString(), workHours: hours } },
  );
  return getTodayRecord(employeeId);
}

export async function listForEmployee(
  employeeId: string,
  month?: number,
  year?: number,
) {
  const now = new Date();
  const m = month ?? now.getMonth() + 1;
  const y = year ?? now.getFullYear();
  const prefix = `${y}-${String(m).padStart(2, "0")}-`;
  const rows = await Attendance.find({
    employeeId,
    date: { $regex: `^${prefix}` },
  })
    .sort({ date: 1 })
    .lean();
  return rows.map(toApiRecord);
}

export async function listForDate(date: string, managerId?: string) {
  let employeeIds: string[] | undefined;

  // If a managerId is provided, restrict results to direct reports
  if (managerId) {
    const employees = await Employee.find({
      managerId,
    })
      .select("_id")
      .lean();

    employeeIds = employees.map((employee) => employee._id);
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
  const recentRow = await Attendance.findOne({ date: { $lte: today } })
    .sort({ date: -1 })
    .lean();
  const date = recentRow?.date ?? today;

  const [present, total] = await Promise.all([
    Attendance.countDocuments({
      date,
      status: { $in: ["PRESENT", "WORK_FROM_HOME", "HALF_DAY"] },
    }),
    Employee.countDocuments({ status: "ACTIVE" }),
  ]);

  return { present, total, date, isToday: date === today };
}

export async function requestRegularization(
  employeeId: string,
  date: string,
  note: string,
) {
  const existing = await Attendance.findOne({ employeeId, date }).lean();
  if (existing) {
    await Attendance.updateOne(
      { employeeId, date },
      { $set: { isRegularized: true, note } },
    );
  } else {
    await Attendance.create({
      employeeId,
      date,
      status: "PRESENT",
      isRegularized: true,
      note,
      createdAt: nowIso(),
    });
  }
  const row = await Attendance.findOne({ employeeId, date }).lean();
  return toApiRecord(row);
}

export async function getMonthlyAttendanceTrend(
  months = 6,
  managerId?: string,
) {
  let employeeIds: string[] | undefined;

  // Restrict manager analytics to direct reports
  if (managerId) {
    const employees = await Employee.find({
      managerId,
    })
      .select("_id")
      .lean();

    employeeIds = employees.map((employee) => employee._id);
  }

  const query: Record<string, any> = {};

  if (employeeIds) {
    query.employeeId = { $in: employeeIds };
  }

  const rows = await Attendance.find(query)
    .select("employeeId date status")
    .lean();

  const result: { month: string; presentRate: number }[] = [];

  const today = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);

    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0",
    )}`;

    const monthRows = rows.filter((r) => r.date.startsWith(monthKey));

    const presentCount = monthRows.filter((r) =>
      ["PRESENT", "WORK_FROM_HOME", "HALF_DAY"].includes(r.status),
    ).length;

    const rate = monthRows.length
      ? Math.round((presentCount / monthRows.length) * 100)
      : 0;

    result.push({
      month: d.toLocaleString("en-IN", {
        month: "short",
      }),
      presentRate: rate,
    });
  }

  return result;
}
