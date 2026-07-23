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

export async function getOrCreateBalance(employeeId: string, leaveTypeId: string, year: number) {
  let row = await LeaveBalance.findOne({ employeeId, leaveTypeId, year }).lean();
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

export async function listBalancesForEmployee(employeeId: string, year: number) {
  const types = (await listLeaveTypes()) as any[];
  const balances = [];
  for (const t of types) {
    balances.push(await getOrCreateBalance(employeeId, t.id, year));
  }
  return balances;
}

export async function listRequests(filters: { employeeId?: string; status?: string; approverId?: string }) {
  const query: Record<string, any> = {};
  let employeeIdsForApprover: string[] | undefined;

  if (filters.employeeId) query.employeeId = filters.employeeId;
  if (filters.status) query.status = filters.status;
  if (filters.approverId) {
    const reports = await Employee.find({ managerId: filters.approverId }).select("_id").lean();
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
  decisionNote?: string
) {
  const request = (await getRequest(id)) as any;
  if (!request) return undefined;

  await LeaveRequest.updateOne(
    { _id: id },
    { $set: { status, approverId, decisionNote: decisionNote ?? null, decidedAt: nowIso() } }
  );

  if (status === "APPROVED") {
    const year = new Date(request.startDate).getFullYear();
    const balance = (await getOrCreateBalance(request.employeeId, request.leaveTypeId, year)) as any;
    await LeaveBalance.updateOne({ _id: balance.id }, { $inc: { used: request.totalDays } });
  }

  return getRequest(id);
}

export async function cancelRequest(id: string, employeeId: string) {
  await LeaveRequest.updateOne(
    { _id: id, employeeId, status: "PENDING" },
    { $set: { status: "CANCELLED", decidedAt: nowIso() } }
  );
  return getRequest(id);
}

export async function getLeaveCalendar(month: number, year: number) {
  const pattern = `${year}-${String(month).padStart(2, "0")}`;
  const rows = await LeaveRequest.find({
    status: "APPROVED",
    $or: [{ startDate: { $regex: `^${pattern}` } }, { endDate: { $regex: `^${pattern}` } }],
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
  return LeaveRequest.countDocuments({ status: "APPROVED", startDate: { $lte: today }, endDate: { $gte: today } });
}
