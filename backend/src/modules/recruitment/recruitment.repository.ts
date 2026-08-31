import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import {
  JobPosting,
  Candidate,
  Interview,
  Department,
  Designation,
  Employee,
  User,
} from "@/db/models";
import { nowIso } from "../../db/connection";

type AnyDoc = Record<string, any>;

function toApiDoc(doc: AnyDoc | null | undefined) {
  if (!doc) return undefined;

  const { _id, ...rest } = doc;

  return {
    id: _id,
    ...rest,
  };
}

// ===========================================================================
// JOB DESCRIPTION TEMPLATES
// ===========================================================================

const JD_TEMPLATES: Record<
  string,
  {
    description: string;
    skills: string[];
    minApprovalLevel: number;
  }
> = {
  ENGINEERING: {
    description:
      "We are looking for a skilled engineering professional to design, develop, test, and maintain high-quality software solutions. The candidate will collaborate with cross-functional teams, participate in code reviews, and contribute to the continuous improvement of our products and engineering processes.",
    skills: [
      "Problem Solving",
      "Programming",
      "System Design",
      "Git",
      "Communication",
    ],
    minApprovalLevel: 1,
  },

  DATA: {
    description:
      "We are looking for a data professional to collect, analyze, transform, and manage data for business and technology initiatives. The candidate will work with stakeholders to build reliable data solutions and deliver meaningful insights.",
    skills: [
      "SQL",
      "Python",
      "Data Analysis",
      "Problem Solving",
      "Communication",
    ],
    minApprovalLevel: 1,
  },

  HR: {
    description:
      "We are looking for an HR professional to support people operations, recruitment, employee engagement, and organizational processes. The candidate will work closely with managers and employees to ensure smooth HR operations.",
    skills: [
      "Recruitment",
      "Communication",
      "Employee Relations",
      "HR Operations",
      "Organization",
    ],
    minApprovalLevel: 1,
  },

  SALES: {
    description:
      "We are looking for a sales professional to identify business opportunities, build client relationships, manage the sales pipeline, and contribute to revenue growth.",
    skills: [
      "Communication",
      "Negotiation",
      "Lead Generation",
      "CRM",
      "Relationship Management",
    ],
    minApprovalLevel: 1,
  },

  MARKETING: {
    description:
      "We are looking for a marketing professional to support campaigns, brand initiatives, content creation, digital marketing, and performance analysis.",
    skills: [
      "Digital Marketing",
      "Content Marketing",
      "Communication",
      "Analytics",
      "Campaign Management",
    ],
    minApprovalLevel: 1,
  },

  FINANCE: {
    description:
      "We are looking for a finance professional to support financial planning, reporting, budgeting, analysis, and compliance activities.",
    skills: [
      "Financial Analysis",
      "Excel",
      "Budgeting",
      "Reporting",
      "Attention to Detail",
    ],
    minApprovalLevel: 1,
  },

  MANAGEMENT: {
    description:
      "We are looking for an experienced management professional to lead teams, drive strategic initiatives, manage business outcomes, and collaborate with senior stakeholders.",
    skills: [
      "Leadership",
      "People Management",
      "Strategic Planning",
      "Decision Making",
      "Communication",
    ],
    minApprovalLevel: 2,
  },

  SENIOR: {
    description:
      "We are looking for a senior professional with strong leadership, domain expertise, and strategic decision-making capabilities. The candidate will lead initiatives, mentor team members, and work with leadership on key business objectives.",
    skills: [
      "Leadership",
      "Strategic Planning",
      "Decision Making",
      "Stakeholder Management",
      "Mentoring",
    ],
    minApprovalLevel: 2,
  },
};

function normalizeRoleCategory(value?: string) {
  const category = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!category) return undefined;

  return JD_TEMPLATES[category] ? category : undefined;
}

function getTemplateForRole(
  roleCategory?: string,
  title?: string,
  designationTitle?: string,
) {
  const directCategory = normalizeRoleCategory(roleCategory);

  if (directCategory) {
    return {
      category: directCategory,
      ...JD_TEMPLATES[directCategory],
    };
  }

  const text = `${title ?? ""} ${designationTitle ?? ""}`.toLowerCase();

  if (
    text.includes("manager") ||
    text.includes("director") ||
    text.includes("head") ||
    text.includes("lead") ||
    text.includes("chief")
  ) {
    return {
      category: "MANAGEMENT",
      ...JD_TEMPLATES.MANAGEMENT,
    };
  }

  if (
    text.includes("developer") ||
    text.includes("engineer") ||
    text.includes("software") ||
    text.includes("frontend") ||
    text.includes("backend") ||
    text.includes("full stack")
  ) {
    return {
      category: "ENGINEERING",
      ...JD_TEMPLATES.ENGINEERING,
    };
  }

  if (
    text.includes("data") ||
    text.includes("analyst") ||
    text.includes("machine learning") ||
    text.includes("ai")
  ) {
    return {
      category: "DATA",
      ...JD_TEMPLATES.DATA,
    };
  }

  if (
    text.includes("recruit") ||
    text.includes("human resource") ||
    text.includes("hr ")
  ) {
    return {
      category: "HR",
      ...JD_TEMPLATES.HR,
    };
  }

  if (text.includes("sales") || text.includes("business development")) {
    return {
      category: "SALES",
      ...JD_TEMPLATES.SALES,
    };
  }

  if (
    text.includes("marketing") ||
    text.includes("seo") ||
    text.includes("content")
  ) {
    return {
      category: "MARKETING",
      ...JD_TEMPLATES.MARKETING,
    };
  }

  if (
    text.includes("finance") ||
    text.includes("account") ||
    text.includes("auditor")
  ) {
    return {
      category: "FINANCE",
      ...JD_TEMPLATES.FINANCE,
    };
  }

  return undefined;
}

function isSeniorRole(title?: string, designationTitle?: string) {
  const text = `${title ?? ""} ${designationTitle ?? ""}`.toLowerCase();

  return [
    "senior",
    "lead",
    "manager",
    "head",
    "director",
    "chief",
    "principal",
    "architect",
    "vice president",
    "vp",
  ].some((keyword) => text.includes(keyword));
}

function uniqueStrings(values: string[] = []) {
  return [
    ...new Set(values.map((value) => String(value).trim()).filter(Boolean)),
  ];
}

