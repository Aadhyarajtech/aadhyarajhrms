import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Target, Star, CheckCircle2, ClipboardList } from "lucide-react";
import { PerformanceApi, EmployeesApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { TextField, TextareaField } from "@/components/ui/Field";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import { formatDate, cx } from "@/lib/format";

const MANAGER_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"];

const goalSchema = z.object({
  title: z.string().min(2, "Required"),
  description: z.string().optional(),
  dueDate: z.string().min(1, "Required"),
});
type GoalForm = z.infer<typeof goalSchema>;

export default function Performance() {
  const { user } = useAuth();
  const isManager = !!user && MANAGER_ROLES.includes(user.role);
  const [tab, setTab] = useState("mine");
  const { data: cycles } = useQuery({ queryKey: ["performance", "cycles"], queryFn: PerformanceApi.cycles });
  const activeCycle = cycles?.find((c) => c.isActive);

  const tabs = [
    { key: "mine", label: "My Performance" },
    ...(isManager ? [{ key: "team", label: "Team Reviews" }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Performance"
        subtitle={activeCycle ? `Current cycle: ${activeCycle.name} (${formatDate(activeCycle.startDate)} – ${formatDate(activeCycle.endDate)})` : "No active review cycle"}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-6 w-fit" />
      {tab === "mine" && <MyPerformance />}
      {tab === "team" && isManager && <TeamReviews activeCycleId={activeCycle?.id} />}
    </div>
  );
}

function MyPerformance() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [goalOpen, setGoalOpen] = useState(false);
  const [selfOpen, setSelfOpen] = useState(false);

  const { data: review, isLoading: reviewLoading } = useQuery({ queryKey: ["performance", "my-review"], queryFn: PerformanceApi.myReview });
  const { data: goals, isLoading: goalsLoading } = useQuery({ queryKey: ["performance", "goals", "mine"], queryFn: () => PerformanceApi.goals() });

  const progressMutation = useMutation({
    mutationFn: ({ id, progress }: { id: string; progress: number }) => PerformanceApi.updateGoalProgress(id, progress),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["performance", "goals", "mine"] }),
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="My review" />
        {reviewLoading ? <Skeleton className="h-40 rounded-2xl" /> : !review ? (
          <EmptyState icon={ClipboardList} title="No review cycle assigned yet" description="Your manager or HR will initiate your review when the cycle begins." />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={review.status} />
              {review.finalRating && (
                <span className="flex items-center gap-1 text-[13px] font-medium text-ink">
                  <Star size={14} className="fill-gold-500 text-gold-500" /> {review.finalRating}/5 final rating
                </span>
              )}
            </div>
            {review.selfRating && (
              <div className="rounded-2xl bg-ink/[0.03] p-4">
                <p className="text-[12px] font-medium text-ink-faint">Your self-assessment</p>
                <p className="mt-1 text-[13px] text-ink">Rating: {review.selfRating}/5</p>
                <p className="mt-1 text-[13px] text-ink-soft">{review.strengths}</p>
              </div>
            )}
            {review.managerComments && (
              <div className="rounded-2xl bg-brand-50 p-4">
                <p className="text-[12px] font-medium text-brand-700">Manager feedback</p>
                <p className="mt-1 text-[13px] text-ink-soft">{review.managerComments}</p>
              </div>
            )}
            {(review.status === "NOT_STARTED" || review.status === "SELF_REVIEW") && (
              <Button size="sm" onClick={() => setSelfOpen(true)}>{review.selfRating ? "Update self-review" : "Complete self-review"}</Button>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="My goals" action={<Button size="sm" variant="outline" leftIcon={<Plus size={14} />} onClick={() => setGoalOpen(true)}>Add goal</Button>} />
        {goalsLoading ? <Skeleton className="h-40 rounded-2xl" /> : !goals?.length ? (
          <EmptyState icon={Target} title="No goals yet" description="Set a goal to track your progress this cycle." />
        ) : (
          <div className="space-y-5">
            {goals.map((g) => (
              <div key={g.id}>
                <div className="flex items-center justify-between text-[13px]">
                  <p className="font-medium text-ink">{g.title}</p>
                  <Badge tone={g.status === "AT_RISK" ? "warning" : g.status === "COMPLETED" ? "success" : "neutral"}>{g.status.replace("_", " ")}</Badge>
                </div>
                {g.description && <p className="mt-0.5 text-[12px] text-ink-faint">{g.description}</p>}
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    defaultValue={g.progress}
                    onMouseUp={(e) => progressMutation.mutate({ id: g.id, progress: Number((e.target as HTMLInputElement).value) })}
                    onTouchEnd={(e) => progressMutation.mutate({ id: g.id, progress: Number((e.target as HTMLInputElement).value) })}
                    className="h-1.5 flex-1 cursor-pointer accent-brand-500"
                  />
                  <span className="w-10 text-right text-[12px] text-ink-faint">{g.progress}%</span>
                </div>
                <p className="mt-1 text-[11.5px] text-ink-faint">Due {formatDate(g.dueDate)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AddGoalModal open={goalOpen} onClose={() => setGoalOpen(false)} />
      {review && <SelfReviewModal open={selfOpen} onClose={() => setSelfOpen(false)} reviewId={review.id} />}
    </div>
  );
}

function TeamReviews({ activeCycleId }: { activeCycleId?: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [managerReviewOpen, setManagerReviewOpen] = useState<{ id: string; name: string } | null>(null);
  const employeeId = user?.employee?.id;

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["direct-reports", employeeId],
    queryFn: () => EmployeesApi.directReports(employeeId!),
    enabled: !!employeeId,
  });
  const { data: reviews } = useQuery({
    queryKey: ["performance", "reviews", "team", activeCycleId],
    queryFn: () => PerformanceApi.reviews({ scope: "team", cycleId: activeCycleId }),
    enabled: !!activeCycleId,
  });

  const ensureMutation = useMutation({
    mutationFn: (revieweeId: string) => PerformanceApi.ensureReview({ cycleId: activeCycleId!, revieweeId, reviewerId: employeeId! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance", "reviews", "team"] });
      showToast("Review started.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  if (!activeCycleId) return <EmptyState icon={ClipboardList} title="No active review cycle" description="Create one from Settings to begin collecting reviews." />;
  if (reportsLoading) return <Skeleton className="h-64 rounded-3xl" />;
  if (!reports?.length) return <EmptyState icon={CheckCircle2} title="No direct reports" />;

  return (
    <Card>
      <CardHeader title="Direct reports" subtitle="Review status for the current cycle" />
      <div className="space-y-2">
        {reports.map((emp) => {
          const review = reviews?.find((r) => r.revieweeId === emp.id);
          return (
            <div key={emp.id} className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar firstName={emp.firstName} lastName={emp.lastName} src={emp.avatarUrl} size="sm" />
                <div>
                  <p className="text-[13px] font-medium text-ink">{emp.firstName} {emp.lastName}</p>
                  <p className="text-[12px] text-ink-faint">{emp.designationTitle}</p>
                </div>
              </div>
              {!review ? (
                <Button size="sm" variant="outline" onClick={() => ensureMutation.mutate(emp.id)} isLoading={ensureMutation.isPending}>Start review</Button>
              ) : review.status === "COMPLETED" ? (
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink"><Star size={14} className="fill-gold-500 text-gold-500" /> {review.finalRating}/5</span>
              ) : review.status === "MANAGER_REVIEW" ? (
                <Button size="sm" onClick={() => setManagerReviewOpen({ id: review.id, name: `${emp.firstName} ${emp.lastName}` })}>Submit review</Button>
              ) : (
                <Badge tone="neutral">Awaiting self-review</Badge>
              )}
            </div>
          );
        })}
      </div>
      {managerReviewOpen && (
        <ManagerReviewModal reviewId={managerReviewOpen.id} employeeName={managerReviewOpen.name} onClose={() => setManagerReviewOpen(null)} />
      )}
    </Card>
  );
}

function AddGoalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<GoalForm>({ resolver: zodResolver(goalSchema) });

  const mutation = useMutation({
    mutationFn: PerformanceApi.createGoal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance", "goals", "mine"] });
      showToast("Goal added.");
      reset();
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Add a goal" footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>Add goal</Button>
      </>
    }>
      <div className="space-y-4">
        <TextField label="Title" required error={errors.title?.message} {...register("title")} />
        <TextareaField label="Description" {...register("description")} />
        <TextField label="Due date" type="date" required error={errors.dueDate?.message} {...register("dueDate")} />
      </div>
    </Modal>
  );
}

function SelfReviewModal({ open, onClose, reviewId }: { open: boolean; onClose: () => void; reviewId: string }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(4);
  const { register, handleSubmit } = useForm({ defaultValues: { strengths: "", improvements: "" } });

  const mutation = useMutation({
    mutationFn: (v: { strengths: string; improvements: string }) => PerformanceApi.submitSelf(reviewId, rating, v.strengths, v.improvements),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance", "my-review"] });
      showToast("Self-review submitted.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Complete self-review" footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>Submit</Button>
      </>
    }>
      <div className="space-y-4">
        <div>
          <label className="text-[13px] font-medium text-ink-soft">Self rating</label>
          <div className="mt-1.5 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)}>
                <Star size={24} className={cx(n <= rating ? "fill-gold-500 text-gold-500" : "text-line")} />
              </button>
            ))}
          </div>
        </div>
        <TextareaField label="Key strengths this cycle" required {...register("strengths")} />
        <TextareaField label="Areas to improve" required {...register("improvements")} />
      </div>
    </Modal>
  );
}

function ManagerReviewModal({ reviewId, employeeName, onClose }: { reviewId: string; employeeName: string; onClose: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(4);
  const { register, handleSubmit } = useForm({ defaultValues: { managerComments: "" } });

  const mutation = useMutation({
    mutationFn: (v: { managerComments: string }) => PerformanceApi.submitManager(reviewId, rating, v.managerComments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance", "reviews", "team"] });
      showToast("Review completed.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open onClose={onClose} title={`Review — ${employeeName}`} footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>Complete review</Button>
      </>
    }>
      <div className="space-y-4">
        <div>
          <label className="text-[13px] font-medium text-ink-soft">Manager rating</label>
          <div className="mt-1.5 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)}>
                <Star size={24} className={cx(n <= rating ? "fill-gold-500 text-gold-500" : "text-line")} />
              </button>
            ))}
          </div>
        </div>
        <TextareaField label="Feedback for this cycle" required {...register("managerComments")} />
      </div>
    </Modal>
  );
}
