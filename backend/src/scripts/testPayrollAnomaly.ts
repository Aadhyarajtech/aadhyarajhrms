/**
 * Automated Test Suite & Sandbox for Payroll AI Anomaly Detection
 *
 * Usage:
 *   1. Run automated test suite (creates sandbox data, verifies all 7 checks, cleans up):
 *      npm run test:anomaly
 *      or: npx tsx src/scripts/testPayrollAnomaly.ts
 *
 *   2. Seed an anomaly run for frontend UI testing (keeps data in DB so you can test the UI):
 *      npx tsx src/scripts/testPayrollAnomaly.ts --seed-ui
 *
 *   3. Audit any existing payroll run in DB by ID:
 *      npx tsx src/scripts/testPayrollAnomaly.ts <runId>
 */

import { connectDB, nowIso } from "../db/connection";
import {
  PayrollRun,
  Payslip,
  Employee,
  Attendance,
  Department,
  Designation,
  User,
} from "../db/models";
import {
  detectPayrollAnomalies,
  PayrollAuditResult,
  PayrollAnomalyCategory,
} from "../services/payrollAnomaly.service";
import { genId } from "../utils/id";

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

function log(msg: string) {
  console.log(msg);
}

function success(msg: string) {
  console.log(`${COLORS.green}✔ ${msg}${COLORS.reset}`);
}

function fail(msg: string) {
  console.log(`${COLORS.red}✖ ${msg}${COLORS.reset}`);
}

function header(title: string) {
  console.log(`\n${COLORS.cyan}${COLORS.bright}========================================================================${COLORS.reset}`);
  console.log(`${COLORS.cyan}${COLORS.bright}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${COLORS.bright}========================================================================${COLORS.reset}\n`);
}

