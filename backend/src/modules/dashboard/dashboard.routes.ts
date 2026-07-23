import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import * as repo from "./dashboard.repository";
import * as employeeRepo from "@/modules/employees/employees.repository";
import * as attendanceRepo from "@/modules/attendance/attendance.repository";
import * as recruitmentRepo from "@/modules/recruitment/recruitment.repository";
import * as payrollRepo from "@/modules/payroll/payroll.repository";

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

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
    });
  } catch (err) {
    next(err);
  }
});
