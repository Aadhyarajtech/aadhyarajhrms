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
  Sparkles,
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


const goalSchema = z.object({
  title: z.string().min(2, "Required"),
  description: z.string().optional(),
  dueDate: z.string().min(1, "Required"),
  category: z.string().optional(),
  targetValue: z.string().optional(),
  currentValue: z.string().optional(),
  parentGoalId: z.string().optional(),
  milestones: z.string().optional(),
});
type GoalForm = z.infer<typeof goalSchema>;

export default function Performance() {
  const { hasPermission } = useAuth();
  const isManager = hasPermission("performance.manage");
  const isHr = hasPermission("performance.manage");
  const [tab, setTab] = useState("mine");
  const { data: cycles } = useQuery({
    queryKey: ["performance", "cycles"],
    queryFn: () => PerformanceApi.cycles(),
  });
  const activeCycle = cycles?.find((c) => c.isActive);
  const { data: journeyGoals } = useQuery({
    queryKey: ["performance", "goals", "journey"],
    queryFn: () => PerformanceApi.goals(),
  });

  const tabs = [
    { key: "mine", label: "My Performance" },
    { key: "feedback", label: "360 Feedback" },
    ...(isManager ? [{ key: "team", label: "Team Reviews" }] : []),
    ...(isManager ? [{ key: "pip", label: "PIP Management" }] : []),
    ...(isHr ? [{ key: "calibration", label: "Calibration" }] : []),
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
      <div className="mb-6 flex justify-end">
        <div className="w-full max-w-md rounded-2xl border border-line/60 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
                  <Target size={18} className="text-brand-600" />
                </div>

                <div>
                  <p className="text-[14px] font-semibold text-ink">
                    Performance Journey
                  </p>

                  <p className="text-[11px] text-ink-faint">
                    Track your progress
                  </p>
                </div>
              </div>
            </div>

            <span className="text-[18px] font-bold text-brand-600">
              {journeyGoals?.length
                ? Math.round(
                  journeyGoals.reduce(
                    (sum, goal) => sum + (goal.progress ?? 0),
                    0,
                  ) / journeyGoals.length,
                )
                : 0}
              %
            </span>
          </div>

          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-ink/[0.08]">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{
                  width: `${journeyGoals?.length
                    ? Math.round(
                      journeyGoals.reduce(
                        (sum, goal) => sum + (goal.progress ?? 0),
                        0,
                      ) / journeyGoals.length,
                    )
                    : 0
                    }%`,
                }}
              />
            </div>
          </div>

          <div className="relative mt-5">
            <div className="absolute left-5 right-5 top-3 h-[2px] bg-line/60" />

            <div className="relative grid grid-cols-4">
              <div className="flex flex-col items-center">
                <div className="z-10 flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                  ✓
                </div>
                <p className="mt-2 text-[10px] font-medium text-ink">
                  Review
                </p>
                <p className="text-[9px] text-brand-600">
                  {activeCycle ? "Active" : "Not Started"}
                </p>
              </div>

              <div className="flex flex-col items-center">
                <div className="z-10 flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                  ✓
                </div>
                <p className="mt-2 text-[10px] font-medium text-ink">
                  Goals
                </p>
                <p className="text-[9px] text-brand-600">
                  {journeyGoals?.length
                    ? `${journeyGoals.filter((goal) => goal.progress >= 100).length}/${journeyGoals.length} Complete`
                    : "No goals"}
                </p>
              </div>

              <div className="flex flex-col items-center">
                <div className="z-10 flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-600">
                  3
                </div>
                <p className="mt-2 text-[10px] font-medium text-ink">
                  Development
                </p>
                <p className="text-[9px] text-amber-600">
                  {activeCycle ? "In Progress" : "Not Started"}
                </p>
              </div>

              <div className="flex flex-col items-center">
                <div className="z-10 flex h-7 w-7 items-center justify-center rounded-full bg-ink/[0.08] text-xs font-bold text-ink-faint">
                  4
                </div>
                <p className="mt-2 text-[10px] font-medium text-ink">
                  Next Review
                </p>
                <p className="text-[9px] text-ink-faint">
                  {activeCycle ? formatDate(activeCycle.endDate) : "Not scheduled"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-brand-50 px-3 py-2">
            <p className="text-[10px] font-medium text-brand-700">
              Current Focus
            </p>

            <p className="mt-1 text-[11px] text-brand-600">
              {journeyGoals?.length
                ? journeyGoals.some((goal) => goal.progress < 100)
                  ? "Focus on completing your active goals."
                  : "All goals are complete. Focus on your next development step."
                : "Set goals to define your current focus."}
            </p>
          </div>
        </div>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="-mt-16 mb-6 w-fit" />
      {tab === "mine" && <MyPerformance activeCycleId={activeCycle?.id} />}
      {tab === "feedback" && <FeedbackRequests />}
      {tab === "team" && isManager && (
        <TeamReviews activeCycleId={activeCycle?.id} isHr={isHr} />
      )}
      {tab === "pip" && isManager && <PipManagement />}
      {tab === "calibration" && isHr && <CalibrationPanel cycleId={activeCycle?.id} />}
    </div>
  );
}

