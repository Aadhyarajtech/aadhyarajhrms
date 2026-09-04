import {
  PerformanceCycle,
  PerformanceReview,
  Goal,
  PerformanceFeedback,
  PerformanceOutcome,
  PerformanceImprovementPlan,
  Employee,
  Designation,
  Department,
} from "@/db/models";
import { nowIso } from "@/db/connection";

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
}) {
  const doc = await PerformanceCycle.create({ ...input, isActive: true });
  return toApiDoc((await PerformanceCycle.findById(doc._id).lean())!);
}

export async function getActiveCycle() {
  const row = await PerformanceCycle.findOne({ isActive: true })
    .sort({ startDate: -1 })
    .lean();
  return toApiDoc(row);
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

export async function ensureReview(
  cycleId: string,
  revieweeId: string,
  reviewerId: string,
) {
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

  const finalRating = review.selfRating
    ? Math.round(((review.selfRating + managerRating) / 2) * 10) / 10
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

  return getReview(id);
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

  const calculatedProgress = calculateGoalProgress(
    goal.targetValue,
    goal.currentValue,
  );

  // KPI goals use Current Value as the source of truth. For legacy goals
  // without a target/current pair, preserve their existing manual progress.
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

export async function listGoals(employeeId: string) {
  const rows = await Goal.find({ employeeId }).sort({ dueDate: 1 }).lean();
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

  const targetValue = input.targetValue ?? null;
  const currentValue = input.currentValue ?? null;

  // When a KPI target and current value are supplied, start the goal at the
  // corresponding achievement percentage instead of resetting it to zero.
  const progress =
    typeof targetValue === "number" &&
    targetValue > 0 &&
    typeof currentValue === "number"
      ? Math.min(100, Math.max(0, Math.round((currentValue / targetValue) * 100)))
      : 0;


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
    milestones: (input.milestones ?? []).map((milestone) => ({
      title: milestone.title,
      targetDate: milestone.targetDate ?? null,
      completed: milestone.completed ?? false,
    })),
    assignedBy: input.assignedBy ?? null,
  });

  return normalizeGoal(await Goal.findById(doc._id).lean());
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

export async function getGoalTrend(employeeId: string) {
  const goals = await Goal.find({ employeeId }).lean();
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

export async function submitFeedback(input: { reviewId: string; reviewerEmployeeId: string; type: "PEER" | "SUBORDINATE"; competencyRatings: { competency: string; rating: number }[]; comments?: string }) { const doc = await PerformanceFeedback.findOneAndUpdate({ reviewId: input.reviewId, reviewerEmployeeId: input.reviewerEmployeeId }, { $set: { ...input, comments: input.comments ?? null, submittedAt: nowIso() } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean(); return toApiDoc(doc); }
export async function getFeedbackSummary(reviewId: string) { const feedback = await PerformanceFeedback.find({ reviewId }).lean(); const ratings = new Map<string, number[]>(); for (const entry of feedback) for (const item of entry.competencyRatings) { const values = ratings.get(item.competency) ?? []; values.push(item.rating); ratings.set(item.competency, values); } return { responseCount: feedback.length, competencies: [...ratings].map(([competency, values]) => ({ competency, averageRating: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 })), comments: feedback.map((entry) => entry.comments).filter(Boolean) }; }
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

  const employee = await Employee.findById(input.employeeId).lean();

  const objectives = input.objectives.map(normalizePipObjective);
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

  const existingCheckIns = Array.isArray((row as any).checkIns)
    ? (row as any).checkIns
    : [];

  const newCheckIn = {
    date: checkIn.date ?? nowIso(),
    progress: checkIn.progress ?? 0,
    managerComments: checkIn.managerComments ?? null,
    hrComments: checkIn.hrComments ?? null,
    nextSteps: checkIn.nextSteps ?? null,
    managerId: checkIn.managerId ?? null,
    addedByRole: checkIn.addedByRole ?? null,
  };

  // Use an explicit update object so this function is ready for the expanded
  // PIP schema. With the current basic schema, checkIns requires that model
  // field to be added before this data can be persisted.
  const nextCheckIns = [...existingCheckIns, newCheckIn];

  await PerformanceImprovementPlan.updateOne(
    { _id: id },
    {
      $set: {
        checkIns: nextCheckIns,
        latestCheckInProgress: newCheckIn.progress,
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

  const set: Record<string, any> = {
    // Preserve the requested status. DRAFT is a valid persisted PIP state.
    status,
  };

  if (status === "COMPLETED") {
    set.completedAt = nowIso();
  }

  if (status === "CANCELLED") {
    set.cancelledAt = nowIso();
  }

  if (finalOutcome !== undefined) {
    set.finalOutcome = finalOutcome;
  }

  await PerformanceImprovementPlan.updateOne(
    { _id: id },
    { $set: set } as any,
    { strict: false } as any,
  );

  return getPip(id);
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
