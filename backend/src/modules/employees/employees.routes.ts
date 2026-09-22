import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { profileImageUpload, UPLOADS_PUBLIC_PATH } from "@/middleware/upload";
import { isAdmin, isManagerOrAbove } from "@/middleware/rbac";
import { requirePermission } from "@/middleware/permissions";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import * as repo from "./employees.repository";
import { notify } from "@/modules/notifications/notifications.repository";
import {
  generateCareerInsights,
  generateEmployee360Summary,
} from "./employee.ai";
import * as attendanceRepo from "@/modules/attendance/attendance.repository";
import * as leaveRepo from "@/modules/leave/leave.repository";
import * as performanceRepo from "@/modules/performance/performance.repository";
export const employeesRouter = Router();
employeesRouter.use(authenticate);

const listQuerySchema = z.object({
  search: z.string().optional(),
  departmentId: z.string().optional(),
  status: z.string().optional(),
  managerId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

employeesRouter.post(
  "/:id/avatar",
  profileImageUpload.single("avatar"),
  async (req, res, next) => {
    try {
      const requester = req.user!;

      const employee = await repo.getEmployeeById(req.params.id);

      if (!employee) throw AppError.notFound("Employee not found.");

      const isSelf = requester.employeeId === req.params.id;
      const isPrevileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(requester.role);

      if (!isSelf && !isPrevileged) throw AppError.forbidden();

      if (!req.file) throw AppError.badRequest("Profile image is required.");

      const avatarUrl = `${UPLOADS_PUBLIC_PATH}/${req.file.filename}`;

      const updated = await repo.updateEmployee(req.params.id, {
        avatarUrl,
      });

      res.json({
        avatarUrl,
        employee: updated,
      });
    } catch (error) {
      next(error);
    }
  },
);

employeesRouter.get(
  "/",
  validate(listQuerySchema, "query"),
  requirePermission("employees.view"),
  async (req, res, next) => {
    try {
      const requester = req.user!;
      const filters = { ...(req.query as any) };

      // Reporting managers can view the full employee directory.
      // This only changes visibility; manager-specific write/approval
      // permissions remain enforced by their respective endpoints.

      res.json(await repo.listEmployees(filters));
    } catch (err) {
      next(err);
    }
  },
);

employeesRouter.get("/managers", isManagerOrAbove, async (_req, res, next) => {
  try {
    res.json({ managers: await repo.getManagersList() });
  } catch (err) {
    next(err);
  }
});

employeesRouter.get("/org-chart", isManagerOrAbove, async (_req, res, next) => {
  try {
    res.json({ chart: await repo.getOrgChart() });
  } catch (err) {
    next(err);
  }
});

employeesRouter.get(
  "/analytics/headcount-by-department",
  isManagerOrAbove,
  async (_req, res, next) => {
    try {
      res.json({ data: await repo.getHeadcountByDepartment() });
    } catch (err) {
      next(err);
    }
  },
);

employeesRouter.get(
  "/analytics/gender-diversity",
  isManagerOrAbove,
  async (_req, res, next) => {
    try {
      res.json({ data: await repo.getGenderDiversity() });
    } catch (err) {
      next(err);
    }
  },
);

employeesRouter.get(
  "/analytics/employment-type",
  isManagerOrAbove,
  async (_req, res, next) => {
    try {
      res.json({ data: await repo.getEmploymentTypeBreakdown() });
    } catch (err) {
      next(err);
    }
  },
);

employeesRouter.get(
  "/analytics/headcount-trend",
  isManagerOrAbove,
  async (req, res, next) => {
    try {
      const months = req.query.months ? Number(req.query.months) : 6;
      res.json({ data: await repo.getHeadcountTrend(months) });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   AI CAREER & DEVELOPMENT INSIGHTS
========================================================= */

employeesRouter.get(
  "/ai/career/:id",
  requirePermission("employees.view"),
  async (req, res, next) => {
    try {
      const employeeId = req.params.id;

      const employee = await repo.getEmployeeAiContext(employeeId);

      if (!employee) {
        return res.status(404).json({
          message: "Employee not found.",
        });
      }

      const ai = await generateCareerInsights({
        employee: employee.employee,
        department: employee.department,
        designation: employee.designation,
        manager: employee.manager,
      });

      return res.json({
        employeeId,
        ai,
      });
    } catch (error) {
      return next(error);
    }
  },
);

/* =========================================================
   AI EMPLOYEE 360° SUMMARY
========================================================= */

/**
 * Returns the most recent completed months, including the current month.
 *
 * The month/year calculation is intentionally done in Asia/Kolkata so that
 * the AI summary does not change month unexpectedly around UTC midnight.
 */
function getPreviousMonths(months: number) {
  const now = new Date();

  const currentYear = Number(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
    }).format(now),
  );

  const currentMonth = Number(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "numeric",
    }).format(now),
  );

  const result: Array<{ month: number; year: number }> = [];

  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(
      Date.UTC(currentYear, currentMonth - 1 - i, 1),
    );

    result.push({
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
    });
  }

  return result;
}

