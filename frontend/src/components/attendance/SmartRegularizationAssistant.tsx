import { useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { AttendanceApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Field";

type AttendanceData = {
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  workHours?: number | null;
  isRegularized?: boolean;
  note?: string | null;
};

type RegularizationAnalysis = {
  date: string;
  eligible: boolean;
  issue: string;
  suggestion: string | null;
  attendance?: AttendanceData | null;
};

function formatTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SmartRegularizationAssistant({
  employeeId,
}: {
  employeeId?: string;
}) {
  const { showToast } = useToast();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [analysis, setAnalysis] = useState<RegularizationAnalysis | null>(null);

  const [reason, setReason] = useState("");

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const analyzeAttendance = async () => {
    if (!date) {
      showToast("Please select an attendance date.", "error");
      return;
    }

    try {
      setLoading(true);
      setAnalysis(null);
      setReason("");

      const result = await AttendanceApi.smartRegularization(date, employeeId);

      setAnalysis(result);

      if (result.suggestion) {
        setReason(result.suggestion);
      }
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  const submitRegularization = async () => {
    if (!date) {
      showToast("Please select an attendance date.", "error");
      return;
    }

    if (!reason.trim()) {
      showToast("Please provide a regularization reason.", "error");
      return;
    }

    try {
      setSubmitting(true);

      await AttendanceApi.regularize(date, reason.trim());

      showToast("Regularization request submitted successfully.");

      setAnalysis(null);
      setReason("");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader
        title="Smart Regularization Assistant"
        subtitle="Analyze an attendance issue and prepare a regularization request."
      />

      <div className="mt-6 space-y-6">
        {/* ============================================================= */}
        {/* DATE SELECTION */}
        {/* ============================================================= */}

        <div className="rounded-2xl border border-line/60 bg-gray-50 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-purple-100 p-3 text-purple-600">
              <CalendarDays size={20} />
            </div>

            <div>
              <h3 className="font-semibold text-ink">Select Attendance Date</h3>

              <p className="text-sm text-ink-faint">
                Choose the date you want to review.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-full sm:max-w-xs">
              <label className="mb-1.5 block text-[13px] font-medium text-ink-soft">
                Attendance date
              </label>

              <input
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setAnalysis(null);
                  setReason("");
                }}
                className="h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <Button
              type="button"
              onClick={analyzeAttendance}
              disabled={loading || !date}
              leftIcon={
                loading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )
              }
            >
              {loading ? "Analyzing..." : "Analyze Attendance"}
            </Button>
          </div>
        </div>

        {/* ============================================================= */}
        {/* ANALYSIS RESULT */}
        {/* ============================================================= */}

        {analysis && (
          <div className="space-y-5">
            {/* Date + Issue */}
            <div
              className={`rounded-2xl border p-5 ${
                analysis.eligible
                  ? "border-warning-200 bg-warning-50/50"
                  : "border-line bg-gray-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`rounded-xl p-3 ${
                    analysis.eligible
                      ? "bg-warning-100 text-warning-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {analysis.eligible ? (
                    <AlertCircle size={20} />
                  ) : (
                    <CheckCircle2 size={20} />
                  )}
                </div>

                <div className="flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                    {formatDate(analysis.date)}
                  </p>

                  <h3 className="mt-1 font-semibold text-ink">
                    {analysis.eligible
                      ? "Attendance issue detected"
                      : "Regularization not required"}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-ink-soft">
                    {analysis.issue}
                  </p>
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* ATTENDANCE DETAILS */}
            {/* ========================================================= */}

            {analysis.attendance && (
              <div className="rounded-2xl border border-line/60 bg-white p-5">
                <div className="flex items-center gap-2">
                  <Clock3 size={18} className="text-brand-600" />

                  <h3 className="font-semibold text-ink">Attendance Details</h3>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs text-ink-faint">Status</p>

                    <p className="mt-1 font-semibold text-ink">
                      {analysis.attendance.status}
                    </p>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs text-ink-faint">Check-in</p>

                    <p className="mt-1 font-semibold text-ink">
                      {formatTime(analysis.attendance.checkIn)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs text-ink-faint">Check-out</p>

                    <p className="mt-1 font-semibold text-ink">
                      {formatTime(analysis.attendance.checkOut)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs text-ink-faint">Work Hours</p>

                    <p className="mt-1 font-semibold text-ink">
                      {analysis.attendance.workHours !== null &&
                      analysis.attendance.workHours !== undefined
                        ? `${analysis.attendance.workHours}h`
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* SUGGESTED REASON */}
            {/* ========================================================= */}

            {analysis.eligible && analysis.suggestion && (
              <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-purple-100 p-3 text-purple-600">
                    <Sparkles size={20} />
                  </div>

                  <div className="flex-1">
                    <h3 className="font-semibold text-ink">
                      Suggested Regularization Reason
                    </h3>

                    <p className="mt-1 text-sm text-ink-faint">
                      Review and edit the suggested reason before submitting.
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <TextareaField
                    label="Reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Enter your regularization reason..."
                    rows={4}
                    maxLength={1000}
                  />
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setReason(analysis.suggestion ?? "")}
                  >
                    <Sparkles size={16} className="mr-2" />
                    Use Suggestion
                  </Button>

                  <Button
                    type="button"
                    onClick={submitRegularization}
                    disabled={submitting || !reason.trim()}
                  >
                    {submitting ? (
                      <>
                        <RefreshCw size={16} className="mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <FileText size={16} className="mr-2" />
                        Submit Regularization
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* NOT ELIGIBLE */}
            {/* ========================================================= */}

            {!analysis.eligible && (
              <div className="rounded-2xl border border-line/60 bg-gray-50 p-5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-success-600" />

                  <p className="text-sm text-ink-soft">
                    No regularization request should be submitted for this date.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
