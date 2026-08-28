import {
  Attendance,
  AttendanceRegularizationRequest,
  Employee,
  Department,
} from "@/db/models";
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Invalid attendance date.");
  }

  let employeeIds: string[] | undefined;

  // If a managerId is provided, restrict results to direct reports.
  // An empty direct-report list must return no records, never organization-wide
  // attendance.
  if (managerId) {
    const employees = await Employee.find({
      managerId,
      status: "ACTIVE",
    })
      .select("_id")
      .lean();

    employeeIds = employees.map((employee) => employee._id);

    if (employeeIds.length === 0) {
      return [];
    }
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
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) {
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

  const attendance = await Attendance.findOne({
    employeeId,
    date,
  }).lean();

  const requestedCheckIn = attendance?.checkIn ?? null;
  const requestedCheckOut = attendance?.checkOut ?? null;
  const requestedStatus = attendance?.status ?? "PRESENT";
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
  });

  return toApiRecord(request.toObject());
}

export async function listTeamRegularizationRequests(
  managerId: string,
  status?: string,
) {
  const employees = await Employee.find({
    managerId,
    status: "ACTIVE",
  })
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
) {
  const request = await AttendanceRegularizationRequest.findOne({
    _id: requestId,
    status: "PENDING",
  }).lean();

  if (!request) {
    throw new Error("Pending regularization request not found.");
  }

  const employee = await Employee.findOne({
    _id: request.employeeId,
    managerId,
    status: "ACTIVE",
  }).lean();

  if (!employee) {
    throw new Error(
      "You are not authorized to approve this regularization request.",
    );
  }

  const now = nowIso();
  const note = decisionNote.trim();

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
          status: request.requestedStatus,
          isRegularized: true,
          note: request.reason,
        },
      },
    );
  } else {
    attendance = await Attendance.create({
      employeeId: request.employeeId,
      date: request.date,
      checkIn: request.requestedCheckIn,
      checkOut: request.requestedCheckOut,
      status: request.requestedStatus,
      isRegularized: true,
      note: request.reason,
      createdAt: now,
    });
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
      },
    },
    { new: true },
  ).lean();

  if (!updatedRequest) {
    throw new Error("Regularization request was already processed.");
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

  const employee = await Employee.findOne({
    _id: request.employeeId,
    managerId,
    status: "ACTIVE",
  }).lean();

  if (!employee) {
    throw new Error(
      "You are not authorized to reject this regularization request.",
    );
  }

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
        decidedAt: nowIso(),
      },
    },
    { new: true },
  ).lean();

  if (!updatedRequest) {
    throw new Error("Regularization request was already processed.");
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

  // Restrict Manager analytics to active direct reports only.
  if (managerId) {
    const employees = await Employee.find({
      managerId,
      status: "ACTIVE",
    })
      .select("_id")
      .lean();

    employeeIds = employees.map((employee) => employee._id);

    if (employeeIds.length === 0) {
      return Array.from({ length: months }, (_, index) => {
        const today = new Date();
        const d = new Date(
          today.getFullYear(),
          today.getMonth() - (months - 1 - index),
          1,
        );

        return {
          month: d.toLocaleString("en-IN", { month: "short" }),
          presentRate: 0,
        };
      });
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
