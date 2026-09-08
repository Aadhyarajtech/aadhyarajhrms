import { useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  CalendarDays,
  LogIn,
  LogOut,
  Sparkles,
  RefreshCw,
} from "lucide-react";

import { AttendanceApi } from "@/lib/endpoints";
import { Card, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/EmptyState";

// ============================================================================
// TYPES
// ============================================================================

type InsightsData = Awaited<
  ReturnType<typeof AttendanceApi.aiInsights>
>;

// ============================================================================
// HELPERS
// ============================================================================

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: string): string {
  if (!date) return "";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AiAttendanceInsights({
  employeeId,
}: {
  employeeId?: string;
}) {
  // --------------------------------------------------------------------------
  // TODAY
  // --------------------------------------------------------------------------

  const today = getToday();

  // --------------------------------------------------------------------------
  // DATE PICKERS
  // --------------------------------------------------------------------------

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // --------------------------------------------------------------------------
  // APPLIED DATE RANGE
  // --------------------------------------------------------------------------

  const [appliedStartDate, setAppliedStartDate] = useState(today);
  const [appliedEndDate, setAppliedEndDate] = useState(today);

  // --------------------------------------------------------------------------
  // DATA
  // --------------------------------------------------------------------------

  const [data, setData] = useState<InsightsData | null>(null);

  // --------------------------------------------------------------------------
  // LOADING / ERROR
  // --------------------------------------------------------------------------

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [dateError, setDateError] = useState("");

  // ==========================================================================
  // LOAD INSIGHTS
  // ==========================================================================

  const loadInsights = async (
    selectedStartDate: string,
    selectedEndDate: string,
  ) => {
    try {
      setError("");
      setIsLoading(true);

      console.log(
        "AI REQUEST DATES:",
        selectedStartDate,
        selectedEndDate,
      );

      console.log(
        "AI REQUEST EMPLOYEE:",
        employeeId ?? "ALL EMPLOYEES",
      );

      const result = await AttendanceApi.aiInsights(
        selectedStartDate,
        selectedEndDate,
        employeeId,
      );

      const insights = (result as any)?.insights ?? result;

      console.log("AI RESPONSE PERIOD:", insights?.period);

      setData(insights);

      // Only update displayed analysis period after successful API response.
      setAppliedStartDate(selectedStartDate);
      setAppliedEndDate(selectedEndDate);
    } catch (err: any) {
      console.error("AI Attendance Insights error:", err);

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load attendance insights.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // INITIAL LOAD
  // ==========================================================================

  useEffect(() => {
    loadInsights(today, today);
  }, [employeeId]);

  // ==========================================================================
  // REFRESH
  // ==========================================================================

  const handleRefreshInsights = async () => {
    setDateError("");
    setError("");

    if (!startDate || !endDate) {
      setDateError("Please select both start date and end date.");
      return;
    }

    if (endDate < startDate) {
      setDateError("End date cannot be before start date.");
      return;
    }

    // IMPORTANT:
    // Send the CURRENT date picker values directly.
    await loadInsights(startDate, endDate);
  };

  // ==========================================================================
  // LOADING
  // ==========================================================================

  if (isLoading && !data) {
    return (
      <Card className="mt-6">
        <div className="p-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Sparkles size={22} className="text-primary" />
              </div>

              <div>
                <h2 className="text-xl font-semibold text-ink">
                  AI Attendance Insights
                </h2>

                <p className="mt-1 text-sm text-ink-faint">
                  Analyzing attendance...
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </div>
      </Card>
    );
  }

  // ==========================================================================
  // ERROR WITHOUT DATA
  // ==========================================================================

  if (error && !data) {
    return (
      <Card className="mt-6">
        <CardHeader
          title="AI Attendance Insights"
          subtitle="Unable to load attendance insights."
        />

        <div className="p-6">
          <p className="mb-4 text-sm text-red-600">
            {error}
          </p>

          <button
            type="button"
            onClick={handleRefreshInsights}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={isLoading ? "animate-spin" : ""}
            />

            {isLoading ? "Refreshing..." : "Try Again"}
          </button>
        </div>
      </Card>
    );
  }

  // ==========================================================================
  // SAFETY
  // ==========================================================================

  if (!data) {
    return null;
  }

  // ==========================================================================
  // DISPLAY PERIOD
  // ==========================================================================

  const isSingleDay =
    appliedStartDate === appliedEndDate;

  const periodText = isSingleDay
    ? formatDate(appliedStartDate)
    : `${formatDate(appliedStartDate)} - ${formatDate(
        appliedEndDate,
      )}`;

  // ==========================================================================
  // TREND ICON
  // ==========================================================================

  const trendIcon =
    data.trend.direction === "IMPROVING" ? (
      <TrendingUp size={20} />
    ) : data.trend.direction === "DECLINING" ? (
      <TrendingDown size={20} />
    ) : (
      <Minus size={20} />
    );

  // ==========================================================================
  // UI
  // ==========================================================================

  return (
    <div className="mt-6 space-y-6">
      {/* ====================================================================
          HEADER + CALENDAR + REFRESH
      ==================================================================== */}

      <Card>
        <div className="p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            {/* LEFT - AI TITLE */}

            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-purple-100">
                <Sparkles
                  size={27}
                  className="text-purple-600"
                />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-ink">
                    AI Attendance Insights
                  </h2>

                  <Sparkles
                    size={18}
                    className="text-purple-500"
                  />
                </div>

                <p className="mt-1 text-sm text-ink-faint">
                  Attendance analysis for your selected period
                </p>
              </div>
            </div>

            {/* RIGHT - CALENDAR + REFRESH */}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              {/* START DATE */}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-faint">
                  From
                </label>

                <div className="relative">
                  <CalendarDays
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                  />

                  <input
                    type="date"
                    value={startDate}
                    max={endDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setDateError("");
                    }}
                    className="h-11 rounded-xl border border-line bg-white pl-9 pr-3 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                </div>
              </div>

              {/* END DATE */}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-faint">
                  To
                </label>

                <div className="relative">
                  <CalendarDays
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                  />

                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setDateError("");
                    }}
                    className="h-11 rounded-xl border border-line bg-white pl-9 pr-3 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                </div>
              </div>

              {/* REFRESH */}

              <button
                type="button"
                onClick={handleRefreshInsights}
                disabled={isLoading}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 text-sm font-medium text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={17}
                  className={
                    isLoading
                      ? "animate-spin"
                      : ""
                  }
                />

                {isLoading
                  ? "Refreshing..."
                  : "Refresh"}
              </button>
            </div>
          </div>

          {/* DATE ERROR */}

          {dateError && (
            <p className="mt-3 text-sm text-red-600">
              {dateError}
            </p>
          )}

          {/* SELECTED PERIOD */}

          <div className="mt-5 flex items-center gap-2 rounded-xl bg-surface px-4 py-3">
            <CalendarDays
              size={16}
              className="text-ink-faint"
            />

            <div>
              <p className="text-xs text-ink-faint">
                Analysis Period
              </p>

              <p className="text-sm font-medium text-ink">
                {periodText}
              </p>
            </div>
          </div>

          {/* API ERROR */}

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">
                {error}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* ====================================================================
          TOP CARDS
      ==================================================================== */}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <InsightCard
          icon={<CheckCircle2 size={20} />}
          title="Attendance Score"
          value={`${data.summary.attendanceRate}%`}
          description={`${data.summary.presentDays} present day(s)`}
        />

        <InsightCard
          icon={<Clock size={20} />}
          title="Avg Working Hours"
          value={`${data.summary.averageWorkHours}h`}
          description="Per recorded working day"
        />

        <InsightCard
          icon={trendIcon}
          title="Attendance Trend"
          value={data.trend.direction}
          description={
            data.trend.change === 0
              ? "No significant change"
              : `${Math.abs(
                  data.trend.change,
                )} percentage point change`
          }
        />
      </div>

      {/* ====================================================================
          ATTENDANCE DETAILS
      ==================================================================== */}

      <Card>
        <CardHeader
          title="Attendance Details"
          subtitle={`Attendance recorded during ${periodText}`}
        />

        <div className="grid grid-cols-2 gap-4 p-6 md:grid-cols-5">
          <DetailItem
            label="Present"
            value={data.summary.presentDays}
          />

          <DetailItem
            label="Work From Home"
            value={data.summary.wfhDays}
          />

          <DetailItem
            label="Half Day"
            value={data.summary.halfDays}
          />

          <DetailItem
            label="Leave"
            value={data.summary.leaveDays}
          />

          <DetailItem
            label="Absent"
            value={data.summary.absentDays}
          />
        </div>
      </Card>

      {/* ====================================================================
          TIMING
      ==================================================================== */}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TimingCard
          icon={<LogIn size={18} />}
          title="Late Check-ins"
          value={`${data.timing.lateCheckInRate}%`}
          description={`${data.timing.lateCheckIns} late check-in(s)`}
        />

        <TimingCard
          icon={<LogOut size={18} />}
          title="Early Check-outs"
          value={`${data.timing.earlyCheckoutRate}%`}
          description={`${data.timing.earlyCheckOuts} early checkout(s)`}
        />

        <TimingCard
          icon={<Clock size={18} />}
          title="Missing Check-outs"
          value={data.timing.missingCheckoutDays}
          description="Working day(s)"
        />
      </div>

      {/* ====================================================================
          PATTERNS
      ==================================================================== */}

      <Card>
        <CardHeader
          title="AI Detected Patterns"
          subtitle="Patterns identified from the selected attendance data"
        />

        <div className="space-y-3 p-6">
          {data.patterns.length === 0 ? (
            <div className="rounded-xl border border-line/60 p-4 text-sm text-ink-faint">
              No specific patterns were detected for this period.
            </div>
          ) : (
            data.patterns.map((pattern, index) => (
              <div
                key={`${pattern.title}-${index}`}
                className="flex gap-3 rounded-xl border border-line/60 p-4"
              >
                <PatternIcon type={pattern.type} />

                <div>
                  <p className="text-sm font-medium text-ink">
                    {pattern.title}
                  </p>

                  <p className="mt-1 text-sm leading-6 text-ink-faint">
                    {pattern.description}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* ====================================================================
          RECOMMENDATIONS
      ==================================================================== */}

      <Card>
        <CardHeader
          title="AI Recommendations"
          subtitle="Suggestions based on your selected attendance period"
        />

        <div className="space-y-3 p-6">
          {data.recommendations.map(
            (recommendation, index) => (
              <div
                key={index}
                className="flex gap-3 rounded-xl bg-surface p-4"
              >
                <Sparkles
                  size={17}
                  className="mt-0.5 shrink-0 text-primary"
                />

                <p className="text-sm leading-6 text-ink">
                  {recommendation}
                </p>
              </div>
            ),
          )}
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// INSIGHT CARD
// ============================================================================

function InsightCard({
  icon,
  title,
  value,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>

        <p className="text-sm font-medium text-ink-faint">
          {title}
        </p>
      </div>

      <p className="mt-5 text-2xl font-semibold text-ink">
        {value}
      </p>

      <p className="mt-1 text-xs text-ink-faint">
        {description}
      </p>
    </Card>
  );
}

// ============================================================================
// DETAIL ITEM
// ============================================================================

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-surface p-4">
      <p className="text-xs text-ink-faint">
        {label}
      </p>

      <p className="mt-2 text-xl font-semibold text-ink">
        {value}
      </p>
    </div>
  );
}

// ============================================================================
// TIMING CARD
// ============================================================================

function TimingCard({
  icon,
  title,
  value,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  description: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-ink-faint">
        {icon}

        <p className="text-sm font-medium">
          {title}
        </p>
      </div>

      <p className="mt-4 text-2xl font-semibold text-ink">
        {value}
      </p>

      <p className="mt-1 text-xs text-ink-faint">
        {description}
      </p>
    </Card>
  );
}

// ============================================================================
// PATTERN ICON
// ============================================================================

function PatternIcon({
  type,
}: {
  type: "POSITIVE" | "WARNING" | "INFO";
}) {
  if (type === "POSITIVE") {
    return (
      <CheckCircle2
        size={19}
        className="mt-0.5 shrink-0 text-green-600"
      />
    );
  }

  if (type === "WARNING") {
    return (
      <AlertTriangle
        size={19}
        className="mt-0.5 shrink-0 text-amber-600"
      />
    );
  }

  return (
    <Info
      size={19}
      className="mt-0.5 shrink-0 text-blue-600"
    />
  );
}