import { useEffect, useState, type ReactNode } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Plus,
  Star,
  Calendar,
  ChevronRight,
  Trash2,
  Pencil,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock3,
  Users,
  IndianRupee,
  BriefcaseBusiness,
  Send,
  Building2,
  ShieldCheck,
  FileText,
  UserCheck,
  Sparkles,
  Search,
  Filter,
  SlidersHorizontal,
  Copy,
  AlertTriangle,
} from "lucide-react";

import { RecruitmentApi, EmployeesApi } from "@/lib/endpoints";
import { api, getErrorMessage, resolveAssetUrl } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { TextField, SelectField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/EmptyState";

import { formatDate, formatCurrencyINR, cx } from "@/lib/format";
import type { Candidate } from "@/types";

/* =========================================================
   CANDIDATE PIPELINE
========================================================= */

const STAGES: { key: Candidate["stage"]; label: string }[] = [
  { key: "APPLIED", label: "Applied" },
  { key: "SCREENING", label: "Screening" },
  { key: "INTERVIEW", label: "Interview" },
  { key: "OFFER", label: "Offer" },
  { key: "HIRED", label: "Hired" },
  { key: "REJECTED", label: "Rejected" },
];

/* =========================================================
   CANDIDATE FORM
========================================================= */

const candidateSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email(),
  phone: z.string().optional(),
  expectedCtc: z.coerce.number().optional(),
  source: z.string().optional(),
  resumeText: z.string().optional(),
});

type CandidateForm = z.infer<typeof candidateSchema>;

type ScreeningCandidate = Candidate & {
  resumeText?: string;
  extractedSkills?: string[];
  jobFitScore?: number;
  screeningSummary?: string;
  experience?: number;
  autoShortlisted?: boolean;
  shortlistingResult?: "PENDING" | "SHORTLISTED" | "NOT_SHORTLISTED";
  screening?: {
    score: number;
    recommendation: string;
    requiredSkills: string[];
    matchedSkills: string[];
    missingSkills: string[];
  };
};

/* =========================================================
   LOCAL REQUISITION TYPES
========================================================= */

type ApprovalStep = {
  approverId: string;
  level: number;
  status: string;
  actedAt?: string | null;
  comment?: string | null;
};

type RecruitmentJob = {
  id: string;
  title: string;
  departmentId: string;
  departmentName: string;
  designationId: string;
  designationTitle: string;
  location: string;
  employmentType: string;
  experienceMin: number;
  experienceMax: number;
  description: string;
  status: "OPEN" | "ON_HOLD" | "CLOSED";
  openings: number;
  postedAt: string;
  candidateCount: number;

  requisitionStatus?: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  headcount?: number;
  budgetCtc?: number | null;
  approvalLevelRequired?: number;
  approvalSteps?: ApprovalStep[];
  postingChannels?: string[];
  screeningQuestions?: string[];
  hiringMode?: "STANDARD" | "WALK_IN" | "CAMPUS";
  skills?: string[];

  requestedAt?: string | null;
  approvedAt?: string | null;
  approvedById?: string | null;
  rejectionReason?: string | null;
};