/**
 * Builds a compact attendance context for the AI model.
 *
 * We use six months of existing attendance summaries rather than sending
 * individual attendance records to the LLM. This keeps the prompt small
 * while still giving the model enough history to identify trends.
 */
async function getEmployee360Attendance(employeeId: string) {
  const periods = getPreviousMonths(6);

  const summaries = await Promise.all(
    periods.map(({ month, year }) =>
      attendanceRepo.getMonthlyEmployeeSummary(employeeId, month, year),
    ),
  );

  const totals = summaries.reduce(
    (acc, summary) => {
      acc.totalDays += Number(summary.totalDays ?? 0);
      acc.presentDays += Number(summary.presentDays ?? 0);
      acc.absentDays += Number(summary.absentDays ?? 0);
      acc.halfDays += Number(summary.halfDays ?? 0);
      acc.lateDays += Number(summary.lateDays ?? 0);
      acc.earlyDepartureDays += Number(summary.earlyDepartureDays ?? 0);
      acc.totalWorkHours += Number(summary.totalWorkHours ?? 0);
      acc.weekendDays += Number(summary.weekendDays ?? 0);
      acc.holidayDays += Number(summary.holidayDays ?? 0);
      return acc;
    },
    {
      totalDays: 0,
      presentDays: 0,
      absentDays: 0,
      halfDays: 0,
      lateDays: 0,
      earlyDepartureDays: 0,
      totalWorkHours: 0,
      weekendDays: 0,
      holidayDays: 0,
    },
  );

  const workingDays =
    totals.totalDays - totals.weekendDays - totals.holidayDays;

  const attendanceRate =
    workingDays > 0
      ? Math.round((totals.presentDays / workingDays) * 100)
      : null;

  const averageWorkHours =
    totals.presentDays > 0
      ? Math.round((totals.totalWorkHours / totals.presentDays) * 100) / 100
      : null;

  // Compare the first three months with the latest three months.
  const firstHalf = summaries.slice(0, 3);
  const secondHalf = summaries.slice(3);

  const calculateRate = (items: typeof summaries) => {
    const present = items.reduce(
      (sum, item) => sum + Number(item.presentDays ?? 0),
      0,
    );

    const working = items.reduce(
      (sum, item) =>
        sum +
        Number(item.totalDays ?? 0) -
        Number(item.weekendDays ?? 0) -
        Number(item.holidayDays ?? 0),
      0,
    );

    return working > 0 ? (present / working) * 100 : null;
  };

  const firstRate = calculateRate(firstHalf);
  const secondRate = calculateRate(secondHalf);

  let trend: string | null = null;

  if (firstRate !== null && secondRate !== null) {
    const difference = secondRate - firstRate;

    if (difference >= 5) {
      trend = "IMPROVING";
    } else if (difference <= -5) {
      trend = "DECLINING";
    } else {
      trend = "STABLE";
    }
  }

  return {
    attendanceRate,
    presentDays: totals.presentDays,
    absentDays: totals.absentDays,
    halfDays: totals.halfDays,
    lateDays: totals.lateDays,
    averageWorkHours,
    trend,
  };
}

/**
 * Builds the leave context used by the Employee 360° summary.
 *
 * This intentionally uses the existing leave repository APIs so that leave
 * calculations remain consistent with the rest of the HRMS.
 */
async function getEmployee360Leave(employeeId: string) {
  const currentYear = Number(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
    }).format(new Date()),
  );

  const [balances, requests] = await Promise.all([
    leaveRepo.listBalancesForEmployee(employeeId, currentYear),
    leaveRepo.listRequests({ employeeId }),
  ]);

  const totalAllocated = (balances as any[]).reduce(
    (sum: number, balance: any) =>
      sum + Number(balance.allotted ?? 0),
    0,
  );

  const totalUsed = (balances as any[]).reduce(
    (sum: number, balance: any) =>
      sum + Number(balance.used ?? 0),
    0,
  );

  const remaining = (balances as any[]).reduce(
    (sum: number, balance: any) =>
      sum +
      Math.max(
        0,
        Number(balance.allotted ?? 0) - Number(balance.used ?? 0),
      ),
    0,
  );

  const recentRequests = (requests as any[]).slice(0, 20);

  return {
    totalAllocated,
    totalUsed,
    remaining,
    requests: recentRequests.map((request: any) => ({
      leaveType:
        request.leaveTypeName ??
        request.leaveType ??
        "Leave",
      totalDays: Number(request.totalDays ?? 0),
      status: request.status ?? "UNKNOWN",
    })),
  };
}