function validateBudget(budgetCtc: number | undefined, headcount: number) {
  if (budgetCtc === undefined || budgetCtc === null) {
    return;
  }

  if (!Number.isFinite(budgetCtc) || budgetCtc <= 0) {
    throw new Error("Budget CTC must be a valid amount greater than zero.");
  }

  if (!Number.isInteger(headcount) || headcount <= 0) {
    throw new Error("Headcount must be at least 1.");
  }

  const totalBudget = budgetCtc * headcount;

  if (!Number.isFinite(totalBudget) || totalBudget <= 0) {
    throw new Error("Total recruitment budget is invalid.");
  }
}

// ===========================================================================
// JOB POSTINGS / JOB REQUISITIONS
// ===========================================================================

export async function listJobPostings(
  status?: string,
  requisitionStatus?: string,
) {
  const query: Record<string, any> = {};

  if (status) {
    query.status = status;
  }

  if (requisitionStatus) {
    query.requisitionStatus = requisitionStatus;
  }

  const rows: AnyDoc[] = (await JobPosting.find(query)
    .sort({ requestedAt: -1 })
    .lean()) as AnyDoc[];

  if (!rows.length) {
    return [];
  }

  const departmentIds = [
    ...new Set(rows.map((row: AnyDoc) => row.departmentId)),
  ];

  const designationIds = [
    ...new Set(rows.map((row: AnyDoc) => row.designationId)),
  ];

  const jobIds = rows.map((row: AnyDoc) => row._id);

  const [departments, designations, candidateCounts] = await Promise.all([
    Department.find({
      _id: { $in: departmentIds },
    }).lean(),

    Designation.find({
      _id: { $in: designationIds },
    }).lean(),

    Candidate.aggregate([
      {
        $match: {
          jobPostingId: {
            $in: jobIds,
          },
        },
      },
      {
        $group: {
          _id: "$jobPostingId",
          count: {
            $sum: 1,
          },
        },
      },
    ]),
  ]);

  const deptMap = new Map(
    (departments as AnyDoc[]).map((department: AnyDoc) => [
      department._id,
      department,
    ]),
  );

  const designationMap = new Map(
    (designations as AnyDoc[]).map((designation: AnyDoc) => [
      designation._id,
      designation,
    ]),
  );

  const countMap = new Map(
    (candidateCounts as AnyDoc[]).map((candidate: AnyDoc) => [
      candidate._id,
      candidate.count,
    ]),
  );

  return rows.map((row: AnyDoc) => ({
    id: row._id,
    ...row,
    departmentName: deptMap.get(row.departmentId)?.name ?? null,
    designationTitle: designationMap.get(row.designationId)?.title ?? null,
    candidateCount: countMap.get(row._id) ?? 0,
  }));
}

export async function getJobPosting(id: string) {
  const row = await JobPosting.findById(id).lean();

  if (!row) {
    return undefined;
  }

  const [department, designation] = await Promise.all([
    Department.findById(row.departmentId).lean(),
    Designation.findById(row.designationId).lean(),
  ]);

  return {
    id: row._id,
    ...row,
    departmentName: department?.name ?? null,
    designationTitle: designation?.title ?? null,
  };
}

export interface CreateJobInput {
  title: string;
  departmentId: string;
  designationId: string;
  location?: string;
  employmentType?: string;
  experienceMin?: number;
  experienceMax?: number;
  description?: string;
  openings?: number;
  headcount?: number;
  budgetCtc?: number;
  approvalLevelRequired?: number;
  postingChannels?: string[];
  screeningQuestions?: string[];
  hiringMode?: "STANDARD" | "WALK_IN" | "CAMPUS";

  walkInDrive?: {
    driveDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    venue?: string | null;
    coordinatorName?: string | null;
    coordinatorContact?: string | null;
    registrationDeadline?: string | null;
    expectedCandidates?: number | null;
  } | null;

  campusDrive?: {
    collegeName?: string | null;
    campusLocation?: string | null;
    driveDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    placementCoordinator?: string | null;
    coordinatorContact?: string | null;
    expectedCandidates?: number | null;
  } | null;

  skills?: string[];
  requestedById: string;
  roleCategory?: string;
  useTemplate?: boolean;
}

