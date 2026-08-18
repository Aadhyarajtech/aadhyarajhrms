import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isAdmin, isManagerOrAbove } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import * as repo from "./employees.repository";
import { notify } from "@/modules/notifications/notifications.repository";

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

employeesRouter.get(
  "/",
  validate(listQuerySchema, "query"),
  isManagerOrAbove,
  async (req, res, next) => {
    try {
      const requester = req.user!;
      const filters = { ...(req.query as any) };

      // Managers can only see their own direct reports.
      // Never trust managerId supplied by the frontend.
      if (requester.role === "MANAGER") {
        if (!requester.employeeId) {
          throw AppError.forbidden();
        }

        filters.managerId = requester.employeeId;
      }

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

employeesRouter.get("/:id", async (req, res, next) => {
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

    // Employee can only view their own profile.
    if (requester.role === "EMPLOYEE") {
      if (requester.employeeId !== req.params.id) {
        throw AppError.forbidden();
      }

      return res.json({ employee });
    }

    // Manager can only view their direct reports.
    if (requester.role === "MANAGER") {
      if (!requester.employeeId) {
        throw AppError.forbidden();
      }

      if (employee.managerId !== requester.employeeId) {
        throw AppError.forbidden();
      }

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
  status: z
    .enum([
      "ACTIVE",
      "ON_PROBATION",
      "ON_LEAVE",
      "NOTICE_PERIOD",
      "INACTIVE",
      "ON_HOLD",
    ])
    .optional(),
  phone: z.string().optional(),
  personalEmail: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().nullable().optional(),
  country: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  avatarUrl: z.string().optional(),
  signatureUrl: z.string().nullable().optional(),

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
  completedAt: z.string().nullable().optional(),
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
        dateOfBirth: req.body.dateOfBirth,
        phone: req.body.phone,
        personalEmail: req.body.personalEmail,
        address: req.body.address,
        city: req.body.city,
        state: req.body.state,
        country: req.body.country,
        emergencyContactName: req.body.emergencyContactName,
        emergencyContactPhone: req.body.emergencyContactPhone,
        avatarUrl: req.body.avatarUrl,
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

      const employee = await repo.updateEmployee(req.params.id, body);

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