/**
 * Builds the performance context used by the Employee 360° summary.
 *
 * The existing scorecard API exposes strengths and development areas but
 * does not expose individual goal records in its response, so goals are
 * deliberately left empty instead of inventing goal data.
 */
async function getEmployee360Performance(employeeId: string) {
  const scorecard = await performanceRepo.getPerformanceScorecard(employeeId);

  if (!scorecard) {
    return {
      latestRating: null,
      strengths: [],
      developmentAreas: [],
      goals: [],
    };
  }

  return {
    latestRating: scorecard.overallRating ?? null,
    strengths: Array.isArray(scorecard.strengths)
      ? scorecard.strengths
      : [],
    developmentAreas: Array.isArray(scorecard.developmentAreas)
      ? scorecard.developmentAreas
      : [],
    goals: [],
  };
}

employeesRouter.get(
  "/ai/360/:id",
  requirePermission("employees.view"),
  async (req, res, next) => {
    try {
      const employeeId = req.params.id;

      const employee = await repo.getEmployeeAiContext(employeeId);

      if (!employee) {
        return res.status(404).json({
          message: "Employee not found.",
        });
      }

      const [attendance, leave, performance] = await Promise.all([
        getEmployee360Attendance(employeeId),
        getEmployee360Leave(employeeId),
        getEmployee360Performance(employeeId),
      ]);

      const ai = await generateEmployee360Summary({
        profile: employee.employee,
        department: employee.department?.name ?? null,
        designation: employee.designation?.title ?? null,
        manager: employee.manager?.name ?? null,
        skills: employee.employee.skills,
        performance,
        attendance,
        leave,
      });

      return res.json({
        employeeId,
        ai,
      });
    } catch (error) {
      return next(error);
    }
  },
);

employeesRouter.get(
  "/:id",
  requirePermission("employees.view"),
  async (req, res, next) => {
  try {
    const requester = req.user!;

    const employee = await repo.getEmployeeById(req.params.id);

    if (!employee) {
      throw AppError.notFound("Employee not found.");
    }

    // Super Admin and HR Admin can view any employee.
    const isAdmin =
      requester.role === "SUPER_ADMIN" || requester.role === "HR_ADMIN";

    if (isAdmin) {
      return res.json({ employee });
    }

    // Any authenticated employee can view their own profile.
    if (requester.employeeId === req.params.id) {
      return res.json({ employee });
    }

    // Reporting managers can view any employee profile.
    // This only changes visibility; edit permissions remain restricted below.
    if (requester.role === "MANAGER") {
      return res.json({ employee });
    }

    // Other roles with employees.view (Recruiter, Finance, IT Support) can
    // view employee profiles. Their write access remains restricted below.
    if (["RECRUITER", "FINANCE", "IT_SUPPORT"].includes(requester.role)) {
      return res.json({ employee });
    }

    throw AppError.forbidden();
  } catch (err) {
    next(err);
  }
});

employeesRouter.get(
  "/:id/direct-reports",
  isManagerOrAbove,
  async (req, res, next) => {
    try {
      const requester = req.user!;

      const isAdmin =
        requester.role === "SUPER_ADMIN" || requester.role === "HR_ADMIN";

      // Managers may only request their own direct reports.
      if (
        requester.role === "MANAGER" &&
        requester.employeeId !== req.params.id
      ) {
        throw AppError.forbidden();
      }

      // Employees cannot access direct-report lists.
      if (!isAdmin && requester.role !== "MANAGER") {
        throw AppError.forbidden();
      }

      res.json({
        employees: await repo.listDirectReports(req.params.id),
      });
    } catch (err) {
      next(err);
    }
  },
);

const createEmployeeSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  role: z
    .enum([
      "SUPER_ADMIN",
      "HR_ADMIN",
      "MANAGER",
      "RECRUITER",
      "FINANCE",
      "EMPLOYEE",
    ])
    .default("EMPLOYEE"),
  departmentId: z.string(),
  designationId: z.string(),
  managerId: z.string().nullable().optional(),
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"])
    .optional(),
  dateOfJoining: z.string(),
  gender: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  personalEmail: z.string().email().optional(),
  grade: z.string().optional(),
  workLocation: z.string().optional(),
  probationPeriodMonths: z.coerce.number().int().min(0).optional(),

  emergencyContactName: z.string().nullable().optional(),
  emergencyContactPhone: z.string().nullable().optional(),
  emergencyContactRelationship: z.string().nullable().optional(),
  emergencyContactEmail: z.string().email().or(z.literal("")).nullable().optional(),
  employeeAadhaar: z.string().nullable().optional(),
  employeePan: z.string().nullable().optional(),
  employeeTan: z.string().nullable().optional(),
  bankAccountNumber: z.string().nullable().optional(),
  bankIfscCode: z.string().nullable().optional(),
  bankBranch: z.string().nullable().optional(),
  investmentDeclarations: z.record(z.string(), z.unknown()).optional(),
  medicalConditions: z.string().nullable().optional(),
  bloodGroup: z.string().nullable().optional(),
  insurancePolicyNumber: z.string().nullable().optional(),
  temporaryPassword: z
    .string()
    .min(8, "Temporary password must be at least 8 characters."),
});

employeesRouter.post(
  "/",
  isAdmin,
  validate(createEmployeeSchema),
  async (req, res, next) => {
    try {
      const employee = await repo.createEmployee(req.body);
      res.status(201).json({ employee });
    } catch (err) {
      next(err);
    }
  },
);

const updateEmployeeSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  gender: z.string().nullable().optional(),
  maritalStatus: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  departmentId: z.string().optional(),
  designationId: z.string().optional(),
  managerId: z.string().nullable().optional(),
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"])
    .optional(),
  grade: z.string().nullable().optional(),
  workLocation: z.string().nullable().optional(),
  probationPeriodMonths: z.coerce.number().int().min(0).nullable().optional(),

  probationStartDate: z.string().nullable().optional(),
  probationEndDate: z.string().nullable().optional(),

  noticeStartDate: z.string().nullable().optional(),
  lastWorkingDate: z.string().nullable().optional(),
  noticeDays: z.coerce.number().int().min(0).nullable().optional(),

  status: z
    .enum([
    "ONBOARDING",
    "ACTIVE",
    "ON_PROBATION",
    "ON_LEAVE",
    "NOTICE_PERIOD",
    "TERMINATED",
    "RESIGNED",
    "INACTIVE",
    "ON_HOLD",
    ])
    .optional(),
  phone: z.string().optional(),
  personalEmail: z.string().email().or(z.literal("")).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().nullable().optional(),
  country: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelationship: z.string().nullable().optional(),
  emergencyContactEmail: z
    .string()
    .email()
    .or(z.literal(""))
    .nullable()
    .optional(),
  employeeAadhaar: z
    .string()
    .trim()
    .regex(/^\d{12}$/, "Aadhaar must contain exactly 12 digits.")
    .nullable()
    .optional(),
  employeePan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN must be a valid 10-character PAN.")
    .nullable()
    .optional(),

  // Sensitive financial information. These fields are accepted by the
  // privileged employee update endpoint (/:id), while the /me endpoint
  // intentionally does not copy them from employee self-service requests.
  employeeTan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}\d{5}[A-Z]$/, "TAN must be a valid 10-character TAN.")
    .nullable()
    .optional(),
  bankAccountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,18}$/, "Bank account number must contain 6 to 18 digits.")
    .nullable()
    .optional(),
  bankIfscCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC code must be a valid 11-character IFSC.")
    .nullable()
    .optional(),
  bankBranch: z
    .string()
    .trim()
    .max(150, "Bank branch cannot exceed 150 characters.")
    .nullable()
    .optional(),
  investmentDeclarations: z
    .object({
      hra: z.coerce.number().min(0).optional(),
      deduction80C: z.coerce.number().min(0).optional(),
      other: z.coerce.number().min(0).optional(),
    })
    .optional(),

  avatarUrl: z.string().optional(),
  signature: z.string().nullable().optional(),
  medicalConditions: z.string().nullable().optional(),
  bloodGroup: z.string().nullable().optional(),
  insurancePolicyNumber: z.string().nullable().optional(),
  emergencyContacts: z
    .array(
      z.object({
        name: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        relationship: z.string().nullable().optional(),
        email: z.string().email().or(z.literal("")).nullable().optional(),
      }),
    )
    .optional(),

  education: z
    .array(
      z.object({
        qualification: z.string().min(1),
        institution: z.string().min(1),
        specialization: z.string().nullable().optional(),
        startYear: z.coerce.number().int().nullable().optional(),
        endYear: z.coerce.number().int().nullable().optional(),
        grade: z.string().nullable().optional(),
      }),
    )
    .optional(),

  certifications: z
    .array(
      z.object({
        name: z.string().min(1),
        issuingOrganization: z.string().nullable().optional(),
        issueDate: z.string().nullable().optional(),
        expiryDate: z.string().nullable().optional(),
        credentialId: z.string().nullable().optional(),
      }),
    )
    .optional(),

  workHistory: z
    .array(
      z.object({
        companyName: z.string().min(1),
        designation: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        responsibilities: z.string().nullable().optional(),
      }),
    )
    .optional(),

  skills: z
    .array(
      z.object({
        name: z.string().min(1),
        category: z.string().nullable().optional(),
        competencyLevel: z.enum([
          "BEGINNER",
          "INTERMEDIATE",
          "ADVANCED",
          "EXPERT",
        ]),
      }),
    )
    .optional(),
  dateOfExit: z.string().nullable().optional(),
});
const updateOffboardingChecklistSchema = z.object({
  assetReturn: z.boolean().optional(),
  accessRevoked: z.boolean().optional(),
  exitInterview: z.boolean().optional(),
  finalSettlement: z.boolean().optional(),
});

