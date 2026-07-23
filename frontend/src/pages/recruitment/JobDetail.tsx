import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, Star, Calendar, ChevronRight, MapPin } from "lucide-react";
import { RecruitmentApi, EmployeesApi } from "@/lib/endpoints";
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

const STAGES: { key: Candidate["stage"]; label: string }[] = [
  { key: "APPLIED", label: "Applied" },
  { key: "SCREENING", label: "Screening" },
  { key: "INTERVIEW", label: "Interview" },
  { key: "OFFER", label: "Offer" },
  { key: "HIRED", label: "Hired" },
  { key: "REJECTED", label: "Rejected" },
];

const candidateSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email(),
  phone: z.string().optional(),
  expectedCtc: z.coerce.number().optional(),
  source: z.string().optional(),
});
type CandidateForm = z.infer<typeof candidateSchema>;

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<Candidate | null>(null);

  const { data: job } = useQuery({ queryKey: ["job", jobId], queryFn: () => RecruitmentApi.job(jobId!), enabled: !!jobId });
  const { data: candidates, isLoading } = useQuery({ queryKey: ["candidates", jobId], queryFn: () => RecruitmentApi.candidates(jobId), enabled: !!jobId });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => RecruitmentApi.moveStage(id, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates", jobId] });
      queryClient.invalidateQueries({ queryKey: ["recruitment", "pipeline"] });
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const rateMutation = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number }) => RecruitmentApi.rate(id, rating),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["candidates", jobId] }),
  });

  return (
    <div>
      <Link to="/app/recruitment" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-faint hover:text-ink">
        <ArrowLeft size={14} /> Back to all roles
      </Link>

      {job && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-xl font-medium text-ink">{job.title}</h1>
                <StatusBadge status={job.status} />
              </div>
              <p className="mt-1 text-[13px] text-ink-faint">{job.departmentName} · {job.designationTitle}</p>
              <div className="mt-3 flex items-center gap-4 text-[12.5px] text-ink-faint">
                <span className="flex items-center gap-1.5"><MapPin size={13} /> {job.location}</span>
                <span>{job.experienceMin}–{job.experienceMax} yrs · {job.openings} opening(s)</span>
              </div>
            </div>
            <Button leftIcon={<Plus size={16} />} onClick={() => setAddOpen(true)}>Add candidate</Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-3xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 overflow-x-auto pb-2 lg:grid-cols-6">
          {STAGES.map((stage) => {
            const stageCandidates = candidates?.filter((c) => c.stage === stage.key) ?? [];
            return (
              <div key={stage.key} className="min-w-[230px] rounded-3xl bg-ink/[0.03] p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <p className="text-[13px] font-semibold text-ink-soft">{stage.label}</p>
                  <Badge tone="neutral">{stageCandidates.length}</Badge>
                </div>
                <div className="space-y-2.5">
                  {stageCandidates.map((c) => (
                    <Card key={c.id} padded={false} className="p-3.5">
                      <p className="text-[13px] font-medium text-ink">{c.firstName} {c.lastName}</p>
                      <p className="truncate text-[11.5px] text-ink-faint">{c.email}</p>
                      {c.expectedCtc && <p className="mt-1 text-[11.5px] text-ink-faint">Expects {formatCurrencyINR(c.expectedCtc)}</p>}
                      <div className="mt-2 flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <button key={i} onClick={() => rateMutation.mutate({ id: c.id, rating: i + 1 })}>
                            <Star size={13} className={cx(i < (c.rating ?? 0) ? "fill-gold-500 text-gold-500" : "text-line")} />
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[10.5px] text-ink-faint">Applied {formatDate(c.appliedAt)} · {c.source}</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <button onClick={() => setScheduleFor(c)} className="flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline">
                          <Calendar size={12} /> Interview
                        </button>
                        {stage.key !== "HIRED" && stage.key !== "REJECTED" && (
                          <select
                            value={c.stage}
                            onChange={(e) => stageMutation.mutate({ id: c.id, stage: e.target.value })}
                            className="rounded-lg border border-line bg-white px-1.5 py-0.5 text-[11px]"
                          >
                            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        )}
                      </div>
                    </Card>
                  ))}
                  {!stageCandidates.length && <p className="px-1 text-[11.5px] text-ink-faint">No candidates</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddCandidateModal open={addOpen} onClose={() => setAddOpen(false)} jobId={jobId!} />
      {scheduleFor && <ScheduleInterviewModal candidate={scheduleFor} onClose={() => setScheduleFor(null)} />}
    </div>
  );
}

function AddCandidateModal({ open, onClose, jobId }: { open: boolean; onClose: () => void; jobId: string }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CandidateForm>({ resolver: zodResolver(candidateSchema) });

  const mutation = useMutation({
    mutationFn: (v: CandidateForm) => RecruitmentApi.createCandidate({ jobPostingId: jobId, ...v }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates", jobId] });
      showToast("Candidate added.");
      reset();
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Add candidate" footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>Add candidate</Button>
      </>
    }>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="First name" required error={errors.firstName?.message} {...register("firstName")} />
        <TextField label="Last name" required error={errors.lastName?.message} {...register("lastName")} />
        <TextField label="Email" type="email" required className="sm:col-span-2" error={errors.email?.message} {...register("email")} />
        <TextField label="Phone" {...register("phone")} />
        <TextField label="Expected CTC (₹)" type="number" {...register("expectedCtc")} />
        <SelectField label="Source" className="sm:col-span-2" {...register("source")}>
          <option value="Career Site">Career Site</option>
          <option value="LinkedIn">LinkedIn</option>
          <option value="Referral">Referral</option>
          <option value="Job Board">Job Board</option>
        </SelectField>
      </div>
    </Modal>
  );
}

function ScheduleInterviewModal({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: managers } = useQuery({ queryKey: ["managers"], queryFn: EmployeesApi.managers });
  const { data: interviews } = useQuery({ queryKey: ["interviews", candidate.id], queryFn: () => RecruitmentApi.interviews(candidate.id) });
  const { register, handleSubmit } = useForm({ defaultValues: { interviewerId: "", scheduledAt: "", round: "Round 1" } });

  const mutation = useMutation({
    mutationFn: (v: any) => RecruitmentApi.scheduleInterview({ candidateId: candidate.id, ...v }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviews", candidate.id] });
      showToast("Interview scheduled.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open onClose={onClose} title={`Interviews — ${candidate.firstName} ${candidate.lastName}`} size="lg">
      <div className="space-y-5">
        <div className="space-y-2">
          {interviews?.length ? interviews.map((iv) => (
            <div key={iv.id} className="flex items-center justify-between rounded-xl border border-line/60 px-3.5 py-2.5 text-[13px]">
              <div>
                <p className="font-medium text-ink">{iv.round} with {iv.interviewerFirstName} {iv.interviewerLastName}</p>
                <p className="text-[12px] text-ink-faint">{formatDate(iv.scheduledAt)} {iv.feedback ? `· "${iv.feedback}"` : ""}</p>
              </div>
              {iv.completed ? <Badge tone="success">{iv.recommendation?.replace("_", " ")}</Badge> : <Badge tone="warning">Scheduled</Badge>}
            </div>
          )) : <p className="text-[13px] text-ink-faint">No interviews scheduled yet.</p>}
        </div>

        <form className="space-y-3 border-t border-line/70 pt-4">
          <p className="text-[13px] font-medium text-ink">Schedule a new round</p>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Interviewer" {...register("interviewerId")}>
              <option value="">Select</option>
              {managers?.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
            </SelectField>
            <TextField label="Round" {...register("round")} />
          </div>
          <TextField label="Date & time" type="datetime-local" {...register("scheduledAt")} />
          <Button type="button" size="sm" rightIcon={<ChevronRight size={14} />} onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>
            Schedule
          </Button>
        </form>
      </div>
    </Modal>
  );
}
