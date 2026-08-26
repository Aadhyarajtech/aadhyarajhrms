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
 * JOB REQUISITIONS / JOBS
 * ============================================================
 *
 * Lifecycle:
 *
 * DRAFT
 *   ↓
 * PENDING_APPROVAL
 *   ↓
 * APPROVED
 *   ↓
 * OPEN
 *
 * OR
 *
 * PENDING_APPROVAL
 *   ↓
 * REJECTED
 *
 * Read:
 * - SUPER_ADMIN
 * - HR_ADMIN
 * - RECRUITER
 * - MANAGER
 *
 * Create / update / approve / reject:
 * - SUPER_ADMIN
 * - HR_ADMIN
 * - RECRUITER
 */

/**
 * GET /jobs
 *
 * Supports:
 *
 * ?status=OPEN
 * ?requisitionStatus=PENDING_APPROVAL
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

      const requisitionStatus =
        typeof req.query.requisitionStatus === "string"
          ? req.query.requisitionStatus
          : undefined;

      const jobs = await repo.listJobPostings(
        status,
        requisitionStatus
      );

      res.json({ jobs });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /jobs/:id
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
 * ============================================================
 * JOB REQUISITION CREATION
 * ============================================================
 */

const jobSchema = z.object({
  title: z.string().min(2, "Job title is required."),

  departmentId: z.string().min(1),

  designationId: z.string().min(1),

  location: z.string().optional(),

  employmentType: z
    .enum([
      "FULL_TIME",
      "PART_TIME",
      "CONTRACT",
      "INTERN",
    ])
    .optional(),

  experienceMin: z
    .number()
    .int()
    .min(0)
    .optional(),

  experienceMax: z
    .number()
    .int()
    .min(0)
    .optional(),

  description: z
    .string()
    .min(10, "Add a fuller job description."),

  /**
   * Legacy compatibility.
   * `headcount` is the preferred field.
   */
  openings: z
    .number()
    .int()
    .min(1)
    .optional(),

  /**
   * Number of employees required.
   */
  headcount: z
    .number()
    .int()
    .min(1)
    .optional(),

  /**
   * Maximum approved CTC / budget per employee.
   */
  budgetCtc: z
    .number()
    .min(0)
    .optional(),

  /**
   * Number of approval levels required.
   */
  approvalLevelRequired: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional(),

  /**
   * Where the job should be published after approval.
   */
  postingChannels: z
    .array(z.string())
    .optional(),

  /**
   * Candidate screening questions.
   */
  screeningQuestions: z
    .array(z.string())
    .optional(),

  hiringMode: z
    .enum([
      "STANDARD",
      "WALK_IN",
      "CAMPUS",
    ])
    .optional(),

  skills: z
    .array(z.string())
    .optional(),
});

/**
 * POST /jobs
 *
 * Creates a new job requisition.
 *
 * IMPORTANT:
 * requestedById comes from the authenticated user.
 * The frontend does NOT need to send requestedById.
 */
