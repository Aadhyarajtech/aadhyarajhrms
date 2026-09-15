import {
  SalaryStructure,
  PayrollRun,
  Payslip,
  Attendance,
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
import { calculateAnnualTax, type TaxRegime } from "./payroll.tax";
import { getKpiAchievementPercentage } from "./payroll.performance";

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
  ctc?: number;
  basicPercentage?: number;
  hraPercentage?: number;
  basic: number;
  hra: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  performanceBonus?: number;
  advanceRecovery?: number;
  overtimeRate?: number;
  pf?: number;
  professionalTax?: number;
  incomeTax?: number;
  taxRegime?: TaxRegime;
  taxYear?: number;
  taxOtherIncome?: number;
  taxHraExemption?: number;
  taxDeduction80C?: number;
  taxDeduction80D?: number;
  taxDeduction80CCD1B?: number;
  taxDeduction80TTA?: number;
  taxPreviousTds?: number;
}

export async function upsertSalaryStructure(input: SalaryStructureInput) {
  const now = nowIso();
  const suppliedCtc = Number(input.ctc ?? 0);
  const basicPercentage = Number(input.basicPercentage ?? 50);
  const hraPercentage = Number(input.hraPercentage ?? 40);
  if (suppliedCtc > 0) {
    if (basicPercentage < 40 || basicPercentage > 50) {
      throw AppError.badRequest(
        "Basic percentage must be between 40% and 50% of CTC.",
      );
    }
    if (hraPercentage < 20 || hraPercentage > 40) {
      throw AppError.badRequest(
        "HRA percentage must be between 20% and 40% of Basic.",
      );
    }
  }

  const monthlyCtc = suppliedCtc > 0 ? suppliedCtc / 12 : 0;
  const basic =
    suppliedCtc > 0
      ? roundMoney((monthlyCtc * basicPercentage) / 100)
      : Math.max(0, Number(input.basic ?? 0));
  const hra =
    suppliedCtc > 0
      ? roundMoney((basic * hraPercentage) / 100)
      : Math.max(0, Number(input.hra ?? 0));
  const conveyance = Math.max(0, Number(input.conveyance ?? 0));
  const medical = Math.max(0, Number(input.medical ?? 0));
  const specialAllowance =
    suppliedCtc > 0
      ? roundMoney(monthlyCtc - basic - hra - conveyance - medical)
      : Math.max(0, Number(input.specialAllowance ?? 0));

  if (suppliedCtc > 0 && specialAllowance < 0) {
    throw AppError.badRequest(
      "The configured CTC is too low for Basic, HRA, Conveyance and Medical components.",
    );
  }

  const normalized = {
    ...input,
    ctc:
      suppliedCtc > 0
        ? roundMoney(suppliedCtc)
        : roundMoney(
            (basic +
              hra +
              conveyance +
              medical +
              Math.max(0, Number(input.specialAllowance ?? 0))) *
              12,
          ),
    basicPercentage:
      suppliedCtc > 0
        ? basicPercentage
        : Math.min(
            50,
            Math.max(
              40,
              roundMoney(
                (basic /
                  Math.max(
                    basic +
                      hra +
                      conveyance +
                      medical +
                      Math.max(0, Number(input.specialAllowance ?? 0)),
                    1,
                  )) *
                  100,
              ),
            ),
          ),
    hraPercentage:
      suppliedCtc > 0
        ? hraPercentage
        : Math.min(
            40,
            Math.max(20, roundMoney((hra / Math.max(basic, 1)) * 100)),
          ),
    basic,
    hra,
    conveyance,
    medical,
    specialAllowance,
    performanceBonus: Math.max(0, Number(input.performanceBonus ?? 0)),
    advanceRecovery: Math.max(0, Number(input.advanceRecovery ?? 0)),
    overtimeRate: Math.max(0, Number(input.overtimeRate ?? 1.5)),
    pf: 0,
    professionalTax: Math.max(0, Number(input.professionalTax ?? 0)),
    incomeTax: 0,
    taxRegime: input.taxRegime === "OLD" ? "OLD" : "NEW",
    taxYear: Math.max(2020, Number(input.taxYear ?? 2026)),
    taxOtherIncome: Math.max(0, Number(input.taxOtherIncome ?? 0)),
    taxHraExemption: Math.max(0, Number(input.taxHraExemption ?? 0)),
    taxDeduction80C: Math.max(0, Number(input.taxDeduction80C ?? 0)),
    taxDeduction80D: Math.max(0, Number(input.taxDeduction80D ?? 0)),
    taxDeduction80CCD1B: Math.max(0, Number(input.taxDeduction80CCD1B ?? 0)),
    taxDeduction80TTA: Math.max(0, Number(input.taxDeduction80TTA ?? 0)),
    taxPreviousTds: Math.max(0, Number(input.taxPreviousTds ?? 0)),
  };
  const existing = await SalaryStructure.findOne({
    employeeId: input.employeeId,
  }).lean();
  if (existing) {
    await SalaryStructure.updateOne(
      { employeeId: input.employeeId },
      { $set: { ...normalized, effectiveFrom: now } },
    );
  } else {
    await SalaryStructure.create({ ...normalized, effectiveFrom: now });
  }
  return getSalaryStructure(input.employeeId);
}

