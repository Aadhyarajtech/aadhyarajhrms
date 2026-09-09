import { LeaveType, LeaveBalance, LeaveRequest, Employee, User } from "@/db/models";
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
  excludeEmployeeId?: string;
}) {
  const query: Record<string, any> = {};
  let employeeIdsForApprover: string[] | undefined;

  if (filters.employeeId) query.employeeId = filters.employeeId;
  if (filters.status) query.status = filters.status;
  if (filters.excludeEmployeeId) {
    query.employeeId = { $ne: filters.excludeEmployeeId };
  }
  if (filters.approverId) {
    const reports = await Employee.find({ managerId: filters.approverId })
      .select("_id")
      .lean();
    employeeIdsForApprover = reports.map((r) => r._id);
    query.employeeId = { $in: employeeIdsForApprover };
    if (filters.excludeEmployeeId) {
      query.employeeId = {
        $in: employeeIdsForApprover,
        $ne: filters.excludeEmployeeId,
      };
    }
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

  /*
   * Authorization:
   *
   * SUPER_ADMIN and HR_ADMIN are allowed to approve/reject organization-wide
   * leave requests. MANAGER is restricted to their own direct reports.
   *
   * approverId is the authenticated user's employeeId (see leave.routes.ts).
   * Resolve that employee to its linked User record so the actual RBAC role
   * is checked here as well. This keeps authorization enforced at the data
   * layer instead of relying only on the route middleware.
   */
  const approverEmployee = await Employee.findById(approverId)
    .select("_id userId")
    .lean();

  if (!approverEmployee) {
    throw new Error("Approver employee profile not found.");
  }

  const approverUser = await User.findById(approverEmployee.userId)
    .select("role isActive")
    .lean();

  if (!approverUser) {
    throw new Error("Approver user account not found.");
  }

  if (approverUser.isActive === false) {
    throw new Error("Approver account is inactive.");
  }

  const isAdmin =
    approverUser.role === "SUPER_ADMIN" ||
    approverUser.role === "HR_ADMIN";

  const isSelfRequest =
    String(request.employeeId) === String(approverEmployee._id);

  if (isSelfRequest) {
    throw new Error(
      "You cannot approve or reject your own leave request.",
    );
  }

  const isDirectReport =
    String(employee.managerId ?? "") === String(approverEmployee._id);

  if (!isAdmin && approverUser.role !== "MANAGER") {
    throw new Error(
      "You do not have permission to approve or reject leave requests.",
    );
  }

  if (!isAdmin && !isDirectReport) {
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
