import { env } from "@/config/env";
import {
  PayrollRun,
  Payslip,
  Employee,
  Attendance,
  Department,
} from "@/db/models";
import { AppError } from "@/utils/errors";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const LLM_TIMEOUT_MS = 8000;

export type PayrollAnomalySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type PayrollAnomalyCategory =
  | "SALARY_VARIANCE"
  | "DUPLICATE_ACCOUNT"
  | "GHOST_EMPLOYEE"
  | "NEGATIVE_PAY"
  | "ATTENDANCE_MISMATCH"
  | "STATUTORY_COMPLIANCE"
  | "MACRO_VARIANCE";

export interface PayrollAnomalyItem {
  id: string;
  category: PayrollAnomalyCategory;
  severity: PayrollAnomalySeverity;
  title: string;
  description: string;
  employeeId?: string;
  employeeName?: string;
  employeeCode?: string;
  department?: string;
  currentValue?: number | string;
  expectedValue?: number | string;
  financialExposure?: number;
  recommendation: string;
}

export interface PayrollAuditResult {
  runId: string;
  month: number;
  year: number;
  status: string;
  healthScore: number;
  totalEmployees: number;
  anomaliesCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalFinancialExposure: number;
  discrepancyRate: number;
  aiSummary: string;
  recommendations: string[];
  anomalies: PayrollAnomalyItem[];
}

