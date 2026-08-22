import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isAdmin, isManagerOrAbove } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import * as repo from "./performance.repository";
import { getEmployeeById } from "@/modules/employees/employees.repository";

export const performanceRouter = Router();
performanceRouter.use(authenticate);

performanceRouter.get("/cycles", async (_req, res, next) => {
  try {
    res.json({ cycles: await repo.listCycles() });
  } catch (err) {
    next(err);
  }
});

const cycleSchema = z.object({
  name: z.string().min(2),
  startDate: z.string(),
  endDate: z.string(),
});
performanceRouter.post(
  "/cycles",
  isAdmin,
  validate(cycleSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({ cycle: await repo.createCycle(req.body) });
    } catch (err) {
      next(err);
    }
  },
);

performanceRouter.get("/reviews", async (req, res, next) => {
  try {
    const { role, employeeId } = req.user!;
    const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(role);
    const isTeamScope = req.query.scope === "team";
    const filters: any = {
      cycleId: req.query.cycleId as string | undefined,
    };

    if (isTeamScope) {
      // Team Reviews are available to Managers, HR Admins, and Super Admins.
      if (!["MANAGER", "HR_ADMIN", "SUPER_ADMIN"].includes(role)) {
        throw AppError.forbidden(
          "You are not authorized to view team performance reviews.",
        );
      }

      // A Manager can only see reviews for employees assigned to them.
      if (role === "MANAGER") {
        if (!employeeId) {
          throw AppError.forbidden("Manager employee profile not found.");
        }

        filters.reviewerId = employeeId;
      }

      // HR Admin and Super Admin can view all team reviews.
      // No reviewerId/revieweeId restriction is applied for privileged roles.
    } else if (!isPrivileged) {
      // Regular employees can only view their own reviews.
      if (!employeeId) {
        throw AppError.forbidden("Employee profile not found.");
      }

      filters.revieweeId = employeeId;
    } else if (req.query.revieweeId) {
      // HR Admin/Super Admin may optionally filter by a specific employee.
      filters.revieweeId = req.query.revieweeId;
    }

    res.json({ reviews: await repo.listReviews(filters) });
  } catch (err) {
    next(err);
  }
});

performanceRouter.get("/reviews/mine", async (req, res, next) => {
  try {
    const cycle = await repo.getActiveCycle();
    if (!cycle || !req.user!.employeeId) return res.json({ review: null });
    const reviews = await repo.listReviews({
      cycleId: (cycle as any).id,
      revieweeId: req.user!.employeeId,
    });
    res.json({ review: reviews[0] ?? null });
  } catch (err) {
    next(err);
  }
});

const ensureSchema = z.object({
  cycleId: z.string(),
  revieweeId: z.string(),
  reviewerId: z.string(),
});
performanceRouter.post(
  "/reviews",
  isManagerOrAbove,
  validate(ensureSchema),
  async (req, res, next) => {
    try {
      const { role, employeeId } = req.user!;

      if (role === "MANAGER") {
        if (!employeeId) {
          throw AppError.forbidden("Manager employee profile not found.");
        }

        // Manager must be the reviewer
        if (req.body.reviewerId !== employeeId) {
          throw AppError.forbidden(
            "A manager can only create reviews as themselves.",
          );
        }

        // Reviewee must be a direct report
        const employee = (await getEmployeeById(req.body.revieweeId)) as any;

        if (!employee) {
          throw AppError.notFound("Employee not found.");
        }

        if (employee.managerId !== employeeId) {
          throw AppError.forbidden(
            "You can only create reviews for your direct reports.",
          );
        }
      }

      res.status(201).json({
        review: await repo.ensureReview(
          req.body.cycleId,
          req.body.revieweeId,
          req.body.reviewerId,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

const selfReviewSchema = z.object({
  selfRating: z.number().min(1).max(5),
  strengths: z.string().min(2),
  improvements: z.string().min(2),
});
const managerReviewSchema = z.object({
  managerRating: z.number().min(1).max(5),
  managerComments: z.string().min(2),
});
performanceRouter.post(
  "/reviews/:id/manager",
  isManagerOrAbove,
  validate(managerReviewSchema),
  async (req, res, next) => {
    try {
      const review = (await repo.getReview(req.params.id)) as any;

      if (!review) {
        throw AppError.notFound("Review not found.");
      }

      const { role, employeeId } = req.user!;

      if (role === "MANAGER") {
        if (!employeeId) {
          throw AppError.forbidden("Manager employee profile not found.");
        }

        // Manager must be the reviewer
        if (review.reviewerId !== employeeId) {
          throw AppError.forbidden(
            "You can only submit reviews assigned to you.",
          );
        }

        // Reviewee must be a direct report
        const employee = (await getEmployeeById(review.revieweeId)) as any;

        if (!employee) {
          throw AppError.notFound("Employee not found.");
        }

        if (employee.managerId !== employeeId) {
          throw AppError.forbidden("You can only review your direct reports.");
        }
      }

      res.json({
        review: await repo.submitManagerReview(
          req.params.id,
          req.body.managerRating,
          req.body.managerComments,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

performanceRouter.get("/goals", async (req, res, next) => {
  try {
    const employeeId =
      (req.query.employeeId as string) || req.user!.employeeId!;
    res.json({ goals: await repo.listGoals(employeeId) });
  } catch (err) {
    next(err);
  }
});

const goalSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  dueDate: z.string(),
});
performanceRouter.post(
  "/goals",
  validate(goalSchema),
  async (req, res, next) => {
    try {
      if (!req.user!.employeeId) throw AppError.forbidden();
      res.status(201).json({
        goal: await repo.createGoal({
          employeeId: req.user!.employeeId,
          ...req.body,
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

const progressSchema = z.object({ progress: z.number().int().min(0).max(100) });
performanceRouter.patch(
  "/goals/:id/progress",
  validate(progressSchema),
  async (req, res, next) => {
    try {
      res.json({
        goal: await repo.updateGoalProgress(req.params.id, req.body.progress),
      });
    } catch (err) {
      next(err);
    }
  },
);

performanceRouter.get(
  "/analytics/rating-by-department",
  isManagerOrAbove,
  async (_req, res, next) => {
    try {
      res.json({ data: await repo.getAverageRatingByDepartment() });
    } catch (err) {
      next(err);
    }
  },
);
