// path: src/components/reports/AiCustomReportBuilderView.tsx
//
// AI Custom Report Builder — A VISUAL REPORT CONFIGURATOR tool.
// Completely separate from Ask HR AI (which is a conversational chat).
// This builder focuses on: dataset switching, column toggling, grouping,
// comparison mode, drill-down, and export. NO chat, NO conversational UI.

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Download,
  Printer,
  RefreshCw,
  Calendar,
  Building2,
  AlertTriangle,
  Clock,
  IndianRupee,
  Users,
  Briefcase,
  CalendarDays,
  CheckSquare,
  Square,
  BarChart3,
  LineChart as LineChartIcon,
  EyeOff,
  Layers,
  Wand2,
  SlidersHorizontal,
  Table2,
  LayoutGrid,
  Filter,
  Sparkles,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { ReportsApi } from "@/lib/endpoints";
import { Button } from "@/components/ui/Button";
import type {
  AiCustomReportResult,
  AiCustomReportPayload,
  DatasetType,
} from "@/types";

interface Props {
  filters?: {
    from?: string;
    to?: string;
    departmentId?: string;
  };
  departments?: { id: string; name: string }[];
}

const DATASET_TABS: { id: DatasetType; label: string; icon: any; desc: string; color: string }[] = [
  { id: "WORKFORCE", label: "Workforce", icon: Users, desc: "Employees & headcount", color: "from-blue-500 to-cyan-500" },
  { id: "ATTENDANCE", label: "Attendance", icon: Clock, desc: "Work hours & shifts", color: "from-amber-500 to-orange-500" },
  { id: "PAYROLL", label: "Payroll", icon: IndianRupee, desc: "Salary & deductions", color: "from-emerald-500 to-teal-500" },
  { id: "LEAVE", label: "Leaves", icon: CalendarDays, desc: "Leave requests", color: "from-violet-500 to-purple-500" },
  { id: "TICKETS", label: "Tickets", icon: Briefcase, desc: "Helpdesk queries", color: "from-rose-500 to-pink-500" },
];

/** Quick-start report templates */
const REPORT_TEMPLATES = [
  { id: "headcount", label: "Headcount Overview", dataset: "WORKFORCE" as DatasetType, groupBy: "department" },
  { id: "attendance-trend", label: "Attendance Trends", dataset: "ATTENDANCE" as DatasetType, groupBy: "status" },
  { id: "payroll-summary", label: "Payroll Summary", dataset: "PAYROLL" as DatasetType, groupBy: "department" },
  { id: "leave-utilization", label: "Leave Utilization", dataset: "LEAVE" as DatasetType, groupBy: "leaveType" },
  { id: "compliance-audit", label: "Compliance Audit", dataset: "WORKFORCE" as DatasetType, groupBy: "status" },
];

