import {
  PerformanceCycle,
  PerformanceReview,
  Goal,
  PerformanceFeedback,
  PerformanceFeedbackRequest,
  PerformanceOutcome,
  PerformanceImprovementPlan,
  Employee,
  Designation,
  Department,
} from "@/db/models";
import { nowIso } from "@/db/connection";
import {
  generatePerformanceInsights,
  generateDevelopmentPlan,
  generatePerformanceChat,
  generateGoalCoach,
} from "./performance.ai";
import { notify } from "@/modules/notifications/notifications.repository";

function toApiDoc(doc: any) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export async function listCycles() {
  const rows = await PerformanceCycle.find({}).sort({ startDate: -1 }).lean();
  return rows.map(toApiDoc);
}

export async function createCycle(input: {
  name: string;
  startDate: string;
  endDate: string;
  type?: string;
  purpose?: string;
  ratingScale?: number[];
  ratingWeights?: { self: number; manager: number };
  competencies?: { name: string; weight: number }[];
  selfReviewDueDate?: string;
  managerReviewDueDate?: string;
  finalReviewDueDate?: string;
}) {
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Review cycle dates must be valid dates.");
  }
  if (start >= end) {
    throw new Error("Review cycle end date must be after the start date.");
  }

  const existing = await PerformanceCycle.findOne({ name: input.name.trim() }).lean();
  if (existing) {
    throw new Error("A review cycle with this name already exists.");
  }

  // Only one performance cycle may be active at a time.
  await PerformanceCycle.updateMany(
    { isActive: true },
    { $set: { isActive: false } },
  );

  const doc = await PerformanceCycle.create({
    ...input,
    name: input.name.trim(),
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    isActive: true,
    ratingScale: input.ratingScale?.length ? input.ratingScale : [1, 2, 3, 4, 5],
    ratingWeights: input.ratingWeights ?? { self: 40, manager: 60 },
    competencies: input.competencies ?? [],
    selfReviewDueDate: input.selfReviewDueDate ?? null,
    managerReviewDueDate: input.managerReviewDueDate ?? null,
    finalReviewDueDate: input.finalReviewDueDate ?? null,
  });

  return toApiDoc((await PerformanceCycle.findById(doc._id).lean())!);
}

export async function activateCycle(id: string) {
  const cycle = await PerformanceCycle.findById(id).lean();
  if (!cycle) return undefined;

  const start = new Date(cycle.startDate);
  const end = new Date(cycle.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new Error("Performance cycle has invalid dates.");
  }

  await PerformanceCycle.updateMany(
    { _id: { $ne: id }, isActive: true },
    { $set: { isActive: false } },
  );
  await PerformanceCycle.updateOne({ _id: id }, { $set: { isActive: true } });

  return toApiDoc(await PerformanceCycle.findById(id).lean());
}

export async function deactivateCycle(id: string) {
  const updated = await PerformanceCycle.findByIdAndUpdate(
    id,
    { $set: { isActive: false } },
    { new: true },
  ).lean();

  return toApiDoc(updated);
}

export async function updateCycle(
  id: string,
  input: {
    name?: string;
    startDate?: string;
    endDate?: string;
    type?: string;
    purpose?: string | null;
  },
) {
  const current = await PerformanceCycle.findById(id).lean();
  if (!current) return undefined;

  const nextStart = input.startDate ?? current.startDate;
  const nextEnd = input.endDate ?? current.endDate;
  const start = new Date(nextStart);
  const end = new Date(nextEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Review cycle dates must be valid dates.");
  }
  if (start >= end) {
    throw new Error("Review cycle end date must be after the start date.");
  }

  const nextName = input.name?.trim() || current.name;
  const duplicate = await PerformanceCycle.findOne({
    name: nextName,
    _id: { $ne: id },
  }).lean();

  if (duplicate) {
    throw new Error("A review cycle with this name already exists.");
  }

  await PerformanceCycle.updateOne(
    { _id: id },
    {
      $set: {
        name: nextName,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
      },
    },
  );

  return toApiDoc((await PerformanceCycle.findById(id).lean())!);
}

export async function setCycleActive(id: string, isActive: boolean) {
  const current = await PerformanceCycle.findById(id).lean();
  if (!current) return undefined;

  if (isActive) {
    await PerformanceCycle.updateMany(
      { _id: { $ne: id }, isActive: true },
      { $set: { isActive: false } },
    );
  }

  await PerformanceCycle.updateOne(
    { _id: id },
    { $set: { isActive } },
  );

  return toApiDoc((await PerformanceCycle.findById(id).lean())!);
}

function isValidCycleRange(cycle: any) {
  if (!cycle) return false;

  const start = new Date(cycle.startDate);
  const end = new Date(cycle.endDate);

  return (
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    start < end
  );
}

export async function getActiveCycle() {
  // Only return a usable active cycle. Older/seeded data may contain an
  // invalid range (endDate before startDate), which otherwise makes every
  // Performance screen appear empty or inconsistent.
  const rows = await PerformanceCycle.find({ isActive: true })
    .sort({ startDate: -1 })
    .lean();

  const valid = rows.find(isValidCycleRange);

  // Keep the database state clean as well as the API response. Invalid active
  // cycles should never remain active and accidentally be selected later.
  const invalidIds = rows
    .filter((cycle: any) => !isValidCycleRange(cycle))
    .map((cycle: any) => cycle._id);

  if (invalidIds.length) {
    await PerformanceCycle.updateMany(
      { _id: { $in: invalidIds } },
      { $set: { isActive: false } },
    );
  }

  return toApiDoc(valid);
}

async function enrichReviews(rows: any[]) {
  if (rows.length === 0) return [];

  const revieweeIds = [...new Set(rows.map((r) => r.revieweeId))];
  const reviewerIds = [...new Set(rows.map((r) => r.reviewerId))];
  const cycleIds = [...new Set(rows.map((r) => r.cycleId))];

  const [reviewees, reviewers, cycles] = await Promise.all([
    Employee.find({ _id: { $in: revieweeIds } }).lean(),
    Employee.find({ _id: { $in: reviewerIds } }).lean(),
    PerformanceCycle.find({ _id: { $in: cycleIds } }).lean(),
  ]);

  const designationIds = [...new Set(reviewees.map((e) => e.designationId))];
  const departmentIds = [...new Set(reviewees.map((e) => e.departmentId))];
  const [designations, departments] = await Promise.all([
    Designation.find({ _id: { $in: designationIds } }).lean(),
    Department.find({ _id: { $in: departmentIds } }).lean(),
  ]);

  const revieweeMap = new Map(reviewees.map((e) => [e._id, e]));
  const reviewerMap = new Map(reviewers.map((e) => [e._id, e]));
  const cycleMap = new Map(cycles.map((c) => [c._id, c]));
  const desMap = new Map(designations.map((d) => [d._id, d]));
  const deptMap = new Map(departments.map((d) => [d._id, d]));

  return rows.map((r) => {
    const reviewee = revieweeMap.get(r.revieweeId);
    const reviewer = reviewerMap.get(r.reviewerId);
    const cycle = cycleMap.get(r.cycleId);
    return {
      id: r._id,
      ...r,
      revieweeFirstName: reviewee?.firstName ?? null,
      revieweeLastName: reviewee?.lastName ?? null,
      revieweeAvatar: reviewee?.avatarUrl ?? null,
      revieweeDesignation: reviewee
        ? (desMap.get(reviewee.designationId)?.title ?? null)
        : null,
      revieweeDepartment: reviewee
        ? (deptMap.get(reviewee.departmentId)?.name ?? null)
        : null,
      reviewerFirstName: reviewer?.firstName ?? null,
      reviewerLastName: reviewer?.lastName ?? null,
      cycleName: cycle?.name ?? null,
    };
  });
}

