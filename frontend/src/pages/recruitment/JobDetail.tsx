import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Plus,
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
  X,
  Mail,
  History,
  ClipboardCheck,
  Tags,
  UserRoundPlus,
  BarChart3,
  GitCompare,
  Video,
  PlusCircle,
  Save,
  ExternalLink,
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
import type { Candidate, Interview } from "@/types";
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
});

type CandidateForm = z.infer<typeof candidateSchema>;

const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_RESUME_EXTENSIONS = [".pdf", ".doc", ".docx"];

type ScreeningCandidate = Candidate & {
  resumeText?: string;
  extractedSkills?: string[];
  jobFitScore?: number;
  screeningSummary?: string;
  experience?: number;
  autoShortlisted?: boolean;
  shortlistingResult?:
  | "PENDING"
  | "SHORTLISTED"
  | "NOT_SHORTLISTED"
  | "NOT_CONFIGURED";
  finalResult?: "PENDING" | "SELECTED" | "REJECTED";
  screening?: {
    score: number;
    recommendation: "YES" | "NO" | "REVIEW";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    requiredSkills: string[];
    matchedSkills: string[];
    missingSkills: string[];
    strengths: string[];
    concerns: string[];
    experienceRelevance: string;
    educationRelevance: string;
    interviewFocus: string[];
    summary: string;
    evaluatedAt?: string;
  };
};
type InterviewCopilot = {
  focusAreas: string[];
  technicalQuestions: {
    question: string;
    followUps: string[];
  }[];
  resumeQuestions: {
    question: string;
    followUps: string[];
  }[];
  skillGapQuestions: {
    question: string;
    followUps: string[];
  }[];
  behavioralQuestions: {
    question: string;
    followUps: string[];
  }[];
};

type InterviewEvaluation = {
  overallAssessment: string;
  technicalAssessment: string;
  communicationAssessment: string;
  strengths: string[];
  weaknesses: string[];
  concerns: string[];
  recommendation: "PROCEED" | "HOLD" | "REJECT" | "REVIEW_REQUIRED";
  suggestedNextStep: string;
};


