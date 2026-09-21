// path: src/components/reports/RetentionRadarView.tsx
//
// Predictive Retention & Flight-Risk Radar View
// Proactive People Analytics: correlates Payroll, Attendance, Leaves,
// Tickets & Performance to forecast resignation risks and provide AI stay-interview playbooks.

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles,
  AlertTriangle,
  Flame,
  ShieldCheck,
  TrendingDown,
  Clock,
  IndianRupee,
  Building2,
  Users,
  Search,
  Filter,
  RefreshCw,
  X,
  ChevronRight,
  HelpCircle,
  CheckCircle2,
  Briefcase,
  Calendar,
  MessageSquare,
  ArrowUpRight,
  SlidersHorizontal,
} from "lucide-react";
import { ReportsApi } from "@/lib/endpoints";
import { Button } from "@/components/ui/Button";
import type {
  RetentionRadarResult,
  EmployeeRiskProfile,
  DepartmentVulnerability,
  RiskLevel,
} from "@/types";

interface Props {
  filters?: {
    from?: string;
    to?: string;
    departmentId?: string;
  };
  departments?: { id: string; name: string }[];
}

function formatCurrencyINR(amount: number): string {
  const num = Number(amount);
  const safe = isNaN(num) ? 0 : num;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safe);
}

function getRiskBadge(level: RiskLevel) {
  switch (level) {
    case "CRITICAL":
      return {
        label: "Critical Risk",
        badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
        barColor: "bg-rose-500",
        icon: Flame,
      };
    case "ELEVATED":
      return {
        label: "Elevated Risk",
        badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
        barColor: "bg-amber-500",
        icon: AlertTriangle,
      };
    case "MODERATE":
      return {
        label: "Moderate",
        badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
        barColor: "bg-blue-500",
        icon: Clock,
      };
    default:
      return {
        label: "Stable",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
        barColor: "bg-emerald-500",
        icon: ShieldCheck,
      };
  }
}

