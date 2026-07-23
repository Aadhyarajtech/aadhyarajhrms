import { JobPosting, Candidate, Interview, Department, Designation, Employee } from "@/db/models";
import { nowIso } from "@/db/connection";

function toApiDoc(doc: any) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export async function listJobPostings(status?: string) {
  const query = status ? { status } : {};
  const rows = await JobPosting.find(query).sort({ postedAt: -1 }).lean();
  if (rows.length === 0) return [];

  const departmentIds = [...new Set(rows.map((r) => r.departmentId))];
  const designationIds = [...new Set(rows.map((r) => r.designationId))];
  const jobIds = rows.map((r) => r._id);
  const [departments, designations, candidateCounts] = await Promise.all([
    Department.find({ _id: { $in: departmentIds } }).lean(),
    Designation.find({ _id: { $in: designationIds } }).lean(),
    Candidate.aggregate([{ $match: { jobPostingId: { $in: jobIds } } }, { $group: { _id: "$jobPostingId", count: { $sum: 1 } } }]),
  ]);
  const deptMap = new Map(departments.map((d) => [d._id, d]));
  const desMap = new Map(designations.map((d) => [d._id, d]));
  const countMap = new Map(candidateCounts.map((c) => [c._id, c.count]));

  return rows.map((r) => ({
    id: r._id,
    ...r,
    departmentName: deptMap.get(r.departmentId)?.name ?? null,
    designationTitle: desMap.get(r.designationId)?.title ?? null,
    candidateCount: countMap.get(r._id) ?? 0,
  }));
}

export async function getJobPosting(id: string) {
  const row = await JobPosting.findById(id).lean();
  if (!row) return undefined;
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
  description: string;
  openings?: number;
}

export async function createJobPosting(input: CreateJobInput) {
  const doc = await JobPosting.create({
    title: input.title,
    departmentId: input.departmentId,
    designationId: input.designationId,
    location: input.location ?? "Bengaluru, India",
    employmentType: (input.employmentType as any) ?? "FULL_TIME",
    experienceMin: input.experienceMin ?? 0,
    experienceMax: input.experienceMax ?? 5,
    description: input.description,
    status: "OPEN",
    openings: input.openings ?? 1,
    postedAt: nowIso(),
  });
  return getJobPosting(doc._id);
}

export async function updateJobStatus(id: string, status: string) {
  await JobPosting.updateOne({ _id: id }, { $set: { status } });
  return getJobPosting(id);
}

export async function listCandidates(jobPostingId?: string) {
  const query = jobPostingId ? { jobPostingId } : {};
  const rows = await Candidate.find(query).sort({ appliedAt: -1 }).lean();
  if (rows.length === 0) return [];
  const jobIds = [...new Set(rows.map((r) => r.jobPostingId))];
  const jobs = await JobPosting.find({ _id: { $in: jobIds } }).lean();
  const jobMap = new Map(jobs.map((j) => [j._id, j]));
  return rows.map((r) => ({ id: r._id, ...r, jobTitle: jobMap.get(r.jobPostingId)?.title ?? null }));
}

export async function getCandidate(id: string) {
  const row = await Candidate.findById(id).lean();
  if (!row) return undefined;
  const job = await JobPosting.findById(row.jobPostingId).lean();
  return { id: row._id, ...row, jobTitle: job?.title ?? null };
}

export interface CreateCandidateInput {
  jobPostingId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  expectedCtc?: number;
  source?: string;
  notes?: string;
}

export async function createCandidate(input: CreateCandidateInput) {
  const doc = await Candidate.create({
    jobPostingId: input.jobPostingId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone ?? null,
    expectedCtc: input.expectedCtc ?? null,
    source: input.source ?? "Career Site",
    notes: input.notes ?? null,
    stage: "APPLIED",
    appliedAt: nowIso(),
  });
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

export async function listInterviews(candidateId?: string) {
  const query = candidateId ? { candidateId } : {};
  const rows = await Interview.find(query).sort({ scheduledAt: 1 }).lean();
  if (rows.length === 0) return [];

  const candidateIds = [...new Set(rows.map((r) => r.candidateId))];
  const interviewerIds = [...new Set(rows.map((r) => r.interviewerId))];
  const [candidates, interviewers] = await Promise.all([
    Candidate.find({ _id: { $in: candidateIds } }).lean(),
    Employee.find({ _id: { $in: interviewerIds } }).lean(),
  ]);
  const candMap = new Map(candidates.map((c) => [c._id, c]));
  const empMap = new Map(interviewers.map((e) => [e._id, e]));

  return rows.map((r) => {
    const candidate = candMap.get(r.candidateId);
    const interviewer = empMap.get(r.interviewerId);
    return {
      id: r._id,
      ...r,
      candidateFirstName: candidate?.firstName ?? null,
      candidateLastName: candidate?.lastName ?? null,
      interviewerFirstName: interviewer?.firstName ?? null,
      interviewerLastName: interviewer?.lastName ?? null,
    };
  });
}

export async function scheduleInterview(input: {
  candidateId: string;
  interviewerId: string;
  scheduledAt: string;
  round?: string;
}) {
  const doc = await Interview.create({
    candidateId: input.candidateId,
    interviewerId: input.interviewerId,
    scheduledAt: input.scheduledAt,
    round: input.round ?? "Round 1",
  });
  return toApiDoc((await Interview.findById(doc._id).lean())!);
}

export async function submitInterviewFeedback(id: string, feedback: string, recommendation: string) {
  await Interview.updateOne({ _id: id }, { $set: { feedback, recommendation, completed: true } });
  return toApiDoc((await Interview.findById(id).lean())!);
}

export async function getPipelineSummary() {
  const rows = await Candidate.aggregate([{ $group: { _id: "$stage", count: { $sum: 1 } } }]);
  return rows.map((r) => ({ stage: r._id, count: r.count }));
}

export async function getOpenRolesCount() {
  return JobPosting.countDocuments({ status: "OPEN" });
}
