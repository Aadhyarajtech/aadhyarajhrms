import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  X,
  ShieldAlert,
  ShieldCheck,
  Search,
  IndianRupee,
  Users,
  Building2,
  Info,
} from "lucide-react";
import { PayrollApi } from "@/lib/endpoints";
import { monthName, cx, formatCurrencyINR } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import type {
  PayrollAuditResult,
  PayrollAnomalyCategory,
  PayrollAnomalySeverity,
} from "@/types";

interface Props {
  open: boolean;
  runId: string;
  runMonth: number;
  runYear: number;
  onClose: () => void;
}

type FilterCategory = "ALL" | PayrollAnomalyCategory;
type FilterSeverity = "ALL" | PayrollAnomalySeverity;

export function PayrollAnomalyModal({
  open,
  runId,
  runMonth,
  runYear,
  onClose,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("ALL");
  const [activeSeverity, setActiveSeverity] = useState<FilterSeverity>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open) {
      setActiveCategory("ALL");
      setActiveSeverity("ALL");
      setSearchQuery("");
    }
  }, [open, runId]);

  // Handle escape key and body overflow lock
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const {
    data: audit,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<PayrollAuditResult>({
    queryKey: ["payroll", "anomalies", runId],
    queryFn: () => PayrollApi.getRunAnomalies(runId),
    enabled: open && !!runId,
    staleTime: 60_000,
  });

  const filteredAnomalies = useMemo(() => {
    if (!audit?.anomalies) return [];
    return audit.anomalies.filter((item) => {
      if (activeCategory !== "ALL" && item.category !== activeCategory) {
        return false;
      }
      if (activeSeverity !== "ALL" && item.severity !== activeSeverity) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = item.employeeName?.toLowerCase().includes(query);
        const matchesCode = item.employeeCode?.toLowerCase().includes(query);
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesDept = item.department?.toLowerCase().includes(query);
        return matchesName || matchesCode || matchesTitle || matchesDept;
      }
    });
  }, [audit?.anomalies, activeCategory, activeSeverity, searchQuery]);

  const displaySummary = useMemo(() => {
    if (!audit?.aiSummary) return "";
    return audit.aiSummary.replace(
      new RegExp(`\\b${runMonth}/${runYear}\\b`, "g"),
      `${monthName(runMonth)} ${runYear}`,
    );
  }, [audit?.aiSummary, runMonth, runYear]);

  if (!open) return null;

  const score = audit?.healthScore ?? 100;
  const isHealthy = score >= 90;
  const isWarning = score >= 70 && score < 90;

  const scoreColor = isHealthy
    ? "text-emerald-600 dark:text-emerald-400"
    : isWarning
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";

  const scoreBg = isHealthy
    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
    : isWarning
      ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
      : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex flex-col w-full max-w-5xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Payroll Audit &amp; Anomaly Detection
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {monthName(runMonth)} {runYear}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Automated statistical audit inspecting salary variances, duplicate accounts, attendance deductions, and statutory compliance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="Refresh Audit"
            >
              <RefreshCw className={cx("w-4 h-4", isFetching && "animate-spin text-indigo-600")} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Auditing payroll run and scanning for anomalies...
              </p>
              <p className="text-xs text-slate-400">
                Cross-referencing salary structures, banking info, and historical pay runs
              </p>
            </div>
          ) : !audit ? (
            <div className="py-16 text-center text-slate-500">
              Failed to load audit results. Please try again.
            </div>
          ) : (
            <>
              {/* Score & KPI Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Health Score Gauge */}
                <div
                  className={cx(
                    "flex items-center gap-4 p-4 rounded-xl border shadow-sm",
                    scoreBg,
                  )}
                >
                  <div className="relative flex items-center justify-center w-14 h-14 shrink-0">
                    <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-slate-200 dark:text-slate-700"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className={scoreColor}
                        strokeDasharray={`${score}, 100`}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <span className={cx("absolute text-sm font-bold", scoreColor)}>
                      {score}%
                    </span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Audit Health
                    </div>
                    <div className={cx("text-sm font-bold mt-0.5", scoreColor)}>
                      {isHealthy
                        ? "Clean & Safe"
                        : isWarning
                          ? "Action Advised"
                          : "High Risk"}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {audit.totalEmployees} employees verified
                    </div>
                  </div>
                </div>

                {/* Financial Exposure */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Financial Exposure
                    </span>
                    <IndianRupee className="w-4 h-4 text-rose-500" />
                  </div>
                  <div className="mt-2">
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {formatCurrencyINR(audit.totalFinancialExposure)}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Potential variance at risk
                    </p>
                  </div>
                </div>

                {/* Critical vs Medium Issues */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Flagged Issues
                    </span>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {audit.anomaliesCount}
                    </span>
                    <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                      ({audit.criticalCount} Critical)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {audit.highCount} High, {audit.mediumCount} Medium
                  </p>
                </div>

                {/* Workforce Discrepancy Rate */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Workforce Flag Rate
                    </span>
                    <Users className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="mt-2">
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {audit.discrepancyRate}%
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      of staff have flagged items
                    </p>
                  </div>
                </div>
              </div>

              {/* AI Executive Audit Briefing */}
              <div className="p-5 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/40 via-white to-purple-50/20 dark:from-indigo-950/20 dark:via-slate-900 dark:to-purple-950/10 space-y-3">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-semibold text-sm">
                  <Sparkles className="w-4 h-4" />
                  <span>Executive Audit Synthesis</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {displaySummary}
                </p>
                {audit.recommendations.length > 0 && (
                  <div className="pt-2 border-t border-indigo-100/60 dark:border-indigo-900/40 space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Recommended Clearance Actions:
                    </span>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                      {audit.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Filters & Search Toolbar */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pt-2">
                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs font-medium">
                  {[
                    { key: "ALL", label: `All (${audit.anomaliesCount})` },
                    { key: "CRITICAL_ONLY", label: `Critical (${audit.criticalCount})` },
                    { key: "SALARY_VARIANCE", label: "Salary Spikes" },
                    { key: "DUPLICATE_ACCOUNT", label: "Duplicate Info" },
                    { key: "ATTENDANCE_MISMATCH", label: "Attendance / LOP" },
                    { key: "STATUTORY_COMPLIANCE", label: "Statutory" },
                  ].map((tab) => {
                    const isSelected =
                      tab.key === "CRITICAL_ONLY"
                        ? activeSeverity === "CRITICAL"
                        : activeCategory === tab.key;

                    return (
                      <button
                        key={tab.key}
                        onClick={() => {
                          if (tab.key === "CRITICAL_ONLY") {
                            setActiveSeverity(activeSeverity === "CRITICAL" ? "ALL" : "CRITICAL");
                            setActiveCategory("ALL");
                          } else {
                            setActiveCategory(tab.key as FilterCategory);
                            setActiveSeverity("ALL");
                          }
                        }}
                        className={cx(
                          "px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors",
                          isSelected
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700",
                        )}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Search */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name, code, title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Anomalies List */}
              <div className="space-y-3">
                {filteredAnomalies.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/30">
                    <ShieldCheck className="w-10 h-10 text-emerald-500" />
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      No Anomalies Matching Filters
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                      All scanned records in this filter set conform to standard salary structures, attendance hours, and compliance checks.
                    </p>
                  </div>
                ) : (
                  filteredAnomalies.map((item) => (
                    <div
                      key={item.id}
                      className={cx(
                        "p-4 rounded-xl border transition-all bg-white dark:bg-slate-850 shadow-sm hover:shadow",
                        item.severity === "CRITICAL"
                          ? "border-rose-200 dark:border-rose-900/70"
                          : item.severity === "HIGH"
                            ? "border-orange-200 dark:border-orange-900/70"
                            : item.severity === "MEDIUM"
                              ? "border-amber-200 dark:border-amber-900/70"
                              : "border-slate-200 dark:border-slate-800",
                      )}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Severity Badge */}
                            <span
                              className={cx(
                                "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                                item.severity === "CRITICAL"
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                                  : item.severity === "HIGH"
                                    ? "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400"
                                    : item.severity === "MEDIUM"
                                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                                      : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400",
                              )}
                            >
                              {item.severity}
                            </span>

                            {/* Title */}
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                              {item.title}
                            </h4>

                            {/* Exposure Pill */}
                            {item.financialExposure !== undefined && item.financialExposure > 0 && (
                              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-200/60 dark:border-rose-800/40">
                                Exposure: {formatCurrencyINR(item.financialExposure)}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {item.description}
                          </p>

                          {/* Employee Info Pills */}
                          {(item.employeeName || item.department) && (
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                              {item.employeeName && (
                                <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200">
                                  <Users className="w-3 h-3 text-slate-400" />
                                  {item.employeeName}
                                  {item.employeeCode ? ` (${item.employeeCode})` : ""}
                                </span>
                              )}
                              {item.department && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3 text-slate-400" />
                                  {item.department}
                                </span>
                              )}
                              {item.currentValue && (
                                <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                  Current: {item.currentValue}
                                  {item.expectedValue ? ` | Expected: ${item.expectedValue}` : ""}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Recommendation Box */}
                      <div className="mt-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                        <span className="text-[11px] text-slate-600 dark:text-slate-400">
                          <strong className="text-slate-800 dark:text-slate-200 font-medium">
                            Action:
                          </strong>{" "}
                          {item.recommendation}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="text-xs text-slate-500">
            Audit generated based on active salary structures, live attendance logs, and statutory guidelines.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close Audit
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