function roundMoney(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function formatINR(val: number): string {
  return `₹${Math.round(val).toLocaleString("en-IN")}`;
}

export async function detectPayrollAnomalies(
  runId: string,
): Promise<PayrollAuditResult> {
  const run = await PayrollRun.findById(runId).lean();
  if (!run) throw AppError.notFound("Payroll run not found.");

  const currentPayslips = await Payslip.find({ payrollRunId: run._id }).lean();
  if (!currentPayslips.length) {
    return {
      runId: run._id,
      month: run.month,
      year: run.year,
      status: run.status,
      healthScore: 100,
      totalEmployees: 0,
      anomaliesCount: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalFinancialExposure: 0,
      discrepancyRate: 0,
      aiSummary: "No payslips have been generated for this run yet.",
      recommendations: ["Process or calculate payroll to run anomaly analysis."],
      anomalies: [],
    };
  }

  // 1. Fetch employee details and departments
  const employeeIds = [...new Set(currentPayslips.map((p) => p.employeeId))];
  const [employees, departments] = await Promise.all([
    Employee.find({ _id: { $in: employeeIds } }).lean(),
    Department.find({}).lean(),
  ]);

  const empMap = new Map(employees.map((e) => [e._id, e]));
  const deptMap = new Map(departments.map((d) => [d._id, d.name]));

  // 2. Fetch prior run for Month-over-Month analysis
  const priorMonth = run.month === 1 ? 12 : run.month - 1;
  const priorYear = run.month === 1 ? run.year - 1 : run.year;
  const priorRun = await PayrollRun.findOne({
    month: priorMonth,
    year: priorYear,
  }).lean();
  const priorPayslips = priorRun
    ? await Payslip.find({ payrollRunId: priorRun._id }).lean()
    : [];
  const priorPayslipsMap = new Map(
    priorPayslips.map((p) => [p.employeeId, p]),
  );

  // 3. Fetch attendance records for the target run's month
  const prefix = `${run.year}-${String(run.month).padStart(2, "0")}`;
  const attendanceRows = await Attendance.find({
    date: { $regex: `^${prefix}-` },
    employeeId: { $in: employeeIds },
  }).lean();

  const attendanceMap = new Map<string, typeof attendanceRows>();
  for (const row of attendanceRows) {
    const list = attendanceMap.get(row.employeeId) ?? [];
    list.push(row);
    attendanceMap.set(row.employeeId, list);
  }

  const anomalies: PayrollAnomalyItem[] = [];
  let itemCounter = 1;

  // --- Check 1: Duplicate Banking & Duplicate PAN details ---
  const bankAccountMap = new Map<string, typeof employees>();
  const panMap = new Map<string, typeof employees>();

  for (const emp of employees) {
    const bank = emp.bankAccountNumber?.trim();
    if (bank && bank.length >= 6 && !/^0+$/.test(bank)) {
      const list = bankAccountMap.get(bank) ?? [];
      list.push(emp);
      bankAccountMap.set(bank, list);
    }
    const pan = emp.employeePan?.trim().toUpperCase();
    if (pan && pan.length >= 5) {
      const list = panMap.get(pan) ?? [];
      list.push(emp);
      panMap.set(pan, list);
    }
  }

  const currentPayslipMap = new Map(currentPayslips.map((p) => [p.employeeId, p]));

  for (const [bank, emps] of bankAccountMap.entries()) {
    if (emps.length > 1) {
      const combinedNet = emps.reduce(
        (sum, e) => sum + (currentPayslipMap.get(e._id)?.netPay ?? 0),
        0,
      );
      anomalies.push({
        id: `anom_${itemCounter++}`,
        category: "DUPLICATE_ACCOUNT",
        severity: "CRITICAL",
        title: "Duplicate Bank Account Detected",
        description: `Multiple employees (${emps.map((e) => `${e.firstName} ${e.lastName} (${e.employeeCode || e._id})`).join(", ")}) are registered with identical bank account ending in ...${bank.slice(-4)}.`,
        currentValue: bank,
        financialExposure: combinedNet,
        recommendation:
          "Verify employee banking documentation with HR before releasing payouts to prevent fraudulent or misdirected salary disbursement.",
      });
    }
  }

  for (const [pan, emps] of panMap.entries()) {
    if (emps.length > 1) {
      anomalies.push({
        id: `anom_${itemCounter++}`,
        category: "DUPLICATE_ACCOUNT",
        severity: "CRITICAL",
        title: "Duplicate PAN Number Found",
        description: `Employees ${emps.map((e) => `${e.firstName} ${e.lastName}`).join(", ")} share the same PAN (${pan}).`,
        currentValue: pan,
        recommendation:
          "Verify PAN cards. Duplicate PAN submissions breach tax compliance and TDS reporting under Section 206AA.",
      });
    }
  }

  // --- Check 2: Ghost / Terminated Employees on Active Run ---
  for (const p of currentPayslips) {
    const emp = empMap.get(p.employeeId);
    const empName = emp ? `${emp.firstName} ${emp.lastName}` : "Unknown";
    const empDept = emp ? deptMap.get(emp.departmentId) || "" : "";

    if (!emp || ["TERMINATED", "RESIGNED"].includes(emp.status)) {
      anomalies.push({
        id: `anom_${itemCounter++}`,
        category: "GHOST_EMPLOYEE",
        severity: "CRITICAL",
        title: "Payout to Inactive/Terminated Employee",
        description: `Employee ${empName} (${emp?.employeeCode || p.employeeId}) has status "${emp?.status || 'UNKNOWN'}" but a payslip was generated.`,
        employeeId: p.employeeId,
        employeeName: empName,
        employeeCode: emp?.employeeCode || p.employeeId,
        department: empDept,
        currentValue: formatINR(p.netPay),
        financialExposure: p.netPay,
        recommendation:
          "Remove or hold payslip. Verify full-and-final settlement status before releasing salary.",
      });
    }

    // --- Check 3: Negative or Zero Net Pay ---
    if (p.netPay <= 0) {
      anomalies.push({
        id: `anom_${itemCounter++}`,
        category: "NEGATIVE_PAY",
        severity: "CRITICAL",
        title: "Zero or Inverted Net Salary",
        description: `${empName} has total deductions (${formatINR(p.totalDeductions)}) that equal or exceed gross earnings (${formatINR(p.grossEarnings)}), yielding a net salary of ${formatINR(p.netPay)}.`,
        employeeId: p.employeeId,
        employeeName: empName,
        employeeCode: emp?.employeeCode || p.employeeId,
        department: empDept,
        currentValue: formatINR(p.netPay),
        expectedValue: "> 0",
        financialExposure: Math.abs(p.netPay),
        recommendation:
          "Review advance salary recoveries and LOP deductions to ensure deductions do not exceed net earnings.",
      });
    }

    // --- Check 4: Month-over-Month Salary Variance (Spike or Drop > 25%) ---
    const priorSlip = priorPayslipsMap.get(p.employeeId);
    if (priorSlip && priorSlip.netPay > 0 && p.netPay > 0) {
      const diff = p.netPay - priorSlip.netPay;
      const pct = (Math.abs(diff) / priorSlip.netPay) * 100;
      if (pct >= 25) {
        const isSpike = diff > 0;
        anomalies.push({
          id: `anom_${itemCounter++}`,
          category: "SALARY_VARIANCE",
          severity: pct >= 50 ? "HIGH" : "MEDIUM",
          title: isSpike
            ? `Net Salary Spike (+${Math.round(pct)}%)`
            : `Net Salary Drop (-${Math.round(pct)}%)`,
          description: `${empName}'s net payout changed by ${Math.round(pct)}% from ${formatINR(priorSlip.netPay)} in ${priorMonth}/${priorYear} to ${formatINR(p.netPay)} this month (shift of ${formatINR(Math.abs(diff))}).`,
          employeeId: p.employeeId,
          employeeName: empName,
          employeeCode: emp?.employeeCode || p.employeeId,
          department: empDept,
          currentValue: formatINR(p.netPay),
          expectedValue: formatINR(priorSlip.netPay),
          financialExposure: Math.abs(diff),
          recommendation: isSpike
            ? "Confirm if a promotion, appraisal, or bonus was approved for this cycle."
            : "Check if high Loss of Pay (LOP) or new tax bracket deductions explain this reduction.",
        });
      }
    }

    // --- Check 5: Attendance vs. LOP Consistency ---
    const attList = attendanceMap.get(p.employeeId) ?? [];
    const absentDays = attList.filter((a) => a.status === "ABSENT").length;
    const halfDays = attList.filter((a) => a.status === "HALF_DAY").length;
    const totalAbsenteeism = absentDays + halfDays * 0.5;

    if (totalAbsenteeism >= 3 && (p.lop ?? 0) === 0) {
      anomalies.push({
        id: `anom_${itemCounter++}`,
        category: "ATTENDANCE_MISMATCH",
        severity: "MEDIUM",
        title: "Unrecovered Absences (Missing LOP)",
        description: `${empName} has ${totalAbsenteeism} absent/half days in timesheets, but ₹0 Loss of Pay was deducted from salary.`,
        employeeId: p.employeeId,
        employeeName: empName,
        employeeCode: emp?.employeeCode || p.employeeId,
        department: empDept,
        currentValue: "0 LOP",
        expectedValue: `${totalAbsenteeism} days LOP`,
        financialExposure: roundMoney((p.grossEarnings / 30) * totalAbsenteeism),
        recommendation:
          "Verify if paid leaves were applied to cover absences. Re-run payroll to calculate attendance deductions accurately.",
      });
    }

    // --- Check 6: Statutory Consistency (PF != 12% of Basic) ---
    const expectedPf = roundMoney(p.basic * 0.12);
    if (Math.abs(p.pf - expectedPf) > 10) {
      anomalies.push({
        id: `anom_${itemCounter++}`,
        category: "STATUTORY_COMPLIANCE",
        severity: "LOW",
        title: "PF Statutory Variance",
        description: `${empName}'s Provident Fund deduction is ${formatINR(p.pf)}, deviating from 12% statutory basic calculation (${formatINR(expectedPf)}).`,
        employeeId: p.employeeId,
        employeeName: empName,
        employeeCode: emp?.employeeCode || p.employeeId,
        department: empDept,
        currentValue: formatINR(p.pf),
        expectedValue: formatINR(expectedPf),
        financialExposure: Math.abs(p.pf - expectedPf),
        recommendation:
          "Ensure salary structure complies with EPF contribution limits and employee voluntary contributions.",
      });
    }
  }

  // --- Check 7: Macro Run-Level Variance ---
  if (priorRun && priorRun.totalGross > 0) {
    const grossDiff = run.totalGross - priorRun.totalGross;
    const grossPct = (Math.abs(grossDiff) / priorRun.totalGross) * 100;
    const hcDiff = run.headcount - priorRun.headcount;
    const hcPct = (Math.abs(hcDiff) / Math.max(priorRun.headcount, 1)) * 100;

    if (grossPct >= 15 && hcPct < 8) {
      anomalies.push({
        id: `anom_${itemCounter++}`,
        category: "MACRO_VARIANCE",
        severity: "HIGH",
        title: `Macro Payroll Expenditure Shift (${grossDiff > 0 ? "+" : "-"}${Math.round(grossPct)}%)`,
        description: `Total payroll gross changed from ${formatINR(priorRun.totalGross)} to ${formatINR(run.totalGross)} (${Math.round(grossPct)}% change), while headcount changed by only ${hcPct.toFixed(1)}% (${hcDiff > 0 ? "+" : ""}${hcDiff} staff).`,
        currentValue: formatINR(run.totalGross),
        expectedValue: formatINR(priorRun.totalGross),
        financialExposure: Math.abs(grossDiff),
        recommendation:
          "Conduct an organizational audit to ensure seasonal bonuses, increments, or overtime spikes explain this aggregate budget delta.",
      });
    }
  }

  // Calculate Metrics
  const criticalCount = anomalies.filter((a) => a.severity === "CRITICAL").length;
  const highCount = anomalies.filter((a) => a.severity === "HIGH").length;
  const mediumCount = anomalies.filter((a) => a.severity === "MEDIUM").length;
  const lowCount = anomalies.filter((a) => a.severity === "LOW").length;

  const totalFinancialExposure = roundMoney(
    anomalies.reduce((sum, a) => sum + (a.financialExposure ?? 0), 0),
  );

  const flaggedEmployeesCount = new Set(
    anomalies.map((a) => a.employeeId).filter(Boolean),
  ).size;
  const discrepancyRate = currentPayslips.length
    ? roundMoney((flaggedEmployeesCount / currentPayslips.length) * 100)
    : 0;

  // Deduct points from 100 based on severity
  const scorePenalty =
    criticalCount * 22 + highCount * 12 + mediumCount * 4 + lowCount * 1;
  const healthScore = Math.max(0, Math.min(100, Math.round(100 - scorePenalty)));

  // Generate AI Synthesis
  const { summary: aiSummary, recommendations } = await generateAuditExecutiveSummary(
    run.month,
    run.year,
    healthScore,
    currentPayslips.length,
    anomalies,
    totalFinancialExposure,
  );

  return {
    runId: run._id,
    month: run.month,
    year: run.year,
    status: run.status,
    healthScore,
    totalEmployees: currentPayslips.length,
    anomaliesCount: anomalies.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    totalFinancialExposure,
    discrepancyRate,
    aiSummary,
    recommendations,
    anomalies,
  };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

async function generateAuditExecutiveSummary(
  month: number,
  year: number,
  score: number,
  headcount: number,
  anomalies: PayrollAnomalyItem[],
  exposure: number,
): Promise<{ summary: string; recommendations: string[] }> {
  const criticals = anomalies.filter((a) => a.severity === "CRITICAL");
  const highs = anomalies.filter((a) => a.severity === "HIGH");
  const monthNameStr = MONTH_NAMES[month - 1] || `${month}`;
  const periodLabel = `${monthNameStr} ${year}`;

  // If Groq key exists, try AI generation
  if (env.groqApiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

      const prompt = `You are a Senior Payroll Auditor and Compliance Officer for an enterprise HRMS.
Review this payroll anomaly scan and provide a professional, concise executive audit briefing:

Period: ${periodLabel}
Health Score: ${score}/100
Headcount: ${headcount}
Total Flagged Anomalies: ${anomalies.length}
Critical Issues: ${criticals.length}
High Issues: ${highs.length}
Total Financial Exposure at Risk: ${formatINR(exposure)}

Top Sample Anomalies:
${anomalies.slice(0, 5).map((a) => `- [${a.severity}] ${a.title}: ${a.description}`).join("\n")}

Format your response strictly as JSON with this schema:
{
  "summary": "A 2-3 sentence executive audit verdict referring to the period as ${periodLabel}, explaining whether this run is safe for disbursement and the primary risks.",
  "recommendations": ["Actionable step 1", "Actionable step 2", "Actionable step 3"]
}`;

      const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as any;
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
        if (parsed.summary && Array.isArray(parsed.recommendations)) {
          return {
            summary: parsed.summary,
            recommendations: parsed.recommendations,
          };
        }
      }
    } catch {
      // Fallback seamlessly to deterministic generator
    }
  }

  // Deterministic Fallback Generator
  if (score >= 90) {
    return {
      summary: `The ${periodLabel} payroll run is in healthy condition with an audit score of ${score}/100 across ${headcount} active employees. No critical structural blockers were detected; minor advisory notices can be reviewed before disbursement.`,
      recommendations: [
        "Review minor statutory and overtime notices before final bank authorization.",
        "Ensure bank upload files match approved salary structures.",
        "Authorize payroll disbursement.",
      ],
    };
  }

  if (score >= 70) {
    return {
      summary: `The ${periodLabel} payroll run scored ${score}/100 with ${anomalies.length} anomalies flagged, representing ${formatINR(exposure)} in potential variance. While disbursement is feasible, specific salary spikes and attendance discrepancies warrant confirmation.`,
      recommendations: [
        "Verify large month-over-month salary shifts with department managers.",
        "Cross-reference unrecovered absences with approved leave requests.",
        "Confirm statutory deductions align with employee declarations.",
      ],
    };
  }

  return {
    summary: `CRITICAL ATTENTION REQUIRED: The ${periodLabel} payroll audit score is ${score}/100. The engine identified ${criticals.length} critical blockers with total financial exposure of ${formatINR(exposure)}. Immediate remediation is required before payout.`,
    recommendations: [
      "Resolve duplicate bank accounts or PAN numbers immediately to prevent misdirected payouts.",
      "Remove or hold payslips for terminated/inactive staff.",
      "Correct inverted or zero net pay records before sending payment files.",
    ],
  };
}