export async function createJobPosting(input: CreateJobInput) {
  const now = nowIso();

  const department = await Department.findById(input.departmentId).lean();

  if (!department) {
    throw new Error("Selected department was not found.");
  }

  const designation = await Designation.findById(input.designationId).lean();

  if (!designation) {
    throw new Error("Selected designation was not found.");
  }

  if (
    designation.departmentId &&
    designation.departmentId !== input.departmentId
  ) {
    throw new Error(
      "The selected designation does not belong to the selected department.",
    );
  }

  const headcount = Math.max(1, Number(input.headcount ?? input.openings ?? 1));

  const openings = Math.max(1, Number(input.openings ?? input.headcount ?? 1));

  if (!Number.isInteger(headcount)) {
    throw new Error("Headcount must be a whole number.");
  }

  if (!Number.isInteger(openings)) {
    throw new Error("Openings must be a whole number.");
  }

  const experienceMin = Math.max(0, Number(input.experienceMin ?? 0));

  const experienceMax = Math.max(
    experienceMin,
    Number(input.experienceMax ?? 5),
  );

  if (experienceMax < experienceMin) {
    throw new Error(
      "Maximum experience cannot be less than minimum experience.",
    );
  }

  validateBudget(input.budgetCtc, headcount);

  const template = getTemplateForRole(
    input.roleCategory,
    input.title,
    designation.title,
  );

  const useTemplate = input.useTemplate !== false;

  const description =
    input.description?.trim() ||
    (useTemplate ? template?.description : undefined);

  if (!description) {
    throw new Error(
      "Job description is required. Select a role template or provide a description.",
    );
  }

  const skills = uniqueStrings([
    ...(useTemplate ? (template?.skills ?? []) : []),
    ...(input.skills ?? []),
  ]);

  const seniorRole = isSeniorRole(input.title, designation.title);

  const templateMinimumLevel = template?.minApprovalLevel ?? 1;

  const seniorMinimumLevel = seniorRole ? 2 : 1;

  const requiredApprovalLevel = Math.max(
    1,
    input.approvalLevelRequired ?? 1,
    templateMinimumLevel,
    seniorMinimumLevel,
  );

  const requester = (await User.findById(input.requestedById)
    .select("_id role isActive")
    .lean()) as AnyDoc | null;

  if (!requester) {
    throw new Error("The user creating this requisition was not found.");
  }

  if (requester.isActive === false) {
    throw new Error("The user creating this requisition is inactive.");
  }

  const isAdminRequester =
    requester.role === "SUPER_ADMIN" || requester.role === "HR_ADMIN";

  const approvers: AnyDoc[] = (await User.find({
    role: {
      $in: ["SUPER_ADMIN", "HR_ADMIN"],
    },
    isActive: true,
  })
    .select("_id role")
    .sort({
      role: 1,
      createdAt: 1,
    })
    .lean()) as AnyDoc[];

  /*
   * SUPER_ADMIN and HR_ADMIN are allowed to create requisitions.
   * A recruiter creates a requisition for admin approval.
   *
   * When an admin creates a requisition, the creator can act as the
   * first approval level. This prevents the creator from being blocked
   * simply because the database has no second admin account available.
   * Higher approval levels still require additional active admins.
   */
  const eligibleApprovers = approvers.filter(
    (user) => String(user._id) !== String(requester._id),
  );

  let approvalSteps: AnyDoc[] = [];

  if (isAdminRequester) {
    const firstApprover = {
      approverId: requester._id,
      level: 1,
      status: "APPROVED",
      actedAt: now,
      comment: "Automatically approved by the requisition creator.",
    };

    const remainingApprovalLevels = Math.max(0, requiredApprovalLevel - 1);

    if (remainingApprovalLevels > eligibleApprovers.length) {
      throw new Error(
        `This requisition requires ${requiredApprovalLevel} approval level(s), but only ${eligibleApprovers.length + 1} active admin approver(s) are available.`,
      );
    }

    approvalSteps = [
      firstApprover,
      ...eligibleApprovers
        .slice(0, remainingApprovalLevels)
        .map((user, index) => ({
          approverId: user._id,
          level: index + 2,
          status: "PENDING",
          actedAt: null,
          comment: null,
        })),
    ];
  } else {
    if (approvers.length < requiredApprovalLevel) {
      throw new Error(
        `This requisition requires ${requiredApprovalLevel} approval level(s), but only ${approvers.length} active admin approver(s) are available.`,
      );
    }

    approvalSteps = approvers
      .slice(0, requiredApprovalLevel)
      .map((user, index) => ({
        approverId: user._id,
        level: index + 1,
        status: "PENDING",
        actedAt: null,
        comment: null,
      }));
  }

  const doc = await JobPosting.create({
    title: input.title.trim(),
    departmentId: input.departmentId,
    designationId: input.designationId,

    location: input.location?.trim() || "Bengaluru, India",

    employmentType: input.employmentType ?? "FULL_TIME",

    experienceMin,
    experienceMax,

    description,

    status: "ON_HOLD",

    openings,

    postedAt: now,

    requestedAt: now,

    requestedById: input.requestedById,

    requisitionStatus: "PENDING_APPROVAL",

    headcount,

    budgetCtc: input.budgetCtc ?? null,

    approvalLevelRequired: requiredApprovalLevel,

    approvalSteps,

    postingChannels: uniqueStrings(input.postingChannels ?? ["CAREERS"]),

    screeningQuestions: uniqueStrings(input.screeningQuestions ?? []),

    hiringMode: input.hiringMode ?? "STANDARD",

    walkInDrive:
      input.hiringMode === "WALK_IN"
        ? {
            driveDate: input.walkInDrive?.driveDate ?? null,

            startTime: input.walkInDrive?.startTime ?? null,

            endTime: input.walkInDrive?.endTime ?? null,

            venue: input.walkInDrive?.venue?.trim() ?? null,

            coordinatorName: input.walkInDrive?.coordinatorName?.trim() ?? null,

            coordinatorContact:
              input.walkInDrive?.coordinatorContact?.trim() ?? null,

            registrationDeadline:
              input.walkInDrive?.registrationDeadline ?? null,

            expectedCandidates: input.walkInDrive?.expectedCandidates ?? null,
          }
        : null,

    campusDrive:
      input.hiringMode === "CAMPUS"
        ? {
            collegeName: input.campusDrive?.collegeName?.trim() ?? null,

            campusLocation: input.campusDrive?.campusLocation?.trim() ?? null,

            driveDate: input.campusDrive?.driveDate ?? null,

            startTime: input.campusDrive?.startTime ?? null,

            endTime: input.campusDrive?.endTime ?? null,

            placementCoordinator:
              input.campusDrive?.placementCoordinator?.trim() ?? null,

            coordinatorContact:
              input.campusDrive?.coordinatorContact?.trim() ?? null,

            expectedCandidates: input.campusDrive?.expectedCandidates ?? null,
          }
        : null,

    skills,
    roleCategory:
      template?.category ?? normalizeRoleCategory(input.roleCategory) ?? null,

    seniorRole,
  });

  return getJobPosting(doc._id);
}

export async function approveJob(
  id: string,
  approverId: string,
  comment?: string,
) {
  const job = await JobPosting.findById(id);

  if (!job) {
    return undefined;
  }

  const approvalSteps = ((job as AnyDoc).approvalSteps ?? []) as AnyDoc[];

  // Legacy/single-step requisitions without an approval workflow.
  if (!approvalSteps.length) {
    (job as AnyDoc).approvalSteps = [
      {
        approverId,
        level: 1,
        status: "APPROVED",
        actedAt: nowIso(),
        comment: comment ?? null,
      },
    ];

    (job as AnyDoc).requisitionStatus = "APPROVED";
    (job as AnyDoc).status = "OPEN";
    (job as AnyDoc).approvedById = approverId;
    (job as AnyDoc).approvedAt = nowIso();

    await job.save();

    return getJobPosting(id);
  }

  // Find the next approval step in level order.
  const pendingStep = approvalSteps
    .filter((step: AnyDoc) => step.status === "PENDING")
    .sort(
      (a: AnyDoc, b: AnyDoc) => Number(a.level ?? 0) - Number(b.level ?? 0),
    )[0];

  if (!pendingStep) {
    // Nothing is pending, so do not change an already completed workflow.
    return getJobPosting(id);
  }

  // Only the assigned approver can approve the current step.
  if (String(pendingStep.approverId) !== String(approverId)) {
    throw new Error("You are not the current approver for this requisition.");
  }

  pendingStep.status = "APPROVED";
  pendingStep.actedAt = nowIso();
  pendingStep.comment = comment ?? null;

  (job as AnyDoc).approvalSteps = approvalSteps;

  const allApproved = approvalSteps.every(
    (step: AnyDoc) => step.status === "APPROVED",
  );

  if (allApproved) {
    (job as AnyDoc).requisitionStatus = "APPROVED";
    (job as AnyDoc).status = "OPEN";
    (job as AnyDoc).approvedById = approverId;
    (job as AnyDoc).approvedAt = nowIso();
  } else {
    (job as AnyDoc).requisitionStatus = "PENDING_APPROVAL";
  }

  await job.save();

  return getJobPosting(id);
}