const evaluateInterviewApi = (interviewId: string) =>
  api
    .post<{ evaluation: InterviewEvaluation }>(
      `/recruitment/interviews/${interviewId}/ai-evaluation`,
    )
    .then((response) => response.data.evaluation);
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
  publishedAt?: string | null;
  closedAt?: string | null;
  shortlistingCriteria?: {
    enabled?: boolean;
    minimumJobFitScore?: number;
    requiredSkills?: string[];
    minimumExperience?: number;
  };
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



  const [offerLetterFor, setOfferLetterFor] = useState<Candidate | null>(null);
  const [editCandidateFor, setEditCandidateFor] = useState<Candidate | null>(
    null,
  );
  const [deleteCandidateFor, setDeleteCandidateFor] =
    useState<Candidate | null>(null);
  const [editJobOpen, setEditJobOpen] = useState(false);
  const [deleteJobOpen, setDeleteJobOpen] = useState(false);
  const [atsToolsFor, setAtsToolsFor] = useState<Candidate | null>(null);

  const [screeningSearch, setScreeningSearch] = useState("");
  const [screeningStage, setScreeningStage] = useState<
    "ALL" | Candidate["stage"]
  >("ALL");
  const [aiDetailsCandidate, setAiDetailsCandidate] =
    useState<ScreeningCandidate | null>(null);
  const [interviewCopilotFor, setInterviewCopilotFor] =
    useState<Candidate | null>(null);
  const [interviewCopilotData, setInterviewCopilotData] =
    useState<InterviewCopilot | null>(null);
  void interviewCopilotFor;
  const [screeningSource, setScreeningSource] = useState("ALL");
  const [minimumFit, setMinimumFit] = useState(0);
  const [screeningRecommendation, setScreeningRecommendation] = useState("ALL");
  const [screeningSkill, setScreeningSkill] = useState("ALL");
  const [minimumExperience, setMinimumExperience] = useState(0);
  const [minimumRating, setMinimumRating] = useState(0);
  const [shortlistFilter, setShortlistFilter] = useState("ALL");
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [hideSpam, setHideSpam] = useState(false);

  // ATS workspace view. This is additive: the existing pipeline, AI screening,
  // lifecycle, interview, offer and requisition functionality remain.
  const [activeCandidateTab, setActiveCandidateTab] = useState<
    "CANDIDATES" | "PIPELINE"
  >("PIPELINE");

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
  const rankedCandidates = [...(candidates ?? [])]
    .filter((candidate) => candidate.jobFitScore != null)
    .sort(
      (a, b) =>
        (b.jobFitScore ?? 0) - (a.jobFitScore ?? 0),
    )
    .slice(0, 5);
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


  const selectCandidateMutation = useMutation({
    mutationFn: (id: string) => RecruitmentApi.selectCandidate(id),
    onSuccess: (_response, selectedId) => {
      queryClient.setQueryData<Candidate | undefined>(
        ["candidate", selectedId],
        (existing) =>
          existing
            ? { ...existing, stage: "OFFER", finalResult: "SELECTED" }
            : existing,
      );

      queryClient.setQueryData<Candidate[] | undefined>(
        ["candidates", jobId],
        (existing) =>
          existing?.map((item) =>
            item.id === selectedId
              ? { ...item, stage: "OFFER", finalResult: "SELECTED" }
              : item,
          ),
      );

      refreshCandidates();
      showToast("Candidate selected. Offer stage is now available.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const canMoveCandidateToStage = (
    candidate: Candidate,
    targetStage: Candidate["stage"],
  ) => {
    if (candidate.stage === targetStage) {
      return false;
    }

    // Hired candidates are final.
    if (candidate.stage === "HIRED") {
      return false;
    }

    // Rejected candidates are final.
    if (candidate.stage === "REJECTED") {
      return false;
    }

    // Hired should only happen through the hiring lifecycle action.
    if (targetStage === "HIRED") {
      return false;
    }

    return true;
  };

  const screenMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => RecruitmentApi.screenCandidate(id),

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
  const interviewCopilotMutation = useMutation({
    mutationFn: (id: string) => RecruitmentApi.interviewCopilot(id),

    onSuccess: (data, candidateId) => {
      const candidate = (candidates ?? []).find(
        (item) => item.id === candidateId,
      );

      if (!candidate) return;

      setInterviewCopilotData({
        ...data,
        technicalQuestions: data.technicalQuestions.map((question) => ({
          question,
          followUps: [],
        })),
        resumeQuestions: data.resumeQuestions.map((question) => ({
          question,
          followUps: [],
        })),
        skillGapQuestions: data.skillGapQuestions.map((question) => ({
          question,
          followUps: [],
        })),
        behavioralQuestions: data.behavioralQuestions.map((question) => ({
          question,
          followUps: [],
        })),
      });
      setInterviewCopilotFor(candidate);
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

      {job && (
        <CandidateRecruitmentWorkspace
          job={job}
          candidates={candidates ?? []}
          isLoading={candidatesLoading}
          activeTab={activeCandidateTab}
          onTabChange={setActiveCandidateTab}
          onScheduleInterview={setScheduleFor}
          onLifecycle={setLifecycleFor}
          onOffer={setOfferLetterFor}
          onEditCandidate={setEditCandidateFor}
          onDeleteCandidate={setDeleteCandidateFor}
          onOpenAtsTools={setAtsToolsFor}
          onRunAiScreen={(candidate) => screenMutation.mutate({ id: candidate.id })}
          onRunAiInterviewCopilot={(candidate) => {
            setInterviewCopilotData(null);
            interviewCopilotMutation.mutate(candidate.id);
          }}
          onViewAiDetails={(candidate) => setAiDetailsCandidate(candidate)}
          onMoveStage={(candidate, stage) => {
            if (!canMoveCandidateToStage(candidate, stage)) {
              showToast(
                stage === "HIRED"
                  ? "Use the hiring workflow to move a candidate to Hired."
                  : stage === "REJECTED"
                    ? "Use the rejection workflow to reject a candidate."
                    : "This candidate cannot be moved to that stage.",
                "error",
              );
              return;
            }

            stageMutation.mutate({
              id: candidate.id,
              stage,
            });
          }}
          stageMutationPending={stageMutation.isPending}
          selectCandidatePending={selectCandidateMutation.isPending}
          onSelectCandidate={(candidate) =>
            selectCandidateMutation.mutate(candidate.id)
          }
        />
      )}

      {activeCandidateTab === "PIPELINE" && (
        <>
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
            <div className="mt-4 rounded-2xl border border-line/60 bg-canvas p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    AI Candidate Ranking
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    Candidates ranked by their existing AI screening score.
                  </p>
                </div>


              </div>

              {rankedCandidates.length ? (
                <div className="mt-3 space-y-2">
                  {rankedCandidates.slice(0, 5).map((candidate: any) => {
                    const score = candidate.jobFitScore ?? 0;

                    return (
                      <div
                        key={candidate.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line/60 px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                            {candidate.rank}
                          </span>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">
                              {candidate.firstName} {candidate.lastName}
                            </p>
                            <p className="truncate text-[11px] text-ink-faint">
                              {candidate.email}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-ink">
                            {score}/100
                          </p>
                          <p className="text-[10px] uppercase tracking-wide text-ink-faint">
                            AI Score
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-xs text-ink-faint">
                  No screened candidates available for ranking.
                </p>
              )}
            </div>
            <div className="mt-4 rounded-2xl border border-line/60 bg-ink/[0.015] p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
                <div className="relative xl:col-span-4">
                  <label
                    htmlFor="candidate-screening-search"
                    className="mb-2 block text-[12px] font-semibold text-ink"
                  >
                    Search Candidates
                  </label>
                  <div className="relative">
                    <Search
                      size={18}
                      strokeWidth={2}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
                    />
                    <input
                      id="candidate-screening-search"
                      type="search"
                      value={screeningSearch}
                      onChange={(e) => setScreeningSearch(e.target.value)}
                      placeholder="Name, email or source"
                      className="h-10 w-full rounded-xl border border-line bg-white pl-10 pr-10 text-[13px] font-medium text-ink shadow-sm outline-none transition-all placeholder:text-ink-faint hover:border-ink/20 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
                    />
                    {screeningSearch.trim() && (
                      <button
                        type="button"
                        onClick={() => setScreeningSearch("")}
                        aria-label="Clear candidate search"
                        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-ink-faint transition hover:bg-ink/5 hover:text-ink"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="xl:col-span-2">
                  <SelectField
                    label="Stage"
                    value={screeningStage}
                    onChange={(e) =>
                      setScreeningStage(
                        e.target.value as "ALL" | Candidate["stage"],
                      )
                    }
                  >
                    <option value="ALL">All stages</option>
                    {STAGES.map((stage) => (
                      <option key={stage.key} value={stage.key}>
                        {stage.label}
                      </option>
                    ))}
                  </SelectField>
                </div>

                <div className="xl:col-span-2">
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
                </div>

                <div className="xl:col-span-2">
                  <SelectField
                    label="AI Recommendation"
                    value={screeningRecommendation}
                    onChange={(e) => setScreeningRecommendation(e.target.value)}
                  >
                    <option value="ALL">All recommendations</option>
                    <option value="STRONG_YES">Strong Yes</option>
                    <option value="YES">Yes</option>
                    <option value="NO">No</option>
                    <option value="STRONG_NO">Strong No</option>
                  </SelectField>
                </div>

                <div className="xl:col-span-2">
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
                </div>

                <div className="xl:col-span-3">
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
                </div>

                <div className="xl:col-span-3">
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
                </div>

                <div className="xl:col-span-3">
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
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-line/60 bg-white p-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <label className="flex min-w-[240px] flex-1 items-center gap-2 text-[11.5px] text-ink-soft">
                  <span className="whitespace-nowrap">Minimum AI fit</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={10}
                    value={minimumFit}
                    onChange={(e) => setMinimumFit(Number(e.target.value))}
                    className="min-w-[100px] flex-1 accent-brand-600"
                  />
                  <span className="w-9 text-right font-semibold text-ink">
                    {minimumFit}%
                  </span>
                </label>

                <label className="flex items-center gap-2 text-[11.5px] text-ink-soft">
                  <input
                    type="checkbox"
                    checked={hideDuplicates}
                    onChange={(e) => setHideDuplicates(e.target.checked)}
                    className="h-4 w-4 rounded border-line accent-brand-600"
                  />
                  Hide duplicates
                </label>

                <label className="flex items-center gap-2 text-[11.5px] text-ink-soft">
                  <input
                    type="checkbox"
                    checked={hideSpam}
                    onChange={(e) => setHideSpam(e.target.checked)}
                    className="h-4 w-4 rounded border-line accent-brand-600"
                  />
                  Hide suspicious applications
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
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
                  className="text-[11px] font-medium text-brand-600 transition hover:text-brand-700 hover:underline"
                >
                  Clear filters
                </button>
                <span className="flex items-center gap-1.5 rounded-full bg-ink/[0.035] px-2.5 py-1 text-[11px] text-ink-faint">
                  <Filter size={12} />
                  Showing {filteredCandidates.length} of {screeningTotal}
                </span>
              </div>
            </div>

            {/* Filtered candidate results */}
            <div className="mt-4 space-y-2">
              {filteredCandidates.length === 0 ? (
                <div className="rounded-xl border border-line/60 bg-surface p-6 text-center text-xs text-ink-faint">
                  No candidates match the selected filters.
                </div>
              ) : (
                filteredCandidates.map((candidate) => {
                  const item = candidate as ScreeningCandidate;
                  const fitScore =
                    item.jobFitScore ?? item.screening?.score ?? 0;

                  return (
                    <div
                      key={candidate.id}
                      className="flex items-center justify-between gap-4 rounded-xl border border-line/60 bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {candidate.firstName} {candidate.lastName}
                        </p>
                        <p className="text-[11px] text-ink-faint">
                          {candidate.email}
                        </p>
                      </div>

                      <div className="flex items-center gap-6 text-[11px]">
                        <div>
                          <p className="text-ink-faint">Stage</p>
                          <p className="font-medium text-ink">
                            {candidate.stage}
                          </p>
                        </div>

                        <div>
                          <p className="text-ink-faint">AI Score</p>
                          <p className="font-semibold text-ink">
                            {fitScore}/100
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

        </>
      )}

      <AddCandidateModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        jobId={jobId!}
      />

      {
        scheduleFor && (
          <ScheduleInterviewModal
            candidate={scheduleFor}
            onClose={() => setScheduleFor(null)}
          />
        )
      }

      {
        offerLetterFor && (
          <OfferLetterModal
            candidate={offerLetterFor}
            job={job}
            onClose={() => setOfferLetterFor(null)}
          />
        )
      }

      {
        lifecycleFor && (
          <CandidateLifecycleModal
            candidate={lifecycleFor}
            onClose={() => setLifecycleFor(null)}
            job={job}
          />
        )
      }

      {
        editCandidateFor && (
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
        )
      }

      {
        deleteCandidateFor && (
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
        )
      }

      {atsToolsFor && job && (
        <RecruitmentAtsToolsModal
          open
          candidate={atsToolsFor}
          job={job}
          candidates={candidates ?? []}
          onClose={() => setAtsToolsFor(null)}
          onScheduleInterview={() => setScheduleFor(atsToolsFor)}
          onSelectCandidate={(candidate) => setAtsToolsFor(candidate)}
          onOpenPipelineCompare={() => {
            setAtsToolsFor(null);
            setActiveCandidateTab("PIPELINE");
          }}
        />
      )}

      {
        aiDetailsCandidate && (
          <Modal
            open={true}
            onClose={() => setAiDetailsCandidate(null)}
            title={`AI Resume Screening — ${aiDetailsCandidate.firstName} ${aiDetailsCandidate.lastName}`}
            size="lg"
          >
            <div className="space-y-4">
              {aiDetailsCandidate.screening && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-line bg-surface p-3">
                      <p className="text-[10.5px] font-medium text-ink-faint">
                        Job Fit Score
                      </p>

                      <p className="mt-1 text-lg font-semibold text-ink">
                        {aiDetailsCandidate.screening.score}%
                      </p>
                    </div>

                    <div className="rounded-xl border border-line bg-surface p-3">
                      <p className="text-[10.5px] font-medium text-ink-faint">
                        AI Recommendation
                      </p>

                      <div className="mt-1">
                        <Badge
                          tone={
                            aiDetailsCandidate.screening.recommendation === "YES"
                              ? "success"
                              : aiDetailsCandidate.screening.recommendation === "NO"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {aiDetailsCandidate.screening.recommendation}
                        </Badge>
                      </div>
                    </div>

                    <div className="rounded-xl border border-line bg-surface p-3">
                      <p className="text-[10.5px] font-medium text-ink-faint">
                        AI Confidence
                      </p>

                      <div className="mt-1">
                        <Badge
                          tone={
                            aiDetailsCandidate.screening.confidence === "HIGH"
                              ? "success"
                              : aiDetailsCandidate.screening.confidence === "MEDIUM"
                                ? "neutral"
                                : "warning"
                          }
                        >
                          {aiDetailsCandidate.screening.confidence}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {aiDetailsCandidate.screening.strengths?.length ? (
                    <div>
                      <p className="mb-2 text-[12px] font-semibold text-ink">
                        Key strengths
                      </p>

                      <div className="space-y-1.5">
                        {aiDetailsCandidate.screening.strengths.map(
                          (strength, index) => (
                            <div
                              key={`strength-${index}`}
                              className="flex items-start gap-2 text-[12px] text-ink-soft"
                            >
                              <span className="font-semibold text-emerald-600">
                                ✓
                              </span>

                              <span>{strength}</span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ) : null}

                  {aiDetailsCandidate.screening.concerns?.length ? (
                    <div>
                      <p className="mb-2 text-[12px] font-semibold text-ink">
                        Potential concerns
                      </p>

                      <div className="space-y-1.5">
                        {aiDetailsCandidate.screening.concerns.map(
                          (concern, index) => (
                            <div
                              key={`concern-${index}`}
                              className="flex items-start gap-2 text-[12px] text-ink-soft"
                            >
                              <span className="font-semibold text-amber-600">
                                ⚠
                              </span>

                              <span>{concern}</span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ) : null}

                  {aiDetailsCandidate.screening.experienceRelevance && (
                    <div className="rounded-xl border border-line bg-surface p-3">
                      <p className="mb-1 text-[12px] font-semibold text-ink">
                        Experience relevance
                      </p>

                      <p className="text-[12px] leading-5 text-ink-soft">
                        {aiDetailsCandidate.screening.experienceRelevance}
                      </p>
                    </div>
                  )}

                  {aiDetailsCandidate.screening.educationRelevance && (
                    <div className="rounded-xl border border-line bg-surface p-3">
                      <p className="mb-1 text-[12px] font-semibold text-ink">
                        Education relevance
                      </p>

                      <p className="text-[12px] leading-5 text-ink-soft">
                        {aiDetailsCandidate.screening.educationRelevance}
                      </p>
                    </div>
                  )}

                  {aiDetailsCandidate.screening.interviewFocus?.length ? (
                    <div>
                      <p className="mb-2 text-[12px] font-semibold text-ink">
                        Interview focus
                      </p>

                      <div className="space-y-1.5">
                        {aiDetailsCandidate.screening.interviewFocus.map(
                          (focus, index) => (
                            <div
                              key={`focus-${index}`}
                              className="flex items-start gap-2 text-[12px] text-ink-soft"
                            >
                              <span className="font-semibold text-ink-faint">
                                •
                              </span>

                              <span>{focus}</span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ) : null}

                  {aiDetailsCandidate.screening.summary && (
                    <div className="rounded-xl border border-line bg-surface p-3">
                      <p className="mb-1 text-[12px] font-semibold text-ink">
                        Screening summary
                      </p>

                      <p className="text-[12px] leading-5 text-ink-soft">
                        {aiDetailsCandidate.screening.summary}
                      </p>
                    </div>
                  )}

                  {aiDetailsCandidate.screening.evaluatedAt && (
                    <p className="text-[10.5px] text-ink-faint">
                      Evaluated{" "}
                      {formatDate(aiDetailsCandidate.screening.evaluatedAt)}
                    </p>
                  )}

                  <p className="border-t border-line pt-3 text-[10px] leading-4 text-ink-faint">
                    AI screening is assistive only. Final hiring decisions should be
                    made by the recruiter.
                  </p>
                </>
              )}
            </div>
          </Modal>
        )
      }

      {interviewCopilotFor && interviewCopilotData && (
        <Modal
          open={true}
          onClose={() => {
            setInterviewCopilotFor(null);
            setInterviewCopilotData(null);
          }}
          title={`AI Interview Copilot — ${interviewCopilotFor.firstName} ${interviewCopilotFor.lastName}`}
          size="lg"
        >
          <div className="space-y-6">
            {/* Focus Areas */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Focus Areas
              </h3>

              <div className="flex flex-wrap gap-2">
                {interviewCopilotData.focusAreas.map((area) => (
                  <span
                    key={area}
                    className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
                  >
                    {area}
                  </span>
                ))}
              </div>
            </div>

            {/* Technical Questions */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Technical Questions
              </h3>

              <div className="space-y-3">
                {interviewCopilotData.technicalQuestions.map(
                  (item, index) => (
                    <div
                      key={`technical-${index}`}
                      className="rounded-lg border border-line p-3"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {index + 1}. {item.question}
                      </p>

                      {item.followUps.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-slate-500">
                            Follow-ups
                          </p>

                          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">
                            {item.followUps.map(
                              (followUp, followUpIndex) => (
                                <li key={followUpIndex}>{followUp}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>

            {/* Resume-Based Questions */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Resume-Based Questions
              </h3>

              <div className="space-y-3">
                {interviewCopilotData.resumeQuestions.map(
                  (item, index) => (
                    <div
                      key={`resume-${index}`}
                      className="rounded-lg border border-line p-3"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {index + 1}. {item.question}
                      </p>

                      {item.followUps.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-slate-500">
                            Follow-ups
                          </p>

                          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">
                            {item.followUps.map(
                              (followUp, followUpIndex) => (
                                <li key={followUpIndex}>{followUp}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>

            {/* Skill Gap Questions */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Skill Gap Questions
              </h3>

              <div className="space-y-3">
                {interviewCopilotData.skillGapQuestions.map(
                  (item, index) => (
                    <div
                      key={`skill-gap-${index}`}
                      className="rounded-lg border border-line p-3"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {index + 1}. {item.question}
                      </p>

                      {item.followUps.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-slate-500">
                            Follow-ups
                          </p>

                          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">
                            {item.followUps.map(
                              (followUp, followUpIndex) => (
                                <li key={followUpIndex}>{followUp}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>

            {/* Behavioral Questions */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Behavioral Questions
              </h3>

              <div className="space-y-3">
                {interviewCopilotData.behavioralQuestions.map(
                  (item, index) => (
                    <div
                      key={`behavioral-${index}`}
                      className="rounded-lg border border-line p-3"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {index + 1}. {item.question}
                      </p>

                      {item.followUps.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-slate-500">
                            Follow-ups
                          </p>

                          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">
                            {item.followUps.map(
                              (followUp, followUpIndex) => (
                                <li key={followUpIndex}>{followUp}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>

            {/* AI Disclaimer */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-800">
                AI Interview Copilot provides interview preparation
                suggestions based on the job and candidate information.
                Interviewers should use their own judgment when evaluating
                candidates.
              </p>
            </div>
          </div>
        </Modal>
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
   RECRUITMENT CANDIDATE WORKSPACE
   UX-focused candidate acquisition view.
   Existing recruitment actions/APIs are preserved; only presentation changes.
========================================================= */

type CandidateWorkspaceProps = {
  job: RecruitmentJob;
  candidates: Candidate[];
  isLoading: boolean;
  activeTab: "CANDIDATES" | "PIPELINE";
  onTabChange: (tab: "CANDIDATES" | "PIPELINE") => void;
  onScheduleInterview: (candidate: Candidate) => void;
  onLifecycle: (candidate: Candidate) => void;
  onOffer: (candidate: Candidate) => void;
  onEditCandidate: (candidate: Candidate) => void;
  onDeleteCandidate: (candidate: Candidate) => void;
  onOpenAtsTools: (candidate: Candidate) => void;
  onRunAiScreen: (candidate: Candidate) => void;
  onRunAiInterviewCopilot: (candidate: Candidate) => void;
  onViewAiDetails: (candidate: ScreeningCandidate) => void;
  onMoveStage: (candidate: Candidate, stage: Candidate["stage"]) => void;
  stageMutationPending: boolean;
  selectCandidatePending: boolean;
  onSelectCandidate: (candidate: Candidate) => void;
};

function CandidateRecruitmentWorkspace({
  job,
  candidates,
  isLoading,
  activeTab,
  onTabChange,
  onScheduleInterview,
  onLifecycle,
  onOffer,
  onEditCandidate,
  onDeleteCandidate,
  onOpenAtsTools,
  onRunAiScreen,
  onRunAiInterviewCopilot,
  onViewAiDetails,
  onMoveStage,
  stageMutationPending,
  selectCandidatePending,
  onSelectCandidate,
}: CandidateWorkspaceProps) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"ALL" | Candidate["stage"]>("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("LATEST");
  const [selectedId, setSelectedId] = useState<string | null>(candidates[0]?.id ?? null);
  const [showCandidateDetail, setShowCandidateDetail] = useState(false);

  useEffect(() => {
    if (!candidates.length) {
      setSelectedId(null);
      setShowCandidateDetail(false);
      return;
    }

    setSelectedId((current) => {
      if (current && candidates.some((candidate) => candidate.id === current)) {
        return current;
      }
      return candidates[0].id;
    });
  }, [candidates]);

  const counts = STAGES.reduce<Record<Candidate["stage"], number>>(
    (accumulator, stage) => {
      accumulator[stage.key] = candidates.filter(
        (candidate) => candidate.stage === stage.key,
      ).length;
      return accumulator;
    },
    {
      APPLIED: 0,
      SCREENING: 0,
      INTERVIEW: 0,
      OFFER: 0,
      HIRED: 0,
      REJECTED: 0,
    },
  );

  const screenedCount = candidates.filter((candidate) => {
    const item = candidate as ScreeningCandidate;
    return item.jobFitScore != null || item.screening?.score != null;
  }).length;

  const strongFitCount = candidates.filter((candidate) => {
    const item = candidate as ScreeningCandidate;
    return (item.jobFitScore ?? item.screening?.score ?? 0) >= 80;
  }).length;

  const sources = Array.from(
    new Set(candidates.map((candidate) => candidate.source).filter(Boolean)),
  ).sort();

  const filtered = candidates
    .filter((candidate) => {
      const normalizedSearch = search.trim().toLowerCase();
      const name = `${candidate.firstName} ${candidate.lastName}`.toLowerCase();
      const email = String(candidate.email ?? "").toLowerCase();
      const source = String(candidate.source ?? "").toLowerCase();

      return (
        (!normalizedSearch ||
          name.includes(normalizedSearch) ||
          email.includes(normalizedSearch) ||
          source.includes(normalizedSearch)) &&
        (stageFilter === "ALL" || candidate.stage === stageFilter) &&
        (sourceFilter === "ALL" || candidate.source === sourceFilter)
      );
    })
    .sort((a, b) => {
      if (sortBy === "NAME") {
        return `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
        );
      }
      if (sortBy === "MATCH") {
        const aScore = (a as ScreeningCandidate).jobFitScore ??
          (a as ScreeningCandidate).screening?.score ?? 0;
        const bScore = (b as ScreeningCandidate).jobFitScore ??
          (b as ScreeningCandidate).screening?.score ?? 0;
        return bScore - aScore;
      }
      return (
        new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
      );
    });

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedId) ??
    filtered[0] ??
    candidates[0] ??
    null;

  const getStageLabel = (stage: Candidate["stage"]) =>
    STAGES.find((item) => item.key === stage)?.label ?? stage;

  const stageTone = (stage: Candidate["stage"]) => {
    switch (stage) {
      case "OFFER":
      case "HIRED":
        return "success" as const;
      case "REJECTED":
        return "danger" as const;
      default:
        return "neutral" as const;
    }
  };

  const nextStage = selectedCandidate
    ? STAGES[
      Math.min(
        STAGES.findIndex((item) => item.key === selectedCandidate.stage) + 1,
        STAGES.length - 1,
      )
    ]?.key
    : null;

  const nextStageAllowed =
    selectedCandidate && nextStage
      ? nextStage !== "REJECTED" &&
      nextStage !== "HIRED" &&
      nextStage !== selectedCandidate.stage &&
      selectedCandidate.stage !== "HIRED" &&
      selectedCandidate.stage !== "REJECTED"
      : false;

  const { data: selectedCandidateDetails } = useQuery({
    queryKey: ["candidate", selectedCandidate?.id],
    queryFn: () => RecruitmentApi.candidate(selectedCandidate!.id),
    enabled: showCandidateDetail && !!selectedCandidate,
  });

  const { data: selectedInterviews = [] } = useQuery({
    queryKey: ["interviews", selectedCandidate?.id],
    queryFn: () => RecruitmentApi.interviews(selectedCandidate!.id),
    enabled: showCandidateDetail && !!selectedCandidate,
  });

  const detailCandidate = (selectedCandidateDetails ?? selectedCandidate) as
    | ScreeningCandidate
    | null;

  const clearFilters = () => {
    setSearch("");
    setStageFilter("ALL");
    setSourceFilter("ALL");
    setSortBy("LATEST");
  };

  if (showCandidateDetail && detailCandidate) {
    const detailResume = detailCandidate as ScreeningCandidate & {
      resumeUrl?: string | null;
      resumePath?: string | null;
    };
    const detailResumeUrl = detailResume.resumeUrl ?? detailResume.resumePath;
    const detailFit =
      detailCandidate.jobFitScore ?? detailCandidate.screening?.score ?? null;

    return (
      <section className="mt-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowCandidateDetail(false)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-faint transition hover:text-brand-700"
          >
            <ArrowLeft size={14} />
            Back to candidates
          </button>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEditCandidate(detailCandidate)}
              leftIcon={<Pencil size={13} />}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenAtsTools(detailCandidate)}
              leftIcon={<ClipboardCheck size={13} />}
            >
              ATS Tools
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDeleteCandidate(detailCandidate)}
              className="border-red-200 text-red-600 hover:bg-red-50"
              leftIcon={<Trash2 size={13} />}
            >
              Delete
            </Button>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-line/70 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-base font-bold text-brand-700">
                {`${detailCandidate.firstName?.[0] ?? ""}${detailCandidate.lastName?.[0] ?? ""}`.toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="truncate font-display text-xl font-semibold text-ink">
                  {detailCandidate.firstName} {detailCandidate.lastName}
                </h2>
                <p className="mt-1 truncate text-[12px] text-ink-faint">
                  {detailCandidate.email}
                  {detailCandidate.phone ? ` • ${detailCandidate.phone}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={stageTone(detailCandidate.stage)}>
                    {getStageLabel(detailCandidate.stage)}
                  </Badge>
                  {detailFit != null && (
                    <Badge tone="success">{detailFit}% AI Match</Badge>
                  )}
                  {detailCandidate.source && (
                    <Badge tone="neutral">{detailCandidate.source}</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="grid min-w-[260px] grid-cols-3 gap-2">
              <div className="rounded-xl bg-ink/[0.025] p-3 text-center">
                <p className="text-[10px] text-ink-faint">Applied</p>
                <p className="mt-1 text-[11px] font-semibold text-ink">
                  {formatDate(detailCandidate.appliedAt)}
                </p>
              </div>
              <div className="rounded-xl bg-ink/[0.025] p-3 text-center">
                <p className="text-[10px] text-ink-faint">Experience</p>
                <p className="mt-1 text-[11px] font-semibold text-ink">
                  {detailCandidate.experience
                    ? `${detailCandidate.experience} yrs`
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-ink/[0.025] p-3 text-center">
                <p className="text-[10px] text-ink-faint">Rating</p>
                <p className="mt-1 text-[11px] font-semibold text-ink">
                  {detailCandidate.rating ?? 0}/5
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
          <div className="space-y-4">
            <Card>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-ink">Personal information</h3>
                  <p className="mt-1 text-[11px] text-ink-faint">Candidate contact and application details.</p>
                </div>
                <UserCheck size={17} className="text-brand-600" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="First name" value={detailCandidate.firstName} />
                <DetailField label="Last name" value={detailCandidate.lastName} />
                <DetailField label="Email" value={detailCandidate.email} />
                <DetailField label="Phone" value={detailCandidate.phone} />
                <DetailField label="Source" value={detailCandidate.source || "Direct"} />
                <DetailField
                  label="Expected CTC"
                  value={
                    detailCandidate.expectedCtc
                      ? formatCurrencyINR(detailCandidate.expectedCtc)
                      : "—"
                  }
                />
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-ink">Skills</h3>
                  <p className="mt-1 text-[11px] text-ink-faint">Skills extracted or matched during screening.</p>
                </div>
                <Tags size={17} className="text-brand-600" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(
                  new Set([
                    ...(detailCandidate.extractedSkills ?? []),
                    ...(detailCandidate.screening?.matchedSkills ?? []),
                    ...(job.skills ?? []),
                  ].filter(Boolean)),
                ).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-brand-50 px-2.5 py-1 text-[10.5px] font-medium text-brand-700"
                  >
                    {skill}
                  </span>
                ))}
                {!(
                  detailCandidate.extractedSkills?.length ||
                  detailCandidate.screening?.matchedSkills?.length ||
                  job.skills?.length
                ) && <span className="text-[11px] text-ink-faint">No skills available.</span>}
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-ink">Resume</h3>
                  <p className="mt-1 text-[11px] text-ink-faint">Resume and parsed information.</p>
                </div>
                <FileText size={17} className="text-brand-600" />
              </div>
              {detailResumeUrl ? (
                <a
                  href={resolveAssetUrl(detailResumeUrl) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
                >
                  <FileText size={13} />
                  View Resume
                  <ExternalLink size={11} />
                </a>
              ) : (
                <p className="text-[11px] text-ink-faint">No resume uploaded.</p>
              )}

              {detailCandidate.resumeText && (
                <div className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-line/60 bg-surface/50 p-3">
                  <p className="whitespace-pre-wrap text-[11px] leading-5 text-ink-soft">
                    {detailCandidate.resumeText}
                  </p>
                </div>
              )}
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-ink">AI Screening</h3>
                  <p className="mt-1 text-[11px] text-ink-faint">Existing AI screening information and actions.</p>
                </div>
                <Sparkles size={17} className="text-brand-600" />
              </div>

              {detailCandidate.screening ? (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <DetailMetric label="Match score" value={`${detailCandidate.screening.score}%`} />
                    <DetailMetric label="Recommendation" value={detailCandidate.screening.recommendation} />
                    <DetailMetric label="Confidence" value={detailCandidate.screening.confidence} />
                  </div>
                  {detailCandidate.screening.summary && (
                    <p className="rounded-xl bg-surface/60 p-3 text-[11.5px] leading-5 text-ink-soft">
                      {detailCandidate.screening.summary}
                    </p>
                  )}
                  {detailCandidate.screening.strengths?.length > 0 && (
                    <DetailList title="Strengths" items={detailCandidate.screening.strengths} />
                  )}
                  {detailCandidate.screening.concerns?.length > 0 && (
                    <DetailList title="Potential concerns" items={detailCandidate.screening.concerns} />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => onRunAiScreen(detailCandidate)}
                      leftIcon={<Sparkles size={12} />}
                    >
                      Re-screen with AI
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onViewAiDetails(detailCandidate)}
                    >
                      View AI details
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-line p-4">
                  <p className="text-[11.5px] font-medium text-ink">Candidate has not been AI screened yet.</p>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => onRunAiScreen(detailCandidate)}
                    leftIcon={<Sparkles size={12} />}
                  >
                    AI Screen Candidate
                  </Button>
                </div>
              )}
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-ink">Interview history</h3>
                  <p className="mt-1 text-[11px] text-ink-faint">Existing scheduled interviews and feedback.</p>
                </div>
                <Calendar size={17} className="text-brand-600" />
              </div>

              {selectedInterviews.length ? (
                <div className="space-y-2">
                  {selectedInterviews.map((interview) => (
                    <div key={interview.id} className="rounded-xl border border-line/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[12px] font-semibold text-ink">{interview.round}</p>
                          <p className="mt-0.5 text-[10.5px] text-ink-faint">
                            {formatDate(interview.scheduledAt)}
                            {interview.interviewerFirstName
                              ? ` • ${interview.interviewerFirstName} ${interview.interviewerLastName ?? ""}`
                              : ""}
                          </p>
                        </div>
                        <Badge tone={interview.completed ? "success" : "warning"}>
                          {interview.completed ? "Completed" : "Scheduled"}
                        </Badge>
                      </div>
                      {interview.feedback && (
                        <p className="mt-2 text-[11px] leading-5 text-ink-soft">{interview.feedback}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-ink-faint">No interviews scheduled yet.</p>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-ink">Application history</h3>
                  <p className="mt-1 text-[11px] text-ink-faint">Current position in the hiring workflow.</p>
                </div>
                <History size={17} className="text-brand-600" />
              </div>
              <div className="space-y-1.5">
                {STAGES.map((stage, index) => {
                  const currentIndex = STAGES.findIndex((item) => item.key === detailCandidate.stage);
                  const current = stage.key === detailCandidate.stage;
                  const passed = currentIndex >= index;
                  return (
                    <div
                      key={stage.key}
                      className={cx(
                        "flex items-center justify-between rounded-xl px-3 py-2.5",
                        current
                          ? "bg-brand-50 text-brand-700"
                          : passed
                            ? "bg-emerald-50/70 text-emerald-700"
                            : "bg-surface text-ink-faint",
                      )}
                    >
                      <span className="flex items-center gap-2 text-[11px] font-medium">
                        <span
                          className={cx(
                            "h-2 w-2 rounded-full",
                            current ? "bg-brand-500" : passed ? "bg-emerald-500" : "bg-line",
                          )}
                        />
                        {stage.label}
                      </span>
                      {current && <Badge tone="neutral">Current</Badge>}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <h3 className="text-[14px] font-semibold text-ink">Actions</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {nextStageAllowed && nextStage && (
                  <Button
                    size="sm"
                    isLoading={stageMutationPending}
                    onClick={() => onMoveStage(detailCandidate, nextStage)}
                    className="w-full"
                  >
                    Move to {getStageLabel(nextStage)}
                  </Button>
                )}

                {detailCandidate.stage === "INTERVIEW" &&
                  (detailCandidate.finalResult ?? "PENDING") === "PENDING" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      isLoading={selectCandidatePending}
                      onClick={() => onSelectCandidate(detailCandidate)}
                      leftIcon={<UserCheck size={12} />}
                    >
                      Select Candidate
                    </Button>
                  )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onScheduleInterview(detailCandidate)}
                  leftIcon={<Calendar size={12} />}
                >
                  Schedule / View Interview
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onLifecycle(detailCandidate)}
                  leftIcon={<FileText size={12} />}
                >
                  Lifecycle
                </Button>

                {(detailCandidate.finalResult === "SELECTED" || detailCandidate.stage === "OFFER") && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onOffer(detailCandidate)}
                    leftIcon={<Send size={12} />}
                  >
                    {(detailCandidate as Candidate & { offer?: { offerUrl?: string | null } }).offer?.offerUrl
                      ? "View / Manage Offer"
                      : "Generate Offer"}
                  </Button>
                )}

                {detailCandidate.stage === "INTERVIEW" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRunAiInterviewCopilot(detailCandidate)}
                    leftIcon={<Sparkles size={12} />}
                    className="border-brand-200 text-brand-700"
                  >
                    AI Interview Copilot
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenAtsTools(detailCandidate)}
                  leftIcon={<ClipboardCheck size={12} />}
                >
                  ATS Tools
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-7">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[19px] font-semibold text-ink">Job Acquisition</h2>
          <p className="mt-1 text-[12px] text-ink-faint">
            Review candidates by stage, search applications quickly, and open a full candidate workspace when needed.
          </p>
        </div>
      </div>



      <Card className="overflow-hidden" padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-4">
          <div className="flex items-center gap-1 overflow-x-auto">

            <button
              type="button"
              onClick={() => onTabChange("PIPELINE")}
              className={cx(
                "border-b-2 px-3 py-3 text-[12.5px] font-semibold",
                activeTab === "PIPELINE"
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-ink-faint hover:text-ink",
              )}
            >
              Pipeline
            </button>
            <button
              type="button"
              onClick={() => onTabChange("CANDIDATES")}
              className={cx(
                "border-b-2 px-3 py-3 text-[12.5px] font-semibold",
                activeTab === "CANDIDATES"
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-ink-faint hover:text-ink",
              )}
            >
              Candidates ({candidates.length})
            </button>
          </div>
          <div className="hidden items-center gap-2 py-2 md:flex">
            <Badge tone="success">{screenedCount} Screened</Badge>
            <Badge tone="success">{strongFitCount} Strong Fit</Badge>
          </div>
        </div>

        {activeTab === "CANDIDATES" && (
          <div>
            {/* Stage tabs */}
            <div className="border-b border-line/70 bg-surface/30 px-3 py-2">
              <div className="flex w-full">
                {[
                  { key: "ALL" as const, label: "All", count: candidates.length },
                  ...STAGES.map((stage) => ({ key: stage.key, label: stage.label, count: counts[stage.key] })),
                ].map((stage) => (
                  <button
                    key={stage.key}
                    type="button"
                    onClick={() => setStageFilter(stage.key)}
                    className={cx(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition",
                      stageFilter === stage.key
                        ? "bg-brand-600 text-white shadow-sm"
                        : "text-ink-faint hover:bg-white hover:text-ink",
                    )}
                  >
                    {stage.label}
                    <span
                      className={cx(
                        "rounded-full px-1.5 py-0.5 text-[9px]",
                        stageFilter === stage.key ? "bg-white/20 text-white" : "bg-ink/[0.06] text-ink-faint",
                      )}
                    >
                      {stage.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Search + filters */}
            <div className="border-b border-line/70 p-3">
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_170px_170px_150px_auto]">
                <div className="relative">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                  />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, email or source..."
                    className="h-10 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-[12px] outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
                  />
                </div>

                <SelectField label="" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                  <option value="ALL">All sources</option>
                  {sources.map((source) => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </SelectField>

                <SelectField label="" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="LATEST">Newest first</option>
                  <option value="MATCH">Highest AI match</option>
                  <option value="NAME">Name A–Z</option>
                </SelectField>

                <div className="flex h-10 items-center rounded-xl border border-line bg-white px-3 text-[11px] text-ink-faint">
                  <SlidersHorizontal size={14} className="mr-2 text-brand-600" />
                  {filtered.length} shown
                </div>

                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear
                </Button>
              </div>
            </div>

            {/* Candidate list */}
            {isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 7 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : filtered.length ? (
              <div className="overflow-x-auto">
                <div className="min-w-[860px]">
                  <div className="grid grid-cols-[minmax(240px,1.7fr)_100px_110px_120px_110px_120px_44px] gap-2 border-b border-line/60 bg-ink/[0.018] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                    <span>Candidate</span>
                    <span>AI Match</span>
                    <span>Experience</span>
                    <span>Source</span>
                    <span>Applied</span>
                    <span>Status</span>
                    <span />
                  </div>

                  {filtered.map((candidate) => {
                    const item = candidate as ScreeningCandidate;
                    const fit = item.jobFitScore ?? item.screening?.score ?? null;
                    const isSelected = selectedId === candidate.id;

                    return (
                      <button
                        type="button"
                        key={candidate.id}
                        onClick={() => {
                          setSelectedId(candidate.id);
                          setShowCandidateDetail(true);
                        }}
                        className={cx(
                          "grid w-full grid-cols-[minmax(240px,1.7fr)_100px_110px_120px_110px_120px_44px] gap-2 border-b border-line/50 px-4 py-3 text-left transition hover:bg-brand-50/40",
                          isSelected && "bg-brand-50/50",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-[11px] font-bold text-brand-700">
                            {`${candidate.firstName?.[0] ?? ""}${candidate.lastName?.[0] ?? ""}`.toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[12px] font-semibold text-ink">
                              {candidate.firstName} {candidate.lastName}
                            </span>
                            <span className="mt-0.5 block truncate text-[10.5px] text-ink-faint">
                              {candidate.email}
                            </span>
                          </span>
                        </span>

                        <span className="flex items-center">
                          {fit != null ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                              {fit}%
                            </span>
                          ) : (
                            <span className="text-[10px] text-ink-faint">—</span>
                          )}
                        </span>

                        <span className="flex items-center text-[10.5px] text-ink-soft">
                          {item.experience ? `${item.experience} yrs` : "—"}
                        </span>

                        <span className="flex min-w-0 items-center text-[10.5px] text-ink-soft">
                          <span className="truncate">{candidate.source || "Direct"}</span>
                        </span>

                        <span className="flex items-center text-[10.5px] text-ink-faint">
                          {formatDate(candidate.appliedAt)}
                        </span>

                        <span className="flex items-center">
                          <Badge tone={stageTone(candidate.stage)}>{getStageLabel(candidate.stage)}</Badge>
                        </span>

                        <span className="flex items-center justify-end text-ink-faint">
                          <ChevronRight size={15} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="px-4 py-14 text-center">
                <Users size={26} className="mx-auto text-ink-faint" />
                <p className="mt-2 text-[13px] font-medium text-ink">No candidates found</p>
                <p className="mt-1 text-[11px] text-ink-faint">Try changing the stage, search or source filter.</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-4 py-3 text-[10.5px] text-ink-faint">
              <span>Showing {filtered.length} of {candidates.length} candidates</span>
              <span>{job.openings ?? 0} opening{Number(job.openings ?? 0) === 1 ? "" : "s"}</span>
            </div>
          </div>
        )}

        {activeTab === "PIPELINE" && (
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold text-ink">Pipeline Overview</p>
                <p className="mt-0.5 text-[10.5px] text-ink-faint">Use this view for stage distribution and drag/drop workflow.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onTabChange("CANDIDATES")}>
                View candidates
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {STAGES.map((stage) => (
                <button
                  key={stage.key}
                  type="button"
                  onClick={() => {
                    setStageFilter(stage.key);
                    onTabChange("CANDIDATES");
                  }}
                  className="rounded-2xl border border-line/70 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-ink-faint">{stage.label}</span>
                    <Badge tone={stageTone(stage.key)}>{counts[stage.key]}</Badge>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-ink">{counts[stage.key]}</p>
                  <p className="mt-1 text-[10px] text-ink-faint">Open candidates</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl bg-ink/[0.025] p-3">
      <p className="text-[10px] text-ink-faint">{label}</p>
      <p className="mt-1 break-words text-[11.5px] font-medium text-ink">{value || "Not provided"}</p>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/60 bg-surface/50 p-3">
      <p className="text-[10px] text-ink-faint">{label}</p>
      <p className="mt-1 text-[13px] font-semibold text-ink">{value}</p>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold text-ink">{title}</p>
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex items-start gap-2 text-[11px] text-ink-soft">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type AtsCommunication = {
  id: string; channel: "EMAIL" | "PHONE" | "NOTE"; subject: string; message: string; createdAt: string;
};
type AtsAssessment = {
  id: string; name: string; score: number; maxScore: number; status: "COMPLETED" | "PENDING"; notes: string; createdAt: string;
};
type AtsTimelineItem = { id: string; title: string; description?: string; createdAt: string };
type AtsLocalData = {
  communications: AtsCommunication[]; assessments: AtsAssessment[]; tags: string[]; talentPool: boolean; timeline: AtsTimelineItem[];
};
const atsEmpty = (): AtsLocalData => ({ communications: [], assessments: [], tags: [], talentPool: false, timeline: [] });
const atsKey = (id: string) => `aadhyaraj-hrms:recruitment:ats:${id}`;
function readAtsData(id: string): AtsLocalData {
  if (typeof window === "undefined") return atsEmpty();
  try {
    const raw = window.localStorage.getItem(atsKey(id));
    if (!raw) return atsEmpty();
    const value = JSON.parse(raw) as Partial<AtsLocalData>;
    return {
      communications: Array.isArray(value.communications) ? value.communications : [],
      assessments: Array.isArray(value.assessments) ? value.assessments : [],
      tags: Array.isArray(value.tags) ? value.tags : [],
      talentPool: value.talentPool === true,
      timeline: Array.isArray(value.timeline) ? value.timeline : [],
    };
  } catch { return atsEmpty(); }
}
function writeAtsData(id: string, value: AtsLocalData) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(atsKey(id), JSON.stringify(value)); } catch { /* ignore */ }
}

type RecruitmentAtsToolsModalProps = {
  open: boolean; candidate: Candidate; job: RecruitmentJob; candidates: Candidate[];
  onClose: () => void; onScheduleInterview: () => void;
  onSelectCandidate: (candidate: Candidate) => void; onOpenPipelineCompare: () => void;
};

function RecruitmentAtsToolsModal({
  open, candidate, job, candidates, onClose, onScheduleInterview, onSelectCandidate, onOpenPipelineCompare,
}: RecruitmentAtsToolsModalProps) {
  type Tab = "SCORECARD" | "TIMELINE" | "SCHEDULING" | "COMMUNICATION" | "DUPLICATES" | "COMPARE" | "ASSESSMENTS" | "TAGS" | "TALENT_POOL" | "ANALYTICS";
  const [tab, setTab] = useState<Tab>("SCORECARD");
  const [data, setData] = useState<AtsLocalData>(() => readAtsData(candidate.id));
  const [channel, setChannel] = useState<AtsCommunication["channel"]>("EMAIL");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [assessmentName, setAssessmentName] = useState("");
  const [assessmentScore, setAssessmentScore] = useState("");
  const [assessmentMax, setAssessmentMax] = useState("100");
  const [assessmentStatus, setAssessmentStatus] = useState<AtsAssessment["status"]>("COMPLETED");
  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [tag, setTag] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([candidate.id]);

  const { data: interviews = [], isLoading: interviewsLoading } = useQuery({
    queryKey: ["ats-tools-interviews", candidate.id],
    queryFn: () => RecruitmentApi.interviews(candidate.id),
    enabled: open,
  });

  useEffect(() => {
    setData(readAtsData(candidate.id)); setTab("SCORECARD"); setCompareIds([candidate.id]);
  }, [candidate.id]);
  useEffect(() => { writeAtsData(candidate.id, data); }, [candidate.id, data]);

  const c = candidate as ScreeningCandidate;
  const fit = c.jobFitScore ?? c.screening?.score ?? null;
  const duplicateIds = getDuplicateCandidateIds(candidates);
  const duplicates = candidates.filter((x) => x.id !== candidate.id && duplicateIds.has(x.id));
  const saveCommunication = () => {
    if (!message.trim()) return;
    const now = new Date().toISOString();
    const item: AtsCommunication = { id: String(Date.now()), channel, subject: subject.trim(), message: message.trim(), createdAt: now };
    setData((x) => ({ ...x, communications: [item, ...x.communications], timeline: [{ id: `${item.id}-t`, title: `${channel} communication logged`, description: item.subject || item.message.slice(0, 100), createdAt: now }, ...x.timeline].slice(0, 100) }));
    setSubject(""); setMessage("");
  };
  const addAssessment = () => {
    const score = Number(assessmentScore), maxScore = Number(assessmentMax);
    if (!assessmentName.trim() || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return;
    const now = new Date().toISOString();
    const item: AtsAssessment = { id: String(Date.now()), name: assessmentName.trim(), score, maxScore, status: assessmentStatus, notes: assessmentNotes.trim(), createdAt: now };
    setData((x) => ({ ...x, assessments: [item, ...x.assessments], timeline: [{ id: `${item.id}-t`, title: `Assessment added: ${item.name}`, description: `${item.score}/${item.maxScore}`, createdAt: now }, ...x.timeline].slice(0, 100) }));
    setAssessmentName(""); setAssessmentScore(""); setAssessmentMax("100"); setAssessmentNotes("");
  };
  const addTag = () => {
    const value = tag.trim();
    if (!value || data.tags.some((x) => x.toLowerCase() === value.toLowerCase())) return;
    setData((x) => ({ ...x, tags: [...x.tags, value], timeline: [{ id: `${Date.now()}-tag`, title: `Tag added: ${value}`, createdAt: new Date().toISOString() }, ...x.timeline].slice(0, 100) }));
    setTag("");
  };
  const toggleTalentPool = () => {
    const next = !data.talentPool;
    setData((x) => ({ ...x, talentPool: next, timeline: [{ id: `${Date.now()}-pool`, title: next ? "Added to Talent Pool" : "Removed from Talent Pool", createdAt: new Date().toISOString() }, ...x.timeline].slice(0, 100) }));
  };
  const toggleCompare = (id: string) => setCompareIds((x) => x.includes(id) ? x.filter((v) => v !== id) : x.length < 3 ? [...x, id] : x);
  const compare = candidates.filter((x) => compareIds.includes(x.id));
  const counts = Object.fromEntries(STAGES.map((s) => [s.key, candidates.filter((x) => x.stage === s.key).length])) as Record<Candidate["stage"], number>;
  const screened = candidates.filter((x) => { const y = x as ScreeningCandidate; return y.jobFitScore != null || y.screening?.score != null; }).length;
  const avgFit = candidates.length ? Math.round(candidates.reduce((sum, x) => { const y = x as ScreeningCandidate; return sum + (y.jobFitScore ?? y.screening?.score ?? 0); }, 0) / candidates.length) : 0;
  const hireRate = candidates.length ? Math.round((counts.HIRED / candidates.length) * 100) : 0;
  const avgAge = candidates.length ? Math.round(candidates.reduce((sum, x) => { const t = new Date(x.appliedAt).getTime(); return sum + (Number.isFinite(t) ? Math.max(0, Date.now() - t) : 0) }, 0) / candidates.length / 86400000) : 0;
  const sourceCounts = Array.from(candidates.reduce((m, x) => { const k = x.source || "Direct"; m.set(k, (m.get(k) ?? 0) + 1); return m; }, new Map<string, number>())).sort((a, b) => b[1] - a[1]);
  const timeline: AtsTimelineItem[] = [
    { id: "application", title: "Application received", description: `${candidate.source || "Direct"} • ${job.title}`, createdAt: candidate.appliedAt },
    ...(c.screening?.evaluatedAt ? [{ id: "screening", title: "AI screening completed", description: fit != null ? `Fit score ${fit}%` : undefined, createdAt: c.screening.evaluatedAt }] : []),
    ...interviews.map(x => ({ id: `i-${x.id}`, title: x.completed ? `${x.round} completed` : `${x.round} scheduled`, description: x.meetingLink ? "Video interview available" : undefined, createdAt: x.scheduledAt })),
    ...data.timeline,
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const tabs: Array<[Tab, string, ReactNode]> = [
    ["SCORECARD", "Scorecard", <ClipboardCheck size={14} />], ["TIMELINE", "Timeline", <History size={14} />], ["SCHEDULING", "Scheduling", <Calendar size={14} />],
    ["COMMUNICATION", "Communication", <Mail size={14} />], ["DUPLICATES", "Duplicates", <Copy size={14} />], ["COMPARE", "Compare", <GitCompare size={14} />],
    ["ASSESSMENTS", "Assessments", <ClipboardCheck size={14} />], ["TAGS", "Tags", <Tags size={14} />], ["TALENT_POOL", "Talent Pool", <UserRoundPlus size={14} />], ["ANALYTICS", "Analytics", <BarChart3 size={14} />],
  ];

  let content: ReactNode = null;
  if (tab === "SCORECARD") content = <div className="space-y-3">
    <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3"><p className="text-[12px] font-semibold text-ink">Structured Interview Scorecards</p><p className="mt-1 text-[10.5px] text-ink-faint">Interview feedback now supports structured 1–5 criteria.</p></div>
    {interviewsLoading ? <Skeleton className="h-20 rounded-xl" /> : interviews.length ? interviews.map(x => { const y = x as Interview & { scorecard?: Array<{ criterion: string; score: number; comment?: string }> }; return <div key={x.id} className="rounded-xl border border-line/70 p-3"><div className="flex justify-between gap-2"><div><p className="text-[12px] font-semibold">{x.round}</p><p className="text-[10px] text-ink-faint">{formatDate(x.scheduledAt)}</p></div><Badge tone={x.completed ? "success" : "warning"}>{x.completed ? "Completed" : "Scheduled"}</Badge></div>{y.scorecard?.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{y.scorecard.map(s => <div key={s.criterion} className="rounded-lg bg-surface p-2"><span className="text-[10.5px]">{s.criterion}</span><Badge tone={s.score >= 4 ? "success" : s.score <= 2 ? "warning" : "neutral"}>{s.score}/5</Badge>{s.comment && <p className="mt-1 text-[10px] text-ink-faint">{s.comment}</p>}</div>)}</div> : <p className="mt-2 text-[10.5px] text-ink-faint">No scorecard submitted.</p>}{!x.completed && <Button size="sm" className="mt-2" onClick={onScheduleInterview}>Open interview feedback</Button>}</div> }) : <div className="rounded-xl border border-dashed border-line p-5 text-center"><p className="text-[12px] font-semibold">No interview yet</p><Button size="sm" className="mt-2" onClick={onScheduleInterview}>Schedule interview</Button></div>}
  </div>;
  else if (tab === "TIMELINE") content = <div className="space-y-2">{timeline.map(x => <div key={x.id} className="flex gap-3 rounded-xl border border-line/60 p-3"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" /><div className="flex-1"><div className="flex justify-between gap-2"><p className="text-[11.5px] font-semibold">{x.title}</p><span className="text-[10px] text-ink-faint">{formatDate(x.createdAt)}</span></div>{x.description && <p className="mt-1 text-[10.5px] text-ink-faint">{x.description}</p>}</div></div>)}</div>;
  else if (tab === "SCHEDULING") content = <div className="space-y-3"><div className="flex justify-between gap-2"><div><p className="text-[12px] font-semibold">Interview Calendar</p><p className="text-[10.5px] text-ink-faint">Uses the existing HRMS interview scheduling API.</p></div><Button size="sm" onClick={onScheduleInterview} leftIcon={<Calendar size={12} />}>Schedule interview</Button></div>{interviews.map(x => <div key={x.id} className="rounded-xl border border-line/70 p-3"><div className="flex justify-between"><span className="text-[11.5px] font-semibold">{x.round}</span><Badge tone={x.completed ? "success" : "warning"}>{x.completed ? "Completed" : "Upcoming"}</Badge></div><p className="mt-1 text-[10.5px] text-ink-faint">{formatDate(x.scheduledAt)}</p>{x.meetingLink && <a href={x.meetingLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-brand-600"><Video size={12} />Join meeting<ExternalLink size={10} /></a>}</div>)}</div>;
  else if (tab === "COMMUNICATION") content = <div className="space-y-3"><div className="grid gap-2 sm:grid-cols-[130px_1fr]"><SelectField label="Channel" value={channel} onChange={e => setChannel(e.target.value as AtsCommunication["channel"])}><option value="EMAIL">Email</option><option value="PHONE">Phone</option><option value="NOTE">Internal Note</option></SelectField><TextField label="Subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Interview invitation" /></div><textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Log communication..." className="w-full rounded-xl border border-line px-3 py-2.5 text-[12px]" /><div className="flex gap-2"><Button size="sm" onClick={saveCommunication} disabled={!message.trim()} leftIcon={<Save size={12} />}>Save log</Button>{candidate.email && <a className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-3 text-[11px]" href={`mailto:${candidate.email}`}><Mail size={12} />Open email</a>}</div>{data.communications.map(x => <div key={x.id} className="rounded-xl border border-line/60 p-3"><div className="flex justify-between"><Badge tone="neutral">{x.channel}</Badge><span className="text-[10px] text-ink-faint">{formatDate(x.createdAt)}</span></div>{x.subject && <p className="mt-2 text-[11.5px] font-semibold">{x.subject}</p>}<p className="mt-1 whitespace-pre-wrap text-[10.5px] text-ink-soft">{x.message}</p></div>)}</div>;
  else if (tab === "DUPLICATES") content = <div className="space-y-3"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[12px] font-semibold text-amber-900">Duplicate Detection</p><p className="mt-1 text-[10.5px] text-amber-800">Uses existing duplicate logic. Merge is not triggered because no merge endpoint exists in the current API.</p></div>{duplicates.length ? duplicates.map(x => <div key={x.id} className="flex items-center justify-between rounded-xl border p-3"><div><p className="text-[12px] font-semibold">{x.firstName} {x.lastName}</p><p className="text-[10.5px] text-ink-faint">{x.email} • {x.source || "Direct"}</p></div><Button size="sm" variant="outline" onClick={() => onSelectCandidate(x)}>View</Button></div>) : <div className="p-6 text-center"><CheckCircle2 size={22} className="mx-auto text-emerald-600" /><p className="mt-2 text-[12px] font-semibold">No duplicate match found</p></div>}</div>;
  else if (tab === "COMPARE") content = <div className="space-y-3"><div className="flex justify-between gap-2"><p className="text-[12px] font-semibold">Candidate Comparison</p><Button size="sm" variant="outline" onClick={onOpenPipelineCompare} leftIcon={<GitCompare size={12} />}>Pipeline compare</Button></div><div className="grid gap-2 sm:grid-cols-2">{candidates.map(x => <label key={x.id} className="flex items-center gap-2 rounded-lg border p-2"><input type="checkbox" checked={compareIds.includes(x.id)} onChange={() => toggleCompare(x.id)} className="h-4 w-4 accent-brand-600" /><span className="text-[11px]">{x.firstName} {x.lastName}</span></label>)}</div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-[11px]"><thead><tr className="border-b"><th className="p-2 text-left">Metric</th>{compare.map(x => <th key={x.id} className="p-2 text-left">{x.firstName} {x.lastName}</th>)}</tr></thead><tbody>{[["Stage", (x: Candidate) => x.stage], ["AI Match", (x: Candidate) => { const y = x as ScreeningCandidate; return y.jobFitScore ?? y.screening?.score ?? "—"; }], ["Experience", (x: Candidate) => (x as ScreeningCandidate).experience ?? "—"], ["Rating", (x: Candidate) => x.rating ?? 0], ["Source", (x: Candidate) => x.source || "Direct"]].map(([label, get]) => <tr key={String(label)} className="border-b border-line/50"><td className="p-2 text-ink-faint">{String(label)}</td>{compare.map(x => <td key={x.id} className="p-2 font-medium">{String((get as (x: Candidate) => unknown)(x))}</td>)}</tr>)}</tbody></table></div></div>;
  else if (tab === "ASSESSMENTS") content = <div className="space-y-3"><div className="grid gap-2 sm:grid-cols-2"><TextField label="Assessment" value={assessmentName} onChange={e => setAssessmentName(e.target.value)} placeholder="Coding test" /><SelectField label="Status" value={assessmentStatus} onChange={e => setAssessmentStatus(e.target.value as AtsAssessment["status"])}><option value="COMPLETED">Completed</option><option value="PENDING">Pending</option></SelectField><TextField label="Score" type="number" value={assessmentScore} onChange={e => setAssessmentScore(e.target.value)} /><TextField label="Max score" type="number" value={assessmentMax} onChange={e => setAssessmentMax(e.target.value)} /></div><textarea value={assessmentNotes} onChange={e => setAssessmentNotes(e.target.value)} rows={3} placeholder="Assessment notes..." className="w-full rounded-xl border border-line px-3 py-2.5 text-[12px]" /><Button size="sm" onClick={addAssessment} leftIcon={<PlusCircle size={12} />}>Add assessment</Button>{data.assessments.map(x => <div key={x.id} className="rounded-xl border border-line/60 p-3"><div className="flex justify-between"><span className="text-[11.5px] font-semibold">{x.name}</span><Badge tone={x.status === "COMPLETED" ? "success" : "warning"}>{x.status === "COMPLETED" ? `${x.score}/${x.maxScore}` : "Pending"}</Badge></div>{x.notes && <p className="mt-1 text-[10.5px] text-ink-faint">{x.notes}</p>}</div>)}</div>;
  else if (tab === "TAGS") content = <div className="space-y-3"><div className="flex flex-wrap gap-2">{data.tags.map(x => <span key={x} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[10.5px] font-semibold text-brand-700">{x}<button type="button" onClick={() => setData(d => ({ ...d, tags: d.tags.filter(t => t !== x) }))}><X size={10} /></button></span>)}</div><div className="flex gap-2"><input value={tag} onChange={e => setTag(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="Immediate Joiner, Python..." className="h-9 flex-1 rounded-lg border px-3 text-[11px]" /><Button size="sm" onClick={addTag}>Add tag</Button></div></div>;
  else if (tab === "TALENT_POOL") content = <div className="space-y-4"><div className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><p className="text-[13px] font-semibold">Talent Pool</p><p className="mt-1 text-[11px] text-ink-faint">Keep strong candidates available for future roles.</p></div><Badge tone={data.talentPool ? "success" : "neutral"}>{data.talentPool ? "In Talent Pool" : "Not Added"}</Badge></div><Button size="sm" className="mt-4" onClick={toggleTalentPool} leftIcon={<UserRoundPlus size={12} />}>{data.talentPool ? "Remove from Talent Pool" : "Add to Talent Pool"}</Button></div><div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3"><p className="text-[11px] font-semibold">Role skills</p><div className="mt-2 flex flex-wrap gap-1.5">{(job.skills ?? []).map(x => <Badge key={x} tone="neutral">{x}</Badge>)}</div></div></div>;
  else { content = <div className="space-y-4"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[["Applications", candidates.length], ["Screened", screened], ["Interviews", counts.INTERVIEW], ["Hired", counts.HIRED]].map(([k, v]) => <div key={String(k)} className="rounded-xl border p-3"><p className="text-[10px] text-ink-faint">{String(k)}</p><p className="mt-1 text-lg font-semibold">{String(v)}</p></div>)}</div><div className="grid gap-2 sm:grid-cols-3"><div className="rounded-xl border p-3"><p className="text-[10px] text-ink-faint">Hire conversion</p><p className="text-lg font-semibold">{hireRate}%</p></div><div className="rounded-xl border p-3"><p className="text-[10px] text-ink-faint">Average AI fit</p><p className="text-lg font-semibold">{avgFit}%</p></div><div className="rounded-xl border p-3"><p className="text-[10px] text-ink-faint">Avg application age</p><p className="text-lg font-semibold">{avgAge} days</p></div></div><div className="rounded-xl border p-3"><p className="text-[12px] font-semibold">Source mix</p>{sourceCounts.map(([k, v]) => <div key={k} className="mt-2 flex justify-between text-[10.5px]"><span>{k}</span><span className="font-semibold">{v}</span></div>)}</div><div className="rounded-xl border p-3"><p className="text-[12px] font-semibold">Pipeline</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{STAGES.map(s => <div key={s.key} className="rounded-lg bg-surface p-2"><span className="text-[10px] text-ink-faint">{s.label}</span><p className="font-semibold">{counts[s.key]}</p></div>)}</div></div><p className="text-[10px] text-ink-faint">Analytics are calculated from the current job candidate dataset.</p></div>; }

  return <Modal open={open} onClose={onClose} title={`ATS Toolkit — ${candidate.firstName} ${candidate.lastName}`} size="lg">
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-line/70 bg-surface/40 p-2">{tabs.map(([key, label, icon]) => <button key={key} type="button" onClick={() => setTab(key)} className={cx("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10.5px] font-semibold", tab === key ? "bg-brand-600 text-white" : "text-ink-faint hover:bg-white hover:text-ink")}>{icon}{label}</button>)}</div>
      <div className="max-h-[68vh] overflow-y-auto pr-1">{content}</div>
    </div>
  </Modal>;
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
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CandidateForm>({
    resolver: zodResolver(candidateSchema),
  });

  useEffect(() => {
    if (!open) {
      reset();
      setResumeFile(null);
    }
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: async (values: CandidateForm) => {
      if (resumeFile) {
        const fileName = resumeFile.name.toLowerCase();
        const hasAllowedExtension = ALLOWED_RESUME_EXTENSIONS.some((ext) =>
          fileName.endsWith(ext),
        );

        if (
          !hasAllowedExtension ||
          !ALLOWED_RESUME_TYPES.has(resumeFile.type)
        ) {
          throw new Error("Resume must be a PDF, DOC or DOCX file.");
        }

        if (resumeFile.size > MAX_RESUME_SIZE_BYTES) {
          throw new Error("Resume size must not exceed 5 MB.");
        }
      }

      // Create the candidate first so we have a candidate ID for the
      // dedicated resume-upload endpoint.
      const candidate = await RecruitmentApi.createCandidate({
        jobPostingId: jobId,
        ...values,
      });

      if (resumeFile) {
        const formData = new FormData();
        formData.append("resume", resumeFile);

        try {
          await api.post(
            `/recruitment/candidates/${candidate.id}/resume/upload`,
            formData,
            {
              headers: {
                "Content-Type": "multipart/form-data",
              },
            },
          );

          // Parse the uploaded resume immediately so screening can use the
          // extracted resume text and skills.
          await RecruitmentApi.parseResume(candidate.id);
        } catch (error) {
          throw new Error(
            `Candidate was added, but the resume could not be uploaded or parsed. ${getErrorMessage(error)}`,
          );
        }
      }

      return candidate;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["candidates", jobId],
      });

      queryClient.invalidateQueries({
        queryKey: ["recruitment", "pipeline"],
      });

      showToast(
        resumeFile
          ? "Candidate added and resume uploaded."
          : "Candidate added.",
      );

      reset();
      setResumeFile(null);
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
          <Button
            variant="outline"
            onClick={onClose}
            disabled={mutation.isPending}
          >
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
            Resume
          </label>
          <p className="mb-2 text-[11px] text-brand-600">
            💡 Upload a resume to automatically extract and fill in the candidate's details.
          </p>
          <div className="rounded-xl border border-dashed border-line bg-surface/40 p-3">
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={mutation.isPending}
              onChange={async (event) => {
                const file = event.target.files?.[0] ?? null;

                if (!file) {
                  setResumeFile(null);
                  return;
                }

                const fileName = file.name.toLowerCase();
                const hasAllowedExtension = ALLOWED_RESUME_EXTENSIONS.some((ext) =>
                  fileName.endsWith(ext),
                );

                if (
                  !hasAllowedExtension ||
                  !ALLOWED_RESUME_TYPES.has(file.type)
                ) {
                  showToast("Resume must be a PDF, DOC or DOCX file.", "error");
                  event.target.value = "";
                  return;
                }

                if (file.size > MAX_RESUME_SIZE_BYTES) {
                  showToast("Resume size must not exceed 5 MB.", "error");
                  event.target.value = "";
                  return;
                }

                setResumeFile(file);
                setIsAnalyzingResume(true);

                try {
                  const formData = new FormData();
                  formData.append("resume", file);

                  const response = await api.post<{
                    message: string;
                    autofill: {
                      firstName: string;
                      lastName: string;
                      email: string;
                      phone: string;
                    };
                  }>("/recruitment/candidates/resume/autofill", formData, {
                    headers: {
                      "Content-Type": "multipart/form-data",
                    },
                  });

                  const autofill = response.data.autofill;

                  if (autofill.firstName) {
                    setValue("firstName", autofill.firstName);
                  }

                  if (autofill.lastName) {
                    setValue("lastName", autofill.lastName);
                  }

                  if (autofill.email) {
                    setValue("email", autofill.email);
                  }

                  if (autofill.phone) {
                    setValue("phone", autofill.phone);
                  }

                  showToast("Resume analyzed and candidate details filled.");
                } catch (error) {
                  showToast(
                    `Resume analysis failed. ${getErrorMessage(error)}`,
                    "error",
                  );
                } finally {
                  setIsAnalyzingResume(false);
                }
              }}
              className="block w-full text-[12px] text-ink-faint file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-[11px] file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />

            <p className="mt-1.5 text-[10.5px] text-ink-faint">
              Upload the candidate's resume. PDF, DOC and DOCX files are
              supported.
            </p>
            {isAnalyzingResume && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span>AI is analyzing the resume...</span>
              </div>
            )}
            {resumeFile && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-[11px] text-ink">
                <FileText size={13} className="shrink-0 text-brand-600" />
                <span className="min-w-0 flex-1 truncate">
                  {resumeFile.name}
                </span>
                <button
                  type="button"
                  disabled={mutation.isPending || isAnalyzingResume}
                  onClick={() => setResumeFile(null)}
                  className="shrink-0 font-medium text-red-600 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
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
        <SelectField label="Status" required {...register("status")}>
          <option value="OPEN">Open</option>
          <option value="ON_HOLD">On hold</option>
          <option value="CLOSED">Closed</option>
        </SelectField>
        <TextField
          label="Minimum experience"
          required
          type="number"
          min="0"
          {...register("experienceMin", { valueAsNumber: true })}
        />
        <TextField
          label="Maximum experience"
          required
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
          required
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
          required
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
            Job description <span className="text-danger-500">*</span>
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

  const [interviewEvaluationFor, setInterviewEvaluationFor] =
    useState<Interview | null>(null);

  const [interviewEvaluationData, setInterviewEvaluationData] =
    useState<InterviewEvaluation | null>(null);

  const [feedbackText, setFeedbackText] = useState("");
  const [scorecard, setScorecard] = useState<Array<{ criterion: string; score: number; comment: string }>>([
    { criterion: "Technical Skills", score: 0, comment: "" },
    { criterion: "Problem Solving", score: 0, comment: "" },
    { criterion: "Communication", score: 0, comment: "" },
    { criterion: "Role Knowledge", score: 0, comment: "" },
    { criterion: "Culture / Team Fit", score: 0, comment: "" },
  ]);

  const [recommendation, setRecommendation] = useState<
    "STRONG_YES" | "YES" | "NO" | "STRONG_NO"
  >("YES");

  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState("");

  const recordingMutation = useMutation({
    mutationFn: (input: { id: string; url: string | null }) =>
      RecruitmentApi.updateInterviewRecording(input.id, input.url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviews", candidate.id] });
      showToast("Interview recording updated.");
      setRecordingFor(null);
      setRecordingUrl("");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

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
      scorecard?: Array<{
        criterion: string;
        score: number;
        comment?: string;
      }>;
    }) =>
      RecruitmentApi.submitFeedback(
        input.id,
        input.feedback,
        input.recommendation,
        input.scorecard ?? [],
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
  const interviewEvaluationMutation = useMutation({
    mutationFn: (id: string) => evaluateInterviewApi(id),

    onSuccess: (data) => {
      setInterviewEvaluationData(data);
      showToast("AI interview evaluation generated.");
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
                    {interview.meetingLink && (
                      <a
                        href={interview.meetingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-[11px] font-medium text-brand-600 hover:underline"
                      >
                        Open video interview
                      </a>
                    )}
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

                {interview.completed && (
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Sparkles size={12} />}
                    isLoading={
                      interviewEvaluationMutation.isPending &&
                      interviewEvaluationMutation.variables === interview.id
                    }
                    onClick={() => {
                      setInterviewEvaluationFor(interview);
                      setInterviewEvaluationData(null);
                      interviewEvaluationMutation.mutate(interview.id);
                    }}
                  >
                    AI Interview Evaluation
                  </Button>
                )}

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
                {interviewEvaluationFor?.id === interview.id &&
                  interviewEvaluationData && (
                    <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12px] font-semibold text-ink">
                          AI Interview Evaluation
                        </p>

                        <Badge tone="success">
                          {interviewEvaluationData.recommendation.replaceAll("_", " ")}
                        </Badge>
                      </div>

                      <div className="mt-3 space-y-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                            Overall Assessment
                          </p>
                          <p className="mt-1 text-[12px] text-ink-soft">
                            {interviewEvaluationData.overallAssessment}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                            Technical Assessment
                          </p>
                          <p className="mt-1 text-[12px] text-ink-soft">
                            {interviewEvaluationData.technicalAssessment}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                            Communication Assessment
                          </p>
                          <p className="mt-1 text-[12px] text-ink-soft">
                            {interviewEvaluationData.communicationAssessment}
                          </p>
                        </div>

                        {interviewEvaluationData.strengths.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                              Strengths
                            </p>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] text-ink-soft">
                              {interviewEvaluationData.strengths.map((item, index) => (
                                <li key={index}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {interviewEvaluationData.weaknesses.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                              Weaknesses
                            </p>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] text-ink-soft">
                              {interviewEvaluationData.weaknesses.map((item, index) => (
                                <li key={index}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {interviewEvaluationData.concerns.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                              Concerns
                            </p>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] text-ink-soft">
                              {interviewEvaluationData.concerns.map((item, index) => (
                                <li key={index}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                            Suggested Next Step
                          </p>
                          <p className="mt-1 text-[12px] text-ink-soft">
                            {interviewEvaluationData.suggestedNextStep}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                {interview.recordingUrl && (
                  <a
                    href={interview.recordingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-[11px] font-medium text-brand-600 hover:underline"
                  >
                    Open interview recording
                  </a>
                )}

                <div className="mt-2">
                  {recordingFor === interview.id ? (
                    <div className="flex gap-2">
                      <TextField
                        label="Recording URL"
                        value={recordingUrl}
                        onChange={(e) => setRecordingUrl(e.target.value)}
                        placeholder="https://..."
                      />
                      <Button
                        size="sm"
                        isLoading={recordingMutation.isPending}
                        onClick={() =>
                          recordingMutation.mutate({
                            id: interview.id,
                            url: recordingUrl.trim() || null,
                          })
                        }
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-[11px] font-medium text-brand-600 hover:underline"
                      onClick={() => {
                        setRecordingFor(interview.id);
                        setRecordingUrl(interview.recordingUrl ?? "");
                      }}
                    >
                      {interview.recordingUrl
                        ? "Update recording"
                        : "Add recording"}
                    </button>
                  )}
                </div>

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

                        <div className="rounded-xl border border-line/70 bg-surface/40 p-3">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Interview Scorecard</p>
                          <div className="space-y-2">
                            {scorecard.map((item, index) => (
                              <div key={item.criterion} className="rounded-lg border border-line/60 bg-white p-2.5">
                                <div className="grid gap-2 md:grid-cols-[1.2fr_105px_1.4fr] md:items-center">
                                  <span className="text-[11px] font-medium text-ink">{item.criterion}</span>
                                  <SelectField label="" value={String(item.score)} onChange={(event) => setScorecard((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, score: Number(event.target.value) } : entry))}>
                                    <option value="0">Not rated</option><option value="1">1 / 5</option><option value="2">2 / 5</option><option value="3">3 / 5</option><option value="4">4 / 5</option><option value="5">5 / 5</option>
                                  </SelectField>
                                  <input value={item.comment} onChange={(event) => setScorecard((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, comment: event.target.value } : entry))} placeholder="Optional comment" className="h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[11px] outline-none focus:border-brand-500" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

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
                                scorecard: scorecard.filter((item) => item.score > 0).map((item) => ({
                                  criterion: item.criterion,
                                  score: item.score,
                                  comment: item.comment.trim() || undefined,
                                })),
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
            <SelectField label="Interviewer" required {...register("interviewerId")}>
              <option value="">Select</option>

              {managers?.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.firstName} {manager.lastName}
                </option>
              ))}
            </SelectField>

            <TextField label="Round" required {...register("round")} />
          </div>

          <TextField
            label="Date & time"
            required
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
  referredById?: string | null;
  referralBonusStatus?: "NOT_APPLICABLE" | "PENDING" | "APPROVED" | "PAID";
};

function OfferLetterModal({
  candidate,
  job,
  onClose,
}: {
  candidate: Candidate;
  job?: RecruitmentJob;
  onClose: () => void;
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

  useEffect(() => {
    if (!rawCandidate) return;
    const loaded = rawCandidate as LifecycleCandidate;
    setAnnualCtc(
      String(
        loaded.offer?.annualCtc ?? loaded.expectedCtc ?? job?.budgetCtc ?? 0,
      ),
    );
    setJoiningDate(loaded.offer?.joiningDate ?? "");
  }, [rawCandidate, job?.budgetCtc]);

  const offerMutation = useMutation({
    mutationFn: () => {
      const ctc = Number(annualCtc);
      if (!Number.isFinite(ctc) || ctc <= 0) {
        throw new Error("Annual CTC must be greater than 0.");
      }
      if (!joiningDate) {
        throw new Error("Joining date is required.");
      }
      if (current.finalResult !== "SELECTED" && current.stage !== "OFFER") {
        throw new Error(
          "Select the candidate after completing an interview before generating an offer letter.",
        );
      }
      return RecruitmentApi.generateOffer(candidate.id, {
        annualCtc: ctc,
        joiningDate,
      });
    },
    onSuccess: (updatedCandidate) => {
      queryClient.setQueryData(["candidate", candidate.id], updatedCandidate);
      queryClient.setQueryData<Candidate[] | undefined>(
        ["candidates", job?.id],
        (existing) =>
          existing?.map((item) =>
            item.id === candidate.id ? updatedCandidate : item,
          ),
      );
      void queryClient.invalidateQueries({
        queryKey: ["candidate", candidate.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["candidates", job?.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["recruitment"],
      });
      showToast("Offer letter generated successfully.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const offerStatus = current.offer?.status ?? "NOT_SENT";

  return (
    <Modal
      open
      onClose={onClose}
      title={`Offer Letter — ${current.firstName} ${current.lastName}`}
      size="md"
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line/70 bg-ink/[0.02] p-4">
            <p className="font-medium text-ink">
              {current.firstName} {current.lastName}
            </p>
            <p className="text-[12px] text-ink-faint">{current.email}</p>
          </div>
          {current.offer?.offerUrl ? (
            <div className="rounded-2xl border border-line/70 p-4">
              <p className="text-[13px] font-semibold text-ink">
                Offer letter generated
              </p>

              <p className="mt-1 text-[12px] text-ink-faint">
                CTC:{" "}
                {current.offer?.annualCtc != null
                  ? formatCurrencyINR(current.offer.annualCtc)
                  : "—"}
                {" • "}
                Joining: {current.offer?.joiningDate ?? "—"}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a
                  href={resolveAssetUrl(current.offer.offerUrl) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-[12px] font-medium text-brand-600 hover:underline"
                >
                  Open generated offer letter
                </a>

                <Button
                  size="sm"
                  variant="secondary"
                  isLoading={offerMutation.isPending}
                  disabled={!joiningDate || Number(annualCtc) <= 0}
                  onClick={() => offerMutation.mutate()}
                >
                  Regenerate Offer Letter
                </Button>
              </div>

              <p className="mt-2 text-[11px] text-ink-faint">
                Regenerating creates a new offer document and replaces the previous
                offer document link.
              </p>
            </div>
          ) : (
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

              <div className="sm:col-span-2 flex items-center justify-between gap-3">
                <p className="text-[11.5px] text-ink-faint">
                  Status: {offerStatus.replaceAll("_", " ")}
                </p>

                <Button
                  size="sm"
                  isLoading={offerMutation.isPending}
                  disabled={!joiningDate || Number(annualCtc) <= 0}
                  onClick={() => offerMutation.mutate()}
                >
                  Generate Offer Letter
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

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

  const [bgvStatus, setBgvStatus] = useState<
    "NOT_STARTED" | "IN_PROGRESS" | "VERIFIED" | "FAILED"
  >("IN_PROGRESS");

  const [bgvProvider, setBgvProvider] = useState("");
  const [bgvReference, setBgvReference] = useState("");
  const [bgvNotes, setBgvNotes] = useState("");

  const [documentType, setDocumentType] = useState("Aadhaar");
  const [documentUrl, setDocumentUrl] = useState("");

  const [referralBonusStatus, setReferralBonusStatus] = useState<
    "NOT_APPLICABLE" | "PENDING" | "APPROVED" | "PAID"
  >(current.referralBonusStatus ?? "NOT_APPLICABLE");

  useEffect(() => {
    if (!rawCandidate) return;

    const loaded = rawCandidate as LifecycleCandidate;

    setBgvStatus(
      loaded.backgroundVerification?.status ?? "IN_PROGRESS",
    );

    setBgvProvider(
      loaded.backgroundVerification?.provider ?? "",
    );

    setBgvReference(
      loaded.backgroundVerification?.reference ?? "",
    );

    setBgvNotes(
      loaded.backgroundVerification?.notes ?? "",
    );

    setReferralBonusStatus(
      loaded.referralBonusStatus ?? "NOT_APPLICABLE",
    );
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

  /* =========================================================
     BACKGROUND VERIFICATION
  ========================================================= */

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

    onError: (err) => {
      showToast(getErrorMessage(err), "error");
    },
  });

  /* =========================================================
     PRE-BOARDING DOCUMENT
  ========================================================= */

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

    onError: (err) => {
      showToast(getErrorMessage(err), "error");
    },
  });

  const verifyDocumentMutation = useMutation({
    mutationFn: (index: number) =>
      RecruitmentApi.verifyPreboardingDocument(candidate.id, index),

    onSuccess: () => {
      refreshCandidate();
      showToast("Pre-boarding document verified.");
    },

    onError: (err) => {
      showToast(getErrorMessage(err), "error");
    },
  });

  /* =========================================================
     EMPLOYEE REFERRAL
  ========================================================= */

  const referralBonusMutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch<{ candidate: Candidate }>(
        `/recruitment/candidates/${candidate.id}/referral-bonus`,
        {
          status: referralBonusStatus,
        },
      );

      return response.data.candidate;
    },

    onSuccess: () => {
      refreshCandidate();
      showToast("Referral bonus status updated.");
    },

    onError: (err) => {
      showToast(getErrorMessage(err), "error");
    },
  });

  /* =========================================================
     HIRE / EMPLOYEE HANDOFF
  ========================================================= */

  const hireMutation = useMutation({
    mutationFn: () =>
      RecruitmentApi.hireCandidate(candidate.id, "EMPLOYEE"),

    onSuccess: () => {
      refreshCandidate();
      showToast("Candidate hired and employee account created.");
    },

    onError: (err) => {
      showToast(getErrorMessage(err), "error");
    },
  });

  const offerStatus = current.offer?.status ?? "NOT_SENT";
  const offerAccepted = offerStatus === "ACCEPTED";

  const bgvVerified =
    current.backgroundVerification?.status === "VERIFIED";

  const preboardingCompleted =
    current.preboarding?.status === "COMPLETED";

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

          {/* =====================================================
              CANDIDATE SUMMARY
          ===================================================== */}

          <div className="rounded-2xl border border-line/70 bg-ink/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-ink">
                  {current.firstName} {current.lastName}
                </p>

                <p className="text-[12px] text-ink-faint">
                  {current.email}
                </p>
              </div>

              <Badge tone={hired ? "success" : "neutral"}>
                {hired ? "HIRED" : current.stage}
              </Badge>
            </div>
          </div>

          {/* =====================================================
              1. OFFER
          ===================================================== */}

          <LifecycleSection
            number="1"
            title="Offer"
            status={offerStatus}
            complete={offerAccepted}
          >
            {offerStatus === "NOT_SENT" ? (
              <p className="text-[12px] text-ink-faint">
                Offer has not been generated yet. Use the Offer Letter
                action on the candidate card to create the offer letter.
              </p>
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
                  <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2 text-[12px] text-brand-800">
                    Offer sent. The candidate must review and accept
                    or decline it through the secure candidate portal.
                  </div>
                )}

                {offerStatus === "ACCEPTED" && (
                  <Badge tone="success">
                    Offer accepted
                  </Badge>
                )}

                {offerStatus === "DECLINED" && (
                  <Badge tone="warning">
                    Offer declined
                  </Badge>
                )}

                {current.offer?.offerUrl && (
                  <a
                    href={
                      resolveAssetUrl(current.offer.offerUrl) ?? "#"
                    }
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

          {/* =====================================================
              2. BACKGROUND VERIFICATION
          ===================================================== */}

          <LifecycleSection
            number="2"
            title="Background Verification"
            status={
              current.backgroundVerification?.status ??
              "NOT_STARTED"
            }
            complete={bgvVerified}
          >
            {!offerAccepted ? (
              <p className="text-[12px] text-ink-faint">
                Accept the offer before completing background
                verification.
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
                  <option value="NOT_STARTED">
                    Not started
                  </option>
                  <option value="IN_PROGRESS">
                    In progress
                  </option>
                  <option value="VERIFIED">
                    Verified
                  </option>
                  <option value="FAILED">
                    Failed
                  </option>
                </SelectField>

                <div className="grid gap-3 sm:grid-cols-2">

                  <TextField
                    label="Provider"
                    value={bgvProvider}
                    onChange={(e) =>
                      setBgvProvider(e.target.value)
                    }
                  />

                  <TextField
                    label="Reference"
                    value={bgvReference}
                    onChange={(e) =>
                      setBgvReference(e.target.value)
                    }
                  />

                </div>

                <textarea
                  value={bgvNotes}
                  onChange={(e) =>
                    setBgvNotes(e.target.value)
                  }
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

          {/* =====================================================
              3. PRE-BOARDING
          ===================================================== */}

          <LifecycleSection
            number="3"
            title="Pre-boarding"
            status={
              current.preboarding?.status ?? "NOT_STARTED"
            }
            complete={preboardingCompleted}
          >
            {!bgvVerified ? (
              <p className="text-[12px] text-ink-faint">
                Complete BGV with VERIFIED status before
                pre-boarding.
              </p>
            ) : (
              <div className="space-y-3">

                {/* Existing documents */}

                {current.preboarding?.documents?.length ? (
                  <div className="space-y-2">

                    {current.preboarding.documents.map(
                      (doc, index) => (
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
                            <Badge tone="success">
                              Verified
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              isLoading={
                                verifyDocumentMutation.isPending
                              }
                              onClick={() =>
                                verifyDocumentMutation.mutate(
                                  index,
                                )
                              }
                            >
                              Verify
                            </Button>
                          )}
                        </div>
                      ),
                    )}

                  </div>
                ) : (
                  <p className="text-[12px] text-ink-faint">
                    No pre-boarding documents yet.
                  </p>
                )}

                {/* Add document */}

                <div className="grid gap-3 sm:grid-cols-2">

                  <SelectField
                    label="Document type"
                    value={documentType}
                    onChange={(e) =>
                      setDocumentType(e.target.value)
                    }
                  >
                    <option value="Aadhaar">
                      Aadhaar
                    </option>

                    <option value="PAN Card">
                      PAN Card
                    </option>

                    <option value="Passport">
                      Passport
                    </option>

                    <option value="Driving License">
                      Driving License
                    </option>

                    <option value="Voter ID">
                      Voter ID
                    </option>

                    <option value="Degree Certificate">
                      Degree Certificate
                    </option>

                    <option value="Experience Certificate">
                      Experience Certificate
                    </option>

                    <option value="Bank Account Proof">
                      Bank Account Proof
                    </option>

                    <option value="Address Proof">
                      Address Proof
                    </option>

                    <option value="Other">
                      Other
                    </option>
                  </SelectField>

                  <TextField
                    label="Document URL"
                    value={documentUrl}
                    onChange={(e) =>
                      setDocumentUrl(e.target.value)
                    }
                    placeholder="https://..."
                  />

                </div>

                <Button
                  size="sm"
                  variant="outline"
                  isLoading={documentMutation.isPending}
                  disabled={
                    !documentType.trim() ||
                    !documentUrl.trim()
                  }
                  onClick={() => documentMutation.mutate()}
                >
                  Add document
                </Button>

              </div>
            )}
          </LifecycleSection>

          {/* =====================================================
              4. EMPLOYEE REFERRAL
          ===================================================== */}

          <LifecycleSection
            number="4"
            title="Employee Referral"
            status={
              current.referralBonusStatus ??
              "NOT_APPLICABLE"
            }
            complete={
              !current.referredById ||
              current.referralBonusStatus === "PAID"
            }
          >
            {!current.referredById ? (
              <p className="text-[12px] text-ink-faint">
                This candidate was not submitted through an
                employee referral.
              </p>
            ) : (
              <div className="space-y-3">

                <p className="text-[12px] text-ink-soft">
                  Referrer: {current.referredById}
                </p>

                <SelectField
                  label="Referral bonus status"
                  value={referralBonusStatus}
                  onChange={(e) =>
                    setReferralBonusStatus(
                      e.target.value as
                      | "NOT_APPLICABLE"
                      | "PENDING"
                      | "APPROVED"
                      | "PAID",
                    )
                  }
                >
                  <option value="PENDING">
                    Pending
                  </option>

                  <option value="APPROVED">
                    Approved
                  </option>

                  <option value="PAID">
                    Paid
                  </option>

                  <option value="NOT_APPLICABLE">
                    Not applicable
                  </option>
                </SelectField>

                <Button
                  size="sm"
                  variant="outline"
                  isLoading={referralBonusMutation.isPending}
                  onClick={() =>
                    referralBonusMutation.mutate()
                  }
                >
                  Update referral bonus
                </Button>

              </div>
            )}
          </LifecycleSection>

          {/* =====================================================
              5. HIRE / EMPLOYEE HANDOFF
          ===================================================== */}

          <LifecycleSection
            number="5"
            title="Hire / Employee Handoff"
            status={hired ? "COMPLETED" : "PENDING"}
            complete={hired}
          >
            {!offerAccepted ||
              !bgvVerified ||
              !preboardingCompleted ? (
              <p className="text-[12px] text-ink-faint">
                Hiring unlocks after Offer Accepted, BGV Verified
                and Pre-boarding Completed.
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