employeesRouter.patch(
  "/me",
  validate(updateEmployeeSchema),
  async (req, res, next) => {
    try {
      const employee = await repo.getEmployeeByUserId(req.user!.userId);
      if (!employee) throw AppError.notFound("Employee profile not found.");

      const body = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        gender: req.body.gender,
        maritalStatus: req.body.maritalStatus,
        dateOfBirth: req.body.dateOfBirth,
        phone: req.body.phone,
        personalEmail: req.body.personalEmail,
        address: req.body.address,
        city: req.body.city,
        state: req.body.state,
        country: req.body.country,

        emergencyContactName: req.body.emergencyContactName,
        emergencyContactPhone: req.body.emergencyContactPhone,
        emergencyContactRelationship: req.body.emergencyContactRelationship,
        emergencyContactEmail: req.body.emergencyContactEmail,
        emergencyContacts: req.body.emergencyContacts,
        medicalConditions: req.body.medicalConditions,
        bloodGroup: req.body.bloodGroup,
        insurancePolicyNumber: req.body.insurancePolicyNumber,

        employeeAadhaar: req.body.employeeAadhaar,
        employeePan: req.body.employeePan,
        signature: req.body.signature,
        avatarUrl: req.body.avatarUrl,

        education: req.body.education,
        certifications: req.body.certifications,
        workHistory: req.body.workHistory,
        skills: req.body.skills,
      };

      const updated = await repo.updateEmployee(employee.id, body);
      res.json({ employee: updated });
    } catch (err) {
      next(err);
    }
  },
);

employeesRouter.patch(
  "/:id",
  validate(updateEmployeeSchema),
  async (req, res, next) => {
    try {
      const requester = req.user!;
      const target = (await repo.getEmployeeById(req.params.id)) as any;
      if (!target) throw AppError.notFound("Employee not found.");

      const isSelf = requester.employeeId === req.params.id;
      const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(requester.role);
      if (!isSelf && !isPrivileged) throw AppError.forbidden();

      // Employees may only edit their own contact details, not org-structural fields.
      const body = isPrivileged
        ? req.body
        : {
            phone: req.body.phone,
            personalEmail: req.body.personalEmail,
            address: req.body.address,
            city: req.body.city,
            emergencyContactName: req.body.emergencyContactName,
            emergencyContactPhone: req.body.emergencyContactPhone,
            avatarUrl: req.body.avatarUrl,
          };

            const updateBody: any = { ...body };

      if (
        isPrivileged &&
        req.body.status === "ON_PROBATION" &&
        target.status !== "ON_PROBATION"
      ) {
        const probationStartDate =
          req.body.probationStartDate ||
          target.probationStartDate ||
          target.dateOfJoining ||
          new Date().toISOString();

        updateBody.probationStartDate = probationStartDate;

        if (!req.body.probationEndDate) {
          const probationMonths = Number(
            req.body.probationPeriodMonths ??
              target.probationPeriodMonths ??
              3,
          );

          const probationEndDate = new Date(probationStartDate);
          probationEndDate.setMonth(
            probationEndDate.getMonth() + probationMonths,
          );

          updateBody.probationEndDate = probationEndDate.toISOString();
        }
      }

      const employee = await repo.updateEmployee(
  req.params.id,
  updateBody,
);

      if (
        isPrivileged &&
        req.body.status &&
        req.body.status !== target.status
      ) {
        const newStatus = req.body.status;

        // Keep the linked user account synchronized with employment status.
        // INACTIVE and ON_HOLD disable the account while preserving the
        // employee record. ACTIVE restores account access.
        if (newStatus === "INACTIVE" || newStatus === "ON_HOLD") {
          await repo.updateUserActiveStatus(target.userId, false);
        } else if (newStatus === "ACTIVE") {
          await repo.updateUserActiveStatus(target.userId, true);
        }

        await notify({
          userId: target.userId,
          type: "SYSTEM",
          title: "Your employment status was updated",
          message: `Your status is now "${newStatus.replace("_", " ")}".`,
        });
      }

      res.json({ employee });
    } catch (err) {
      next(err);
    }
  },
);