export async function rejectJob(
  id: string,
  approverId: string,
  reason: string,
) {
  const job = await JobPosting.findById(id);

  if (!job) {
    return undefined;
  }

  const rejectionReason = reason.trim();

  if (!rejectionReason) {
    throw new Error("Rejection reason is required.");
  }

  if (job.requisitionStatus === "APPROVED") {
    throw new Error("An approved requisition cannot be rejected.");
  }

  const approvalSteps = (job.approvalSteps ?? []) as AnyDoc[];

  const currentPendingStep = approvalSteps.find(
    (step: AnyDoc) => step.status === "PENDING",
  );

  if (!currentPendingStep || currentPendingStep.approverId !== approverId) {
    throw new Error("You are not the current approver for this requisition.");
  }

  currentPendingStep.status = "REJECTED";

  currentPendingStep.actedAt = nowIso();

  currentPendingStep.comment = rejectionReason;

  job.approvalSteps = approvalSteps as any;

  job.requisitionStatus = "REJECTED";

  job.status = "CLOSED";

  job.rejectionReason = rejectionReason;

  await job.save();

  return getJobPosting(id);
}

export interface UpdateJobInput {
  title?: string;
  location?: string;
  employmentType?: string;
  experienceMin?: number;
  experienceMax?: number;
  description?: string;
  openings?: number;
  headcount?: number;
  budgetCtc?: number | null;
  approvalLevelRequired?: number;
  postingChannels?: string[];
  screeningQuestions?: string[];
  hiringMode?: "STANDARD" | "WALK_IN" | "CAMPUS";

  walkInDrive?: {
    driveDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    venue?: string | null;
    coordinatorName?: string | null;
    coordinatorContact?: string | null;
    registrationDeadline?: string | null;
    expectedCandidates?: number | null;
  } | null;

  campusDrive?: {
    collegeName?: string | null;
    campusLocation?: string | null;
    driveDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    placementCoordinator?: string | null;
    coordinatorContact?: string | null;
    expectedCandidates?: number | null;
  } | null;

  skills?: string[];
  status?: "OPEN" | "ON_HOLD" | "CLOSED";
}

export async function updateJobPosting(id: string, input: UpdateJobInput) {
  const existing = await JobPosting.findById(id).lean();

  if (!existing) {
    return undefined;
  }

  if (
    input.experienceMin !== undefined &&
    input.experienceMax !== undefined &&
    input.experienceMax < input.experienceMin
  ) {
    throw new Error(
      "Maximum experience must be greater than or equal to minimum experience.",
    );
  }

  const updates: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) updates[key] = value;
  }

  if (input.headcount !== undefined && input.openings === undefined) {
    updates.openings = input.headcount;
  }

  if (input.openings !== undefined && input.headcount === undefined) {
    updates.headcount = input.openings;
  }

  await JobPosting.updateOne({ _id: id }, { $set: updates });

  return getJobPosting(id);
}

export async function deleteJobPosting(id: string) {
  const candidateRows = await Candidate.find(
    { jobPostingId: id },
    { _id: 1 },
  ).lean();

  const candidateIds = candidateRows.map((candidate: AnyDoc) => candidate._id);

  if (candidateIds.length) {
    await Interview.deleteMany({
      candidateId: { $in: candidateIds },
    });

    await Candidate.deleteMany({
      jobPostingId: id,
    });
  }

  const result = await JobPosting.deleteOne({ _id: id });

  if (!result.deletedCount) {
    return undefined;
  }

  return {
    id,
    deleted: true,
    deletedCandidates: candidateIds.length,
  };
}

export async function updateJobStatus(id: string, status: string) {
  await JobPosting.updateOne(
    {
      _id: id,
    },
    {
      $set: {
        status,
      },
    },
  );

  return getJobPosting(id);
}

// ===========================================================================
// CANDIDATES
// ===========================================================================

export async function listCandidates(jobPostingId?: string) {
  const query = jobPostingId
    ? {
        jobPostingId,
      }
    : {};

  const rows: AnyDoc[] = (await Candidate.find(query)
    .sort({
      appliedAt: -1,
    })
    .lean()) as AnyDoc[];

  if (!rows.length) {
    return [];
  }

  const jobIds = [...new Set(rows.map((row: AnyDoc) => row.jobPostingId))];

  const jobs: AnyDoc[] = (await JobPosting.find({
    _id: {
      $in: jobIds,
    },
  }).lean()) as AnyDoc[];

  const jobMap = new Map(jobs.map((job: AnyDoc) => [job._id, job]));

  return rows.map((row: AnyDoc) => ({
    id: row._id,
    ...row,
    jobTitle: jobMap.get(row.jobPostingId)?.title ?? null,
  }));
}

export async function getCandidate(id: string) {
  const row = await Candidate.findById(id).lean();

  if (!row) {
    return undefined;
  }

  const job = await JobPosting.findById(row.jobPostingId).lean();

  return {
    id: row._id,
    ...row,
    jobTitle: job?.title ?? null,
  };
}

export interface CreateCandidateInput {
  jobPostingId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  expectedCtc?: number;
  source?: string;
  referredById?: string;
  notes?: string;
  resumeText?: string;
}