export function RetentionRadarView({ filters, departments = [] }: Props) {
  const [data, setData] = useState<RetentionRadarResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [selectedDeptId, setSelectedDeptId] = useState<string>(filters?.departmentId || "");
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Selected employee for AI Stay-Interview drawer
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRiskProfile | null>(null);

  // Lock body scroll and listen for Escape key when the drawer is open
  useEffect(() => {
    if (selectedEmployee) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setSelectedEmployee(null);
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "unset";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [selectedEmployee]);

  const fetchRetentionData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await ReportsApi.retentionRadar({
        departmentId: selectedDeptId || undefined,
        from: filters?.from,
        to: filters?.to,
      });
      setData(result);
    } catch (err: any) {
      console.error("Failed to load retention radar data:", err);
      setError(err?.response?.data?.message || "Failed to load predictive retention data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRetentionData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeptId, filters?.from, filters?.to]);

  // Filtered employee roster
  const filteredRoster = useMemo(() => {
    if (!data) return [];
    return data.employeeRoster.filter((emp) => {
      const matchesSearch =
        !searchQuery.trim() ||
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.designation.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRisk =
        selectedRiskFilter === "ALL" ||
        (selectedRiskFilter === "CRITICAL" && emp.riskLevel === "CRITICAL") ||
        (selectedRiskFilter === "ELEVATED" && (emp.riskLevel === "CRITICAL" || emp.riskLevel === "ELEVATED")) ||
        emp.riskLevel === selectedRiskFilter;

      return matchesSearch && matchesRisk;
    });
  }, [data, searchQuery, selectedRiskFilter]);

  return (
    <div className="space-y-5">
      {/* ─── 1. HEADER & CONTROL TOOLBAR ─────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-600 via-orange-600 to-amber-600 text-white flex items-center justify-center shadow-md">
              <Flame size={19} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-[17px] font-bold text-ink tracking-tight">
                  Predictive Retention & Flight-Risk Radar
                </h2>
                <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-gradient-to-r from-rose-50 to-orange-50 text-rose-800 px-2 py-0.5 rounded-full border border-rose-200">
                  <Sparkles size={10} className="text-orange-500" />
                  AI People Analytics
                </span>
              </div>
              <p className="text-[11px] text-ink-faint mt-0.5">
                Forecasts resignation risks across Payroll, Attendance, Leaves & Tickets before talent exits
              </p>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {departments.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
                <Building2 size={12} className="text-slate-500" />
                <select
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="bg-transparent text-ink font-semibold focus:outline-none cursor-pointer text-xs"
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={fetchRetentionData}
              disabled={isLoading}
              className="text-xs h-8 px-3 bg-white"
              leftIcon={<RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />}
            >
              Recalculate
            </Button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-rose-800 text-xs flex items-center gap-2.5">
          <AlertTriangle size={15} className="text-rose-600 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !data && (
        <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center space-y-2">
          <RefreshCw size={26} className="mx-auto text-rose-600 animate-spin" />
          <h3 className="text-sm font-semibold text-ink">Analyzing Flight Risk Telemetry</h3>
          <p className="text-xs text-ink-faint max-w-sm mx-auto">
            Correlating cross-module signals across payroll parity, overtime burnout, leave clusters, and dispute history…
          </p>
        </div>
      )}

      {data && (
        <>
          {/* ─── 2. TOP METRIC STRIP ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Org Risk Index */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-ink-faint">Org Flight Risk Index</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${getRiskBadge(data.orgRiskLevel).badgeClass}`}>
                  {data.orgRiskLevel}
                </span>
              </div>
              <div className="text-2xl font-extrabold text-ink tracking-tight mt-1.5">
                {data.orgRiskIndex}%
              </div>
              {/* Mini progress meter */}
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${getRiskBadge(data.orgRiskLevel).barColor}`}
                  style={{ width: `${Math.min(data.orgRiskIndex, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-ink-faint mt-1">Across {data.totalAuditedEmployees} audited employees</p>
            </div>

            {/* Critical Flight Risk Headcount */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-ink-faint">Critical Flight Risk</span>
                <Flame size={14} className="text-rose-600" />
              </div>
              <div className="text-2xl font-extrabold text-rose-600 tracking-tight mt-1.5">
                {data.criticalRiskCount}
                <span className="text-xs font-normal text-slate-400 ml-1">staff</span>
              </div>
              <p className="text-[10px] text-ink-faint mt-2">
                + {data.elevatedRiskCount} staff in elevated risk zone
              </p>
            </div>

            {/* Total Financial Replacement Exposure */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-ink-faint">Replacement Exposure</span>
                <IndianRupee size={14} className="text-amber-600" />
              </div>
              <div className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1.5">
                {formatCurrencyINR(data.totalReplacementExposureINR)}
              </div>
              <p className="text-[10px] text-ink-faint mt-2">
                Estimated hiring & transition cost (~30% CTC)
              </p>
            </div>

            {/* Dominant Vulnerability Driver */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-ink-faint">Primary Risk Driver</span>
                <TrendingDown size={14} className="text-orange-600" />
              </div>
              <div className="text-sm font-bold text-ink tracking-tight mt-2 line-clamp-2">
                {data.dominantOrgRiskDriver}
              </div>
              <p className="text-[10px] text-ink-faint mt-1">Leading factor across high-risk roster</p>
            </div>
          </div>

          {/* ─── 3. AI EXECUTIVE RETENTION BRIEFING CARD ───────────────────── */}
          <div className="rounded-2xl border border-rose-200/90 bg-gradient-to-br from-rose-50/50 via-white to-amber-50/30 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center gap-2.5 pb-3 border-b border-rose-100">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-rose-600 to-amber-600 text-white flex items-center justify-center shadow-xs">
                <Sparkles size={14} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-ink">AI Strategic Retention Intelligence</h3>
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-200">
                    {data.source === "llm" ? "✨ Llama-3.3 70B Engine" : "Deterministic Engine"}
                  </span>
                </div>
                <p className="text-[10px] text-ink-faint">
                  Macro retention diagnosis synthesized from cross-module telemetry
                </p>
              </div>
            </div>

            <div className="mt-3 bg-white/90 p-3.5 rounded-xl border border-rose-100 text-xs text-slate-700 leading-relaxed font-medium shadow-2xs">
              {data.executiveSummary}
            </div>

            {/* Bulleted findings */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {data.keyVulnerabilityFindings.map((finding, idx) => (
                <div key={idx} className="p-2.5 rounded-xl bg-white/80 border border-slate-200/80 text-[11px] text-slate-700 flex items-start gap-2 shadow-2xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                  <span className="leading-snug">{finding}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── 4. DEPARTMENT VULNERABILITY HEATMAP ─────────────────────────── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-ink flex items-center gap-1.5">
                <Building2 size={13} className="text-slate-600" />
                Department Vulnerability Heatmap
                <span className="text-[10px] font-normal text-ink-faint ml-1">
                  ({data.departmentVulnerabilities.length} departments audited)
                </span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.departmentVulnerabilities.map((dept) => {
                const badge = getRiskBadge(dept.vulnerabilityLevel);
                const isSelected = selectedDeptId === dept.departmentId;
                return (
                  <button
                    key={dept.departmentId}
                    type="button"
                    onClick={() => setSelectedDeptId(isSelected ? "" : dept.departmentId)}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-rose-400 bg-rose-50/60 shadow-sm ring-1 ring-rose-300"
                        : "border-slate-200 bg-white hover:border-rose-200 hover:bg-rose-50/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-ink truncate" title={dept.departmentName}>
                        {dept.departmentName}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${badge.badgeClass}`}>
                        {dept.vulnerabilityLevel}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-extrabold text-slate-900">{dept.avgRiskScore}%</span>
                      <span className="text-[10px] text-ink-faint">avg risk</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${badge.barColor}`} style={{ width: `${dept.avgRiskScore}%` }} />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[10px] text-ink-faint border-t border-slate-100 pt-2">
                      <span>{dept.headcount} employees</span>
                      <span className="font-semibold text-rose-700">{dept.criticalCount} Critical</span>
                    </div>

                    <div className="mt-1 text-[9px] text-slate-500 truncate" title={`Primary driver: ${dept.topRiskDriver}`}>
                      Driver: <span className="font-semibold text-slate-700">{dept.topRiskDriver}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── 5. EMPLOYEE FLIGHT-RISK ROSTER TABLE ─────────────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            {/* Table Header & Search Filters */}
            <div className="p-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-rose-600" />
                <h3 className="text-xs font-bold text-ink">Employee Flight-Risk Roster</h3>
                <span className="text-[10px] font-semibold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200">
                  {filteredRoster.length} candidates
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search employee or role…"
                    className="pl-7 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-rose-400 w-44"
                  />
                </div>

                {/* Risk Filter Pills */}
                <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 text-[10px]">
                  {["ALL", "CRITICAL", "ELEVATED", "MODERATE", "STABLE"].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSelectedRiskFilter(lvl)}
                      className={`px-2 py-1 rounded-md font-semibold transition-all ${
                        selectedRiskFilter === lvl
                          ? "bg-rose-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {lvl === "ALL" ? "All" : lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/40 text-[11px] text-ink-soft">
                    <th className="px-4 py-2.5 font-semibold">Employee</th>
                    <th className="px-4 py-2.5 font-semibold">Department & Role</th>
                    <th className="px-4 py-2.5 font-semibold">Flight Risk Score</th>
                    <th className="px-4 py-2.5 font-semibold">Risk Level</th>
                    <th className="px-4 py-2.5 font-semibold">Dominant Risk Factors</th>
                    <th className="px-4 py-2.5 font-semibold">Replacement Exposure</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRoster.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-xs text-ink-faint">
                        No employees match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRoster.map((emp) => {
                      const badge = getRiskBadge(emp.riskLevel);
                      return (
                        <tr key={emp.employeeId} className="hover:bg-rose-50/20 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-semibold text-slate-900">{emp.name}</div>
                            <div className="text-[10px] text-ink-faint">{emp.employeeCode} • {emp.tenureMonths}m tenure</div>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-medium text-slate-800">{emp.departmentName}</div>
                            <div className="text-[10px] text-ink-faint">{emp.designation}</div>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 w-7">{emp.flightRiskScore}%</span>
                              <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
                                <div className={`h-full rounded-full ${badge.barColor}`} style={{ width: `${emp.flightRiskScore}%` }} />
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${badge.badgeClass}`}>
                              {emp.riskLevel}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {emp.dominantFactors.map((factor, i) => (
                                <span
                                  key={i}
                                  className="text-[9px] font-medium bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap"
                                >
                                  {factor}
                                </span>
                              ))}
                            </div>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-800 text-[11px]">
                            {formatCurrencyINR(emp.estimatedReplacementCostINR)}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <Button
                              size="sm"
                              onClick={() => setSelectedEmployee(emp)}
                              className="text-[10px] h-6 px-2.5 bg-gradient-to-r from-rose-600 to-orange-600 text-white hover:from-rose-700 hover:to-orange-700 shadow-2xs font-semibold"
                              rightIcon={<ChevronRight size={11} />}
                            >
                              Playbook
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── 6. MANAGER RETENTION PLAYBOOKS SECTION ────────────────────── */}
          {data.managerPlaybooks && data.managerPlaybooks.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-ink flex items-center gap-1.5">
                <Sparkles size={13} className="text-orange-500" />
                Strategic Departmental Retention Playbooks
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.managerPlaybooks.map((pb, idx) => {
                  const priorityColor =
                    pb.priority === "HIGH"
                      ? "bg-rose-100 text-rose-800 border-rose-200"
                      : pb.priority === "MEDIUM"
                      ? "bg-amber-100 text-amber-800 border-amber-200"
                      : "bg-blue-100 text-blue-800 border-blue-200";

                  return (
                    <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{pb.targetScope}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${priorityColor}`}>
                          {pb.priority} PRIORITY
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600">
                        <span className="font-bold text-slate-800">Diagnosis: </span>
                        {pb.diagnosis}
                      </div>

                      <div className="text-[11px] p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-800 font-medium">
                        <span className="font-bold text-rose-700 block text-[10px] uppercase tracking-wider mb-0.5">
                          Recommended Action:
                        </span>
                        {pb.recommendedAction}
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                          Key Stay-Interview Talking Points:
                        </span>
                        <ul className="space-y-1">
                          {pb.stayInterviewQuestions.map((q, i) => (
                            <li key={i} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                              <span className="text-rose-500 font-bold">•</span>
                              <span>"{q}"</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                        Impact: {pb.expectedImpact}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── 7. INTERACTIVE STAY-INTERVIEW DRAWER ──────────────────────── */}
          {selectedEmployee &&
            createPortal(
              <div className="fixed inset-0 z-50 flex justify-end">
                {/* Backdrop */}
                <div
                  className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in"
                  onClick={() => setSelectedEmployee(null)}
                />

                <div className="relative z-10 w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
                  {/* Drawer Header */}
                  <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-rose-50 to-orange-50 flex items-center justify-between sticky top-0 z-20 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-rose-600 text-white flex items-center justify-center">
                      <Flame size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-ink">{selectedEmployee.name}</h3>
                      <p className="text-[10px] text-ink-faint">
                        {selectedEmployee.employeeCode} • {selectedEmployee.departmentName} • {selectedEmployee.designation}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedEmployee(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Drawer Content */}
                <div className="p-5 space-y-5 text-xs text-slate-800">
                  {/* Overall Risk Score Card */}
                  <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
                        Composite Flight Risk
                      </span>
                      <div className="text-2xl font-extrabold text-rose-700 mt-0.5">
                        {selectedEmployee.flightRiskScore}%
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getRiskBadge(selectedEmployee.riskLevel).badgeClass} mt-1 inline-block`}>
                        {selectedEmployee.riskLevel} PRIORITY
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Replacement Exposure
                      </span>
                      <div className="text-base font-extrabold text-slate-900 mt-0.5">
                        {formatCurrencyINR(selectedEmployee.estimatedReplacementCostINR)}
                      </div>
                      <span className="text-[9px] text-slate-400 mt-0.5 block">{selectedEmployee.tenureMonths} months tenure</span>
                    </div>
                  </div>

                  {/* 4-Axis Signal Breakdown */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                      Cross-Module Telemetry Breakdown
                    </h4>

                    {/* Compensation */}
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <IndianRupee size={12} className="text-emerald-600" /> Compensation & Pay Equity
                        </span>
                        <span className="font-bold text-slate-700">{selectedEmployee.dimensions.compensation.score}% Risk</span>
                      </div>
                      <p className="text-[11px] text-slate-600">{selectedEmployee.dimensions.compensation.primarySignal}</p>
                    </div>

                    {/* Burnout */}
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <Clock size={12} className="text-amber-600" /> Workload & Shift Fatigue
                        </span>
                        <span className="font-bold text-slate-700">{selectedEmployee.dimensions.burnout.score}% Risk</span>
                      </div>
                      <p className="text-[11px] text-slate-600">{selectedEmployee.dimensions.burnout.primarySignal}</p>
                    </div>

                    {/* Leave */}
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <Calendar size={12} className="text-blue-600" /> Leave Disengagement
                        </span>
                        <span className="font-bold text-slate-700">{selectedEmployee.dimensions.leaveDisengagement.score}% Risk</span>
                      </div>
                      <p className="text-[11px] text-slate-600">{selectedEmployee.dimensions.leaveDisengagement.primarySignal}</p>
                    </div>

                    {/* Grievance */}
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <MessageSquare size={12} className="text-rose-600" /> Grievances & Reviews
                        </span>
                        <span className="font-bold text-slate-700">{selectedEmployee.dimensions.grievanceSentiment.score}% Risk</span>
                      </div>
                      <p className="text-[11px] text-slate-600">{selectedEmployee.dimensions.grievanceSentiment.primarySignal}</p>
                    </div>
                  </div>

                  {/* Immediate Action Advice */}
                  <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-amber-800 tracking-wider block">
                      Recommended HR Intervention:
                    </span>
                    <p className="text-xs font-semibold text-slate-900">{selectedEmployee.suggestedAction}</p>
                  </div>

                  {/* Stay-Interview Talking Points */}
                  <div className="p-3.5 rounded-xl border border-teal-200 bg-teal-50/40 space-y-2">
                    <span className="text-[10px] font-bold uppercase text-teal-800 tracking-wider block">
                      Manager Stay-Interview Talking Points:
                    </span>
                    <ul className="space-y-1.5 text-[11px] text-slate-700">
                      <li className="flex items-start gap-1.5">
                        <span className="text-teal-600 font-bold">•</span>
                        <span>"How are you feeling about your current bandwidth and project deadlines?"</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-teal-600 font-bold">•</span>
                        <span>"What tools, shift adjustments, or resources would make your week significantly smoother?"</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-teal-600 font-bold">•</span>
                        <span>"Are there career growth milestones we can align on for the next 6 months?"</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}