employeesRouter.get("/:id/onboarding", isAdmin, async (req, res, next) => {
  try {
    const employee = await repo.getEmployeeById(req.params.id);

    if (!employee) {
      throw AppError.notFound("Employee not found.");
    }

    res.json({
      onboarding: employee.onboarding ?? null,
    });
  } catch (err) {
    next(err);
  }
});

employeesRouter.post("/:id/onboarding/start", isAdmin, async (req, res, next) => {
  try {
    const employee = await repo.getEmployeeById(req.params.id);

    if (!employee) {
      throw AppError.notFound("Employee not found.");
    }

    if (employee.status !== "ONBOARDING") {
      throw AppError.badRequest(
        "Onboarding can only be started for employees with ONBOARDING status.",
      );
    }

    const onboarding = employee.onboarding ?? null;

    res.json({
      success: true,
      message: "Employee onboarding is ready to continue.",
      employee,
      onboarding,
    });
  } catch (err) {
    next(err);
  }
});

employeesRouter.patch(
  "/:id/offboarding-checklist",
  isAdmin,
  validate(updateOffboardingChecklistSchema),
  async (req, res, next) => {
    try {
      const employee = (await repo.getEmployeeById(req.params.id)) as any;

      if (!employee) {
        throw AppError.notFound("Employee not found.");
      }

      if (employee.status !== "NOTICE_PERIOD") {
        throw AppError.badRequest(
          "Offboarding checklist is available only for employees in notice period.",
        );
      }

      const currentChecklist = employee.offboardingChecklist ?? {
        assetReturn: false,
        accessRevoked: false,
        exitInterview: false,
        finalSettlement: false,
        completedAt: null,
      };

      const checklist = {
        ...currentChecklist,
        ...req.body,
      };

      const completed =
        checklist.assetReturn &&
        checklist.accessRevoked &&
        checklist.exitInterview &&
        checklist.finalSettlement;

      checklist.completedAt = completed
        ? (checklist.completedAt ?? new Date().toISOString())
        : null;

      const updated = await repo.updateEmployee(req.params.id, {
        offboardingChecklist: checklist,
      });

      res.json({
        employee: updated,
        offboardingChecklist: checklist,
      });
    } catch (err) {
      next(err);
    }
  },
);

employeesRouter.patch(
  "/:id/onboarding/stage",
  isAdmin,
  async (req, res, next) => {
    try {
      const stage = Number(req.body.stage);
      if (!Number.isInteger(stage) || stage < 2 || stage > 7) {
        throw AppError.badRequest("Onboarding stage must be an integer from 2 to 7.");
      }

      const employee = await repo.updateOnboardingStage(
        req.params.id,
        stage,
        req.user!.userId,
        typeof req.body.remarks === "string" ? req.body.remarks : null,
      );

      if (!employee) throw AppError.notFound("Employee not found.");

      res.json({
        success: true,
        message: `Onboarding stage ${stage} completed successfully.`,
        employee,
      });
    } catch (err) {
      if (err instanceof Error && !("statusCode" in err)) {
        return next(AppError.badRequest(err.message));
      }
      next(err);
    }
  },
);

