import { LeaveType, LeaveBalance, LeaveRequest, Employee } from "@/db/models";
import { nowIso } from "@/db/connection";

function toApiDoc(doc: any) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export async function listLeaveTypes() {
  const rows = await LeaveType.find({}).sort({ name: 1 }).lean();
  return rows.map(toApiDoc);
}

export async function getLeaveType(id: string) {
  const row = await LeaveType.findById(id).lean();
  return toApiDoc(row);
}

export async function getOrCreateBalance(
  employeeId: string,
  leaveTypeId: string,
  year: number,
) {
  let row = await LeaveBalance.findOne({
    employeeId,
    leaveTypeId,
    year,
  }).lean();
  if (!row) {
    const leaveType = await getLeaveType(leaveTypeId);
    await LeaveBalance.create({
      employeeId,
      leaveTypeId,
      year,
      allotted: (leaveType as any)?.defaultDaysPerYear ?? 12,
      used: 0,
      carriedOver: 0,
    });
    row = await LeaveBalance.findOne({ employeeId, leaveTypeId, year }).lean();
  }
  return toApiDoc(row);
}

export async function listBalancesForEmployee(
  employeeId: string,
  year: number,
) {
  const types = (await listLeaveTypes()) as any[];
  const balances = [];
  for (const t of types) {
    balances.push(await getOrCreateBalance(employeeId, t.id, year));
  }
  return balances;
}

export async function listRequests(filters: {
  employeeId?: string;
  status?: string;
  approverId?: string;
}) {
  const query: Record<string, any> = {};
  let employeeIdsForApprover: string[] | undefined;

  if (filters.employeeId) query.employeeId = filters.employeeId;
  if (filters.status) query.status = filters.status;
  if (filters.approverId) {
    const reports = await Employee.find({ managerId: filters.approverId })
      .select("_id")
      .lean();
    employeeIdsForApprover = reports.map((r) => r._id);
    query.employeeId = { $in: employeeIdsForApprover };
  }

  const rows = await LeaveRequest.find(query).sort({ appliedAt: -1 }).lean();
  if (rows.length === 0) return [];

  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
  const leaveTypeIds = [...new Set(rows.map((r) => r.leaveTypeId))];
  const [employees, leaveTypes] = await Promise.all([
    Employee.find({ _id: { $in: employeeIds } }).lean(),
    LeaveType.find({ _id: { $in: leaveTypeIds } }).lean(),
  ]);
  const empMap = new Map(employees.map((e) => [e._id, e]));
  const typeMap = new Map(leaveTypes.map((t) => [t._id, t]));

  return rows.map((r) => {
    const emp = empMap.get(r.employeeId);
    const type = typeMap.get(r.leaveTypeId);
    const { _id, ...rest } = r;
    return {
      id: _id,
      ...rest,
      leaveTypeName: type?.name ?? null,
      leaveTypeColor: type?.colorHex ?? null,
      firstName: emp?.firstName ?? null,
      lastName: emp?.lastName ?? null,
      employeeCode: emp?.employeeCode ?? null,
      avatarUrl: emp?.avatarUrl ?? null,
    };
  });
}

function daysBetweenInclusive(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
}

export async function createRequest(input: {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}) {
  const totalDays = daysBetweenInclusive(input.startDate, input.endDate);
  const doc = await LeaveRequest.create({
    ...input,
    totalDays,
    status: "PENDING",
    appliedAt: nowIso(),
  });
  return toApiDoc((await LeaveRequest.findById(doc._id).lean())!);
}

export async function getRequest(id: string) {
  const row = await LeaveRequest.findById(id).lean();
  return toApiDoc(row);
}

export async function decideRequest(
  id: string,
  approverId: string,
  status: "APPROVED" | "REJECTED",
  decisionNote?: string,
) {
  const request = (await getRequest(id)) as any;
  if (!request) return undefined;

  // A leave request can only be decided once. This also prevents an
  // already-approved request from incrementing the leave balance again.
  if (request.status !== "PENDING") {
    throw new Error(
      `Leave request has already been ${String(request.status).toLowerCase()}.`,
    );
  }

  const employee = await Employee.findById(request.employeeId)
    .select("managerId")
    .lean();

  if (!employee) {
    throw new Error("Employee not found.");
  }

  // Never trust an approver ID supplied by the client. The route passes the
  // authenticated user's employeeId, and it must match the employee's
  // assigned manager before a decision can be made.
  if (String(employee.managerId ?? "") !== String(approverId)) {
    throw new Error(
      "You can only approve or reject leave requests from your direct reports.",
    );
  }

  const updated = await LeaveRequest.findOneAndUpdate(
    {
      _id: id,
      status: "PENDING",
    },
    {
      $set: {
        status,
        approverId,
        decisionNote: decisionNote ?? null,
        decidedAt: nowIso(),
      },
    },
    { new: true },
  ).lean();

  // Another request may have decided this leave between the initial read and
  // the update. Treat that as a conflict rather than applying the decision
  // or changing the balance twice.
  if (!updated) {
    throw new Error("Leave request has already been decided.");
  }

  if (status === "APPROVED") {
    const year = new Date(request.startDate).getFullYear();

    const balance = (await getOrCreateBalance(
      request.employeeId,
      request.leaveTypeId,
      year,
    )) as any;

    await LeaveBalance.updateOne(
      { _id: balance.id },
      { $inc: { used: request.totalDays } },
    );
  }

  return toApiDoc(updated);
}

export async function cancelRequest(id: string, employeeId: string) {
  await LeaveRequest.updateOne(
    { _id: id, employeeId, status: "PENDING" },
    { $set: { status: "CANCELLED", decidedAt: nowIso() } },
  );
  return getRequest(id);
}

export async function getLeaveCalendar(month: number, year: number) {
  const pattern = `${year}-${String(month).padStart(2, "0")}`;
  const rows = await LeaveRequest.find({
    status: "APPROVED",
    $or: [
      { startDate: { $regex: `^${pattern}` } },
      { endDate: { $regex: `^${pattern}` } },
    ],
  }).lean();
  if (rows.length === 0) return [];

  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
  const leaveTypeIds = [...new Set(rows.map((r) => r.leaveTypeId))];
  const [employees, leaveTypes] = await Promise.all([
    Employee.find({ _id: { $in: employeeIds } }).lean(),
    LeaveType.find({ _id: { $in: leaveTypeIds } }).lean(),
  ]);
  const empMap = new Map(employees.map((e) => [e._id, e]));
  const typeMap = new Map(leaveTypes.map((t) => [t._id, t]));

  return rows.map((r) => {
    const emp = empMap.get(r.employeeId);
    const type = typeMap.get(r.leaveTypeId);
    return {
      id: r._id,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      firstName: emp?.firstName ?? null,
      lastName: emp?.lastName ?? null,
      avatarUrl: emp?.avatarUrl ?? null,
      leaveTypeName: type?.name ?? null,
      leaveTypeColor: type?.colorHex ?? null,
    };
  });
}

export async function onLeaveToday() {
  const today = new Date().toISOString().slice(0, 10);
  return LeaveRequest.countDocuments({
    status: "APPROVED",
    startDate: { $lte: today },
    endDate: { $gte: today },
  });
}