export function AiCustomReportBuilderView({ filters, departments = [] }: Props) {
  const [activeDataset, setActiveDataset] = useState<DatasetType>("WORKFORCE");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [activeGroupBy, setActiveGroupBy] = useState<string>("none");
  const [chartType, setChartType] = useState<"bar" | "line" | "none">("bar");

  // AI Prompt state
  const [promptText, setPromptText] = useState("");
  const [isPromptGenerating, setIsPromptGenerating] = useState(false);

  // Active drilled-down group filter
  const [drillFilter, setDrillFilter] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState<string>(
    filters?.from || `${new Date().getFullYear()}-01-01`
  );
  const [dateTo, setDateTo] = useState<string>(
    filters?.to || new Date().toISOString().slice(0, 10)
  );
  const [departmentId, setDepartmentId] = useState<string>(
    filters?.departmentId || ""
  );

  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<AiCustomReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Column panel open/close
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);

  const printableRef = useRef<HTMLDivElement>(null);

  const fetchReport = async (overridePayload?: Partial<AiCustomReportPayload>) => {
    setIsLoading(true);
    setError(null);
    setDrillFilter(null);
    try {
      const payload: AiCustomReportPayload = {
        dataset: activeDataset,
        selectedColumns: selectedColumns.length > 0 ? selectedColumns : undefined,
        groupBy: activeGroupBy !== "none" ? activeGroupBy : undefined,
        chartType,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        departmentId: departmentId || undefined,
        ...overridePayload,
      };

      const result = await ReportsApi.buildCustomReport(payload);
      setReport(result);
      setActiveDataset(result.dataset);
      setSelectedColumns(result.selectedColumns);
      if (result.activeGroupBy) {
        setActiveGroupBy(result.activeGroupBy);
      }
    } catch (err: any) {
      console.error("Failed to generate custom report:", err);
      setError(err?.response?.data?.message || "Failed to generate report. Please retry.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDatasetChange = (dataset: DatasetType) => {
    setActiveDataset(dataset);
    setActiveGroupBy("none");
    setSelectedColumns([]);
    setDrillFilter(null);
    fetchReport({ dataset, selectedColumns: undefined, groupBy: "none" });
  };

  const handleToggleColumn = (colKey: string) => {
    let next: string[];
    if (selectedColumns.includes(colKey)) {
      if (selectedColumns.length === 1) return;
      next = selectedColumns.filter((c) => c !== colKey);
    } else {
      next = [...selectedColumns, colKey];
    }
    setSelectedColumns(next);
  };

  const handleSelectAllColumns = () => {
    if (!report) return;
    setSelectedColumns(report.columns.map((c) => c.key));
  };

  const handleResetDefaultColumns = () => {
    if (!report) return;
    setSelectedColumns(report.columns.filter((c) => c.defaultSelected).map((c) => c.key));
  };

  const handleGroupByChange = (groupBy: string) => {
    setActiveGroupBy(groupBy);
    setDrillFilter(null);
    fetchReport({ groupBy: groupBy !== "none" ? groupBy : undefined });
  };

  /** AI Prompt — describe what report you want */
  const handlePromptGenerate = async () => {
    if (!promptText.trim()) return;
    setIsPromptGenerating(true);
    setError(null);
    try {
      const result = await ReportsApi.buildCustomReport({
        prompt: promptText.trim(),
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        departmentId: departmentId || undefined,
      });
      setReport(result);
      setActiveDataset(result.dataset);
      setSelectedColumns(result.selectedColumns);
      if (result.activeGroupBy) {
        setActiveGroupBy(result.activeGroupBy);
      }
      setPromptText("");
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to generate report from description.");
    } finally {
      setIsPromptGenerating(false);
    }
  };

  /** Quick template click */
  const handleTemplateClick = (template: (typeof REPORT_TEMPLATES)[number]) => {
    setActiveDataset(template.dataset);
    setActiveGroupBy(template.groupBy);
    setSelectedColumns([]);
    fetchReport({
      dataset: template.dataset,
      groupBy: template.groupBy,
      selectedColumns: undefined,
      templateId: template.id,
    });
  };

  // Filter visible columns for the table
  const visibleColumnDefs = useMemo(() => {
    if (!report) return [];
    return report.columns.filter((c) => selectedColumns.includes(c.key));
  }, [report, selectedColumns]);

  // Drill-down filtered rows
  const filteredRows = useMemo(() => {
    if (!report) return [];
    if (!drillFilter || activeGroupBy === "none") return report.rows;
    return report.rows.filter((row) => String(row[activeGroupBy]) === drillFilter);
  }, [report, drillFilter, activeGroupBy]);

  // CSV Export
  const handleExportCsv = () => {
    if (!report || visibleColumnDefs.length === 0) return;
    const rows: string[][] = [];
    rows.push([`"${report.title}"`]);
    rows.push([`"Dataset: ${report.dataset}"`, `"Generated: ${report.generatedAt}"`]);
    rows.push([]);
    rows.push(visibleColumnDefs.map((c) => `"${c.label}"`));
    filteredRows.forEach((row) => {
      rows.push(
        visibleColumnDefs.map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`)
      );
    });
    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `custom-${report.dataset.toLowerCase()}-report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const activeTab = DATASET_TABS.find((t) => t.id === activeDataset);

  return (
    <div className="space-y-5">

      {/* ─── 1. COMPACT TOOLBAR HEADER ──────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-600 to-cyan-600 text-white flex items-center justify-center shadow-md">
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h2 className="font-display text-[17px] font-bold text-ink tracking-tight">
                AI Custom Report Builder
              </h2>
              <p className="text-[11px] text-ink-faint">
                Configure datasets • Select columns • Group & visualize • Export
              </p>
            </div>
          </div>

          {/* Quick template chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-ink-faint font-medium mr-1">Templates:</span>
            {REPORT_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => handleTemplateClick(tmpl)}
                className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-ink-soft font-medium hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 transition-all"
              >
                {tmpl.label}
              </button>
            ))}
          </div>
        </div>

        {/* AI Prompt Bar — inline */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
          <div className="relative flex-1">
            <Wand2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-500" />
            <input
              type="text"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePromptGenerate()}
              placeholder='Describe a report: "Payroll by department", "Attendance this month", "Leave pending approvals"…'
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-300 placeholder:text-ink-faint transition-all"
            />
          </div>
          <Button
            size="sm"
            onClick={handlePromptGenerate}
            disabled={isPromptGenerating || !promptText.trim()}
            className="bg-teal-600 text-white hover:bg-teal-700 text-xs h-[34px] px-4 shadow-xs"
            leftIcon={
              isPromptGenerating ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Wand2 size={12} />
              )
            }
          >
            {isPromptGenerating ? "Building…" : "Build"}
          </Button>
        </div>
      </div>

      {/* ─── 2. DATASET CARDS — Visual selection grid ─────────────── */}
      <div className="grid grid-cols-5 gap-2.5">
        {DATASET_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeDataset === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleDatasetChange(tab.id)}
              className={`relative p-3 rounded-xl border text-left transition-all group ${
                isActive
                  ? "border-teal-400 bg-teal-50/80 shadow-sm ring-1 ring-teal-300"
                  : "border-slate-200 bg-white hover:border-teal-200 hover:bg-teal-50/30"
              }`}
            >
              <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${tab.color} text-white flex items-center justify-center shadow-xs mb-2`}>
                <Icon size={15} />
              </div>
              <div className="text-xs font-bold text-ink">{tab.label}</div>
              <div className="text-[10px] text-ink-faint leading-snug mt-0.5">{tab.desc}</div>
              {isActive && (
                <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* ─── 3. REPORT CONFIGURATOR TOOLBAR ──────────────────────── */}
      {report && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Left: Filters & controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Column Picker Toggle */}
              <button
                type="button"
                onClick={() => setIsColumnPanelOpen(!isColumnPanelOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  isColumnPanelOpen
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-white text-ink border-slate-200 hover:border-teal-300"
                }`}
              >
                <Table2 size={13} />
                <span>Columns ({selectedColumns.length}/{report.columns.length})</span>
              </button>

              {/* Group By */}
              <div className="flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
                <Layers size={12} className="text-teal-600" />
                <select
                  value={activeGroupBy}
                  onChange={(e) => handleGroupByChange(e.target.value)}
                  className="bg-transparent text-ink font-semibold focus:outline-none cursor-pointer text-xs"
                >
                  {report.availableGroupings.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Chart Type */}
              <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-lg border border-slate-200">
                {[
                  { type: "bar" as const, icon: BarChart3, label: "Bar" },
                  { type: "line" as const, icon: LineChartIcon, label: "Line" },
                  { type: "none" as const, icon: EyeOff, label: "Off" },
                ].map(({ type, icon: ChartIcon, label }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setChartType(type)}
                    className={`p-1.5 rounded-md text-[10px] flex items-center gap-0.5 ${
                      chartType === type
                        ? "bg-teal-600 text-white shadow-xs"
                        : "text-ink-soft hover:text-ink"
                    }`}
                    title={label}
                  >
                    <ChartIcon size={12} />
                  </button>
                ))}
              </div>

              {/* Date Range */}
              <div className="flex items-center gap-1 bg-white px-2 py-1.5 rounded-lg border border-slate-200 text-xs">
                <Calendar size={11} className="text-teal-600" />
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-transparent text-ink text-[11px] focus:outline-none w-[90px]" />
                <span className="text-ink-faint">→</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-transparent text-ink text-[11px] focus:outline-none w-[90px]" />
              </div>

              {/* Department */}
              {departments.length > 0 && (
                <div className="flex items-center gap-1 bg-white px-2 py-1.5 rounded-lg border border-slate-200 text-xs">
                  <Building2 size={11} className="text-teal-600" />
                  <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="bg-transparent text-ink text-xs focus:outline-none">
                    <option value="">All Depts</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchReport()}
                disabled={isLoading}
                className="text-[11px] h-7 px-2.5 bg-white hover:bg-slate-100"
              >
                <RefreshCw size={11} className={isLoading ? "animate-spin" : ""} />
                <span className="ml-1">Apply</span>
              </Button>
            </div>

            {/* Right: Export actions */}
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={handleExportCsv} className="text-[11px] h-7 bg-white" leftIcon={<Download size={12} className="text-emerald-600" />}>
                CSV
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrint} className="text-[11px] h-7 bg-white" leftIcon={<Printer size={12} className="text-slate-600" />}>
                Print
              </Button>
            </div>
          </div>

          {/* Column Picker Expansion Panel */}
          {isColumnPanelOpen && (
            <div className="mt-2.5 pt-2.5 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-ink flex items-center gap-1.5">
                  <CheckSquare size={12} className="text-teal-600" />
                  Toggle Visible Columns:
                </span>
                <div className="flex items-center gap-2 text-[10px]">
                  <button type="button" onClick={handleSelectAllColumns} className="text-teal-600 font-semibold hover:underline">All</button>
                  <span className="text-ink-faint">|</span>
                  <button type="button" onClick={handleResetDefaultColumns} className="text-ink-soft hover:text-ink hover:underline">Defaults</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {report.columns.map((col) => {
                  const isChecked = selectedColumns.includes(col.key);
                  return (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => handleToggleColumn(col.key)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                        isChecked
                          ? "bg-teal-50 border-teal-300 text-teal-800"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {isChecked ? <CheckSquare size={11} className="text-teal-600" /> : <Square size={11} className="text-slate-400" />}
                      {col.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-rose-800 text-xs flex items-center gap-2.5">
          <AlertTriangle size={15} className="text-rose-600 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && !report && (
        <div className="rounded-xl border border-slate-200 bg-white p-14 text-center space-y-2">
          <RefreshCw size={24} className="mx-auto text-teal-600 animate-spin" />
          <h3 className="text-sm font-semibold text-ink">Building Report</h3>
          <p className="text-[11px] text-ink-faint max-w-xs mx-auto">
            Querying database, applying filters, and preparing visualizations…
          </p>
        </div>
      )}

      {/* ─── 4. REPORT OUTPUT ────────────────────────────────────── */}
      {report && (
        <div ref={printableRef} className="space-y-4 printable-report">

          {/* ─── AI EXECUTIVE INTELLIGENCE BRIEF (Narrative + Findings + Action Plan) ─── */}
          <div className="rounded-2xl border border-teal-200/90 bg-gradient-to-br from-teal-50/50 via-white to-cyan-50/30 p-4 sm:p-5 shadow-xs transition-all">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-teal-100/80">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-teal-600 to-cyan-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-ink tracking-tight">AI Executive Intelligence Brief</h3>
                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold bg-teal-100/80 text-teal-800 px-2 py-0.5 rounded-full border border-teal-200">
                      {report.source === "llm" ? "✨ Llama 3.3 70B Engine" : "Deterministic Engine"}
                    </span>
                  </div>
                  <p className="text-[10px] text-ink-faint mt-0.5">
                    Live synthesis across {report.totalRecords} {report.dataset.toLowerCase()} records • {report.subtitle}
                  </p>
                </div>
              </div>
            </div>

            {/* Executive Narrative */}
            <div className="mt-3">
              <div className="bg-white/80 p-3.5 rounded-xl border border-teal-100/80 text-xs text-slate-700 leading-relaxed font-medium shadow-2xs">
                {report.executiveSummary}
              </div>
            </div>

            {/* Key Findings + Recommendations Grid */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Strategic Key Findings */}
              <div className="bg-white/95 p-3.5 rounded-xl border border-slate-200/80 space-y-2 shadow-2xs">
                <div className="text-[11px] font-bold text-ink flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-teal-600" />
                  Key Strategic Observations
                </div>
                <ul className="space-y-1.5">
                  {report.keyFindings.map((finding, idx) => (
                    <li key={idx} className="text-[11px] text-ink-soft flex items-start gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0 mt-1.5" />
                      <span className="leading-snug">{finding}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommended Action Plan */}
              <div className="bg-white/95 p-3.5 rounded-xl border border-slate-200/80 space-y-2 shadow-2xs">
                <div className="text-[11px] font-bold text-ink flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  Recommended Action Plan
                </div>
                <div className="space-y-1.5">
                  {report.recommendations.map((rec, idx) => {
                    const priorityColor =
                      rec.priority === "HIGH"
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : rec.priority === "MEDIUM"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200";
                    return (
                      <div key={idx} className="text-[11px] p-2 rounded-lg bg-slate-50/80 border border-slate-100">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${priorityColor}`}>
                            {rec.priority}
                          </span>
                          <span className="font-semibold text-ink truncate">{rec.action}</span>
                        </div>
                        <p className="text-[10px] text-ink-faint italic">{rec.impact}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* KPI Metric Strip — horizontal strip, not cards like Ask HR AI */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex divide-x divide-slate-100">
              {report.kpiCards.map((kpi) => {
                const statusDot =
                  kpi.status === "good" ? "bg-emerald-500" :
                  kpi.status === "warning" ? "bg-amber-500" :
                  kpi.status === "danger" ? "bg-rose-500" :
                  "bg-slate-300";
                return (
                  <div key={kpi.id} className="flex-1 p-4 text-center min-w-0">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <div className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                      <span className="text-[10px] font-medium text-ink-faint truncate">{kpi.label}</span>
                    </div>
                    <div className="text-lg font-extrabold text-ink tracking-tight">{kpi.value}</div>
                    {kpi.subtext && (
                      <p className="text-[10px] text-ink-faint mt-0.5">{kpi.subtext}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grouped Summary — Interactive drill-down tiles */}
          {report.groupedSummary && report.groupedSummary.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <LayoutGrid size={13} className="text-teal-600" />
                  Group: {activeGroupBy.charAt(0).toUpperCase() + activeGroupBy.slice(1)}
                  <span className="text-[10px] font-normal text-ink-faint ml-1">
                    ({report.groupedSummary.length} groups)
                  </span>
                </h3>
                {drillFilter && (
                  <button
                    type="button"
                    onClick={() => setDrillFilter(null)}
                    className="text-[10px] text-teal-700 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Filter size={10} /> Clear filter: "{drillFilter}"
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {report.groupedSummary.map((group) => {
                  const isActive = drillFilter === group.groupKey;
                  const pct = Math.round((group.count / (report.totalRecords || 1)) * 100);
                  return (
                    <button
                      key={group.groupKey}
                      type="button"
                      onClick={() => setDrillFilter(isActive ? null : group.groupKey)}
                      className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer group ${
                        isActive
                          ? "border-teal-400 bg-teal-50 ring-1 ring-teal-300"
                          : "border-slate-200 bg-white hover:border-teal-200 hover:bg-teal-50/30"
                      }`}
                    >
                      <div className="text-[10px] font-semibold text-ink truncate" title={group.groupLabel}>
                        {group.groupLabel}
                      </div>
                      <div className="text-base font-extrabold text-teal-700 mt-0.5">{group.count}</div>
                      {/* Mini progress bar */}
                      <div className="mt-1 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-teal-500 transition-all"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="text-[9px] text-ink-faint mt-0.5">{pct}%</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chart */}
          {chartType !== "none" && report.chart && report.chart.data.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-ink">{report.chart.title}</h3>
                <span className="text-[10px] text-ink-faint">{activeTab?.label} dataset</span>
              </div>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === "line" ? (
                    <LineChart data={report.chart.data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "11px" }} />
                      <Line type="monotone" dataKey={report.chart.dataKey} stroke="#0D9488" strokeWidth={2} dot={{ r: 3, fill: "#0D9488" }} />
                    </LineChart>
                  ) : (
                    <BarChart data={report.chart.data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "11px" }} />
                      <Bar dataKey={report.chart.dataKey} fill="#0D9488" radius={[4, 4, 0, 0]}>
                        {report.chart.data.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "#0D9488" : "#14B8A6"} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Data Table — with drill-down awareness */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Table2 size={13} className="text-teal-600" />
                <h3 className="text-xs font-bold text-ink">Report Data</h3>
                <span className="text-[9px] font-semibold bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-md border border-teal-200">
                  {visibleColumnDefs.length} cols
                </span>
                {drillFilter && (
                  <span className="text-[9px] font-semibold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md border border-amber-200 flex items-center gap-0.5">
                    <Filter size={9} /> {drillFilter}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-ink-faint">
                {filteredRows.length}{drillFilter ? ` of ${report.rows.length}` : ""} rows
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    {visibleColumnDefs.map((col) => (
                      <th key={col.key} className="px-4 py-2.5 font-semibold text-ink-soft whitespace-nowrap text-[11px] bg-slate-50/30">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumnDefs.length || 1} className="p-8 text-center text-ink-faint text-xs">
                        No records match the current scope.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-teal-50/20 transition-colors">
                        {visibleColumnDefs.map((col) => {
                          const val = row[col.key];
                          const isBadge = col.type === "badge";
                          const isCurrency = col.type === "currency";
                          return (
                            <td key={col.key} className="px-4 py-2.5 text-ink font-medium whitespace-nowrap text-[11px]">
                              {isBadge ? (
                                <span className="inline-block px-2 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                  {String(val ?? "—")}
                                </span>
                              ) : isCurrency ? (
                                <span className="font-semibold text-slate-900">{String(val ?? "—")}</span>
                              ) : (
                                String(val ?? "—")
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
