import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isAdmin, isManagerOrAbove } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import * as repo from "./performance.repository";

export const performanceRouter = Router();
performanceRouter.use(authenticate);

performanceRouter.get("/cycles", async (_req, res, next) => {
  try {
    res.json({ cycles: await repo.listCycles() });
  } catch (err) {
    next(err);
  }
});

const cycleSchema = z.object({ name: z.string().min(2), startDate: z.string(), endDate: z.string() });
performanceRouter.post("/cycles", isAdmin, validate(cycleSchema), async (req, res, next) => {
  try {
    res.status(201).json({ cycle: await repo.createCycle(req.body) });
  } catch (err) {
    next(err);
  }
});

performanceRouter.get("/reviews", async (req, res, next) => {
  try {
    const { role, employeeId } = req.user!;
    const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(role);
    const filters: any = { cycleId: req.query.cycleId as string | undefined };

    if (req.query.scope === "team" && employeeId) filters.reviewerId = employeeId;
    else if (!isPrivileged) filters.revieweeId = employeeId;
    else if (req.query.revieweeId) filters.revieweeId = req.query.revieweeId;

    res.json({ reviews: await repo.listReviews(filters) });
  } catch (err) {
    next(err);
  }
});

performanceRouter.get("/reviews/mine", async (req, res, next) => {
  try {
    const cycle = await repo.getActiveCycle();
    if (!cycle || !req.user!.employeeId) return res.json({ review: null });
    const reviews = await repo.listReviews({ cycleId: (cycle as any).id, revieweeId: req.user!.employeeId });
    res.json({ review: reviews[0] ?? null });
  } catch (err) {
    next(err);
  }
});

const ensureSchema = z.object({ cycleId: z.string(), revieweeId: z.string(), reviewerId: z.string() });
performanceRouter.post("/reviews", isManagerOrAbove, validate(ensureSchema), async (req, res, next) => {
  try {
    res.status(201).json({ review: await repo.ensureReview(req.body.cycleId, req.body.revieweeId, req.body.reviewerId) });
  } catch (err) {
    next(err);
  }
});

const selfReviewSchema = z.object({
  selfRating: z.number().min(1).max(5),
  strengths: z.string().min(2),
  improvements: z.string().min(2),
});
performanceRouter.post("/reviews/:id/self", validate(selfReviewSchema), async (req, res, next) => {
  try {
    const review = (await repo.getReview(req.params.id)) as any;
    if (!review) throw AppError.notFound("Review not found.");
    if (review.revieweeId !== req.user!.employeeId) throw AppError.forbidden();
    res.json({ review: await repo.submitSelfReview(req.params.id, req.body.selfRating, req.body.strengths, req.body.improvements) });
  } catch (err) {
    next(err);
  }
});

const managerReviewSchema = z.object({
  managerRating: z.number().min(1).max(5),
  managerComments: z.string().min(2),
});
performanceRouter.post("/reviews/:id/manager", isManagerOrAbove, validate(managerReviewSchema), async (req, res, next) => {
  try {
    const review = await repo.getReview(req.params.id);
    if (!review) throw AppError.notFound("Review not found.");
    res.json({ review: await repo.submitManagerReview(req.params.id, req.body.managerRating, req.body.managerComments) });
  } catch (err) {
    next(err);
  }
});

performanceRouter.get("/goals", async (req, res, next) => {
  try {
    const employeeId = (req.query.employeeId as string) || req.user!.employeeId!;
    res.json({ goals: await repo.listGoals(employeeId) });
  } catch (err) {
    next(err);
  }
});

const goalSchema = z.object({ title: z.string().min(2), description: z.string().optional(), dueDate: z.string() });
performanceRouter.post("/goals", validate(goalSchema), async (req, res, next) => {
  try {
    if (!req.user!.employeeId) throw AppError.forbidden();
    res.status(201).json({ goal: await repo.createGoal({ employeeId: req.user!.employeeId, ...req.body }) });
  } catch (err) {
    next(err);
  }
});

const progressSchema = z.object({ progress: z.number().int().min(0).max(100) });
performanceRouter.patch("/goals/:id/progress", validate(progressSchema), async (req, res, next) => {
  try {
    res.json({ goal: await repo.updateGoalProgress(req.params.id, req.body.progress) });
  } catch (err) {
    next(err);
  }
});

performanceRouter.get("/analytics/rating-by-department", isManagerOrAbove, async (_req, res, next) => {
  try {
    res.json({ data: await repo.getAverageRatingByDepartment() });
  } catch (err) {
    next(err);
  }
});
