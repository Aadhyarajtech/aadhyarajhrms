import { useState, useEffect, type ReactNode } from "react";import { useParams, Link } from "react-router-dom";
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
  GripVertical,
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
} from "lucide-react";

import { RecruitmentApi, EmployeesApi } from "@/lib/endpoints";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/api";
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
  expectedCtc: z.coerce.number().min(0, "CTC cannot be negative").optional(),
  source: z.string().optional(),
});

type CandidateForm = z.infer<typeof candidateSchema>;

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
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<Candidate | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [lifecycleFor, setLifecycleFor] = useState<Candidate | null>(null);
  const [editCandidateFor, setEditCandidateFor] = useState<Candidate | null>(null);
  const [dragCandidateId, setDragCandidateId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Candidate["stage"] | null>(null);

  const {
    data: rawJob,
    isLoading: jobLoading,
  } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => RecruitmentApi.job(jobId!),
    enabled: !!jobId,
  });

  const job = rawJob as RecruitmentJob | undefined;

  const {
    data: candidates,
    isLoading: candidatesLoading,
  } = useQuery({
    queryKey: ["candidates", jobId],
    queryFn: () => RecruitmentApi.candidates(jobId),
    enabled: !!jobId,
  });

  /* =======================================================
     MOVE CANDIDATE STAGE
  ======================================================= */

  const stageMutation = useMutation({
    mutationFn: ({
      id,
      stage,
    }: {
      id: string;
      stage: string;
    }) => RecruitmentApi.moveStage(id, stage),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["candidates", jobId],
      });

      queryClient.invalidateQueries({
        queryKey: ["recruitment", "pipeline"],
      });

      showToast("Candidate stage updated.");
    },

    onError: (err) =>
      showToast(getErrorMessage(err), "error"),
  });

  /* =======================================================
     RATE CANDIDATE
  ======================================================= */

  const rateMutation = useMutation({
    mutationFn: ({
      id,
      rating,
    }: {
      id: string;
      rating: number;
    }) => RecruitmentApi.rate(id, rating),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["candidates", jobId],
      });
    },

    onError: (err) =>
      showToast(getErrorMessage(err), "error"),
  });

  /* =======================================================
     APPROVE REQUISITION
  ======================================================= */

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!jobId) {
        throw new Error("Job ID is missing.");
      }

      const response = await api.patch(
        `/recruitment/jobs/${jobId}/approve`,
        {},
      );

      return response.data;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["job", jobId],
      });

      queryClient.invalidateQueries({
        queryKey: ["recruitment"],
      });

      showToast("Job requisition approved.");
    },

    onError: (err) =>
      showToast(getErrorMessage(err), "error"),
  });

  /* =======================================================
     REJECT REQUISITION
  ======================================================= */

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!jobId) {
        throw new Error("Job ID is missing.");
      }

      const response = await api.patch(
        `/recruitment/jobs/${jobId}/reject`,
        {
          reason,
        },
      );

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

    onError: (err) =>
      showToast(getErrorMessage(err), "error"),
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
      {/* ===================================================
          BACK
      =================================================== */}

      <Link
        to="/app/recruitment"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-faint hover:text-ink"
      >
        <ArrowLeft size={14} />
        Back to all roles
      </Link>

      {/* ===================================================
          JOB HEADER
      =================================================== */}

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
                  <Badge tone="warning">
                    Pending Approval
                  </Badge>
                )}

                {job.requisitionStatus === "APPROVED" && (
                  <Badge tone="success">
                    Requisition Approved
                  </Badge>
                )}

                {job.requisitionStatus === "REJECTED" && (
                  <Badge tone="danger">
                    Requisition Rejected
                  </Badge>
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

            <Button
              leftIcon={<Plus size={16} />}
              onClick={() => setAddOpen(true)}
            >
              Add candidate
            </Button>
          </div>
        </Card>
      )}

      {/* ===================================================
          REQUISITION / APPROVAL SECTION
      =================================================== */}

      {job && (
        <RequisitionPanel
          job={job}
          approvePending={approveMutation.isPending}
          rejectPending={rejectMutation.isPending}
          onApprove={() => approveMutation.mutate()}
          onReject={() => setRejectOpen(true)}
        />
      )}

      {/* ===================================================
          REQUISITION REJECTION MODAL
      =================================================== */}

      <RejectRequisitionModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        isLoading={rejectMutation.isPending}
        onSubmit={(reason) => rejectMutation.mutate(reason)}
      />

      {/* ===================================================
          CANDIDATE PIPELINE
      =================================================== */}

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

      {candidatesLoading ? (
        <div className="grid gap-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-72 rounded-3xl"
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto pb-4"><div className="flex min-w-max items-start gap-4">
          {STAGES.map((stage) => {
            const stageCandidates =
              candidates?.filter((candidate) => candidate.stage === stage.key) ?? [];
            const isDropTarget = dragOverStage === stage.key;

            return (
              <div
                key={stage.key}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverStage(stage.key);
                }}
                onDragLeave={() => {
                  if (dragOverStage === stage.key) setDragOverStage(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("candidateId") || dragCandidateId;
                  if (id && stage.key) {
                    const candidate = candidates?.find((item) => item.id === id);
                    if (candidate && candidate.stage !== stage.key) {
                      stageMutation.mutate({ id, stage: stage.key });
                    }
                  }
                  setDragCandidateId(null);
                  setDragOverStage(null);
                }}
                className={cx(
                  "w-[270px] shrink-0 self-start rounded-3xl border p-3 transition-all",
                  isDropTarget
                    ? "border-brand-400 bg-brand-50/70 shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                    : "border-transparent bg-ink/[0.03]",
                )}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-brand-500" />
                    <p className="text-[13px] font-semibold text-ink-soft">
                      {stage.label}
                    </p>
                  </div>
                  <Badge tone="neutral">{stageCandidates.length}</Badge>
                </div>

                <div className="space-y-2.5">
                  {stageCandidates.map((candidate) => {
                    return (
                      <Card
                        key={candidate.id}
                        padded={false}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("candidateId", candidate.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDragCandidateId(candidate.id);
                        }}
                        onDragEnd={() => {
                          setDragCandidateId(null);
                          setDragOverStage(null);
                        }}
                        className={cx(
                          "group cursor-grab p-3.5 transition-all active:cursor-grabbing",
                          dragCandidateId === candidate.id && "scale-[0.98] opacity-60",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-ink">
                              {candidate.firstName} {candidate.lastName}
                            </p>
                            <p className="truncate text-[11.5px] text-ink-faint">
                              {candidate.email}
                            </p>
                          </div>
                          <GripVertical size={15} className="mt-0.5 shrink-0 text-ink-faint" />
                        </div>

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
                                rateMutation.mutate({ id: candidate.id, rating: i + 1 })
                              }
                              className="rounded p-0.5 hover:bg-ink/[0.04]"
                              aria-label={`Rate ${i + 1} stars`}
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
                          Applied {formatDate(candidate.appliedAt)} • {candidate.source}
                        </p>

                        <div className="mt-3 rounded-xl border border-line/70 bg-white p-2">
                          <div className="grid grid-cols-3 gap-1">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setScheduleFor(candidate);
                              }}
                              className="flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[10.5px] font-medium text-brand-600 transition hover:bg-brand-50"
                            >
                              <Calendar size={12} className="shrink-0" />
                              <span className="truncate">Interview</span>
                            </button>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setLifecycleFor(candidate);
                              }}
                              className="flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[10.5px] font-medium text-brand-600 transition hover:bg-brand-50"
                            >
                              <FileText size={12} className="shrink-0" />
                              <span className="truncate">Lifecycle</span>
                            </button>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditCandidateFor(candidate);
                              }}
                              className="flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[10.5px] font-medium text-ink-soft transition hover:bg-ink/[0.05]"
                              title="Edit candidate"
                            >
                              <Pencil size={12} className="shrink-0" />
                              <span className="truncate">Edit</span>
                            </button>
                          </div>

                          <div className="mt-1 border-t border-line/60 pt-2">
                            <div className="flex items-center justify-center gap-1.5 text-[10.5px] font-medium text-ink-faint">
                              <GripVertical size={13} />
                              <span>Drag card to another stage</span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}

                  {!stageCandidates.length && (
                    <div className="rounded-2xl border border-dashed border-line/80 px-3 py-8 text-center">
                      <p className="text-[11.5px] text-ink-faint">
                        {isDropTarget ? "Drop candidate here" : "Drag candidate here"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* ===================================================
          MODALS
      =================================================== */}

      <AddCandidateModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        jobId={jobId!}
      />

      {editCandidateFor && (
        <EditCandidateModal
          candidate={editCandidateFor}
          jobId={jobId!}
          onClose={() => setEditCandidateFor(null)}
        />
      )}

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
            <ShieldCheck
              size={18}
              className="text-brand-600"
            />

            <h2 className="font-display text-[17px] font-medium text-ink">
              Job Requisition & Approval
            </h2>
          </div>

          <p className="mt-1 text-[12px] text-ink-faint">
            Hiring request, budget and approval workflow.
          </p>
        </div>

        {job.requisitionStatus ===
          "PENDING_APPROVAL" && (
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
          value={String(
            job.headcount ?? job.openings ?? 1,
          )}
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
          value={String(
            job.approvalLevelRequired ?? 1,
          )}
        />

        <InfoBox
          icon={Building2}
          label="Hiring mode"
          value={formatHiringMode(
            job.hiringMode,
          )}
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
                  : job.requisitionStatus ===
                      "REJECTED"
                    ? "danger"
                    : "warning"
              }
            >
              {formatRequisitionStatus(
                job.requisitionStatus,
              )}
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
          <p className="text-[13px] font-semibold text-ink">
            Job Description
          </p>

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
                <Badge
                  key={channel}
                  tone="neutral"
                >
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
                  <Badge
                    key={skill}
                    tone="neutral"
                  >
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
                {job.screeningQuestions.map(
                  (question, index) => (
                    <li key={`${index}-${question}`}>
                      {question}
                    </li>
                  ),
                )}
              </ol>
            ) : (
              <p className="mt-2 text-[12px] text-ink-faint">
                No screening questions configured.
              </p>
            )}
          </div>
        </div>
      </div>

      {job.requisitionStatus === "REJECTED" &&
        job.rejectionReason && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-[12.5px] font-semibold text-red-700">
              Rejection Reason
            </p>

            <p className="mt-1 text-[12px] text-red-600">
              {job.rejectionReason}
            </p>
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
        <span className="text-[11px]">
          {label}
        </span>
      </div>

      <p className="mt-1.5 text-[14px] font-semibold text-ink">
        {value}
      </p>
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
  const {
    register,
    handleSubmit,
    reset,
  } = useForm<{ reason: string }>({
    defaultValues: {
      reason: "",
    },
  });

  const submit = (values: { reason: string }) => {
    onSubmit(values.reason);

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
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>

          <Button
            onClick={handleSubmit(submit)}
            isLoading={isLoading}
          >
            Reject requisition
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[12.5px] text-ink-faint">
          Provide a reason for rejecting this hiring
          request.
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

    onError: (err) =>
      showToast(getErrorMessage(err), "error"),
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
          >
            Cancel
          </Button>

          <Button
            onClick={handleSubmit((values) =>
              mutation.mutate(values),
            )}
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

        <TextField
          label="Phone"
          {...register("phone")}
        />

        <TextField
          label="Expected CTC (₹)"
          type="number"
          min={0}
          error={errors.expectedCtc?.message}
          {...register("expectedCtc")}
        />

        <SelectField
          label="Source"
          className="sm:col-span-2"
          {...register("source")}
        >
          <option value="Career Site">
            Career Site
          </option>
          <option value="LinkedIn">
            LinkedIn
          </option>
          <option value="Naukri">
            Naukri
          </option>
          <option value="Indeed">
            Indeed
          </option>
          <option value="Referral">
            Referral
          </option>
          <option value="Walk-in">
            Walk-in
          </option>
          <option value="Campus">
            Campus
          </option>
          <option value="Job Board">
            Job Board
          </option>
        </SelectField>
      </div>
    </Modal>
  );
}

/* =========================================================
   EDIT CANDIDATE
========================================================= */

function EditCandidateModal({
  candidate,
  jobId,
  onClose,
}: {
  candidate: Candidate;
  jobId: string;
  onClose: () => void;
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
    defaultValues: {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone ?? "",
      expectedCtc: candidate.expectedCtc ?? undefined,
      source: candidate.source ?? "Career Site",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: CandidateForm) => {
      // The recruitment routes expose the candidate resource at this path.
      // Keep the update isolated here so the rest of the recruitment UI does
      // not need to know how candidate persistence is implemented.
      const response = await api.patch(
        `/recruitment/candidates/${candidate.id}`,
        values,
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["candidates", jobId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["candidate", candidate.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["recruitment", "pipeline"],
      });
      showToast("Candidate details updated.");
      reset();
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit candidate — ${candidate.firstName} ${candidate.lastName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit((values) => mutation.mutate(values))}
            isLoading={mutation.isPending}
          >
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
          min={0}
          error={errors.expectedCtc?.message}
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

  const {
    register,
    handleSubmit,
    reset,
  } = useForm({
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
    }) =>
      RecruitmentApi.scheduleInterview({
        candidateId: candidate.id,
        ...values,
      }),

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
                      {interview.round} with{" "}
                      {interview.interviewerFirstName}{" "}
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
          onSubmit={handleSubmit((values) =>
            scheduleMutation.mutate(values),
          )}
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

type CandidateOffer = {
  status?: "NOT_GENERATED" | "NOT_SENT" | "SENT" | "ACCEPTED" | "DECLINED";
  offerUrl?: string | null;
  annualCtc?: number;
  basic?: number;
  hra?: number;
  specialAllowance?: number;
  joiningDate?: string;
  generatedAt?: string | null;
  respondedAt?: string | null;
};

type LifecycleCandidate = Omit<Candidate, "offer"> & {
  offer?: CandidateOffer;
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

function LifecycleStageTracker({
  candidate,
}: {
  candidate: LifecycleCandidate;
}) {
  const currentIndex = STAGES.findIndex(
    (stage) => stage.key === candidate.stage,
  );
  const isRejected = candidate.stage === "REJECTED";

  return (
    <div className="rounded-2xl border border-line/70 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-semibold text-ink">
            Recruitment Stage
          </p>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            Drag the candidate card between pipeline columns to change the stage.
          </p>
        </div>
        <Badge tone={isRejected ? "danger" : "neutral"}>
          {STAGES.find((stage) => stage.key === candidate.stage)?.label ?? candidate.stage}
        </Badge>
      </div>

      <div className="mt-5 overflow-x-auto pb-1">
        <div className="flex min-w-[560px] items-start">
          {STAGES.slice(0, 5).map((stage, index) => {
            const completed = !isRejected && currentIndex > index;
            const active = !isRejected && currentIndex === index;

            return (
              <div key={stage.key} className="flex min-w-[112px] flex-1 items-start">
                <div className="relative flex w-full flex-col items-center">
                  <div
                    className={cx(
                      "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-semibold",
                      completed
                        ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                        : active
                          ? "border-brand-500 bg-brand-600 text-white shadow-[0_0_0_4px_rgba(99,102,241,0.10)]"
                          : "border-line bg-white text-ink-faint",
                    )}
                  >
                    {completed ? <CheckCircle2 size={14} /> : index + 1}
                  </div>
                  <span
                    className={cx(
                      "mt-2 text-center text-[10.5px] font-medium",
                      active
                        ? "text-brand-700"
                        : completed
                          ? "text-emerald-700"
                          : "text-ink-faint",
                    )}
                  >
                    {stage.label}
                  </span>
                </div>
                {index < 4 && (
                  <div
                    className={cx(
                      "mt-[15px] h-0.5 flex-1",
                      completed ? "bg-emerald-300" : "bg-line",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
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

  const {
    data: rawCandidate,
    isLoading,
    refetch: refreshCandidate,
  } = useQuery({
    queryKey: ["candidate", candidate.id],
    queryFn: () => RecruitmentApi.candidate(candidate.id),
  });

  const current = (rawCandidate ?? candidate) as LifecycleCandidate;
  const offer = current.offer as CandidateOffer | undefined;

  // Older candidate records may not have the lifecycle subdocuments yet.
  // Normalize them here so BGV/pre-boarding never crash or become unusable.
  const backgroundVerification = current.backgroundVerification ?? {
    status: "NOT_STARTED" as const,
    provider: "",
    reference: "",
    notes: "",
    startedAt: null,
    completedAt: null,
  };

  const preboarding = current.preboarding ?? {
    status: "NOT_STARTED" as const,
    documents: [],
    completedAt: null,
  };

  /* =========================================================
     OFFER STATE
  ========================================================= */

  const [isEditingOffer, setIsEditingOffer] = useState(false);

  const [annualCtc, setAnnualCtc] = useState(
    String(
      offer?.annualCtc ??
        current.expectedCtc ??
        job?.budgetCtc ??
        "0",
    ),
  );

  const [joiningDate, setJoiningDate] = useState(
    offer?.joiningDate ?? "",
  );

  /* =========================================================
     BGV STATE
  ========================================================= */

  const [bgvStatus, setBgvStatus] = useState<
    "NOT_STARTED" | "IN_PROGRESS" | "VERIFIED" | "FAILED"
  >(
    backgroundVerification.status ??
      "NOT_STARTED",
  );

  const [bgvProvider, setBgvProvider] = useState(
    backgroundVerification.provider ?? "",
  );

  const [bgvReference, setBgvReference] = useState(
    backgroundVerification.reference ?? "",
  );

  const [bgvNotes, setBgvNotes] = useState(
    backgroundVerification.notes ?? "",
  );

  /* =========================================================
     PRE-BOARDING STATE
  ========================================================= */

  const [documentType, setDocumentType] = useState(
    "",
  );

  const [documentUrl, setDocumentUrl] = useState(
    "",
  );

  /* =========================================================
     SYNC LOCAL STATE AFTER API REFRESH
  ========================================================= */

  useEffect(() => {
    if (!current) {
      return;
    }

    if (offer?.annualCtc != null) {
      setAnnualCtc(String(offer.annualCtc));
    } else if (current.expectedCtc != null) {
      setAnnualCtc(String(current.expectedCtc));
    } else if (job?.budgetCtc != null) {
      setAnnualCtc(String(job.budgetCtc));
    }

    if (offer?.joiningDate) {
      setJoiningDate(offer.joiningDate);
    }

    setBgvStatus(
      backgroundVerification.status ??
        "NOT_STARTED",
    );

    setBgvProvider(
      backgroundVerification.provider ??
        "",
    );

    setBgvReference(
      backgroundVerification.reference ??
        "",
    );

    setBgvNotes(
      backgroundVerification.notes ??
        "",
    );
  }, [current, offer, job]);

  /* =========================================================
     OFFER GENERATE / UPDATE
  ========================================================= */

  const offerMutation = useMutation({
    mutationFn: async () => {
      const wasAccepted = offer?.status === "ACCEPTED";
      const result = await RecruitmentApi.generateOffer(candidate.id, {
        annualCtc: Math.max(0, Number(annualCtc)),
        joiningDate,
      });

      // The existing generate-offer endpoint changes the offer state to SENT.
      // If an accepted offer is edited, immediately restore ACCEPTED so editing
      // salary/joining date does not accidentally move the candidate backward.
      if (wasAccepted) {
        await RecruitmentApi.respondToOffer(candidate.id, "ACCEPTED");
      }

      return result;
    },

    onSuccess: async () => {
      await refreshCandidate();

      queryClient.invalidateQueries({
        queryKey: ["candidates", job?.id],
      });

      queryClient.invalidateQueries({
        queryKey: ["recruitment", "pipeline"],
      });

      setIsEditingOffer(false);

      showToast(
        "Offer details updated successfully.",
      );
    },

    onError: (err) =>
      showToast(
        getErrorMessage(err),
        "error",
      ),
  });

  /* =========================================================
     OFFER ACCEPT / DECLINE
  ========================================================= */

  const offerResponseMutation = useMutation({
    mutationFn: (
      status: "ACCEPTED" | "DECLINED",
    ) =>
      RecruitmentApi.respondToOffer(
        candidate.id,
        status,
      ),

    onSuccess: async (_, status) => {
      await refreshCandidate();

      queryClient.invalidateQueries({
        queryKey: ["candidates", job?.id],
      });

      queryClient.invalidateQueries({
        queryKey: ["recruitment", "pipeline"],
      });

      showToast(
        `Offer ${status.toLowerCase()}.`,
      );
    },

    onError: (err) =>
      showToast(
        getErrorMessage(err),
        "error",
      ),
  });

  /* =========================================================
     BACKGROUND VERIFICATION
  ========================================================= */

  const bgvMutation = useMutation({
    mutationFn: () =>
      RecruitmentApi.updateBackgroundVerification(
        candidate.id,
        {
          status: bgvStatus,
          provider:
            bgvProvider.trim() || undefined,
          reference:
            bgvReference.trim() || undefined,
          notes:
            bgvNotes.trim() || undefined,
        },
      ),

    onSuccess: async (updatedCandidate) => {
      queryClient.setQueryData(["candidate", candidate.id], updatedCandidate);
      await refreshCandidate();
      queryClient.invalidateQueries({
        queryKey: ["candidates", job?.id],
      });
      showToast("Background verification updated.");
    },

    onError: (err) =>
      showToast(
        getErrorMessage(err),
        "error",
      ),
  });

  /* =========================================================
     ADD PRE-BOARDING DOCUMENT
  ========================================================= */

  const documentMutation = useMutation({
    mutationFn: () =>
      RecruitmentApi.addPreboardingDocument(
        candidate.id,
        {
          type: documentType.trim(),
          url: documentUrl.trim(),
        },
      ),

    onSuccess: async (updatedCandidate) => {
      queryClient.setQueryData(["candidate", candidate.id], updatedCandidate);
      await refreshCandidate();
      queryClient.invalidateQueries({
        queryKey: ["candidates", job?.id],
      });
      setDocumentType("");
      setDocumentUrl("");
      showToast("Pre-boarding document added.");
    },

    onError: (err) =>
      showToast(
        getErrorMessage(err),
        "error",
      ),
  });

  /* =========================================================
     VERIFY PRE-BOARDING DOCUMENT
  ========================================================= */

  const verifyDocumentMutation = useMutation({
    mutationFn: (index: number) =>
      RecruitmentApi.verifyPreboardingDocument(
        candidate.id,
        index,
      ),

    onSuccess: async (updatedCandidate) => {
      queryClient.setQueryData(["candidate", candidate.id], updatedCandidate);
      await refreshCandidate();
      queryClient.invalidateQueries({
        queryKey: ["candidates", job?.id],
      });
      showToast("Pre-boarding document verified.");
    },

    onError: (err) =>
      showToast(
        getErrorMessage(err),
        "error",
      ),
  });

  /* =========================================================
     HIRE CANDIDATE
  ========================================================= */

  const hireMutation = useMutation({
    mutationFn: () =>
      RecruitmentApi.hireCandidate(
        candidate.id,
        "EMPLOYEE",
      ),

    onSuccess: async () => {
      await refreshCandidate();

      queryClient.invalidateQueries({
        queryKey: ["candidates", job?.id],
      });

      queryClient.invalidateQueries({
        queryKey: ["employees"],
      });

      queryClient.invalidateQueries({
        queryKey: ["recruitment"],
      });

      showToast(
        "Candidate hired and employee account created.",
      );
    },

    onError: (err) =>
      showToast(
        getErrorMessage(err),
        "error",
      ),
  });

  /* =========================================================
     DERIVED LIFECYCLE STATUS
  ========================================================= */

  const offerAccepted =
    offer?.status === "ACCEPTED";

  const bgvVerified =
    backgroundVerification.status ===
    "VERIFIED";

  const preboardingDocuments =
    preboarding.documents ?? [];

  const verifiedPreboardingDocuments =
    preboardingDocuments.filter((doc) => doc.verified).length;

  const preboardingCompleted =
    preboarding.status ===
      "COMPLETED" ||
    (preboardingDocuments.length > 0 &&
      preboardingDocuments.every((doc) => doc.verified));

  const preboardingInProgress =
    preboardingDocuments.length > 0 &&
    !preboardingCompleted;

  const hired =
    Boolean(current.hiredEmployeeId);

  /* =========================================================
     RENDER
  ========================================================= */

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

          {/* =================================================
              RECRUITMENT STAGE TRACKER
          ================================================= */}

          <LifecycleStageTracker candidate={current} />

          {/* =================================================
              CANDIDATE HEADER
          ================================================= */}

          <div className="rounded-2xl border border-line/70 bg-ink/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-ink">
                  {current.firstName}{" "}
                  {current.lastName}
                </p>

                <p className="text-[12px] text-ink-faint">
                  {current.email}
                </p>
              </div>

              <Badge
                tone={
                  hired
                    ? "success"
                    : offerAccepted
                      ? "success"
                      : "neutral"
                }
              >
                {hired
                  ? "HIRED"
                  : current.stage}
              </Badge>
            </div>
          </div>

          {/* =================================================
              1. OFFER
          ================================================= */}

          <LifecycleSection
            number="1"
            title="Offer"
            status={
              offer?.status ??
              "NOT GENERATED"
            }
            complete={offerAccepted}
          >
            {!offer?.status ||
            offer.status ===
              "NOT_SENT" ||
            offer.status ===
              "NOT_GENERATED" ||
            isEditingOffer ? (
              <div className="grid gap-3 sm:grid-cols-2">

                <TextField
                  label="Annual CTC (₹)"
                  type="number"
                  min={0}
                  value={annualCtc}
                  onChange={(e) => {
                    const value =
                      e.target.value;

                    if (
                      value === "" ||
                      Number(value) >= 0
                    ) {
                      setAnnualCtc(value);
                    }
                  }}
                />

                <TextField
                  label="Joining date"
                  type="date"
                  value={joiningDate}
                  onChange={(e) =>
                    setJoiningDate(
                      e.target.value,
                    )
                  }
                />

                <div className="flex gap-2 sm:col-span-2">
                  <Button
                    size="sm"
                    isLoading={
                      offerMutation.isPending
                    }
                    disabled={
                      !joiningDate ||
                      annualCtc === "" ||
                      Number(annualCtc) < 0
                    }
                    onClick={() =>
                      offerMutation.mutate()
                    }
                  >
                    {isEditingOffer
                      ? "Save changes"
                      : "Generate offer"}
                  </Button>

                  {isEditingOffer && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIsEditingOffer(
                          false,
                        );

                        setAnnualCtc(
                          String(
                            offer?.annualCtc ??
                              0,
                          ),
                        );

                        setJoiningDate(
                          offer?.joiningDate ??
                            "",
                        );
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">

                <div className="grid gap-3 sm:grid-cols-2">

                  <div className="rounded-xl border border-line/60 bg-ink/[0.02] p-3">
                    <p className="text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">
                      Annual CTC
                    </p>

                    <p className="mt-1 text-[13px] font-semibold text-ink">
                      {offer?.annualCtc !=
                      null
                        ? formatCurrencyINR(
                            offer.annualCtc,
                          )
                        : "—"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-line/60 bg-ink/[0.02] p-3">
                    <p className="text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">
                      Joining date
                    </p>

                    <p className="mt-1 text-[13px] font-semibold text-ink">
                      {offer?.joiningDate ??
                        "—"}
                    </p>
                  </div>

                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setIsEditingOffer(true)
                    }
                  >
                    Edit salary / joining date
                  </Button>

                  {offer?.offerUrl && (
                    <a
                      href={offer.offerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] font-medium text-brand-600 hover:underline"
                    >
                      Open generated offer
                      letter
                    </a>
                  )}

                </div>

                {/* OFFER RESPONSE */}

                {offer?.status === "SENT" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      isLoading={
                        offerResponseMutation.isPending
                      }
                      onClick={() =>
                        offerResponseMutation.mutate(
                          "ACCEPTED",
                        )
                      }
                    >
                      Accept offer
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={
                        offerResponseMutation.isPending
                      }
                      onClick={() =>
                        offerResponseMutation.mutate(
                          "DECLINED",
                        )
                      }
                    >
                      Decline offer
                    </Button>
                  </div>
                )}

                {/* ACCEPTED */}

                {offer?.status ===
                  "ACCEPTED" && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">

                    <CheckCircle2
                      size={15}
                      className="text-emerald-600"
                    />

                    <div>
                      <p className="text-[12.5px] font-semibold text-emerald-700">
                        Offer accepted
                      </p>

                      {offer.respondedAt && (
                        <p className="text-[11px] text-emerald-600">
                          Responded on{" "}
                          {formatDate(
                            offer.respondedAt,
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* DECLINED */}

                {offer?.status ===
                  "DECLINED" && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">

                    <XCircle
                      size={15}
                      className="text-red-600"
                    />

                    <div>
                      <p className="text-[12.5px] font-semibold text-red-700">
                        Offer declined
                      </p>

                      {offer.respondedAt && (
                        <p className="text-[11px] text-red-600">
                          Responded on{" "}
                          {formatDate(
                            offer.respondedAt,
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </LifecycleSection>

          {/* =================================================
              2. BACKGROUND VERIFICATION
          ================================================= */}

          <LifecycleSection
            number="2"
            title="Background Verification"
            status={
              current.backgroundVerification
                ?.status ??
              "NOT_STARTED"
            }
            complete={bgvVerified}
          >
            {!offerAccepted ? (
              <p className="text-[12px] text-ink-faint">
                Accept the offer before
                completing background
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
                      setBgvProvider(
                        e.target.value,
                      )
                    }
                    placeholder="e.g. AuthBridge"
                  />

                  <TextField
                    label="Reference"
                    value={bgvReference}
                    onChange={(e) =>
                      setBgvReference(
                        e.target.value,
                      )
                    }
                    placeholder="BGV-REF-001"
                  />

                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-ink-soft">
                    Verification notes
                  </label>
                  <textarea
                    value={bgvNotes}
                    onChange={(e) => setBgvNotes(e.target.value)}
                    rows={3}
                    placeholder="Add verification notes..."
                    className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[12.5px] text-ink outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>

                <Button
                  size="sm"
                  isLoading={
                    bgvMutation.isPending
                  }
                  onClick={() =>
                    bgvMutation.mutate()
                  }
                >
                  Update verification
                </Button>

              </div>
            )}
          </LifecycleSection>

          {/* =================================================
              3. PRE-BOARDING
          ================================================= */}

          <LifecycleSection
            number="3"
            title="Pre-boarding"
            status={
              preboardingCompleted
                ? "COMPLETED"
                : preboardingInProgress
                  ? "IN_PROGRESS"
                  : "NOT_STARTED"
            }
            complete={preboardingCompleted}
          >
            {!bgvVerified ? (
              <p className="text-[12px] text-ink-faint">
                Complete BGV with VERIFIED
                status before pre-boarding.
              </p>
            ) : (
              <div className="space-y-3">

                {/* DOCUMENT LIST */}

                {preboardingDocuments.length >
                0 ? (
                  <div className="space-y-3">
                    <div className={cx(
                      "rounded-xl border px-3.5 py-3",
                      preboardingCompleted
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-amber-200 bg-amber-50",
                    )}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={cx(
                            "text-[12.5px] font-semibold",
                            preboardingCompleted
                              ? "text-emerald-700"
                              : "text-amber-700",
                          )}>
                            {preboardingCompleted
                              ? "Pre-boarding completed"
                              : "Verify all required documents"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-ink-faint">
                            {verifiedPreboardingDocuments} of {preboardingDocuments.length} documents verified
                          </p>
                        </div>
                        {preboardingCompleted ? (
                          <CheckCircle2 size={17} className="text-emerald-600" />
                        ) : (
                          <Clock3 size={16} className="text-amber-600" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">

                    {preboardingDocuments.map(
                      (doc, index) => (
                        <div
                          key={`${doc.type}-${index}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/60 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-medium text-ink">
                              {doc.type}
                            </p>

                            <div className="mt-0.5 flex min-w-0 items-center gap-2">
                              <p className="max-w-[360px] truncate text-[11px] text-ink-faint">
                                {doc.url}
                              </p>
                              {/^https?:\/\//i.test(doc.url) && (
                                <a
                                  href={doc.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="shrink-0 text-[11px] font-medium text-brand-600 hover:underline"
                                >
                                  View
                                </a>
                              )}
                            </div>
                          </div>

                          {doc.verified ? (
                            <Badge tone="success">
                              <span className="flex items-center gap-1">
                                <CheckCircle2
                                  size={12}
                                />
                                Verified
                              </span>
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
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-line px-3.5 py-3">
                    <p className="text-[12px] font-medium text-ink-soft">
                      No pre-boarding documents yet.
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      Add at least one document, then verify it to complete pre-boarding.
                    </p>
                  </div>
                )}

                {/* ADD DOCUMENT */}

                <div className="rounded-xl border border-line/60 bg-ink/[0.015] p-3">
                  <p className="mb-3 text-[12px] font-semibold text-ink">
                    Add pre-boarding document
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                      label="Document type"
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value)}
                    >
                    <option value="">Select document type</option>
                    <option value="Aadhaar">Aadhaar</option>
                    <option value="PAN">PAN</option>
                    <option value="Passport">Passport</option>
                    <option value="Degree Certificate">Degree Certificate</option>
                    <option value="Bank Details">Bank Details</option>
                    <option value="Other">Other</option>
                  </SelectField>

                  <TextField
                    label="Document URL"
                    value={documentUrl}
                    onChange={(e) =>
                      setDocumentUrl(
                        e.target.value,
                      )
                    }
                    placeholder="https://..."
                  />

                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  isLoading={
                    documentMutation.isPending
                  }
                  disabled={
                    !documentType.trim() ||
                    !documentUrl.trim()
                  }
                  onClick={() =>
                    documentMutation.mutate()
                  }
                >
                  Add document
                </Button>

              </div>
            )}
          </LifecycleSection>

          {/* =================================================
              4. HIRE / EMPLOYEE HANDOFF
          ================================================= */}

          <LifecycleSection
            number="4"
            title="Hire / Employee Handoff"
            status={
              hired
                ? "COMPLETED"
                : "PENDING"
            }
            complete={hired}
          >
            {!offerAccepted ||
            !bgvVerified ||
            !preboardingCompleted ? (
              <div className="space-y-2">
                <p className="text-[12px] text-ink-faint">
                  Complete every prerequisite before creating the employee account.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={offerAccepted ? "success" : "warning"}>
                    {offerAccepted ? "✓ Offer Accepted" : "○ Offer not accepted"}
                  </Badge>
                  <Badge tone={bgvVerified ? "success" : "warning"}>
                    {bgvVerified ? "✓ BGV Verified" : "○ BGV not verified"}
                  </Badge>
                  <Badge tone={preboardingCompleted ? "success" : "warning"}>
                    {preboardingCompleted
                      ? "✓ Pre-boarding Completed"
                      : `○ Pre-boarding ${verifiedPreboardingDocuments}/${preboardingDocuments.length || 0} verified`}
                  </Badge>
                </div>
              </div>
            ) : hired ? (
              <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">

                <UserCheck size={15} />

                <span>
                  Employee account created.
                  {current.hiredEmployeeId
                    ? ` Employee ID: ${current.hiredEmployeeId}`
                    : ""}
                </span>

              </div>
            ) : (
              <Button
                size="sm"
                isLoading={
                  hireMutation.isPending
                }
                onClick={() =>
                  hireMutation.mutate()
                }
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

function formatRequisitionStatus(
  status?: RecruitmentJob["requisitionStatus"],
) {
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

function formatHiringMode(
  mode?: RecruitmentJob["hiringMode"],
) {
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