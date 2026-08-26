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
  return { id: _id, ...rest };
}

export async function listJobPostings(status?: string, requisitionStatus?: string) {
  const query: Record<string, any> = {};
  if (status) query.status = status;
  if (requisitionStatus) query.requisitionStatus = requisitionStatus;
  const rows: AnyDoc[] = (await JobPosting.find(query).sort({ requestedAt: -1 }).lean()) as AnyDoc[];
  if (!rows.length) return [];
  const departmentIds = [...new Set(rows.map((r: AnyDoc) => r.departmentId))];
  const designationIds = [...new Set(rows.map((r: AnyDoc) => r.designationId))];
  const jobIds = rows.map((r: AnyDoc) => r._id);
  const [departments, designations, candidateCounts] = await Promise.all([
    Department.find({ _id: { $in: departmentIds } }).lean(),
    Designation.find({ _id: { $in: designationIds } }).lean(),
    Candidate.aggregate([{ $match: { jobPostingId: { $in: jobIds } } }, { $group: { _id: "$jobPostingId", count: { $sum: 1 } } }]),
  ]);
  const deptMap = new Map((departments as AnyDoc[]).map((d: AnyDoc) => [d._id, d]));
  const desMap = new Map((designations as AnyDoc[]).map((d: AnyDoc) => [d._id, d]));
  const countMap = new Map((candidateCounts as AnyDoc[]).map((c: AnyDoc) => [c._id, c.count]));
  return rows.map((r: AnyDoc) => ({ id: r._id, ...r, departmentName: deptMap.get(r.departmentId)?.name ?? null, designationTitle: desMap.get(r.designationId)?.title ?? null, candidateCount: countMap.get(r._id) ?? 0 }));
}

export async function getJobPosting(id: string) {
  const row = await JobPosting.findById(id).lean();
  if (!row) return undefined;
  const [department, designation] = await Promise.all([Department.findById(row.departmentId).lean(), Designation.findById(row.designationId).lean()]);
  return { id: row._id, ...row, departmentName: department?.name ?? null, designationTitle: designation?.title ?? null };
}

export interface CreateJobInput {
  title: string; departmentId: string; designationId: string; location?: string; employmentType?: string;
  experienceMin?: number; experienceMax?: number; description: string; openings?: number; headcount?: number;
  budgetCtc?: number; approvalLevelRequired?: number; postingChannels?: string[]; screeningQuestions?: string[];
  hiringMode?: "STANDARD" | "WALK_IN" | "CAMPUS"; skills?: string[]; requestedById: string;
}

export async function createJobPosting(input: CreateJobInput) {
  const now = nowIso();
  const level = Math.max(1, input.approvalLevelRequired ?? 1);
  const approvers: AnyDoc[] = (await User.find({ role: { $in: ["SUPER_ADMIN", "HR_ADMIN"] }, isActive: true }).select("_id role").lean()) as AnyDoc[];
  const approvalSteps = approvers.slice(0, level).map((u, i) => ({ approverId: u._id, level: i + 1, status: "PENDING", actedAt: null, comment: null }));
  const doc = await JobPosting.create({
    title: input.title, departmentId: input.departmentId, designationId: input.designationId,
    location: input.location ?? "Bengaluru, India", employmentType: input.employmentType ?? "FULL_TIME",
    experienceMin: input.experienceMin ?? 0, experienceMax: input.experienceMax ?? 5, description: input.description,
    status: "ON_HOLD", openings: input.openings ?? input.headcount ?? 1, postedAt: now, requestedAt: now,
    requestedById: input.requestedById, requisitionStatus: "PENDING_APPROVAL", headcount: input.headcount ?? input.openings ?? 1,
    budgetCtc: input.budgetCtc ?? null, approvalLevelRequired: level, approvalSteps,
    postingChannels: input.postingChannels ?? ["CAREERS"], screeningQuestions: input.screeningQuestions ?? [],
    hiringMode: input.hiringMode ?? "STANDARD", skills: input.skills ?? [],
  });
  return getJobPosting(doc._id);
}