employeesRouter.post(
  "/:id/complete-onboarding",
  isAdmin,
  async (req, res, next) => {
    try {
      const employeeBefore = await repo.getEmployeeById(req.params.id);

      if (!employeeBefore) {
        throw AppError.notFound("Employee not found.");
      }

      if (employeeBefore.status !== "ONBOARDING") {
        throw AppError.badRequest(
          "Only employees with ONBOARDING status can complete onboarding.",
        );
      }

      const updatedEmployee = await repo.completeOnboarding(
        req.params.id,
        req.user!.userId,
      );

      if (!updatedEmployee) {
        throw AppError.notFound("Employee not found.");
      }

      await repo.updateUserActiveStatus(employeeBefore.userId, true);

      await notify({
        userId: employeeBefore.userId,
        type: "SYSTEM",
        title: "Onboarding completed",
        message:
          "Congratulations! Your onboarding has been completed and your employee account is now active.",
        link: `/employees/${req.params.id}`,
      });

      res.json({
        success: true,
        message: "Employee onboarding completed successfully.",
        employee: updatedEmployee,
        onboarding: updatedEmployee.onboarding ?? null,
      });
    } catch (err) {
      if (err instanceof Error && !("statusCode" in err)) {
        return next(AppError.badRequest(err.message));
      }
      next(err);
    }
  },
);

employeesRouter.post(
  "/:id/confirm-probation",
  isAdmin,
  async (req, res, next) => {
    try {
      const employee = await repo.getEmployeeById(req.params.id);

      if (!employee) {
        throw AppError.notFound("Employee not found.");
      }

      if (employee.status !== "ON_PROBATION") {
        throw AppError.badRequest(
          "Only employees currently on probation can be confirmed.",
        );
      }

      const updatedEmployee = await repo.updateEmployee(req.params.id, {
        status: "ACTIVE",
        probationEndDate:
          employee.probationEndDate ?? new Date().toISOString(),
      });

      await repo.updateUserActiveStatus(employee.userId, true);

      await notify({
        userId: employee.userId,
        type: "SYSTEM",
        title: "Probation completed",
        message:
          "Congratulations! Your probation period has been successfully completed and your employment has been confirmed.",
        link: `/employees/${req.params.id}`,
      });

      res.json({
        success: true,
        message: "Employee probation confirmed successfully.",
        employee: updatedEmployee,
      });
    } catch (err) {
      next(err);
    }
  },
);

employeesRouter.post(
  "/:id/extend-probation",
  isAdmin,
  async (req, res, next) => {
    try {
      const employee = await repo.getEmployeeById(req.params.id);

      if (!employee) {
        throw AppError.notFound("Employee not found.");
      }

      if (employee.status !== "ON_PROBATION") {
        throw AppError.badRequest(
          "Only employees on probation can have their probation extended.",
        );
      }

      const { extensionDays, remarks } = req.body;

      if (
        !Number.isInteger(extensionDays) ||
        extensionDays < 1
      ) {
        throw AppError.badRequest(
          "Extension days must be a valid number of at least 1 day.",
        );
      }

      const currentEndDate = employee.probationEndDate
        ? new Date(employee.probationEndDate)
        : new Date();

      currentEndDate.setDate(
        currentEndDate.getDate() + extensionDays,
      );

      const updatedEmployee = await repo.updateEmployee(req.params.id, {
        status: "ON_PROBATION",
        probationEndDate: currentEndDate.toISOString(),
        probationExtensionDetails: {
          extensionDays,
          extendedFrom: employee.probationEndDate ?? null,
          extendedTo: currentEndDate.toISOString(),
          remarks:
            typeof remarks === "string"
              ? remarks.trim() || null
              : null,
          extendedAt: new Date().toISOString(),
        },
      });

      await notify({
        userId: employee.userId,
        type: "SYSTEM",
        title: "Probation extended",
        message: `Your probation period has been extended by ${extensionDays} day(s).`,
        link: `/employees/${req.params.id}`,
      });

      res.json({
        success: true,
        message: "Employee probation extended successfully.",
        employee: updatedEmployee,
      });
    } catch (err) {
      next(err);
    }
  },
);

