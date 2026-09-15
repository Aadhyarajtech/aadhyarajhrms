import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  RefreshCw,
  Users,
  ArrowRight,
  X,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  User,
} from "lucide-react";
import { PayrollApi } from "@/lib/endpoints";
import { monthName, cx } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import type { PayrollReadinessResult } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  initialMonth: number;
  initialYear: number;
  onProceedToProcess: (month: number, year: number) => void;
}

type TabCategory = "ALL" | "STRUCTURE" | "BANKING" | "ATTENDANCE" | "LEAVE";

export function PayrollValidationModal({
  open,
  onClose,
  initialMonth,
  initialYear,
  onProceedToProcess,
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [activeTab, setActiveTab] = useState<TabCategory>("ALL");
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setSelectedMonth(initialMonth);
      setSelectedYear(initialYear);
      setActiveTab("ALL");
      setExpandedItems({});
    }
  }, [open, initialMonth, initialYear]);

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
    data: result,
    isLoading,
    isFetching,
    refetch,
    isError,
    error,
  } = useQuery<PayrollReadinessResult>({
    queryKey: ["payroll-readiness", selectedMonth, selectedYear],
    queryFn: () => PayrollApi.validateReadiness(selectedMonth, selectedYear),
    enabled: open,
    staleTime: 30 * 1000,
  });

  if (!open) return null;

  const score = result?.score ?? 0;
  const blockersCount = result?.blockersCount ?? 0;
  const warningsCount = result?.warningsCount ?? 0;

  // Status calculation
  const isBlocked = result?.status === "BLOCKED" || blockersCount > 0;
  const isAttention = result?.status === "ATTENTION" || (score < 85 && !isBlocked);
  const isReady = result?.status === "READY" && !isBlocked && !isAttention;

  const scoreColor = isBlocked
    ? "text-rose-600"
    : isAttention
    ? "text-amber-500"
    : "text-emerald-600";

  const strokeColor = isBlocked
    ? "#e11d48"
    : isAttention
    ? "#f59e0b"
    : "#059669";

  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const filteredItems = (result?.items ?? []).filter((item) => {
    if (activeTab === "ALL") return true;
    return item.category === activeTab;
  });

  const structureCount = (result?.items ?? []).filter(
    (i) => i.category === "STRUCTURE"
  ).length;
  const bankingCount = (result?.items ?? []).filter(
    (i) => i.category === "BANKING"
  ).length;
  const attendanceCount = (result?.items ?? []).filter(
    (i) => i.category === "ATTENDANCE"
  ).length;
  const leaveCount = (result?.items ?? []).filter(
    (i) => i.category === "LEAVE"
  ).length;

  const handleProceed = () => {
    if (isBlocked) {
      if (
        !window.confirm(
          `There are ${blockersCount} critical blocker(s). Employees without salary structures will receive ₹0 salary and be skipped. Do you still want to proceed?`
        )
      ) {
        return;
      }
    } else if (isAttention && score < 80) {
      if (
        !window.confirm(
          `Payroll readiness is at ${score}% with ${warningsCount} advisory warning(s). Proceed with processing?`
        )
      ) {
        return;
      }
    }
    onProceedToProcess(selectedMonth, selectedYear);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex h-[100dvh] w-screen items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div
        className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 max-h-[calc(100dvh-24px)] sm:max-h-[calc(100dvh-40px)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-5 py-3.5 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shadow-2xs">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="font-display text-base sm:text-lg font-semibold text-gray-900">
                AI Pre-Run Payroll Readiness
              </h3>
              <p className="text-xs text-gray-500">
                Cross-module validation of employee coverage, salary structures, banking & leaves
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Month & Year Selectors */}
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Target Month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-700 shadow-2xs transition hover:bg-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {monthName(m)}
                  </option>
                ))}
              </select>

              <select
                aria-label="Target Year"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-700 shadow-2xs transition hover:bg-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                title="Refresh Validation"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-2xs transition hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
              >
                <RefreshCw size={13} className={cx(isFetching && "animate-spin text-indigo-600")} />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Pinned Score & Key Metrics Banner */}
        {result && !isLoading && (
          <div className="shrink-0 border-b border-gray-100 bg-slate-50/70 px-5 py-3.5 sm:px-6">
            <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
              {/* Left: Score Gauge & Status */}
              <div className="flex items-center gap-3.5">
                <div
                  className="relative flex shrink-0 items-center justify-center"
                  style={{ width: 60, height: 60 }}
                >
                  <svg
                    className="-rotate-90 transform"
                    width="60"
                    height="60"
                    viewBox="0 0 80 80"
                  >
                    <circle
                      cx="40"
                      cy="40"
                      r={32}
                      stroke="#e2e8f0"
                      strokeWidth="6"
                      fill="transparent"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r={32}
                      stroke={strokeColor}
                      strokeWidth="6"
                      strokeDasharray={2 * Math.PI * 32}
                      strokeDashoffset={2 * Math.PI * 32 - (score / 100) * (2 * Math.PI * 32)}
                      strokeLinecap="round"
                      fill="transparent"
                      className="transition-all duration-700 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={cx("font-display text-base font-bold tracking-tight", scoreColor)}>
                      {score}%
                    </span>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {isBlocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                        <ShieldAlert size={12} /> BLOCKED
                      </span>
                    ) : isAttention ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                        <AlertTriangle size={12} /> ATTENTION REQUIRED
                      </span>
                    ) : isReady ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                        <ShieldCheck size={12} /> READY TO PROCESS
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 max-w-xs leading-snug">
                    {isBlocked
                      ? "Active employees lack salary structures. Resolve blockers before processing."
                      : isAttention
                      ? "All employees covered. Review advisory warnings before proceeding."
                      : "All systems validated. Payroll can be generated with high confidence."}
                  </p>
                </div>
              </div>

              {/* Right: 4 Stat Cards */}
              <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
                <div className="rounded-xl border border-gray-200/80 bg-white px-3 py-2 text-center shadow-2xs min-w-[72px]">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Coverage</div>
                  <div className="mt-0.5 text-sm font-bold text-gray-900">
                    {result.readyEmployees}/{result.totalEmployees}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200/80 bg-white px-3 py-2 text-center shadow-2xs min-w-[72px]">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Blockers</div>
                  <div className={cx("mt-0.5 text-sm font-bold", blockersCount > 0 ? "text-rose-600" : "text-emerald-600")}>
                    {blockersCount}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200/80 bg-white px-3 py-2 text-center shadow-2xs min-w-[72px]">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Warnings</div>
                  <div className={cx("mt-0.5 text-sm font-bold", warningsCount > 0 ? "text-amber-600" : "text-gray-600")}>
                    {warningsCount}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200/80 bg-white px-3 py-2 text-center shadow-2xs min-w-[72px]">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Period</div>
                  <div className="mt-0.5 text-xs font-semibold text-gray-800 truncate">
                    {monthName(result.month).slice(0, 3)} {result.year}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-indigo-100 animate-pulse" />
                <RefreshCw size={24} className="animate-spin text-indigo-600" />
              </div>
              <h4 className="text-sm font-semibold text-gray-800">
                Auditing Payroll Integrity...
              </h4>
              <p className="mt-1 text-xs text-gray-500 max-w-sm">
                Analyzing active employees, salary structures, banking records, attendance punches, and pending leaves for {monthName(selectedMonth)} {selectedYear}.
              </p>
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-6 text-center">
              <AlertCircle size={32} className="mx-auto text-rose-500" />
              <h4 className="mt-2 text-sm font-semibold text-rose-900">
                Readiness Check Failed
              </h4>
              <p className="mt-1 text-xs text-rose-700">
                {error instanceof Error ? error.message : "Failed to load validation results."}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4 border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                onClick={() => refetch()}
              >
                Try Again
              </Button>
            </div>
          ) : result ? (
            <div className="space-y-4">
              {/* AI Executive Briefing */}
              <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 via-purple-50/20 to-white p-4 shadow-2xs">
                <div className="flex items-center gap-2 text-indigo-700">
                  <Sparkles size={16} />
                  <h4 className="text-xs font-semibold uppercase tracking-wider">
                    AI Executive Briefing
                  </h4>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-700">
                  {result.aiSummary}
                </p>

                {result.recommendations?.length > 0 && (
                  <div className="mt-3 border-t border-indigo-100/60 pt-2.5">
                    <span className="text-[11px] font-semibold text-indigo-900">
                      Action Items Prioritized:
                    </span>
                    <ul className="mt-1.5 space-y-1">
                      {result.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-xs text-gray-600">
                          <ArrowRight size={12} className="mt-0.5 shrink-0 text-indigo-500" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Categorized Filter Tabs */}
              <div>
                <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("ALL")}
                    className={cx(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                      activeTab === "ALL"
                        ? "bg-gray-900 text-white shadow-2xs"
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    All Findings ({result.items.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("STRUCTURE")}
                    className={cx(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                      activeTab === "STRUCTURE"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    Structure & Coverage ({structureCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("BANKING")}
                    className={cx(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                      activeTab === "BANKING"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    Banking & Compliance ({bankingCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("ATTENDANCE")}
                    className={cx(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                      activeTab === "ATTENDANCE"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    Attendance ({attendanceCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("LEAVE")}
                    className={cx(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                      activeTab === "LEAVE"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    Leaves ({leaveCount})
                  </button>
                </div>

                {/* Grouped Finding Cards */}
                <div className="mt-3 space-y-2.5">
                  {filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-8 text-center">
                      <CheckCircle2 size={24} className="text-emerald-500" />
                      <p className="mt-1.5 text-xs font-medium text-gray-700">
                        No issues detected in this category
                      </p>
                      <p className="text-[11px] text-gray-400">
                        All checks in this area passed successfully.
                      </p>
                    </div>
                  ) : (
                    filteredItems.map((item) => {
                      const isExpanded = !!expandedItems[item.id];
                      const hasEmployees =
                        item.affectedEmployees && item.affectedEmployees.length > 0;

                      return (
                        <div
                          key={item.id}
                          className={cx(
                            "rounded-xl border p-3.5 transition shadow-2xs",
                            item.severity === "BLOCKER"
                              ? "border-rose-200 bg-rose-50/40"
                              : item.severity === "WARNING"
                              ? "border-amber-200 bg-amber-50/30"
                              : "border-blue-200 bg-blue-50/30"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 shrink-0">
                              {item.severity === "BLOCKER" ? (
                                <AlertCircle size={17} className="text-rose-600" />
                              ) : item.severity === "WARNING" ? (
                                <AlertTriangle size={17} className="text-amber-500" />
                              ) : (
                                <Info size={17} className="text-blue-500" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cx(
                                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                                      item.severity === "BLOCKER"
                                        ? "bg-rose-100 text-rose-700"
                                        : item.severity === "WARNING"
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-blue-100 text-blue-700"
                                    )}
                                  >
                                    {item.severity}
                                  </span>
                                  <h5 className="text-xs font-semibold text-gray-900">
                                    {item.title}
                                  </h5>
                                </div>

                                {hasEmployees && (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(item.id)}
                                    className="inline-flex items-center gap-1 rounded-md border border-gray-200/80 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 shadow-2xs hover:bg-gray-50 hover:text-gray-900"
                                  >
                                    <Users size={12} className="text-gray-400" />
                                    <span>
                                      {item.affectedEmployees!.length}{" "}
                                      {item.affectedEmployees!.length === 1
                                        ? "employee"
                                        : "employees"}
                                    </span>
                                    {isExpanded ? (
                                      <ChevronUp size={12} />
                                    ) : (
                                      <ChevronDown size={12} />
                                    )}
                                  </button>
                                )}
                              </div>

                              <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                                {item.description}
                              </p>

                              {/* Single employee mention fallback */}
                              {item.employeeName && !hasEmployees && (
                                <div className="mt-2 flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 shadow-2xs border border-gray-200">
                                    <User size={11} className="text-gray-400" />
                                    {item.employeeName}
                                    {item.employeeCode && (
                                      <span className="text-gray-400 font-mono">
                                        ({item.employeeCode})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              )}

                              {/* Expandable Chip Grid for Grouped Employees */}
                              {hasEmployees && isExpanded && (
                                <div className="mt-3 rounded-lg border border-gray-200/70 bg-white p-2.5 shadow-inner">
                                  <div className="flex items-center justify-between border-b border-gray-100 pb-1.5 mb-2 text-[11px] text-gray-500">
                                    <span>Affected Personnel ({item.affectedEmployees!.length})</span>
                                    <span className="text-[10px] text-gray-400">Scrollable</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                                    {item.affectedEmployees!.map((emp) => (
                                      <span
                                        key={emp.id}
                                        className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700 border border-gray-200/80"
                                      >
                                        <User size={10} className="text-gray-400" />
                                        <span>{emp.name}</span>
                                        {emp.code && (
                                          <span className="text-gray-400 font-mono text-[10px]">
                                            ({emp.code})
                                          </span>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer (Synchronized with Score & Blockers) */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 bg-gray-50/70 px-5 py-3.5 sm:px-6">
          <div className="text-xs">
            {isBlocked ? (
              <span className="font-semibold text-rose-700 flex items-center gap-1">
                <AlertCircle size={14} />
                {blockersCount} blocker(s) found. Missing salary structures must be assigned.
              </span>
            ) : isAttention ? (
              <span className="font-semibold text-amber-700 flex items-center gap-1">
                <AlertTriangle size={14} />
                Readiness score at {score}%. Advisory warnings present ({warningsCount}).
              </span>
            ) : isReady ? (
              <span className="font-semibold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 size={14} />
                High Readiness ({score}%). Safe for payroll execution.
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>

            <Button
              size="sm"
              variant="primary"
              className={cx(
                isBlocked
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : isAttention
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              )}
              leftIcon={<Sparkles size={14} />}
              onClick={handleProceed}
            >
              {isBlocked ? "Proceed with Exceptions" : "Proceed to Process Payroll"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
