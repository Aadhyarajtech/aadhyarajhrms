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
  type: z.enum(["PROBATION", "QUARTERLY", "HALF_YEARLY", "ANNUAL", "THREE_SIXTY", "PIP"]).optional(),
  purpose: z.string().max(1000).optional(),
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
performanceRouter.post("/reviews/:id/self", validate(selfReviewSchema), async (req, res, next) => {
  try {
    const review = await repo.getReview(req.params.id);
    if (!review) throw AppError.notFound("Review not found.");
    if (review.revieweeId !== req.user!.employeeId) throw AppError.forbidden("You can only submit your own self-review.");
    res.json({ review: await repo.submitSelfReview(req.params.id, req.body.selfRating, req.body.strengths, req.body.improvements) });
  } catch (err) { next(err); }
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
    const { role, employeeId } = req.user!;
    const requestedEmployeeId = req.query.employeeId as string | undefined;

    if (!employeeId) {
      throw AppError.forbidden("Employee profile not found.");
    }

    if (requestedEmployeeId && requestedEmployeeId !== employeeId) {
      if (!["SUPER_ADMIN", "HR_ADMIN", "MANAGER"].includes(role)) {
        throw AppError.forbidden(
          "You are not authorized to view another employee's goals.",
        );
      }

      if (role === "MANAGER") {
        const employee = await getEmployeeById(requestedEmployeeId) as any;
        if (!employee || employee.managerId !== employeeId) {
          throw AppError.forbidden(
            "You can only view goals for your direct reports.",
          );
        }
      }
    }

    const targetEmployeeId = requestedEmployeeId ?? employeeId;

    res.json({
      goals: await repo.listGoals(targetEmployeeId),
    });
  } catch (err) {
    next(err);
  }
});

const milestoneSchema = z.object({
  title: z.string().min(1).max(250),
  targetDate: z.string().nullable().optional(),
  completed: z.boolean().optional(),
});

const goalSchema = z.object({
  title: z.string().min(2).max(250),
  description: z.string().max(2000).optional(),
  dueDate: z.string().min(1),
  employeeId: z.string().optional(),
  cycleId: z.string().nullable().optional(),
  parentGoalId: z.string().nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  targetValue: z.number().nonnegative().nullable().optional(),
  currentValue: z.number().nonnegative().nullable().optional(),
  milestones: z.array(milestoneSchema).optional(),
});