export async function previewTax(input: {
  employeeId: string;
  basic: number;
  hra: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  performanceBonus?: number;
  taxRegime?: TaxRegime;
  taxYear?: number;
  taxOtherIncome?: number;
  taxHraExemption?: number;
  taxDeduction80C?: number;
  taxDeduction80D?: number;
  taxDeduction80CCD1B?: number;
  taxDeduction80TTA?: number;
}) {
  const employee = await Employee.findById(input.employeeId)
    .select("dateOfBirth")
    .lean();
  if (!employee) throw AppError.notFound("Employee not found.");

  const monthlySalaryIncome = roundMoney(
    Math.max(0, Number(input.basic ?? 0)) +
      Math.max(0, Number(input.hra ?? 0)) +
      Math.max(0, Number(input.conveyance ?? 0)) +
      Math.max(0, Number(input.medical ?? 0)) +
      Math.max(0, Number(input.specialAllowance ?? 0)) +
      Math.max(0, Number(input.performanceBonus ?? 0)),
  );
  const taxYear = Math.max(2020, Number(input.taxYear ?? 2026));
  const regime = input.taxRegime === "OLD" ? "OLD" : "NEW";
  return calculateAnnualTax({
    taxYear,
    regime,
    dateOfBirth: employee.dateOfBirth,
    monthlySalaryIncome,
    declarations: {
      otherIncome: input.taxOtherIncome,
      hraExemption: input.taxHraExemption,
      deduction80C: input.taxDeduction80C,
      deduction80D: input.taxDeduction80D,
      deduction80CCD1B: input.taxDeduction80CCD1B,
      deduction80TTA: input.taxDeduction80TTA,
    },
  });
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

function roundMoney(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

/**
 * Older payslips may not contain the annual tax fields because those fields
 * were added after the payslip was originally generated. Keep existing valid
 * values untouched and calculate missing values from the stored gross salary.
 */
function getPayslipTaxDetails(
  row: any,
  employee: any,
  runMonth: number,
  runYear: number,
) {
  const storedTaxableIncome = Number(row.taxableIncome);
  const storedAnnualTax = Number(row.annualTax);

  if (
    Number.isFinite(storedTaxableIncome) &&
    Number.isFinite(storedAnnualTax)
  ) {
    return {
      taxableIncome: storedTaxableIncome,
      annualTax: storedAnnualTax,
    };
  }

  const taxYear = Number(
    row.taxYear ?? (runMonth >= 4 ? runYear : runYear - 1),
  );
  const taxRegime: TaxRegime = row.taxRegime === "OLD" ? "OLD" : "NEW";
  const monthlySalaryIncome = Math.max(0, Number(row.grossEarnings ?? 0));

  const tax = calculateAnnualTax({
    taxYear,
    regime: taxRegime,
    dateOfBirth: employee?.dateOfBirth,
    monthlySalaryIncome,
  });

  return {
    taxableIncome: tax.taxableIncome,
    annualTax: tax.annualTax,
  };
}

function monthPrefix(month: number, year: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export async function lockAttendanceForPayroll(month: number, year: number) {
  let run = await PayrollRun.findOne({ month, year }).lean();
  const now = nowIso();
  if (run && run.status !== "DRAFT") {
    if (run.status === "ATTENDANCE_LOCKED") return getPayrollRun(run._id);
    throw AppError.badRequest(
      "This payroll period has already moved past attendance lock.",
    );
  }
  if (!run) {
    run = await PayrollRun.create({
      month,
      year,
      status: "ATTENDANCE_LOCKED",
      attendanceLockedAt: now,
    });
  } else {
    await PayrollRun.updateOne(
      { _id: run._id },
      { $set: { status: "ATTENDANCE_LOCKED", attendanceLockedAt: now } },
    );
  }
  return getPayrollRun(run._id);
}

function calculateProfessionalTax(
  state: string | null | undefined,
  grossMonthly: number,
): number {
  const normalizedState = String(state ?? "")
    .trim()
    .toLowerCase();
  // Common monthly slabs used for the states currently represented by the HRMS employee profile.
  if (["telangana", "andhra pradesh"].includes(normalizedState)) {
    if (grossMonthly <= 15000) return 0;
    if (grossMonthly <= 20000) return 150;
    return 200;
  }
  if (normalizedState === "karnataka") {
    return grossMonthly > 15000 ? 200 : 0;
  }
  if (normalizedState === "maharashtra") {
    return grossMonthly <= 7500 ? 0 : grossMonthly <= 10000 ? 175 : 200;
  }
  // If the employee's state has no configured slab, preserve an explicitly
  // configured PT amount rather than inventing a state rule.
  return -1;
}

/** Processes payroll after attendance is locked. PF and ESI are automatic; TDS remains a declared monthly amount until tax declarations are available. */
export async function processPayrollRun(month: number, year: number) {
  let run = await PayrollRun.findOne({ month, year }).lean();
  if (
    run?.status === "PAID" ||
    run?.status === "APPROVED" ||
    run?.status === "HR_REVIEW"
  )
    return getPayrollRun(run._id);
  if (!run || run.status === "DRAFT") {
    await lockAttendanceForPayroll(month, year);
    run = await PayrollRun.findOne({ month, year }).lean();
  }
  if (!run || run.status !== "ATTENDANCE_LOCKED")
    throw AppError.badRequest(
      "Attendance must be locked before payroll processing.",
    );

  const totalDaysInMonth = daysInMonth(month, year);
  const employees = await Employee.find({
    status: { $in: ["ACTIVE", "NOTICE_PERIOD"] },
  }).lean();
  const employeeIds = employees.map((e) => e._id);
  const structures = await SalaryStructure.find({
    employeeId: { $in: employeeIds },
  }).lean();
  const structureMap = new Map(structures.map((s) => [s.employeeId, s]));
  const unpaidLeaveTypes = await LeaveType.find({ isPaid: false })
    .select("_id")
    .lean();
  const unpaidLeaveTypeIds = unpaidLeaveTypes.map((t) => t._id);
  const prefix = monthPrefix(month, year);
  const attendanceRows = await Attendance.find({
    employeeId: { $in: employeeIds },
    date: { $regex: `^${prefix}-` },
  }).lean();
  const attendanceMap = new Map<string, typeof attendanceRows>();
  for (const row of attendanceRows) {
    const list = attendanceMap.get(row.employeeId) ?? [];
    list.push(row);
    attendanceMap.set(row.employeeId, list);
  }

  await Payslip.deleteMany({ payrollRunId: run._id });
  let totalGross = 0,
    totalDeductions = 0,
    totalNet = 0,
    headcount = 0;

  for (const emp of employees) {
    const structure = structureMap.get(emp._id);
    if (!structure) continue;
    headcount++;
    const unpaidRequests = await LeaveRequest.find({
      employeeId: emp._id,
      status: "APPROVED",
      leaveTypeId: { $in: unpaidLeaveTypeIds },
      $or: [
        { startDate: { $regex: `^${prefix}` } },
        { endDate: { $regex: `^${prefix}` } },
      ],
    }).lean();
    const leaveLopDays = unpaidRequests.reduce(
      (sum, r) => sum + r.totalDays,
      0,
    );
    const attendance = attendanceMap.get(emp._id) ?? [];
    const absentDays = attendance.filter((a) => a.status === "ABSENT").length;
    const halfDays = attendance.filter((a) => a.status === "HALF_DAY").length;
    const attendanceLopDays = absentDays + halfDays * 0.5;
    const lopDays = Math.max(leaveLopDays, attendanceLopDays);

    const fixedGross =
      structure.basic +
      structure.hra +
      structure.conveyance +
      structure.medical +
      structure.specialAllowance;
    const configuredPerformanceBonus = roundMoney(
      structure.performanceBonus ?? 0,
    );
    const kpiAchievementPercentage = await getKpiAchievementPercentage(emp._id);
    const performanceBonus = roundMoney(
      kpiAchievementPercentage === null
        ? configuredPerformanceBonus
        : configuredPerformanceBonus * (kpiAchievementPercentage / 100),
    );
    const overtimeHours = roundMoney(
      attendance.reduce((sum, a) => sum + Math.max(0, a.overtimeHours || 0), 0),
    );
    const overtimeRate = Math.max(0, Number(structure.overtimeRate ?? 1.5));
    const hourlyBasic = structure.basic / Math.max(totalDaysInMonth, 1) / 8;
    const overtimeAmount = roundMoney(
      overtimeHours * hourlyBasic * overtimeRate,
    );
    const grossEarnings = roundMoney(
      fixedGross + performanceBonus + overtimeAmount,
    );
    const lop = roundMoney(
      (fixedGross / Math.max(totalDaysInMonth, 1)) * lopDays,
    );

    const pf = roundMoney(structure.basic * 0.12);
    const automaticProfessionalTax = calculateProfessionalTax(
      emp.state,
      grossEarnings,
    );
    const professionalTax = roundMoney(
      automaticProfessionalTax >= 0
        ? automaticProfessionalTax
        : Number(structure.professionalTax ?? 0),
    );
    const monthlyTaxableSalaryBase = roundMoney(
      fixedGross + performanceBonus + overtimeAmount,
    );
    const taxYear = Number(structure.taxYear ?? (month >= 4 ? year : year - 1));
    const taxRegime = structure.taxRegime === "OLD" ? "OLD" : "NEW";
    const tax = calculateAnnualTax({
      taxYear,
      regime: taxRegime,
      dateOfBirth: emp.dateOfBirth,
      monthlySalaryIncome: monthlyTaxableSalaryBase,
      declarations: {
        otherIncome: structure.taxOtherIncome,
        hraExemption: Math.min(
          Number(structure.taxHraExemption ?? 0),
          Math.max(0, Number(structure.hra ?? 0)) * 12,
        ),
        deduction80C: structure.taxDeduction80C,
        deduction80D: structure.taxDeduction80D,
        deduction80CCD1B: structure.taxDeduction80CCD1B,
        deduction80TTA: structure.taxDeduction80TTA,
      },
    });
    const fyStartMonth = 4;
    const monthsElapsed =
      month >= fyStartMonth ? month - fyStartMonth : month + 12 - fyStartMonth;
    const monthsRemaining = Math.max(1, 12 - monthsElapsed);
    const priorRunQuery =
      month >= 4
        ? { year: taxYear, month: { $gte: 4, $lt: month } }
        : {
            $or: [
              { year: taxYear, month: { $gte: 4 } },
              { year: taxYear + 1, month: { $lt: month } },
            ],
          };
    const priorRunRows = await PayrollRun.find({
      _id: { $ne: run._id },
      ...priorRunQuery,
    })
      .select("_id")
      .lean();
    const priorRunIds = priorRunRows.map((r) => r._id);
    const previousPayslips = priorRunIds.length
      ? await Payslip.find({
          employeeId: emp._id,
          payrollRunId: { $in: priorRunIds },
        }).lean()
      : [];
    const previousTdsInTaxYear = previousPayslips
      .filter((p) => p.taxYear === taxYear)
      .reduce((sum, p) => sum + Number(p.incomeTax || 0), 0);
    const priorDeclaredTds = Math.max(0, Number(structure.taxPreviousTds ?? 0));
    const annualTaxRemaining = Math.max(
      0,
      tax.annualTax - previousTdsInTaxYear - priorDeclaredTds,
    );
    const incomeTax = roundMoney(annualTaxRemaining / monthsRemaining);
    const esi = roundMoney(grossEarnings * 0.0075);
    const advanceRecovery = roundMoney(structure.advanceRecovery ?? 0);
    const deductions = roundMoney(
      pf + professionalTax + incomeTax + esi + lop + advanceRecovery,
    );
    const netPay = roundMoney(grossEarnings - deductions);
    const daysPayable = Math.max(totalDaysInMonth - lopDays, 0);

    await Payslip.create({
      payrollRunId: run._id,
      employeeId: emp._id,
      basic: structure.basic,
      hra: structure.hra,
      conveyance: structure.conveyance,
      medical: structure.medical,
      specialAllowance: structure.specialAllowance,
      performanceBonus,
      overtimeHours,
      overtimeAmount,
      grossEarnings,
      pf,
      professionalTax,
      incomeTax,
      taxRegime,
      taxYear,
      taxableIncome: tax.taxableIncome,
      annualTax: tax.annualTax,
      esi,
      lop,
      advanceRecovery,
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
        status: "PROCESSED",
        totalGross: roundMoney(totalGross),
        totalDeductions: roundMoney(totalDeductions),
        totalNet: roundMoney(totalNet),
        headcount,
        processedAt: nowIso(),
      },
    },
  );
  return getPayrollRun(run._id);
}

export async function submitPayrollForReview(id: string, userId: string) {
  const run = await PayrollRun.findById(id).lean();
  if (!run) throw AppError.notFound("Payroll run not found.");
  if (run.status !== "PROCESSED")
    throw AppError.badRequest(
      "Only processed payroll can be submitted for HR review.",
    );
  await PayrollRun.updateOne(
    { _id: id },
    {
      $set: {
        status: "HR_REVIEW",
        reviewedAt: nowIso(),
        reviewedByUserId: userId,
      },
    },
  );
  return getPayrollRun(id);
}

export async function approvePayrollRun(id: string, userId: string) {
  const run = await PayrollRun.findById(id).lean();
  if (!run) throw AppError.notFound("Payroll run not found.");
  if (run.status !== "HR_REVIEW")
    throw AppError.badRequest("Payroll must be in HR review before approval.");
  await PayrollRun.updateOne(
    { _id: id },
    {
      $set: {
        status: "APPROVED",
        approvedAt: nowIso(),
        approvedByUserId: userId,
      },
    },
  );
  return getPayrollRun(id);
}

export async function markRunPaid(id: string, userId?: string) {
  const run = await PayrollRun.findById(id).lean();
  if (!run) throw AppError.notFound("Payroll run not found.");
  if (run.status !== "APPROVED")
    throw AppError.badRequest(
      "Payroll must be approved before it can be marked paid.",
    );
  await PayrollRun.updateOne(
    { _id: id },
    {
      $set: { status: "PAID", paidAt: nowIso(), paidByUserId: userId ?? null },
    },
  );
  return getPayrollRun(id);
}

export async function sendPayslipsForRun(id: string, userId: string) {
  const run = await PayrollRun.findById(id).lean();
  if (!run) throw AppError.notFound("Payroll run not found.");
  if (run.status !== "PAID")
    throw AppError.badRequest(
      "Payroll must be marked paid before payslips can be sent.",
    );

  const payslips = await Payslip.find({ payrollRunId: id }).lean();
  if (!payslips.length)
    throw AppError.badRequest("No payslips exist for this payroll run.");

  const employees = await Employee.find({
    _id: { $in: payslips.map((p) => p.employeeId) },
  }).lean();
  const employeeMap = new Map(employees.map((e) => [e._id, e]));
  const sentAt = nowIso();

  await Promise.all(
    payslips.map(async (payslip) => {
      const employee = employeeMap.get(payslip.employeeId);
      if (!employee) return;
      await notify({
        userId: employee.userId,
        type: "PAYROLL",
        title: "Payslip Available",
        message: `Your ${monthNameForNotification(run.month)} ${run.year} payslip is now available.`,
        link: "/payroll",
      });
    }),
  );

  await PayrollRun.updateOne(
    { _id: id },
    { $set: { payslipsSentAt: sentAt, payslipsSentByUserId: userId } },
  );
  return getPayrollRun(id);
}

function monthNameForNotification(month: number) {
  return new Date(2000, month - 1, 1).toLocaleString("en-IN", {
    month: "long",
  });
}

export async function listPayslipsForRun(runId: string) {
  const [rows, run] = await Promise.all([
    Payslip.find({ payrollRunId: runId }).lean(),
    PayrollRun.findById(runId).lean(),
  ]);
  if (!rows.length || !run) return [];
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
      const taxDetails = getPayslipTaxDetails(r, emp, run.month, run.year);
      return {
        id: r._id,
        ...r,
        month: run.month,
        year: run.year,
        runStatus: run.status,
        ...taxDetails,
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
  const [paidRuns, employee] = await Promise.all([
    PayrollRun.find({ status: "PAID" }).select("_id").lean(),
    Employee.findById(employeeId).select("dateOfBirth").lean(),
  ]);
  const paidRunIds = paidRuns.map((r) => r._id);
  const rows = await Payslip.find({
    employeeId,
    payrollRunId: { $in: paidRunIds },
  }).lean();
  if (!rows.length) return [];
  const runIds = [...new Set(rows.map((r) => r.payrollRunId))];
  const runs = await PayrollRun.find({ _id: { $in: runIds } }).lean();
  const runMap = new Map(runs.map((r) => [r._id, r]));
  return rows
    .map((r) => {
      const run = runMap.get(r.payrollRunId);
      const taxDetails = run
        ? getPayslipTaxDetails(r, employee, run.month, run.year)
        : {
            taxableIncome: Number.isFinite(Number(r.taxableIncome))
              ? Number(r.taxableIncome)
              : 0,
            annualTax: Number.isFinite(Number(r.annualTax))
              ? Number(r.annualTax)
              : 0,
          };
      return {
        id: r._id,
        ...r,
        ...taxDetails,
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
  const taxDetails = run
    ? getPayslipTaxDetails(row, employee, run.month, run.year)
    : {
        taxableIncome: Number.isFinite(Number(row.taxableIncome))
          ? Number(row.taxableIncome)
          : 0,
        annualTax: Number.isFinite(Number(row.annualTax))
          ? Number(row.annualTax)
          : 0,
      };
  return {
    id: row._id,
    ...row,
    ...taxDetails,
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
async function resolvePeriodPayslips(
  employeeId: string,
  period: PayslipRequestPeriod,
) {
  return (await listPayslipsForEmployee(employeeId)).slice(
    0,
    PAYSLIP_REQUEST_PERIOD_MONTHS[period],
  );
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
    role: { $in: ["SUPER_ADMIN", "HR_ADMIN", "FINANCE"] },
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
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.employeeId))];
  const emps = await Employee.find({ _id: { $in: ids } }).lean();
  const map = new Map(emps.map((e) => [e._id, e]));
  return rows.map((r) => withEmployeeInfo(toApiDoc(r)!, map.get(r.employeeId)));
}
export async function getPayslipRequest(id: string) {
  const row = await PayslipRequest.findById(id).lean();
  if (!row) return undefined;
  const employee = await Employee.findById(row.employeeId).lean();
  const all = await listPayslipsForEmployee(row.employeeId);
  const count =
    PAYSLIP_REQUEST_PERIOD_MONTHS[row.period as PayslipRequestPeriod] ?? 6;
  const matched = (row.payslipIds || []).length
    ? all.filter((p) => row.payslipIds.includes(p.id))
    : [];
  const available =
    row.status === "PENDING" || !matched.length ? all.slice(0, count) : matched;
  return {
    ...withEmployeeInfo(toApiDoc(row)!, employee),
    availablePayslips: available,
  };
}
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
  if (!payslips.length)
    throw AppError.badRequest("No payslips are available for this employee.");
  const owned = payslips.filter((p) => p.employeeId === request.employeeId);
  if (owned.length !== payslips.length)
    throw AppError.badRequest("Payslip does not belong to this employee.");
  const now = nowIso();
  await PayslipRequest.updateOne(
    { _id: id },
    {
      $set: {
        status: "SENT",
        payslipIds: owned.map((p) => p.id),
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

export async function reprocessPayrollRun(id: string) {
  const run = await PayrollRun.findById(id).lean();

  if (!run) {
    throw AppError.notFound("Payroll run not found.");
  }

  return processPayrollRun(run.month, run.year);
}