export async function createCandidate(input: CreateCandidateInput) {
  const duplicate = await Candidate.findOne({
    jobPostingId: input.jobPostingId,
    email: input.email.toLowerCase().trim(),
  }).lean();

  if (duplicate) {
    throw new Error(
      "A candidate with this email already applied for this job.",
    );
  }

  const doc = await Candidate.create({
    jobPostingId: input.jobPostingId,

    firstName: input.firstName,

    lastName: input.lastName,

    email: input.email.toLowerCase().trim(),

    phone: input.phone ?? null,

    expectedCtc: input.expectedCtc ?? null,

    source: input.source ?? "CAREERS",

    referredById: input.referredById ?? null,

    referralBonusStatus: input.referredById ? "PENDING" : "NOT_APPLICABLE",

    notes: input.notes ?? null,

    resumeText: input.resumeText ?? null,

    stage: "APPLIED",

    appliedAt: nowIso(),
  });

  return getCandidate(doc._id);
}

export async function moveCandidateStage(id: string, stage: string) {
  await Candidate.updateOne(
    {
      _id: id,
    },
    {
      $set: {
        stage,
      },
    },
  );

  return getCandidate(id);
}

export async function rateCandidate(id: string, rating: number) {
  await Candidate.updateOne(
    {
      _id: id,
    },
    {
      $set: {
        rating,
      },
    },
  );

  return getCandidate(id);
}
export interface UpdateCandidateInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  expectedCtc?: number;
  source?: string;
}

export async function updateCandidate(id: string, input: UpdateCandidateInput) {
  const candidate = await Candidate.findById(id);

  if (!candidate) {
    return undefined;
  }

  const normalizedEmail = input.email.toLowerCase().trim();

  const duplicate = await Candidate.findOne({
    _id: { $ne: id },
    jobPostingId: candidate.jobPostingId,
    email: normalizedEmail,
  }).lean();

  if (duplicate) {
    throw new Error(
      "Another candidate with this email already exists for this job.",
    );
  }

  candidate.firstName = input.firstName.trim();
  candidate.lastName = input.lastName.trim();
  candidate.email = normalizedEmail;
  candidate.phone = input.phone?.trim() || null;
  candidate.expectedCtc =
    input.expectedCtc !== undefined && input.expectedCtc !== null
      ? Number(input.expectedCtc)
      : null;

  if (input.source !== undefined) {
    candidate.source = input.source;
  }

  await candidate.save();

  return getCandidate(id);
}

export async function deleteCandidate(id: string) {
  const candidate = await Candidate.findById(id);

  if (!candidate) {
    return undefined;
  }

  if (candidate.stage === "HIRED" || candidate.hiredEmployeeId) {
    throw new Error(
      "A hired candidate cannot be deleted. The employee record already exists.",
    );
  }

  await Candidate.deleteOne({ _id: id });

  return {
    id,
    deleted: true,
  };
}

function normalizeTokens(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((value: string) => value.length > 1),
  );
}

