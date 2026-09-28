import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Users,
  Wallet,
  X,
  Check,
  ShieldCheck,
} from "lucide-react";
import { LeaveApi, type LeaveApprovalSuggestionResponse } from "@/lib/endpoints";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/EmptyState";
import { cx, formatDate } from "@/lib/format";

export interface AiLeaveApprovalModalProps {
  open: boolean;
  onClose: () => void;
  request: {
    id: string;
    employeeName: string;
    employeeCode?: string;
    avatarUrl?: string | null;
    leaveTypeName: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    reason: string;
  } | null;
  onDecide: (id: string, status: "APPROVED" | "REJECTED", note?: string) => void;
  isDeciding?: boolean;
}

export function AiLeaveApprovalModal({
  open,
  onClose,
  request,
  onDecide,
  isDeciding,
}: AiLeaveApprovalModalProps) {
  const [decisionNote, setDecisionNote] = useState("");

  const {
    data: aiData,
    isLoading,
    isError,
    refetch,
  } = useQuery<LeaveApprovalSuggestionResponse>({
    queryKey: ["leave", "ai-approval", request?.id],
    queryFn: () => LeaveApi.aiApproval(request!.id),
    enabled: open && !!request?.id,
    staleTime: 60_000,
  });

  if (!request) return null;

  const isApprove = aiData?.recommendation === "APPROVE";
  const riskColor =
    aiData?.riskLevel === "LOW"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : aiData?.riskLevel === "MEDIUM"
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-rose-700 bg-rose-50 border-rose-200";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI Leave Approval Analysis"
      size="lg"
    >
      <div className="space-y-5">
        {/* Request Context Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/60 bg-surface-ground p-4">
          <div className="space-y-0.5">
            <h4 className="text-sm font-semibold text-ink">
              {request.employeeName}{" "}
              {request.employeeCode && (
                <span className="text-xs font-normal text-ink-faint">
                  ({request.employeeCode})
                </span>
              )}
            </h4>
            <p className="text-xs text-ink-soft">
              {request.leaveTypeName} · {formatDate(request.startDate)} to{" "}
              {formatDate(request.endDate)} (
              <strong className="text-ink">{request.totalDays} day{request.totalDays > 1 ? "s" : ""}</strong>)
            </p>
            <p className="mt-1 text-xs italic text-ink-faint">
              "{request.reason}"
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 border border-brand-200">
            <Sparkles size={12} className="text-amber-500" />
            Deterministic AI Engine
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-16 rounded-2xl" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 text-center">
            <AlertTriangle className="mx-auto mb-2 text-rose-500" size={24} />
            <p className="text-sm font-medium text-rose-800">
              Unable to generate AI analysis
            </p>
            <p className="text-xs text-rose-600 mb-3">
              Could not fetch risk factors for this leave request.
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry Analysis
            </Button>
          </div>
        ) : aiData ? (
          <>
            {/* Top Recommendation Banner */}
            <div
              className={cx(
                "flex items-center justify-between rounded-2xl border p-4 transition-all",
                isApprove
                  ? "bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/5 border-emerald-300"
                  : "bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border-amber-300",
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cx(
                    "flex h-11 w-11 items-center justify-center rounded-xl font-bold",
                    isApprove
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                      : "bg-amber-600 text-white shadow-md shadow-amber-500/20",
                  )}
                >
                  {isApprove ? (
                    <CheckCircle2 size={24} />
                  ) : (
                    <AlertTriangle size={24} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                      Recommendation
                    </span>
                    <span
                      className={cx(
                        "rounded-md px-2 py-0.5 text-xs font-bold uppercase",
                        isApprove
                          ? "bg-emerald-600 text-white"
                          : "bg-amber-600 text-white",
                      )}
                    >
                      {aiData.recommendation}
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {isApprove
                      ? "HRMS data supports approval with low operational impact."
                      : "Careful review recommended due to team overlap or balance constraints."}
                  </p>
                </div>
              </div>

              {/* Risk Badge */}
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-ink-faint block">
                  Risk Level
                </span>
                <span
                  className={cx(
                    "inline-block mt-0.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                    riskColor,
                  )}
                >
                  {aiData.riskLevel} ({aiData.riskScore}/100)
                </span>
              </div>
            </div>

            {/* Metrics Triad */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Balance Card */}
              <div className="rounded-xl border border-line/70 bg-surface p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                  <Wallet size={14} className="text-brand-500" />
                  <span>Leave Balance</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-ink">
                    {aiData.leaveBalance.available ?? "—"}
                  </span>
                  <span className="text-xs text-ink-faint">
                    available / {aiData.leaveBalance.requested} requested
                  </span>
                </div>
                <p className="text-[11px] text-ink-soft">
                  {aiData.leaveBalance.sufficient === true ? (
                    <span className="text-emerald-600 font-medium">
                      ✓ Sufficient balance
                    </span>
                  ) : aiData.leaveBalance.sufficient === false ? (
                    <span className="text-rose-600 font-medium">
                      ⚠️ Insufficient balance
                    </span>
                  ) : (
                    "Balance not tracked"
                  )}
                </p>
              </div>

              {/* Team Impact Card */}
              <div className="rounded-xl border border-line/70 bg-surface p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                  <Users size={14} className="text-indigo-500" />
                  <span>Team Impact</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-ink">
                    {aiData.teamImpact.affectedEmployees}
                  </span>
                  <span className="text-xs text-ink-faint">
                    overlapping member{aiData.teamImpact.affectedEmployees !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-[11px] text-ink-soft">
                  {aiData.teamImpact.affectedDays} day(s) overlap (
                  <strong className="capitalize font-medium">
                    {aiData.teamImpact.impactLevel.toLowerCase()} impact
                  </strong>
                  )
                </p>
              </div>

              {/* Risk Score Meter */}
              <div className="rounded-xl border border-line/70 bg-surface p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                  <ShieldCheck size={14} className="text-amber-500" />
                  <span>Calculated Risk</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-ink">
                    {aiData.riskScore}%
                  </span>
                  <span className="text-xs text-ink-faint">composite score</span>
                </div>
                {/* Visual Progress Bar */}
                <div className="h-1.5 w-full rounded-full bg-line overflow-hidden mt-1">
                  <div
                    className={cx(
                      "h-full transition-all duration-500",
                      aiData.riskScore <= 30
                        ? "bg-emerald-500"
                        : aiData.riskScore <= 60
                          ? "bg-amber-500"
                          : "bg-rose-500",
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, aiData.riskScore))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* AI Explanation & Reasons */}
            <div className="rounded-2xl border border-line/80 bg-surface-ground/50 p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-brand-600" />
                <h5 className="text-xs font-semibold uppercase tracking-wider text-ink">
                  AI Decision Summary
                </h5>
              </div>
              <p className="text-xs leading-relaxed text-ink-soft">
                {aiData.explanation}
              </p>

              {aiData.reasons.length > 0 && (
                <div className="pt-2 border-t border-line/40 space-y-1">
                  <span className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider block">
                    Key Observations:
                  </span>
                  <ul className="space-y-1 text-xs text-ink-soft">
                    {aiData.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-brand-500 font-bold">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Optional Decision Note */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-soft">
                Add Decision Note (optional)
              </label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder={
                  isApprove
                    ? "e.g. Approved. Please ensure task handover is complete."
                    : "e.g. Please discuss with team lead regarding sprint coverage."
                }
                rows={2}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
              />
            </div>
          </>
        ) : null}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line/60">
          <Button size="sm" variant="outline" onClick={onClose} disabled={isDeciding}>
            Close
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="text-rose-600 hover:bg-rose-50 border-rose-200"
            leftIcon={<X size={14} />}
            isLoading={isDeciding}
            onClick={() => onDecide(request.id, "REJECTED", decisionNote)}
          >
            Reject Request
          </Button>

          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            leftIcon={<Check size={14} />}
            isLoading={isDeciding}
            onClick={() => onDecide(request.id, "APPROVED", decisionNote)}
          >
            Approve Request
          </Button>
        </div>
      </div>
    </Modal>
  );
}
