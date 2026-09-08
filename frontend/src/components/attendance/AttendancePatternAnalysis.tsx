import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarDays,
  Clock3,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
} from "lucide-react";

import { AttendanceApi } from "@/lib/endpoints";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type WeekdayData = {
  day: string;
  totalDays: number;
  attendedEquivalent: number;
  attendanceRate: number;
  averageCheckInMinutes: number | null;
  averageWorkHours: number | null;
};

type Pattern = {
  type: "POSITIVE" | "WARNING" | "INFO";
  title: string;
  description: string;
};

type PatternResult = {
  period: {
    start: string;
    end: string;
    months: number;
  };
  summary: {
    attendanceRate: number;
    recent30DayRate: number;
    strongestDay: string | null;
    weakestDay: string | null;
  };
  weekdayAnalysis: WeekdayData[];
  variations: {
    attendancePercentagePoints: number;
    checkInMinutes: number;
    workHours: number;
  };
  patterns: Pattern[];
  recommendations: string[];
};

function formatTime(minutes: number | null) {
  if (minutes === null) return "--";

  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour =
    hour % 12 === 0 ? 12 : hour % 12;

  return `${displayHour}:${String(minute).padStart(
    2,
    "0",
  )} ${period}`;
}

function formatDate(date: string) {
  if (!date) return "";

  const value = new Date(`${date}T00:00:00`);

  return value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getPatternIcon(type: Pattern["type"]) {
  if (type === "POSITIVE") {
    return <TrendingUp size={18} />;
  }

  if (type === "WARNING") {
    return <TrendingDown size={18} />;
  }

  return <Activity size={18} />;
}

export default function AttendancePatternAnalysis({
  employeeId,
}: {
  employeeId?: string;
}) {
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<PatternResult>({
    queryKey: [
      "attendance-patterns",
      employeeId,
    ],

    queryFn: () =>
      AttendanceApi.aiPatterns(
        6,
        employeeId,
      ),

    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Card className="mt-6">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" />

            <div className="space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-64 animate-pulse rounded bg-gray-100" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="h-28 animate-pulse rounded-xl bg-gray-100"
              />
            ))}
          </div>

          <div className="mt-6 h-72 animate-pulse rounded-xl bg-gray-100" />
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="mt-6">
        <div className="p-6">
          <CardHeader
            title="Attendance Pattern Analysis"
            subtitle="Unable to load your attendance patterns."
          />

          <div className="mt-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">
              Something went wrong while analyzing your
              attendance pattern.
            </p>

            <Button
              type="button"
              variant="secondary"
              onClick={() => refetch()}
            >
              <RefreshCw size={16} className="mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const weekdays = data.weekdayAnalysis;

  const maxAttendance = Math.max(
    ...weekdays.map(
      (item) => item.attendanceRate,
    ),
    100,
  );

  const trend =
    data.summary.recent30DayRate -
    data.summary.attendanceRate;

  return (
    <Card className="mt-6">
      <div className="p-6">
        <CardHeader
          title="Attendance Pattern Analysis"
          subtitle={`Recurring attendance behavior from ${formatDate(
            data.period.start,
          )} to ${formatDate(data.period.end)}`}
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                size={16}
                className={`mr-2 ${
                  isFetching
                    ? "animate-spin"
                    : ""
                }`}
              />

              {isFetching
                ? "Refreshing..."
                : "Refresh"}
            </Button>
          }
        />

        {/* =============================================================== */}
        {/* SUMMARY CARDS */}
        {/* =============================================================== */}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Overall Attendance
                </p>

                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {data.summary.attendanceRate}%
                </p>
              </div>

              <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
                <Activity size={22} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Recent 30 Days
                </p>

                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {data.summary.recent30DayRate}%
                </p>

                <div className="mt-1 flex items-center gap-1 text-xs">
                  {trend > 0 ? (
                    <>
                      <TrendingUp size={13} />
                      Improving
                    </>
                  ) : trend < 0 ? (
                    <>
                      <TrendingDown size={13} />
                      Lower
                    </>
                  ) : (
                    <>
                      <Minus size={13} />
                      Stable
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-green-50 p-3 text-green-600">
                <CalendarDays size={22} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Strongest Day
                </p>

                <p className="mt-2 text-xl font-bold text-gray-900">
                  {data.summary.strongestDay ??
                    "--"}
                </p>
              </div>

              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
                <TrendingUp size={22} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Weakest Day
                </p>

                <p className="mt-2 text-xl font-bold text-gray-900">
                  {data.summary.weakestDay ??
                    "--"}
                </p>
              </div>

              <div className="rounded-xl bg-orange-50 p-3 text-orange-600">
                <TrendingDown size={22} />
              </div>
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* WEEKDAY ATTENDANCE GRAPH */}
        {/* =============================================================== */}

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-6">
            <h3 className="text-base font-semibold text-gray-900">
              Weekday Attendance Pattern
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Compare your attendance consistency across
              different weekdays.
            </p>
          </div>

          <div className="space-y-5">
            {weekdays.map((item) => (
              <div key={item.day}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="w-24 text-sm font-medium text-gray-700">
                    {item.day}
                  </span>

                  <span className="text-sm font-semibold text-gray-900">
                    {item.totalDays > 0
                      ? `${item.attendanceRate}%`
                      : "--"}
                  </span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-current text-blue-500 transition-all duration-500"
                    style={{
                      width:
                        item.totalDays > 0
                          ? `${Math.min(
                              (item.attendanceRate /
                                maxAttendance) *
                                100,
                              100,
                            )}%`
                          : "0%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* =============================================================== */}
        {/* CHECK-IN + WORK HOURS */}
        {/* =============================================================== */}

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-purple-50 p-3 text-purple-600">
                <Clock3 size={21} />
              </div>

              <div>
                <h3 className="font-semibold text-gray-900">
                  Average Check-in Time
                </h3>

                <p className="text-sm text-gray-500">
                  Your typical check-in by weekday.
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {weekdays.map((item) => (
                <div
                  key={item.day}
                  className="rounded-xl bg-gray-50 p-3 text-center"
                >
                  <p className="text-xs text-gray-500">
                    {item.day.slice(0, 3)}
                  </p>

                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {formatTime(
                      item.averageCheckInMinutes,
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
                <Activity size={21} />
              </div>

              <div>
                <h3 className="font-semibold text-gray-900">
                  Average Working Hours
                </h3>

                <p className="text-sm text-gray-500">
                  Recorded working hours by weekday.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {weekdays.map((item) => {
                const hours =
                  item.averageWorkHours ?? 0;

                return (
                  <div key={item.day}>
                    <div className="mb-1 flex justify-between">
                      <span className="text-sm text-gray-600">
                        {item.day}
                      </span>

                      <span className="text-sm font-semibold text-gray-900">
                        {item.averageWorkHours !== null
                          ? `${item.averageWorkHours}h`
                          : "--"}
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-current text-indigo-500"
                        style={{
                          width: `${Math.min(
                            (hours / 10) * 100,
                            100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* VARIATIONS */}
        {/* =============================================================== */}

        <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <h3 className="font-semibold text-gray-900">
            Pattern Variations
          </h3>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-gray-500">
                Attendance variation
              </p>

              <p className="mt-2 text-2xl font-bold text-gray-900">
                {
                  data.variations
                    .attendancePercentagePoints
                }
                <span className="ml-1 text-sm font-normal">
                  pp
                </span>
              </p>
            </div>

            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-gray-500">
                Check-in variation
              </p>

              <p className="mt-2 text-2xl font-bold text-gray-900">
                {data.variations.checkInMinutes}
                <span className="ml-1 text-sm font-normal">
                  min
                </span>
              </p>
            </div>

            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-gray-500">
                Work-hour variation
              </p>

              <p className="mt-2 text-2xl font-bold text-gray-900">
                {data.variations.workHours}
                <span className="ml-1 text-sm font-normal">
                  hrs
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* DETECTED PATTERNS */}
        {/* =============================================================== */}

        {data.patterns.length > 0 && (
          <div className="mt-6">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles size={19} />

              <h3 className="font-semibold text-gray-900">
                Detected Patterns
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {data.patterns.map(
                (pattern, index) => (
                  <div
                    key={`${pattern.title}-${index}`}
                    className="rounded-2xl border border-gray-200 bg-white p-5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-gray-50 p-2">
                        {getPatternIcon(
                          pattern.type,
                        )}
                      </div>

                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {pattern.title}
                        </h4>

                        <p className="mt-1 text-sm leading-6 text-gray-600">
                          {pattern.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* RECOMMENDATIONS */}
        {/* =============================================================== */}

        {data.recommendations.length > 0 && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Sparkles size={19} />

              <h3 className="font-semibold text-gray-900">
                Recommendations
              </h3>
            </div>

            <div className="mt-4 space-y-3">
              {data.recommendations.map(
                (
                  recommendation,
                  index,
                ) => (
                  <div
                    key={index}
                    className="flex gap-3 rounded-xl bg-gray-50 p-4"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      {index + 1}
                    </span>

                    <p className="text-sm leading-6 text-gray-700">
                      {recommendation}
                    </p>
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}