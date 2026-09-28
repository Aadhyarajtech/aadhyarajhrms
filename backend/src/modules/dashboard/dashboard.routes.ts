import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import { Employee, Department } from "@/db/models";
import * as repo from "./dashboard.repository";
import * as employeeRepo from "@/modules/employees/employees.repository";
import * as attendanceRepo from "@/modules/attendance/attendance.repository";
import * as recruitmentRepo from "@/modules/recruitment/recruitment.repository";
import * as payrollRepo from "@/modules/payroll/payroll.repository";

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

/**
 * Returns lifecycle counts directly from the Employee collection.
 * This keeps Dashboard lifecycle data authoritative and automatically
 * reflects employee status changes made through Employee Management.
 */
async function getEmployeeLifecycle() {
  const rows = await Employee.aggregate([
    {
      $project: {
        departmentId: 1,
        normalizedStatus: {
          $toUpper: {
            $trim: {
              input: { $ifNull: ["$status", ""] },
            },
          },
        },
      },
    },
    {
      $set: {
        normalizedStatus: {
          $replaceAll: {
            input: {
              $replaceAll: {
                input: "$normalizedStatus",
                find: "-",
                replacement: "_",
              },
            },
            find: " ",
            replacement: "_",
          },
        },
      },
    },
    {
      $group: {
        _id: {
          departmentId: "$departmentId",
          status: "$normalizedStatus",
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const makeCounts = () => ({
    total: 0,
    active: 0,
    onboarding: 0,
    probation: 0,
    noticePeriod: 0,
    offboarding: 0,
  });

  const overall = makeCounts();
  const byDepartmentMap = new Map<string, ReturnType<typeof makeCounts>>();

  const addCount = (
    target: ReturnType<typeof makeCounts>,
    status: string,
    count: number,
  ) => {
    if (status === "ACTIVE" || status === "ON_LEAVE") {
      target.active += count;
    } else if (status === "ONBOARDING") {
      target.onboarding += count;
    } else if (status === "ON_PROBATION" || status === "PROBATION") {
      target.probation += count;
    } else if (
      status === "NOTICE_PERIOD" ||
      status === "NOTICE" ||
      status === "NOTICEPERIOD"
    ) {
      target.noticePeriod += count;
    } else if (
      status === "OFFBOARDING" ||
      status === "RESIGNED" ||
      status === "TERMINATED"
    ) {
      target.offboarding += count;
    } else {
      // INACTIVE, ON_HOLD and other non-workforce statuses are intentionally
      // excluded from the lifecycle distribution.
      return;
    }

    target.total += count;
  };

  for (const row of rows) {
    const departmentId = String(row._id?.departmentId ?? "");
    const status = String(row._id?.status ?? "");
    const count = Number(row.count ?? 0);

    addCount(overall, status, count);

    if (departmentId) {
      const departmentCounts = byDepartmentMap.get(departmentId) ?? makeCounts();
      addCount(departmentCounts, status, count);
      byDepartmentMap.set(departmentId, departmentCounts);
    }
  }

  const departmentIds = [...byDepartmentMap.keys()];
  const departments = departmentIds.length
    ? await Department.find({ _id: { $in: departmentIds } })
        .select("_id name")
        .lean()
    : [];

  const departmentNameMap = new Map(
    departments.map((department) => [String(department._id), department.name]),
  );

  const byDepartment = departmentIds
    .map((departmentId) => ({
      department: departmentNameMap.get(departmentId) ?? departmentId,
      ...byDepartmentMap.get(departmentId)!,
    }))
    .sort((a, b) => a.department.localeCompare(b.department));

  return {
    overall,
    byDepartment,
  };
}

dashboardRouter.get("/overview", async (_req, res, next) => {
  try {
    const [
      kpis,
      headcountByDepartment,
      headcountTrend,
      genderDiversity,
      employmentType,
      attendanceTrend,
      recruitmentPipeline,
      costTrend,
      upcomingBirthdays,
      upcomingAnniversaries,
      upcomingHolidays,
      recentActivity,
      employeeLifecycle,
    ] = await Promise.all([
      repo.getKpis(),
      employeeRepo.getHeadcountByDepartment(),
      employeeRepo.getHeadcountTrend(6),
      employeeRepo.getGenderDiversity(),
      employeeRepo.getEmploymentTypeBreakdown(),
      attendanceRepo.getMonthlyAttendanceTrend(6),
      recruitmentRepo.getPipelineSummary(),
      payrollRepo.getCostTrend(6),
      repo.getUpcomingBirthdays(),
      repo.getUpcomingAnniversaries(),
      repo.getUpcomingHolidays(),
      repo.getRecentActivity(8),
      getEmployeeLifecycle(),
    ]);

    res.json({
      kpis,
      headcountByDepartment,
      headcountTrend,
      genderDiversity,
      employmentType,
      attendanceTrend,
      recruitmentPipeline,
      costTrend,
      upcomingBirthdays,
      upcomingAnniversaries,
      upcomingHolidays,
      recentActivity,
      employeeLifecycle,
    });
  } catch (err) {
    next(err);
  }
});