async function runAnomalySuite() {
  const args = process.argv.slice(2);
  const isSeedUi = args.includes("--seed-ui");
  const specificRunId = args.find((a) => !a.startsWith("--"));

  await connectDB();

  // If user provided a specific runId, audit that directly
  if (specificRunId) {
    header(`AUDITING SPECIFIC PAYROLL RUN: ${specificRunId}`);
    const result = await detectPayrollAnomalies(specificRunId);
    printAuditResult(result);
    process.exit(0);
  }

  header(
    isSeedUi
      ? "SEEDING PAYROLL ANOMALIES FOR FRONTEND UI VERIFICATION"
      : "RUNNING AUTOMATED PAYROLL ANOMALY DETECTION TEST SUITE",
  );

  const cleanupIds = {
    runs: [] as string[],
    slips: [] as string[],
    employees: [] as string[],
    attendance: [] as string[],
    users: [] as string[],
  };

  try {
    // 1. Fetch or create a test department & designation
    let dept = await Department.findOne().lean();
    let desig = await Designation.findOne().lean();
    const now = nowIso();

    const testMonth = isSeedUi ? 10 : 11;
    const testYear = 2026;
    const priorMonth = testMonth - 1;

    // Check if an existing run already exists for this test slot, delete if dirty
    const existingRun = await PayrollRun.findOne({ month: testMonth, year: testYear });
    if (existingRun) {
      log(`${COLORS.yellow}Removing existing run for ${testMonth}/${testYear} before running test...${COLORS.reset}`);
      await Payslip.deleteMany({ payrollRunId: existingRun._id });
      await PayrollRun.deleteOne({ _id: existingRun._id });
    }

    // --- Create Test Employees ---
    log(`${COLORS.gray}Creating isolated test employees with anomaly conditions...${COLORS.reset}`);

    // Pair A: Duplicate Bank & Duplicate PAN
    const empBank1Id = genId("emp_test");
    const empBank2Id = genId("emp_test");
    const sharedBankAccount = "987654321099";
    const sharedPan = "ABCDE9999Z";

    // Ghost / Terminated Employee
    const empGhostId = genId("emp_test");

    // Negative Pay Employee
    const empNegativePayId = genId("emp_test");

    // Salary Variance Employee (Spike MoM)
    const empVarianceId = genId("emp_test");

    // Attendance Mismatch Employee (Absent without LOP)
    const empAttendanceMismatchId = genId("emp_test");

    // Statutory PF Variance Employee
    const empPfVarianceId = genId("emp_test");

    const testEmpsData = [
      {
        _id: empBank1Id,
        employeeCode: "TST-001",
        userId: genId("usr_test"),
        firstName: "Aarav",
        lastName: "Sharma",
        departmentId: dept?._id || "dept_general",
        designationId: desig?._id || "desig_general",
        employmentType: "FULL_TIME" as const,
        status: "ACTIVE" as const,
        dateOfJoining: "2024-01-01",
        bankAccountNumber: sharedBankAccount,
        employeePan: sharedPan,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: empBank2Id,
        employeeCode: "TST-002",
        userId: genId("usr_test"),
        firstName: "Rohan",
        lastName: "Verma",
        departmentId: dept?._id || "dept_general",
        designationId: desig?._id || "desig_general",
        employmentType: "FULL_TIME" as const,
        status: "ACTIVE" as const,
        dateOfJoining: "2024-01-01",
        bankAccountNumber: sharedBankAccount, // DUPLICATE BANK
        employeePan: sharedPan, // DUPLICATE PAN
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: empGhostId,
        employeeCode: "TST-003",
        userId: genId("usr_test"),
        firstName: "Vikram",
        lastName: "Singh (Terminated)",
        departmentId: dept?._id || "dept_general",
        designationId: desig?._id || "desig_general",
        employmentType: "FULL_TIME" as const,
        status: "TERMINATED" as const, // GHOST EMPLOYEE
        dateOfJoining: "2023-01-01",
        dateOfExit: "2026-08-30",
        bankAccountNumber: "112233445501",
        employeePan: "TERM12345T",
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: empNegativePayId,
        employeeCode: "TST-004",
        userId: genId("usr_test"),
        firstName: "Neha",
        lastName: "Gupta",
        departmentId: dept?._id || "dept_general",
        designationId: desig?._id || "desig_general",
        employmentType: "FULL_TIME" as const,
        status: "ACTIVE" as const,
        dateOfJoining: "2024-02-01",
        bankAccountNumber: "112233445502",
        employeePan: "NEHA56789N",
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: empVarianceId,
        employeeCode: "TST-005",
        userId: genId("usr_test"),
        firstName: "Pooja",
        lastName: "Mehta",
        departmentId: dept?._id || "dept_general",
        designationId: desig?._id || "desig_general",
        employmentType: "FULL_TIME" as const,
        status: "ACTIVE" as const,
        dateOfJoining: "2024-03-01",
        bankAccountNumber: "112233445503",
        employeePan: "POOJ11223P",
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: empAttendanceMismatchId,
        employeeCode: "TST-006",
        userId: genId("usr_test"),
        firstName: "Karan",
        lastName: "Kapoor",
        departmentId: dept?._id || "dept_general",
        designationId: desig?._id || "desig_general",
        employmentType: "FULL_TIME" as const,
        status: "ACTIVE" as const,
        dateOfJoining: "2024-01-15",
        bankAccountNumber: "112233445504",
        employeePan: "KARA99887K",
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: empPfVarianceId,
        employeeCode: "TST-007",
        userId: genId("usr_test"),
        firstName: "Ananya",
        lastName: "Iyer",
        departmentId: dept?._id || "dept_general",
        designationId: desig?._id || "desig_general",
        employmentType: "FULL_TIME" as const,
        status: "ACTIVE" as const,
        dateOfJoining: "2024-04-01",
        bankAccountNumber: "112233445505",
        employeePan: "ANAN44556A",
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const e of testEmpsData) {
      await Employee.create(e);
      cleanupIds.employees.push(e._id);
    }

    // --- Create Attendance records for employee TST-006 (4 absent days) ---
    const prefix = `${testYear}-${String(testMonth).padStart(2, "0")}`;
    const absentDates = [`${prefix}-05`, `${prefix}-06`, `${prefix}-07`, `${prefix}-08`];
    for (const d of absentDates) {
      const attId = genId("att_test");
      await Attendance.create({
        _id: attId,
        employeeId: empAttendanceMismatchId,
        date: d,
        status: "ABSENT",
        createdAt: now,
        updatedAt: now,
      });
      cleanupIds.attendance.push(attId);
    }

    // --- Create Prior Run (Month M-1) for MoM Salary Variance & Macro Variance ---
    let priorRun = await PayrollRun.findOne({ month: priorMonth, year: testYear });
    let createdPriorRun = false;
    if (!priorRun) {
      const pRunId = genId("prun_test");
      priorRun = await PayrollRun.create({
        _id: pRunId,
        month: priorMonth,
        year: testYear,
        status: "PAID",
        totalGross: 350000,
        totalDeductions: 50000,
        totalNet: 300000,
        headcount: 7,
        processedAt: now,
        paidAt: now,
      });
      cleanupIds.runs.push(pRunId);
      createdPriorRun = true;
    }

    // Seed prior payslip for empVarianceId with netPay = 40,000
    const priorSlipId = genId("pay_test");
    await Payslip.create({
      _id: priorSlipId,
      payrollRunId: priorRun._id,
      employeeId: empVarianceId,
      basic: 25000,
      hra: 10000,
      conveyance: 1600,
      medical: 1250,
      specialAllowance: 5000,
      performanceBonus: 0,
      overtimeHours: 0,
      overtimeAmount: 0,
      grossEarnings: 42850,
      pf: 3000,
      professionalTax: 200,
      incomeTax: 0,
      taxRegime: "NEW",
      taxYear: testYear,
      taxableIncome: 42850,
      annualTax: 0,
      esi: 0,
      lop: 0,
      advanceRecovery: 0,
      totalDeductions: 3200,
      netPay: 39650, // Baseline for prior month
      daysPayable: 30,
      daysInMonth: 30,
    });
    cleanupIds.slips.push(priorSlipId);

    // --- Create Target Current Payroll Run ---
    const targetRunId = isSeedUi ? `prun_demo_anom_${testMonth}_${testYear}` : genId("prun_test");
    const targetGross = (priorRun.totalGross || 350000) * 1.35; // +35% macro variance!

    const currentRun = await PayrollRun.create({
      _id: targetRunId,
      month: testMonth,
      year: testYear,
      status: "HR_REVIEW",
      totalGross: targetGross,
      totalDeductions: 65000,
      totalNet: targetGross - 65000,
      headcount: 7,
      processedAt: now,
    });
    cleanupIds.runs.push(targetRunId);

    // --- Create Target Current Payslips with Intentional Anomalies ---
    log(`${COLORS.gray}Generating payslips with intentional anomalies...${COLORS.reset}`);

    const payslipsToInsert = [
      // 1 & 2: Duplicate bank & PAN users
      {
        _id: genId("pay_test"),
        payrollRunId: targetRunId,
        employeeId: empBank1Id,
        basic: 40000,
        hra: 16000,
        conveyance: 1600,
        medical: 1250,
        specialAllowance: 7200,
        performanceBonus: 0,
        overtimeHours: 0,
        overtimeAmount: 0,
        grossEarnings: 66050,
        pf: 4800,
        professionalTax: 200,
        incomeTax: 2000,
        taxRegime: "NEW" as const,
        taxYear: testYear,
        taxableIncome: 66050,
        annualTax: 24000,
        esi: 0,
        lop: 0,
        advanceRecovery: 0,
        totalDeductions: 7000,
        netPay: 59050,
        daysPayable: 30,
        daysInMonth: 30,
      },
      {
        _id: genId("pay_test"),
        payrollRunId: targetRunId,
        employeeId: empBank2Id,
        basic: 40000,
        hra: 16000,
        conveyance: 1600,
        medical: 1250,
        specialAllowance: 7200,
        performanceBonus: 0,
        overtimeHours: 0,
        overtimeAmount: 0,
        grossEarnings: 66050,
        pf: 4800,
        professionalTax: 200,
        incomeTax: 2000,
        taxRegime: "NEW" as const,
        taxYear: testYear,
        taxableIncome: 66050,
        annualTax: 24000,
        esi: 0,
        lop: 0,
        advanceRecovery: 0,
        totalDeductions: 7000,
        netPay: 59050,
        daysPayable: 30,
        daysInMonth: 30,
      },
      // 3: Ghost / Terminated Employee Payout
      {
        _id: genId("pay_test"),
        payrollRunId: targetRunId,
        employeeId: empGhostId,
        basic: 30000,
        hra: 12000,
        conveyance: 1600,
        medical: 1250,
        specialAllowance: 5400,
        performanceBonus: 0,
        overtimeHours: 0,
        overtimeAmount: 0,
        grossEarnings: 50250,
        pf: 3600,
        professionalTax: 200,
        incomeTax: 0,
        taxRegime: "NEW" as const,
        taxYear: testYear,
        taxableIncome: 50250,
        annualTax: 0,
        esi: 0,
        lop: 0,
        advanceRecovery: 0,
        totalDeductions: 3800,
        netPay: 46450, // Should be flagged because emp is TERMINATED
        daysPayable: 30,
        daysInMonth: 30,
      },
      // 4: Negative / Zero Net Pay
      {
        _id: genId("pay_test"),
        payrollRunId: targetRunId,
        employeeId: empNegativePayId,
        basic: 25000,
        hra: 10000,
        conveyance: 1600,
        medical: 1250,
        specialAllowance: 4500,
        performanceBonus: 0,
        overtimeHours: 0,
        overtimeAmount: 0,
        grossEarnings: 42350,
        pf: 3000,
        professionalTax: 200,
        incomeTax: 0,
        taxRegime: "NEW" as const,
        taxYear: testYear,
        taxableIncome: 42350,
        annualTax: 0,
        esi: 0,
        lop: 10000,
        advanceRecovery: 35000, // Massive deduction > gross
        totalDeductions: 48200,
        netPay: -5850, // NEGATIVE PAY!
        daysPayable: 30,
        daysInMonth: 30,
      },
      // 5: Salary Variance Spike (+102% spike from 39,650 to 80,000)
      {
        _id: genId("pay_test"),
        payrollRunId: targetRunId,
        employeeId: empVarianceId,
        basic: 50000,
        hra: 20000,
        conveyance: 1600,
        medical: 1250,
        specialAllowance: 9000,
        performanceBonus: 10000,
        overtimeHours: 0,
        overtimeAmount: 0,
        grossEarnings: 91850,
        pf: 6000,
        professionalTax: 200,
        incomeTax: 5650,
        taxRegime: "NEW" as const,
        taxYear: testYear,
        taxableIncome: 91850,
        annualTax: 67800,
        esi: 0,
        lop: 0,
        advanceRecovery: 0,
        totalDeductions: 11850,
        netPay: 80000, // +102% spike from prior month!
        daysPayable: 30,
        daysInMonth: 30,
      },
      // 6: Attendance Mismatch (4 days absent in attendance logs, but ₹0 LOP deducted)
      {
        _id: genId("pay_test"),
        payrollRunId: targetRunId,
        employeeId: empAttendanceMismatchId,
        basic: 30000,
        hra: 12000,
        conveyance: 1600,
        medical: 1250,
        specialAllowance: 5400,
        performanceBonus: 0,
        overtimeHours: 0,
        overtimeAmount: 0,
        grossEarnings: 50250,
        pf: 3600,
        professionalTax: 200,
        incomeTax: 0,
        taxRegime: "NEW" as const,
        taxYear: testYear,
        taxableIncome: 50250,
        annualTax: 0,
        esi: 0,
        lop: 0, // Should have been ~4 days LOP!
        advanceRecovery: 0,
        totalDeductions: 3800,
        netPay: 46450,
        daysPayable: 30,
        daysInMonth: 30,
      },
      // 7: Statutory PF Variance (Basic = 30,000, expected 12% = 3,600, but PF = 500)
      {
        _id: genId("pay_test"),
        payrollRunId: targetRunId,
        employeeId: empPfVarianceId,
        basic: 30000,
        hra: 12000,
        conveyance: 1600,
        medical: 1250,
        specialAllowance: 5400,
        performanceBonus: 0,
        overtimeHours: 0,
        overtimeAmount: 0,
        grossEarnings: 50250,
        pf: 500, // STATUTORY ERROR! (Expected 3600, delta = 3100)
        professionalTax: 200,
        incomeTax: 0,
        taxRegime: "NEW" as const,
        taxYear: testYear,
        taxableIncome: 50250,
        annualTax: 0,
        esi: 0,
        lop: 0,
        advanceRecovery: 0,
        totalDeductions: 700,
        netPay: 49550,
        daysPayable: 30,
        daysInMonth: 30,
      },
    ];

    for (const p of payslipsToInsert) {
      await Payslip.create(p);
      cleanupIds.slips.push(p._id);
    }

    log(`${COLORS.green}Test dataset prepared successfully.${COLORS.reset}\n`);

    // --- Execute Anomaly Detection Service ---
    log(`${COLORS.magenta}${COLORS.bright}⚡ Executing detectPayrollAnomalies('${targetRunId}')...${COLORS.reset}`);
    const auditResult = await detectPayrollAnomalies(targetRunId);

    // --- Assertions & Reporting ---
    printAuditResult(auditResult);

    const detectedCategories = new Set(auditResult.anomalies.map((a) => a.category));

    const expectedChecks: { category: PayrollAnomalyCategory; label: string }[] = [
      { category: "DUPLICATE_ACCOUNT", label: "Duplicate Banking / PAN" },
      { category: "GHOST_EMPLOYEE", label: "Ghost / Terminated Employee" },
      { category: "NEGATIVE_PAY", label: "Zero or Inverted Net Salary" },
      { category: "SALARY_VARIANCE", label: "MoM Salary Variance (+102% Spike)" },
      { category: "ATTENDANCE_MISMATCH", label: "Attendance Mismatch (Unrecovered LOP)" },
      { category: "STATUTORY_COMPLIANCE", label: "Statutory PF Variance" },
      { category: "MACRO_VARIANCE", label: "Macro Payroll Expenditure Shift (+35%)" },
    ];

    header("VERIFICATION SUMMARY FOR ALL 7 ANOMALY CATEGORIES");

    let allPassed = true;
    for (const check of expectedChecks) {
      const passed = detectedCategories.has(check.category);
      if (passed) {
        success(`[${check.category}] ${check.label}`);
      } else {
        fail(`[${check.category}] ${check.label} was NOT detected!`);
        allPassed = false;
      }
    }

    console.log();
    if (auditResult.healthScore < 50) {
      success(`Health Score correctly penalized: ${auditResult.healthScore}/100 (High Risk Detected)`);
    } else {
      fail(`Health Score was unexpectedly high: ${auditResult.healthScore}/100`);
      allPassed = false;
    }

    if (auditResult.criticalCount >= 3) {
      success(`Critical count verified: ${auditResult.criticalCount} Critical issues flagged`);
    } else {
      fail(`Critical count too low: ${auditResult.criticalCount}`);
      allPassed = false;
    }

    if (allPassed) {
      console.log(`\n${COLORS.green}${COLORS.bright}🎉 ALL 7 PAYROLL ANOMALY CHECKS PASSED THE AUTOMATED SUITE!${COLORS.reset}\n`);
    } else {
      console.log(`\n${COLORS.red}${COLORS.bright}⚠️ SOME ANOMALY CHECKS FAILED.${COLORS.reset}\n`);
    }

    // Seed UI mode check
    if (isSeedUi) {
      log(`${COLORS.yellow}${COLORS.bright}========================================================================`);
      log(`  🚀 SEED-UI MODE ACTIVE: Test run has been left in the database!`);
      log(`========================================================================${COLORS.reset}`);
      log(`Run Month/Year: ${testMonth}/${testYear}`);
      log(`Run ID:         ${targetRunId}`);
      log(`Status:         HR_REVIEW`);
      log(`\nTo test the UI:`);
      log(`1. Open your browser to: http://localhost:5173/payroll`);
      log(`2. Locate the run for "${testMonth === 10 ? 'October' : 'November'} ${testYear}"`);
      log(`3. Click the 🛡️ "Audit" button in the Actions column.`);
      log(`4. Enjoy the full AI Payroll Anomaly Audit Modal with tabs, filters & resolution guides!`);
      log(`\n(To clean up later, run without --seed-ui)`);
    }
  } catch (error) {
    console.error("Test execution failed with error:", error);
  } finally {
    // Cleanup if not seeding UI
    if (!isSeedUi) {
      log(`${COLORS.gray}Cleaning up test records from database...${COLORS.reset}`);
      if (cleanupIds.slips.length) await Payslip.deleteMany({ _id: { $in: cleanupIds.slips } });
      if (cleanupIds.runs.length) await PayrollRun.deleteMany({ _id: { $in: cleanupIds.runs } });
      if (cleanupIds.attendance.length) await Attendance.deleteMany({ _id: { $in: cleanupIds.attendance } });
      if (cleanupIds.employees.length) await Employee.deleteMany({ _id: { $in: cleanupIds.employees } });
      log(`${COLORS.gray}Cleanup complete. Database is pristine.${COLORS.reset}`);
    }
  }

  process.exit(0);
}

function printAuditResult(res: PayrollAuditResult) {
  header(`PAYROLL AUDIT REPORT: Month ${res.month}/${res.year} (${res.status})`);

  console.log(`Health Score:             ${res.healthScore >= 80 ? COLORS.green : res.healthScore >= 50 ? COLORS.yellow : COLORS.red}${res.healthScore}/100${COLORS.reset}`);
  console.log(`Total Flagged Anomalies:  ${COLORS.bright}${res.anomaliesCount}${COLORS.reset}`);
  console.log(`  - Critical:             ${COLORS.red}${res.criticalCount}${COLORS.reset}`);
  console.log(`  - High:                 ${COLORS.yellow}${res.highCount}${COLORS.reset}`);
  console.log(`  - Medium:               ${COLORS.cyan}${res.mediumCount}${COLORS.reset}`);
  console.log(`  - Low:                  ${COLORS.gray}${res.lowCount}${COLORS.reset}`);
  console.log(`Total Financial Exposure: ${COLORS.bright}₹${res.totalFinancialExposure.toLocaleString("en-IN")}${COLORS.reset}`);
  console.log(`Discrepancy Rate:         ${res.discrepancyRate}% of staff flagged\n`);

  console.log(`${COLORS.bright}AI Executive Verdict:${COLORS.reset}`);
  console.log(`"${res.aiSummary}"\n`);

  if (res.recommendations?.length) {
    console.log(`${COLORS.bright}Actionable Recommendations:${COLORS.reset}`);
    res.recommendations.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
    console.log();
  }

  console.log(`${COLORS.bright}Detailed Flagged Anomalies (${res.anomalies.length}):${COLORS.reset}`);
  res.anomalies.forEach((a, i) => {
    const sevColor =
      a.severity === "CRITICAL"
        ? COLORS.red
        : a.severity === "HIGH"
        ? COLORS.yellow
        : a.severity === "MEDIUM"
        ? COLORS.cyan
        : COLORS.gray;

    console.log(`  ${i + 1}. [${sevColor}${a.severity}${COLORS.reset}] [${a.category}] ${COLORS.bright}${a.title}${COLORS.reset}`);
    console.log(`     ${COLORS.gray}${a.description}${COLORS.reset}`);
    if (a.financialExposure) {
      console.log(`     ${COLORS.magenta}Financial Exposure: ₹${Math.round(a.financialExposure).toLocaleString("en-IN")}${COLORS.reset}`);
    }
    console.log(`     ${COLORS.green}Fix: ${a.recommendation}${COLORS.reset}\n`);
  });
}

runAnomalySuite().catch(console.error);
