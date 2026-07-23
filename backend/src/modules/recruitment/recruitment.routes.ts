import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isAdminOrRecruiter } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import * as repo from "./recruitment.repository";

export const recruitmentRouter = Router();
recruitmentRouter.use(authenticate);

recruitmentRouter.get("/jobs", async (req, res, next) => {
  try {
    res.json({ jobs: await repo.listJobPostings(req.query.status as string | undefined) });
  } catch (err) {
    next(err);
  }
});

recruitmentRouter.get("/jobs/:id", async (req, res, next) => {
  try {
    const job = await repo.getJobPosting(req.params.id);
    if (!job) throw AppError.notFound("Job posting not found.");
    res.json({ job });
  } catch (err) {
    next(err);
  }
});

const jobSchema = z.object({
  title: z.string().min(2),
  departmentId: z.string(),
  designationId: z.string(),
  location: z.string().optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]).optional(),
  experienceMin: z.number().int().min(0).optional(),
  experienceMax: z.number().int().min(0).optional(),
  description: z.string().min(10, "Add a fuller job description."),
  openings: z.number().int().min(1).optional(),
});

recruitmentRouter.post("/jobs", isAdminOrRecruiter, validate(jobSchema), async (req, res, next) => {
  try {
    res.status(201).json({ job: await repo.createJobPosting(req.body) });
  } catch (err) {
    next(err);
  }
});

const statusSchema = z.object({ status: z.enum(["OPEN", "ON_HOLD", "CLOSED"]) });
recruitmentRouter.patch("/jobs/:id/status", isAdminOrRecruiter, validate(statusSchema), async (req, res, next) => {
  try {
    res.json({ job: await repo.updateJobStatus(req.params.id, req.body.status) });
  } catch (err) {
    next(err);
  }
});

recruitmentRouter.get("/candidates", async (req, res, next) => {
  try {
    res.json({ candidates: await repo.listCandidates(req.query.jobPostingId as string | undefined) });
  } catch (err) {
    next(err);
  }
});

recruitmentRouter.get("/candidates/:id", async (req, res, next) => {
  try {
    const candidate = await repo.getCandidate(req.params.id);
    if (!candidate) throw AppError.notFound("Candidate not found.");
    res.json({ candidate });
  } catch (err) {
    next(err);
  }
});

const candidateSchema = z.object({
  jobPostingId: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  expectedCtc: z.number().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

recruitmentRouter.post("/candidates", isAdminOrRecruiter, validate(candidateSchema), async (req, res, next) => {
  try {
    res.status(201).json({ candidate: await repo.createCandidate(req.body) });
  } catch (err) {
    next(err);
  }
});

const stageSchema = z.object({ stage: z.enum(["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"]) });
recruitmentRouter.patch("/candidates/:id/stage", isAdminOrRecruiter, validate(stageSchema), async (req, res, next) => {
  try {
    res.json({ candidate: await repo.moveCandidateStage(req.params.id, req.body.stage) });
  } catch (err) {
    next(err);
  }
});

const ratingSchema = z.object({ rating: z.number().int().min(1).max(5) });
recruitmentRouter.patch("/candidates/:id/rating", isAdminOrRecruiter, validate(ratingSchema), async (req, res, next) => {
  try {
    res.json({ candidate: await repo.rateCandidate(req.params.id, req.body.rating) });
  } catch (err) {
    next(err);
  }
});

recruitmentRouter.get("/interviews", async (req, res, next) => {
  try {
    res.json({ interviews: await repo.listInterviews(req.query.candidateId as string | undefined) });
  } catch (err) {
    next(err);
  }
});

const scheduleSchema = z.object({
  candidateId: z.string(),
  interviewerId: z.string(),
  scheduledAt: z.string(),
  round: z.string().optional(),
});
recruitmentRouter.post("/interviews", isAdminOrRecruiter, validate(scheduleSchema), async (req, res, next) => {
  try {
    res.status(201).json({ interview: await repo.scheduleInterview(req.body) });
  } catch (err) {
    next(err);
  }
});

const feedbackSchema = z.object({
  feedback: z.string().min(2),
  recommendation: z.enum(["STRONG_YES", "YES", "NO", "STRONG_NO"]),
});
recruitmentRouter.post("/interviews/:id/feedback", isAdminOrRecruiter, validate(feedbackSchema), async (req, res, next) => {
  try {
    res.json({ interview: await repo.submitInterviewFeedback(req.params.id, req.body.feedback, req.body.recommendation) });
  } catch (err) {
    next(err);
  }
});

recruitmentRouter.get("/analytics/pipeline", async (_req, res, next) => {
  try {
    res.json({ data: await repo.getPipelineSummary() });
  } catch (err) {
    next(err);
  }
});

recruitmentRouter.get("/analytics/open-roles", async (_req, res, next) => {
  try {
    res.json({ count: await repo.getOpenRolesCount() });
  } catch (err) {
    next(err);
  }
});
