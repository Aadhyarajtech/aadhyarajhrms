import { connectDB } from "@/db/connection";
import { PayrollRun, Payslip } from "@/db/models";

const STATUS_RANK: Record<string, number> = {
  DRAFT: 0,
  ATTENDANCE_LOCKED: 1,
  PROCESSED: 2,
  HR_REVIEW: 3,
  APPROVED: 4,
  PAID: 5,
};

function runSortValue(run: any) {
  return [
    STATUS_RANK[run.status] ?? 0,
    run.processedAt ? Date.parse(run.processedAt) : 0,
    run.attendanceLockedAt ? Date.parse(run.attendanceLockedAt) : 0,
  ];
}

function isAfter(a: any, b: any) {
  const av = runSortValue(a);
  const bv = runSortValue(b);
  for (let i = 0; i < av.length; i += 1) {
    if (av[i] !== bv[i]) return av[i] > bv[i];
  }
  return false;
}

async function dropIndexIfPresent(name: string) {
  try {
    await PayrollRun.collection.dropIndex(name);
    console.log(`Removed payroll index ${name}.`);
  } catch (error: any) {
    if (error?.codeName !== "IndexNotFound" && error?.code !== 27) {
      throw error;
    }
  }
}

/**
 * One-time migration for the grouped payroll-period workflow.
 *
 * Older versions created one PayrollRun per department. This migration merges
 * those records into one PayrollRun per exact startDate/endDate period and
 * moves their payslips to the surviving run. Department IDs are preserved in
 * attendanceLockedDepartmentIds so attendance locking and payroll processing
 * retain the same department scope.
 */
async function main() {
  await connectDB();

  // Remove indexes that can block the merge or conflict with the new model.
  await dropIndexIfPresent("startDate_1_endDate_1_departmentId_1");
  await dropIndexIfPresent("startDate_1_endDate_1");
  await dropIndexIfPresent("month_1_year_1");

  const runs = await PayrollRun.find({}).lean();
  const grouped = new Map<string, any[]>();

  for (const run of runs) {
    const startDate = run.startDate || `${run.year}-${String(run.month).padStart(2, "0")}-01`;
    const endDate = run.endDate || new Date(run.year, run.month, 0).toISOString().slice(0, 10);
    const key = `${startDate}|${endDate}`;
    const list = grouped.get(key) ?? [];
    list.push({ ...run, startDate, endDate });
    grouped.set(key, list);
  }

  let mergedRuns = 0;
  let movedPayslips = 0;
  let removedDuplicatePayslips = 0;

  for (const [key, periodRuns] of grouped) {
    periodRuns.sort((a, b) => (isAfter(a, b) ? -1 : isAfter(b, a) ? 1 : String(a._id).localeCompare(String(b._id))));
    const canonical = periodRuns[0];

    const departmentIds = [
      ...new Set(
        periodRuns.flatMap((run) => [
          ...(Array.isArray(run.attendanceLockedDepartmentIds) ? run.attendanceLockedDepartmentIds : []),
          ...(run.departmentId ? [run.departmentId] : []),
        ]).map(String).filter(Boolean),
      ),
    ];

    const allPayslips = await Payslip.find({
      payrollRunId: { $in: periodRuns.map((run) => run._id) },
    }).lean();

    // If duplicate department runs contain a duplicate employee payslip, keep
    // the canonical/first one and remove the duplicate before reassigning the
    // remaining payslips to the grouped run.
    const employeePayslipIds = new Set<string>();
    const duplicatePayslipIds: string[] = [];
    const orderedPayslips = [...allPayslips].sort((a, b) => {
      const aIsCanonical = String(a.payrollRunId) === String(canonical._id);
      const bIsCanonical = String(b.payrollRunId) === String(canonical._id);
      return Number(bIsCanonical) - Number(aIsCanonical);
    });
    for (const payslip of orderedPayslips) {
      if (employeePayslipIds.has(String(payslip.employeeId))) {
        duplicatePayslipIds.push(payslip._id);
      } else {
        employeePayslipIds.add(String(payslip.employeeId));
      }
    }

    if (duplicatePayslipIds.length) {
      await Payslip.deleteMany({ _id: { $in: duplicatePayslipIds } });
      removedDuplicatePayslips += duplicatePayslipIds.length;
    }

    const survivingPayslips = orderedPayslips.filter(
      (payslip) => !duplicatePayslipIds.includes(payslip._id),
    );
    const payslipIdsToMove = survivingPayslips
      .filter((payslip) => payslip.payrollRunId !== canonical._id)
      .map((payslip) => payslip._id);

    if (payslipIdsToMove.length) {
      await Payslip.updateMany(
        { _id: { $in: payslipIdsToMove } },
        { $set: { payrollRunId: canonical._id } },
      );
      movedPayslips += payslipIdsToMove.length;
    }

    const totals = survivingPayslips.reduce(
      (sum, payslip) => ({
        gross: sum.gross + Number(payslip.grossEarnings || 0),
        deductions: sum.deductions + Number(payslip.totalDeductions || 0),
        net: sum.net + Number(payslip.netPay || 0),
      }),
      { gross: 0, deductions: 0, net: 0 },
    );

    const hasPayslips = survivingPayslips.length > 0;
    const status = canonical.status;
    await PayrollRun.updateOne(
      { _id: canonical._id },
      {
        $set: {
          month: new Date(`${canonical.endDate}T00:00:00Z`).getUTCMonth() + 1,
          year: new Date(`${canonical.endDate}T00:00:00Z`).getUTCFullYear(),
          startDate: canonical.startDate,
          endDate: canonical.endDate,
          departmentId: null,
          attendanceLockedDepartmentIds: departmentIds,
          totalGross: hasPayslips ? Math.round(totals.gross * 100) / 100 : Number(canonical.totalGross || 0),
          totalDeductions: hasPayslips ? Math.round(totals.deductions * 100) / 100 : Number(canonical.totalDeductions || 0),
          totalNet: hasPayslips ? Math.round(totals.net * 100) / 100 : Number(canonical.totalNet || 0),
          headcount: hasPayslips ? survivingPayslips.length : Number(canonical.headcount || 0),
        },
      },
    );

    const duplicateRunIds = periodRuns
      .filter((run) => String(run._id) !== String(canonical._id))
      .map((run) => run._id);
    if (duplicateRunIds.length) {
      await PayrollRun.deleteMany({ _id: { $in: duplicateRunIds } });
      mergedRuns += duplicateRunIds.length;
    }

    console.log(
      `Merged payroll period ${key}: ${periodRuns.length} run(s) -> ${canonical._id}; departments=${departmentIds.length}.`,
    );
  }

  await PayrollRun.collection.createIndex(
    { startDate: 1, endDate: 1 },
    { unique: true, sparse: true },
  );

  console.log(
    `Payroll period migration complete. Merged runs: ${mergedRuns}; moved payslips: ${movedPayslips}; removed duplicate payslips: ${removedDuplicatePayslips}.`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