export async function listReviews(filters: {
  cycleId?: string;
  revieweeId?: string;
  reviewerId?: string;
}) {
  const query: Record<string, any> = {};
  if (filters.cycleId) query.cycleId = filters.cycleId;
  if (filters.revieweeId) query.revieweeId = filters.revieweeId;
  if (filters.reviewerId) query.reviewerId = filters.reviewerId;

  const rows = await PerformanceReview.find(query)
    .sort({ submittedAt: -1 })
    .lean();
  return enrichReviews(rows);
}

export async function getReview(id: string) {
  const row = await PerformanceReview.findById(id).lean();
  if (!row) return undefined;
  const [enriched] = await enrichReviews([row]);
  return enriched;
}
export async function getPerformanceScorecard(employeeId: string) {
  // Get the latest completed review for the employee
  const review = await PerformanceReview.findOne({
    revieweeId: employeeId,
    status: "COMPLETED",
  })
    .sort({ submittedAt: -1 })
    .lean();

  // Get completed reviews for performance history
  const completedReviews = await PerformanceReview.find({
    revieweeId: employeeId,
    status: "COMPLETED",
  })
    .sort({ submittedAt: 1 })
    .lean();

  const performanceHistory = completedReviews
    .filter(
      (item: any) =>
        typeof item.finalRating === "number" &&
        item.submittedAt,
    )
    .map((item: any, index: number) => ({
      reviewNumber: index + 1,
      cycleId: item.cycleId,
      rating: item.finalRating,
      submittedAt: item.submittedAt,
    }));

  // Get all goals for the employee
  const goals = await Goal.find({
    employeeId,
  }).lean();

  // Calculate average goal achievement
  const goalProgressValues = goals
    .map((goal: any) => {
      if (
        typeof goal.targetValue === "number" &&
        goal.targetValue > 0 &&
        typeof goal.currentValue === "number"
      ) {
        return Math.min(
          100,
          Math.max(
            0,
            (goal.currentValue / goal.targetValue) * 100,
          ),
        );
      }

      return typeof goal.progress === "number"
        ? Math.min(100, Math.max(0, goal.progress))
        : null;
    })
    .filter(
      (value): value is number =>
        typeof value === "number",
    );

  const goalAchievement = goalProgressValues.length
    ? Math.round(
      goalProgressValues.reduce(
        (sum, value) => sum + value,
        0,
      ) / goalProgressValues.length,
    )
    : null;

  // Get 360 feedback summary when a completed review exists
  let feedbackSummary = null;

  if (review) {
    feedbackSummary = await getFeedbackSummary(
      String(review._id),
    );
  }

  const feedbackRatings =
    feedbackSummary?.competencies
      ?.map((item: any) => Number(item.averageRating))
      .filter((value: number) => Number.isFinite(value)) ?? [];

  const feedbackRating = feedbackRatings.length
    ? Math.round(
      (feedbackRatings.reduce(
        (sum, value) => sum + value,
        0,
      ) /
        feedbackRatings.length) *
      10,
    ) / 10
    : null;

  return {
    overallRating: review?.finalRating ?? null,

    performanceHistory,

    managerRating: review?.managerRating ?? null,

    goalAchievement,

    feedbackRating,

    strengths: review?.strengths
      ? review.strengths
        .split(/[,\n]+/)
        .map((item: string) => item.trim())
        .filter(Boolean)
      : [],

    developmentAreas: review?.improvements
      ? review.improvements
        .split(/[,\n]+/)
        .map((item: string) => item.trim())
        .filter(Boolean)
      : [],

    review: review
      ? {
        id: review._id,
        status: review.status,
        cycleId: review.cycleId,
        submittedAt: review.submittedAt,
      }
      : null,

    goalCount: goals.length,
  };
}

export async function ensureReview(
  cycleId: string,
  revieweeId: string,
  reviewerId: string,
) {
  if (revieweeId === reviewerId) {
    throw new Error("An employee cannot be their own reviewer.");
  }

  const [cycle, reviewee, reviewer] = await Promise.all([
    PerformanceCycle.findById(cycleId).lean(),
    Employee.findById(revieweeId).lean(),
    Employee.findById(reviewerId).lean(),
  ]);

  if (!cycle) {
    throw new Error("The selected performance cycle does not exist.");
  }

  if (!isValidCycleRange(cycle)) {
    throw new Error("The selected performance cycle has an invalid date range.");
  }

  if (!reviewee) {
    throw new Error("The employee being reviewed does not exist.");
  }

  if (!reviewer) {
    throw new Error("The selected reviewer does not exist.");
  }

  let row = await PerformanceReview.findOne({
    cycleId,
    revieweeId,
    reviewerId,
  }).lean();

  if (!row) {
    const doc = await PerformanceReview.create({
      cycleId,
      revieweeId,
      reviewerId,
      status: "NOT_STARTED",
    });

    row = await PerformanceReview.findById(doc._id).lean();

    const [reviewee, reviewer] = await Promise.all([
      Employee.findById(revieweeId)
        .select("userId firstName lastName")
        .lean(),
      Employee.findById(reviewerId)
        .select("userId")
        .lean(),
    ]);

    if (reviewee?.userId) {
      await notify({
        userId: reviewee.userId,
        type: "PERFORMANCE",
        title: "Performance review available",
        message: "A new performance review has been assigned to you.",
        link: "/performance",
        dedupeKey: `performance-review-assigned:${doc._id}:${reviewee.userId}`,
      });
    }

    if (reviewer?.userId) {
      await notify({
        userId: reviewer.userId,
        type: "PERFORMANCE",
        title: "Performance review assigned",
        message: `You have a performance review to complete for ${reviewee?.firstName ?? "an employee"
          } ${reviewee?.lastName ?? ""}.`,
        link: "/performance",
        dedupeKey: `performance-review-manager:${doc._id}:${reviewer.userId}`,
      });
    }
  }

  return getReview((row as any)._id);
}

export async function submitSelfReview(
  id: string,
  selfRating: number,
  strengths: string,
  improvements: string,
) {
  const review = await PerformanceReview.findById(id).lean();

  if (!review) {
    return undefined;
  }

  if (!["NOT_STARTED", "SELF_REVIEW"].includes(review.status)) {
    throw new Error(
      "This review is no longer available for employee self-review.",
    );
  }

  await PerformanceReview.updateOne(
    { _id: id },
    {
      $set: {
        selfRating,
        strengths,
        improvements,
        status: "MANAGER_REVIEW",
      },
    },
  );

  const reviewer = await Employee.findById(review.reviewerId)
    .select("userId")
    .lean();

  if (reviewer?.userId) {
    await notify({
      userId: reviewer.userId,
      type: "PERFORMANCE",
      title: "Manager review required",
      message:
        "The employee self-review has been submitted and your manager review is now required.",
      link: "/performance",
      dedupeKey: `performance-manager-review-required:${id}:${reviewer.userId}`,
    });
  }

  return getReview(id);
}