performanceRouter.post(
  "/goals",
  validate(goalSchema),
  async (req, res, next) => {
    try {
      const { role, employeeId: creatorEmployeeId } = req.user!;
      const targetEmployeeId = req.body.employeeId ?? creatorEmployeeId;

      if (!targetEmployeeId || !creatorEmployeeId) {
        throw AppError.forbidden("Employee profile not found.");
      }

      // Employees can create goals for themselves.
      // Managers can create goals only for direct reports.
      // HR Admins and Super Admins can create goals for any employee.
      if (targetEmployeeId !== creatorEmployeeId) {
        if (!["SUPER_ADMIN", "HR_ADMIN", "MANAGER"].includes(role)) {
          throw AppError.forbidden(
            "You are not authorized to assign goals to another employee.",
          );
        }

        if (role === "MANAGER") {
          const employee = await getEmployeeById(targetEmployeeId) as any;
          if (!employee) {
            throw AppError.notFound("Employee not found.");
          }

          if (employee.managerId !== creatorEmployeeId) {
            throw AppError.forbidden(
              "You can only assign goals to your direct reports.",
            );
          }
        } else {
          const employee = await getEmployeeById(targetEmployeeId);
          if (!employee) {
            throw AppError.notFound("Employee not found.");
          }
        }
      }

      // A parent goal must exist and belong to an authorized employee.
      if (req.body.parentGoalId) {
        const parentGoal = await repo.getGoal(req.body.parentGoalId);

        if (!parentGoal) {
          throw AppError.notFound("Parent goal not found.");
        }

        if (
          parentGoal.employeeId !== targetEmployeeId &&
          !["SUPER_ADMIN", "HR_ADMIN"].includes(role)
        ) {
          throw AppError.forbidden(
            "You can only use an authorized parent goal.",
          );
        }
      }

      const targetValue = req.body.targetValue;
      const currentValue = req.body.currentValue;

      // Keep KPI values consistent: a current value cannot exceed its target.
      // The repository calculates the achievement percentage and status.
      if (
        typeof targetValue === "number" &&
        targetValue > 0 &&
        typeof currentValue === "number" &&
        currentValue > targetValue
      ) {
        throw AppError.badRequest(
          "Current value cannot be greater than the target value.",
        );
      }

      res.status(201).json({
        goal: await repo.createGoal({
          ...req.body,
          employeeId: targetEmployeeId,
          assignedBy: creatorEmployeeId,
          currentValue: currentValue ?? null,
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

const progressSchema = z.object({
  progress: z.number().int().min(0).max(100),
});

const currentValueSchema = z.object({
  currentValue: z.number().nonnegative().nullable(),
});

performanceRouter.patch(
  "/goals/:id/progress",
  validate(progressSchema),
  async (req, res, next) => {
    try {
      const goal = await repo.getGoal(req.params.id);

      if (!goal) {
        throw AppError.notFound("Goal not found.");
      }

      const { role, employeeId } = req.user!;

      if (!employeeId) {
        throw AppError.forbidden("Employee profile not found.");
      }

      if (goal.employeeId !== employeeId) {
        if (["SUPER_ADMIN", "HR_ADMIN"].includes(role)) {
          // Privileged roles may update any goal.
        } else if (role === "MANAGER") {
          const employee = await getEmployeeById(goal.employeeId) as any;
          if (!employee || employee.managerId !== employeeId) {
            throw AppError.forbidden(
              "You can only update goals for your direct reports.",
            );
          }
        } else {
          throw AppError.forbidden(
            "You can only update your own goals.",
          );
        }
      }

      res.json({
        goal: await repo.updateGoalProgress(
          req.params.id,
          req.body.progress,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

performanceRouter.patch(
  "/goals/:id/current-value",
  validate(currentValueSchema),
  async (req, res, next) => {
    try {
      const goal = await repo.getGoal(req.params.id);

      if (!goal) {
        throw AppError.notFound("Goal not found.");
      }

      const { role, employeeId } = req.user!;

      if (!employeeId) {
        throw AppError.forbidden("Employee profile not found.");
      }

      if (goal.employeeId !== employeeId) {
        if (["SUPER_ADMIN", "HR_ADMIN"].includes(role)) {
          // Privileged roles may update any goal.
        } else if (role === "MANAGER") {
          const employee = await getEmployeeById(goal.employeeId) as any;
          if (!employee || employee.managerId !== employeeId) {
            throw AppError.forbidden(
              "You can only update goals for your direct reports.",
            );
          }
        } else {
          throw AppError.forbidden(
            "You can only update your own goals.",
          );
        }
      }

      if (
        req.body.currentValue !== null &&
        typeof goal.targetValue === "number" &&
        goal.targetValue > 0 &&
        req.body.currentValue > goal.targetValue
      ) {
        throw AppError.badRequest(
          "Current value cannot be greater than the target value.",
        );
      }

      const updatedGoal = await repo.updateGoalCurrentValue(
        req.params.id,
        req.body.currentValue,
      );

      if (!updatedGoal) {
        throw AppError.notFound("Goal not found.");
      }

      res.json({ goal: updatedGoal });
    } catch (err) {
      next(err);
    }
  },
);

performanceRouter.get("/goals/trend", async (req, res, next) => {
  try {
    const { role, employeeId } = req.user!;
    if (!employeeId) {
      throw AppError.forbidden("Employee profile not found.");
    }

    const requestedEmployeeId = req.query.employeeId as string | undefined;

    if (requestedEmployeeId && requestedEmployeeId !== employeeId) {
      if (!["SUPER_ADMIN", "HR_ADMIN", "MANAGER"].includes(role)) {
        throw AppError.forbidden(
          "You are not authorized to view another employee's goal trend.",
        );
      }

      if (role === "MANAGER") {
        const employee = await getEmployeeById(requestedEmployeeId) as any;
        if (!employee || employee.managerId !== employeeId) {
          throw AppError.forbidden(
            "You can only view goal trends for your direct reports.",
          );
        }
      }
    }

    res.json({
      data: await repo.getGoalTrend(requestedEmployeeId ?? employeeId),
    });
  } catch (err) {
    next(err);
  }
});

const feedbackSchema = z.object({ type: z.enum(["PEER", "SUBORDINATE"]), competencyRatings: z.array(z.object({ competency: z.string().min(1), rating: z.number().int().min(1).max(5) })).min(1), comments: z.string().max(2000).optional() });
performanceRouter.get("/feedback-requests", async (req, res, next) => { try { const cycle = await repo.getActiveCycle(); if (!cycle || !req.user!.employeeId) return res.json({ reviews: [] }); const reviews = await repo.listReviews({ cycleId: cycle.id }); res.json({ reviews: reviews.filter((review: any) => review.revieweeId !== req.user!.employeeId) }); } catch (err) { next(err); } });
performanceRouter.post("/reviews/:id/feedback", validate(feedbackSchema), async (req, res, next) => { try { const review = await repo.getReview(req.params.id); if (!review) throw AppError.notFound("Review not found."); if (!req.user!.employeeId || review.revieweeId === req.user!.employeeId) throw AppError.forbidden("You cannot submit feedback for yourself."); res.status(201).json({ feedback: await repo.submitFeedback({ reviewId: req.params.id, reviewerEmployeeId: req.user!.employeeId, ...req.body }) }); } catch (err) { next(err); } });
performanceRouter.get("/reviews/:id/feedback-summary", async (req, res, next) => { try { const review = await repo.getReview(req.params.id); if (!review) throw AppError.notFound(); const allowed = review.revieweeId === req.user!.employeeId || review.reviewerId === req.user!.employeeId || ["SUPER_ADMIN", "HR_ADMIN"].includes(req.user!.role); if (!allowed) throw AppError.forbidden(); res.json({ summary: await repo.getFeedbackSummary(req.params.id) }); } catch (err) { next(err); } });
performanceRouter.get("/reviews/:id/outcome", async (req, res, next) => { try { const review = await repo.getReview(req.params.id); if (!review) throw AppError.notFound(); const allowed = review.revieweeId === req.user!.employeeId || review.reviewerId === req.user!.employeeId || ["SUPER_ADMIN", "HR_ADMIN"].includes(req.user!.role); if (!allowed) throw AppError.forbidden(); res.json({ outcome: await repo.getOutcome(req.params.id) }); } catch (err) { next(err); } });

const performanceOutcomeSchema = z.object({
  incrementRecommendation: z.enum(["MAXIMUM", "STANDARD", "NONE", "PIP"]),
  promotionEligible: z.boolean().optional(),
  trainingNeeds: z.array(z.string().min(1).max(1000)).optional(),
  pipRecommended: z.boolean().optional(),
  fastTrackEligible: z.boolean().optional(),
});

performanceRouter.patch(
  "/reviews/:id/outcome",
  isManagerOrAbove,
  validate(performanceOutcomeSchema),
  async (req, res, next) => {
    try {
      const review = (await repo.getReview(req.params.id)) as any;

      if (!review) {
        throw AppError.notFound("Review not found.");
      }

      if (review.status !== "COMPLETED") {
        throw AppError.badRequest(
          "Performance outcome can only be updated after the review is completed.",
        );
      }

      const { role, employeeId } = req.user!;

      if (role === "MANAGER") {
        if (!employeeId) {
          throw AppError.forbidden("Manager employee profile not found.");
        }

        if (review.reviewerId !== employeeId) {
          throw AppError.forbidden(
            "You can only update outcomes for reviews assigned to you.",
          );
        }

        const employee = (await getEmployeeById(review.revieweeId)) as any;

        if (!employee) {
          throw AppError.notFound("Employee not found.");
        }

        if (employee.managerId !== employeeId) {
          throw AppError.forbidden(
            "You can only update outcomes for your direct reports.",
          );
        }
      }

      // HR Admin and Super Admin may update outcomes for any completed review.
      const outcome = await repo.upsertOutcome(req.params.id, req.body);

      res.json({ outcome });
    } catch (err) {
      next(err);
    }
  },
);


/* -------------------------------------------------------------------------- */
/*                         PERFORMANCE IMPROVEMENT PLAN                        */
/* -------------------------------------------------------------------------- */

const pipObjectiveSchema = z.object({
  title: z.string().min(2).max(250),
  description: z.string().max(2000).optional(),
  target: z.string().max(1000).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "OVERDUE"]).optional(),
  dueDate: z.string(),
});

const pipCreateSchema = z.object({
  reviewId: z.string(),
  employeeId: z.string(),
  managerId: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  objectives: z.array(pipObjectiveSchema).min(1),
  checkInFrequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
});

const pipObjectiveUpdateSchema = z.object({
  objectives: z.array(pipObjectiveSchema).min(1),
});

const pipCheckInSchema = z.object({
  date: z.string().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  managerComments: z.string().max(3000).optional(),
  hrComments: z.string().max(3000).optional(),
  nextSteps: z.string().max(3000).optional(),
});

const pipStatusSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]),
  finalOutcome: z.string().max(3000).optional(),
});

performanceRouter.get("/pips", async (req, res, next) => {
  try {
    const { role, employeeId } = req.user!;
    const requestedEmployeeId = req.query.employeeId as string | undefined;

    if (role === "MANAGER") {
      if (!employeeId) {
        throw AppError.forbidden("Manager employee profile not found.");
      }

      if (requestedEmployeeId && requestedEmployeeId !== employeeId) {
        const employee = await getEmployeeById(requestedEmployeeId) as any;
        if (!employee || employee.managerId !== employeeId) {
          throw AppError.forbidden(
            "You can only view PIPs for your direct reports.",
          );
        }
      }

      res.json({
        pips: await repo.listPips({
          employeeId: requestedEmployeeId,
          managerId: employeeId,
        }),
      });
      return;
    }

    if (["SUPER_ADMIN", "HR_ADMIN"].includes(role)) {
      res.json({
        pips: await repo.listPips({
          employeeId: requestedEmployeeId,
          status: req.query.status as string | undefined,
        }),
      });
      return;
    }

    if (!employeeId) {
      throw AppError.forbidden("Employee profile not found.");
    }

    res.json({
      pips: await repo.listPips({ employeeId }),
    });
  } catch (err) {
    next(err);
  }
});

performanceRouter.get("/pips/:id", async (req, res, next) => {
  try {
    const pip = await repo.getPip(req.params.id);
    if (!pip) throw AppError.notFound("PIP not found.");

    const { role, employeeId } = req.user!;
    const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(role);
    const isOwner = pip.employeeId === employeeId;
    const isManager = role === "MANAGER" && pip.managerId === employeeId;

    if (!isPrivileged && !isOwner && !isManager) {
      throw AppError.forbidden("You are not authorized to view this PIP.");
    }

    res.json({ pip });
  } catch (err) {
    next(err);
  }
});

performanceRouter.post(
  "/pips",
  isManagerOrAbove,
  validate(pipCreateSchema),
  async (req, res, next) => {
    try {
      const { role, employeeId } = req.user!;
      const employee = await getEmployeeById(req.body.employeeId) as any;

      if (!employee) throw AppError.notFound("Employee not found.");

      if (role === "MANAGER") {
        if (!employeeId) {
          throw AppError.forbidden("Manager employee profile not found.");
        }

        if (employee.managerId !== employeeId) {
          throw AppError.forbidden(
            "You can only create a PIP for your direct reports.",
          );
        }
      }

      const pip = await repo.createPip({
        ...req.body,
        managerId: req.body.managerId ?? employeeId,
        createdBy: employeeId,
        status: "DRAFT",
      });

      res.status(201).json({ pip });
    } catch (err) {
      next(err);
    }
  },
);

performanceRouter.patch(
  "/pips/:id/objectives",
  isManagerOrAbove,
  validate(pipObjectiveUpdateSchema),
  async (req, res, next) => {
    try {
      const pip = await repo.getPip(req.params.id);
      if (!pip) throw AppError.notFound("PIP not found.");

      const { role, employeeId } = req.user!;
      if (
        role === "MANAGER" &&
        pip.managerId !== employeeId
      ) {
        throw AppError.forbidden(
          "You can only update objectives for PIPs assigned to you.",
        );
      }

      res.json({
        pip: await repo.updatePipObjectives(
          req.params.id,
          req.body.objectives,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

performanceRouter.post(
  "/pips/:id/check-ins",
  isManagerOrAbove,
  validate(pipCheckInSchema),
  async (req, res, next) => {
    try {
      const pip = await repo.getPip(req.params.id);
      if (!pip) throw AppError.notFound("PIP not found.");

      const { role, employeeId } = req.user!;
      if (
        role === "MANAGER" &&
        pip.managerId !== employeeId
      ) {
        throw AppError.forbidden(
          "You can only add check-ins to PIPs assigned to you.",
        );
      }

      const checkIn = {
        ...req.body,
        date: req.body.date ?? new Date().toISOString(),
        managerId: employeeId,
        addedByRole: role,
      };

      res.status(201).json({
        pip: await repo.addPipCheckIn(req.params.id, checkIn),
      });
    } catch (err) {
      next(err);
    }
  },
);

performanceRouter.patch(
  "/pips/:id/status",
  isManagerOrAbove,
  validate(pipStatusSchema),
  async (req, res, next) => {
    try {
      const pip = await repo.getPip(req.params.id);
      if (!pip) throw AppError.notFound("PIP not found.");

      const { role, employeeId } = req.user!;
      if (
        role === "MANAGER" &&
        pip.managerId !== employeeId
      ) {
        throw AppError.forbidden(
          "You can only change the status of PIPs assigned to you.",
        );
      }

      res.json({
        pip: await repo.updatePipStatus(
          req.params.id,
          req.body.status,
          req.body.finalOutcome,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);


/* -------------------------------------------------------------------------- */
/*                         PERFORMANCE ANALYTICS                              */
/* -------------------------------------------------------------------------- */

performanceRouter.get(
  "/analytics/summary",
  isManagerOrAbove,
  async (req, res, next) => {
    try {
      const { role, employeeId } = req.user!;

      if (!employeeId) {
        throw AppError.forbidden("Employee profile not found.");
      }

      const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(role);

      const reviewFilters: any = {};
      if (role === "MANAGER") {
        reviewFilters.reviewerId = employeeId;
      } else if (!isPrivileged) {
        reviewFilters.revieweeId = employeeId;
      } else if (req.query.employeeId) {
        reviewFilters.revieweeId = req.query.employeeId as string;
      }

      if (req.query.cycleId) {
        reviewFilters.cycleId = req.query.cycleId as string;
      }

      const reviews = await repo.listReviews(reviewFilters);

      const completedReviews = reviews.filter(
        (review: any) => review.status === "COMPLETED",
      );

      const ratings = completedReviews
        .map((review: any) => Number(review.finalRating ?? review.managerRating ?? review.selfRating))
        .filter((rating: number) => Number.isFinite(rating) && rating > 0);

      const averageRating =
        ratings.length > 0
          ? Number(
              (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2),
            )
          : 0;

      const goalEmployeeId =
        (req.query.employeeId as string | undefined) ??
        employeeId;

      // Managers may only inspect their direct reports' goals through the
      // employeeId filter; non-privileged users remain restricted to themselves.
      if (
        role === "MANAGER" &&
        goalEmployeeId !== employeeId
      ) {
        const employee = await getEmployeeById(goalEmployeeId) as any;
        if (!employee || employee.managerId !== employeeId) {
          throw AppError.forbidden(
            "You can only view analytics for your direct reports.",
          );
        }
      }

      if (
        !isPrivileged &&
        role !== "MANAGER" &&
        goalEmployeeId !== employeeId
      ) {
        throw AppError.forbidden(
          "You are not authorized to view another employee's analytics.",
        );
      }

      const goals = await repo.listGoals(goalEmployeeId);
      const achievementValues = goals
        .map((goal: any) => Number(goal.achievementPercentage ?? goal.progress ?? 0))
        .filter((value: number) => Number.isFinite(value));

      const averageGoalAchievement =
        achievementValues.length > 0
          ? Number(
              (
                achievementValues.reduce((sum, value) => sum + value, 0) /
                achievementValues.length
              ).toFixed(2),
            )
          : 0;

      const goalCompletionPercentage =
        goals.length > 0
          ? Number(
              (
                (goals.filter((goal: any) => goal.status === "COMPLETED").length /
                  goals.length) *
                100
              ).toFixed(2),
            )
          : 0;

      const pips = await repo.listPips(
        role === "MANAGER"
          ? { managerId: employeeId }
          : isPrivileged
            ? { employeeId: req.query.employeeId as string | undefined }
            : { employeeId },
      );

      res.json({
        data: {
          totalReviews: reviews.length,
          completedReviews: completedReviews.length,
          reviewCompletionPercentage:
            reviews.length > 0
              ? Number(((completedReviews.length / reviews.length) * 100).toFixed(2))
              : 0,
          averageRating,
          totalGoals: goals.length,
          averageGoalAchievement,
          goalCompletionPercentage,
          totalPips: pips.length,
          activePips: pips.filter((pip: any) => pip.status === "ACTIVE").length,
        },
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