export async function approveJob(id: string, approverId: string, comment?: string) {
  const job = await JobPosting.findById(id);
  if (!job) return undefined;
  const next = (job.approvalSteps as AnyDoc[]).find((s: AnyDoc) => s.status === "PENDING" && s.approverId === approverId);
  if (!next) throw new Error("You are not the current approver for this requisition.");
  next.status = "APPROVED"; next.actedAt = nowIso(); next.comment = comment ?? null;
  const allApproved = (job.approvalSteps as AnyDoc[]).every((s: AnyDoc) => s.status === "APPROVED");
  job.requisitionStatus = allApproved ? "APPROVED" : "PENDING_APPROVAL";
  if (allApproved) { job.status = "OPEN"; job.approvedById = approverId; job.approvedAt = nowIso(); }
  await job.save();
  return getJobPosting(id);
}

export async function rejectJob(id: string, approverId: string, reason: string) {
  const job = await JobPosting.findById(id);
  if (!job) return undefined;
  const next = (job.approvalSteps as AnyDoc[]).find((s: AnyDoc) => s.status === "PENDING" && s.approverId === approverId);
  if (!next) throw new Error("You are not the current approver for this requisition.");
  next.status = "REJECTED"; next.actedAt = nowIso(); next.comment = reason;
  job.requisitionStatus = "REJECTED"; job.status = "CLOSED"; job.rejectionReason = reason;
  await job.save();
  return getJobPosting(id);
}

export async function updateJobStatus(id: string, status: string) {
  await JobPosting.updateOne({ _id: id }, { $set: { status } });
  return getJobPosting(id);
}

export async function listCandidates(jobPostingId?: string) {
  const query = jobPostingId ? { jobPostingId } : {};
  const rows: AnyDoc[] = (await Candidate.find(query).sort({ appliedAt: -1 }).lean()) as AnyDoc[];
  if (!rows.length) return [];
  const jobIds = [...new Set(rows.map((r: AnyDoc) => r.jobPostingId))];
  const jobs: AnyDoc[] = (await JobPosting.find({ _id: { $in: jobIds } }).lean()) as AnyDoc[];
  const jobMap = new Map(jobs.map((j: AnyDoc) => [j._id, j]));
  return rows.map((r: AnyDoc) => ({ id: r._id, ...r, jobTitle: jobMap.get(r.jobPostingId)?.title ?? null }));
}

export async function getCandidate(id: string) {
  const row = await Candidate.findById(id).lean();
  if (!row) return undefined;
  const job = await JobPosting.findById(row.jobPostingId).lean();
  return { id: row._id, ...row, jobTitle: job?.title ?? null };
}

export interface CreateCandidateInput {
  jobPostingId: string; firstName: string; lastName: string; email: string; phone?: string; expectedCtc?: number;
  source?: string; referredById?: string; notes?: string; resumeText?: string;
}

export async function createCandidate(input: CreateCandidateInput) {
  const duplicate = await Candidate.findOne({ jobPostingId: input.jobPostingId, email: input.email.toLowerCase().trim() }).lean();
  if (duplicate) throw new Error("A candidate with this email already applied for this job.");
  const doc = await Candidate.create({ jobPostingId: input.jobPostingId, firstName: input.firstName, lastName: input.lastName, email: input.email.toLowerCase().trim(), phone: input.phone ?? null, expectedCtc: input.expectedCtc ?? null, source: input.source ?? "CAREERS", referredById: input.referredById ?? null, referralBonusStatus: input.referredById ? "PENDING" : "NOT_APPLICABLE", notes: input.notes ?? null, resumeText: input.resumeText ?? null, stage: "APPLIED", appliedAt: nowIso() });
  return getCandidate(doc._id);
}

export async function moveCandidateStage(id: string, stage: string) {
  await Candidate.updateOne({ _id: id }, { $set: { stage } });
  return getCandidate(id);
}

export async function rateCandidate(id: string, rating: number) {
  await Candidate.updateOne({ _id: id }, { $set: { rating } });
  return getCandidate(id);
}