/* =========================================================
   MAIN PAGE
========================================================= */

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<Candidate | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [lifecycleFor, setLifecycleFor] = useState<Candidate | null>(null);
  const [editCandidateFor, setEditCandidateFor] = useState<Candidate | null>(
    null,
  );
  const [deleteCandidateFor, setDeleteCandidateFor] =
    useState<Candidate | null>(null);
  const [editJobOpen, setEditJobOpen] = useState(false);
  const [deleteJobOpen, setDeleteJobOpen] = useState(false);

  const [screeningSearch, setScreeningSearch] = useState("");
  const [screeningStage, setScreeningStage] = useState<
    "ALL" | Candidate["stage"]
  >("ALL");
  const [screeningSource, setScreeningSource] = useState("ALL");
  const [minimumFit, setMinimumFit] = useState(0);
  const [screeningRecommendation, setScreeningRecommendation] = useState("ALL");
  const [screeningSkill, setScreeningSkill] = useState("ALL");
  const [minimumExperience, setMinimumExperience] = useState(0);
  const [minimumRating, setMinimumRating] = useState(0);
  const [shortlistFilter, setShortlistFilter] = useState("ALL");
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [hideSpam, setHideSpam] = useState(false);

  const { data: rawJob, isLoading: jobLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => RecruitmentApi.job(jobId!),
    enabled: !!jobId,
  });

  const job = rawJob as RecruitmentJob | undefined;

  const { data: candidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ["candidates", jobId],
    queryFn: () => RecruitmentApi.candidates(jobId!),
    enabled: !!jobId,
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      RecruitmentApi.moveStage(id, stage),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["candidates", jobId],
      });

      queryClient.invalidateQueries({
        queryKey: ["recruitment", "pipeline"],
      });

      showToast("Candidate stage updated.");
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const rateMutation = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number }) =>
      RecruitmentApi.rate(id, rating),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["candidates", jobId],
      });
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const screenMutation = useMutation({
    mutationFn: ({ id, resumeText }: { id: string; resumeText?: string }) =>
      RecruitmentApi.screenCandidate(id, resumeText),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["candidates", jobId],
      });

      queryClient.invalidateQueries({
        queryKey: ["candidate"],
      });

      queryClient.invalidateQueries({
        queryKey: ["recruitment", "pipeline"],
      });

      showToast("AI candidate screening completed.");
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const duplicateIds = getDuplicateCandidateIds(candidates ?? []);

  const availableSkills = Array.from(
    new Set([
      ...(job?.skills ?? []),
      ...(candidates ?? []).flatMap(
        (candidate) => (candidate as ScreeningCandidate).extractedSkills ?? [],
      ),
    ]),
  ).sort((a, b) => a.localeCompare(b));

  const filteredCandidates = (candidates ?? []).filter((candidate) => {
    const item = candidate as ScreeningCandidate;
    const search = screeningSearch.trim().toLowerCase();
    const name = `${candidate.firstName} ${candidate.lastName}`.toLowerCase();
    const email = (candidate.email ?? "").toLowerCase();
    const source = (candidate.source ?? "").toLowerCase();
    const fit = item.jobFitScore ?? item.screening?.score ?? 0;
    const recommendation = (
      item.screening?.recommendation ??
      (item.shortlistingResult === "SHORTLISTED"
        ? "YES"
        : item.shortlistingResult === "NOT_SHORTLISTED"
          ? "NO"
          : "")
    ).toUpperCase();
    const experience = Number(item.experience ?? 0);
    const rating = Number(candidate.rating ?? 0);
    const matchedSkills = [
      ...(item.extractedSkills ?? []),
      ...(item.screening?.matchedSkills ?? []),
    ].map((skill) => skill.trim().toLowerCase());
    const isShortlisted =
      item.autoShortlisted === true ||
      item.shortlistingResult === "SHORTLISTED";

    return (
      (!search ||
        name.includes(search) ||
        email.includes(search) ||
        source.includes(search)) &&
      (screeningStage === "ALL" || candidate.stage === screeningStage) &&
      (screeningSource === "ALL" || candidate.source === screeningSource) &&
      fit >= minimumFit &&
      (screeningRecommendation === "ALL" ||
        recommendation === screeningRecommendation) &&
      (screeningSkill === "ALL" ||
        matchedSkills.some(
          (skill) => skill === screeningSkill.trim().toLowerCase(),
        )) &&
      experience >= minimumExperience &&
      rating >= minimumRating &&
      (shortlistFilter === "ALL" ||
        (shortlistFilter === "SHORTLISTED" && isShortlisted) ||
        (shortlistFilter === "NOT_SHORTLISTED" && !isShortlisted)) &&
      (!hideDuplicates || !duplicateIds.has(candidate.id)) &&
      (!hideSpam || !isSpamCandidate(candidate))
    );
  });

  const screeningTotal = candidates?.length ?? 0;
  const screenedCount = (candidates ?? []).filter((candidate) => {
    const item = candidate as ScreeningCandidate;
    return item.jobFitScore != null || item.screening?.score != null;
  }).length;
  const strongFitCount = (candidates ?? []).filter((candidate) => {
    const item = candidate as ScreeningCandidate;
    return (item.jobFitScore ?? item.screening?.score ?? 0) >= 80;
  }).length;
  const duplicateCount = duplicateIds.size;
  const spamCount = (candidates ?? []).filter(isSpamCandidate).length;

  const refreshCandidates = () => {
    void queryClient.invalidateQueries({ queryKey: ["candidates", jobId] });
    void queryClient.invalidateQueries({ queryKey: ["candidate"] });
    void queryClient.invalidateQueries({
      queryKey: ["recruitment", "pipeline"],
    });
  };

  const updateCandidateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: CandidateForm }) =>
      api
        .patch<{
          candidate: Candidate;
        }>(`/recruitment/candidates/${id}`, values)
        .then((response) => response.data.candidate),
    onSuccess: () => {
      refreshCandidates();
      setEditCandidateFor(null);
      showToast("Candidate updated successfully.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const deleteCandidateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/recruitment/candidates/${id}`),
    onSuccess: () => {
      refreshCandidates();
      setDeleteCandidateFor(null);
      showToast("Candidate deleted successfully.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!jobId) {
        throw new Error("Job ID is missing.");
      }

      const response = await api.patch<{
        message?: string;
        job?: RecruitmentJob;
        data?: RecruitmentJob;
      }>(`/recruitment/jobs/${jobId}/approve`, {});

      return response.data;
    },

    onSuccess: (responseData) => {
      /*
       * Keep the detail page and recruitment list in sync immediately.
       *
       * Previously we only invalidated ["recruitment"], while the
       * recruitment list is cached under ["recruitment", "jobs"].
       * That left the old PENDING_APPROVAL job in the UI until another
       * fetch/reload happened.
       */
      const responseJob = responseData?.job ?? responseData?.data;

      const approvedJob: RecruitmentJob | undefined = responseJob
        ? {
            ...job,
            ...responseJob,
            requisitionStatus: responseJob.requisitionStatus ?? "APPROVED",
          }
        : job
          ? {
              ...job,
              requisitionStatus: "APPROVED",
            }
          : undefined;

      if (approvedJob) {
        queryClient.setQueryData<RecruitmentJob>(["job", jobId], approvedJob);

        queryClient.setQueryData<RecruitmentJob[] | undefined>(
          ["recruitment", "jobs"],
          (oldJobs) => {
            if (!oldJobs) return oldJobs;

            return oldJobs.map((item) =>
              item.id === approvedJob.id
                ? {
                    ...item,
                    ...approvedJob,
                    requisitionStatus:
                      approvedJob.requisitionStatus ?? "APPROVED",
                  }
                : item,
            );
          },
        );
      }

      // Re-fetch from the server so the UI cannot remain stale.
      void queryClient.invalidateQueries({
        queryKey: ["job", jobId],
      });

      void queryClient.invalidateQueries({
        queryKey: ["recruitment", "jobs"],
      });

      showToast("Job requisition approved.");
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!jobId) {
        throw new Error("Job ID is missing.");
      }

      const response = await api.patch(`/recruitment/jobs/${jobId}/reject`, {
        reason,
      });

      return response.data;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["job", jobId],
      });

      queryClient.invalidateQueries({
        queryKey: ["recruitment"],
      });

      setRejectOpen(false);

      showToast("Job requisition rejected.");
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const updateJobMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Record<string, unknown>;
    }) => RecruitmentApi.updateJob(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      queryClient.invalidateQueries({ queryKey: ["recruitment", "jobs"] });
      setEditJobOpen(false);
      showToast("Job posting updated successfully.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const deleteJobMutation = useMutation({
    mutationFn: (id: string) => RecruitmentApi.deleteJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      showToast("Job posting deleted successfully.");
      navigate("/app/recruitment");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  if (jobLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/app/recruitment"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-faint hover:text-ink"
      >
        <ArrowLeft size={14} />
        Back to all roles
      </Link>

      {job && (
        <Card className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl font-medium text-ink">
                  {job.title}
                </h1>

                <StatusBadge status={job.status} />

                {job.requisitionStatus === "PENDING_APPROVAL" && (
                  <Badge tone="warning">Pending Approval</Badge>
                )}

                {job.requisitionStatus === "APPROVED" && (
                  <Badge tone="success">Requisition Approved</Badge>
                )}

                {job.requisitionStatus === "REJECTED" && (
                  <Badge tone="danger">Requisition Rejected</Badge>
                )}
              </div>

              <p className="mt-1 text-[13px] text-ink-faint">
                {job.departmentName} • {job.designationTitle}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-[12.5px] text-ink-faint">
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} />
                  {job.location}
                </span>

                <span className="flex items-center gap-1.5">
                  <BriefcaseBusiness size={13} />
                  {job.experienceMin}–{job.experienceMax} yrs
                </span>

                <span className="flex items-center gap-1.5">
                  <Users size={13} />
                  {job.headcount ?? job.openings} opening(s)
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                leftIcon={<Pencil size={15} />}
                onClick={() => setEditJobOpen(true)}
              >
                Edit role
              </Button>
              <Button
                variant="outline"
                leftIcon={<Trash2 size={15} />}
                onClick={() => setDeleteJobOpen(true)}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                Delete
              </Button>
              <Button
                leftIcon={<Plus size={16} />}
                onClick={() => setAddOpen(true)}
              >
                Add candidate
              </Button>
            </div>
          </div>
        </Card>
      )}

      {job && (
        <RequisitionPanel
          job={job}
          approvePending={approveMutation.isPending}
          rejectPending={rejectMutation.isPending}
          onApprove={() => approveMutation.mutate()}
          onReject={() => setRejectOpen(true)}
        />
      )}

      <RejectRequisitionModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        isLoading={rejectMutation.isPending}
        onSubmit={(reason) => rejectMutation.mutate(reason)}
      />

      <div className="mb-3 mt-7 flex items-center justify-between">
        <div>
          <h2 className="font-display text-[17px] font-medium text-ink">
            Candidate Pipeline
          </h2>

          <p className="text-[12px] text-ink-faint">
            Track every candidate through the hiring journey.
          </p>
        </div>
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-brand-600" />
              <p className="text-[13px] font-semibold text-ink">
                Application Screening
              </p>
            </div>
            <p className="mt-1 text-[11.5px] text-ink-faint">
              Centralized applicant tracking with AI-assisted screening and
              shortlisting.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{screeningTotal} Applications</Badge>
            <Badge tone="success">{screenedCount} Screened</Badge>
            <Badge tone="success">{strongFitCount} Strong Fit</Badge>
            {duplicateCount > 0 && (
              <Badge tone="warning">{duplicateCount} Duplicate</Badge>
            )}
            {spamCount > 0 && (
              <Badge tone="warning">{spamCount} Suspicious</Badge>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              value={screeningSearch}
              onChange={(e) => setScreeningSearch(e.target.value)}
              placeholder="Search candidate, email or source..."
              className="h-9 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-[12px] text-ink outline-none focus:border-brand-500"
            />
          </div>
          <SelectField
            label="Stage"
            value={screeningStage}
            onChange={(e) =>
              setScreeningStage(e.target.value as "ALL" | Candidate["stage"])
            }
          >
            <option value="ALL">All stages</option>
            {STAGES.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Source"
            value={screeningSource}
            onChange={(e) => setScreeningSource(e.target.value)}
          >
            <option value="ALL">All sources</option>
            {Array.from(
              new Set(
                (candidates ?? [])
                  .map((candidate) => candidate.source)
                  .filter(Boolean),
              ),
            ).map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="AI recommendation"
            value={screeningRecommendation}
            onChange={(e) => setScreeningRecommendation(e.target.value)}
          >
            <option value="ALL">All recommendations</option>
            <option value="STRONG_YES">Strong Yes</option>
            <option value="YES">Yes</option>
            <option value="NO">No</option>
            <option value="STRONG_NO">Strong No</option>
          </SelectField>
          <SelectField
            label="Skill"
            value={screeningSkill}
            onChange={(e) => setScreeningSkill(e.target.value)}
          >
            <option value="ALL">All skills</option>
            {availableSkills.map((skill) => (
              <option key={skill} value={skill}>
                {skill}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Experience"
            value={String(minimumExperience)}
            onChange={(e) => setMinimumExperience(Number(e.target.value))}
          >
            <option value="0">Any experience</option>
            <option value="1">1+ years</option>
            <option value="2">2+ years</option>
            <option value="3">3+ years</option>
            <option value="5">5+ years</option>
            <option value="7">7+ years</option>
            <option value="10">10+ years</option>
          </SelectField>

          <SelectField
            label="Rating"
            value={String(minimumRating)}
            onChange={(e) => setMinimumRating(Number(e.target.value))}
          >
            <option value="0">Any rating</option>
            <option value="1">1+ stars</option>
            <option value="2">2+ stars</option>
            <option value="3">3+ stars</option>
            <option value="4">4+ stars</option>
            <option value="5">5 stars</option>
          </SelectField>

          <SelectField
            label="Shortlist"
            value={shortlistFilter}
            onChange={(e) => setShortlistFilter(e.target.value)}
          >
            <option value="ALL">All candidates</option>
            <option value="SHORTLISTED">Shortlisted only</option>
            <option value="NOT_SHORTLISTED">Not shortlisted</option>
          </SelectField>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[11.5px] text-ink-soft">
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={minimumFit}
              onChange={(e) => setMinimumFit(Number(e.target.value))}
            />
            Minimum AI fit:{" "}
            <span className="font-semibold text-ink">{minimumFit}%</span>
          </label>
          <label className="flex items-center gap-2 text-[11.5px] text-ink-soft">
            <input
              type="checkbox"
              checked={hideDuplicates}
              onChange={(e) => setHideDuplicates(e.target.checked)}
            />
            Hide duplicates
          </label>
          <label className="flex items-center gap-2 text-[11.5px] text-ink-soft">
            <input
              type="checkbox"
              checked={hideSpam}
              onChange={(e) => setHideSpam(e.target.checked)}
            />
            Hide suspicious applications
          </label>
          <button
            type="button"
            onClick={() => {
              setScreeningSearch("");
              setScreeningStage("ALL");
              setScreeningSource("ALL");
              setScreeningRecommendation("ALL");
              setScreeningSkill("ALL");
              setMinimumFit(0);
              setMinimumExperience(0);
              setMinimumRating(0);
              setShortlistFilter("ALL");
              setHideDuplicates(false);
              setHideSpam(false);
            }}
            className="text-[11px] font-medium text-brand-600 hover:underline"
          >
            Clear filters
          </button>
          <span className="ml-auto flex items-center gap-1 text-[11px] text-ink-faint">
            <Filter size={12} /> Showing {filteredCandidates.length} of{" "}
            {screeningTotal}
          </span>
        </div>
      </Card>

      {candidatesLoading ? (
        <div className="grid gap-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-3xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {STAGES.map((stage) => {
            const stageCandidates = filteredCandidates.filter(
              (candidate) => candidate.stage === stage.key,
            );

            return (
              <div
                key={stage.key}
                className="min-w-0 rounded-3xl bg-ink/[0.03] p-3"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <p className="text-[13px] font-semibold text-ink-soft">
                    {stage.label}
                  </p>

                  <Badge tone="neutral">{stageCandidates.length}</Badge>
                </div>

                <div className="space-y-2.5">
                  {stageCandidates.map((candidate) => {
                    const screeningCandidate = candidate as ScreeningCandidate;

                    const screening = screeningCandidate.screening;

                    return (
                      <Card key={candidate.id} padded={false} className="p-3.5">
                        <p className="text-[13px] font-medium text-ink">
                          {candidate.firstName} {candidate.lastName}
                        </p>

                        <p className="truncate text-[11.5px] text-ink-faint">
                          {candidate.email}
                        </p>

                        {candidate.expectedCtc ? (
                          <p className="mt-1 text-[11.5px] text-ink-faint">
                            Expects {formatCurrencyINR(candidate.expectedCtc)}
                          </p>
                        ) : null}

                        <div className="mt-2 flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <button
                              type="button"
                              key={i}
                              onClick={() =>
                                rateMutation.mutate({
                                  id: candidate.id,
                                  rating: i + 1,
                                })
                              }
                            >
                              <Star
                                size={13}
                                className={cx(
                                  i < (candidate.rating ?? 0)
                                    ? "fill-gold-500 text-gold-500"
                                    : "text-line",
                                )}
                              />
                            </button>
                          ))}
                        </div>

                        <p className="mt-2 text-[10.5px] text-ink-faint">
                          Applied {formatDate(candidate.appliedAt)} •{" "}
                          {candidate.source}
                        </p>

                        {(duplicateIds.has(candidate.id) ||
                          isSpamCandidate(candidate)) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {duplicateIds.has(candidate.id) && (
                              <Badge tone="warning">
                                <span className="flex items-center gap-1">
                                  <Copy size={10} /> Duplicate
                                </span>
                              </Badge>
                            )}
                            {isSpamCandidate(candidate) && (
                              <Badge tone="warning">
                                <span className="flex items-center gap-1">
                                  <AlertTriangle size={10} /> Suspicious
                                </span>
                              </Badge>
                            )}
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-end gap-2 border-t border-line/60 pt-3">
                          <button
                            type="button"
                            onClick={() => setEditCandidateFor(candidate)}
                            className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink transition hover:bg-surface"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteCandidateFor(candidate)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-red-600 transition hover:bg-red-50"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </div>

                        {(() => {
                          const fitScore =
                            screeningCandidate.jobFitScore ??
                            screening?.score ??
                            null;
                          const matchedSkills = Array.from(
                            new Set(
                              [
                                ...(screeningCandidate.extractedSkills ?? []),
                                ...(screening?.matchedSkills ?? []),
                              ].filter(Boolean),
                            ),
                          );
                          const missingSkills = Array.from(
                            new Set(
                              (screening?.missingSkills ?? []).filter(Boolean),
                            ),
                          );
                          const recommendation =
                            screening?.recommendation ??
                            (screeningCandidate.shortlistingResult ===
                            "SHORTLISTED"
                              ? "YES"
                              : screeningCandidate.shortlistingResult ===
                                  "NOT_SHORTLISTED"
                                ? "NO"
                                : null);
                          const screeningStatus =
                            fitScore != null ||
                            screeningCandidate.screeningSummary
                              ? "SCREENED"
                              : "NOT_SCREENED";
                          const statusTone =
                            screeningStatus === "SCREENED"
                              ? "success"
                              : "neutral";
                          const shortlistStatus =
                            screeningCandidate.shortlistingResult ??
                            (screeningCandidate.autoShortlisted
                              ? "SHORTLISTED"
                              : "PENDING");

                          return (
                            <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/40 p-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <Sparkles
                                    size={13}
                                    className="text-brand-600"
                                  />
                                  <span className="text-[11px] font-semibold text-ink">
                                    AI Screening
                                  </span>
                                </div>

                                <Badge tone={statusTone}>
                                  {screeningStatus === "SCREENED"
                                    ? "Screened"
                                    : "Not screened"}
                                </Badge>
                              </div>

                              {fitScore != null ? (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between text-[10.5px]">
                                    <span className="font-medium text-ink-soft">
                                      Job fit score
                                    </span>
                                    <span className="font-semibold text-ink">
                                      {fitScore}%
                                    </span>
                                  </div>
                                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white">
                                    <div
                                      className="h-full rounded-full bg-brand-500 transition-all"
                                      style={{
                                        width: `${Math.max(
                                          0,
                                          Math.min(100, fitScore),
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-2 text-[10.5px] text-ink-faint">
                                  Run AI screening to evaluate this candidate
                                  against the job requirements.
                                </p>
                              )}

                              {recommendation && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <span className="text-[10.5px] text-ink-faint">
                                    Recommendation:
                                  </span>
                                  <Badge
                                    tone={
                                      recommendation.includes("YES")
                                        ? "success"
                                        : recommendation.includes("NO")
                                          ? "warning"
                                          : "neutral"
                                    }
                                  >
                                    {recommendation.replaceAll("_", " ")}
                                  </Badge>
                                </div>
                              )}

                              {screeningStatus === "SCREENED" && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <span className="text-[10.5px] text-ink-faint">
                                    Result:
                                  </span>
                                  <Badge
                                    tone={
                                      shortlistStatus === "SHORTLISTED"
                                        ? "success"
                                        : shortlistStatus === "NOT_SHORTLISTED"
                                          ? "warning"
                                          : "neutral"
                                    }
                                  >
                                    {shortlistStatus.replaceAll("_", " ")}
                                  </Badge>
                                </div>
                              )}

                              {matchedSkills.length > 0 && (
                                <div className="mt-2">
                                  <p className="mb-1 text-[10.5px] font-medium text-ink-soft">
                                    Matched skills
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {matchedSkills.map((skill) => (
                                      <Badge
                                        key={`matched-${skill}`}
                                        tone="success"
                                      >
                                        {skill}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {missingSkills.length > 0 && (
                                <div className="mt-2">
                                  <p className="mb-1 text-[10.5px] font-medium text-ink-soft">
                                    Missing skills
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {missingSkills.map((skill) => (
                                      <Badge
                                        key={`missing-${skill}`}
                                        tone="warning"
                                      >
                                        {skill}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {screeningCandidate.screeningSummary && (
                                <div className="mt-2 rounded-lg bg-white/70 p-2">
                                  <p className="mb-0.5 text-[10px] font-medium text-ink-soft">
                                    Screening summary
                                  </p>
                                  <p className="line-clamp-4 text-[10px] leading-4 text-ink-faint">
                                    {screeningCandidate.screeningSummary}
                                  </p>
                                </div>
                              )}

                              {screeningStatus === "SCREENED" && (
                                <p className="mt-2 text-[9.5px] text-ink-faint">
                                  AI screening is assistive only. Final hiring
                                  decisions should be made by the recruiter.
                                </p>
                              )}

                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2 w-full"
                                leftIcon={<Sparkles size={12} />}
                                isLoading={
                                  screenMutation.isPending &&
                                  screenMutation.variables?.id === candidate.id
                                }
                                onClick={() =>
                                  screenMutation.mutate({
                                    id: candidate.id,
                                    resumeText: screeningCandidate.resumeText,
                                  })
                                }
                              >
                                {screeningStatus === "SCREENED"
                                  ? "Re-screen with AI"
                                  : "AI Screen Candidate"}
                              </Button>
                            </div>
                          );
                        })()}

                        <div className="mt-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setScheduleFor(candidate)}
                                className="flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline"
                              >
                                <Calendar size={12} />
                                Interview
                              </button>

                              <button
                                type="button"
                                onClick={() => setLifecycleFor(candidate)}
                                className="flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline"
                              >
                                <FileText size={12} />
                                Lifecycle
                              </button>
                            </div>

                            {stage.key !== "HIRED" &&
                              stage.key !== "REJECTED" && (
                                <select
                                  value={candidate.stage}
                                  onChange={(event) =>
                                    stageMutation.mutate({
                                      id: candidate.id,
                                      stage: event.target.value,
                                    })
                                  }
                                  aria-label={`Move ${candidate.firstName} ${candidate.lastName} to another stage`}
                                  className="w-[88px] shrink-0 rounded-lg border border-line bg-white px-2 py-1 text-center text-[11px] font-medium text-ink shadow-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                                >
                                  {STAGES.map((s) => (
                                    <option key={s.key} value={s.key}>
                                      {s.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}

                  {!stageCandidates.length && (
                    <p className="px-1 text-[11.5px] text-ink-faint">
                      No candidates
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddCandidateModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        jobId={jobId!}
      />

      {scheduleFor && (
        <ScheduleInterviewModal
          candidate={scheduleFor}
          onClose={() => setScheduleFor(null)}
        />
      )}

      {lifecycleFor && (
        <CandidateLifecycleModal
          candidate={lifecycleFor}
          onClose={() => setLifecycleFor(null)}
          job={job}
        />
      )}

      {editCandidateFor && (
        <EditCandidateModal
          candidate={editCandidateFor}
          isLoading={updateCandidateMutation.isPending}
          onClose={() => {
            if (!updateCandidateMutation.isPending) setEditCandidateFor(null);
          }}
          onSubmit={(values) =>
            updateCandidateMutation.mutate({
              id: editCandidateFor.id,
              values,
            })
          }
        />
      )}

      {deleteCandidateFor && (
        <DeleteCandidateModal
          candidate={deleteCandidateFor}
          isLoading={deleteCandidateMutation.isPending}
          onClose={() => {
            if (!deleteCandidateMutation.isPending) setDeleteCandidateFor(null);
          }}
          onConfirm={() =>
            deleteCandidateMutation.mutate(deleteCandidateFor.id)
          }
        />
      )}

      {job && (
        <EditJobModal
          job={job}
          open={editJobOpen}
          isLoading={updateJobMutation.isPending}
          onClose={() => {
            if (!updateJobMutation.isPending) setEditJobOpen(false);
          }}
          onSubmit={(values) =>
            updateJobMutation.mutate({ id: job.id, values })
          }
        />
      )}

      {job && (
        <DeleteJobModal
          job={job}
          open={deleteJobOpen}
          isLoading={deleteJobMutation.isPending}
          onClose={() => {
            if (!deleteJobMutation.isPending) setDeleteJobOpen(false);
          }}
          onConfirm={() => deleteJobMutation.mutate(job.id)}
        />
      )}
    </div>
  );
}

/* =========================================================
   REQUISITION PANEL
========================================================= */

function RequisitionPanel({
  job,
  approvePending,
  rejectPending,
  onApprove,
  onReject,
}: {
  job: RecruitmentJob;
  approvePending: boolean;
  rejectPending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const approvalSteps = job.approvalSteps ?? [];

  const approvedSteps = approvalSteps.filter(
    (step) => step.status === "APPROVED",
  ).length;

  const pendingSteps = approvalSteps.filter(
    (step) => step.status === "PENDING",
  ).length;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-brand-600" />

            <h2 className="font-display text-[17px] font-medium text-ink">
              Job Requisition & Approval
            </h2>
          </div>

          <p className="mt-1 text-[12px] text-ink-faint">
            Hiring request, budget and approval workflow.
          </p>
        </div>

        {job.requisitionStatus === "PENDING_APPROVAL" && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              leftIcon={<XCircle size={15} />}
              onClick={onReject}
              isLoading={rejectPending}
            >
              Reject
            </Button>

            <Button
              leftIcon={<CheckCircle2 size={15} />}
              onClick={onApprove}
              isLoading={approvePending}
            >
              Approve
            </Button>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoBox
          icon={Users}
          label="Headcount"
          value={String(job.headcount ?? job.openings ?? 1)}
        />

        <InfoBox
          icon={IndianRupee}
          label="Budget / CTC"
          value={
            job.budgetCtc != null
              ? formatCurrencyINR(job.budgetCtc)
              : "Not specified"
          }
        />

        <InfoBox
          icon={Clock3}
          label="Approval levels"
          value={String(job.approvalLevelRequired ?? 1)}
        />

        <InfoBox
          icon={Building2}
          label="Hiring mode"
          value={formatHiringMode(job.hiringMode)}
        />
      </div>

      {approvalSteps.length > 0 && (
        <div className="mt-5 rounded-2xl border border-line/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-semibold text-ink">
                Approval Progress
              </p>

              <p className="text-[11.5px] text-ink-faint">
                {approvedSteps} approved • {pendingSteps} pending
              </p>
            </div>

            <Badge
              tone={
                job.requisitionStatus === "APPROVED"
                  ? "success"
                  : job.requisitionStatus === "REJECTED"
                    ? "danger"
                    : "warning"
              }
            >
              {formatRequisitionStatus(job.requisitionStatus)}
            </Badge>
          </div>

          <div className="mt-4 space-y-2">
            {approvalSteps.map((step) => (
              <div
                key={`${step.level}-${step.approverId}`}
                className="flex items-center justify-between rounded-xl bg-ink/[0.025] px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink">
                    {step.level}
                  </div>

                  <div>
                    <p className="text-[12.5px] font-medium text-ink">
                      Approval Level {step.level}
                    </p>

                    <p className="text-[10.5px] text-ink-faint">
                      Approver ID: {step.approverId}
                    </p>
                  </div>
                </div>

                {step.status === "APPROVED" ? (
                  <Badge tone="success">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Approved
                    </span>
                  </Badge>
                ) : step.status === "REJECTED" ? (
                  <Badge tone="danger">
                    <span className="flex items-center gap-1">
                      <XCircle size={12} />
                      Rejected
                    </span>
                  </Badge>
                ) : (
                  <Badge tone="warning">
                    <span className="flex items-center gap-1">
                      <Clock3 size={12} />
                      Pending
                    </span>
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-[13px] font-semibold text-ink">Job Description</p>

          <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-6 text-ink-soft">
            {job.description || "No description provided."}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[13px] font-semibold text-ink">
              Posting Channels
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {(job.postingChannels?.length
                ? job.postingChannels
                : ["CAREERS"]
              ).map((channel) => (
                <Badge key={channel} tone="neutral">
                  <span className="flex items-center gap-1">
                    <Send size={11} />
                    {formatChannel(channel)}
                  </span>
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[13px] font-semibold text-ink">
              Required Skills
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {job.skills?.length ? (
                job.skills.map((skill) => (
                  <Badge key={skill} tone="neutral">
                    {skill}
                  </Badge>
                ))
              ) : (
                <span className="text-[12px] text-ink-faint">
                  No skills specified.
                </span>
              )}
            </div>
          </div>

          <div>
            <p className="text-[13px] font-semibold text-ink">
              Screening Questions
            </p>

            {job.screeningQuestions?.length ? (
              <ol className="mt-2 space-y-1.5 pl-5 text-[12px] text-ink-soft">
                {job.screeningQuestions.map((question, index) => (
                  <li key={`${index}-${question}`}>{question}</li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-[12px] text-ink-faint">
                No screening questions configured.
              </p>
            )}
          </div>
        </div>
      </div>

      {job.requisitionStatus === "REJECTED" && job.rejectionReason && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-[12.5px] font-semibold text-red-700">
            Rejection Reason
          </p>

          <p className="mt-1 text-[12px] text-red-600">{job.rejectionReason}</p>
        </div>
      )}
    </Card>
  );
}

/* =========================================================
   INFO BOX
========================================================= */

function InfoBox({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-line/70 bg-ink/[0.015] p-3.5">
      <div className="flex items-center gap-2 text-ink-faint">
        <Icon size={14} />
        <span className="text-[11px]">{label}</span>
      </div>

      <p className="mt-1.5 text-[14px] font-semibold text-ink">{value}</p>
    </div>
  );
}

/* =========================================================
   REJECT REQUISITION MODAL
========================================================= */

function RejectRequisitionModal({
  open,
  onClose,
  isLoading,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  isLoading: boolean;
  onSubmit: (reason: string) => void;
}) {
  const { register, handleSubmit, reset } = useForm<{ reason: string }>({
    defaultValues: {
      reason: "",
    },
  });

  const submit = (values: { reason: string }) => {
    const reason = values.reason.trim();
    if (reason.length < 2) {
      return;
    }
    onSubmit(reason);

    reset({
      reason: "",
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reject Job Requisition"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>

          <Button onClick={handleSubmit(submit)} isLoading={isLoading}>
            Reject requisition
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[12.5px] text-ink-faint">
          Provide a reason for rejecting this hiring request.
        </p>

        <textarea
          {...register("reason", {
            required: true,
          })}
          rows={5}
          placeholder="Enter rejection reason..."
          className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-brand-500"
        />
      </div>
    </Modal>
  );
}

/* =========================================================
   ADD CANDIDATE MODAL
========================================================= */

function AddCandidateModal({
  open,
  onClose,
  jobId,
}: {
  open: boolean;
  onClose: () => void;
  jobId: string;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CandidateForm>({
    resolver: zodResolver(candidateSchema),
  });

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values: CandidateForm) =>
      RecruitmentApi.createCandidate({
        jobPostingId: jobId,
        ...values,
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["candidates", jobId],
      });

      queryClient.invalidateQueries({
        queryKey: ["recruitment", "pipeline"],
      });

      showToast("Candidate added.");

      reset();
      onClose();
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add candidate"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>

          <Button
            onClick={handleSubmit((values) => mutation.mutate(values))}
            isLoading={mutation.isPending}
          >
            Add candidate
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="First name"
          required
          error={errors.firstName?.message}
          {...register("firstName")}
        />

        <TextField
          label="Last name"
          required
          error={errors.lastName?.message}
          {...register("lastName")}
        />

        <TextField
          label="Email"
          type="email"
          required
          className="sm:col-span-2"
          error={errors.email?.message}
          {...register("email")}
        />

        <TextField label="Phone" {...register("phone")} />

        <TextField
          label="Expected CTC (₹)"
          type="number"
          {...register("expectedCtc")}
        />

        <SelectField
          label="Source"
          className="sm:col-span-2"
          {...register("source")}
        >
          <option value="Career Site">Career Site</option>
          <option value="LinkedIn">LinkedIn</option>
          <option value="Naukri">Naukri</option>
          <option value="Indeed">Indeed</option>
          <option value="Referral">Referral</option>
          <option value="Walk-in">Walk-in</option>
          <option value="Campus">Campus</option>
          <option value="Job Board">Job Board</option>
        </SelectField>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-[12px] font-medium text-ink">
            Resume Text for AI Screening
          </label>

          <textarea
            rows={6}
            placeholder="Paste candidate skills, experience and qualifications..."
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[12.5px] text-ink outline-none focus:border-brand-500"
            {...register("resumeText")}
          />

          <p className="mt-1 text-[10.5px] text-ink-faint">
            Used for AI-assisted skill matching and job-fit scoring.
          </p>
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================
   EDIT CANDIDATE MODAL
========================================================= */

type JobEditForm = {
  title: string;
  location: string;
  experienceMin: number;
  experienceMax: number;
  openings: number;
  budgetCtc: string;
  description: string;
  skillsText: string;
  screeningQuestionsText: string;
  hiringMode: "STANDARD" | "WALK_IN" | "CAMPUS";
  status: "OPEN" | "ON_HOLD" | "CLOSED";
};

function EditJobModal({
  job,
  open,
  isLoading,
  onClose,
  onSubmit,
}: {
  job: RecruitmentJob;
  open: boolean;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<JobEditForm>({
    defaultValues: {
      title: job.title,
      location: job.location ?? "",
      experienceMin: job.experienceMin ?? 0,
      experienceMax: job.experienceMax ?? 0,
      openings: job.headcount ?? job.openings ?? 1,
      budgetCtc: job.budgetCtc != null ? String(job.budgetCtc) : "",
      description: job.description ?? "",
      skillsText: (job.skills ?? []).join(", "),
      screeningQuestionsText: (job.screeningQuestions ?? []).join("\n"),
      hiringMode: job.hiringMode ?? "STANDARD",
      status: job.status,
    },
  });

  const submit = (values: JobEditForm) => {
    if (values.experienceMax < values.experienceMin) return;
    const budget = values.budgetCtc.trim();
    onSubmit({
      title: values.title.trim(),
      location: values.location.trim(),
      experienceMin: Number(values.experienceMin),
      experienceMax: Number(values.experienceMax),
      openings: Number(values.openings),
      headcount: Number(values.openings),
      budgetCtc: budget ? Number(budget) : null,
      description: values.description.trim(),
      skills: values.skillsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      screeningQuestions: values.screeningQuestionsText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      hiringMode: values.hiringMode,
      status: values.status,
    });
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Edit Job Posting"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isLoading}>
            Save changes
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={handleSubmit(submit)}
      >
        <TextField
          label="Job title"
          required
          className="sm:col-span-2"
          error={errors.title?.message}
          {...register("title", { required: "Job title is required" })}
        />
        <TextField
          label="Work location"
          required
          {...register("location", { required: "Location is required" })}
        />
        <SelectField label="Status" {...register("status")}>
          <option value="OPEN">Open</option>
          <option value="ON_HOLD">On hold</option>
          <option value="CLOSED">Closed</option>
        </SelectField>
        <TextField
          label="Minimum experience"
          type="number"
          min="0"
          {...register("experienceMin", { valueAsNumber: true })}
        />
        <TextField
          label="Maximum experience"
          type="number"
          min="0"
          error={errors.experienceMax?.message}
          {...register("experienceMax", {
            valueAsNumber: true,
            validate: (value, form) =>
              value >= form.experienceMin ||
              "Must be greater than or equal to minimum experience",
          })}
        />
        <TextField
          label="Openings"
          type="number"
          min="1"
          {...register("openings", {
            valueAsNumber: true,
            min: { value: 1, message: "At least 1 opening is required" },
          })}
        />
        <TextField
          label="Budget / CTC"
          type="number"
          min="0"
          placeholder="Optional"
          {...register("budgetCtc")}
        />
        <SelectField
          label="Hiring mode"
          className="sm:col-span-2"
          {...register("hiringMode")}
        >
          <option value="STANDARD">Standard</option>
          <option value="WALK_IN">Walk-in</option>
          <option value="CAMPUS">Campus</option>
        </SelectField>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-ink">
            Required skills
          </label>
          <input
            className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-brand-500"
            placeholder="React, TypeScript, Communication"
            {...register("skillsText")}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-ink">
            Screening questions
          </label>
          <textarea
            className="min-h-24 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
            placeholder="One question per line"
            {...register("screeningQuestionsText")}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-ink">
            Job description
          </label>
          <textarea
            className="min-h-40 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
            {...register("description", {
              required: "Job description is required",
              minLength: { value: 10, message: "Add at least 10 characters" },
            })}
          />
          {errors.description?.message && (
            <p className="mt-1 text-xs text-red-600">
              {errors.description.message}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}

function DeleteJobModal({
  job,
  open,
  isLoading,
  onClose,
  onConfirm,
}: {
  job: RecruitmentJob;
  open: boolean;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete Job Posting"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            isLoading={isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            Delete job
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-ink-soft">
        <p>
          Are you sure you want to delete{" "}
          <span className="font-semibold text-ink">{job.title}</span>?
        </p>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700">
          This permanently deletes the job posting and its candidates and
          interviews.
        </p>
      </div>
    </Modal>
  );
}

function EditCandidateModal({
  candidate,
  isLoading,
  onClose,
  onSubmit,
}: {
  candidate: Candidate;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (values: CandidateForm) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CandidateForm>({
    resolver: zodResolver(candidateSchema),
    defaultValues: {
      firstName: candidate.firstName ?? "",
      lastName: candidate.lastName ?? "",
      email: candidate.email ?? "",
      phone: candidate.phone ?? "",
      expectedCtc: candidate.expectedCtc ?? undefined,
      source: candidate.source ?? "",
      resumeText: (candidate as ScreeningCandidate).resumeText ?? "",
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit Candidate — ${candidate.firstName} ${candidate.lastName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} isLoading={isLoading}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="First name"
          required
          error={errors.firstName?.message}
          {...register("firstName")}
        />
        <TextField
          label="Last name"
          required
          error={errors.lastName?.message}
          {...register("lastName")}
        />
        <TextField
          label="Email"
          type="email"
          required
          className="sm:col-span-2"
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField label="Phone" {...register("phone")} />
        <TextField
          label="Expected CTC (₹)"
          type="number"
          {...register("expectedCtc")}
        />
        <SelectField
          label="Source"
          className="sm:col-span-2"
          {...register("source")}
        >
          <option value="Career Site">Career Site</option>
          <option value="LinkedIn">LinkedIn</option>
          <option value="Naukri">Naukri</option>
          <option value="Indeed">Indeed</option>
          <option value="Referral">Referral</option>
          <option value="Walk-in">Walk-in</option>
          <option value="Campus">Campus</option>
          <option value="Job Board">Job Board</option>
        </SelectField>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-[12px] font-medium text-ink">
            Resume Text for AI Screening
          </label>
          <textarea
            rows={6}
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[12.5px] text-ink outline-none focus:border-brand-500"
            {...register("resumeText")}
          />
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================
   DELETE CANDIDATE MODAL
========================================================= */

function DeleteCandidateModal({
  candidate,
  isLoading,
  onClose,
  onConfirm,
}: {
  candidate: Candidate;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Delete Candidate"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} isLoading={isLoading}>
            Delete candidate
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <AlertTriangle size={18} className="shrink-0 text-red-600" />
          <p className="text-[12.5px] leading-5 text-red-700">
            This action cannot be undone.
          </p>
        </div>
        <p className="text-[13px] text-ink-soft">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-ink">
            {candidate.firstName} {candidate.lastName}
          </span>
          ?
        </p>
      </div>
    </Modal>
  );
}

/* =========================================================
   INTERVIEW SCHEDULING
========================================================= */

function ScheduleInterviewModal({
  candidate,
  onClose,
}: {
  candidate: Candidate;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: managers } = useQuery({
    queryKey: ["managers"],
    queryFn: EmployeesApi.managers,
  });

  const { data: interviews } = useQuery({
    queryKey: ["interviews", candidate.id],
    queryFn: () => RecruitmentApi.interviews(candidate.id),
  });

  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      interviewerId: "",
      scheduledAt: "",
      round: "Round 1",
    },
  });

  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);

  const [feedbackText, setFeedbackText] = useState("");

  const [recommendation, setRecommendation] = useState<
    "STRONG_YES" | "YES" | "NO" | "STRONG_NO"
  >("YES");

  const scheduleMutation = useMutation({
    mutationFn: (values: {
      interviewerId: string;
      scheduledAt: string;
      round: string;
    }) => {
      if (!values.interviewerId)
        throw new Error("Please select an interviewer.");
      if (!values.scheduledAt)
        throw new Error("Please select an interview date and time.");
      if (!values.round.trim()) throw new Error("Interview round is required.");
      return RecruitmentApi.scheduleInterview({
        candidateId: candidate.id,
        ...values,
        round: values.round.trim(),
      });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["interviews", candidate.id],
      });

      queryClient.invalidateQueries({
        queryKey: ["candidates"],
      });

      showToast("Interview scheduled.");
      reset();
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const feedbackMutation = useMutation({
    mutationFn: (input: {
      id: string;
      feedback: string;
      recommendation: "STRONG_YES" | "YES" | "NO" | "STRONG_NO";
    }) =>
      RecruitmentApi.submitFeedback(
        input.id,
        input.feedback,
        input.recommendation,
      ),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["interviews", candidate.id],
      });

      queryClient.invalidateQueries({
        queryKey: ["candidates"],
      });

      showToast("Interview feedback saved.");
      setFeedbackFor(null);
      setFeedbackText("");
      setRecommendation("YES");
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Interviews — ${candidate.firstName} ${candidate.lastName}`}
      size="lg"
    >
      <div className="space-y-5">
        <div className="space-y-2">
          {interviews?.length ? (
            interviews.map((interview) => (
              <div
                key={interview.id}
                className="rounded-xl border border-line/60 px-3.5 py-3 text-[13px]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">
                      {interview.round} with {interview.interviewerFirstName}{" "}
                      {interview.interviewerLastName}
                    </p>

                    <p className="text-[12px] text-ink-faint">
                      {formatDate(interview.scheduledAt)}
                    </p>
                  </div>

                  {interview.completed ? (
                    <Badge tone="success">
                      {interview.recommendation?.replace("_", " ") ||
                        "Completed"}
                    </Badge>
                  ) : (
                    <Badge tone="warning">Scheduled</Badge>
                  )}
                </div>

                {interview.feedback && (
                  <div className="mt-2 rounded-lg bg-ink/[0.025] p-2.5">
                    <p className="text-[11px] font-medium text-ink-faint">
                      Feedback
                    </p>

                    <p className="mt-0.5 text-[12px] text-ink-soft">
                      {interview.feedback}
                    </p>
                  </div>
                )}

                {!interview.completed && (
                  <div className="mt-3">
                    {feedbackFor === interview.id ? (
                      <div className="space-y-2.5 rounded-xl border border-line/70 p-3">
                        <textarea
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                          rows={4}
                          placeholder="Enter interview feedback..."
                          className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[12.5px] text-ink outline-none focus:border-brand-500"
                        />

                        <SelectField
                          label="Recommendation"
                          value={recommendation}
                          onChange={(e) =>
                            setRecommendation(
                              e.target.value as
                                | "STRONG_YES"
                                | "YES"
                                | "NO"
                                | "STRONG_NO",
                            )
                          }
                        >
                          <option value="STRONG_YES">Strong Yes</option>
                          <option value="YES">Yes</option>
                          <option value="NO">No</option>
                          <option value="STRONG_NO">Strong No</option>
                        </SelectField>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setFeedbackFor(null);
                              setFeedbackText("");
                            }}
                          >
                            Cancel
                          </Button>

                          <Button
                            size="sm"
                            isLoading={feedbackMutation.isPending}
                            onClick={() => {
                              if (feedbackText.trim().length < 2) {
                                showToast(
                                  "Feedback must be at least 2 characters.",
                                  "error",
                                );
                                return;
                              }

                              feedbackMutation.mutate({
                                id: interview.id,
                                feedback: feedbackText.trim(),
                                recommendation,
                              });
                            }}
                          >
                            Submit feedback
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setFeedbackFor(interview.id)}
                      >
                        Submit feedback
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-[13px] text-ink-faint">
              No interviews scheduled yet.
            </p>
          )}
        </div>

        <form
          className="space-y-3 border-t border-line/70 pt-4"
          onSubmit={handleSubmit((values) => scheduleMutation.mutate(values))}
        >
          <p className="text-[13px] font-medium text-ink">
            Schedule a new round
          </p>

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Interviewer" {...register("interviewerId")}>
              <option value="">Select</option>

              {managers?.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.firstName} {manager.lastName}
                </option>
              ))}
            </SelectField>

            <TextField label="Round" {...register("round")} />
          </div>

          <TextField
            label="Date & time"
            type="datetime-local"
            {...register("scheduledAt")}
          />

          <Button
            type="submit"
            size="sm"
            rightIcon={<ChevronRight size={14} />}
            isLoading={scheduleMutation.isPending}
          >
            Schedule
          </Button>
        </form>
      </div>
    </Modal>
  );
}

/* =========================================================
   CANDIDATE RECRUITMENT LIFECYCLE
========================================================= */

type LifecycleCandidate = Candidate & {
  offer?: {
    status?: "NOT_SENT" | "SENT" | "ACCEPTED" | "DECLINED";
    offerUrl?: string | null;
    annualCtc?: number;
    basic?: number;
    hra?: number;
    specialAllowance?: number;
    joiningDate?: string;
    generatedAt?: string;
    respondedAt?: string | null;
  };

  backgroundVerification?: {
    status?: "NOT_STARTED" | "IN_PROGRESS" | "VERIFIED" | "FAILED";
    provider?: string;
    reference?: string;
    notes?: string;
    startedAt?: string | null;
    completedAt?: string | null;
  };

  preboarding?: {
    status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    completedAt?: string | null;
    documents?: Array<{
      type: string;
      url: string;
      uploadedAt?: string;
      verified?: boolean;
    }>;
  };

  hiredEmployeeId?: string | null;
};

function CandidateLifecycleModal({
  candidate,
  onClose,
  job,
}: {
  candidate: Candidate;
  onClose: () => void;
  job?: RecruitmentJob;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: rawCandidate, isLoading } = useQuery({
    queryKey: ["candidate", candidate.id],
    queryFn: () => RecruitmentApi.candidate(candidate.id),
  });

  const current = (rawCandidate ?? candidate) as LifecycleCandidate;

  const [annualCtc, setAnnualCtc] = useState(
    String(current.expectedCtc ?? job?.budgetCtc ?? 0),
  );

  const [joiningDate, setJoiningDate] = useState("");

  const [bgvStatus, setBgvStatus] = useState<
    "NOT_STARTED" | "IN_PROGRESS" | "VERIFIED" | "FAILED"
  >("IN_PROGRESS");

  const [bgvProvider, setBgvProvider] = useState("");

  const [bgvReference, setBgvReference] = useState("");

  const [bgvNotes, setBgvNotes] = useState("");

  const [documentType, setDocumentType] = useState("Aadhaar");

  const [documentUrl, setDocumentUrl] = useState("");

  useEffect(() => {
    if (!rawCandidate) return;
    const loaded = rawCandidate as LifecycleCandidate;
    setAnnualCtc(String(loaded.expectedCtc ?? job?.budgetCtc ?? 0));
    setJoiningDate(loaded.offer?.joiningDate ?? "");
    setBgvStatus(loaded.backgroundVerification?.status ?? "IN_PROGRESS");
    setBgvProvider(loaded.backgroundVerification?.provider ?? "");
    setBgvReference(loaded.backgroundVerification?.reference ?? "");
    setBgvNotes(loaded.backgroundVerification?.notes ?? "");
  }, [rawCandidate, job?.budgetCtc]);

  const refreshCandidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["candidate", candidate.id],
    });

    queryClient.invalidateQueries({
      queryKey: ["candidates", job?.id],
    });

    queryClient.invalidateQueries({
      queryKey: ["recruitment"],
    });
  };

  const offerMutation = useMutation({
    mutationFn: () => {
      const ctc = Number(annualCtc);
      if (!Number.isFinite(ctc) || ctc <= 0) {
        throw new Error("Annual CTC must be greater than 0.");
      }
      if (!joiningDate) {
        throw new Error("Joining date is required.");
      }
      return RecruitmentApi.generateOffer(candidate.id, {
        annualCtc: ctc,
        joiningDate,
      });
    },

    onSuccess: () => {
      refreshCandidate();
      showToast("Offer generated successfully.");
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const offerResponseMutation = useMutation({
    mutationFn: (status: "ACCEPTED" | "DECLINED") =>
      RecruitmentApi.respondToOffer(candidate.id, status),

    onSuccess: (_, status) => {
      refreshCandidate();
      showToast(`Offer ${status.toLowerCase()}.`);
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const bgvMutation = useMutation({
    mutationFn: () =>
      RecruitmentApi.updateBackgroundVerification(candidate.id, {
        status: bgvStatus,
        provider: bgvProvider || undefined,
        reference: bgvReference || undefined,
        notes: bgvNotes || undefined,
      }),

    onSuccess: () => {
      refreshCandidate();
      showToast("Background verification updated.");
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const documentMutation = useMutation({
    mutationFn: () =>
      RecruitmentApi.addPreboardingDocument(candidate.id, {
        type: documentType,
        url: documentUrl,
      }),

    onSuccess: () => {
      refreshCandidate();
      setDocumentUrl("");
      showToast("Pre-boarding document added.");
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const verifyDocumentMutation = useMutation({
    mutationFn: (index: number) =>
      RecruitmentApi.verifyPreboardingDocument(candidate.id, index),

    onSuccess: () => {
      refreshCandidate();
      showToast("Pre-boarding document verified.");
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const hireMutation = useMutation({
    mutationFn: () => RecruitmentApi.hireCandidate(candidate.id, "EMPLOYEE"),

    onSuccess: () => {
      refreshCandidate();
      showToast("Candidate hired and employee account created.");
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const offerStatus = current.offer?.status ?? "NOT_SENT";

  const offerAccepted = offerStatus === "ACCEPTED";

  const bgvVerified = current.backgroundVerification?.status === "VERIFIED";

  const preboardingCompleted = current.preboarding?.status === "COMPLETED";

  const hired = Boolean(current.hiredEmployeeId);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Recruitment Lifecycle — ${current.firstName} ${current.lastName}`}
      size="lg"
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line/70 bg-ink/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-ink">
                  {current.firstName} {current.lastName}
                </p>

                <p className="text-[12px] text-ink-faint">{current.email}</p>
              </div>

              <Badge tone={hired ? "success" : "neutral"}>
                {hired ? "HIRED" : current.stage}
              </Badge>
            </div>
          </div>

          {/* 1. OFFER */}
          <LifecycleSection
            number="1"
            title="Offer"
            status={offerStatus}
            complete={offerAccepted}
          >
            {offerStatus === "NOT_SENT" || offerStatus === "DECLINED" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Annual CTC"
                  type="number"
                  value={annualCtc}
                  onChange={(e) => setAnnualCtc(e.target.value)}
                />

                <TextField
                  label="Joining date"
                  type="date"
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                />

                <div className="sm:col-span-2">
                  <Button
                    size="sm"
                    isLoading={offerMutation.isPending}
                    disabled={!joiningDate || Number(annualCtc) <= 0}
                    onClick={() => offerMutation.mutate()}
                  >
                    {offerStatus === "DECLINED"
                      ? "Generate new offer"
                      : "Generate offer"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[12px] text-ink-soft">
                  CTC:{" "}
                  {current.offer?.annualCtc != null
                    ? formatCurrencyINR(current.offer.annualCtc)
                    : "—"}{" "}
                  • Joining: {current.offer?.joiningDate ?? "—"}
                </p>

                {offerStatus === "SENT" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      isLoading={offerResponseMutation.isPending}
                      onClick={() => offerResponseMutation.mutate("ACCEPTED")}
                    >
                      Accept offer
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={offerResponseMutation.isPending}
                      onClick={() => offerResponseMutation.mutate("DECLINED")}
                    >
                      Decline offer
                    </Button>
                  </div>
                )}

                {offerStatus === "ACCEPTED" && (
                  <Badge tone="success">Offer accepted</Badge>
                )}

                {current.offer?.offerUrl && (
                  <a
                    href={resolveAssetUrl(current.offer.offerUrl) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-[12px] font-medium text-brand-600 hover:underline"
                  >
                    Open generated offer letter
                  </a>
                )}
              </div>
            )}
          </LifecycleSection>

          {/* 2. BACKGROUND VERIFICATION */}
          <LifecycleSection
            number="2"
            title="Background Verification"
            status={current.backgroundVerification?.status ?? "NOT_STARTED"}
            complete={bgvVerified}
          >
            {!offerAccepted ? (
              <p className="text-[12px] text-ink-faint">
                Accept the offer before completing background verification.
              </p>
            ) : (
              <div className="space-y-3">
                <SelectField
                  label="Status"
                  value={bgvStatus}
                  onChange={(e) =>
                    setBgvStatus(
                      e.target.value as
                        | "NOT_STARTED"
                        | "IN_PROGRESS"
                        | "VERIFIED"
                        | "FAILED",
                    )
                  }
                >
                  <option value="NOT_STARTED">Not started</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="FAILED">Failed</option>
                </SelectField>

                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Provider"
                    value={bgvProvider}
                    onChange={(e) => setBgvProvider(e.target.value)}
                  />

                  <TextField
                    label="Reference"
                    value={bgvReference}
                    onChange={(e) => setBgvReference(e.target.value)}
                  />
                </div>

                <textarea
                  value={bgvNotes}
                  onChange={(e) => setBgvNotes(e.target.value)}
                  rows={3}
                  placeholder="Verification notes..."
                  className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[12.5px] text-ink outline-none focus:border-brand-500"
                />

                <Button
                  size="sm"
                  isLoading={bgvMutation.isPending}
                  onClick={() => bgvMutation.mutate()}
                >
                  Update verification
                </Button>
              </div>
            )}
          </LifecycleSection>

          {/* 3. PRE-BOARDING */}
          <LifecycleSection
            number="3"
            title="Pre-boarding"
            status={current.preboarding?.status ?? "NOT_STARTED"}
            complete={preboardingCompleted}
          >
            {!bgvVerified ? (
              <p className="text-[12px] text-ink-faint">
                Complete BGV with VERIFIED status before pre-boarding.
              </p>
            ) : (
              <div className="space-y-3">
                {current.preboarding?.documents?.length ? (
                  <div className="space-y-2">
                    {current.preboarding.documents.map((doc, index) => (
                      <div
                        key={`${doc.type}-${index}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/60 px-3 py-2.5"
                      >
                        <div>
                          <p className="text-[12.5px] font-medium text-ink">
                            {doc.type}
                          </p>

                          <p className="max-w-[420px] truncate text-[11px] text-ink-faint">
                            {doc.url}
                          </p>
                        </div>

                        {doc.verified ? (
                          <Badge tone="success">Verified</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            isLoading={verifyDocumentMutation.isPending}
                            onClick={() => verifyDocumentMutation.mutate(index)}
                          >
                            Verify
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-faint">
                    No pre-boarding documents yet.
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Document type"
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                  />

                  <TextField
                    label="Document URL"
                    value={documentUrl}
                    onChange={(e) => setDocumentUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  isLoading={documentMutation.isPending}
                  disabled={!documentType.trim() || !documentUrl.trim()}
                  onClick={() => documentMutation.mutate()}
                >
                  Add document
                </Button>
              </div>
            )}
          </LifecycleSection>

          {/* 4. HIRE */}
          <LifecycleSection
            number="4"
            title="Hire / Employee Handoff"
            status={hired ? "COMPLETED" : "PENDING"}
            complete={hired}
          >
            {!offerAccepted || !bgvVerified || !preboardingCompleted ? (
              <p className="text-[12px] text-ink-faint">
                Hiring unlocks after Offer Accepted, BGV Verified and
                Pre-boarding Completed.
              </p>
            ) : hired ? (
              <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                <UserCheck size={15} />
                Employee account created.
                {current.hiredEmployeeId
                  ? ` Employee ID: ${current.hiredEmployeeId}`
                  : ""}
              </div>
            ) : (
              <Button
                size="sm"
                isLoading={hireMutation.isPending}
                onClick={() => hireMutation.mutate()}
              >
                Hire candidate
              </Button>
            )}
          </LifecycleSection>
        </div>
      )}
    </Modal>
  );
}

/* =========================================================
   LIFECYCLE SECTION
========================================================= */

function LifecycleSection({
  number,
  title,
  status,
  complete,
  children,
}: {
  number: string;
  title: string;
  status: string;
  complete: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cx(
              "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold",
              complete
                ? "bg-emerald-100 text-emerald-700"
                : "bg-brand-50 text-brand-700",
            )}
          >
            {complete ? <CheckCircle2 size={14} /> : number}
          </div>

          <p className="text-[13px] font-semibold text-ink">{title}</p>
        </div>

        <Badge tone={complete ? "success" : "neutral"}>
          {String(status).replaceAll("_", " ")}
        </Badge>
      </div>

      {children}
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function getDuplicateCandidateIds(candidates: Candidate[]) {
  const seen = new Map<string, string[]>();

  candidates.forEach((candidate) => {
    const keys = [
      candidate.email?.trim().toLowerCase(),
      candidate.phone?.replace(/\D/g, ""),
    ].filter(Boolean) as string[];

    keys.forEach((key) => {
      const ids = seen.get(key) ?? [];
      ids.push(candidate.id);
      seen.set(key, ids);
    });
  });

  const duplicateIds = new Set<string>();
  seen.forEach((ids) => {
    if (ids.length > 1) ids.forEach((id) => duplicateIds.add(id));
  });

  return duplicateIds;
}

function isSpamCandidate(candidate: Candidate) {
  const email = (candidate.email ?? "").trim().toLowerCase();
  const suspiciousDomains = [
    "tempmail.com",
    "temp-mail.org",
    "10minutemail.com",
    "guerrillamail.com",
    "mailinator.com",
    "yopmail.com",
  ];
  const domain = email.includes("@") ? email.split("@")[1] : "";
  const resumeText = String(
    (candidate as ScreeningCandidate).resumeText ?? "",
  ).trim();
  return (
    suspiciousDomains.includes(domain) || (email === "" && resumeText === "")
  );
}

function formatRequisitionStatus(status?: RecruitmentJob["requisitionStatus"]) {
  switch (status) {
    case "APPROVED":
      return "Approved";

    case "REJECTED":
      return "Rejected";

    case "PENDING_APPROVAL":
      return "Pending Approval";

    default:
      return "Pending Approval";
  }
}

function formatHiringMode(mode?: RecruitmentJob["hiringMode"]) {
  switch (mode) {
    case "WALK_IN":
      return "Walk-in";

    case "CAMPUS":
      return "Campus";

    default:
      return "Standard";
  }
}

function formatChannel(channel: string) {
  switch (channel.toUpperCase()) {
    case "CAREERS":
    case "CAREER_SITE":
      return "Careers Page";

    case "LINKEDIN":
      return "LinkedIn";

    case "NAUKRI":
      return "Naukri";

    case "INDEED":
      return "Indeed";

    case "REFERRALS":
    case "REFERRAL":
      return "Employee Referrals";

    default:
      return channel.replaceAll("_", " ");
  }
}