export async function submitManagerReview(
  id: string,
  managerRating: number,
  managerComments: string,
  managerTechnicalRating: number,
  managerDeliveryRating: number,
  managerBehaviorRating: number,
) {
  const review = (await getReview(id)) as any;

  if (!review) {
    return undefined;
  }

  if (review.status !== "MANAGER_REVIEW") {
    throw new Error(
      "The employee must submit their self-review before the manager can submit the manager review.",
    );
  }

  const cycle = await PerformanceCycle.findById(review.cycleId).lean();
  const selfWeight = Number(cycle?.ratingWeights?.self ?? 40);
  const managerWeight = Number(cycle?.ratingWeights?.manager ?? 60);
  const weightTotal = selfWeight + managerWeight || 100;
  const finalRating = review.selfRating
    ? Math.round(((review.selfRating * selfWeight + managerRating * managerWeight) / weightTotal) * 10) / 10
    : managerRating;

  await PerformanceReview.updateOne(
    { _id: id },
    {
      $set: {
        managerRating,
        managerComments,
        managerTechnicalRating,
        managerDeliveryRating,
        managerBehaviorRating,
        finalRating,
        status: "COMPLETED",
        submittedAt: nowIso(),
      },
    },
  );

  const rating = Math.round(finalRating);

  const revieweeEmployee = await Employee.findById(review.revieweeId)
    .select("userId firstName lastName")
    .lean();

  if (revieweeEmployee?.userId) {
    await notify({
      userId: revieweeEmployee.userId,
      type: "PERFORMANCE",
      title: "Performance review completed",
      message: `Your performance review has been completed with a final rating of ${finalRating}.`,
      link: "/performance",
      dedupeKey: `performance-review-completed:${id}:${revieweeEmployee.userId}`,
    });
  }


  // Feed KPI/goal achievement into the automatic outcome decision.
  // The review rating remains the primary performance signal, while KPI
  // achievement is used as an objective goal-attainment check.
  const cycleGoals = await Goal.find({
    employeeId: review.revieweeId,
    cycleId: review.cycleId,
  }).lean();

  const goalProgressValues = cycleGoals
    .map((goal: any) =>
      calculateGoalProgress(goal.targetValue, goal.currentValue) ??
      (typeof goal.progress === "number" ? goal.progress : null),
    )
    .filter((value): value is number => typeof value === "number");

  const kpiAchievementPercentage = goalProgressValues.length
    ? Math.round(
      goalProgressValues.reduce((sum, value) => sum + value, 0) /
      goalProgressValues.length,
    )
    : null;

  const kpiSupportsPromotion =
    kpiAchievementPercentage === null || kpiAchievementPercentage >= 80;
  const kpiSupportsFastTrack =
    kpiAchievementPercentage === null || kpiAchievementPercentage >= 100;
  const kpiNeedsImprovement =
    kpiAchievementPercentage !== null && kpiAchievementPercentage < 50;

  const pipRecommended = rating <= 2 || kpiNeedsImprovement;
  const fastTrackEligible =
    rating >= 5 && kpiSupportsFastTrack && !pipRecommended;
  const promotionEligible =
    rating >= 4 && kpiSupportsPromotion && !pipRecommended;

  const incrementRecommendation = fastTrackEligible
    ? "MAXIMUM"
    : pipRecommended
      ? "PIP"
      : rating >= 3
        ? "STANDARD"
        : "NONE";

  const trainingNeeds =
    (rating <= 3 || kpiNeedsImprovement) && review.improvements
      ? [review.improvements]
      : [];


  await PerformanceOutcome.findOneAndUpdate(
    { reviewId: id },
    {
      $set: {
        reviewId: id,

        incrementRecommendation,
        promotionEligible,
        fastTrackEligible,
        pipRecommended,
        trainingNeeds,

        createdAt: nowIso(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );


  if (pipRecommended) {

    const start = new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + 3);

    await PerformanceImprovementPlan.findOneAndUpdate(
      { reviewId: id },
      {
        $set: {
          reviewId: id,
          employeeId: review.revieweeId,
          status: "ACTIVE",
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          objectives: review.improvements
            ? [review.improvements]
            : ["Meet agreed performance expectations."],
          checkInFrequency: "MONTHLY",
          createdAt: nowIso(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  if (revieweeEmployee?.userId) {
    await notify({
      userId: revieweeEmployee.userId,
      type: "PERFORMANCE",
      title: "Performance improvement plan initiated",
      message:
        "Your completed performance review resulted in a Performance Improvement Plan.",
      link: "/performance",
      dedupeKey: `performance-pip-initiated:${id}:${revieweeEmployee.userId}`,
    });
  }

  return getReview(id);
}

function calculateMilestoneProgress(milestones?: any[] | null) {
  if (!Array.isArray(milestones) || milestones.length === 0) return null;

  const completed = milestones.filter((milestone) => milestone?.completed === true).length;
  return Math.round((completed / milestones.length) * 100);
}

function calculateCombinedGoalProgress(
  targetValue?: number | null,
  currentValue?: number | null,
  milestones?: any[] | null,
) {
  const kpiProgress = calculateGoalProgress(targetValue, currentValue);
  const milestoneProgress = calculateMilestoneProgress(milestones);

  // KPI target/current-value is the primary achievement signal when present.
  // Milestones become the automatic achievement source for goals without KPI values.
  return kpiProgress ?? milestoneProgress;
}

function calculateGoalProgress(
  targetValue?: number | null,
  currentValue?: number | null,
) {
  if (
    typeof targetValue !== "number" ||
    targetValue <= 0 ||
    typeof currentValue !== "number"
  ) {
    return null;
  }

  return Math.min(
    100,
    Math.max(0, Math.round((currentValue / targetValue) * 100)),
  );
}

function calculateGoalStatus(progress: number) {
  return progress >= 100
    ? "COMPLETED"
    : progress > 0
      ? "IN_PROGRESS"
      : "NOT_STARTED";
}

function normalizeGoal(row: any) {
  const goal = toApiDoc(row) as any;
  if (!goal) return goal;

  const calculatedProgress = calculateCombinedGoalProgress(
    goal.targetValue,
    goal.currentValue,
    goal.milestones,
  );

  // KPI goals use Current Value as the source of truth. Goals without KPI
  // values use milestone completion as their automatic achievement source.
  // Legacy goals without either structure retain their stored progress.
  const progress =
    calculatedProgress === null
      ? Math.min(100, Math.max(0, Number(goal.progress ?? 0)))
      : calculatedProgress;

  return {
    ...goal,
    progress,
    status: calculateGoalStatus(progress),
  };
}

export async function listGoals(employeeId: string, cycleId?: string | null) {
  const query: Record<string, any> = { employeeId };

  // When a cycle is supplied, return only goals assigned to that cycle.
  // Without a cycle, preserve the existing behaviour and return all goals.
  if (cycleId) {
    query.cycleId = cycleId;
  }

  const rows = await Goal.find(query).sort({ dueDate: 1, createdAt: 1 }).lean();
  return rows.map(normalizeGoal);
}

export async function createGoal(input: {
  employeeId: string;
  title: string;
  description?: string;
  dueDate: string;
  cycleId?: string | null;
  parentGoalId?: string | null;
  category?: string | null;
  targetValue?: number | null;
  currentValue?: number | null;
  milestones?: {
    title: string;
    targetDate?: string | null;
    completed?: boolean;
  }[];
  assignedBy?: string | null;
}) {
  if (!input.title.trim()) {
    throw new Error("Goal title is required.");
  }

  if (input.parentGoalId) {
    const parent = await Goal.findById(input.parentGoalId).lean();
    if (!parent) {
      throw new Error("The selected parent goal does not exist.");
    }

    if (input.cycleId && parent.cycleId && parent.cycleId !== input.cycleId) {
      throw new Error("Parent and child goals must belong to the same review cycle.");
    }
  }

  const targetValue = input.targetValue ?? null;
  const currentValue = input.currentValue ?? null;

  // Normalize milestones while preserving KPI-based progress.
  const milestones = (input.milestones ?? []).map((milestone) => ({
    title: milestone.title.trim(),
    targetDate: milestone.targetDate ?? null,
    completed: milestone.completed ?? false,
  }));

  // KPI achievement takes priority when target/current values exist. Otherwise
  // milestone completion automatically determines the goal achievement.
  const progress =
    calculateCombinedGoalProgress(
      targetValue,
      currentValue,
      milestones,
    ) ?? 0;


  const status =
    progress >= 100
      ? "COMPLETED"
      : progress > 0
        ? "IN_PROGRESS"
        : "NOT_STARTED";

  const doc = await Goal.create({
    employeeId: input.employeeId,
    title: input.title,
    description: input.description ?? null,
    dueDate: input.dueDate,
    status,
    progress,
    createdAt: nowIso(),
    cycleId: input.cycleId ?? null,
    parentGoalId: input.parentGoalId ?? null,
    category: input.category ?? null,
    targetValue,
    currentValue,
    milestones,
    assignedBy: input.assignedBy ?? null,
  });

  return normalizeGoal(await Goal.findById(doc._id).lean());
}


export async function updateGoalMilestone(
  id: string,
  milestoneIndex: number,
  completed: boolean,
) {
  const goal = await Goal.findById(id).lean();
  if (!goal) return undefined;

  const milestones = Array.isArray((goal as any).milestones)
    ? [...(goal as any).milestones]
    : [];

  if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0 || milestoneIndex >= milestones.length) {
    throw new Error("Invalid milestone selected.");
  }

  milestones[milestoneIndex] = {
    ...milestones[milestoneIndex],
    completed: Boolean(completed),
  };

  // KPI progress remains authoritative when a KPI target/current pair exists.
  // Otherwise milestone completion automatically updates goal progress/status.
  const progress = calculateCombinedGoalProgress(
    (goal as any).targetValue,
    (goal as any).currentValue,
    milestones,
  ) ?? 0;

  await Goal.updateOne(
    { _id: id },
    {
      $set: {
        milestones,
        progress,
        status: calculateGoalStatus(progress),
      },
    },
  );

  return normalizeGoal(await Goal.findById(id).lean());
}

export async function listGoalCascade(employeeId: string, cycleId?: string) {
  const query: Record<string, any> = { employeeId };
  if (cycleId) query.cycleId = cycleId;

  const rows = await Goal.find(query).sort({ dueDate: 1, createdAt: 1 }).lean();
  const goals = rows.map(normalizeGoal) as any[];
  const byParent = new Map<string | null, any[]>();

  for (const goal of goals) {
    const parentId = goal.parentGoalId ?? null;
    const list = byParent.get(parentId) ?? [];
    list.push(goal);
    byParent.set(parentId, list);
  }

  const build = (parentId: string | null): any[] =>
    (byParent.get(parentId) ?? []).map((goal) => ({
      ...goal,
      children: build(goal.id),
    }));

  return build(null);
}

export async function updateGoalProgress(id: string, progress: number) {
  const goal = await Goal.findById(id).lean();
  if (!goal) return undefined;

  const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));

  // For KPI goals, keep Current Value and Progress synchronized. The existing
  // API still accepts a progress percentage so older frontend clients remain
  // compatible, but the stored KPI values remain internally consistent.
  const targetValue = (goal as any).targetValue;
  const currentValue = (goal as any).currentValue;

  if (
    typeof targetValue === "number" &&
    targetValue > 0 &&
    typeof currentValue === "number"
  ) {
    const nextCurrentValue = Math.min(
      targetValue,
      Math.max(0, Math.round((targetValue * safeProgress) / 100)),
    );
    const calculatedProgress = calculateGoalProgress(
      targetValue,
      nextCurrentValue,
    ) ?? 0;

    await Goal.updateOne(
      { _id: id },
      {
        $set: {
          currentValue: nextCurrentValue,
          progress: calculatedProgress,
          status: calculateGoalStatus(calculatedProgress),
        },
      },
    );
  } else {
    await Goal.updateOne(
      { _id: id },
      {
        $set: {
          progress: safeProgress,
          status: calculateGoalStatus(safeProgress),
        },
      },
    );
  }

  return normalizeGoal(await Goal.findById(id).lean());
}

export async function updateGoalCurrentValue(
  id: string,
  currentValue: number,
) {
  const goal = await Goal.findById(id).lean();
  if (!goal) return undefined;

  const targetValue = (goal as any).targetValue;

  if (typeof targetValue !== "number" || targetValue <= 0) {
    throw new Error(
      "A positive target value is required before updating the KPI current value.",
    );
  }

  const safeCurrentValue = Math.max(0, currentValue);
  const progress = calculateGoalProgress(targetValue, safeCurrentValue) ?? 0;

  await Goal.updateOne(
    { _id: id },
    {
      $set: {
        currentValue: safeCurrentValue,
        progress,
        status: calculateGoalStatus(progress),
      },
    },
  );

  return normalizeGoal(await Goal.findById(id).lean());
}

export async function getGoal(id: string) {
  return normalizeGoal(await Goal.findById(id).lean());
}
export async function getGoalHealth(id: string) {
  const goal = await Goal.findById(id).lean();

  if (!goal) {
    return undefined;
  }

  const normalized = normalizeGoal(goal);

  const progress = Math.min(
    100,
    Math.max(0, Number(normalized.progress ?? 0)),
  );

  const createdAt = goal.createdAt
    ? new Date(goal.createdAt as string)
    : null;

  const dueDate = goal.dueDate
    ? new Date(goal.dueDate as string)
    : null;

  let expectedProgress: number | null = null;
  let daysRemaining: number | null = null;

  if (
    createdAt &&
    dueDate &&
    !Number.isNaN(createdAt.getTime()) &&
    !Number.isNaN(dueDate.getTime()) &&
    dueDate.getTime() > createdAt.getTime()
  ) {
    const now = new Date();

    const totalDuration = dueDate.getTime() - createdAt.getTime();

    const elapsedDuration = Math.min(
      totalDuration,
      Math.max(0, now.getTime() - createdAt.getTime()),
    );

    expectedProgress = Math.round(
      (elapsedDuration / totalDuration) * 100,
    );

    daysRemaining = Math.max(
      0,
      Math.ceil(
        (dueDate.getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );
  }

  const gap =
    expectedProgress === null
      ? null
      : Math.round(progress - expectedProgress);

  let health: "ON_TRACK" | "NEEDS_ATTENTION" | "AT_RISK" =
    "ON_TRACK";

  if (progress >= 100) {
    health = "ON_TRACK";
  } else if (gap !== null) {
    if (gap <= -20) {
      health = "AT_RISK";
    } else if (gap < 0) {
      health = "NEEDS_ATTENTION";
    }
  }

  const milestones = Array.isArray(goal.milestones)
    ? goal.milestones
    : [];

  const completedMilestones = milestones.filter(
    (milestone: any) => milestone.completed,
  ).length;

  return {
    goalId: goal._id,
    title: goal.title,
    category: goal.category ?? null,
    progress,
    targetValue:
      typeof goal.targetValue === "number"
        ? goal.targetValue
        : null,
    currentValue:
      typeof goal.currentValue === "number"
        ? goal.currentValue
        : null,
    expectedProgress,
    gap,
    daysRemaining,
    health,
    milestones: {
      total: milestones.length,
      completed: completedMilestones,
      completionPercentage:
        milestones.length > 0
          ? Math.round(
              (completedMilestones / milestones.length) * 100,
            )
          : null,
    },
  };
}

export async function getGoalTrend(
  employeeId: string,
  cycleId?: string | null,
) {
  const query: Record<string, any> = { employeeId };
  if (cycleId) {
    query.cycleId = cycleId;
  }

  const goals = await Goal.find(query).lean();
  const values = new Map<string, { total: number; count: number }>();

  for (const goal of goals) {
    const normalized = normalizeGoal(goal);
    const key = goal.cycleId ?? "unassigned";
    const entry = values.get(key) ?? { total: 0, count: 0 };
    entry.total += normalized.progress;
    entry.count++;
    values.set(key, entry);
  }

  const cycles = await PerformanceCycle.find({
    _id: { $in: [...values.keys()].filter((key) => key !== "unassigned") },
  }).lean();
  const names = new Map(cycles.map((cycle) => [cycle._id, cycle.name]));

  return [...values].map(([cycleId, value]) => ({
    cycleId: cycleId === "unassigned" ? null : cycleId,
    cycleName: names.get(cycleId) ?? "Unassigned goals",
    achievementPercentage: Math.round(value.total / value.count),
  }));
}

export async function listFeedbackRequests(
  reviewerEmployeeId: string,
  cycleId?: string,
) {
  const query: Record<string, any> = { reviewerEmployeeId };
  if (cycleId) query.cycleId = cycleId;

  const rows = await PerformanceFeedbackRequest.find(query)
    .sort({ createdAt: -1 })
    .lean();

  const employeeIds = [
    ...new Set(
      rows.flatMap((row) => [
        row.revieweeEmployeeId,
        row.reviewerEmployeeId,
      ]),
    ),
  ];

  const employees = await Employee.find({
    _id: { $in: employeeIds },
  })
    .select("firstName lastName avatarUrl designationId departmentId")
    .lean();

  const map = new Map(employees.map((employee) => [employee._id, employee]));

  return rows.map((row) => ({
    ...toApiDoc(row),
    revieweeFirstName:
      map.get(row.revieweeEmployeeId)?.firstName ?? null,
    revieweeLastName:
      map.get(row.revieweeEmployeeId)?.lastName ?? null,
    revieweeAvatar:
      map.get(row.revieweeEmployeeId)?.avatarUrl ?? null,
    revieweeDesignation:
      map.get(row.revieweeEmployeeId)?.designationId ?? null,
    revieweeDepartment:
      map.get(row.revieweeEmployeeId)?.departmentId ?? null,
  }));
}

export async function createFeedbackRequest(input: {
  cycleId: string;
  reviewId: string;
  reviewerEmployeeId: string;
  revieweeEmployeeId: string;
  type: "PEER" | "SUBORDINATE" | "CROSS_FUNCTIONAL";
  dueDate?: string;
  createdBy?: string | null;
}) {
  if (input.reviewerEmployeeId === input.revieweeEmployeeId) {
    throw new Error("A feedback reviewer must be different from the reviewee.");
  }

  const [cycle, review, reviewer, reviewee] = await Promise.all([
    PerformanceCycle.findById(input.cycleId).lean(),
    PerformanceReview.findById(input.reviewId).lean(),
    Employee.findById(input.reviewerEmployeeId).lean(),
    Employee.findById(input.revieweeEmployeeId).lean(),
  ]);

  if (!cycle) {
    throw new Error("Performance cycle not found.");
  }
  if (!cycle.isActive) {
    throw new Error(
      "360 feedback can only be assigned in an active performance cycle.",
    );
  }
  if (!review) {
    throw new Error("Performance review not found.");
  }
  if (
    review.cycleId !== input.cycleId ||
    review.revieweeId !== input.revieweeEmployeeId
  ) {
    throw new Error(
      "The selected review does not belong to the selected cycle and reviewee.",
    );
  }
  if (!reviewer || !reviewee) {
    throw new Error("Reviewer or reviewee not found.");
  }

  if (
    input.type === "CROSS_FUNCTIONAL" &&
    reviewee.departmentId &&
    reviewer.departmentId &&
    String(reviewee.departmentId) === String(reviewer.departmentId)
  ) {
    throw new Error(
      "Cross-functional feedback must be assigned to an employee from a different department.",
    );
  }

  const doc = await PerformanceFeedbackRequest.findOneAndUpdate(
    {
      reviewId: input.reviewId,
      reviewerEmployeeId: input.reviewerEmployeeId,
    },
    {
      $setOnInsert: {
        cycleId: input.cycleId,
        reviewId: input.reviewId,
        reviewerEmployeeId: input.reviewerEmployeeId,
        revieweeEmployeeId: input.revieweeEmployeeId,
        type: input.type,
        status: "PENDING",
        dueDate: input.dueDate ?? null,
        createdBy: input.createdBy ?? null,
        createdAt: nowIso(),
        completedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  if (reviewer.userId) {
    await notify({
      userId: reviewer.userId,
      type: "PERFORMANCE",
      title: "360 feedback assigned",
      message: `You have been asked to provide ${input.type.toLowerCase()} feedback for ${reviewee.firstName ?? "an employee"} ${reviewee.lastName ?? ""}.`,
      link: "/app/performance",
      dedupeKey: `performance-feedback-request:${doc!._id}:${reviewer.userId}`,
    });
  }

  return toApiDoc(doc);
}

export async function getFeedbackRequest(id: string) {
  return toApiDoc(await PerformanceFeedbackRequest.findById(id).lean());
}

type PerformanceFeedbackInput = {
  requestId?: string;
  reviewId?: string;
  reviewerEmployeeId: string;
  type: "PEER" | "SUBORDINATE" | "CROSS_FUNCTIONAL";
  competencyRatings: { competency: string; rating: number }[];
  comments?: string;
};

function normalizeFeedbackRatings(
  competencyRatings: { competency: string; rating: number }[],
) {
  if (!Array.isArray(competencyRatings) || competencyRatings.length === 0) {
    throw new Error("At least one competency rating is required.");
  }

  const seen = new Set<string>();

  return competencyRatings.map((item) => {
    const competency = String(item.competency ?? "").trim();

    if (!competency) {
      throw new Error("Competency name is required.");
    }

    const key = competency.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate competency: ${competency}.`);
    }
    seen.add(key);

    if (
      typeof item.rating !== "number" ||
      !Number.isFinite(item.rating) ||
      item.rating < 1 ||
      item.rating > 5
    ) {
      throw new Error("Competency ratings must be between 1 and 5.");
    }

    return {
      competency,
      rating: Math.round(item.rating * 10) / 10,
    };
  });
}

export async function submitFeedback(input: PerformanceFeedbackInput) {
  let request: any = null;
  let reviewId = input.reviewId;

  if (input.requestId) {
    request = await PerformanceFeedbackRequest.findById(input.requestId).lean();

    if (!request) {
      throw new Error("Feedback request not found.");
    }
    if (request.reviewerEmployeeId !== input.reviewerEmployeeId) {
      throw new Error(
        "You are not authorized to submit this feedback request.",
      );
    }
    if (request.status !== "PENDING") {
      throw new Error("This feedback request is no longer pending.");
    }
    if (request.type !== input.type) {
      throw new Error(
        "Feedback relationship does not match the assigned request.",
      );
    }

    reviewId = request.reviewId;
  }

  if (!reviewId) {
    throw new Error("A feedback request or review ID is required.");
  }

  const review = await PerformanceReview.findById(reviewId).lean();
  if (!review) {
    throw new Error("The selected performance review does not exist.");
  }

  const reviewer = await Employee.findById(input.reviewerEmployeeId).lean();
  if (!reviewer) {
    throw new Error("The selected feedback reviewer does not exist.");
  }

  if (
    review.reviewerId === input.reviewerEmployeeId ||
    review.revieweeId === input.reviewerEmployeeId
  ) {
    throw new Error(
      "An employee cannot submit 360° feedback for their own review.",
    );
  }

  if (!["PEER", "SUBORDINATE", "CROSS_FUNCTIONAL"].includes(input.type)) {
    throw new Error("Invalid 360° feedback relationship type.");
  }

  if (input.type === "CROSS_FUNCTIONAL") {
    const reviewee = await Employee.findById(review.revieweeId)
      .select({ departmentId: 1 })
      .lean();

    if (!reviewee) {
      throw new Error("The employee being reviewed does not exist.");
    }

    if (
      reviewee.departmentId &&
      reviewer.departmentId &&
      String(reviewee.departmentId) === String(reviewer.departmentId)
    ) {
      throw new Error(
        "Cross-functional feedback must be submitted by an employee from a different department.",
      );
    }
  }

  const competencyRatings = normalizeFeedbackRatings(
    input.competencyRatings,
  );
  const comments = input.comments?.trim() || null;

  const doc = await PerformanceFeedback.findOneAndUpdate(
    {
      reviewId,
      reviewerEmployeeId: input.reviewerEmployeeId,
    },
    {
      $set: {
        reviewId,
        reviewerEmployeeId: input.reviewerEmployeeId,
        type: input.type,
        competencyRatings,
        comments,
        submittedAt: nowIso(),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  if (request) {
    await PerformanceFeedbackRequest.updateOne(
      { _id: request._id },
      {
        $set: {
          status: "COMPLETED",
          completedAt: nowIso(),
        },
      },
    );
  }

  return toApiDoc(doc);
}

export async function getFeedbackSummary(reviewId: string) {
  const review = await PerformanceReview.findById(reviewId).lean();
  if (!review) {
    throw new Error("The selected performance review does not exist.");
  }

  const feedback = await PerformanceFeedback.find({ reviewId }).lean();
  const ratings = new Map<string, number[]>();

  for (const entry of feedback) {
    for (const item of entry.competencyRatings ?? []) {
      const competency = String(item.competency ?? "").trim();
      if (!competency) continue;

      const values = ratings.get(competency) ?? [];
      values.push(item.rating);
      ratings.set(competency, values);
    }
  }

  return {
    responseCount: feedback.length,
    competencies: [...ratings].map(([competency, values]) => ({
      competency,
      averageRating:
        Math.round(
          (values.reduce((sum, value) => sum + value, 0) / values.length) *
            100,
        ) / 100,
    })),
    // Deliberately omit reviewer identity so the aggregate remains anonymous.
    comments: feedback
      .map((entry) => entry.comments)
      .filter((comment): comment is string => Boolean(comment?.trim())),
  };
}

export async function listFeedbackForReviewer(
  reviewerEmployeeId: string,
  reviewId?: string,
) {
  const query: Record<string, any> = { reviewerEmployeeId };
  if (reviewId) query.reviewId = reviewId;

  const rows = await PerformanceFeedback.find(query)
    .sort({ submittedAt: -1 })
    .lean();

  return rows.map(toApiDoc);
}
export async function getOutcome(reviewId: string) { return toApiDoc(await PerformanceOutcome.findOne({ reviewId }).lean()); }


export type PerformanceOutcomeInput = {
  incrementRecommendation: "MAXIMUM" | "STANDARD" | "NONE" | "PIP";
  promotionEligible?: boolean;
  trainingNeeds?: string[];
  pipRecommended?: boolean;
  fastTrackEligible?: boolean;
};

export async function upsertOutcome(
  reviewId: string,
  input: PerformanceOutcomeInput,
) {
  const review = await PerformanceReview.findById(reviewId).lean();

  if (!review) {
    return undefined;
  }

  const outcome = await PerformanceOutcome.findOneAndUpdate(
    { reviewId },
    {
      $set: {
        reviewId,
        incrementRecommendation: input.incrementRecommendation,
        promotionEligible: input.promotionEligible ?? false,
        trainingNeeds: input.trainingNeeds ?? [],
        pipRecommended: input.pipRecommended ?? false,
        fastTrackEligible: input.fastTrackEligible ?? false,
        createdAt: nowIso(),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  return toApiDoc(outcome);
}


/**
 * Return employees who directly report to the supplied manager.
 *
 * The Employee model stores the reporting relationship on managerId, so
 * Performance should use that same source of truth rather than deriving
 * direct reports from performance-review records.
 */
export async function listDirectReports(managerId: string) {
  const rows = await Employee.find({ managerId })
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  return rows.map((employee: any) => ({
    id: employee._id,
    firstName: employee.firstName ?? null,
    lastName: employee.lastName ?? null,
    email: employee.email ?? null,
    avatarUrl: employee.avatarUrl ?? null,
    managerId: employee.managerId ?? null,
    designationId: employee.designationId ?? null,
    departmentId: employee.departmentId ?? null,
  }));
}

/**
 * Ensure that an employee has a review for the currently active cycle.
 *
 * This is intentionally explicit: creating a PerformanceCycle does not by
 * itself create employee review assignments.
 */
export async function ensureActiveCycleReview(
  revieweeId: string,
  reviewerId: string,
) {
  const cycle = await getActiveCycle();

  if (!cycle) {
    return undefined;
  }

  return ensureReview(String(cycle.id), revieweeId, reviewerId);
}

/* -------------------------------------------------------------------------- */
/*                         PERFORMANCE IMPROVEMENT PLAN                        */
/* -------------------------------------------------------------------------- */

type PipObjectiveInput = {
  title: string;
  description?: string;
  target?: string;
  progress?: number;
  status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
  dueDate: string;
};

type PipCheckInInput = {
  date?: string;
  progress?: number;
  managerComments?: string;
  hrComments?: string;
  nextSteps?: string;
  managerId?: string | null;
  addedByRole?: string;
};

function normalizePipObjective(input: PipObjectiveInput) {
  return {
    title: input.title,
    description: input.description ?? null,
    target: input.target ?? null,
    progress: input.progress ?? 0,
    status: input.status ?? "NOT_STARTED",
    dueDate: input.dueDate,
  };
}

function toPipApiDoc(doc: any, managerId: string | null = null) {
  if (!doc) return undefined;

  const plain = toApiDoc(doc) as any;

  // Newer PIPs store structured objectives/frequency in expanded fields while
  // retaining the legacy fields for backward compatibility.
  const storedObjectives = Array.isArray(plain.pipObjectives)
    ? plain.pipObjectives
    : plain.objectives;

  const objectives = Array.isArray(storedObjectives)
    ? storedObjectives.map((objective: any) =>
      typeof objective === "string"
        ? {
          title: objective,
          description: null,
          target: null,
          progress: 0,
          status: "NOT_STARTED",
          dueDate: plain.endDate,
        }
        : {
          title: objective.title,
          description: objective.description ?? null,
          target: objective.target ?? null,
          progress: objective.progress ?? 0,
          status: objective.status ?? "NOT_STARTED",
          dueDate: objective.dueDate ?? plain.endDate,
        },
    )
    : [];

  return {
    ...plain,
    managerId: plain.managerId ?? managerId,
    objectives,
    checkInFrequency:
      plain.pipCheckInFrequency ?? plain.checkInFrequency ?? "MONTHLY",
    checkIns: Array.isArray(plain.checkIns) ? plain.checkIns : [],
    finalOutcome: plain.finalOutcome ?? null,
  };
}


export async function listPips(filters: {
  employeeId?: string;
  managerId?: string;
  status?: string;
}) {
  const query: Record<string, any> = {};

  if (filters.employeeId) {
    query.employeeId = filters.employeeId;
  }

  if (filters.status) {
    query.status = filters.status === "DRAFT" ? "ACTIVE" : filters.status;
  }

  if (filters.managerId) {
    const reports = await Employee.find({
      managerId: filters.managerId,
    })
      .select({ _id: 1 })
      .lean();

    const reportIds = reports.map((employee) => employee._id);
    query.employeeId = query.employeeId
      ? query.employeeId
      : { $in: reportIds };
  }

  const rows = await PerformanceImprovementPlan.find(query)
    .sort({ createdAt: -1 })
    .lean();

  const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
  const employees = employeeIds.length
    ? await Employee.find({ _id: { $in: employeeIds } }).lean()
    : [];
  const managerMap = new Map(
    employees.map((employee) => [employee._id, employee.managerId ?? null]),
  );

  return rows.map((row) => toPipApiDoc(row, managerMap.get(row.employeeId) ?? null));
}

export async function getPip(id: string) {
  const row = await PerformanceImprovementPlan.findById(id).lean();
  if (!row) return undefined;

  const employee = await Employee.findById(row.employeeId).lean();
  return toPipApiDoc(row, employee?.managerId ?? null);
}

export async function createPip(input: {
  reviewId: string;
  employeeId: string;
  managerId?: string;
  createdBy?: string;
  status?: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDate: string;
  endDate: string;
  objectives: PipObjectiveInput[];
  checkInFrequency?: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
}) {
  const existing = await PerformanceImprovementPlan.findOne({
    reviewId: input.reviewId,
  }).lean();

  if (existing) {
    return getPip(existing._id);
  }

  const [employee, review] = await Promise.all([
    Employee.findById(input.employeeId).lean(),
    PerformanceReview.findById(input.reviewId).lean(),
  ]);

  if (!employee) throw new Error("Employee not found.");
  if (!review) throw new Error("Performance review not found.");
  if (review.revieweeId !== input.employeeId) {
    throw new Error("The PIP employee must match the completed review employee.");
  }
  if (review.status !== "COMPLETED") {
    throw new Error("A PIP can only be created from a completed performance review.");
  }

  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
    throw new Error("PIP start date must be before end date.");
  }

  const objectives = input.objectives.map(normalizePipObjective);
  if (objectives.some((objective) => {
    const due = new Date(objective.dueDate);
    return Number.isNaN(due.getTime()) || due < startDate || due > endDate;
  })) {
    throw new Error("Every PIP objective due date must fall within the PIP period.");
  }
  const frequency = input.checkInFrequency ?? "MONTHLY";
  const status =
    input.status === "COMPLETED" || input.status === "CANCELLED"
      ? input.status
      : "ACTIVE";

  // Keep the legacy model-compatible fields populated, while storing the
  // complete structured PIP data separately. This allows WEEKLY/BIWEEKLY
  // frequencies and objective metadata to survive until the DB model is
  // migrated to the expanded schema.
  const legacyObjectives = objectives.map((objective) => objective.title);

  const doc = await PerformanceImprovementPlan.create({
    reviewId: input.reviewId,
    employeeId: input.employeeId,
    status,
    startDate: input.startDate,
    endDate: input.endDate,
    objectives: legacyObjectives,
    checkInFrequency: frequency === "WEEKLY" || frequency === "BIWEEKLY"
      ? "MONTHLY"
      : frequency,
    createdAt: nowIso(),
  });

  await PerformanceImprovementPlan.updateOne(
    { _id: doc._id },
    {
      $set: {
        managerId: input.managerId ?? employee?.managerId ?? null,
        createdBy: input.createdBy ?? null,
        pipObjectives: objectives,
        pipCheckInFrequency: frequency,
      },
    } as any,
    { strict: false } as any,
  );

  return getPip(doc._id);
}


export async function updatePipObjectives(
  id: string,
  objectives: PipObjectiveInput[],
) {
  const row = await PerformanceImprovementPlan.findById(id).lean();
  if (!row) return undefined;

  const normalizedObjectives = objectives.map(normalizePipObjective);

  await PerformanceImprovementPlan.updateOne(
    { _id: id },
    {
      $set: {
        objectives: normalizedObjectives.map((objective) => objective.title),
        pipObjectives: normalizedObjectives,
      },
    } as any,
    { strict: false } as any,
  );

  return getPip(id);
}


export async function addPipCheckIn(
  id: string,
  checkIn: PipCheckInInput,
) {
  const row = await PerformanceImprovementPlan.findById(id).lean();
  if (!row) return undefined;

  if (row.status === "COMPLETED" || row.status === "CANCELLED") {
    throw new Error("Check-ins cannot be added to a completed or cancelled PIP.");
  }

  const progress = Math.min(100, Math.max(0, Math.round(checkIn.progress ?? 0)));

  const existingCheckIns = Array.isArray((row as any).checkIns)
    ? (row as any).checkIns
    : [];

  const newCheckIn = {
    date: checkIn.date ?? nowIso(),
    progress,
    managerComments: checkIn.managerComments ?? null,
    hrComments: checkIn.hrComments ?? null,
    nextSteps: checkIn.nextSteps ?? null,
    managerId: checkIn.managerId ?? null,
    addedByRole: checkIn.addedByRole ?? null,
  };

  const nextCheckIns = [...existingCheckIns, newCheckIn];

  // A check-in is the source of truth for the current PIP progress. Keep the
  // structured objectives synchronized with the latest check-in so the UI
  // never shows 0% while the PIP has recorded measurable progress.
  const existingObjectives = Array.isArray((row as any).pipObjectives)
    ? (row as any).pipObjectives
    : Array.isArray((row as any).objectives)
      ? (row as any).objectives.map((objective: any) =>
        typeof objective === "string"
          ? {
            title: objective,
            description: null,
            target: null,
            progress: 0,
            status: "NOT_STARTED",
            dueDate: row.endDate,
          }
          : objective,
      )
      : [];

  const updatedObjectives = existingObjectives.map((objective: any) => ({
    title: objective.title,
    description: objective.description ?? null,
    target: objective.target ?? null,
    progress,
    status: progress >= 100 ? "COMPLETED" : progress > 0 ? "IN_PROGRESS" : "NOT_STARTED",
    dueDate: objective.dueDate ?? row.endDate,
  }));

  await PerformanceImprovementPlan.updateOne(
    { _id: id },
    {
      $set: {
        checkIns: nextCheckIns,
        latestCheckInProgress: progress,
        pipObjectives: updatedObjectives,
        objectives: updatedObjectives.map((objective: any) => objective.title),
      },
    } as any,
    { strict: false } as any,
  );

  const updated = await PerformanceImprovementPlan.findById(id).lean();
  const employee = updated
    ? await Employee.findById(updated.employeeId).lean()
    : null;

  return toPipApiDoc(updated, employee?.managerId ?? null);
}

export async function updatePipStatus(
  id: string,
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED",
  finalOutcome?: string,
) {
  const row = await PerformanceImprovementPlan.findById(id).lean();
  if (!row) return undefined;

  if (row.status === "CANCELLED" && status !== "CANCELLED") {
    throw new Error("A cancelled PIP cannot be reopened.");
  }

  if (row.status === "COMPLETED" && status !== "COMPLETED") {
    throw new Error("A completed PIP cannot be moved to another status.");
  }

  if (status === "COMPLETED") {
    const rawObjectives = Array.isArray((row as any).pipObjectives)
      ? (row as any).pipObjectives
      : Array.isArray((row as any).objectives)
        ? (row as any).objectives.map((objective: any) =>
          typeof objective === "string"
            ? { progress: 0, status: "NOT_STARTED" }
            : objective,
        )
        : [];

    if (rawObjectives.length === 0) {
      throw new Error("A PIP must have at least one objective before it can be completed.");
    }

    const incompleteObjective = rawObjectives.find((objective: any) => {
      const progress = typeof objective.progress === "number" ? objective.progress : 0;
      return progress < 100 || objective.status !== "COMPLETED";
    });

    if (incompleteObjective) {
      throw new Error(
        "PIP cannot be completed until all objectives reach 100% and are marked COMPLETED.",
      );
    }
  }

  const set: Record<string, any> = { status };

  if (status === "COMPLETED") {
    set.completedAt = nowIso();
  } else if ((row as any).completedAt) {
    set.completedAt = null;
  }

  if (status === "CANCELLED") {
    set.cancelledAt = nowIso();
  } else if ((row as any).cancelledAt) {
    set.cancelledAt = null;
  }

  if (finalOutcome !== undefined) {
    set.finalOutcome = finalOutcome.trim() || null;
  }

  await PerformanceImprovementPlan.updateOne(
    { _id: id },
    { $set: set } as any,
    { strict: false } as any,
  );

  return getPip(id);
}


export async function calibrateReview(input: {
  reviewId: string;
  calibratedRating: number;
  comments?: string;
  calibratedBy: string;
}) {
  const review = await PerformanceReview.findById(input.reviewId).lean();
  if (!review) return undefined;
  if (review.status !== "COMPLETED") throw new Error("Only completed reviews can be calibrated.");
  if (input.calibratedRating < 1 || input.calibratedRating > 5) throw new Error("Calibrated rating must be between 1 and 5.");
  await PerformanceReview.updateOne(
    { _id: input.reviewId },
    { $set: { calibratedRating: input.calibratedRating, calibrationComments: input.comments?.trim() || null, calibratedBy: input.calibratedBy, calibratedAt: nowIso() } },
  );
  return getReview(input.reviewId);
}

export async function listCalibrationReviews(cycleId?: string) {
  const rows = await PerformanceReview.find({ status: "COMPLETED", ...(cycleId ? { cycleId } : {}) }).sort({ submittedAt: -1 }).lean();
  return enrichReviews(rows);
}

export async function getAverageRatingByDepartment() {
  const reviews = await PerformanceReview.find({
    finalRating: { $ne: null },
  }).lean();
  if (reviews.length === 0) return [];

  const revieweeIds = [...new Set(reviews.map((r) => r.revieweeId))];
  const employees = await Employee.find({ _id: { $in: revieweeIds } }).lean();
  const empMap = new Map(employees.map((e) => [e._id, e]));
  const departmentIds = [...new Set(employees.map((e) => e.departmentId))];
  const departments = await Department.find({
    _id: { $in: departmentIds },
  }).lean();
  const deptMap = new Map(departments.map((d) => [d._id, d]));

  const grouped = new Map<string, number[]>();
  for (const r of reviews) {
    const emp = empMap.get(r.revieweeId);
    if (!emp) continue;
    const list = grouped.get(emp.departmentId) ?? [];
    list.push(r.finalRating as number);
    grouped.set(emp.departmentId, list);
  }

  return [...grouped.entries()].map(([departmentId, ratings]) => ({
    department: deptMap.get(departmentId)?.name ?? null,
    avgRating:
      Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) /
      100,
  }));
}
export async function getAiPerformanceInsights(
  reviewId: string,
) {
  const review = (await getReview(reviewId)) as any;

  if (!review) {
    return undefined;
  }

  const goals = await Goal.find({
    employeeId: review.revieweeId,
    cycleId: review.cycleId,
  }).lean();

  const feedbackSummary =
    await getFeedbackSummary(reviewId);

  const outcome =
    await getOutcome(reviewId);

  const input = {
    selfRating: review.selfRating ?? null,

    managerRating:
      review.managerRating ?? null,

    finalRating:
      review.finalRating ?? null,

    managerTechnicalRating:
      review.managerTechnicalRating ?? null,

    managerDeliveryRating:
      review.managerDeliveryRating ?? null,

    managerBehaviorRating:
      review.managerBehaviorRating ?? null,

    strengths:
      review.strengths ?? null,

    improvements:
      review.improvements ?? null,

    goals: goals.map((goal: any) => ({
      title: goal.title,
      progress: normalizeGoal(goal).progress,
    })),

    feedback:
      feedbackSummary.competencies.map(
        (item) => ({
          competency: item.competency,
          averageRating: item.averageRating,
        }),
      ),

    outcome: outcome
      ? {
        incrementRecommendation:
          outcome.incrementRecommendation,

        promotionEligible:
          outcome.promotionEligible,

        pipRecommended:
          outcome.pipRecommended,

        fastTrackEligible:
          outcome.fastTrackEligible,

        trainingNeeds:
          outcome.trainingNeeds ?? [],
      }
      : null,
  };

  return generatePerformanceInsights(input);
}
export async function getAiDevelopmentPlan(reviewId: string) {
  const review = await getReview(reviewId);

  if (!review) {
    throw new Error("Review not found.");
  }

  const goals = await Goal.find({
    employeeId: review.revieweeId,
    cycleId: review.cycleId,
  }).lean();

  const feedback = await getFeedbackSummary(reviewId);
  const outcome = await getOutcome(reviewId);

  const input = {
    selfRating: review.selfRating ?? null,
    managerRating: review.managerRating ?? null,
    finalRating: review.finalRating ?? null,

    managerTechnicalRating:
      review.managerTechnicalRating ?? null,

    managerDeliveryRating:
      review.managerDeliveryRating ?? null,

    managerBehaviorRating:
      review.managerBehaviorRating ?? null,

    strengths: review.strengths ?? null,
    improvements: review.improvements ?? null,

    goals: goals.map((goal: any) => ({
      title: goal.title,
      progress: Math.max(
        0,
        Math.min(100, Number(goal.progress ?? 0)),
      ),
    })),

    feedback: feedback.competencies.map((item: any) => ({
      competency: item.competency,
      averageRating: Number(item.averageRating ?? 0),
    })),

    outcome: outcome
      ? {
        incrementRecommendation:
          outcome.incrementRecommendation,

        promotionEligible:
          outcome.promotionEligible,

        pipRecommended:
          outcome.pipRecommended,

        fastTrackEligible:
          outcome.fastTrackEligible,

        trainingNeeds:
          outcome.trainingNeeds,
      }
      : null,
  };

  return generateDevelopmentPlan(input);
}
export async function getPerformanceChatContext(
  reviewId: string,
) {
  const review = (await getReview(reviewId)) as any;

  if (!review) {
    return undefined;
  }

  const goals = await Goal.find({
    employeeId: review.revieweeId,
    cycleId: review.cycleId,
  }).lean();

  const feedbackSummary =
    await getFeedbackSummary(reviewId);

  const outcome =
    await getOutcome(reviewId);

  return {
    selfRating: review.selfRating ?? null,
    managerRating: review.managerRating ?? null,
    finalRating: review.finalRating ?? null,

    managerTechnicalRating:
      review.managerTechnicalRating ?? null,

    managerDeliveryRating:
      review.managerDeliveryRating ?? null,

    managerBehaviorRating:
      review.managerBehaviorRating ?? null,

    strengths: review.strengths ?? null,
    improvements: review.improvements ?? null,

    goals: goals.map((goal: any) => ({
      title: goal.title,
      progress: normalizeGoal(goal).progress,
    })),

    feedback: feedbackSummary.competencies.map(
      (item: any) => ({
        competency: item.competency,
        averageRating: Number(
          item.averageRating ?? 0,
        ),
      }),
    ),

    outcome: outcome
      ? {
        incrementRecommendation:
          outcome.incrementRecommendation,

        promotionEligible:
          outcome.promotionEligible,

        pipRecommended:
          outcome.pipRecommended,

        fastTrackEligible:
          outcome.fastTrackEligible,

        trainingNeeds:
          outcome.trainingNeeds ?? [],
      }
      : null,
  };
}
export async function getAiPerformanceChat(
  reviewId: string,
  question: string,
) {
  const context = await getPerformanceChatContext(reviewId);

  if (!context) {
    return undefined;
  }

  return generatePerformanceChat(
    context,
    question,
  );
}
export async function getAiGoalCoach(
  goalId: string,
  question?: string,
) {
  const goal = await Goal.findById(goalId).lean();

  if (!goal) {
    return undefined;
  }

  const health = await getGoalHealth(goalId);

  const normalized = normalizeGoal(goal);

  return generateGoalCoach(
    {
      title: goal.title,
      description: goal.description ?? null,
      progress: normalized.progress,
      target:
        typeof goal.targetValue === "number"
          ? goal.targetValue
          : null,
      dueDate: goal.dueDate
        ? new Date(goal.dueDate).toISOString()
        : null,
      health: health?.health ?? null,
    },
    question,
  );
}
