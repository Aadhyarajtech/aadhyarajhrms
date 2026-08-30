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

  await PerformanceOutcome.findOneAndUpdate(
    { reviewId: id },
    {
      $set: {
        reviewId: id,
        incrementRecommendation:
          rating >= 5
            ? "MAXIMUM"
            : rating >= 3
              ? "STANDARD"
              : rating === 2
                ? "PIP"
                : "NONE",
        promotionEligible: rating >= 4,
        fastTrackEligible: rating >= 5,
        pipRecommended: rating <= 2,
        trainingNeeds:
          rating <= 3 && review.improvements ? [review.improvements] : [],
        createdAt: nowIso(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (rating <= 2) {
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

export async function listGoals(employeeId: string) {
  const rows = await Goal.find({ employeeId }).sort({ dueDate: 1 }).lean();
  return rows.map(toApiDoc);
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
  const doc = await Goal.create({
    employeeId: input.employeeId,
    title: input.title,
    description: input.description ?? null,
    dueDate: input.dueDate,
    status: "NOT_STARTED",
    progress: 0,
    createdAt: nowIso(),
    cycleId: input.cycleId ?? null,
    parentGoalId: input.parentGoalId ?? null,
    category: input.category ?? null,
    targetValue: input.targetValue ?? null,
    currentValue: input.currentValue ?? null,
    milestones: (input.milestones ?? []).map((milestone) => ({
      title: milestone.title,
      targetDate: milestone.targetDate ?? null,
      completed: milestone.completed ?? false,
    })),
    assignedBy: input.assignedBy ?? null,
  });
  return toApiDoc((await Goal.findById(doc._id).lean())!);
}

export async function updateGoalProgress(id: string, progress: number) {
  const status =
    progress >= 100
      ? "COMPLETED"
      : progress > 0
        ? "IN_PROGRESS"
        : "NOT_STARTED";
  await Goal.updateOne({ _id: id }, { $set: { progress, status } });
  return toApiDoc((await Goal.findById(id).lean())!);
}

export async function getGoal(id: string) {
  return toApiDoc(await Goal.findById(id).lean());
}
export async function getGoalTrend(employeeId: string) {
  const goals = await Goal.find({ employeeId }).lean();
  const values = new Map<string, { total: number; count: number }>();
  for (const goal of goals) {
    const key = goal.cycleId ?? "unassigned";
    const entry = values.get(key) ?? { total: 0, count: 0 };
    entry.total += goal.progress;
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
export async function submitFeedback(input: {
  reviewId: string;
  reviewerEmployeeId: string;
  type: "PEER" | "SUBORDINATE";
  competencyRatings: { competency: string; rating: number }[];
  comments?: string;
}) {
  const doc = await PerformanceFeedback.findOneAndUpdate(
    { reviewId: input.reviewId, reviewerEmployeeId: input.reviewerEmployeeId },
    {
      $set: {
        ...input,
        comments: input.comments ?? null,
        submittedAt: nowIso(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return toApiDoc(doc);
}
export async function getFeedbackSummary(reviewId: string) {
  const feedback = await PerformanceFeedback.find({ reviewId }).lean();
  const ratings = new Map<string, number[]>();
  for (const entry of feedback)
    for (const item of entry.competencyRatings) {
      const values = ratings.get(item.competency) ?? [];
      values.push(item.rating);
      ratings.set(item.competency, values);
    }
  return {
    responseCount: feedback.length,
    competencies: [...ratings].map(([competency, values]) => ({
      competency,
      averageRating:
        Math.round(
          (values.reduce((sum, value) => sum + value, 0) / values.length) * 100,
        ) / 100,
    })),
    comments: feedback.map((entry) => entry.comments).filter(Boolean),
  };
}
export async function getOutcome(reviewId: string) {
  return toApiDoc(await PerformanceOutcome.findOne({ reviewId }).lean());
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
