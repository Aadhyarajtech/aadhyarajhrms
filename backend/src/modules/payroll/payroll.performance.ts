import { Goal, PerformanceCycle } from "@/db/models";

/**
 * Returns the employee's KPI achievement percentage for payroll.
 * KPI goals use target/current values as the source of truth; legacy goals
 * without those values fall back to their stored progress.
 *
 * null means that no usable KPI goals exist, allowing payroll to preserve the
 * existing configured bonus instead of inventing a performance score.
 */
export async function getKpiAchievementPercentage(
  employeeId: string,
): Promise<number | null> {
  const activeCycle = await PerformanceCycle.findOne({ isActive: true })
    .sort({ startDate: -1 })
    .select("_id")
    .lean();

  const query: Record<string, unknown> = { employeeId };
  if (activeCycle?._id) query.cycleId = activeCycle._id;

  let goals = await Goal.find(query)
    .select("targetValue currentValue progress")
    .lean();

  // If there is no active-cycle KPI data, use the employee's available goals.
  // This keeps payroll useful for installations that do not create cycles.
  if (goals.length === 0 && activeCycle?._id) {
    goals = await Goal.find({ employeeId })
      .select("targetValue currentValue progress")
      .lean();
  }

  const achievements = goals
    .map((goal: any) => {
      const target = Number(goal.targetValue);
      const current = Number(goal.currentValue);
      if (Number.isFinite(target) && target > 0 && Number.isFinite(current)) {
        return Math.min(100, Math.max(0, (current / target) * 100));
      }
      const progress = Number(goal.progress);
      return Number.isFinite(progress)
        ? Math.min(100, Math.max(0, progress))
        : null;
    })
    .filter((value): value is number => value !== null);

  if (achievements.length === 0) return null;
  return (
    Math.round(
      (achievements.reduce((sum, value) => sum + value, 0) /
        achievements.length) *
        100,
    ) / 100
  );
}
