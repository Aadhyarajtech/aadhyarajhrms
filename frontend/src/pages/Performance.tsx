import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Target,
  Star,
  CheckCircle2,
  ClipboardList,
  Award,
  MessageSquare,
  TrendingUp,
  ShieldCheck,
} from "lucide-react";
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
import { TextField, TextareaField, SelectField } from "@/components/ui/Field";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import { formatDate, cx } from "@/lib/format";

const MANAGER_ROLES: string[] = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"];

const goalSchema = z.object({
  title: z.string().min(2, "Required"),
  description: z.string().optional(),
  dueDate: z.string().min(1, "Required"),
  category: z.string().optional(),
  targetValue: z.string().optional(),
  currentValue: z.string().optional(),
  milestones: z.string().optional(),
});
type GoalForm = z.infer<typeof goalSchema>;

export default function Performance() {
  const { user } = useAuth();
  const isManager = !!user && MANAGER_ROLES.includes(user.role);
  const [tab, setTab] = useState("mine");
  const { data: cycles } = useQuery({
    queryKey: ["performance", "cycles"],
    queryFn: () => PerformanceApi.cycles(),
  });
  const activeCycle = cycles?.find((c) => c.isActive);

  const tabs = [
    { key: "mine", label: "My Performance" },
    { key: "feedback", label: "360 Feedback" },
    ...(isManager ? [{ key: "team", label: "Team Reviews" }] : []),
    ...(isManager ? [{ key: "pip", label: "PIP Management" }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Performance"
        subtitle={
          activeCycle
            ? `Current cycle: ${activeCycle.name} (${formatDate(activeCycle.startDate)} – ${formatDate(activeCycle.endDate)})`
            : "No active review cycle"
        }
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-6 w-fit" />
      {tab === "mine" && <MyPerformance activeCycleId={activeCycle?.id} />}
      {tab === "feedback" && <FeedbackRequests />}
      {tab === "team" && isManager && (
        <TeamReviews activeCycleId={activeCycle?.id} />
      )}
      {tab === "pip" && isManager && <PipManagement />}
    </div>
  );
}

function MyPerformance({ activeCycleId }: { activeCycleId?: string }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [goalOpen, setGoalOpen] = useState(false);
  const [selfOpen, setSelfOpen] = useState(false);

  const { data: review, isLoading: reviewLoading } = useQuery({
    queryKey: ["performance", "my-review"],
    queryFn: PerformanceApi.myReview,
  });
  const { data: goals, isLoading: goalsLoading } = useQuery({
    queryKey: ["performance", "goals", "mine"],
    queryFn: () => PerformanceApi.goals(),
  });
  const { data: trend } = useQuery({
    queryKey: ["performance", "goal-trend"],
    queryFn: () => PerformanceApi.goalTrend(),
  });
  const { data: outcome } = useQuery({ queryKey: ["performance", "outcome", review?.id], queryFn: () => PerformanceApi.outcome(review!.id), enabled: !!review?.id && review.status === "COMPLETED" });
  const { data: feedback } = useQuery({ queryKey: ["performance", "feedback-summary", review?.id], queryFn: () => PerformanceApi.feedbackSummary(review!.id), enabled: !!review?.id });

  const currentValueMutation = useMutation({
    mutationFn: ({ id, currentValue }: { id: string; currentValue: number }) =>
      PerformanceApi.updateGoalCurrentValue(id, currentValue),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["performance", "goals", "mine"],
      });
      queryClient.invalidateQueries({
        queryKey: ["performance", "goal-trend"],
      });
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  // Kept for goals that do not have a numeric KPI target.
  const progressMutation = useMutation({
    mutationFn: ({ id, progress }: { id: string; progress: number }) =>
      PerformanceApi.updateGoalProgress(id, progress),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["performance", "goals", "mine"],
      }),
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="My review" />
        {reviewLoading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : !review ? (
          <EmptyState
            icon={ClipboardList}
            title="No review cycle assigned yet"
            description="Your manager or HR will initiate your review when the cycle begins."
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={review.status} />
              {review.finalRating && (
                <span className="flex items-center gap-1 text-[13px] font-medium text-ink">
                  <Star size={14} className="fill-gold-500 text-gold-500" />{" "}
                  {review.finalRating}/5 final rating
                </span>
              )}
            </div>
            {review.selfRating && (
              <div className="rounded-2xl bg-ink/[0.03] p-4">
                <p className="text-[12px] font-medium text-ink-faint">
                  Your self-assessment
                </p>
                <p className="mt-1 text-[13px] text-ink">
                  Rating: {review.selfRating}/5
                </p>
                <p className="mt-1 text-[13px] text-ink-soft">
                  {review.strengths}
                </p>
              </div>
            )}
            {review.managerComments && (
              <div className="rounded-2xl bg-brand-50 p-4">
                <p className="text-[12px] font-medium text-brand-700">
                  Manager feedback
                </p>
                <p className="mt-1 text-[13px] text-ink-soft">
                  {review.managerComments}
                </p>
              </div>
            )}
            {(review.status === "NOT_STARTED" ||
              review.status === "SELF_REVIEW") && (
              <Button size="sm" onClick={() => setSelfOpen(true)}>
                {review.selfRating
                  ? "Update self-review"
                  : "Complete self-review"}
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Performance insights" />
        <div className="space-y-4">
          {trend?.length ? (
            <div>
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-faint">
                <TrendingUp size={14} /> Goal achievement history
              </p>
              <div className="mt-2 space-y-2">
                {trend.slice(-3).map((item) => (
                  <div
                    key={item.cycleId ?? item.cycleName}
                    className="flex justify-between text-[13px]"
                  >
                    <span className="text-ink-soft">{item.cycleName}</span>
                    <span className="font-medium text-ink">
                      {item.achievementPercentage}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink-faint">
              Goal trends appear after goals are added to a cycle.
            </p>
          )}
          {feedback?.responseCount ? (
            <div className="rounded-2xl bg-ink/[0.03] p-4">
              <p className="text-[12px] font-medium text-ink-faint">
                360-degree feedback
              </p>
              <p className="mt-1 text-[13px] text-ink">
                {feedback.responseCount} anonymous response
                {feedback.responseCount === 1 ? "" : "s"}
              </p>
            </div>
          ) : null}
          {outcome ? (
            <div className="rounded-2xl bg-brand-50 p-4">
              <p className="flex items-center gap-1 text-[12px] font-medium text-brand-700">
                <Award size={14} /> Review outcome
              </p>
              <p className="mt-1 text-[13px] text-ink-soft">
                {outcome.incrementRecommendation} increment
                {outcome.promotionEligible ? " · Promotion eligible" : ""}
                {outcome.fastTrackEligible ? " · Fast-track nominee" : ""}
                {outcome.pipRecommended ? " · PIP created" : ""}
              </p>
              {outcome.trainingNeeds.length ? (
                <p className="mt-1 text-[12px] text-ink-faint">
                  Development focus: {outcome.trainingNeeds.join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="My goals"
          action={
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Plus size={14} />}
              onClick={() => setGoalOpen(true)}
            >
              Add goal
            </Button>
          }
        />
        {goalsLoading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : !goals?.length ? (
          <EmptyState
            icon={Target}
            title="No goals yet"
            description="Set a goal to track your progress this cycle."
          />
        ) : (
          <div className="space-y-5">
            {goals.map((g) => {
              const goal = g as any;
              return (
                <div key={g.id} className="rounded-2xl border border-line/60 p-4">
                  <div className="flex items-start justify-between gap-3 text-[13px]">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{g.title}</p>
                      {g.description && (
                        <p className="mt-0.5 text-[12px] text-ink-faint">
                          {g.description}
                        </p>
                      )}
                    </div>
                    <Badge
                      tone={
                        g.status === "AT_RISK"
                          ? "warning"
                          : g.status === "COMPLETED"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {g.status.replace("_", " ")}
                    </Badge>
                  </div>

                  {(goal.category || goal.targetValue !== null || goal.currentValue !== null) && (
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-faint">
                      {goal.category && <span>KPI: {goal.category}</span>}
                      {goal.targetValue !== null && <span>Target: {goal.targetValue}</span>}
                      {goal.currentValue !== null && <span>Current: {goal.currentValue}</span>}
                    </div>
                  )}

                  {typeof goal.targetValue === "number" && goal.targetValue > 0 ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label
                            htmlFor={`goal-current-${g.id}`}
                            className="text-[11.5px] font-medium text-ink-faint"
                          >
                            Current value
                          </label>
                          <input
                            id={`goal-current-${g.id}`}
                            type="number"
                            min={0}
                            step="any"
                            value={goal.currentValue ?? 0}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              if (!Number.isFinite(value) || value < 0) return;
                              if (value === Number(goal.currentValue ?? 0)) return;
                              currentValueMutation.mutate({
                                id: g.id,
                                currentValue: value,
                              });
                            }}
                            disabled={currentValueMutation.isPending}
                            aria-label={`Update current value for ${g.title}`}
                            className="mt-1 w-full rounded-xl border border-line/70 bg-white px-3 py-2 text-[13px] text-ink outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </div>
                        <div className="pb-2 text-[12px] text-ink-faint">
                          / {goal.targetValue}
                        </div>
                        <span className="w-12 pb-2 text-right text-[12px] font-medium text-ink">
                          {g.progress}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, g.progress))}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-ink-faint">
                        Progress is calculated automatically from current value and target.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={g.progress}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (next === g.progress) return;
                          progressMutation.mutate({ id: g.id, progress: next });
                        }}
                        disabled={progressMutation.isPending}
                        aria-label={`Update progress for ${g.title}`}
                        className="h-1.5 flex-1 cursor-pointer accent-brand-500 disabled:cursor-not-allowed"
                      />
                      <span className="w-10 text-right text-[12px] font-medium text-ink">
                        {g.progress}%
                      </span>
                    </div>
                  )}

                  {goal.milestones?.length ? (
                    <div className="mt-3">
                      <p className="text-[11.5px] font-medium text-ink-faint">
                        Milestones
                      </p>
                      <div className="mt-1.5 space-y-1">
                        {goal.milestones.map((milestone: any, index: number) => (
                          <div
                            key={`${milestone.title}-${index}`}
                            className="flex items-center gap-2 text-[12px] text-ink-soft"
                          >
                            <CheckCircle2
                              size={14}
                              className={
                                milestone.completed
                                  ? "text-brand-600"
                                  : "text-line"
                              }
                            />
                            <span
                              className={
                                milestone.completed
                                  ? "line-through opacity-70"
                                  : ""
                              }
                            >
                              {milestone.title}
                            </span>
                            {milestone.targetDate && (
                              <span className="text-ink-faint">
                                · {formatDate(milestone.targetDate)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <p className="mt-3 text-[11.5px] text-ink-faint">
                    Due {formatDate(g.dueDate)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AddGoalModal open={goalOpen} onClose={() => setGoalOpen(false)} cycleId={activeCycleId} />
      {review && (
        <SelfReviewModal
          open={selfOpen}
          onClose={() => setSelfOpen(false)}
          reviewId={review.id}
        />
      )}
    </div>
  );
}

function PipManagement() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPip, setSelectedPip] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);

  const { data: pips, isLoading } = useQuery({
    queryKey: ["performance", "pips"],
    queryFn: PerformanceApi.pips,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, finalOutcome }: { id: string; status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED"; finalOutcome?: string }) =>
      PerformanceApi.updatePipStatus(id, status, finalOutcome),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance", "pips"] });
      if (selectedPip) {
        queryClient.invalidateQueries({ queryKey: ["performance", "pip", selectedPip.id] });
      }
      showToast("PIP status updated.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const detailQuery = useQuery({
    queryKey: ["performance", "pip", selectedPip?.id],
    queryFn: () => PerformanceApi.pip(selectedPip.id),
    enabled: !!selectedPip?.id,
  });

  if (isLoading) return <Skeleton className="h-64 rounded-3xl" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Performance Improvement Plans"
          subtitle="Manage active and completed PIPs for employees."
          action={
            <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
              Create PIP
            </Button>
          }
        />

        {!pips?.length ? (
          <EmptyState
            icon={ShieldCheck}
            title="No PIPs yet"
            description="Create a Performance Improvement Plan for an employee who needs structured performance support."
          />
        ) : (
          <div className="space-y-2">
            {pips.map((pip: any) => (
              <button
                key={pip.id}
                type="button"
                onClick={() => setSelectedPip(pip)}
                className="w-full rounded-2xl border border-line/60 px-4 py-3 text-left transition hover:bg-ink/[0.02]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[13px] font-medium text-ink">
                      {pip.employeeName ?? pip.employeeId}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-faint">
                      {formatDate(pip.startDate)} – {formatDate(pip.endDate)}
                    </p>
                  </div>
                  <StatusBadge status={pip.status} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[12px] text-ink-faint">
                  <span>{pip.objectives?.length ?? 0} objective{pip.objectives?.length === 1 ? "" : "s"}</span>
                  <span>{pip.checkIns?.length ?? 0} check-in{pip.checkIns?.length === 1 ? "" : "s"}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selectedPip && (
        <Modal
          open
          onClose={() => setSelectedPip(null)}
          title="PIP Details"
          footer={
            <Button variant="outline" onClick={() => setSelectedPip(null)}>
              Close
            </Button>
          }
        >
          {detailQuery.isLoading ? (
            <Skeleton className="h-48 rounded-2xl" />
          ) : detailQuery.data ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] text-ink-faint">Employee</p>
                  <p className="text-[14px] font-medium text-ink">
                    {detailQuery.data.employeeName ?? detailQuery.data.employeeId}
                  </p>
                </div>
                <StatusBadge status={detailQuery.data.status} />
              </div>

              <div>
                <p className="text-[12px] font-medium text-ink-faint">Objectives</p>
                <div className="mt-2 space-y-3">
                  {(detailQuery.data.objectives ?? []).map((objective: any, index: number) => (
                    <div key={`${objective.title}-${index}`} className="rounded-2xl bg-ink/[0.03] p-4">
                      <p className="text-[13px] font-medium text-ink">{objective.title}</p>
                      {objective.description && <p className="mt-1 text-[12px] text-ink-soft">{objective.description}</p>}
                      {objective.target && <p className="mt-1 text-[12px] text-ink-faint">Target: {objective.target}</p>}
                      <div className="mt-2 flex items-center justify-between text-[12px]">
                        <span>{objective.progress ?? 0}% complete</span>
                        <span>{objective.status?.replace("_", " ")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[12px] font-medium text-ink-faint">Check-ins</p>
                {!detailQuery.data.checkIns?.length ? (
                  <p className="mt-2 text-[13px] text-ink-faint">No check-ins recorded.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {detailQuery.data.checkIns.map((checkIn: any, index: number) => (
                      <div key={`${checkIn.date}-${index}`} className="rounded-2xl border border-line/60 p-3">
                        <div className="flex justify-between text-[12px]">
                          <span>{formatDate(checkIn.date)}</span>
                          <span>{checkIn.progress ?? 0}%</span>
                        </div>
                        {checkIn.managerComments && <p className="mt-1 text-[12px] text-ink-soft">{checkIn.managerComments}</p>}
                        {checkIn.nextSteps && <p className="mt-1 text-[12px] text-ink-faint">Next: {checkIn.nextSteps}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setCheckInOpen(true)}>
                  Add check-in
                </Button>
                {detailQuery.data.status !== "COMPLETED" && (
                  <Button
                    size="sm"
                    onClick={() =>
                      statusMutation.mutate({
                        id: detailQuery.data.id,
                        status: "COMPLETED",
                        finalOutcome: "PIP completed successfully.",
                      })
                    }
                    isLoading={statusMutation.isPending}
                  >
                    Complete PIP
                  </Button>
                )}
              </div>

              {checkInOpen && (
                <PipCheckInModal
                  pipId={detailQuery.data.id}
                  onClose={() => setCheckInOpen(false)}
                />
              )}
            </div>
          ) : (
            <EmptyState icon={ShieldCheck} title="PIP not found" />
          )}
        </Modal>
      )}

      <CreatePipModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function CreatePipModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: reviews } = useQuery({
    queryKey: ["performance", "reviews", "pip-source"],
    queryFn: () => PerformanceApi.reviews(),
  });

  const form = useForm({
    defaultValues: {
      reviewId: "",
      employeeId: "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
      title: "",
      description: "",
      target: "",
      dueDate: "",
      checkInFrequency: "WEEKLY",
    },
  });

  const mutation = useMutation({
    mutationFn: (value: any) =>
      PerformanceApi.createPip({
        reviewId: value.reviewId,
        employeeId: value.employeeId,
        startDate: value.startDate,
        endDate: value.endDate,
        checkInFrequency: value.checkInFrequency,
        objectives: [{
          title: value.title,
          description: value.description || undefined,
          target: value.target || undefined,
          dueDate: value.dueDate,
          progress: 0,
          status: "NOT_STARTED",
        }],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance", "pips"] });
      showToast("PIP created.");
      form.reset();
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const completedReviews = (reviews ?? []).filter((review: any) => review.status === "COMPLETED");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Performance Improvement Plan"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={form.handleSubmit((value) => mutation.mutate(value))} isLoading={mutation.isPending}>
            Create PIP
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField label="Completed review" {...form.register("reviewId")} onChange={(event) => {
          const review = completedReviews.find((item: any) => item.id === event.target.value);
          form.setValue("reviewId", event.target.value);
          if (review) form.setValue("employeeId", review.revieweeId);
        }}>
          <option value="">Select review</option>
          {completedReviews.map((review: any) => (
            <option key={review.id} value={review.id}>
              {review.revieweeFirstName} {review.revieweeLastName} — {review.finalRating}/5
            </option>
          ))}
        </SelectField>

        <div className="grid grid-cols-2 gap-4">
          <TextField label="Start date" type="date" required {...form.register("startDate")} />
          <TextField label="End date" type="date" required {...form.register("endDate")} />
        </div>

        <TextField label="Objective title" required {...form.register("title")} />
        <TextareaField label="Objective description" {...form.register("description")} />
        <TextField label="Target" {...form.register("target")} />
        <TextField label="Objective due date" type="date" required {...form.register("dueDate")} />

        <SelectField label="Check-in frequency" {...form.register("checkInFrequency")}>
          <option value="WEEKLY">Weekly</option>
          <option value="BIWEEKLY">Biweekly</option>
          <option value="MONTHLY">Monthly</option>
        </SelectField>
      </div>
    </Modal>
  );
}

function PipCheckInModal({ pipId, onClose }: { pipId: string; onClose: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm({
    defaultValues: {
      progress: 0,
      managerComments: "",
      hrComments: "",
      nextSteps: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (value: any) => PerformanceApi.addPipCheckIn(pipId, {
      progress: Number(value.progress),
      managerComments: value.managerComments || undefined,
      hrComments: value.hrComments || undefined,
      nextSteps: value.nextSteps || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance", "pip", pipId] });
      queryClient.invalidateQueries({ queryKey: ["performance", "pips"] });
      showToast("Check-in added.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add PIP check-in"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={form.handleSubmit((value) => mutation.mutate(value))} isLoading={mutation.isPending}>
            Save check-in
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Progress" type="number" min="0" max="100" {...form.register("progress")} />
        <TextareaField label="Manager comments" {...form.register("managerComments")} />
        <TextareaField label="HR comments" {...form.register("hrComments")} />
        <TextareaField label="Next steps" {...form.register("nextSteps")} />
      </div>
    </Modal>
  );
}

function TeamReviews({ activeCycleId }: { activeCycleId?: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [managerReviewOpen, setManagerReviewOpen] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [goalFor, setGoalFor] = useState<{ id: string; name: string } | null>(null);
  const employeeId = user?.employee?.id;

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["direct-reports", employeeId],
    queryFn: () => EmployeesApi.directReports(employeeId!),
    enabled: !!employeeId,
  });
  const { data: reviews } = useQuery({
    queryKey: ["performance", "reviews", "team", activeCycleId],
    queryFn: () =>
      PerformanceApi.reviews({ scope: "team", cycleId: activeCycleId }),
    enabled: !!activeCycleId,
  });

  const ensureMutation = useMutation({
    mutationFn: (revieweeId: string) =>
      PerformanceApi.ensureReview({
        cycleId: activeCycleId!,
        revieweeId,
        reviewerId: employeeId!,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["performance", "reviews", "team", activeCycleId],
      });
      showToast("Review started.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  if (!activeCycleId)
    return (
      <EmptyState
        icon={ClipboardList}
        title="No active review cycle"
        description="Create one from Settings to begin collecting reviews."
      />
    );
  if (reportsLoading) return <Skeleton className="h-64 rounded-3xl" />;
  if (!reports?.length)
    return <EmptyState icon={CheckCircle2} title="No direct reports" />;

  return (
    <Card>
      <CardHeader
        title="Direct reports"
        subtitle="Review status for the current cycle"
      />
      <div className="space-y-2">
        {reports.map((emp) => {
          const review = reviews?.find((r) => r.revieweeId === emp.id);
          return (
            <div
              key={emp.id}
              className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  firstName={emp.firstName}
                  lastName={emp.lastName}
                  src={emp.avatarUrl}
                  size="sm"
                />
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {emp.firstName} {emp.lastName}
                  </p>
                  <p className="text-[12px] text-ink-faint">
                    {emp.designationTitle}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!review || review.status === "NOT_STARTED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => ensureMutation.mutate(emp.id)}
                    isLoading={ensureMutation.isPending}
                  >
                    Start review
                  </Button>
                ) : review.status === "COMPLETED" ? (
                  <>
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                      <Star size={14} className="fill-gold-500 text-gold-500" />{" "}
                      {review.finalRating}/5
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setOutcomeFor({
                          id: review.id,
                          name: `${emp.firstName} ${emp.lastName}`,
                        })
                      }
                    >
                      Outcome
                    </Button>
                  </>
                ) : review.status === "MANAGER_REVIEW" ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      setManagerReviewOpen({
                        id: review.id,
                        name: `${emp.firstName} ${emp.lastName}`,
                      })
                    }
                  >
                    Conduct review
                  </Button>
                ) : (
                  <Badge tone="neutral">Awaiting self-review</Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setGoalFor({
                      id: emp.id,
                      name: `${emp.firstName} ${emp.lastName}`,
                    })
                  }
                >
                  Assign goal
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {managerReviewOpen && (
        <ManagerReviewModal
          reviewId={managerReviewOpen.id}
          employeeName={managerReviewOpen.name}
          onClose={() => setManagerReviewOpen(null)}
        />
      )}
      {outcomeFor && (
        <PerformanceOutcomeModal
          reviewId={outcomeFor.id}
          employeeName={outcomeFor.name}
          onClose={() => setOutcomeFor(null)}
        />
      )}
      {goalFor && (
        <AddGoalModal
          open
          onClose={() => setGoalFor(null)}
          employeeId={goalFor.id}
          employeeName={goalFor.name}
          cycleId={activeCycleId}
        />
      )}
    </Card>
  );
}

function PerformanceOutcomeModal({
  reviewId,
  employeeName,
  onClose,
}: {
  reviewId: string;
  employeeName: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [incrementRecommendation, setIncrementRecommendation] = useState<
    "MAXIMUM" | "STANDARD" | "NONE" | "PIP"
  >("STANDARD");
  const [promotionEligible, setPromotionEligible] = useState(false);
  const [pipRecommended, setPipRecommended] = useState(false);
  const [fastTrackEligible, setFastTrackEligible] = useState(false);
  const [trainingNeeds, setTrainingNeeds] = useState("");

  const { data: outcome, isLoading } = useQuery({
    queryKey: ["performance", "outcome", reviewId],
    queryFn: () => PerformanceApi.outcome(reviewId),
  });

  const mutation = useMutation({
    mutationFn: () =>
      PerformanceApi.updateOutcome(reviewId, {
        incrementRecommendation,
        promotionEligible,
        trainingNeeds: trainingNeeds
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        pipRecommended,
        fastTrackEligible,
      }),
    onSuccess: (updatedOutcome) => {
      queryClient.setQueryData(
        ["performance", "outcome", reviewId],
        updatedOutcome,
      );
      queryClient.invalidateQueries({
        queryKey: ["performance", "my-review"],
      });
      showToast("Performance outcome updated.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  useEffect(() => {
    if (!outcome) return;
    setIncrementRecommendation(outcome.incrementRecommendation);
    setPromotionEligible(outcome.promotionEligible);
    setPipRecommended(outcome.pipRecommended);
    setFastTrackEligible(outcome.fastTrackEligible);
    setTrainingNeeds(outcome.trainingNeeds.join(", "));
  }, [outcome]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Performance Outcome — ${employeeName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            disabled={isLoading}
          >
            Save outcome
          </Button>
        </>
      }
    >
      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl bg-ink/[0.03] p-4">
            <p className="text-[12px] font-medium text-ink-faint">
              Performance outcome actions
            </p>
            <p className="mt-1 text-[12px] text-ink-soft">
              These decisions are recorded against the completed performance review.
            </p>
          </div>

          <SelectField
            label="Increment recommendation"
            value={incrementRecommendation}
            onChange={(event) =>
              setIncrementRecommendation(
                event.target.value as "MAXIMUM" | "STANDARD" | "NONE" | "PIP",
              )
            }
          >
            <option value="MAXIMUM">Maximum</option>
            <option value="STANDARD">Standard</option>
            <option value="NONE">None</option>
            <option value="PIP">PIP</option>
          </SelectField>

          <TextareaField
            label="Training / development needs"
            hint="Separate multiple needs with commas"
            value={trainingNeeds}
            onChange={(event) => setTrainingNeeds(event.target.value)}
          />

          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-3 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={promotionEligible}
                onChange={(event) => setPromotionEligible(event.target.checked)}
                className="h-4 w-4 rounded border-line accent-brand-500"
              />
              Promotion eligible
            </label>

            <label className="flex cursor-pointer items-center gap-3 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={pipRecommended}
                onChange={(event) => setPipRecommended(event.target.checked)}
                className="h-4 w-4 rounded border-line accent-brand-500"
              />
              PIP recommended
            </label>

            <label className="flex cursor-pointer items-center gap-3 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={fastTrackEligible}
                onChange={(event) => setFastTrackEligible(event.target.checked)}
                className="h-4 w-4 rounded border-line accent-brand-500"
              />
              Fast-track eligible
            </label>
          </div>

          {outcome && (
            <div className="rounded-2xl border border-line/60 p-4">
              <p className="text-[12px] font-medium text-ink-faint">
                Current outcome
              </p>
              <div className="mt-2 grid gap-2 text-[12px] text-ink-soft sm:grid-cols-2">
                <span>Increment: {outcome.incrementRecommendation}</span>
                <span>
                  Promotion: {outcome.promotionEligible ? "Eligible" : "Not eligible"}
                </span>
                <span>
                  PIP: {outcome.pipRecommended ? "Recommended" : "Not recommended"}
                </span>
                <span>
                  Fast-track: {outcome.fastTrackEligible ? "Eligible" : "Not eligible"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function FeedbackRequests() {
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(
    null,
  );
  const { data: reviews, isLoading } = useQuery({
    queryKey: ["performance", "feedback-requests"],
    queryFn: PerformanceApi.feedbackRequests,
  });
  if (isLoading) return <Skeleton className="h-64 rounded-3xl" />;
  if (!reviews?.length)
    return (
      <EmptyState
        icon={MessageSquare}
        title="No 360 feedback requests"
        description="Feedback requests will appear when reviews are initiated in the active cycle."
      />
    );
  return (
    <Card>
      <CardHeader
        title="360-degree feedback"
        subtitle="Your responses are aggregated and never show your name to the reviewee."
      />
      <div className="space-y-2">
        {reviews.map((review) => (
          <div
            key={review.id}
            className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Avatar
                firstName={review.revieweeFirstName}
                lastName={review.revieweeLastName}
                src={review.revieweeAvatar}
                size="sm"
              />
              <div>
                <p className="text-[13px] font-medium text-ink">
                  {review.revieweeFirstName} {review.revieweeLastName}
                </p>
                <p className="text-[12px] text-ink-faint">
                  {review.revieweeDesignation}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setSelected({
                  id: review.id,
                  name: `${review.revieweeFirstName} ${review.revieweeLastName}`,
                })
              }
            >
              Give feedback
            </Button>
          </div>
        ))}
      </div>
      {selected && (
        <FeedbackModal
          reviewId={selected.id}
          employeeName={selected.name}
          onClose={() => setSelected(null)}
        />
      )}
    </Card>
  );
}

function FeedbackModal({
  reviewId,
  employeeName,
  onClose,
}: {
  reviewId: string;
  employeeName: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState<"PEER" | "SUBORDINATE">("PEER");
  const [ratings, setRatings] = useState<Record<string, number>>({
    Collaboration: 3,
    Communication: 3,
    Ownership: 3,
  });
  const { register, handleSubmit } = useForm<{ comments: string }>({
    defaultValues: { comments: "" },
  });
  const mutation = useMutation({
    mutationFn: (value: { comments: string }) =>
      PerformanceApi.submitFeedback(reviewId, {
        type,
        comments: value.comments,
        competencyRatings: Object.entries(ratings).map(
          ([competency, rating]) => ({ competency, rating }),
        ),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["performance", "feedback-requests"],
      });
      showToast("Anonymous feedback submitted.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Feedback — ${employeeName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={mutation.isPending}
            onClick={handleSubmit((value) => mutation.mutate(value))}
          >
            Submit feedback
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          label="Feedback relationship"
          value={type}
          onChange={(event) =>
            setType(event.target.value as "PEER" | "SUBORDINATE")
          }
        >
          <option value="PEER">Peer</option>
          <option value="SUBORDINATE">Subordinate</option>
        </SelectField>
        {Object.entries(ratings).map(([competency, rating]) => (
          <div key={competency}>
            <p className="text-[13px] font-medium text-ink-soft">
              {competency}
            </p>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`${competency}: ${value}`}
                  onClick={() =>
                    setRatings((current) => ({
                      ...current,
                      [competency]: value,
                    }))
                  }
                >
                  <Star
                    size={22}
                    className={cx(
                      value <= rating
                        ? "fill-gold-500 text-gold-500"
                        : "text-line",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        ))}
        <TextareaField
          label="Comments"
          hint="Your identity is not shown to the reviewee."
          {...register("comments")}
        />
      </div>
    </Modal>
  );
}

function AddGoalModal({
  open,
  onClose,
  employeeId,
  employeeName,
  cycleId,
}: {
  open: boolean;
  onClose: () => void;
  employeeId?: string;
  employeeName?: string;
  cycleId?: string;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GoalForm>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      title: "",
      description: "",
      dueDate: "",
      category: "",
      targetValue: "",
      currentValue: "",
      milestones: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (value: GoalForm) => {
      const targetValue =
        value.targetValue?.trim() ? Number(value.targetValue) : null;
      const currentValue =
        value.currentValue?.trim() ? Number(value.currentValue) : null;

      if (
        targetValue !== null &&
        (!Number.isFinite(targetValue) || targetValue < 0)
      ) {
        throw new Error("Target value must be a valid non-negative number.");
      }

      if (
        currentValue !== null &&
        (!Number.isFinite(currentValue) || currentValue < 0)
      ) {
        throw new Error("Current value must be a valid non-negative number.");
      }

      const goal = await PerformanceApi.createGoal({
        title: value.title,
        description: value.description || undefined,
        dueDate: value.dueDate,
        employeeId,
        cycleId: cycleId ?? null,
        category: value.category?.trim() || undefined,
        targetValue,
        currentValue,
        milestones:
          value.milestones
            ?.split(",")
            .map((title) => title.trim())
            .filter(Boolean)
            .map((title) => ({ title, completed: false })) ?? [],
      });

      // The backend calculates KPI progress and status from targetValue/currentValue.
      return goal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["performance", "goals", "mine"],
      });
      queryClient.invalidateQueries({
        queryKey: ["performance", "goal-trend"],
      });
      showToast(employeeName ? "Goal assigned." : "Goal added.");
      reset();
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employeeName ? `Assign goal — ${employeeName}` : "Add a goal"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit((v) => mutation.mutate(v))}
            isLoading={mutation.isPending}
          >
            {employeeName ? "Assign goal" : "Add goal"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Title"
          required
          error={errors.title?.message}
          {...register("title")}
        />
        <TextareaField
          label="Description"
          {...register("description")}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="KPI category"
            placeholder="e.g. Delivery"
            {...register("category")}
          />
          <TextField
            label="Target value"
            type="number"
            min="0"
            placeholder="e.g. 100"
            {...register("targetValue")}
          />
        </div>
        <TextField
          label="Current value"
          type="number"
          min="0"
          placeholder="e.g. 40"
          hint="Used with the target to calculate initial progress."
          {...register("currentValue")}
        />
        <TextareaField
          label="Milestones"
          hint="Separate milestones with commas"
          {...register("milestones")}
        />
        <TextField
          label="Due date"
          type="date"
          required
          error={errors.dueDate?.message}
          {...register("dueDate")}
        />
      </div>
    </Modal>
  );
}

function SelfReviewModal({
  open,
  onClose,
  reviewId,
}: {
  open: boolean;
  onClose: () => void;
  reviewId: string;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(4);
  const { register, handleSubmit } = useForm({
    defaultValues: { strengths: "", improvements: "" },
  });

  const mutation = useMutation({
    mutationFn: (v: { strengths: string; improvements: string }) =>
      PerformanceApi.submitSelf(reviewId, rating, v.strengths, v.improvements),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance", "my-review"] });
      showToast("Self-review submitted.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Complete self-review"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit((v) => mutation.mutate(v))}
            isLoading={mutation.isPending}
          >
            Submit
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            Self rating
          </label>
          <div className="mt-1.5 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)}>
                <Star
                  size={24}
                  className={cx(
                    n <= rating ? "fill-gold-500 text-gold-500" : "text-line",
                  )}
                />
              </button>
            ))}
          </div>
        </div>
        <TextareaField
          label="Key strengths this cycle"
          required
          {...register("strengths")}
        />
        <TextareaField
          label="Areas to improve"
          required
          {...register("improvements")}
        />
      </div>
    </Modal>
  );
}

function ManagerReviewModal({
  reviewId,
  employeeName,
  onClose,
}: {
  reviewId: string;
  employeeName: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [technicalRating, setTechnicalRating] = useState<number | null>(null);
  const [deliveryRating, setDeliveryRating] = useState<number | null>(null);
  const [behaviorRating, setBehaviorRating] = useState<number | null>(null);
  const [overallRating, setOverallRating] = useState<number | null>(null);

  const { register, handleSubmit } = useForm({
    defaultValues: { managerComments: "" },
  });

  const mutation = useMutation<
    Awaited<ReturnType<typeof PerformanceApi.submitManager>>,
    unknown,
    { managerComments: string }
  >({
    mutationFn: async (v: { managerComments: string }) => {
      if (
        technicalRating === null ||
        deliveryRating === null ||
        behaviorRating === null ||
        overallRating === null
      ) {
        throw new Error("Please complete all manager ratings.");
      }

      return PerformanceApi.submitManager(
        reviewId,
        overallRating,
        v.managerComments,
        technicalRating,
        deliveryRating,
        behaviorRating,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["performance", "reviews", "team"],
      });
      queryClient.invalidateQueries({
        queryKey: ["performance", "my-review"],
      });
      showToast("Review completed.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const renderRating = (
    label: string,
    rating: number | null,
    setRating: (value: number) => void,
  ) => (
    <div>
      <label className="text-[13px] font-medium text-ink-soft">{label}</label>
      <div className="mt-1.5 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${label}: rate ${n} out of 5`}
          >
            <Star
              size={24}
              className={cx(
                rating !== null && n <= rating
                  ? "fill-gold-500 text-gold-500"
                  : "text-line",
              )}
            />
          </button>
        ))}
      </div>
      {rating === null && (
        <p className="mt-1 text-[11.5px] text-ink-faint">
          Select a rating from 1 to 5.
        </p>
      )}
    </div>
  );

  const allRatingsSelected =
    technicalRating !== null &&
    deliveryRating !== null &&
    behaviorRating !== null &&
    overallRating !== null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Review — ${employeeName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit((v) => mutation.mutate(v))}
            isLoading={mutation.isPending}
            disabled={!allRatingsSelected}
          >
            Complete review
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-ink/[0.03] p-4">
          <p className="text-[12px] font-medium text-ink-faint">
            Manager evaluation
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">
            Rate the employee's technical skills, delivery, and behavior for
            this review cycle.
          </p>
        </div>

        {renderRating("Technical Skills", technicalRating, setTechnicalRating)}

        {renderRating(
          "Delivery / Execution",
          deliveryRating,
          setDeliveryRating,
        )}

        {renderRating(
          "Behavior / Collaboration",
          behaviorRating,
          setBehaviorRating,
        )}

        {renderRating(
          "Overall Manager Rating",
          overallRating,
          setOverallRating,
        )}

        <TextareaField
          label="Feedback for this cycle"
          required
          hint="Include meaningful feedback on strengths, achievements, and areas for improvement."
          {...register("managerComments", {
            required: "Manager feedback is required",
          })}
        />
      </div>
    </Modal>
  );
}