function MyPerformance({ activeCycleId }: { activeCycleId?: string }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [goalOpen, setGoalOpen] = useState(false);
  const [selfOpen, setSelfOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState("");
  const [goalCoachOpen, setGoalCoachOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<any | null>(null);
  const [goalCoachQuestion, setGoalCoachQuestion] = useState("");
  const [goalCoachAnswer, setGoalCoachAnswer] = useState("");
  const { data: review, isLoading: reviewLoading } = useQuery({
    queryKey: ["performance", "my-review", activeCycleId],
    queryFn: PerformanceApi.myReview,
  });
  const { data: goals, isLoading: goalsLoading } = useQuery({
    queryKey: ["performance", "goals", "mine"],
    queryFn: () => PerformanceApi.goals(),
  });
  const { data: goalCascade } = useQuery({
    queryKey: ["performance", "goal-cascade", activeCycleId],
    queryFn: () => PerformanceApi.goalCascade(),
  });
  const { data: trend } = useQuery({
    queryKey: ["performance", "goal-trend"],
    queryFn: () => PerformanceApi.goalTrend(),
  });
  const { data: outcome } = useQuery({ queryKey: ["performance", "outcome", review?.id], queryFn: () => PerformanceApi.outcome(review!.id), enabled: !!review?.id && review.status === "COMPLETED" });
  const { data: feedback } = useQuery({ queryKey: ["performance", "feedback-summary", review?.id], queryFn: () => PerformanceApi.feedbackSummary(review!.id), enabled: !!review?.id });
  const { data: aiInsights, isLoading: aiInsightsLoading } = useQuery({
    queryKey: ["performance", "ai-insights", review?.id],
    queryFn: () => PerformanceApi.aiInsights(review!.id),
    enabled: !!review?.id && review.status === "COMPLETED",
  });


  const {
    data: aiDevelopmentPlan,
    isLoading: aiDevelopmentPlanLoading,
  } = useQuery({
    queryKey: ["performance", "ai-development-plan", review?.id],
    queryFn: () => PerformanceApi.aiDevelopmentPlan(review!.id),
    enabled: !!review?.id && review.status === "COMPLETED",
  });
  const { data: scorecard, isLoading: scorecardLoading } = useQuery({
    queryKey: ["performance", "scorecard", user?.employee?.id],
    queryFn: () => PerformanceApi.scorecard(user!.employee!.id),
    enabled: !!user?.employee?.id,
  });
  const chatMutation = useMutation({
    mutationFn: (question: string) =>
      PerformanceApi.aiChat(review!.id, question),
    onSuccess: (answer) => {
      setChatAnswer(answer);
    },
    onError: (err) => {
      showToast(getErrorMessage(err), "error");
    },
  });
  const goalCoachMutation = useMutation({
    mutationFn: ({
      goalId,
      question,
    }: {
      goalId: string;
      question?: string;
    }) => PerformanceApi.aiGoalCoach(goalId, question),

    onSuccess: (answer) => {
      setGoalCoachAnswer(answer);
    },

    onError: (err) => {
      showToast(getErrorMessage(err), "error");
    },
  });
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
  const performanceStatus =
    scorecard?.overallRating === null ||
      scorecard?.overallRating === undefined
      ? "Not Rated"
      : scorecard.overallRating >= 4.5
        ? "Excellent"
        : scorecard.overallRating >= 4
          ? "Strong"
          : scorecard.overallRating >= 3
            ? "Developing"
            : "Needs Improvement";

  const milestoneMutation = useMutation({
    mutationFn: ({
      id,
      milestoneIndex,
      completed,
    }: {
      id: string;
      milestoneIndex: number;
      completed: boolean;
    }) =>
      PerformanceApi.updateGoalMilestone(id, milestoneIndex, completed),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["performance", "goals", "mine"],
      });
      queryClient.invalidateQueries({
        queryKey: ["performance", "goal-cascade", activeCycleId],
      });
      queryClient.invalidateQueries({
        queryKey: ["performance", "goal-trend"],
      });
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });
  return (
    <div className="space-y-6">
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

      <Card className="overflow-hidden">
        <CardHeader
          title="Performance insights"
          subtitle="A quick view of your goals, feedback, and review progress."
        />

        {(() => {
          const latestTrend = trend?.length ? trend[trend.length - 1] : null;
          const achievement = latestTrend?.achievementPercentage;
          const rating = review?.finalRating ?? review?.selfRating;
          const responseCount = feedback?.responseCount ?? 0;

          return (
            <div className="space-y-5">
              {/* At-a-glance metrics */}
              <div className="grid gap-3 sm:grid-cols-3">
                <InsightMetric
                  icon={Target}
                  label="Goal achievement"
                  value={achievement != null ? `${achievement}%` : "—"}
                  helper={latestTrend?.cycleName ?? "No cycle data yet"}
                  progress={achievement}
                />

                <InsightMetric
                  icon={Star}
                  label="Performance rating"
                  value={rating != null ? `${rating}/5` : "—"}
                  helper={
                    review?.finalRating != null
                      ? "Final rating"
                      : review?.selfRating != null
                        ? "Self-assessment"
                        : "Not rated yet"
                  }
                  rating={rating}
                />

                <InsightMetric
                  icon={MessageSquare}
                  label="360° feedback"
                  value={responseCount ? `${responseCount}` : "—"}
                  helper={
                    responseCount
                      ? `Anonymous response${responseCount === 1 ? "" : "s"}`
                      : "No responses yet"
                  }
                />
              </div>

              {/* Goal history */}
              <div className="rounded-2xl border border-line/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                      <TrendingUp size={14} className="text-brand-600" />
                      Goal achievement history
                    </p>
                    <p className="mt-1 text-[11.5px] text-ink-faint">
                      Progress across your recent performance cycles
                    </p>
                  </div>
                  {latestTrend && (
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                      Latest {latestTrend.achievementPercentage}%
                    </span>
                  )}
                </div>

                {trend?.length ? (
                  <div className="mt-4 space-y-3">
                    {trend.slice(-3).map((item) => (
                      <div key={item.cycleId ?? item.cycleName}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-[12px]">
                          <span className="min-w-0 truncate text-ink-soft">
                            {item.cycleName}
                          </span>
                          <span className="shrink-0 font-semibold text-ink">
                            {item.achievementPercentage}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-ink/[0.08]">
                          <div
                            className="h-full rounded-full bg-brand-500 transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(0, Number(item.achievementPercentage) || 0),
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl bg-ink/[0.03] px-3 py-3 text-[12px] text-ink-faint">
                    Goal trends will appear after goals are added to a performance cycle.
                  </div>
                )}
              </div>

              {/* Review outcome */}
              {outcome ? (
                <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-white p-2 shadow-sm">
                      <Award size={17} className="text-brand-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-brand-700">
                        Review outcome
                      </p>
                      <p className="mt-1 text-[13px] font-medium text-ink">
                        {outcome.incrementRecommendation} increment
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <OutcomePill
                          label="Promotion"
                          value={outcome.promotionEligible ? "Eligible" : "Not eligible"}
                          active={outcome.promotionEligible}
                        />
                        <OutcomePill
                          label="Fast-track"
                          value={outcome.fastTrackEligible ? "Eligible" : "Not eligible"}
                          active={outcome.fastTrackEligible}
                        />
                        <OutcomePill
                          label="PIP"
                          value={outcome.pipRecommended ? "Recommended" : "Not recommended"}
                          active={outcome.pipRecommended}
                        />
                      </div>

                      {outcome.trainingNeeds.length ? (
                        <p className="mt-3 text-[11.5px] leading-5 text-ink-faint">
                          <span className="font-medium text-ink-soft">
                            Development focus:
                          </span>{" "}
                          {outcome.trainingNeeds.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl bg-ink/[0.03] px-4 py-3">
                  <Award size={17} className="text-ink-faint" />
                  <div>
                    <p className="text-[12px] font-medium text-ink-soft">
                      Review outcome
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-ink-faint">
                      Outcome details will appear after the review is completed.
                    </p>
                  </div>
                </div>
              )}

          {review?.status === "COMPLETED" ? (
            <div className="rounded-2xl bg-brand-50 p-4">
              <p className="flex items-center gap-1 text-[12px] font-medium text-brand-700">
                <Sparkles size={14} /> AI Performance Insights
              </p>

              {aiInsightsLoading ? (
                <p className="mt-2 text-[13px] text-ink-faint">
                  Generating performance insights...
                </p>
              ) : aiInsights ? (
                <div className="mt-3 space-y-3">
                  <p className="text-[13px] text-ink">
                    {aiInsights.summary}
                  </p>

                  {aiInsights.strengths.length ? (
                    <div>
                      <p className="text-[12px] font-medium text-ink-faint">
                        Strengths
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-ink-soft">
                        {aiInsights.strengths.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {aiInsights.developmentAreas.length ? (
                    <div>
                      <p className="text-[12px] font-medium text-ink-faint">
                        Development areas
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-ink-soft">
                        {aiInsights.developmentAreas.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {/* AI Development Plan */}
                  <div className="mt-5 border-t border-brand-100 pt-4">
                    <p className="flex items-center gap-1 text-[12px] font-medium text-brand-700">
                      <Sparkles size={14} /> AI Development Plan
                    </p>

                    {aiDevelopmentPlanLoading ? (
                      <p className="mt-2 text-[13px] text-ink-faint">
                        Generating development plan...
                      </p>
                    ) : aiDevelopmentPlan ? (
                      <div className="mt-3 space-y-4">
                        <div>
                          <p className="text-[12px] font-medium text-ink-faint">
                            Overall Focus
                          </p>
                          <p className="mt-1 text-[13px] text-ink">
                            {aiDevelopmentPlan.overallFocus}
                          </p>
                        </div>

                        <div>
                          <p className="text-[12px] font-medium text-ink-faint">
                            0–30 Days
                          </p>

                          <div className="mt-2 space-y-2">
                            {aiDevelopmentPlan.days30.map((item, index) => (
                              <div
                                key={index}
                                className="rounded-xl border border-brand-100 bg-white p-3"
                              >
                                <p className="text-[13px] font-medium text-ink">
                                  {item.action}
                                </p>
                                <p className="mt-1 text-[12px] text-ink-faint">
                                  Success measure: {item.successMeasure}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="text-[12px] font-medium text-ink-faint">
                            31–60 Days
                          </p>

                          <div className="mt-2 space-y-2">
                            {aiDevelopmentPlan.days60.map((item, index) => (
                              <div
                                key={index}
                                className="rounded-xl border border-brand-100 bg-white p-3"
                              >
                                <p className="text-[13px] font-medium text-ink">
                                  {item.action}
                                </p>
                                <p className="mt-1 text-[12px] text-ink-faint">
                                  Success measure: {item.successMeasure}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="text-[12px] font-medium text-ink-faint">
                            61–90 Days
                          </p>

                          <div className="mt-2 space-y-2">
                            {aiDevelopmentPlan.days90.map((item, index) => (
                              <div
                                key={index}
                                className="rounded-xl border border-brand-100 bg-white p-3"
                              >
                                <p className="text-[13px] font-medium text-ink">
                                  {item.action}
                                </p>
                                <p className="mt-1 text-[12px] text-ink-faint">
                                  Success measure: {item.successMeasure}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-[13px] text-ink-faint">
                        Development plan is not available yet.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-[12px] font-medium text-ink-faint">
                      Goal insight
                    </p>
                    <p className="mt-1 text-[13px] text-ink-soft">
                      {aiInsights.goalInsight}
                    </p>
                  </div>

                  <div>
                    <p className="text-[12px] font-medium text-ink-faint">
                      Suggested focus
                    </p>
                    <p className="mt-1 text-[13px] text-ink-soft">
                      {aiInsights.suggestedFocus}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-ink-faint">
                  AI performance insights are not available yet.
                </p>
              )}
            </div>
          ) : null}
        </div>
          );
        })()}
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          title="Goal cascade"
          subtitle="Company, department, and individual goals are connected through parent-child relationships."
        />
        {!goalCascade?.length ? (
          <p className="text-[13px] text-ink-faint">
            No goal cascade is configured for your current goals.
          </p>
        ) : (
          <div className="space-y-2">
            {goalCascade.map((goal: any) => (
              <GoalCascadeNode
                key={goal.id}
                goal={goal}
                onToggleMilestone={(id, milestoneIndex, completed) =>
                  milestoneMutation.mutate({ id, milestoneIndex, completed })
                }
                isUpdating={milestoneMutation.isPending}
              />
            ))}
          </div>
        )}
      </Card>
      <Card>
        <CardHeader
          title="Performance Scorecard"
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setChatOpen(true);
                  setChatAnswer("");
                }}
                disabled={!review || review.status !== "COMPLETED"}
                className="inline-flex items-center gap-2 rounded-xl border border-line/60 bg-white px-3 py-2 text-[12px] font-medium text-ink shadow-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MessageSquare className="h-4 w-4" />
                Ask AI
              </button>

              <Badge
                tone={
                  performanceStatus === "Excellent" ||
                    performanceStatus === "Strong"
                    ? "success"
                    : performanceStatus === "Developing"
                      ? "warning"
                      : "neutral"
                }
              >
                {performanceStatus}
              </Badge>
            </div>
          }
        />

        {scorecardLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : scorecard ? (
          <div className="space-y-5">

            {/* Overall Performance */}
            <div className="rounded-3xl border border-line/60 bg-gradient-to-br from-brand-50 via-white to-ink/[0.02] p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                <div>
                  <p className="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">
                    Overall Performance
                  </p>

                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-4xl font-semibold tracking-tight text-ink">
                      {scorecard.overallRating != null
                        ? scorecard.overallRating
                        : "—"}
                    </span>

                    <span className="text-sm text-ink-faint">
                      / 5
                    </span>
                  </div>

                  <p className="mt-2 max-w-md text-[12px] leading-5 text-ink-faint">
                    Based on the latest completed performance review.
                  </p>
                </div>

                <div className="rounded-2xl bg-white/80 px-5 py-4 text-center shadow-sm ring-1 ring-line/50">
                  <p className="text-2xl">
                    {performanceStatus === "Excellent"
                      ? "🏆"
                      : performanceStatus === "Strong"
                        ? "⭐"
                        : performanceStatus === "Developing"
                          ? "📈"
                          : "🎯"}
                  </p>

                  <p className="mt-1 text-[12px] font-medium text-ink">
                    {performanceStatus}
                  </p>

                  <p className="mt-0.5 text-[10.5px] text-ink-faint">
                    Performance status
                  </p>
                </div>

              </div>
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">


              {/* Overall Rating */}
              <div className="rounded-2xl border border-line/60 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11.5px] font-medium text-ink-faint">
                    Overall Rating
                  </p>
                  <span className="text-sm">⭐</span>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div
                    className="relative h-16 w-16 shrink-0 rounded-full"
                    style={{
                      background: `conic-gradient(currentColor ${scorecard.overallRating != null
                        ? (scorecard.overallRating / 5) * 100
                        : 0
                        }%, rgb(226 232 240) 0)`,
                    }}
                  >
                    <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white">
                      <span className="text-sm font-semibold text-ink">
                        {scorecard.overallRating != null
                          ? scorecard.overallRating.toFixed(1)
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-ink-faint">Out of 5</p>
                    <p className="mt-1 text-sm font-medium text-ink">
                      {scorecard.overallRating != null
                        ? `${Math.round((scorecard.overallRating / 5) * 100)}%`
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Manager Rating */}
              <div className="rounded-2xl border border-line/60 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11.5px] font-medium text-ink-faint">
                    Manager Rating
                  </p>
                  <span className="text-sm">👤</span>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div
                    className="relative h-16 w-16 shrink-0 rounded-full"
                    style={{
                      background: `conic-gradient(currentColor ${scorecard.managerRating != null
                        ? (scorecard.managerRating / 5) * 100
                        : 0
                        }%, rgb(226 232 240) 0)`,
                    }}
                  >
                    <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white">
                      <span className="text-sm font-semibold text-ink">
                        {scorecard.managerRating != null
                          ? scorecard.managerRating.toFixed(1)
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-ink-faint">Out of 5</p>
                    <p className="mt-1 text-sm font-medium text-ink">
                      {scorecard.managerRating != null
                        ? `${Math.round((scorecard.managerRating / 5) * 100)}%`
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
              {/* Goal Achievement */}
              <div className="rounded-2xl border border-line/60 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11.5px] font-medium text-ink-faint">
                    Goal Achievement
                  </p>
                  <span className="text-sm">🎯</span>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div
                    className="relative h-16 w-16 shrink-0 rounded-full"
                    style={{
                      background: `conic-gradient(currentColor ${scorecard.goalAchievement != null
                        ? Math.min(100, Math.max(0, scorecard.goalAchievement))
                        : 0
                        }%, rgb(226 232 240) 0)`,
                    }}
                  >
                    <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white">
                      <span className="text-sm font-semibold text-ink">
                        {scorecard.goalAchievement != null
                          ? `${Math.round(scorecard.goalAchievement)}%`
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-ink-faint">Goals</p>
                    <p className="mt-1 text-sm font-medium text-ink">
                      {scorecard.goalAchievement != null
                        ? scorecard.goalAchievement >= 80
                          ? "Excellent"
                          : scorecard.goalAchievement >= 60
                            ? "Good"
                            : "Needs Focus"
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* 360 Feedback */}
              <div className="rounded-2xl border border-line/60 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11.5px] font-medium text-ink-faint">
                    360° Feedback
                  </p>
                  <span className="text-sm">👥</span>
                </div>

                <p className="mt-3 text-2xl font-semibold text-ink">
                  {scorecard.feedbackRating != null
                    ? `${scorecard.feedbackRating}/5`
                    : "—"}
                </p>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{
                      width:
                        scorecard.feedbackRating != null
                          ? `${Math.min(
                            100,
                            Math.max(
                              0,
                              (scorecard.feedbackRating / 5) * 100,
                            ),
                          )}%`
                          : "0%",
                    }}
                  />
                </div>
              </div>

            </div>

            {/* Strengths & Development Areas */}
            <div className="grid gap-4 sm:grid-cols-2">

              {/* Strengths */}
              <div className="rounded-2xl border border-line/60 bg-ink/[0.015] p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-sm">
                    ✓
                  </span>

                  <div>
                    <p className="text-[12px] font-semibold text-ink">
                      Strengths
                    </p>
                    <p className="text-[10.5px] text-ink-faint">
                      Areas where you are performing well
                    </p>
                  </div>
                </div>

                {scorecard.strengths?.length ? (
                  <div className="mt-4 space-y-2">
                    {scorecard.strengths.map(
                      (item: string, index: number) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-[12.5px] text-ink shadow-sm ring-1 ring-line/40"
                        >
                          <span className="text-brand">✓</span>
                          <span>{item}</span>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="mt-4 text-[12px] text-ink-faint">
                    No strengths recorded yet.
                  </p>
                )}
              </div>

              {/* Development Areas */}
              <div className="rounded-2xl border border-line/60 bg-ink/[0.015] p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-sm">
                    ↑
                  </span>

                  <div>
                    <p className="text-[12px] font-semibold text-ink">
                      Development Areas
                    </p>
                    <p className="text-[10.5px] text-ink-faint">
                      Areas to focus on for improvement
                    </p>
                  </div>
                </div>

                {scorecard.developmentAreas?.length ? (
                  <div className="mt-4 space-y-2">
                    {scorecard.developmentAreas.map(
                      (item: string, index: number) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-[12.5px] text-ink shadow-sm ring-1 ring-line/40"
                        >
                          <span className="text-amber-600">→</span>
                          <span>{item}</span>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="mt-4 text-[12px] text-ink-faint">
                    No development areas recorded yet.
                  </p>
                )}
              </div>

            </div>
            {/* Performance Trend */}
            <div className="rounded-2xl border border-line/60 bg-white p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                Performance Trend
              </p>
              <p className="mt-1 text-[13px] text-ink-faint">
                Completed performance review ratings over time
              </p>
              {scorecard.performanceHistory?.length > 0 ? (
                <div className="mt-5 flex items-end gap-5 overflow-x-auto pb-2">
                  {scorecard.performanceHistory.map((item: any) => {
                    const percentage = Math.min(100, (item.rating / 5) * 100);

                    return (
                      <div
                        key={`${item.cycleId}-${item.reviewNumber}`}
                        className="flex min-w-[64px] flex-col items-center gap-2"
                      >
                        <span className="text-[12px] font-semibold text-ink">
                          {item.rating.toFixed(1)}
                        </span>

                        <div className="flex h-28 items-end">
                          <div
                            className="w-8 rounded-t-xl"
                            style={{
                              height: `${Math.max(12, percentage * 1.12)}px`,
                              backgroundColor: "#4f46e5",
                            }}
                          />
                        </div>

                        <span className="text-[10px] text-ink-faint">
                          Review {item.reviewNumber}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-[12px] text-ink-faint">
                  No completed review history available yet.
                </p>
              )}
            </div>
            {/* Review Summary */}
            <div className="flex flex-col gap-3 rounded-2xl border border-line/60 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">

              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                  Review Summary
                </p>

                <p className="mt-1 text-[13px] font-medium text-ink">
                  {scorecard.goalCount} goals tracked
                </p>

                <p className="mt-0.5 text-[11px] text-ink-faint">
                  Latest completed performance review
                </p>
              </div>

              <Badge tone="neutral">
                {scorecard.review?.status ?? "No review"}
              </Badge>

            </div>

          </div>

        ) : (
          <p className="text-[13px] text-ink-faint">
            Performance scorecard is not available yet.
          </p>
        )
        }
      </Card >
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
                          <button
                            key={`${milestone.title}-${index}`}
                            type="button"
                            onClick={() =>
                              milestoneMutation.mutate({
                                id: g.id,
                                milestoneIndex: index,
                                completed: !milestone.completed,
                              })
                            }
                            disabled={milestoneMutation.isPending}
                            className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[12px] text-ink-soft hover:bg-ink/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
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
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <p className="mt-3 text-[11.5px] text-ink-faint">
                    Due {formatDate(g.dueDate)}
                  </p>

                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedGoal(g);
                        setGoalCoachOpen(true);
                      }}
                    >
                      <Sparkles size={14} />
                      AI Goal Coach
                    </Button>
                  </div>

                  <GoalHealthCard goal={goal} />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AddGoalModal
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        cycleId={activeCycleId}
        parentGoals={goals ?? []}
      />
      {
        review && (
          <SelfReviewModal
            open={selfOpen}
            onClose={() => setSelfOpen(false)}
            reviewId={review.id}
          />
        )
      }
      {chatOpen && review?.status === "COMPLETED" && (
        <Modal
          open
          onClose={() => setChatOpen(false)}
          title="Performance AI Assistant"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => setChatOpen(false)}
              >
                Close
              </Button>

              <Button
                onClick={() => {
                  if (!chatQuestion.trim()) return;
                  chatMutation.mutate(chatQuestion.trim());
                }}
                isLoading={chatMutation.isPending}
              >
                Ask AI
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-2xl bg-brand-50 p-4">
              <p className="flex items-center gap-2 text-[13px] font-medium text-brand-700">
                <MessageSquare size={16} />
                Ask about your performance
              </p>

              <p className="mt-1 text-[12px] text-ink-faint">
                Ask questions about your ratings, goals, feedback,
                strengths, development areas, or performance trend.
              </p>
            </div>

            <TextareaField
              label="Your question"
              placeholder="Example: What are my main areas for improvement?"
              value={chatQuestion}
              onChange={(e) => setChatQuestion(e.target.value)}
            />

            {chatAnswer && (
              <div className="rounded-2xl border border-line/60 bg-white p-4">
                <p className="text-[12px] font-medium text-ink-faint">
                  AI Assistant
                </p>

                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-ink-soft">
                  {chatAnswer}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
      {goalCoachOpen && selectedGoal && (
        <Modal
          open
          onClose={() => setGoalCoachOpen(false)}
          title="AI Goal Coach"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => setGoalCoachOpen(false)}
              >
                Close
              </Button>

              <Button
                onClick={() => {
                  if (!selectedGoal?.id) return;

                  goalCoachMutation.mutate({
                    goalId: selectedGoal.id,
                    question:
                      goalCoachQuestion.trim() ||
                      "How can I improve this goal and what should I focus on next?",
                  });
                }}
                isLoading={goalCoachMutation.isPending}
              >
                Ask AI
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-2xl bg-brand-50 p-4">
              <p className="flex items-center gap-2 text-[13px] font-medium text-brand-700">
                <Sparkles size={16} />
                Get coaching for this goal
              </p>

              <p className="mt-1 text-[12px] text-ink-faint">
                Ask AI for practical suggestions based on your current goal,
                progress, deadline, and goal health.
              </p>
            </div>

            <div className="rounded-2xl border border-line/60 bg-white p-4">
              <p className="text-[13px] font-medium text-ink">
                {selectedGoal.title}
              </p>

              <p className="mt-2 text-[12px] text-ink-faint">
                Progress: {selectedGoal.progress ?? 0}%
              </p>
            </div>

            <TextareaField
              label="Your question"
              placeholder="Example: How can I improve this goal?"
              value={goalCoachQuestion}
              onChange={(e) => setGoalCoachQuestion(e.target.value)}
            />

            {goalCoachAnswer && (
              <div className="rounded-2xl border border-line/60 bg-white p-4">
                <p className="flex items-center gap-2 text-[12px] font-medium text-ink-faint">
                  <Sparkles size={14} />
                  AI Goal Coach
                </p>

                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-ink-soft">
                  {goalCoachAnswer}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div >
  );
}

function CalibrationPanel({ cycleId }: { cycleId?: string }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: reviews, isLoading } = useQuery({
    queryKey: ["performance", "calibration", cycleId],
    queryFn: () => PerformanceApi.calibration(cycleId),
    enabled: !!cycleId,
  });
  const mutation = useMutation({
    mutationFn: ({ id, rating, comments }: { id: string; rating: number; comments?: string }) =>
      PerformanceApi.calibrate(id, { calibratedRating: rating, comments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance", "calibration", cycleId] });
      showToast("Calibration saved.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  if (!cycleId) return <Card><EmptyState icon={ClipboardList} title="No active cycle" description="Activate a performance cycle before calibration." /></Card>;
  if (isLoading) return <Card><Skeleton className="h-64 rounded-2xl" /></Card>;
  return (
    <Card>
      <CardHeader title="Performance calibration" />
      <div className="space-y-3">
        {(reviews ?? []).map((review: any) => (
          <div key={review.id} className="flex flex-col gap-3 rounded-2xl border border-line/60 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">{review.revieweeFirstName} {review.revieweeLastName}</p>
              <p className="text-xs text-ink-faint">Manager rating: {review.managerRating ?? "—"} · Final: {review.finalRating ?? "—"}</p>
              {review.calibratedRating != null && <p className="text-xs font-medium text-brand-600">Calibrated: {review.calibratedRating}/5</p>}
            </div>
            <div className="flex items-center gap-2">
              <input aria-label="Calibrated rating" type="number" min={1} max={5} step={0.1} defaultValue={review.calibratedRating ?? review.finalRating ?? 3} id={`cal-${review.id}`} className="w-20 rounded-xl border border-line px-3 py-2 text-sm" />
              <Button size="sm" onClick={() => { const el = document.getElementById(`cal-${review.id}`) as HTMLInputElement | null; mutation.mutate({ id: review.id, rating: Number(el?.value ?? 3) }); }}>Save</Button>
            </div>
          </div>
        ))}
        {!reviews?.length && <EmptyState icon={CheckCircle2} title="No completed reviews" description="Completed reviews will appear here for calibration." />}
      </div>
    </Card>
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
        <SelectField label="Completed review" required {...form.register("reviewId")} onChange={(event) => {
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

        <SelectField label="Check-in frequency" required {...form.register("checkInFrequency")}>
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

function TeamReviews({
  activeCycleId,
  isHr,
}: {
  activeCycleId?: string;
  isHr: boolean;
}) {
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
  const [feedbackFor, setFeedbackFor] = useState<{ reviewId: string; revieweeId: string; revieweeName: string } | null>(null);
  const employeeId = user?.employee?.id;

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: [isHr ? "performance-employees" : "direct-reports", employeeId],
    queryFn: async () => {
      if (isHr) {
        const result = await EmployeesApi.list({
          status: "ACTIVE",
          page: 1,
          pageSize: 100,
        });
        return result.employees;
      }

      return await EmployeesApi.directReports(employeeId!);
    },
    enabled: isHr || !!employeeId,
  });



  const { data: reviews } = useQuery({
    queryKey: ["performance", "reviews", "team", activeCycleId],
    queryFn: () =>
      PerformanceApi.reviews({
        scope: "team",
        cycleId: activeCycleId,
      }),
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
                {review && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setFeedbackFor({
                        reviewId: review.id,
                        revieweeId: emp.id,
                        revieweeName: `${emp.firstName} ${emp.lastName}`,
                      })
                    }
                  >
                    360 feedback
                  </Button>
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
      {feedbackFor && activeCycleId && (
        <FeedbackAssignmentModal
          open
          cycleId={activeCycleId}
          reviewId={feedbackFor.reviewId}
          revieweeId={feedbackFor.revieweeId}
          revieweeName={feedbackFor.revieweeName}
          reviewers={reports.filter((employee) => employee.id !== feedbackFor.revieweeId)}
          onClose={() => setFeedbackFor(null)}
        />
      )}
    </Card>
  );
}

function FeedbackAssignmentModal({
  open,
  onClose,
  cycleId,
  reviewId,
  revieweeId,
  revieweeName,
  reviewers,
}: {
  open: boolean;
  onClose: () => void;
  cycleId: string;
  reviewId: string;
  revieweeId: string;
  revieweeName: string;
  reviewers: any[];
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [reviewerId, setReviewerId] = useState(reviewers[0]?.id ?? "");
  const [type, setType] = useState<"PEER" | "SUBORDINATE">("PEER");
  const mutation = useMutation({
    mutationFn: () =>
      PerformanceApi.createFeedbackRequest({
        cycleId,
        reviewId,
        reviewerEmployeeId: reviewerId,
        revieweeEmployeeId: revieweeId,
        type,
      }),
    onSuccess: () => {
      showToast("360 feedback request assigned.");
      queryClient.invalidateQueries({ queryKey: ["performance", "feedback-requests"] });
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assign 360 feedback — ${revieweeName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button isLoading={mutation.isPending} disabled={!reviewerId} onClick={() => mutation.mutate()}>Assign feedback</Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField label="Reviewer" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}>
          <option value="">Select reviewer</option>
          {reviewers.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.firstName} {employee.lastName}
            </option>
          ))}
        </SelectField>
        <SelectField label="Relationship" value={type} onChange={(event) => setType(event.target.value as "PEER" | "SUBORDINATE")}>
          <option value="PEER">Peer</option>
          <option value="SUBORDINATE">Subordinate</option>
        </SelectField>
      </div>
    </Modal>
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
  const { data: cycles, isLoading: cyclesLoading } = useQuery({
    queryKey: ["performance", "cycles"],
    queryFn: () => PerformanceApi.cycles(),
  });
  const { data: reviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ["performance", "feedback-requests"],
    queryFn: () => PerformanceApi.feedbackRequests(),
  });
  const [selected, setSelected] = useState<{
    id: string;
    name: string;
    designation: string;
  } | null>(null);
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);

  const activeCycle = cycles?.find((cycle) => cycle.isActive);
  const pendingReviews = (reviews ?? []).filter(
    (review) =>
      (!activeCycle || review.cycleId === activeCycle.id) &&
      !submittedIds.includes(review.id) &&
      review.status === "PENDING",
  );

  const handleSubmitted = (reviewId: string) => {
    setSubmittedIds((current) =>
      current.includes(reviewId) ? current : [...current, reviewId],
    );
    setSelected(null);
  };

  if (cyclesLoading || reviewsLoading) {
    return <Skeleton className="h-64 rounded-3xl" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="360-degree feedback"
          subtitle={
            activeCycle
              ? `Feedback requests for ${activeCycle.name}`
              : "Feedback requests from active performance reviews"
          }
        />
        <div className="rounded-2xl bg-ink/[0.03] p-4">
          <div className="flex items-start gap-3">
            <MessageSquare size={18} className="mt-0.5 text-brand-600" />
            <div>
              <p className="text-[13px] font-medium text-ink">
                Anonymous feedback
              </p>
              <p className="mt-1 text-[12px] leading-5 text-ink-soft">
                Rate collaboration, communication, and ownership. Your name is
                not displayed to the reviewee; feedback is presented as
                aggregated results.
              </p>
            </div>
          </div>
        </div>

        {!pendingReviews.length ? (
          <EmptyState
            icon={CheckCircle2}
            title="No pending 360 feedback"
            description={
              activeCycle
                ? "There are no outstanding feedback requests for the active cycle."
                : "Feedback requests will appear when reviews are initiated."
            }
          />
        ) : (
          <div className="mt-4 space-y-2">
            {pendingReviews.map((review) => (
              <div
                key={review.id}
                className="flex flex-col gap-3 rounded-2xl border border-line/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    firstName={review.revieweeFirstName ?? ""}
                    lastName={review.revieweeLastName ?? ""}
                    src={review.revieweeAvatar ?? undefined}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">
                      {review.revieweeFirstName} {review.revieweeLastName}
                    </p>
                    <p className="text-[12px] text-ink-faint">
                      {review.revieweeDesignation ?? "Employee"}
                      {review.revieweeDepartment
                        ? ` · ${review.revieweeDepartment}`
                        : ""}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSelected({
                      id: review.id,
                      name: `${review.revieweeFirstName ?? ""} ${review.revieweeLastName ?? ""}`.trim(),
                      designation: review.revieweeDesignation ?? "Employee",
                    })
                  }
                >
                  Give feedback
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selected && (
        <FeedbackModal
          requestId={selected.id}
          employeeName={selected.name}
          employeeDesignation={selected.designation}
          onClose={() => setSelected(null)}
          onSubmitted={() => handleSubmitted(selected.id)}
        />
      )}
    </div>
  );
}


function FeedbackModal({
  requestId,
  employeeName,
  employeeDesignation,
  onClose,
  onSubmitted,
}: {
  requestId: string;
  employeeName: string;
  employeeDesignation?: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState<"PEER" | "SUBORDINATE" | "CROSS_FUNCTIONAL">("PEER");
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
      PerformanceApi.submitFeedbackRequest(requestId, {
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
      onSubmitted();
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
            onClick={handleSubmit((value) =>
              mutation.mutate({
                comments: value.comments?.trim() || "",
              }),
            )}
          >
            Submit feedback
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-brand-50 p-4">
          <p className="text-[12px] font-medium text-brand-700">
            {employeeDesignation || "360-degree review"}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-ink-soft">
            Provide objective feedback based on your working experience with
            this employee. Your response is stored anonymously and contributes
            to the aggregate review results.
          </p>
        </div>

        <SelectField
          label="Feedback relationship"
          value={type}
          onChange={(event) =>
            setType(event.target.value as "PEER" | "SUBORDINATE" | "CROSS_FUNCTIONAL")
          }
        >
          <option value="PEER">Peer</option>
          <option value="SUBORDINATE">Subordinate</option>
          <option value="CROSS_FUNCTIONAL">Cross-functional</option>
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

function InsightMetric({
  icon: Icon,
  label,
  value,
  helper,
  progress,
  rating,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  helper: string;
  progress?: number;
  rating?: number | null;
}) {
  return (
    <div className="rounded-2xl border border-line/60 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-faint">
          <Icon size={14} className="text-brand-600" />
          {label}
        </span>
      </div>

      <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">
        {value}
      </p>

      <p className="mt-1 text-[11.5px] text-ink-faint">{helper}</p>

      {progress != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{
              width: `${Math.min(100, Math.max(0, Number(progress) || 0))}%`,
            }}
          />
        </div>
      )}

      {rating != null && (
        <div className="mt-3 flex items-center gap-0.5" aria-label={`Rating ${rating} out of 5`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              size={13}
              className={
                star <= Math.round(rating)
                  ? "fill-gold-500 text-gold-500"
                  : "text-line"
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OutcomePill({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <span
      className={cx(
        "rounded-full border px-2.5 py-1 text-[10.5px] font-medium",
        active
          ? "border-brand-200 bg-white text-brand-700"
          : "border-line/60 bg-white/60 text-ink-faint",
      )}
    >
      {label}: {value}
    </span>
  );
}

function GoalCascadeNode({
  goal,
  onToggleMilestone,
  isUpdating,
  depth = 0,
}: {
  goal: any;
  onToggleMilestone: (id: string, milestoneIndex: number, completed: boolean) => void;
  isUpdating: boolean;
  depth?: number;
}) {
  return (
    <div className={cx("rounded-2xl border border-line/60 p-3", depth > 0 && "ml-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">{goal.title}</p>
          {goal.category && (
            <p className="mt-0.5 text-[11.5px] text-ink-faint">KPI: {goal.category}</p>
          )}
        </div>
        <Badge
          tone={
            goal.status === "AT_RISK"
              ? "warning"
              : goal.status === "COMPLETED"
                ? "success"
                : "neutral"
          }
        >
          {goal.progress}% · {goal.status.replace("_", " ")}
        </Badge>
      </div>

      {goal.milestones?.length ? (
        <div className="mt-2 space-y-1">
          {goal.milestones.map((milestone: any, index: number) => (
            <button
              key={`${goal.id}-cascade-milestone-${index}`}
              type="button"
              onClick={() => onToggleMilestone(goal.id, index, !milestone.completed)}
              disabled={isUpdating}
              className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[12px] text-ink-soft hover:bg-ink/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2
                size={14}
                className={milestone.completed ? "text-brand-600" : "text-line"}
              />
              <span className={milestone.completed ? "line-through opacity-70" : ""}>
                {milestone.title}
              </span>
              {milestone.targetDate && (
                <span className="text-ink-faint">· {formatDate(milestone.targetDate)}</span>
              )}
            </button>
          ))}
        </div>
      ) : null}

      {goal.children?.length ? (
        <div className="mt-2 space-y-2">
          {goal.children.map((child: any) => (
            <GoalCascadeNode
              key={child.id}
              goal={child}
              onToggleMilestone={onToggleMilestone}
              isUpdating={isUpdating}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AddGoalModal({
  open,
  onClose,
  employeeId,
  employeeName,
  cycleId,
  parentGoals = [],
}: {
  open: boolean;
  onClose: () => void;
  employeeId?: string;
  employeeName?: string;
  cycleId?: string;
  parentGoals?: any[];
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
      parentGoalId: "",
      milestones: "",
    },
  });

  const { data: assignedEmployeeCascade } = useQuery({
    queryKey: ["performance", "goal-cascade", employeeId],
    queryFn: () => PerformanceApi.goalCascade(employeeId),
    enabled: !!employeeId,
  });

  const flattenGoals = (items: any[], result: any[] = []) => {
    for (const item of items) {
      result.push(item);
      if (item.children?.length) flattenGoals(item.children, result);
    }
    return result;
  };

  const availableParentGoals = employeeId
    ? flattenGoals(assignedEmployeeCascade ?? [])
    : parentGoals;

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
        parentGoalId: value.parentGoalId?.trim() || null,
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
        {availableParentGoals.length ? (
          <SelectField label="Parent goal (optional)" {...register("parentGoalId")}>
            <option value="">No parent goal</option>
            {availableParentGoals.map((parent: any) => (
              <option key={parent.id} value={parent.id}>
                {parent.title}
              </option>
            ))}
          </SelectField>
        ) : null}

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
function GoalHealthCard({ goal }: { goal: any }) {
  const { data, isLoading } = useQuery({
    queryKey: ["performance", "goal-health", goal.id],
    queryFn: () => PerformanceApi.aiGoalHealth(goal.id),
    enabled: !!goal.id,
  });

  const health = data?.health;

  if (isLoading) {
    return (
      <div className="mt-3 rounded-xl bg-ink/[0.03] p-3">
        <p className="text-[11.5px] text-ink-faint">
          Checking goal health...
        </p>
      </div>
    );
  }

  if (!health) {
    return null;
  }

  const healthLabel =
    health.health === "ON_TRACK"
      ? "On track"
      : health.health === "NEEDS_ATTENTION"
        ? "Needs attention"
        : "At risk";

  const healthTone =
    health.health === "ON_TRACK"
      ? "success"
      : health.health === "NEEDS_ATTENTION"
        ? "warning"
        : "danger";

  return (
    <div className="mt-3 rounded-xl border border-line/60 bg-ink/[0.02] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11.5px] font-medium text-ink-faint">
            Goal Health
          </p>

          <p className="mt-1 text-[13px] font-medium text-ink">
            {healthLabel}
          </p>
        </div>

        <Badge tone={healthTone}>
          {health.health.replace("_", " ")}
        </Badge>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[11.5px] text-ink-faint">
        <span>
          Expected:{" "}
          {health.expectedProgress !== null
            ? `${health.expectedProgress}%`
            : "—"}
        </span>

        <span>
          Gap:{" "}
          {health.gap !== null
            ? `${health.gap > 0 ? "+" : ""}${health.gap}%`
            : "—"}
        </span>

        <span>
          Days left:{" "}
          {health.daysRemaining !== null
            ? health.daysRemaining
            : "—"}
        </span>

        <span>
          Milestones:{" "}
          {health.milestones.total > 0
            ? `${health.milestones.completed}/${health.milestones.total}`
            : "—"}
        </span>
      </div>
    </div>
  );
}