recruitmentRouter.post(
  "/jobs",
  isAdminOrRecruiter,
  validate(jobSchema),
  async (req, res, next) => {
    try {
      if (!req.user) {
        throw AppError.unauthorized("Unauthorized.");
      }

      const job = await repo.createJobPosting({
        ...req.body,

        /**
         * Never trust requestedById from frontend.
         */
        requestedById: req.user.userId,
      });

      res.status(201).json({
        message: "Job requisition created successfully.",
        job,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ============================================================
 * JOB REQUISITION APPROVAL
 * ============================================================
 */

/**
 * Approval schema.
 */
const approvalSchema = z.object({
  comment: z
    .string()
    .max(1000)
    .optional(),
});

/**
 * POST /jobs/:id/approve
 *
 * Approves the current approval step.
 *
 * When all required approval steps are approved:
 *
 * requisitionStatus = APPROVED
 * status = OPEN
 * approvedById = current approver
 * approvedAt = current timestamp
 */
recruitmentRouter.patch(
  "/jobs/:id/approve",

  isAdminOrRecruiter,
  validate(approvalSchema),
  async (req, res, next) => {
    try {
      if (!req.user) {
        throw AppError.unauthorized("Unauthorized.");
      }

      const job = await repo.approveJob(
        req.params.id,
        req.user.userId,
        req.body.comment
      );

      if (!job) {
        throw AppError.notFound(
          "Job requisition not found."
        );
      }

      res.json({
        message: "Job requisition approved successfully.",
        job,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ============================================================
 * JOB REQUISITION REJECTION
 * ============================================================
 */

const rejectionSchema = z.object({
  reason: z
    .string()
    .min(2, "Rejection reason is required.")
    .max(1000),
});

/**
 * POST /jobs/:id/reject
 *
 * Rejects the current approval step.
 *
 * requisitionStatus = REJECTED
 * status = CLOSED
 * rejectionReason = supplied reason
 */
recruitmentRouter.patch(
  "/jobs/:id/reject",
  isAdminOrRecruiter,
  validate(rejectionSchema),
  async (req, res, next) => {
    try {
      if (!req.user) {
        throw AppError.unauthorized("Unauthorized.");
      }

      const job = await repo.rejectJob(
        req.params.id,
        req.user.userId,
        req.body.reason
      );

      if (!job) {
        throw AppError.notFound(
          "Job requisition not found."
        );
      }

      res.json({
        message: "Job requisition rejected.",
        job,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ============================================================
 * JOB STATUS
 * ============================================================
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

      if (!job) {
        throw AppError.notFound(
          "Job posting not found."
        );
      }

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
        throw AppError.notFound(
          "Candidate not found."
        );
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
  jobPostingId: z.string().min(1),

  firstName: z.string().min(1),

  lastName: z.string().min(1),

  email: z.string().email(),

  phone: z.string().optional(),

  expectedCtc: z
    .number()
    .min(0)
    .optional(),

  source: z.string().optional(),

  referredById: z.string().optional(),

  notes: z.string().optional(),

  resumeText: z.string().optional(),
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

      res.status(201).json({
        candidate,
      });
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

      if (!candidate) {
        throw AppError.notFound(
          "Candidate not found."
        );
      }

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
  rating: z
    .number()
    .int()
    .min(1)
    .max(5),
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

      if (!candidate) {
        throw AppError.notFound(
          "Candidate not found."
        );
      }

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
  candidateId: z.string().min(1),

  interviewerId: z.string().min(1),

  scheduledAt: z.string().min(1),

  round: z.string().optional(),

  mode: z
    .enum([
      "VIDEO",
      "IN_PERSON",
      "PHONE",
    ])
    .optional(),
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

      res.status(201).json({
        interview,
      });
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

  scorecard: z
    .array(
      z.object({
        criterion: z.string().min(1),
        score: z.number().int().min(1).max(5),
        comment: z.string().optional(),
      })
    )
    .optional(),
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
          req.body.recommendation,
          req.body.scorecard ?? []
        );

      if (!interview) {
        throw AppError.notFound(
          "Interview not found."
        );
      }

      res.json({
        interview,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ============================================================
 * RECRUITMENT ANALYTICS
 * ============================================================
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

/**
 * GET /analytics/metrics
 */
recruitmentRouter.get(
  "/analytics/metrics",
  isAdminOrRecruiterOrManager,
  async (_req, res, next) => {
    try {
      const data =
        await repo.getRecruitmentMetrics();

      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

export default recruitmentRouter;

// ============================================================================
// OFFER MANAGEMENT
// ============================================================================

const offerSchema = z.object({
  annualCtc: z.number().min(0),
  joiningDate: z.string().min(1),
  basic: z.number().min(0).optional(),
  hra: z.number().min(0).optional(),
  specialAllowance: z.number().min(0).optional(),
});

/**
 * POST /candidates/:id/offer
 *
 * Generate and send an offer letter.
 */
recruitmentRouter.post(
  "/candidates/:id/offer",
  isAdminOrRecruiter,
  validate(offerSchema),
  async (req, res, next) => {
    try {
      const candidate = await repo.generateOffer(
        req.params.id,
        req.body,
      );

      if (!candidate) {
        throw AppError.notFound("Candidate not found.");
      }

      res.status(201).json({
        message: "Offer generated successfully.",
        candidate,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /candidates/:id/offer/response
 *
 * Candidate offer response.
 */
const offerResponseSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED"]),
});

recruitmentRouter.patch(
  "/candidates/:id/offer/response",
  isAdminOrRecruiter,
  validate(offerResponseSchema),
  async (req, res, next) => {
    try {
      const candidate = await repo.respondToOffer(
        req.params.id,
        req.body.status,
      );

      if (!candidate) {
        throw AppError.notFound("Candidate not found.");
      }

      res.json({
        message: `Offer ${req.body.status.toLowerCase()}.`,
        candidate,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// BACKGROUND VERIFICATION
// ============================================================================

const backgroundVerificationSchema = z.object({
  status: z.enum([
    "NOT_STARTED",
    "IN_PROGRESS",
    "VERIFIED",
    "FAILED",
  ]),
  provider: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * PATCH /candidates/:id/background-verification
 */
recruitmentRouter.patch(
  "/candidates/:id/background-verification",
  isAdminOrRecruiter,
  validate(backgroundVerificationSchema),
  async (req, res, next) => {
    try {
      const candidate =
        await repo.updateBackgroundVerification(
          req.params.id,
          req.body,
        );

      if (!candidate) {
        throw AppError.notFound("Candidate not found.");
      }

      res.json({
        message: "Background verification updated successfully.",
        candidate,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// PRE-BOARDING
// ============================================================================

const preboardingDocumentSchema = z.object({
  type: z.string().min(1),
  url: z.string().min(1),
});

/**
 * POST /candidates/:id/preboarding/documents
 */
recruitmentRouter.post(
  "/candidates/:id/preboarding/documents",
  isAdminOrRecruiter,
  validate(preboardingDocumentSchema),
  async (req, res, next) => {
    try {
      const candidate =
        await repo.addPreboardingDocument(
          req.params.id,
          req.body.type,
          req.body.url,
        );

      if (!candidate) {
        throw AppError.notFound("Candidate not found.");
      }

      res.status(201).json({
        message: "Pre-boarding document added successfully.",
        candidate,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /candidates/:id/preboarding/documents/:index/verify
 */
recruitmentRouter.patch(
  "/candidates/:id/preboarding/documents/:index/verify",
  isAdminOrRecruiter,
  async (req, res, next) => {
    try {
      const index = Number(req.params.index);

      if (!Number.isInteger(index) || index < 0) {
        throw AppError.badRequest("Invalid document index.");
      }

      const candidate =
        await repo.verifyPreboardingDocument(
          req.params.id,
          index,
        );

      if (!candidate) {
        throw AppError.notFound("Candidate not found.");
      }

      res.json({
        message: "Pre-boarding document verified successfully.",
        candidate,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// HIRING / EMPLOYEE HANDOFF
// ============================================================================

const hireCandidateSchema = z.object({
  role: z
    .enum([
      "EMPLOYEE",
      "MANAGER",
      "RECRUITER",
      "FINANCE",
      "IT_SUPPORT",
      "HR_ADMIN",
    ])
    .optional(),
});

/**
 * POST /candidates/:id/hire
 *
 * Converts the candidate into an employee/user.
 *
 * Required before hiring:
 * 1. Offer accepted
 * 2. Background verification verified
 * 3. Pre-boarding completed
 */
recruitmentRouter.post(
  "/candidates/:id/hire",
  isAdminOrRecruiter,
  validate(hireCandidateSchema),
  async (req, res, next) => {
    try {
      const candidate = await repo.hireCandidate(
        req.params.id,
        req.body.role ?? "EMPLOYEE",
      );

      if (!candidate) {
        throw AppError.notFound("Candidate not found.");
      }

      res.json({
        message: "Candidate hired successfully and employee account created.",
        candidate,
      });
    } catch (err) {
      next(err);
    }
  },
);