function normalizeTokens(text: string) {
  return new Set(text.toLowerCase().split(/[^a-z0-9+#.]+/).filter((x: string) => x.length > 1));
}

export async function screenCandidate(id: string, resumeText?: string) {
  const candidate = await Candidate.findById(id);
  if (!candidate) return undefined;
  if (resumeText !== undefined) candidate.resumeText = resumeText;
  const job = await JobPosting.findById(candidate.jobPostingId);
  if (!job) throw new Error("Job posting not found.");
  const jobTokens = normalizeTokens(`${job.title} ${job.description} ${job.skills.join(" ")}`);
  const resumeTokens = normalizeTokens(candidate.resumeText ?? "");
  const matched = [...jobTokens].filter((x: string) => resumeTokens.has(x));
  const score = jobTokens.size ? Math.min(100, Math.round((matched.length / jobTokens.size) * 100)) : 0;
  candidate.extractedSkills = [...new Set(matched.filter((x) => job.skills.map((s: string) => s.toLowerCase()).includes(x)))];
  candidate.jobFitScore = score;
  candidate.screeningSummary = `Automated screening matched ${matched.length} relevant terms. Fit score: ${score}%. Human review is required before rejection.`;
  if (candidate.stage === "APPLIED") candidate.stage = "SCREENING";
  await candidate.save();
  return getCandidate(id);
}

export async function setResume(id: string, resumeUrl: string) {
  await Candidate.updateOne({ _id: id }, { $set: { resumeUrl } });
  return getCandidate(id);
}

export async function listInterviews(candidateId?: string) {
  const rows: AnyDoc[] = (await Interview.find(candidateId ? { candidateId } : {}).sort({ scheduledAt: 1 }).lean()) as AnyDoc[];
  if (!rows.length) return [];
  const candidateIds = [...new Set(rows.map((r: AnyDoc) => r.candidateId))];
  const interviewerIds = [...new Set(rows.map((r: AnyDoc) => r.interviewerId))];
  const [candidates, interviewers] = await Promise.all([Candidate.find({ _id: { $in: candidateIds } }).lean(), Employee.find({ _id: { $in: interviewerIds } }).lean()]);
  const candidateRows: AnyDoc[] = candidates as AnyDoc[];
  const interviewerRows: AnyDoc[] = interviewers as AnyDoc[];
  const candMap = new Map(candidateRows.map((c: AnyDoc) => [c._id, c]));
  const empMap = new Map(interviewerRows.map((e: AnyDoc) => [e._id, e]));
  return rows.map((r: AnyDoc) => ({ id: r._id, ...r, candidateFirstName: candMap.get(r.candidateId)?.firstName ?? null, candidateLastName: candMap.get(r.candidateId)?.lastName ?? null, interviewerFirstName: empMap.get(r.interviewerId)?.firstName ?? null, interviewerLastName: empMap.get(r.interviewerId)?.lastName ?? null }));
}

export async function scheduleInterview(input: { candidateId: string; interviewerId: string; scheduledAt: string; round?: string; mode?: "VIDEO" | "IN_PERSON" | "PHONE" }) {
  const mode = input.mode ?? "VIDEO";
  const doc = await Interview.create({ candidateId: input.candidateId, interviewerId: input.interviewerId, scheduledAt: input.scheduledAt, round: input.round ?? "Round 1", mode, meetingLink: mode === "VIDEO" ? `https://meet.jit.si/ART-${input.candidateId}-${Date.now()}` : null, scorecard: [] });
  await Candidate.updateOne({ _id: input.candidateId }, { $set: { stage: "INTERVIEW" } });
  return toApiDoc((await Interview.findById(doc._id).lean())!);
}

export async function submitInterviewFeedback(id: string, feedback: string, recommendation: string, scorecard: any[] = []) {
  await Interview.updateOne({ _id: id }, { $set: { feedback, recommendation, scorecard, completed: true } });
  return toApiDoc((await Interview.findById(id).lean())!);
}

export async function generateOffer(id: string, input: { annualCtc: number; joiningDate: string; basic?: number; hra?: number; specialAllowance?: number }) {
  const candidate = await Candidate.findById(id).lean();
  if (!candidate) return undefined;
  const job = await JobPosting.findById(candidate.jobPostingId).lean();
  if (!job) throw new Error("Job posting not found.");
  const now = nowIso();
  const basic = input.basic ?? Math.round(input.annualCtc * 0.4);
  const hra = input.hra ?? Math.round(input.annualCtc * 0.2);
  const specialAllowance = input.specialAllowance ?? Math.max(0, input.annualCtc - basic - hra);
  const uploads = path.join(process.cwd(), "uploads");
  fs.mkdirSync(uploads, { recursive: true });
  const filename = `offer-${candidate._id}-${Date.now()}.html`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Offer Letter</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;line-height:1.6}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:10px;text-align:left}</style></head><body><h1>Employment Offer</h1><p>Dear ${candidate.firstName} ${candidate.lastName},</p><p>We are pleased to offer you the position of <b>${job.title}</b>.</p><h3>Compensation</h3><table><tr><th>Component</th><th>Annual Amount</th></tr><tr><td>Basic</td><td>₹${basic.toLocaleString("en-IN")}</td></tr><tr><td>HRA</td><td>₹${hra.toLocaleString("en-IN")}</td></tr><tr><td>Special Allowance</td><td>₹${specialAllowance.toLocaleString("en-IN")}</td></tr><tr><th>Total CTC</th><th>₹${input.annualCtc.toLocaleString("en-IN")}</th></tr></table><p>Proposed joining date: <b>${input.joiningDate}</b></p><p>This is a digitally generated offer document from SmartHR Pro.</p></body></html>`;
  fs.writeFileSync(path.join(uploads, filename), html, "utf8");
  await Candidate.updateOne({ _id: id }, { $set: { stage: "OFFER", offer: { status: "SENT", offerUrl: `/uploads/${filename}`, annualCtc: input.annualCtc, basic, hra, specialAllowance, joiningDate: input.joiningDate, generatedAt: now, respondedAt: null } } });
  return getCandidate(id);
}

export async function respondToOffer(
  id: string,
  status: "ACCEPTED" | "DECLINED",
) {
  const candidate = await Candidate.findById(id);

  if (!candidate) return undefined;

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

  if (!candidate) return undefined;

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
    input.provider ??
    candidate.backgroundVerification.provider;

  candidate.backgroundVerification.reference =
    input.reference ??
    candidate.backgroundVerification.reference;

  candidate.backgroundVerification.notes =
    input.notes ??
    candidate.backgroundVerification.notes;

  if (input.status === "IN_PROGRESS") {
    candidate.backgroundVerification.startedAt =
      candidate.backgroundVerification.startedAt ?? now;
  }

  if (
    input.status === "VERIFIED" ||
    input.status === "FAILED"
  ) {
    candidate.backgroundVerification.completedAt = now;
  }

  await candidate.save();

  return getCandidate(id);
}

export async function addPreboardingDocument(
  id: string,
  type: string,
  url: string,
) {
  const candidate = await Candidate.findById(id);

  if (!candidate) return undefined;

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

export async function verifyPreboardingDocument(
  id: string,
  index: number,
) {
  const candidate = await Candidate.findById(id);

  if (!candidate) return undefined;

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
      (d: AnyDoc) => d.verified,
    )
  ) {
    candidate.preboarding.status = "COMPLETED";
    candidate.preboarding.completedAt = nowIso();
  }

  await candidate.save();

  return getCandidate(id);
}

export async function hireCandidate(
  id: string,
  role = "EMPLOYEE",
) {
  const candidate = await Candidate.findById(id);

  if (!candidate) return undefined;

  if (!candidate.offer) {
    throw new Error("Offer has not been generated.");
  }

  if (candidate.offer.status !== "ACCEPTED") {
    throw new Error(
      "Candidate must accept the offer before joining.",
    );
  }

  if (!candidate.backgroundVerification) {
    throw new Error(
      "Background verification must be completed before joining.",
    );
  }

  if (
    candidate.backgroundVerification.status !== "VERIFIED"
  ) {
    throw new Error(
      "Background verification must be VERIFIED before joining.",
    );
  }

  if (!candidate.preboarding) {
    throw new Error(
      "Pre-boarding must be completed before joining.",
    );
  }

  if (candidate.preboarding.status !== "COMPLETED") {
    throw new Error(
      "Pre-boarding documents must be completed before joining.",
    );
  }

  if (candidate.hiredEmployeeId) {
    return getCandidate(id);
  }

  const job = await JobPosting.findById(
    candidate.jobPostingId,
  );

  if (!job) {
    throw new Error("Job posting not found.");
  }

  const existing = await User.findOne({
    email: candidate.email.toLowerCase(),
  }).lean();

  if (existing) {
    throw new Error(
      "A user already exists with the candidate email.",
    );
  }

  const designation = await Designation.findById(
    job.designationId,
  ).lean();

  const department = await Department.findById(
    job.departmentId,
  ).lean();

  const now = nowIso();

  const tempPassword = `ART@${Math.random()
    .toString(36)
    .slice(2, 10)}1!`;

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

    dateOfJoining:
      candidate.offer.joiningDate ?? now,

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

export async function getPipelineSummary() {
  const rows = await Candidate.aggregate([
    {
      $group: {
        _id: "$stage",
        count: { $sum: 1 },
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