import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  RefreshCw,
  AlertCircle,
  BarChart3,
} from "lucide-react";

import { AttendanceApi } from "@/lib/endpoints";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function AiAttendanceForecast({
  employeeId,
}: {
  employeeId?: string;
}) {
  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: [
      "attendance-ai-forecast",
      employeeId,
    ],

    queryFn: () =>
      AttendanceApi.aiForecast(
        6,
        employeeId,
      ),

    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Card className="mt-6">
        <div className="flex flex-col items-center justify-center py-12">
          <RefreshCw className="mb-3 h-7 w-7 animate-spin text-purple-600" />

          <p className="text-sm text-ink-faint">
            Generating attendance forecast...
          </p>
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="mt-6">
        <div className="flex flex-col items-center justify-center py-10">
          <AlertCircle className="mb-3 h-7 w-7 text-red-500" />

          <p className="mb-4 text-sm text-ink-faint">
            Unable to load attendance forecast.
          </p>

          <Button
            variant="outline"
            onClick={() => refetch()}
          >
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  const trend = data.forecast.direction;

  const TrendIcon =
    trend === "IMPROVING"
      ? TrendingUp
      : trend === "DECLINING"
        ? TrendingDown
        : Minus;

  const trendText =
    trend === "IMPROVING"
      ? "Improving"
      : trend === "DECLINING"
        ? "Declining"
        : "Stable";

  const historicalData = data.historicalData || [];

  const maxRate = Math.max(
    ...historicalData.map((item: any) => item.attendanceRate),
    data.forecast.predictedAttendanceRate,
    100,
  );

  const minRate = Math.min(
    ...historicalData.map((item: any) => item.attendanceRate),
    data.forecast.predictedAttendanceRate,
    0,
  );

  const chartHeight = 220;
  const chartWidth = 800;

  const getX = (index: number) => {
    if (historicalData.length <= 1) {
      return chartWidth / 2;
    }

    return (
      40 +
      (index / (historicalData.length - 1)) *
        (chartWidth - 80)
    );
  };

  const getY = (rate: number) => {
    const range = maxRate - minRate || 1;

    return (
      20 +
      ((maxRate - rate) / range) *
        (chartHeight - 45)
    );
  };

  const points = historicalData
    .map(
      (item: any, index: number) =>
        `${getX(index)},${getY(item.attendanceRate)}`,
    )
    .join(" ");

  const latestRate =
    historicalData.length > 0
      ? historicalData[historicalData.length - 1]
          .attendanceRate
      : 0;

  const predictedRate =
    data.forecast.predictedAttendanceRate;

  const pieStyle = {
    background: `conic-gradient(
      #9333ea 0% ${predictedRate}%,
      #ede9fe ${predictedRate}% 100%
    )`,
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Header */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>

              <div>
                <h2 className="font-display text-xl font-medium text-ink">
                  AI Attendance Forecast
                </h2>

                <p className="text-sm text-ink-faint">
                  Predictive attendance analysis based on historical trends
                </p>
              </div>
            </div>
          </div>

          <Button
  variant="outline"
  onClick={() => refetch()}
  disabled={isFetching}
>
  <RefreshCw
    className={`mr-2 h-4 w-4 ${
      isFetching ? "animate-spin" : ""
    }`}
  />

  {isFetching ? "Refreshing..." : "Refresh"}
</Button>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Average */}
        <Card hoverable>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-ink-faint">
                Average Attendance
              </p>

              <p className="mt-2 text-3xl font-semibold text-ink">
                {data.summary.averageAttendanceRate}%
              </p>

              <p className="mt-1 text-xs text-ink-faint">
                Historical average
              </p>
            </div>

            <div className="rounded-2xl bg-purple-100 p-3">
              <BarChart3 className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </Card>

        {/* Forecast */}
        <Card hoverable>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-ink-faint">
                Predicted Attendance
              </p>

              <p className="mt-2 text-3xl font-semibold text-purple-600">
                {predictedRate}%
              </p>

              <p className="mt-1 text-xs text-ink-faint">
                Forecasted rate
              </p>
            </div>

            <div className="rounded-2xl bg-purple-100 p-3">
              <Target className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </Card>

        {/* Trend */}
        <Card hoverable>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-ink-faint">
                Attendance Trend
              </p>

              <p className="mt-2 text-2xl font-semibold text-ink">
                {trendText}
              </p>

              <p className="mt-1 text-xs text-ink-faint">
                Based on recent months
              </p>
            </div>

            <div className="rounded-2xl bg-purple-100 p-3">
              <TrendIcon className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </Card>

        {/* Confidence */}
        <Card hoverable>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-ink-faint">
                Forecast Confidence
              </p>

              <p className="mt-2 text-2xl font-semibold text-ink">
                {data.forecast.confidence}
              </p>

              <p className="mt-1 text-xs text-ink-faint">
                Prediction reliability
              </p>
            </div>

            <div className="rounded-2xl bg-purple-100 p-3">
              <Brain className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Attendance Trend Graph */}
      <Card>
        <CardHeader
          title="Attendance Trend"
          subtitle="Historical attendance performance"
        />

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[650px]">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="h-auto w-full"
              preserveAspectRatio="none"
            >
              {/* Horizontal grid lines */}
              {[0, 25, 50, 75, 100].map((value) => {
                const y = getY(value);

                return (
                  <g key={value}>
                    <line
                      x1="40"
                      y1={y}
                      x2={chartWidth - 40}
                      y2={y}
                      stroke="currentColor"
                      className="text-line"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                      opacity="0.7"
                    />

                    <text
                      x="5"
                      y={y + 4}
                      fontSize="11"
                      className="fill-ink-faint"
                    >
                      {value}%
                    </text>
                  </g>
                );
              })}

              {/* Trend line */}
              {historicalData.length > 1 && (
                <polyline
                  points={points}
                  fill="none"
                  stroke="currentColor"
                  className="text-purple-600"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data points */}
              {historicalData.map(
                (item: any, index: number) => (
                  <g key={item.month}>
                    <circle
                      cx={getX(index)}
                      cy={getY(item.attendanceRate)}
                      r="6"
                      fill="currentColor"
                      className="text-purple-600"
                    />

                    <text
                      x={getX(index)}
                      y={chartHeight - 5}
                      textAnchor="middle"
                      fontSize="11"
                      className="fill-ink-faint"
                    >
                      {item.month}
                    </text>
                  </g>
                ),
              )}
            </svg>
          </div>
        </div>

        {/* Forecast indicator */}
        <div className="mt-5 rounded-2xl bg-purple-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-purple-900">
                Next Period Prediction
              </p>

              <p className="mt-1 text-xs text-purple-700">
                AI predicts an attendance rate of{" "}
                <strong>{predictedRate}%</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm font-semibold text-purple-700">
              <TrendIcon className="h-4 w-4" />
              {trendText}
            </div>
          </div>
        </div>
      </Card>

      {/* Forecast Donut */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Predicted Attendance"
            subtitle="Visual representation of forecasted attendance"
          />

          <div className="flex flex-col items-center justify-center py-6">
            <div
              className="relative flex h-48 w-48 items-center justify-center rounded-full"
              style={pieStyle}
            >
              <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white">
                <span className="text-3xl font-semibold text-ink">
                  {predictedRate}%
                </span>

                <span className="text-xs text-ink-faint">
                  Predicted
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-5 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-purple-600" />
                Predicted attendance
              </div>

              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-purple-100" />
                Remaining
              </div>
            </div>
          </div>
        </Card>

        {/* Forecast Details */}
        <Card>
          <CardHeader
            title="Forecast Details"
            subtitle="Key information behind the prediction"
          />

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl bg-surface p-4">
              <span className="text-sm text-ink-faint">
                Latest attendance
              </span>

              <span className="font-semibold text-ink">
                {latestRate}%
              </span>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-surface p-4">
              <span className="text-sm text-ink-faint">
                Historical average
              </span>

              <span className="font-semibold text-ink">
                {data.summary.averageAttendanceRate}%
              </span>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-surface p-4">
              <span className="text-sm text-ink-faint">
                Best month
              </span>

              <span className="font-semibold text-ink">
                {data.summary.bestMonth || "N/A"}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-surface p-4">
              <span className="text-sm text-ink-faint">
                Lowest month
              </span>

              <span className="font-semibold text-ink">
                {data.summary.lowestMonth || "N/A"}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-surface p-4">
              <span className="text-sm text-ink-faint">
                Confidence
              </span>

              <span className="font-semibold text-purple-600">
                {data.forecast.confidence}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* AI Analysis */}
      <Card>
        <div className="rounded-2xl bg-purple-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
              <Brain className="h-5 w-5 text-purple-600" />
            </div>

            <div>
              <h3 className="font-semibold text-purple-900">
                AI Forecast Analysis
              </h3>

              <p className="text-xs text-purple-700">
                AI-generated interpretation of attendance trends
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <p className="mb-1 text-sm font-medium text-purple-900">
                Forecast Summary
              </p>

              <p className="text-sm leading-6 text-purple-800">
                {data.ai?.summary ||
                  "No AI summary is currently available."}
              </p>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-purple-900">
                Recommendation
              </p>

              <p className="text-sm leading-6 text-purple-800">
                {data.ai?.recommendation ||
                  "No recommendation is currently available."}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}