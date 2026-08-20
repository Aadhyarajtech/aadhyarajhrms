import {
  SalaryStructure,
  PayrollRun,
  Payslip,
  Employee,
  LeaveRequest,
  LeaveType,
  Department,
  Designation,
  PayslipRequest,
  User,
  type PayslipRequestPeriod,
} from "@/db/models";
import { nowIso } from "@/db/connection";
import { AppError } from "@/utils/errors";
import { notify } from "@/modules/notifications/notifications.repository";

function toApiDoc(doc: any) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export async function getSalaryStructure(employeeId: string) {
  const row = await SalaryStructure.findOne({ employeeId }).lean();
  return toApiDoc(row);
}

export interface SalaryStructureInput {
  employeeId: string;
  basic: number;
  hra: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  pf: number;
  professionalTax: number;
  incomeTax: number;
}

export async function upsertSalaryStructure(input: SalaryStructureInput) {
  const now = nowIso();
  const existing = await SalaryStructure.findOne({
    employeeId: input.employeeId,
  }).lean();
  if (existing) {
    await SalaryStructure.updateOne(
      { employeeId: input.employeeId },
      { $set: { ...input, effectiveFrom: now } },
    );
  } else {
    await SalaryStructure.create({ ...input, effectiveFrom: now });
  }
  return getSalaryStructure(input.employeeId);
}

export async function listPayrollRuns() {
  const rows = await PayrollRun.find({}).sort({ year: -1, month: -1 }).lean();
  return rows.map(toApiDoc);
}

