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

recruitmentRouter.use(authenticate);

// ============================================================================
// JOBS
// ============================================================================

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
        requisitionStatus,
      );

      res.json({ jobs });
    } catch (err) {
      next(err);
    }
  },
);

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
  },
);

// ============================================================================
// CREATE JOB
// ============================================================================

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

  openings: z
    .number()
    .int()
    .min(1)
    .optional(),

  headcount: z
    .number()
    .int()
    .min(1)
    .optional(),

  budgetCtc: z
    .number()
    .min(0)
    .optional(),

  approvalLevelRequired: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional(),

  postingChannels: z
    .array(z.string())
    .optional(),

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

  walkInDrive: z
    .object({
      driveDate: z.string().nullable().optional(),
      startTime: z.string().nullable().optional(),
      endTime: z.string().nullable().optional(),
      venue: z.string().nullable().optional(),
      coordinatorName: z.string().nullable().optional(),
      coordinatorContact: z.string().nullable().optional(),
      registrationDeadline: z.string().nullable().optional(),
      expectedCandidates: z.number().int().min(0).nullable().optional(),
    })
    .nullable()
    .optional(),

  campusDrive: z
    .object({
      collegeName: z.string().nullable().optional(),
      campusLocation: z.string().nullable().optional(),
      driveDate: z.string().nullable().optional(),
      startTime: z.string().nullable().optional(),
      endTime: z.string().nullable().optional(),
      placementCoordinator: z.string().nullable().optional(),
      coordinatorContact: z.string().nullable().optional(),
      expectedCandidates: z.number().int().min(0).nullable().optional(),
    })
    .nullable()
    .optional(),

  skills: z
    .array(z.string())
    .optional(),
});

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
        requestedById: req.user.userId,
      });

      res.status(201).json({
        message: "Job requisition created successfully.",
        job,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// JOB EDIT
// ============================================================================

const updateJobSchema = z
  .object({
    title: z
      .string()
      .min(2, "Job title must contain at least 2 characters.")
      .optional(),

    departmentId: z
      .string()
      .min(1)
      .optional(),

    designationId: z
      .string()
      .min(1)
      .optional(),

    location: z
      .string()
      .optional(),

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
      .min(10)
      .optional(),

    openings: z
      .number()
      .int()
      .min(1)
      .optional(),

    headcount: z
      .number()
      .int()
      .min(1)
      .optional(),

    budgetCtc: z
      .number()
      .min(0)
      .optional(),

    postingChannels: z
      .array(z.string())
      .optional(),

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

    walkInDrive: z
      .object({
        driveDate: z.string().nullable().optional(),
        startTime: z.string().nullable().optional(),
        endTime: z.string().nullable().optional(),
        venue: z.string().nullable().optional(),
        coordinatorName: z.string().nullable().optional(),
        coordinatorContact: z.string().nullable().optional(),
        registrationDeadline: z.string().nullable().optional(),
        expectedCandidates: z.number().int().min(0).nullable().optional(),
      })
      .nullable()
      .optional(),

    campusDrive: z
      .object({
        collegeName: z.string().nullable().optional(),
        campusLocation: z.string().nullable().optional(),
        driveDate: z.string().nullable().optional(),
        startTime: z.string().nullable().optional(),
        endTime: z.string().nullable().optional(),
        placementCoordinator: z.string().nullable().optional(),
        coordinatorContact: z.string().nullable().optional(),
        expectedCandidates: z.number().int().min(0).nullable().optional(),
      })
      .nullable()
      .optional(),

    skills: z
      .array(z.string())
      .optional(),

    status: z
      .enum([
        "OPEN",
        "ON_HOLD",
        "CLOSED",
      ])
      .optional(),
  })
  .refine(
    (data) => {
      if (
        data.experienceMin === undefined ||
        data.experienceMax === undefined
      ) {
        return true;
      }

      return data.experienceMax >= data.experienceMin;
    },
    {
      message:
        "Maximum experience must be greater than or equal to minimum experience.",
    },
  );

recruitmentRouter.patch(
  "/jobs/:id",
  isAdminOrRecruiter,
  validate(updateJobSchema),
  async (req, res, next) => {
    try {
      const job = await repo.updateJobPosting(
        req.params.id,
        req.body,
      );

      if (!job) {
        throw AppError.notFound("Job posting not found.");
      }

      res.json({
        message: "Job posting updated successfully.",
        job,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// JOB DELETE
// ============================================================================

recruitmentRouter.delete(
  "/jobs/:id",
  isAdminOrRecruiter,
  async (req, res, next) => {
    try {
      const deleted = await repo.deleteJobPosting(
        req.params.id,
      );

      if (!deleted) {
        throw AppError.notFound("Job posting not found.");
      }

      res.json({
        id: req.params.id,
        deleted: true,
        message:
          "Job posting and related recruitment data deleted successfully.",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// JOB APPROVAL
// ============================================================================

const approvalSchema = z.object({
  comment: z
    .string()
    .max(1000)
    .optional(),
});

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
        req.body.comment,
      );

      if (!job) {
        throw AppError.notFound(
          "Job requisition not found.",
        );
      }

      res.json({
        message:
          "Job requisition approved successfully.",
        job,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// JOB REJECTION
// ============================================================================

const rejectionSchema = z.object({
  reason: z
    .string()
    .min(2, "Rejection reason is required.")
    .max(1000),
});

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
        req.body.reason,
      );

      if (!job) {
        throw AppError.notFound(
          "Job requisition not found.",
        );
      }

      res.json({
        message: "Job requisition rejected.",
        job,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// JOB STATUS
// ============================================================================

const statusSchema = z.object({
  status: z.enum([
    "OPEN",
    "ON_HOLD",
    "CLOSED",
  ]),
});

recruitmentRouter.patch(
  "/jobs/:id/status",
  isAdminOrRecruiter,
  validate(statusSchema),
  async (req, res, next) => {
    try {
      const job = await repo.updateJobStatus(
        req.params.id,
        req.body.status,
      );

      if (!job) {
        throw AppError.notFound(
          "Job posting not found.",
        );
      }

      res.json({ job });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// CANDIDATES
// ============================================================================

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
  },
);

recruitmentRouter.get(
  "/candidates/:id",
  isAdminOrRecruiterOrManager,
  async (req, res, next) => {
    try {
      const candidate =
        await repo.getCandidate(req.params.id);

      if (!candidate) {
        throw AppError.notFound(
          "Candidate not found.",
        );
      }

      res.json({ candidate });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// CREATE CANDIDATE
// ============================================================================

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
  },
);

// ============================================================================
// EDIT CANDIDATE
// ============================================================================

const updateCandidateSchema = z.object({
  firstName: z
    .string()
    .min(1)
    .optional(),

  lastName: z
    .string()
    .min(1)
    .optional(),

  email: z
    .string()
    .email()
    .optional(),

  phone: z
    .string()
    .optional(),

  expectedCtc: z
    .number()
    .min(0)
    .optional(),

  source: z
    .string()
    .optional(),

  referredById: z
    .string()
    .nullable()
    .optional(),

  notes: z
    .string()
    .nullable()
    .optional(),

  resumeText: z
    .string()
    .nullable()
    .optional(),
});

recruitmentRouter.patch(
  "/candidates/:id",
  isAdminOrRecruiter,
  validate(updateCandidateSchema),
  async (req, res, next) => {
    try {
      const candidate =
        await repo.updateCandidate(
          req.params.id,
          req.body,
        );

      if (!candidate) {
        throw AppError.notFound(
          "Candidate not found.",
        );
      }

      res.json({
        message:
          "Candidate updated successfully.",
        candidate,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// DELETE CANDIDATE
// ============================================================================

recruitmentRouter.delete(
  "/candidates/:id",
  isAdminOrRecruiter,
  async (req, res, next) => {
    try {
      const deleted =
        await repo.deleteCandidate(req.params.id);

      if (!deleted) {
        throw AppError.notFound(
          "Candidate not found.",
        );
      }

      res.json({
        id: req.params.id,
        deleted: true,
        message:
          "Candidate deleted successfully.",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// CANDIDATE STAGE
// ============================================================================

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

recruitmentRouter.patch(
  "/candidates/:id/stage",
  isAdminOrRecruiter,
  validate(stageSchema),
  async (req, res, next) => {
    try {
      const candidate =
        await repo.moveCandidateStage(
          req.params.id,
          req.body.stage,
        );

      if (!candidate) {
        throw AppError.notFound(
          "Candidate not found.",
        );
      }

      res.json({ candidate });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// CANDIDATE RATING
// ============================================================================

const ratingSchema = z.object({
  rating: z
    .number()
    .int()
    .min(1)
    .max(5),
});

recruitmentRouter.patch(
  "/candidates/:id/rating",
  isAdminOrRecruiter,
  validate(ratingSchema),
  async (req, res, next) => {
    try {
      const candidate =
        await repo.rateCandidate(
          req.params.id,
          req.body.rating,
        );

      if (!candidate) {
        throw AppError.notFound(
          "Candidate not found.",
        );
      }

      res.json({ candidate });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// AI CANDIDATE SCREENING
// ============================================================================

recruitmentRouter.post(
  "/candidates/:id/screen",
  isAdminOrRecruiter,
  async (req, res, next) => {
    try {
      const candidate = await repo.screenCandidate(req.params.id);

      if (!candidate) {
        throw AppError.notFound("Candidate not found.");
      }

      res.json({
        message: "AI screening completed successfully.",
        candidate,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// INTERVIEWS
// ============================================================================

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
  },
);

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
  },
);

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
        score: z
          .number()
          .int()
          .min(1)
          .max(5),
        comment: z.string().optional(),
      }),
    )
    .optional(),
});

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
          req.body.scorecard ?? [],
        );

      if (!interview) {
        throw AppError.notFound(
          "Interview not found.",
        );
      }

      res.json({
        interview,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// RECRUITMENT ANALYTICS
// ============================================================================

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
  },
);

recruitmentRouter.get(
  "/analytics/sources",
  isAdminOrRecruiterOrManager,
  async (_req, res, next) => {
    try {
      const data =
        await repo.getSourceAnalytics();

      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

recruitmentRouter.get(
  "/analytics/referrals",
  isAdminOrRecruiterOrManager,
  async (_req, res, next) => {
    try {
      const data =
        await repo.getReferralAnalytics();

      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

recruitmentRouter.get(
  "/analytics/volume-hiring",
  isAdminOrRecruiterOrManager,
  async (_req, res, next) => {
    try {
      const data =
        await repo.getVolumeHiringAnalytics();

      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

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
  },
);

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
  },
);

// ============================================================================
// OFFER MANAGEMENT
// ============================================================================

const offerSchema = z.object({
  annualCtc: z.number().min(0),

  joiningDate: z.string().min(1),

  basic: z.number().min(0).optional(),

  hra: z.number().min(0).optional(),

  specialAllowance: z
    .number()
    .min(0)
    .optional(),
});

recruitmentRouter.post(
  "/candidates/:id/offer",
  isAdminOrRecruiter,
  validate(offerSchema),
  async (req, res, next) => {
    try {
      const candidate =
        await repo.generateOffer(
          req.params.id,
          req.body,
        );

      if (!candidate) {
        throw AppError.notFound(
          "Candidate not found.",
        );
      }

      res.status(201).json({
        message:
          "Offer generated successfully.",
        candidate,
      });
    } catch (err) {
      next(err);
    }
  },
);

const offerResponseSchema = z.object({
  status: z.enum([
    "ACCEPTED",
    "DECLINED",
  ]),
});

recruitmentRouter.patch(
  "/candidates/:id/offer/response",
  isAdminOrRecruiter,
  validate(offerResponseSchema),
  async (req, res, next) => {
    try {
      const candidate =
        await repo.respondToOffer(
          req.params.id,
          req.body.status,
        );

      if (!candidate) {
        throw AppError.notFound(
          "Candidate not found.",
        );
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
        throw AppError.notFound(
          "Candidate not found.",
        );
      }

      res.json({
        message:
          "Background verification updated successfully.",
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
        throw AppError.notFound(
          "Candidate not found.",
        );
      }

      res.status(201).json({
        message:
          "Pre-boarding document added successfully.",
        candidate,
      });
    } catch (err) {
      next(err);
    }
  },
);

recruitmentRouter.patch(
  "/candidates/:id/preboarding/documents/:index/verify",
  isAdminOrRecruiter,
  async (req, res, next) => {
    try {
      const index = Number(req.params.index);

      if (
        !Number.isInteger(index) ||
        index < 0
      ) {
        throw AppError.badRequest(
          "Invalid document index.",
        );
      }

      const candidate =
        await repo.verifyPreboardingDocument(
          req.params.id,
          index,
        );

      if (!candidate) {
        throw AppError.notFound(
          "Candidate not found.",
        );
      }

      res.json({
        message:
          "Pre-boarding document verified successfully.",
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

recruitmentRouter.post(
  "/candidates/:id/hire",
  isAdminOrRecruiter,
  validate(hireCandidateSchema),
  async (req, res, next) => {
    try {
      const candidate =
        await repo.hireCandidate(
          req.params.id,
          req.body.role ?? "EMPLOYEE",
        );

      if (!candidate) {
        throw AppError.notFound(
          "Candidate not found.",
        );
      }

      res.json({
        message:
          "Candidate hired successfully and employee account created.",
        candidate,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default recruitmentRouter;