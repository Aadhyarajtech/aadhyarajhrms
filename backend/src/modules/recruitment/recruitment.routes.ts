import { Router } from "express";
import { z } from "zod";

import { authenticate } from "@/middleware/auth";
import {
  isAdminOrRecruiter,
  isAdminOrRecruiterOrManager,
} from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";

import * as repo from "./recruitment.repository";

export const recruitmentRouter = Router();

/**
 * Every recruitment route requires authentication.
 */
recruitmentRouter.use(authenticate);

/**
 * ============================================================
 * JOBS
 * ============================================================
 *
 * View:
 * - SUPER_ADMIN
 * - HR_ADMIN
 * - RECRUITER
 * - MANAGER
 *
 * Create/update:
 * - SUPER_ADMIN
 * - HR_ADMIN
 * - RECRUITER
 */

/**
 * GET /jobs
 *
 * Recruitment read access.
 */
recruitmentRouter.get(
  "/jobs",
  isAdminOrRecruiterOrManager,
  async (req, res, next) => {
    try {
      const status =
        typeof req.query.status === "string"
          ? req.query.status
          : undefined;

      const jobs = await repo.listJobPostings(status);

      res.json({ jobs });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /jobs/:id
 *
 * Recruitment read access.
 */
recruitmentRouter.get(
  "/jobs/:id",
  isAdminOrRecruiterOrManager,
  async (req, res, next) => {
    try {
      const job = await repo.getJobPosting(req.params.id);

      if (!job) {
        throw AppError.notFound("Job posting not found.");
      }

      res.json({ job });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Job creation schema.
 */
const jobSchema = z.object({
  title: z.string().min(2),
  departmentId: z.string(),
  designationId: z.string(),
  location: z.string().optional(),
  employmentType: z
    .enum([
      "FULL_TIME",
      "PART_TIME",
      "CONTRACT",
      "INTERN",
    ])
    .optional(),
  experienceMin: z.number().int().min(0).optional(),
  experienceMax: z.number().int().min(0).optional(),
  description: z.string().min(10, "Add a fuller job description."),
  openings: z.number().int().min(1).optional(),
});

/**
 * POST /jobs
 *
 * Only Admin + Recruiter can create jobs.
 */
recruitmentRouter.post(
  "/jobs",
  isAdminOrRecruiter,
  validate(jobSchema),
  async (req, res, next) => {
    try {
      const job = await repo.createJobPosting(req.body);

      res.status(201).json({ job });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Job status update schema.
 */
const statusSchema = z.object({
  status: z.enum([
    "OPEN",
    "ON_HOLD",
    "CLOSED",
  ]),
});

/**
 * PATCH /jobs/:id/status
 *
 * Only Admin + Recruiter can change job status.
 */
recruitmentRouter.patch(
  "/jobs/:id/status",
  isAdminOrRecruiter,
  validate(statusSchema),
  async (req, res, next) => {
    try {
      const job = await repo.updateJobStatus(
        req.params.id,
        req.body.status
      );

      res.json({ job });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ============================================================
 * CANDIDATES
 * ============================================================
 *
 * View:
 * - SUPER_ADMIN
 * - HR_ADMIN
 * - RECRUITER
 * - MANAGER
 *
 * Create/update:
 * - SUPER_ADMIN
 * - HR_ADMIN
 * - RECRUITER
 */

/**
 * GET /candidates
 */
recruitmentRouter.get(
  "/candidates",
  isAdminOrRecruiterOrManager,
  async (req, res, next) => {
    try {
      const jobPostingId =
        typeof req.query.jobPostingId === "string"
          ? req.query.jobPostingId
          : undefined;

      const candidates =
        await repo.listCandidates(jobPostingId);

      res.json({ candidates });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /candidates/:id
 */
recruitmentRouter.get(
  "/candidates/:id",
  isAdminOrRecruiterOrManager,
  async (req, res, next) => {
    try {
      const candidate =
        await repo.getCandidate(req.params.id);

      if (!candidate) {
        throw AppError.notFound("Candidate not found.");
      }

      res.json({ candidate });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Candidate creation schema.
 */
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

/**
 * POST /candidates
 */
recruitmentRouter.post(
  "/candidates",
  isAdminOrRecruiter,
  validate(candidateSchema),
  async (req, res, next) => {
    try {
      const candidate =
        await repo.createCandidate(req.body);

      res.status(201).json({ candidate });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Candidate stage schema.
 */
const stageSchema = z.object({
  stage: z.enum([
    "APPLIED",
    "SCREENING",
    "INTERVIEW",
    "OFFER",
    "HIRED",
    "REJECTED",
  ]),
});

/**
 * PATCH /candidates/:id/stage
 */
recruitmentRouter.patch(
  "/candidates/:id/stage",
  isAdminOrRecruiter,
  validate(stageSchema),
  async (req, res, next) => {
    try {
      const candidate =
        await repo.moveCandidateStage(
          req.params.id,
          req.body.stage
        );

      res.json({ candidate });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Candidate rating schema.
 */
const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

/**
 * PATCH /candidates/:id/rating
 */
recruitmentRouter.patch(
  "/candidates/:id/rating",
  isAdminOrRecruiter,
  validate(ratingSchema),
  async (req, res, next) => {
    try {
      const candidate =
        await repo.rateCandidate(
          req.params.id,
          req.body.rating
        );

      res.json({ candidate });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ============================================================
 * INTERVIEWS
 * ============================================================
 *
 * View:
 * - SUPER_ADMIN
 * - HR_ADMIN
 * - RECRUITER
 * - MANAGER
 *
 * Create/feedback:
 * - SUPER_ADMIN
 * - HR_ADMIN
 * - RECRUITER
 */

/**
 * GET /interviews
 */
recruitmentRouter.get(
  "/interviews",
  isAdminOrRecruiterOrManager,
  async (req, res, next) => {
    try {
      const candidateId =
        typeof req.query.candidateId === "string"
          ? req.query.candidateId
          : undefined;

      const interviews =
        await repo.listInterviews(candidateId);

      res.json({ interviews });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Interview scheduling schema.
 */
const scheduleSchema = z.object({
  candidateId: z.string(),
  interviewerId: z.string(),
  scheduledAt: z.string(),
  round: z.string().optional(),
});

/**
 * POST /interviews
 */
recruitmentRouter.post(
  "/interviews",
  isAdminOrRecruiter,
  validate(scheduleSchema),
  async (req, res, next) => {
    try {
      const interview =
        await repo.scheduleInterview(req.body);

      res.status(201).json({ interview });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Interview feedback schema.
 */
const feedbackSchema = z.object({
  feedback: z.string().min(2),
  recommendation: z.enum([
    "STRONG_YES",
    "YES",
    "NO",
    "STRONG_NO",
  ]),
});

/**
 * POST /interviews/:id/feedback
 */
recruitmentRouter.post(
  "/interviews/:id/feedback",
  isAdminOrRecruiter,
  validate(feedbackSchema),
  async (req, res, next) => {
    try {
      const interview =
        await repo.submitInterviewFeedback(
          req.params.id,
          req.body.feedback,
          req.body.recommendation
        );

      res.json({ interview });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ============================================================
 * RECRUITMENT ANALYTICS
 * ============================================================
 *
 * Managers can view recruitment analytics,
 * but cannot modify recruitment data.
 */

/**
 * GET /analytics/pipeline
 */
recruitmentRouter.get(
  "/analytics/pipeline",
  isAdminOrRecruiterOrManager,
  async (_req, res, next) => {
    try {
      const data =
        await repo.getPipelineSummary();

      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /analytics/open-roles
 */
recruitmentRouter.get(
  "/analytics/open-roles",
  isAdminOrRecruiterOrManager,
  async (_req, res, next) => {
    try {
      const count =
        await repo.getOpenRolesCount();

      res.json({ count });
    } catch (err) {
      next(err);
    }
  }
);