export async function screenCandidate(id: string, resumeText?: string) {
  const candidate = await Candidate.findById(id);

  if (!candidate) {
    return undefined;
  }

  if (typeof resumeText === "string" && resumeText.trim()) {
    candidate.resumeText = resumeText.trim();
  }

  const job = await JobPosting.findById(candidate.jobPostingId);

  if (!job) {
    throw new Error("Job posting not found.");
  }

  const fallbackResume = [
    candidate.firstName,
    candidate.lastName,
    candidate.email,
    candidate.phone ?? "",
    candidate.notes ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const screeningText = String(candidate.resumeText?.trim() || fallbackResume);

  const jobTokens = normalizeTokens(
    `${job.title} ${job.description} ${job.skills.join(" ")}`,
  );

  const resumeTokens = normalizeTokens(screeningText);

  const matched = [...jobTokens].filter((value: string) =>
    resumeTokens.has(value),
  );

  const score = jobTokens.size
    ? Math.min(100, Math.round((matched.length / jobTokens.size) * 100))
    : 0;

  const extractedSkills = [
    ...new Set(
      matched.filter((value: string) =>
        job.skills.map((skill: string) => skill.toLowerCase()).includes(value),
      ),
    ),
  ];

  // =========================================================
  // CUSTOM SHORTLISTING CRITERIA
  // =========================================================

  let autoShortlisted = false;

  let shortlistingResult: "PENDING" | "SHORTLISTED" | "NOT_SHORTLISTED" =
    "PENDING";

  if (job.shortlistingCriteria?.enabled) {
    const criteria = job.shortlistingCriteria;

    const candidateSkills = extractedSkills.map((skill: string) =>
      skill.toLowerCase().trim(),
    );

    const requiredSkills = criteria.requiredSkills.map((skill: string) =>
      skill.toLowerCase().trim(),
    );

    const matchedRequiredSkills = requiredSkills.filter((skill: string) =>
      candidateSkills.includes(skill),
    );

    // 1. Job-fit score check
    const scorePassed = score >= criteria.minimumJobFitScore;

    // 2. Required skills check
    const skillsPassed =
      requiredSkills.length === 0 ||
      matchedRequiredSkills.length === requiredSkills.length;

    // 3. Experience check
    // Uses candidate experience if available.
    const candidateExperience = Number((candidate as any).experience ?? 0);

    const experiencePassed = candidateExperience >= criteria.minimumExperience;

    // Candidate must satisfy ALL enabled criteria
    autoShortlisted = scorePassed && skillsPassed && experiencePassed;

    shortlistingResult = autoShortlisted ? "SHORTLISTED" : "NOT_SHORTLISTED";
  }

  // =========================================================
  // SAVE AI SCREENING RESULTS
  // =========================================================

  candidate.extractedSkills = extractedSkills;

  candidate.jobFitScore = score;

  candidate.screeningSummary =
    `AI-assisted screening completed. ` +
    `Matched ${matched.length} relevant terms. ` +
    `Fit score: ${score}%. ` +
    `Auto-shortlisting result: ${shortlistingResult}. ` +
    `Human review is required before rejection.`;

  candidate.autoShortlisted = autoShortlisted;

  candidate.shortlistingResult = shortlistingResult;

  if (candidate.stage === "APPLIED") {
    candidate.stage = "SCREENING";
  }

  await candidate.save();

  return getCandidate(id);
}

// ===========================================================================
// INTERVIEWS
// ===========================================================================

export async function listInterviews(candidateId?: string) {
  const rows: AnyDoc[] = (await Interview.find(
    candidateId
      ? {
          candidateId,
        }
      : {},
  )
    .sort({
      scheduledAt: 1,
    })
    .lean()) as AnyDoc[];

  if (!rows.length) {
    return [];
  }

  const candidateIds = [...new Set(rows.map((row: AnyDoc) => row.candidateId))];

  const interviewerIds = [
    ...new Set(rows.map((row: AnyDoc) => row.interviewerId)),
  ];

  const [candidates, interviewers] = await Promise.all([
    Candidate.find({
      _id: {
        $in: candidateIds,
      },
    }).lean(),

    Employee.find({
      _id: {
        $in: interviewerIds,
      },
    }).lean(),
  ]);

  const candidateRows = candidates as AnyDoc[];

  const interviewerRows = interviewers as AnyDoc[];

  const candidateMap = new Map(
    candidateRows.map((candidate: AnyDoc) => [candidate._id, candidate]),
  );

  const employeeMap = new Map(
    interviewerRows.map((employee: AnyDoc) => [employee._id, employee]),
  );

  return rows.map((row: AnyDoc) => ({
    id: row._id,
    ...row,
    candidateFirstName: candidateMap.get(row.candidateId)?.firstName ?? null,
    candidateLastName: candidateMap.get(row.candidateId)?.lastName ?? null,
    interviewerFirstName: employeeMap.get(row.interviewerId)?.firstName ?? null,
    interviewerLastName: employeeMap.get(row.interviewerId)?.lastName ?? null,
  }));
}

export async function scheduleInterview(input: {
  candidateId: string;
  interviewerId: string;
  scheduledAt: string;
  round?: string;
  mode?: "VIDEO" | "IN_PERSON" | "PHONE";
}) {
  const mode = input.mode ?? "VIDEO";

  const doc = await Interview.create({
    candidateId: input.candidateId,

    interviewerId: input.interviewerId,

    scheduledAt: input.scheduledAt,

    round: input.round ?? "Round 1",

    mode,

    meetingLink:
      mode === "VIDEO"
        ? `https://meet.jit.si/ART-${input.candidateId}-${Date.now()}`
        : null,

    scorecard: [],
  });

  await Candidate.updateOne(
    {
      _id: input.candidateId,
    },
    {
      $set: {
        stage: "INTERVIEW",
      },
    },
  );

  return toApiDoc((await Interview.findById(doc._id).lean())!);
}

export async function submitInterviewFeedback(
  id: string,
  feedback: string,
  recommendation: string,
  scorecard: any[] = [],
) {
  await Interview.updateOne(
    {
      _id: id,
    },
    {
      $set: {
        feedback,
        recommendation,
        scorecard,
        completed: true,
      },
    },
  );

  return toApiDoc((await Interview.findById(id).lean())!);
}

// ===========================================================================
// OFFER
// ===========================================================================

export async function generateOffer(
  id: string,
  input: {
    annualCtc: number;
    joiningDate: string;
    basic?: number;
    hra?: number;
    specialAllowance?: number;
  },
) {
  const candidate = await Candidate.findById(id).lean();

  if (!candidate) {
    return undefined;
  }

  const job = await JobPosting.findById(candidate.jobPostingId).lean();

  if (!job) {
    throw new Error("Job posting not found.");
  }

  const now = nowIso();

  const basic = input.basic ?? Math.round(input.annualCtc * 0.4);

  const hra = input.hra ?? Math.round(input.annualCtc * 0.2);

  const specialAllowance =
    input.specialAllowance ?? Math.max(0, input.annualCtc - basic - hra);

  const uploads = path.join(process.cwd(), "uploads");

  fs.mkdirSync(uploads, {
    recursive: true,
  });

  const filename = `offer-${candidate._id}-${Date.now()}.html`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Offer Letter</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;line-height:1.6}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:10px;text-align:left}</style></head><body><h1>Employment Offer</h1><p>Dear ${candidate.firstName} ${candidate.lastName},</p><p>We are pleased to offer you the position of <b>${job.title}</b>.</p><h3>Compensation</h3><table><tr><th>Component</th><th>Annual Amount</th></tr><tr><td>Basic</td><td>₹${basic.toLocaleString("en-IN")}</td></tr><tr><td>HRA</td><td>₹${hra.toLocaleString("en-IN")}</td></tr><tr><td>Special Allowance</td><td>₹${specialAllowance.toLocaleString("en-IN")}</td></tr><tr><th>Total CTC</th><th>₹${input.annualCtc.toLocaleString("en-IN")}</th></tr></table><p>Proposed joining date: <b>${input.joiningDate}</b></p><p>This is a digitally generated offer document from SmartHR Pro.</p></body></html>`;

  fs.writeFileSync(path.join(uploads, filename), html, "utf8");

  await Candidate.updateOne(
    {
      _id: id,
    },
    {
      $set: {
        stage: "OFFER",
        offer: {
          status: "SENT",
          offerUrl: `/uploads/${filename}`,
          annualCtc: input.annualCtc,
          basic,
          hra,
          specialAllowance,
          joiningDate: input.joiningDate,
          generatedAt: now,
          respondedAt: null,
        },
      },
    },
  );

  return getCandidate(id);
}

export async function respondToOffer(
  id: string,
  status: "ACCEPTED" | "DECLINED",
) {
  const candidate = await Candidate.findById(id);

  if (!candidate) {
    return undefined;
  }

  if (!candidate.offer) {
    throw new Error("Offer has not been generated for this candidate.");
  }

  candidate.offer.status = status;

  candidate.offer.respondedAt = nowIso();

  if (status === "ACCEPTED") {
    candidate.stage = "OFFER";
  } else {
    candidate.stage = "REJECTED";
  }

  await candidate.save();

  return getCandidate(id);
}

// ===========================================================================
// BACKGROUND VERIFICATION
// ===========================================================================

export async function updateBackgroundVerification(
  id: string,
  input: {
    status: string;
    provider?: string;
    reference?: string;
    notes?: string;
  },
) {
  const candidate = await Candidate.findById(id);

  if (!candidate) {
    return undefined;
  }

  const now = nowIso();

  if (!candidate.backgroundVerification) {
    candidate.backgroundVerification = {
      status: "NOT_STARTED",
      provider: null,
      reference: null,
      notes: null,
      startedAt: null,
      completedAt: null,
    };
  }

  candidate.backgroundVerification.status = input.status as any;

  candidate.backgroundVerification.provider =
    input.provider ?? candidate.backgroundVerification.provider;

  candidate.backgroundVerification.reference =
    input.reference ?? candidate.backgroundVerification.reference;

  candidate.backgroundVerification.notes =
    input.notes ?? candidate.backgroundVerification.notes;

  if (input.status === "IN_PROGRESS") {
    candidate.backgroundVerification.startedAt =
      candidate.backgroundVerification.startedAt ?? now;
  }

  if (input.status === "VERIFIED" || input.status === "FAILED") {
    candidate.backgroundVerification.completedAt = now;
  }

  await candidate.save();

  return getCandidate(id);
}

// ===========================================================================
// PREBOARDING
// ===========================================================================

export async function addPreboardingDocument(
  id: string,
  type: string,
  url: string,
) {
  const candidate = await Candidate.findById(id);

  if (!candidate) {
    return undefined;
  }

  if (!candidate.preboarding) {
    candidate.preboarding = {
      status: "NOT_STARTED",
      completedAt: null,
      documents: [],
    };
  }

  if (!candidate.preboarding.documents) {
    candidate.preboarding.documents = [];
  }

  candidate.preboarding.documents.push({
    type,
    url,
    uploadedAt: nowIso(),
    verified: false,
  });

  candidate.preboarding.status = "IN_PROGRESS";

  await candidate.save();

  return getCandidate(id);
}

export async function verifyPreboardingDocument(id: string, index: number) {
  const candidate = await Candidate.findById(id);

  if (!candidate) {
    return undefined;
  }

  if (!candidate.preboarding) {
    throw new Error("Pre-boarding has not been started.");
  }

  if (!candidate.preboarding.documents) {
    throw new Error("No pre-boarding documents found.");
  }

  if (!candidate.preboarding.documents[index]) {
    throw new Error("Pre-boarding document not found.");
  }

  candidate.preboarding.documents[index].verified = true;

  if (
    candidate.preboarding.documents.length &&
    candidate.preboarding.documents.every(
      (document: AnyDoc) => document.verified,
    )
  ) {
    candidate.preboarding.status = "COMPLETED";

    candidate.preboarding.completedAt = nowIso();
  }

  await candidate.save();

  return getCandidate(id);
}

// ===========================================================================
// HIRING / EMPLOYEE HANDOFF
// ===========================================================================

export async function hireCandidate(id: string, role = "EMPLOYEE") {
  const candidate = await Candidate.findById(id);

  if (!candidate) {
    return undefined;
  }

  if (!candidate.offer) {
    throw new Error("Offer has not been generated.");
  }

  if (candidate.offer.status !== "ACCEPTED") {
    throw new Error("Candidate must accept the offer before joining.");
  }

  if (!candidate.backgroundVerification) {
    throw new Error(
      "Background verification must be completed before joining.",
    );
  }

  if (candidate.backgroundVerification.status !== "VERIFIED") {
    throw new Error("Background verification must be VERIFIED before joining.");
  }

  if (!candidate.preboarding) {
    throw new Error("Pre-boarding must be completed before joining.");
  }

  if (candidate.preboarding.status !== "COMPLETED") {
    throw new Error("Pre-boarding documents must be completed before joining.");
  }

  if (candidate.hiredEmployeeId) {
    return getCandidate(id);
  }

  const job = await JobPosting.findById(candidate.jobPostingId);

  if (!job) {
    throw new Error("Job posting not found.");
  }

  const existing = await User.findOne({
    email: candidate.email.toLowerCase(),
  }).lean();

  if (existing) {
    throw new Error("A user already exists with the candidate email.");
  }

  const designation = await Designation.findById(job.designationId).lean();

  const department = await Department.findById(job.departmentId).lean();

  const now = nowIso();

  const tempPassword = `ART@${Math.random().toString(36).slice(2, 10)}1!`;

  const user = await User.create({
    email: candidate.email.toLowerCase(),

    passwordHash: bcrypt.hashSync(tempPassword, 10),

    role: role as any,

    isActive: true,

    mustResetPwd: true,

    createdAt: now,

    updatedAt: now,
  });

  const employeeCode = `ART-${new Date().getFullYear()}-${String(
    (await Employee.countDocuments()) + 1,
  ).padStart(4, "0")}`;

  const employee = await Employee.create({
    employeeCode,

    userId: user._id,

    firstName: candidate.firstName,

    lastName: candidate.lastName,

    avatarUrl: null,
    gender: null,
    maritalStatus: null,
    dateOfBirth: null,

    personalEmail: candidate.email,

    phone: candidate.phone,

    address: null,
    city: null,
    state: null,
    country: "India",

    departmentId: job.departmentId,

    designationId: job.designationId,

    managerId: null,

    employmentType: job.employmentType,

    status: "ACTIVE",

    dateOfJoining: candidate.offer.joiningDate ?? now,

    dateOfExit: null,

    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    emergencyContactEmail: null,

    employeeAadhaar: null,
    employeePan: null,

    createdAt: now,
    updatedAt: now,
  });

  candidate.hiredEmployeeId = employee._id;

  candidate.stage = "HIRED";

  await candidate.save();

  return {
    ...(await getCandidate(id)),

    employeeId: employee._id,

    employeeCode,

    temporaryPassword: tempPassword,

    departmentName: department?.name ?? null,

    designationTitle: designation?.title ?? null,
  };
}

// ===========================================================================
// RECRUITMENT METRICS
// ===========================================================================

export async function getPipelineSummary() {
  const rows = await Candidate.aggregate([
    {
      $group: {
        _id: "$stage",
        count: {
          $sum: 1,
        },
      },
    },
  ]);

  return (rows as AnyDoc[]).map((row: AnyDoc) => ({
    stage: row._id,
    count: row.count,
  }));
}

export async function getOpenRolesCount() {
  return JobPosting.countDocuments({
    status: "OPEN",
    requisitionStatus: "APPROVED",
  });
}

export async function getRecruitmentMetrics() {
  const [
    applications,
    screening,
    interviews,
    offers,
    accepted,
    hired,
    openRoles,
  ] = await Promise.all([
    Candidate.countDocuments(),

    Candidate.countDocuments({
      stage: "SCREENING",
    }),

    Candidate.countDocuments({
      stage: "INTERVIEW",
    }),

    Candidate.countDocuments({
      stage: "OFFER",
    }),

    Candidate.countDocuments({
      "offer.status": "ACCEPTED",
    }),

    Candidate.countDocuments({
      stage: "HIRED",
    }),

    getOpenRolesCount(),
  ]);

  return {
    applications,
    screening,
    interviews,
    offers,
    accepted,
    hired,
    openRoles,
  };
}

// ===========================================================================
// RECRUITMENT SOURCE ANALYTICS
// Supports existing sources such as Career Site, LinkedIn, Naukri, Indeed,
// Referral, Walk-in, Campus and Job Board.
// ===========================================================================

export async function getSourceAnalytics() {
  const rows = await Candidate.aggregate([
    {
      $group: {
        _id: {
          $ifNull: ["$source", "Unknown"],
        },
        applications: {
          $sum: 1,
        },
        screening: {
          $sum: {
            $cond: [
              {
                $in: ["$stage", ["SCREENING", "INTERVIEW", "OFFER", "HIRED"]],
              },
              1,
              0,
            ],
          },
        },
        interviews: {
          $sum: {
            $cond: [
              {
                $in: ["$stage", ["INTERVIEW", "OFFER", "HIRED"]],
              },
              1,
              0,
            ],
          },
        },
        offers: {
          $sum: {
            $cond: [
              {
                $or: [
                  {
                    $in: ["$stage", ["OFFER", "HIRED"]],
                  },
                  {
                    $eq: ["$offer.status", "ACCEPTED"],
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
        accepted: {
          $sum: {
            $cond: [
              {
                $eq: ["$offer.status", "ACCEPTED"],
              },
              1,
              0,
            ],
          },
        },
        hired: {
          $sum: {
            $cond: [
              {
                $eq: ["$stage", "HIRED"],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    {
      $sort: {
        applications: -1,
        _id: 1,
      },
    },
  ]);

  return (rows as AnyDoc[]).map((row) => {
    const applications = Number(row.applications ?? 0);

    const hired = Number(row.hired ?? 0);

    const accepted = Number(row.accepted ?? 0);

    return {
      source: String(row._id ?? "Unknown"),
      applications,
      screening: Number(row.screening ?? 0),
      interviews: Number(row.interviews ?? 0),
      offers: Number(row.offers ?? 0),
      accepted,
      hired,
      hireConversionRate:
        applications > 0
          ? Number(((hired / applications) * 100).toFixed(1))
          : 0,
      acceptanceRate:
        applications > 0
          ? Number(((accepted / applications) * 100).toFixed(1))
          : 0,
    };
  });
}

// ===========================================================================
// REFERRAL ANALYTICS
// Uses the existing Candidate.source field. Candidates with source "Referral"
// are tracked without requiring a database schema migration.
// ===========================================================================

export async function getReferralAnalytics() {
  const [totalReferrals, inPipeline, interviewed, offers, accepted, hired] =
    await Promise.all([
      Candidate.countDocuments({
        source: {
          $regex: /^referral$/i,
        },
      }),

      Candidate.countDocuments({
        source: {
          $regex: /^referral$/i,
        },
        stage: {
          $in: ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"],
        },
      }),

      Candidate.countDocuments({
        source: {
          $regex: /^referral$/i,
        },
        stage: {
          $in: ["INTERVIEW", "OFFER", "HIRED"],
        },
      }),

      Candidate.countDocuments({
        source: {
          $regex: /^referral$/i,
        },
        stage: {
          $in: ["OFFER", "HIRED"],
        },
      }),

      Candidate.countDocuments({
        source: {
          $regex: /^referral$/i,
        },
        "offer.status": "ACCEPTED",
      }),

      Candidate.countDocuments({
        source: {
          $regex: /^referral$/i,
        },
        stage: "HIRED",
      }),
    ]);

  return {
    totalReferrals,
    inPipeline,
    interviewed,
    offers,
    accepted,
    hired,
    conversionRate:
      totalReferrals > 0
        ? Number(((hired / totalReferrals) * 100).toFixed(1))
        : 0,
  };
}

// ===========================================================================
// WALK-IN AND CAMPUS RECRUITMENT ANALYTICS
// ===========================================================================

export async function getVolumeHiringAnalytics() {
  const [walkIn, campus] = await Promise.all([
    Candidate.aggregate([
      {
        $match: {
          source: {
            $regex: /^walk-in$/i,
          },
        },
      },
      {
        $group: {
          _id: null,
          applications: {
            $sum: 1,
          },
          screening: {
            $sum: {
              $cond: [
                {
                  $in: ["$stage", ["SCREENING", "INTERVIEW", "OFFER", "HIRED"]],
                },
                1,
                0,
              ],
            },
          },
          interviewed: {
            $sum: {
              $cond: [
                {
                  $in: ["$stage", ["INTERVIEW", "OFFER", "HIRED"]],
                },
                1,
                0,
              ],
            },
          },
          hired: {
            $sum: {
              $cond: [
                {
                  $eq: ["$stage", "HIRED"],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),

    Candidate.aggregate([
      {
        $match: {
          source: {
            $regex: /^campus$/i,
          },
        },
      },
      {
        $group: {
          _id: null,
          applications: {
            $sum: 1,
          },
          screening: {
            $sum: {
              $cond: [
                {
                  $in: ["$stage", ["SCREENING", "INTERVIEW", "OFFER", "HIRED"]],
                },
                1,
                0,
              ],
            },
          },
          interviewed: {
            $sum: {
              $cond: [
                {
                  $in: ["$stage", ["INTERVIEW", "OFFER", "HIRED"]],
                },
                1,
                0,
              ],
            },
          },
          hired: {
            $sum: {
              $cond: [
                {
                  $eq: ["$stage", "HIRED"],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const normalize = (rows: AnyDoc[], source: string) => {
    const row = rows[0] ?? {};

    const applications = Number(row.applications ?? 0);

    const hired = Number(row.hired ?? 0);

    return {
      source,
      applications,
      screening: Number(row.screening ?? 0),
      interviewed: Number(row.interviewed ?? 0),
      hired,
      conversionRate:
        applications > 0
          ? Number(((hired / applications) * 100).toFixed(1))
          : 0,
    };
  };

  return {
    walkIn: normalize(walkIn as AnyDoc[], "Walk-in"),
    campus: normalize(campus as AnyDoc[], "Campus"),
  };
}