employeesRouter.post(
  "/:id/start-notice-period",
  isAdmin,
  async (req, res, next) => {
    try {
      const employee = await repo.getEmployeeById(req.params.id);

      if (!employee) {
        throw AppError.notFound("Employee not found.");
      }

      if (
        employee.status !== "ACTIVE" &&
        employee.status !== "ON_PROBATION"
      ) {
        throw AppError.badRequest(
          "Only active or probation employees can start the notice period.",
        );
      }

      const noticeStartDate = new Date().toISOString();

     const {
  noticeDays: noticeDaysInput = 30,
  resignationDate,
  resignationReason,
  employeeRemarks,
  hrRemarks,
} = req.body;

const noticeDays = Number(noticeDaysInput);

      if (!Number.isInteger(noticeDays) || noticeDays < 1) {
        throw AppError.badRequest(
          "Notice period must be at least 1 day.",
        );
      }

     if (!resignationDate) {
  throw AppError.badRequest("Resignation date is required.");
}

if (
  typeof resignationReason !== "string" ||
  !resignationReason.trim()
) {
  throw AppError.badRequest("Resignation reason is required.");
}

      const lastWorkingDate = new Date(noticeStartDate);
      lastWorkingDate.setDate(
        lastWorkingDate.getDate() + noticeDays,
      );

   const updatedEmployee = await repo.updateEmployee(req.params.id, {
  status: "NOTICE_PERIOD",
  noticeStartDate,
  lastWorkingDate: lastWorkingDate.toISOString(),
  noticeDays,

  resignationDetails: {
    resignationDate,
    resignationReason: resignationReason.trim(),
    employeeRemarks:
      typeof employeeRemarks === "string" && employeeRemarks.trim()
        ? employeeRemarks.trim()
        : null,
    hrRemarks:
      typeof hrRemarks === "string" && hrRemarks.trim()
        ? hrRemarks.trim()
        : null,
  },
});    

      await notify({
        userId: employee.userId,
        type: "SYSTEM",
        title: "Notice period started",
        message: `Your notice period has started. Your last working date is ${lastWorkingDate.toLocaleDateString()}.`,
        link: `/employees/${req.params.id}`,
      });

      res.json({
        success: true,
        message: "Notice period started successfully.",
        employee: updatedEmployee,
      });
    } catch (err) {
      next(err);
    }
  },
);

employeesRouter.post(
  "/:id/complete-offboarding",
  isAdmin,
  async (req, res, next) => {
    try {
      const employee = await repo.getEmployeeById(req.params.id);

      if (!employee) {
        throw AppError.notFound("Employee not found.");
      }

      if (employee.status !== "NOTICE_PERIOD") {
        throw AppError.badRequest(
          "Only employees in notice period can complete offboarding.",
        );
      }

      const checklist = employee.offboardingChecklist;

      if (
        !checklist?.assetReturn ||
        !checklist?.accessRevoked ||
        !checklist?.exitInterview ||
        !checklist?.finalSettlement
      ) {
        throw AppError.badRequest(
          "Complete all offboarding checklist items before completing offboarding.",
        );
      }

      const updatedEmployee = await repo.updateEmployee(req.params.id, {
        status: "RESIGNED",
        offboardingChecklist: {
          ...checklist,
          completedAt:
            checklist.completedAt ?? new Date().toISOString(),
        },
      });

      await repo.updateUserActiveStatus(employee.userId, false);

      await notify({
        userId: employee.userId,
        type: "SYSTEM",
        title: "Offboarding completed",
        message:
          "Your offboarding has been completed and your employment status is now RESIGNED.",
        link: `/employees/${req.params.id}`,
      });

      res.json({
        success: true,
        message: "Employee offboarding completed successfully.",
        employee: updatedEmployee,
      });
    } catch (err) {
      next(err);
    }
  },
);


employeesRouter.post(
  "/:id/terminate",
  isAdmin,
  async (req, res, next) => {
    try {
      const employee = await repo.getEmployeeById(req.params.id);

      if (!employee) {
        throw AppError.notFound("Employee not found.");
      }

      if (
        employee.status !== "ACTIVE" &&
        employee.status !== "ON_PROBATION"
      ) {
        throw AppError.badRequest(
          "Only active or probation employees can be terminated.",
        );
      }

      const {
        terminationDate,
        terminationReason,
        employeeRemarks,
        hrRemarks,
      } = req.body;

      if (!terminationDate) {
        throw AppError.badRequest("Termination date is required.");
      }

      if (
        !terminationReason ||
        typeof terminationReason !== "string" ||
        !terminationReason.trim()
      ) {
        throw AppError.badRequest("Termination reason is required.");
      }

      const updatedEmployee = await repo.updateEmployee(req.params.id, {
        status: "TERMINATED",
        terminationDetails: {
          terminationDate,
          terminationReason: terminationReason.trim(),
          employeeRemarks:
            typeof employeeRemarks === "string"
              ? employeeRemarks.trim() || null
              : null,
          hrRemarks:
            typeof hrRemarks === "string"
              ? hrRemarks.trim() || null
              : null,
        },
      });

      await repo.updateUserActiveStatus(employee.userId, false);

      await notify({
        userId: employee.userId,
        type: "SYSTEM",
        title: "Employment terminated",
        message:
          "Your employment has been terminated. Please contact HR for further information.",
        link: `/employees/${req.params.id}`,
      });

      res.json({
        success: true,
        message: "Employee terminated successfully.",
        employee: updatedEmployee,
      });
    } catch (err) {
      next(err);
    }
  },
);