export async function getPayrollRun(id: string) {
  const row = await PayrollRun.findById(id).lean();
  return toApiDoc(row);
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

/** Processes payroll for every active employee with a salary structure. Idempotent per (month, year). */
export async function processPayrollRun(month: number, year: number) {
  const existing = await PayrollRun.findOne({ month, year }).lean();
  if (existing) return getPayrollRun(existing._id);

  const totalDaysInMonth = daysInMonth(month, year);
  const employees = await Employee.find({
    status: { $in: ["ACTIVE", "NOTICE_PERIOD"] },
  }).lean();
  const employeeIds = employees.map((e) => e._id);
  const structures = await SalaryStructure.find({
    employeeId: { $in: employeeIds },
  }).lean();
  const structureMap = new Map(structures.map((s) => [s.employeeId, s]));

  const run = await PayrollRun.create({
    month,
    year,
    status: "PROCESSED",
    totalGross: 0,
    totalDeductions: 0,
    totalNet: 0,
    headcount: 0,
  });

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  let headcount = 0;
  const pattern = `${year}-${String(month).padStart(2, "0")}`;

  for (const emp of employees) {
    const structure = structureMap.get(emp._id);
    if (!structure) continue;
    headcount += 1;

    const unpaidLeaveTypes = await LeaveType.find({ isPaid: false })
      .select("_id")
      .lean();
    const unpaidLeaveTypeIds = unpaidLeaveTypes.map((t) => t._id);
    const unpaidRequests = await LeaveRequest.find({
      employeeId: emp._id,
      status: "APPROVED",
      leaveTypeId: { $in: unpaidLeaveTypeIds },
      $or: [
        { startDate: { $regex: `^${pattern}` } },
        { endDate: { $regex: `^${pattern}` } },
      ],
    }).lean();
    const unpaidDays = unpaidRequests.reduce((sum, r) => sum + r.totalDays, 0);

    const daysPayable = Math.max(totalDaysInMonth - unpaidDays, 0);
    const perDayGross =
      (structure.basic +
        structure.hra +
        structure.conveyance +
        structure.medical +
        structure.specialAllowance) /
      totalDaysInMonth;
    const lop = Math.round(perDayGross * unpaidDays * 100) / 100;

    const grossEarnings =
      structure.basic +
      structure.hra +
      structure.conveyance +
      structure.medical +
      structure.specialAllowance;
    const deductions =
      structure.pf + structure.professionalTax + structure.incomeTax + lop;
    const netPay = Math.round((grossEarnings - deductions) * 100) / 100;

    await Payslip.create({
      payrollRunId: run._id,
      employeeId: emp._id,
      basic: structure.basic,
      hra: structure.hra,
      conveyance: structure.conveyance,
      medical: structure.medical,
      specialAllowance: structure.specialAllowance,
      grossEarnings,
      pf: structure.pf,
      professionalTax: structure.professionalTax,
      incomeTax: structure.incomeTax,
      lop,
      totalDeductions: deductions,
      netPay,
      daysPayable,
      daysInMonth: totalDaysInMonth,
    });

    totalGross += grossEarnings;
    totalDeductions += deductions;
    totalNet += netPay;
  }

  await PayrollRun.updateOne(
    { _id: run._id },
    {
      $set: {
        totalGross,
        totalDeductions,
        totalNet,
        headcount,
        processedAt: nowIso(),
      },
    },
  );

  return getPayrollRun(run._id);
}

export async function markRunPaid(id: string) {
  await PayrollRun.updateOne(
    { _id: id },
    { $set: { status: "PAID", processedAt: nowIso() } },
  );
  return getPayrollRun(id);
}

export async function listPayslipsForRun(runId: string) {
  const rows = await Payslip.find({ payrollRunId: runId }).lean();
  if (rows.length === 0) return [];

  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
  const employees = await Employee.find({ _id: { $in: employeeIds } }).lean();
  const empMap = new Map(employees.map((e) => [e._id, e]));
  const departmentIds = [...new Set(employees.map((e) => e.departmentId))];
  const departments = await Department.find({
    _id: { $in: departmentIds },
  }).lean();
  const deptMap = new Map(departments.map((d) => [d._id, d]));

  return rows
    .map((r) => {
      const emp = empMap.get(r.employeeId);
      return {
        id: r._id,
        ...r,
        firstName: emp?.firstName ?? null,
        lastName: emp?.lastName ?? null,
        employeeCode: emp?.employeeCode ?? null,
        departmentName: emp
          ? (deptMap.get(emp.departmentId)?.name ?? null)
          : null,
      };
    })
    .sort((a, b) => (a.firstName ?? "").localeCompare(b.firstName ?? ""));
}

export async function listPayslipsForEmployee(employeeId: string) {
  const rows = await Payslip.find({ employeeId }).lean();
  if (rows.length === 0) return [];

  const runIds = [...new Set(rows.map((r) => r.payrollRunId))];
  const runs = await PayrollRun.find({ _id: { $in: runIds } }).lean();
  const runMap = new Map(runs.map((r) => [r._id, r]));

  return rows
    .map((r) => {
      const run = runMap.get(r.payrollRunId);
      return {
        id: r._id,
        ...r,
        month: run?.month ?? null,
        year: run?.year ?? null,
        runStatus: run?.status ?? null,
      };
    })
    .sort(
      (a, b) =>
        (b.year ?? 0) - (a.year ?? 0) || (b.month ?? 0) - (a.month ?? 0),
    );
}

export async function getPayslip(id: string) {
  const row = await Payslip.findById(id).lean();
  if (!row) return undefined;
  const [run, employee] = await Promise.all([
    PayrollRun.findById(row.payrollRunId).lean(),
    Employee.findById(row.employeeId).lean(),
  ]);
  const [designation, department] = await Promise.all([
    employee ? Designation.findById(employee.designationId).lean() : null,
    employee ? Department.findById(employee.departmentId).lean() : null,
  ]);

  return {
    id: row._id,
    ...row,
    month: run?.month ?? null,
    year: run?.year ?? null,
    runStatus: run?.status ?? null,
    firstName: employee?.firstName ?? null,
    lastName: employee?.lastName ?? null,
    employeeCode: employee?.employeeCode ?? null,
    designationTitle: designation?.title ?? null,
    departmentName: department?.name ?? null,
  };
}

export async function getCostTrend(months = 6) {
  const rows = await PayrollRun.find({})
    .select("month year totalNet")
    .sort({ year: -1, month: -1 })
    .limit(months)
    .lean();
  return rows.reverse().map(toApiDoc);
}

// ---------------------------------------------------------------------------
// Payslip requests
// ---------------------------------------------------------------------------

const PAYSLIP_REQUEST_PERIOD_MONTHS: Record<PayslipRequestPeriod, number> = {
  "3_MONTHS": 3,
  "6_MONTHS": 6,
  "12_MONTHS": 12,
};

const PAYSLIP_REQUEST_PERIOD_LABELS: Record<PayslipRequestPeriod, string> = {
  "3_MONTHS": "the last 3 months",
  "6_MONTHS": "the last 6 months",
  "12_MONTHS": "the last 1 year",
};

function withEmployeeInfo<T extends { employeeId: string }>(row: T, emp: any) {
  return {
    ...row,
    firstName: emp?.firstName ?? null,
    lastName: emp?.lastName ?? null,
    employeeCode: emp?.employeeCode ?? null,
  };
}

/** Determines the latest N available payslips for an employee's requested period, newest first. */
async function resolvePeriodPayslips(
  employeeId: string,
  period: PayslipRequestPeriod,
) {
  const count = PAYSLIP_REQUEST_PERIOD_MONTHS[period];
  const all = await listPayslipsForEmployee(employeeId);
  return all.slice(0, count);
}

export async function createPayslipRequest(
  employeeId: string,
  requestedByUserId: string,
  period: PayslipRequestPeriod,
) {
  const existing = await PayslipRequest.findOne({
    employeeId,
    period,
    status: "PENDING",
  }).lean();
  if (existing)
    throw AppError.badRequest("A similar payslip request is already pending.");

  const now = nowIso();
  const doc = await PayslipRequest.create({
    employeeId,
    requestedByUserId,
    period,
    status: "PENDING",
    payslipIds: [],
    processedByUserId: null,
    requestedAt: now,
    completedAt: null,
  });

  const employee = await Employee.findById(employeeId).lean();
  const employeeName = employee
    ? `${employee.firstName} ${employee.lastName}`
    : "An employee";
  const admins = await User.find({
    role: { $in: ["SUPER_ADMIN", "HR_ADMIN"] },
    isActive: true,
  })
    .select("_id")
    .lean();
  await Promise.all(
    admins.map((admin) =>
      notify({
        userId: admin._id,
        type: "PAYROLL",
        title: "New Payslip Request",
        message: `${employeeName} requested payslips for ${PAYSLIP_REQUEST_PERIOD_LABELS[period]}.`,
        link: "/payroll?tab=requests",
      }),
    ),
  );

  return getPayslipRequest(doc._id);
}

export async function listMyPayslipRequests(employeeId: string) {
  const rows = await PayslipRequest.find({ employeeId })
    .sort({ requestedAt: -1 })
    .lean();
  return rows.map(toApiDoc);
}

export async function listPayslipRequests() {
  const rows = await PayslipRequest.find({}).sort({ requestedAt: -1 }).lean();
  if (rows.length === 0) return [];

  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
  const employees = await Employee.find({ _id: { $in: employeeIds } }).lean();
  const empMap = new Map(employees.map((e) => [e._id, e]));

  return rows.map((r) =>
    withEmployeeInfo(toApiDoc(r)!, empMap.get(r.employeeId)),
  );
}

export async function getPayslipRequest(id: string) {
  const row = await PayslipRequest.findById(id).lean();
  if (!row) return undefined;

  const employee = await Employee.findById(row.employeeId).lean();
  const allPayslips = await listPayslipsForEmployee(row.employeeId);
  const availablePayslips =
    row.status === "PENDING"
      ? allPayslips.slice(
          0,
          PAYSLIP_REQUEST_PERIOD_MONTHS[row.period as PayslipRequestPeriod],
        )
      : allPayslips.filter((p) => row.payslipIds.includes(p.id));

  return {
    ...withEmployeeInfo(toApiDoc(row)!, employee),
    availablePayslips,
  };
}

/** HR/Admin fulfils a pending request: resolves the employee's latest available payslips for the period and marks the request SENT. */
export async function sendPayslipRequest(id: string, adminUserId: string) {
  const request = await PayslipRequest.findById(id).lean();
  if (!request) throw AppError.notFound("Payslip request not found.");
  if (request.status !== "PENDING")
    throw AppError.badRequest("Request has already been processed.");

  const employee = await Employee.findById(request.employeeId).lean();
  if (!employee) throw AppError.notFound("Employee not found.");

  const payslips = await resolvePeriodPayslips(
    request.employeeId,
    request.period as PayslipRequestPeriod,
  );
  if (payslips.length === 0)
    throw AppError.badRequest("No payslips are available for this employee.");

  // Defense in depth: every resolved payslip must belong to the requesting employee.
  const ownedPayslips = payslips.filter(
    (p) => p.employeeId === request.employeeId,
  );
  if (ownedPayslips.length !== payslips.length) {
    throw AppError.badRequest("Payslip does not belong to this employee.");
  }
  const payslipIds = ownedPayslips.map((p) => p.id);

  const now = nowIso();
  await PayslipRequest.updateOne(
    { _id: id },
    {
      $set: {
        status: "SENT",
        payslipIds,
        processedByUserId: adminUserId,
        completedAt: now,
      },
    },
  );

  await notify({
    userId: employee.userId,
    type: "PAYROLL",
    title: "Payslips Ready",
    message: "Your requested payslips are now available.",
    link: "/payroll",
  });

  return getPayslipRequest(id);
}
