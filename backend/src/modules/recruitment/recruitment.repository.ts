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
import { notify } from "@/modules/notifications/notifications.repository";
import { sendRecruitmentEmail } from "@/services/email.service";

type AnyDoc = Record<string, any>;

function toApiDoc(doc: AnyDoc | null | undefined) {
  if (!doc) return undefined;

  const { _id, ...rest } = doc;

  return {
    id: _id,
    ...rest,
  };
}

async function notifyRecruitmentTeam(input: {
  title: string;
  message: string;
  link?: string;
}) {
  const users = await User.find({
    role: { $in: ["SUPER_ADMIN", "HR_ADMIN", "RECRUITER"] },
    isActive: true,
  })
    .select("_id")
    .lean();

  await Promise.all(
    users.map((user) =>
      notify({
        userId: user._id,
        type: "RECRUITMENT",
        title: input.title,
        message: input.message,
        link: input.link,
      }),
    ),
  );
}

async function notifyCandidateEmail(
  candidate: AnyDoc | null | undefined,
  subject: string,
  message: string,
) {
  if (!candidate?.email) return;
  await sendRecruitmentEmail({
    to: candidate.email,
    subject,
    text: message,
  });
}

async function notifyEmployeeUser(
  employeeId: string | null | undefined,
  title: string,
  message: string,
  link?: string,
) {
  if (!employeeId) return;
  const employee = await Employee.findById(employeeId).select("userId").lean();
  if (!employee?.userId) return;
  await notify({
    userId: employee.userId,
    type: "RECRUITMENT",
    title,
    message,
    link,
  });
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
  publishedAt?: string | null;
  closedAt?: string | null;

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

    publishedAt: null,
    closedAt: null,

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

  const createdJob = await getJobPosting(doc._id);
  await notifyRecruitmentTeam({
    title: "New recruitment requisition",
    message: `Requisition "${input.title.trim()}" has been submitted for approval.`,
    link: `/recruitment/jobs/${doc._id}`,
  });
  return createdJob;
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

    const approvedAt = nowIso();
    (job as AnyDoc).requisitionStatus = "APPROVED";
    (job as AnyDoc).status = "OPEN";
    (job as AnyDoc).approvedById = approverId;
    (job as AnyDoc).approvedAt = approvedAt;
    (job as AnyDoc).publishedAt = approvedAt;
    (job as AnyDoc).closedAt = null;

    await job.save();
    await notifyRecruitmentTeam({
      title: "Requisition approved",
      message: `The requisition "${job.title}" is approved and open for recruitment.`,
      link: `/recruitment/jobs/${id}`,
    });
    return getJobPosting(id);
  }

  // Find the next approval step in level order.
  const pendingStep = approvalSteps
    .filter((step: AnyDoc) => step.status === "PENDING")
    .sort(
      (a: AnyDoc, b: AnyDoc) => Number(a.level ?? 0) - Number(b.level ?? 0),
    )[0];

  if (!pendingStep) {
    // The creator may have already approved level 1 during job creation.
    // If every configured approval step is already approved, finalize the
    // requisition here instead of incorrectly leaving it PENDING_APPROVAL.
    const allApproved =
      approvalSteps.length > 0 &&
      approvalSteps.every((step: AnyDoc) => step.status === "APPROVED");

    if (allApproved) {
      const approvedAt = (job as AnyDoc).approvedAt ?? nowIso();

      (job as AnyDoc).requisitionStatus = "APPROVED";
      (job as AnyDoc).status = "OPEN";
      (job as AnyDoc).approvedById = (job as AnyDoc).approvedById ?? approverId;
      (job as AnyDoc).approvedAt = approvedAt;
      (job as AnyDoc).publishedAt = (job as AnyDoc).publishedAt ?? approvedAt;
      (job as AnyDoc).closedAt = null;

      await job.save();
      await notifyRecruitmentTeam({
        title: "Requisition approved",
        message: `The requisition "${job.title}" is approved and open for recruitment.`,
        link: `/recruitment/jobs/${id}`,
      });
    }

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
    const approvedAt = nowIso();
    (job as AnyDoc).requisitionStatus = "APPROVED";
    (job as AnyDoc).status = "OPEN";
    (job as AnyDoc).approvedById = approverId;
    (job as AnyDoc).approvedAt = approvedAt;
    (job as AnyDoc).publishedAt = approvedAt;
    (job as AnyDoc).closedAt = null;
  }

  await job.save();
  if (allApproved) {
    await notifyRecruitmentTeam({
      title: "Requisition approved",
      message: `The requisition "${job.title}" is approved and open for recruitment.`,
      link: `/recruitment/jobs/${id}`,
    });
  }

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

  if (
    !currentPendingStep ||
    String(currentPendingStep.approverId) !== String(approverId)
  ) {
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
  publishedAt?: string | null;
  closedAt?: string | null;
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

  if (input.status === "OPEN" && existing.status !== "OPEN") {
    updates.publishedAt = nowIso();
    updates.closedAt = null;
  }

  if (input.status === "CLOSED" && existing.status !== "CLOSED") {
    updates.closedAt = nowIso();
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

export async function updateJobStatus(
  id: string,
  status: "OPEN" | "ON_HOLD" | "CLOSED",
) {
  const job = await JobPosting.findById(id);
  if (!job) return undefined;

  if (status === "OPEN" && job.requisitionStatus !== "APPROVED") {
    throw new Error("Only an approved requisition can be opened.");
  }

  const updates: Record<string, unknown> = { status };

  if (status === "OPEN" && job.status !== "OPEN") {
    updates.publishedAt = nowIso();
    updates.closedAt = null;
  }

  if (status === "CLOSED" && job.status !== "CLOSED") {
    updates.closedAt = nowIso();
  }

  await JobPosting.updateOne({ _id: id }, { $set: updates });
  await notifyRecruitmentTeam({
    title: `Job ${status.replace("_", " ").toLowerCase()}`,
    message: `Job "${job.title}" status changed to ${status.replace("_", " ")}.`,
    link: `/recruitment/jobs/${id}`,
  });
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

export async function searchCandidates(input: {
  jobPostingId?: string;
  stage?: string;
  finalResult?: string;
  minJobFitScore?: number;
  source?: string;
  query?: string;
}) {
  const query: Record<string, any> = {};

  if (input.jobPostingId) query.jobPostingId = input.jobPostingId;
  if (input.stage) query.stage = input.stage;
  if (input.finalResult) query.finalResult = input.finalResult;
  if (input.source) query.source = input.source;

  if (input.minJobFitScore !== undefined) {
    query.jobFitScore = { $gte: Number(input.minJobFitScore) };
  }

  if (input.query?.trim()) {
    const pattern = input.query.trim();
    query.$or = [
      { firstName: { $regex: pattern, $options: "i" } },
      { lastName: { $regex: pattern, $options: "i" } },
      { email: { $regex: pattern, $options: "i" } },
      { phone: { $regex: pattern, $options: "i" } },
    ];
  }

  const rows = (await Candidate.find(query)
    .sort({ appliedAt: -1 })
    .lean()) as AnyDoc[];

  if (!rows.length) return [];

  const jobIds = [...new Set(rows.map((row: AnyDoc) => row.jobPostingId))];
  const jobs = (await JobPosting.find({
    _id: { $in: jobIds },
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
  applicationAnswers?: Record<string, string>;
}

export async function createCandidate(input: CreateCandidateInput) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const normalizedEmail = input.email.toLowerCase().trim();

  if (!firstName || !lastName) {
    throw new Error("Candidate first name and last name are required.");
  }

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("A valid candidate email is required.");
  }

  const job = await JobPosting.findById(input.jobPostingId).lean();
  if (!job) throw new Error("Job posting not found.");

  if (job.requisitionStatus !== "APPROVED" || job.status !== "OPEN") {
    throw new Error("Applications are only accepted for open, approved jobs.");
  }

  const duplicate = await Candidate.findOne({
    jobPostingId: input.jobPostingId,
    email: normalizedEmail,
  }).lean();

  if (duplicate) {
    throw new Error(
      "A candidate with this email already applied for this job.",
    );
  }

  const doc = await Candidate.create({
    jobPostingId: input.jobPostingId,

    firstName,

    lastName,

    email: input.email.toLowerCase().trim(),

    phone: input.phone ?? null,

    expectedCtc: input.expectedCtc ?? null,

    applicationAnswers: input.applicationAnswers ?? {},

    duplicateStatus: "UNIQUE",
    duplicateOfCandidateId: null,
    spamFlag: false,
    spamReason: null,

    source: input.source ?? "CAREERS",

    referredById: input.referredById ?? null,

    referralBonusStatus: input.referredById ? "PENDING" : "NOT_APPLICABLE",

    notes: input.notes ?? null,

    resumeText: input.resumeText?.trim() || null,
    resumeParsingStatus: input.resumeText?.trim() ? "PARSED" : "NOT_PARSED",
    resumeParsedAt: input.resumeText?.trim() ? nowIso() : null,
    resumeParsingError: null,

    stage: "APPLIED",

    appliedAt: nowIso(),
  });

  const createdCandidate = await getCandidate(doc._id);
  await notifyRecruitmentTeam({
    title: "New candidate application",
    message: `${firstName} ${lastName} applied for ${job.title}.`,
    link: `/recruitment/candidates/${doc._id}`,
  });
  await notifyCandidateEmail(
    createdCandidate,
    `Application received - ${job.title}`,
    `Dear ${firstName} ${lastName},\n\nYour application for ${job.title} has been received successfully. We will contact you as your application progresses.\n\nThank you,\nAadhyaRaj HRMS`,
  );
  return createdCandidate;
}

export async function moveCandidateStage(id: string, stage: string) {
  const allowedStages = [
    "APPLIED",
    "SCREENING",
    "INTERVIEW",
    "OFFER",
    "HIRED",
    "REJECTED",
  ];
  if (!allowedStages.includes(stage)) {
    throw new Error(`Invalid candidate stage: ${stage}.`);
  }

  const candidate = await Candidate.findById(id);
  if (!candidate) return undefined;

  if (candidate.stage === "HIRED" && stage !== "HIRED") {
    throw new Error("A hired candidate cannot move backwards in the pipeline.");
  }
  if (candidate.stage === "REJECTED" && stage !== "REJECTED") {
    throw new Error(
      "A rejected candidate cannot be moved back into the pipeline.",
    );
  }

  if (stage === "OFFER" && candidate.finalResult !== "SELECTED") {
    const completedInterview = await Interview.exists({
      candidateId: id,
      completed: true,
      recommendation: { $not: /^reject/i },
    });

    if (!completedInterview) {
      throw new Error(
        "Complete at least one interview before moving the candidate to the offer stage.",
      );
    }

    // Moving a candidate to OFFER from the pipeline is the selection action.
    // Keep the candidate marked as SELECTED so offer generation can proceed.
    candidate.finalResult = "SELECTED";
  }

  if (stage === "HIRED") {
    throw new Error(
      "Use the hiring action after offer acceptance, background verification and pre-boarding are complete.",
    );
  }

  const finalResult =
    stage === "OFFER" || stage === "HIRED"
      ? "SELECTED"
      : stage === "REJECTED"
        ? "REJECTED"
        : "PENDING";

  await Candidate.updateOne(
    {
      _id: id,
    },
    {
      $set: {
        stage,
        finalResult,
      },
    },
  );
  return getCandidate(id);
}

export async function selectCandidate(id: string) {
  const candidate = await Candidate.findById(id);
  if (!candidate) return undefined;

  if (candidate.stage === "REJECTED") {
    throw new Error("A rejected candidate cannot be selected.");
  }
  if (candidate.stage === "HIRED") {
    throw new Error("The candidate is already hired.");
  }

  const completedInterview = await Interview.exists({
    candidateId: id,
    completed: true,
    recommendation: { $not: /^reject/i },
  });

  if (!completedInterview) {
    throw new Error(
      "Complete at least one interview before selecting the candidate.",
    );
  }

  candidate.finalResult = "SELECTED";
  candidate.stage = "OFFER";
  await candidate.save();

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
  applicationAnswers?: Record<string, string>;
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

  if (input.applicationAnswers !== undefined) {
    candidate.applicationAnswers = input.applicationAnswers;
  }

  await candidate.save();

  return getCandidate(id);
}

export async function setCandidateResume(
  id: string,
  input: {
    resumeUrl?: string | null;
    resumeText?: string | null;
  },
) {
  const candidate = await Candidate.findById(id);

  if (!candidate) return undefined;

  if (input.resumeUrl !== undefined) {
    candidate.resumeUrl = input.resumeUrl;

    // A newly uploaded file must be parsed again.
    if (input.resumeUrl) {
      (candidate as AnyDoc).resumeParsingStatus = "NOT_PARSED";
      (candidate as AnyDoc).resumeParsingError = null;
      (candidate as AnyDoc).resumeParsedAt = null;
      (candidate as AnyDoc).extractedSkills = [];
      (candidate as AnyDoc).extractedExperience = [];
      (candidate as AnyDoc).extractedEducation = [];
    }
  }

  if (input.resumeText !== undefined) {
    candidate.resumeText = input.resumeText;
    (candidate as AnyDoc).resumeParsingStatus = input.resumeText?.trim()
      ? "PARSED"
      : "NOT_PARSED";
    (candidate as AnyDoc).resumeParsedAt = input.resumeText?.trim()
      ? nowIso()
      : null;
  }

  await candidate.save();

  return getCandidate(id);
}

export async function updateParsedResume(
  id: string,
  input: {
    resumeText?: string | null;
    extractedSkills?: string[];
    extractedExperience?: number | null;
    extractedEducation?: string[];
  },
) {
  const candidate = await Candidate.findById(id);
  if (!candidate) return undefined;

  const candidateDoc = candidate as AnyDoc;

  if (input.resumeText !== undefined) {
    candidateDoc.resumeText = input.resumeText?.trim() || null;
  }

  if (input.extractedSkills !== undefined) {
    candidateDoc.extractedSkills = uniqueStrings(input.extractedSkills);
  }

  // resumeParser currently returns a numeric total-years value, while the
  // Candidate model stores structured experience entries. Preserve the
  // parser result in the model's structured shape.
  if (input.extractedExperience !== undefined) {
    const years = input.extractedExperience;
    candidateDoc.extractedExperience =
      years !== null && Number.isFinite(Number(years))
        ? [
            {
              company: null,
              position: null,
              startDate: null,
              endDate: null,
              description: `${Number(years)} years of experience`,
            },
          ]
        : [];
  }

  if (input.extractedEducation !== undefined) {
    candidateDoc.extractedEducation = (input.extractedEducation ?? [])
      .map((value) => String(value).trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((degree) => ({
        degree,
        institution: null,
        fieldOfStudy: null,
        startDate: null,
        endDate: null,
        grade: null,
      }));
  }

  candidateDoc.resumeParsingStatus = "PARSED";
  candidateDoc.resumeParsedAt = nowIso();
  candidateDoc.resumeParsingError = null;

  await candidate.save();
  return getCandidate(id);
}

export async function updateResumeParsingStatus(
  id: string,
  input: {
    status: "NOT_PARSED" | "PARSING" | "PARSED" | "FAILED";
    resumeText?: string | null;
    error?: string | null;
  },
) {
  const candidate = await Candidate.findById(id);
  if (!candidate) return undefined;

  const now = nowIso();
  (candidate as AnyDoc).resumeParsingStatus = input.status;

  if (input.resumeText !== undefined) {
    (candidate as AnyDoc).resumeText = input.resumeText?.trim() || null;
  }

  if (input.status === "PARSED") {
    (candidate as AnyDoc).resumeParsedAt = now;
    (candidate as AnyDoc).resumeParsingError = null;
  } else if (input.status === "FAILED") {
    (candidate as AnyDoc).resumeParsingError =
      input.error?.trim() || "Resume parsing failed.";
  } else if (input.status === "PARSING") {
    (candidate as AnyDoc).resumeParsingError = null;
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

const SCREENING_SKILL_ALIASES: Record<string, string[]> = {
  mern: ["MongoDB", "Express", "React", "Node.js"],
  "mern stack": ["MongoDB", "Express", "React", "Node.js"],
  mean: ["MongoDB", "Express", "Angular", "Node.js"],
  "mean stack": ["MongoDB", "Express", "Angular", "Node.js"],
  "full stack": ["React", "Node.js", "Express", "MongoDB"],
  "full stack developer": ["React", "Node.js", "Express", "MongoDB"],
  "frontend developer": ["HTML", "CSS", "JavaScript", "React"],
  "front end developer": ["HTML", "CSS", "JavaScript", "React"],
  "backend developer": ["Node.js", "Express", "REST API", "SQL"],
  "back end developer": ["Node.js", "Express", "REST API", "SQL"],
  "data engineer": ["Python", "SQL"],
  "devops engineer": ["Linux", "Docker", "Kubernetes", "Jenkins", "Terraform"],
};

function normalizeSkillText(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/node\s*js/g, "node.js")
    .replace(/react\s*js/g, "react")
    .replace(/next\s*js/g, "next.js")
    .replace(/express\s*js/g, "express")
    .replace(/mongo\s*db/g, "mongodb")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

function screeningSkillVariants(skill: string) {
  const normalized = skill.trim().toLowerCase();
  const directAliases = SCREENING_SKILL_ALIASES[normalized] ?? [];

  const variants = new Set<string>([skill]);
  directAliases.forEach((alias) => variants.add(alias));

  return [...variants];
}

export async function screenCandidate(id: string, resumeText?: string) {
  const candidate = await Candidate.findById(id);
  if (!candidate) return undefined;

  if (typeof resumeText === "string" && resumeText.trim()) {
    candidate.resumeText = resumeText.trim();
    (candidate as AnyDoc).resumeParsingStatus = "PARSED";
    (candidate as AnyDoc).resumeParsedAt = nowIso();
    (candidate as AnyDoc).resumeParsingError = null;
  }

  const job = await JobPosting.findById(candidate.jobPostingId);
  if (!job) throw new Error("Job posting not found.");

  const extractedSkills = uniqueStrings(
    ((candidate as AnyDoc).extractedSkills ?? []).map((skill: string) =>
      String(skill),
    ),
  );

  const screeningText = String(
    candidate.resumeText?.trim() ||
      [
        candidate.firstName,
        candidate.lastName,
        candidate.email,
        candidate.phone ?? "",
        candidate.notes ?? "",
      ]
        .filter(Boolean)
        .join(" "),
  );

  const normalizedResume = normalizeSkillText(screeningText);

  const skillMatchesResume = (skill: string) => {
    const variants = screeningSkillVariants(skill);

    return variants.some((variant) => {
      const normalizedSkill = normalizeSkillText(variant);
      if (!normalizedSkill) return false;

      // Prefer parser-extracted skills when available. This makes matching
      // robust to common resume formatting variations.
      if (
        extractedSkills.some(
          (extractedSkill) =>
            normalizeSkillText(extractedSkill) === normalizedSkill,
        )
      ) {
        return true;
      }

      if (normalizedResume.includes(normalizedSkill)) return true;

      const skillTokens = normalizedSkill.split(/\s+/).filter(Boolean);
      const resumeTokens = new Set(
        normalizedResume.split(/\s+/).filter((value) => value.length > 1),
      );

      return skillTokens.every((token) => resumeTokens.has(token));
    });
  };

  const explicitJobSkills = uniqueStrings(
    (job.skills ?? []).map((skill: string) => String(skill)),
  );

  // Generic role templates may contain broad engineering skills. When the
  // job title identifies a concrete technology stack, evaluate that stack
  // instead of scoring only against generic template labels.
  const roleText = `${job.title ?? ""} ${
    (job as AnyDoc).designationTitle ?? ""
  }`.toLowerCase();

  const inferredRoleSkills = Object.entries(SCREENING_SKILL_ALIASES)
    .filter(([role]) => roleText.includes(role))
    .flatMap(([, skills]) => skills);

  const jobSkills = uniqueStrings(
    inferredRoleSkills.length ? inferredRoleSkills : explicitJobSkills,
  );

  const matchedSkills = jobSkills.filter((skill) => skillMatchesResume(skill));

  const missingSkills = jobSkills.filter(
    (skill) => !matchedSkills.includes(skill),
  );

  const score = jobSkills.length
    ? Math.round((matchedSkills.length / jobSkills.length) * 100)
    : 0;

  let autoShortlisted = false;
  let shortlistingResult: "PENDING" | "SHORTLISTED" | "NOT_SHORTLISTED" =
    "PENDING";

  const criteria = (job as AnyDoc).shortlistingCriteria;
  if (criteria?.enabled) {
    const requiredSkills = uniqueStrings(
      (criteria.requiredSkills ?? []).map((skill: string) => String(skill)),
    );
    const matchedRequiredSkills = requiredSkills.filter((skill: string) =>
      skillMatchesResume(skill),
    );

    const scorePassed = score >= Number(criteria.minimumJobFitScore ?? 0);
    const skillsPassed =
      requiredSkills.length === 0 ||
      matchedRequiredSkills.length === requiredSkills.length;
    const structuredExperience = Array.isArray(
      (candidate as AnyDoc).extractedExperience,
    )
      ? (candidate as AnyDoc).extractedExperience
      : [];
    const parsedExperience = structuredExperience.length
      ? Number.parseFloat(
          String(structuredExperience[0]?.description ?? "").match(
            /([0-9]+(?:\.[0-9]+)?)/,
          )?.[1] ?? "0",
        )
      : 0;
    const candidateExperience = Math.max(
      parsedExperience,
      Number((candidate as AnyDoc).experience ?? 0),
    );
    const experiencePassed =
      candidateExperience >= Number(criteria.minimumExperience ?? 0);

    autoShortlisted = scorePassed && skillsPassed && experiencePassed;
    shortlistingResult = autoShortlisted ? "SHORTLISTED" : "NOT_SHORTLISTED";
  }

  candidate.extractedSkills = matchedSkills;
  candidate.jobFitScore = score;
  candidate.screeningSummary =
    `AI-assisted screening completed. Matched ${matchedSkills.length} relevant skills. ` +
    `Fit score: ${score}%. Auto-shortlisting result: ${shortlistingResult}. ` +
    `Missing skills: ${missingSkills.length ? missingSkills.join(", ") : "None"}. ` +
    `Human review is required before rejection.`;
  candidate.autoShortlisted = autoShortlisted;
  candidate.shortlistingResult = shortlistingResult;

  if (candidate.stage === "APPLIED") candidate.stage = "SCREENING";

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
  const candidate = await Candidate.findById(input.candidateId).lean();
  if (!candidate) throw new Error("Candidate not found.");
  if (candidate.finalResult === "REJECTED") {
    throw new Error(
      "A rejected candidate cannot be scheduled for an interview.",
    );
  }

  const interviewer = await Employee.findById(input.interviewerId).lean();
  if (!interviewer) throw new Error("Interviewer not found.");

  if (!input.scheduledAt || Number.isNaN(Date.parse(input.scheduledAt))) {
    throw new Error("A valid interview date and time is required.");
  }

  const mode = input.mode ?? "VIDEO";
  const interviewStart = new Date(input.scheduledAt);
  const interviewEnd = new Date(interviewStart.getTime() + 60 * 60 * 1000);

  const interviewerConflict = await Interview.findOne({
    interviewerId: input.interviewerId,
    completed: { $ne: true },
    scheduledAt: {
      $gte: new Date(interviewStart.getTime() - 60 * 60 * 1000).toISOString(),
      $lt: interviewEnd.toISOString(),
    },
  }).lean();

  if (interviewerConflict) {
    throw new Error(
      "The interviewer already has an interview scheduled around this time.",
    );
  }

  const candidateConflict = await Interview.findOne({
    candidateId: input.candidateId,
    completed: { $ne: true },
    scheduledAt: {
      $gte: new Date(interviewStart.getTime() - 60 * 60 * 1000).toISOString(),
      $lt: interviewEnd.toISOString(),
    },
  }).lean();

  if (candidateConflict) {
    throw new Error(
      "The candidate already has an interview scheduled around this time.",
    );
  }

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

export async function updateInterviewRecording(
  id: string,
  recordingUrl: string | null,
) {
  const interview = await Interview.findById(id);
  if (!interview) return undefined;

  if (recordingUrl !== null && !/^https?:\/\//i.test(recordingUrl.trim())) {
    throw new Error("Recording URL must be a valid HTTP(S) URL.");
  }

  (interview as AnyDoc).recordingUrl = recordingUrl?.trim() || null;
  await interview.save();
  return toApiDoc((await Interview.findById(id).lean())!);
}

export async function submitInterviewFeedback(
  id: string,
  feedback: string,
  recommendation: string,
  scorecard: any[] = [],
) {
  const interview = await Interview.findById(id);
  if (!interview) return undefined;

  if (!feedback.trim()) throw new Error("Interview feedback is required.");
  if (!recommendation.trim())
    throw new Error("Interview recommendation is required.");

  interview.feedback = feedback.trim();
  interview.recommendation = recommendation.trim();
  interview.scorecard = scorecard;
  interview.completed = true;
  await interview.save();

  const candidate = await Candidate.findById(interview.candidateId);
  if (
    candidate &&
    candidate.stage !== "HIRED" &&
    candidate.stage !== "REJECTED"
  ) {
    candidate.stage = "INTERVIEW";
    await candidate.save();
  }

  const updatedInterview = toApiDoc((await Interview.findById(id).lean())!);
  const candidateAfterFeedback = await Candidate.findById(
    interview.candidateId,
  ).lean();
  await notifyRecruitmentTeam({
    title: "Interview feedback submitted",
    message: `Interview feedback was submitted for ${candidateAfterFeedback?.firstName ?? "candidate"} ${candidateAfterFeedback?.lastName ?? ""}.`,
    link: `/recruitment/candidates/${interview.candidateId}`,
  });
  return updatedInterview;
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

  if (candidate.finalResult !== "SELECTED") {
    throw new Error("Select the candidate before generating an offer.");
  }

  if (!Number.isFinite(input.annualCtc) || input.annualCtc <= 0) {
    throw new Error("Annual CTC must be greater than zero.");
  }

  if (!input.joiningDate || Number.isNaN(Date.parse(input.joiningDate))) {
    throw new Error("A valid joining date is required.");
  }

  const now = nowIso();

  const basic = input.basic ?? Math.round(input.annualCtc * 0.4);

  const hra = input.hra ?? Math.round(input.annualCtc * 0.2);

  const specialAllowance =
    input.specialAllowance ?? Math.max(0, input.annualCtc - basic - hra);

  if (basic < 0 || hra < 0 || specialAllowance < 0) {
    throw new Error("Offer salary components cannot be negative.");
  }

  if (
    Math.round(basic + hra + specialAllowance) !== Math.round(input.annualCtc)
  ) {
    throw new Error("Basic, HRA and special allowance must equal annual CTC.");
  }

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

  if (candidate.offer.status !== "SENT") {
    throw new Error("Only a sent offer can receive a response.");
  }

  candidate.offer.status = status;

  candidate.offer.respondedAt = nowIso();

  if (status === "ACCEPTED") {
    candidate.stage = "OFFER";
    candidate.finalResult = "PENDING";
  } else {
    candidate.stage = "REJECTED";
    candidate.finalResult = "REJECTED";
  }

  await candidate.save();

  const updatedCandidate = await getCandidate(id);
  await notifyRecruitmentTeam({
    title: `Offer ${status.toLowerCase()}`,
    message: `${candidate.firstName} ${candidate.lastName} ${status === "ACCEPTED" ? "accepted" : "declined"} the offer.`,
    link: `/recruitment/candidates/${id}`,
  });
  await notifyCandidateEmail(
    updatedCandidate,
    `Offer ${status === "ACCEPTED" ? "accepted" : "declined"}`,
    `Dear ${candidate.firstName} ${candidate.lastName},\n\nYour offer response has been recorded as ${status}.\n\nThank you,\nAadhyaRaj HRMS`,
  );
  return updatedCandidate;
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

  if (candidate.offer?.status !== "ACCEPTED") {
    throw new Error(
      "Background verification can start only after offer acceptance.",
    );
  }

  const allowedStatuses = ["NOT_STARTED", "IN_PROGRESS", "VERIFIED", "FAILED"];
  if (!allowedStatuses.includes(input.status)) {
    throw new Error("Invalid background verification status.");
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

  const updatedCandidate = await getCandidate(id);
  await notifyRecruitmentTeam({
    title: "Background verification updated",
    message: `Background verification for ${candidate.firstName} ${candidate.lastName} is ${input.status}.`,
    link: `/recruitment/candidates/${id}`,
  });
  await notifyCandidateEmail(
    updatedCandidate,
    "Background verification update",
    `Dear ${candidate.firstName} ${candidate.lastName},\n\nYour background verification status is now ${input.status.replace("_", " ")}.\n\nThank you,\nAadhyaRaj HRMS`,
  );
  return updatedCandidate;
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

  if (candidate.offer?.status !== "ACCEPTED") {
    throw new Error("Pre-boarding can start only after offer acceptance.");
  }

  if (candidate.backgroundVerification?.status !== "VERIFIED") {
    throw new Error(
      "Background verification must be VERIFIED before pre-boarding.",
    );
  }

  if (!type.trim() || !url.trim()) {
    throw new Error("Document type and URL are required.");
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

  const hiredCount = await Candidate.countDocuments({
    jobPostingId: candidate.jobPostingId,
    stage: "HIRED",
    _id: { $ne: candidate._id },
  });

  /*
   * Headcount is the approved hiring capacity for the requisition.
   * Prefer the explicit headcount value, while falling back to openings
   * for older requisitions that may not have headcount populated.
   */
  const approvedHeadcount = Math.max(
    1,
    Number(job.headcount ?? job.openings ?? 1),
  );

  if (hiredCount >= approvedHeadcount) {
    throw new Error(
      `Hiring capacity reached: ${hiredCount} of ${approvedHeadcount} approved position(s) for this requisition are already filled.`,
    );
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
  candidate.finalResult = "SELECTED";

  await candidate.save();

  await notifyRecruitmentTeam({
    title: "Candidate hired",
    message: `${candidate.firstName} ${candidate.lastName} has been converted to employee ${employeeCode}.`,
    link: `/employees/${employee._id}`,
  });
  await notifyCandidateEmail(
    candidate,
    "Welcome to AadhyaRaj Technologies",
    `Dear ${candidate.firstName} ${candidate.lastName},\n\nCongratulations. Your recruitment process is complete and your employee account has been created.\nEmployee ID: ${employeeCode}\nJoining date: ${candidate.offer.joiningDate}\n\nPlease use the credentials shared through the secure onboarding process and reset your temporary password at first login.\n\nWelcome to the team!\nAadhyaRaj HRMS`,
  );

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
// REFERRAL BONUS LIFECYCLE
// ===========================================================================

export async function updateReferralBonusStatus(
  id: string,
  status: "NOT_APPLICABLE" | "PENDING" | "APPROVED" | "PAID",
) {
  const candidate = await Candidate.findById(id);
  if (!candidate) return undefined;

  if (!candidate.referredById && status !== "NOT_APPLICABLE") {
    throw new Error(
      "Referral bonus cannot be assigned to a candidate without a referrer.",
    );
  }

  if (status === "PAID" && candidate.stage !== "HIRED") {
    throw new Error(
      "Referral bonus can be marked PAID only after the candidate is hired.",
    );
  }

  if (status === "APPROVED" && !["HIRED", "OFFER"].includes(candidate.stage)) {
    throw new Error(
      "Referral bonus can be approved only after an offer or hiring decision.",
    );
  }

  candidate.referralBonusStatus = status as any;
  await candidate.save();

  await notifyRecruitmentTeam({
    title: "Referral bonus updated",
    message: `Referral bonus for ${candidate.firstName} ${candidate.lastName} is now ${status}.`,
    link: `/recruitment/candidates/${id}`,
  });

  return getCandidate(id);
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

  const rejected = await Candidate.countDocuments({ stage: "REJECTED" });
  const pendingOffer = await Candidate.countDocuments({
    "offer.status": "SENT",
  });

  const hiredCandidates = await Candidate.find({
    stage: "HIRED",
  })
    .select("appliedAt offer.joiningDate")
    .lean();

  const timeToHireDays =
    hiredCandidates.length > 0
      ? Number(
          (
            hiredCandidates.reduce((sum, item: AnyDoc) => {
              const start = Date.parse(item.appliedAt);
              const end = Date.parse(item.offer?.joiningDate ?? item.appliedAt);
              const days =
                Number.isFinite(start) && Number.isFinite(end)
                  ? Math.max(0, (end - start) / 86400000)
                  : 0;
              return sum + days;
            }, 0) / hiredCandidates.length
          ).toFixed(1),
        )
      : 0;

  return {
    applications,
    screening,
    interviews,
    offers,
    accepted,
    hired,
    rejected,
    pendingOffer,
    openRoles,
    offerAcceptanceRate:
      offers > 0 ? Number(((accepted / offers) * 100).toFixed(1)) : 0,
    hireConversionRate:
      applications > 0 ? Number(((hired / applications) * 100).toFixed(1)) : 0,
    timeToHireDays,
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
