import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  RefreshCw,
  Sparkles,
  Clock,
  LogOut,
  TrendingDown,
  UserX,
  Moon,
} from "lucide-react";

import { AttendanceApi } from "../../lib/endpoints";
import { Card, Button } from "../ui";

type Anomaly = {
  id: string;
  type: string;
  severity: "low" | "medium" | "high";
  date?: string;
  title: string;
  description: string;
};

type AnomalyResponse = {
  period: {
    startDate: string;
    endDate: string;
  };
  anomalies: Anomaly[];
  summary: {
    totalAnomalies: number;
    high: number;
    medium: number;
    low: number;
  };
  ai?: {
    summary?: string;
    recommendation?: string;
  };
};

export default function AiAttendanceAnomaly({
  employeeId,
}: {
  employeeId?: string;
}) {
  const today = new Date();

  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());

  const [data, setData] = useState<AnomalyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAnomalies = async () => {
    try {
      setIsLoading(true);
      setError("");

      console.log("AI ANOMALY REQUEST:", {
        month,
        year,
        employeeId: employeeId ?? "ALL EMPLOYEES",
      });

      const response = await AttendanceApi.aiAnomalies(
        month,
        year,
        employeeId,
      );

      console.log("AI ANOMALY RESPONSE:", response);

      setData(response);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load attendance anomalies.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnomalies();
  }, [month, year, employeeId]);

  const getSeverityClasses = (severity: Anomaly["severity"]) => {
    switch (severity) {
      case "high":
        return "bg-red-50 text-red-600 border-red-200";

      case "medium":
        return "bg-orange-50 text-orange-600 border-orange-200";

      default:
        return "bg-yellow-50 text-yellow-600 border-yellow-200";
    }
  };

  const getAnomalyIcon = (type: string) => {
    const value = type.toLowerCase();

    if (value.includes("late")) {
      return <Clock className="h-5 w-5" />;
    }

    if (value.includes("checkout")) {
      return <LogOut className="h-5 w-5" />;
    }

    if (value.includes("absence")) {
      return <UserX className="h-5 w-5" />;
    }

    if (value.includes("decline")) {
      return <TrendingDown className="h-5 w-5" />;
    }

    if (value.includes("working")) {
      return <Moon className="h-5 w-5" />;
    }

    return <AlertTriangle className="h-5 w-5" />;
  };

  return (
    <Card className="mt-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
            <Sparkles className="h-5 w-5 text-purple-600" />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              AI Attendance Anomaly Detection
            </h2>

            <p className="text-sm text-gray-500">
              Detect unusual attendance patterns automatically
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Month */}
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-purple-400"
            >
              {[
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December",
              ].map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Year */}
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-400"
          >
            {Array.from({ length: 5 }, (_, index) => {
              const value = today.getFullYear() - index;

              return (
                <option key={value} value={value}>
                  {value}
                </option>
              );
            })}
          </select>

          <Button
            type="button"
            onClick={loadAnomalies}
            disabled={isLoading}
            className="gap-2 bg-purple-600 text-white hover:bg-purple-700"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {isLoading ? (
          <div className="flex min-h-[180px] items-center justify-center">
            <div className="text-center">
              <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-purple-600" />
              <p className="text-sm text-gray-500">
                Analyzing your attendance...
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        ) : !data || data.anomalies.length === 0 ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Sparkles className="h-6 w-6 text-green-600" />
            </div>

            <h3 className="font-medium text-gray-900">
              No attendance anomalies detected
            </h3>

            <p className="mt-1 max-w-md text-sm text-gray-500">
              Your attendance records look consistent for the selected period.
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs text-gray-500">Total Anomalies</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">
                  {data.summary.totalAnomalies}
                </p>
              </div>

              <div className="rounded-xl bg-red-50 p-4">
                <p className="text-xs text-red-600">High</p>
                <p className="mt-1 text-2xl font-semibold text-red-700">
                  {data.summary.high}
                </p>
              </div>

              <div className="rounded-xl bg-orange-50 p-4">
                <p className="text-xs text-orange-600">Medium</p>
                <p className="mt-1 text-2xl font-semibold text-orange-700">
                  {data.summary.medium}
                </p>
              </div>

              <div className="rounded-xl bg-yellow-50 p-4">
                <p className="text-xs text-yellow-600">Low</p>
                <p className="mt-1 text-2xl font-semibold text-yellow-700">
                  {data.summary.low}
                </p>
              </div>
            </div>

            {/* AI Explanation */}
            {data.ai && (
              <div className="mb-5 rounded-xl border border-purple-200 bg-purple-50 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-purple-600" />

                  <div>
                    <h3 className="font-medium text-purple-900">
                      AI Analysis
                    </h3>

                    {data.ai.summary && (
                      <p className="mt-1 text-sm leading-6 text-purple-800">
                        {data.ai.summary}
                      </p>
                    )}

                    {data.ai.recommendation && (
                      <p className="mt-2 text-sm leading-6 text-purple-800">
                        <span className="font-medium">Recommendation:</span>{" "}
                        {data.ai.recommendation}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Anomalies */}
            <div className="space-y-3">
              {data.anomalies.map((anomaly) => (
                <div
                  key={anomaly.id}
                  className="rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${getSeverityClasses(
                        anomaly.severity,
                      )}`}
                    >
                      {getAnomalyIcon(anomaly.type)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-gray-900">
                          {anomaly.title}
                        </h3>

                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getSeverityClasses(
                            anomaly.severity,
                          )}`}
                        >
                          {anomaly.severity}
                        </span>
                      </div>

                      {anomaly.date && (
                        <p className="mt-1 text-xs text-gray-400">
                          {new Date(anomaly.date).toLocaleDateString()}
                        </p>
                      )}

                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        {anomaly.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}