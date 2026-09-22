import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  Download,
  FileText,
  IndianRupee,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Activity,
} from "lucide-react";
import { ReportsApi, OrganizationApi } from "@/lib/endpoints";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { formatCurrencyINR } from "@/lib/format";
import { ExecutiveBriefingModal } from "@/components/reports/ExecutiveBriefingModal";
import { AskHrDataView } from "@/components/reports/AskHrDataView";
import { AiCustomReportBuilderView } from "@/components/reports/AiCustomReportBuilderView";
import { RetentionRadarView } from "@/components/reports/RetentionRadarView";
import type { ExecutiveBriefingResult } from "@/types";

const TABS = [
  ["overview", "Overview"],
  ["ask-ai", "Ask HR AI ✦"],
  ["custom", "AI Custom Report Builder ✦"],
  ["retention", "AI Retention Radar ✦"],
  ["workforce", "Workforce"],
  ["attendance", "Attendance"],
  ["leave", "Leave"],
  ["payroll", "Payroll"],
  ["recruitment", "Recruitment"],
  ["performance", "Performance"],
  ["tickets", "Tickets"],
  ["documents", "Documents"],
  ["audit", "Audit & Compliance"],
] as const;

type Tab = (typeof TABS)[number][0];

function Chart({
  data,
  dataKey = "value",
}: {
  data: { label: string; value?: number; [key: string]: any }[];
  dataKey?: string;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey={dataKey} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function money(value: number) {
  return formatCurrencyINR(value);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { user } = useAuth();
  const isManager = user?.role === "MANAGER";
  const canRecruitment =
    user?.role === "SUPER_ADMIN" || user?.role === "HR_ADMIN";
  const canAudit = canRecruitment;
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedAiQuery, setSelectedAiQuery] = useState("");
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [departmentId, setDepartmentId] = useState("");
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [customSections] = useState<string[]>([
    "Workforce",
    "Attendance",
    "Leave",
    "Payroll",
    "Performance",
    "Tickets",
  ]);

  const { data: departments = [] } = useQuery({
    queryKey: ["reports", "departments"],
    queryFn: OrganizationApi.departments,
  });

  const filters = useMemo(
    () => ({
      from,
      to,
      ...(departmentId ? { departmentId } : {}),
    }),
    [from, to, departmentId],
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["reports", "overview", filters],
    queryFn: () => ReportsApi.overview(filters),
  });

  const [briefingModalOpen, setBriefingModalOpen] = useState(false);

  const {
    data: briefingData,
    isLoading: isBriefingLoading,
    refetch: refetchBriefing,
  } = useQuery<ExecutiveBriefingResult>({
    queryKey: ["reports", "ai-briefing", filters],
    queryFn: () => ReportsApi.executiveBriefing(filters),
    enabled: briefingModalOpen,
  });

  const exportReport = async (format: "xlsx" | "pdf") => {
    try {
      setExporting(format);
      const exportSection = tab === "custom" ? "custom" : tab;
      const exportSections = tab === "custom" ? customSections : undefined;

      await ReportsApi.export(
        format,
        filters,
        exportSection as Parameters<typeof ReportsApi.export>[2],
        exportSections,
      );
    } finally {
      setExporting(null);
    }
  };

  const exportCsv = () => {
    if (!data) return;

    const rows: (string | number)[][] = [
      ["Report", "Metric", "Value"],
      ["Workforce", "Total Employees", data.workforce.total],
      ["Workforce", "Active Employees", data.workforce.active],
      ["Workforce", "New Hires", data.workforce.recentHires],
      ["Workforce", "Exits", data.workforce.exits],
      ["Attendance", "Attendance Rate", `${data.attendance.attendanceRate}%`],
      ["Attendance", "Total Work Hours", data.attendance.totalWorkHours],
      [
        "Attendance",
        "Estimated Overtime Hours",
        data.attendance.estimatedOvertimeHours,
      ],
      ["Attendance", "Regularized Records", data.attendance.regularized],
      ["Leave", "Requests", data.leave.total],
      ["Leave", "Leave Days", data.leave.totalDays],
      ["Payroll", "Gross", data.payroll.totalGross],
      ["Payroll", "Deductions", data.payroll.totalDeductions],
      ["Payroll", "Net Pay", data.payroll.totalNet],
      ["Payroll", "LOP", data.payroll.totalLop],
      ["Performance", "Average Rating", data.performance.averageRating],
      ["Tickets", "Total Tickets", data.tickets.total],
      [
        "Tickets",
        "Average Resolution Hours",
        data.tickets.averageResolutionHours,
      ],
      ["Documents", "Total Documents", data.documents.total],
      ["Documents", "Verified Documents", data.documents.verified],
      [
        "Documents",
        "Document Compliance Rate",
        `${data.documents.complianceRate}%`,
      ],
    ];

    if (data.recruitment) {
      rows.push(
        ["Recruitment", "Applications", data.recruitment.applications],
        ["Recruitment", "Offers Sent", data.recruitment.offersSent],
        ["Recruitment", "Offers Accepted", data.recruitment.offersAccepted],
        [
          "Recruitment",
          "Offer Acceptance Rate",
          `${data.recruitment.offerAcceptanceRate}%`,
        ],
        ["Recruitment", "Hired", data.recruitment.hired],
      );
    }

    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");

    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `hrms-report-${from}-to-${to}.csv`,
    );
  };

  return (
    <div className="premium-page space-y-6">
      <div className="relative overflow-hidden rounded-[28px] border border-indigo-200/60 bg-gradient-to-br from-indigo-950 via-violet-800 to-blue-700 p-6 text-white shadow-[0_24px_70px_rgba(79,70,229,0.22)] sm:p-8">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-100">
              <Sparkles size={13} /> Workforce Intelligence
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Reports & Analytics
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-indigo-100">
              Turn workforce, attendance, leave, payroll, recruitment and performance data into one clear operating view.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[500px]">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">Employees</p>
              <p className="mt-1 text-xl font-semibold">{data?.workforce?.total ?? "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">Attendance</p>
              <p className="mt-1 text-xl font-semibold">{data ? `${data.attendance.attendanceRate}%` : "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">New hires</p>
              <p className="mt-1 text-xl font-semibold">{data?.workforce?.recentHires ?? "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">Open roles</p>
              <p className="mt-1 text-xl font-semibold">{data?.recruitment?.openRoles ?? "—"}</p>
            </div>
          </div>
        </div>
      </div>

      <PageHeader
        title="Reports & Analytics"
        subtitle={
          isManager
            ? "Team reporting and analytics"
            : "Organization-wide HR reporting and decision insights"
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setSelectedAiQuery("");
                setTab("ask-ai");
              }}
              className={
                tab === "ask-ai"
                  ? "bg-indigo-700 text-white shadow-sm border-0"
                  : "bg-gradient-to-r from-indigo-600 to-brand-600 hover:from-indigo-700 hover:to-brand-700 text-white shadow-sm border-0"
              }
              leftIcon={<Sparkles size={14} className="text-amber-300" />}
            >
              Ask HR AI ✦
            </Button>
            <Button
              size="sm"
              onClick={() => setBriefingModalOpen(true)}
              className="bg-gradient-to-r from-brand-600 via-purple-600 to-indigo-600 hover:from-brand-700 hover:via-purple-700 hover:to-indigo-700 text-white shadow-sm border-0"
              leftIcon={<Sparkles size={14} className="text-amber-300 animate-pulse" />}
            >
              AI Executive Briefing
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              leftIcon={<RefreshCw size={14} />}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportReport("xlsx")}
              disabled={!data || exporting !== null}
              leftIcon={<Download size={14} />}
            >
              {exporting === "xlsx" ? "Exporting…" : "Excel"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportReport("pdf")}
              disabled={!data || exporting !== null}
              leftIcon={<Download size={14} />}
            >
              {exporting === "pdf" ? "Exporting…" : "PDF"}
            </Button>
            <Button
              size="sm"
              onClick={exportCsv}
              disabled={!data || exporting !== null}
            >
              CSV
            </Button>
          </div>
        }
      />

      <Card className="overflow-hidden border-indigo-100/80 bg-gradient-to-br from-white via-indigo-50/30 to-violet-50/40 shadow-[0_12px_40px_rgba(79,70,229,0.08)]">
        <div className="border-b border-indigo-100/70 bg-white/70 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <Activity size={15} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-ink">Report controls</p>
              <p className="text-[11px] text-ink-faint">Choose the reporting period and workforce scope.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3">
          <label className="text-[12px] font-medium text-ink-soft">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px]"
            />
          </label>
          <label className="text-[12px] font-medium text-ink-soft">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px]"
            />
          </label>
          <label className="text-[12px] font-medium text-ink-soft">
            Department
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px]"
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <div className="mb-6 rounded-2xl border border-line/70 bg-white/80 p-2 shadow-[0_8px_30px_rgba(15,23,42,0.05)] print:hidden">
        <div className="flex flex-wrap gap-2">
        {TABS.filter(
          ([key]) =>
            (key !== "recruitment" || canRecruitment) &&
            (key !== "audit" || canAudit) &&
            (key !== "custom" || !isManager),
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-xl px-3 py-2 text-[12px] font-medium ${
              tab === key
                ? "bg-brand-600 text-white"
                : "bg-black/[0.04] text-ink-soft hover:bg-black/[0.07]"
            }`}
          >
            {label}
          </button>
        ))}
        </div>
      </div>

      {tab === "ask-ai" ? (
        <AskHrDataView filters={filters} initialQuery={selectedAiQuery} />
      ) : tab === "custom" ? (
        <AiCustomReportBuilderView
          filters={filters}
          departments={departments.map((d: any) => ({
            id: d._id || d.id,
            name: d.name,
          }))}
        />
      ) : tab === "retention" ? (
        <RetentionRadarView
          filters={filters}
          departments={departments.map((d: any) => ({
            id: d._id || d.id,
            name: d.name,
          }))}
        />
      ) : isLoading || !data ? (
        <Card>
          <div className="p-10 text-center text-[13px] text-ink-faint">
            Loading reports…
          </div>
        </Card>
      ) : (
        <>
          {tab === "overview" && (
            <Overview
              data={data}
              isFetching={isFetching}
              onOpenBriefing={() => setBriefingModalOpen(true)}
              onAskAi={(q) => {
                setSelectedAiQuery(q);
                setTab("ask-ai");
              }}
            />
          )}

          {tab === "workforce" && (
            <Section title="Workforce report" icon={<Users size={18} />}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Total employees"
                  value={data.workforce.total}
                  icon={Users}
                />
                <StatCard
                  label="Active employees"
                  value={data.workforce.active}
                  icon={Users}
                />
                <StatCard
                  label="New hires"
                  value={data.workforce.recentHires}
                  icon={Users}
                />
                <StatCard
                  label="Exits"
                  value={data.workforce.exits}
                  icon={Users}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Department distribution" />
                  <Chart data={data.workforce.byDepartment} />
                </Card>
                <Card>
                  <CardHeader title="Employment type" />
                  <Chart data={data.workforce.byEmploymentType} />
                </Card>
                <Card>
                  <CardHeader title="Hiring trend" />
                  <Chart
                    data={data.workforce.headcountTrend ?? []}
                    dataKey="hires"
                  />
                </Card>
                <Card>
                  <CardHeader title="Exit trend" />
                  <Chart
                    data={data.workforce.headcountTrend ?? []}
                    dataKey="exits"
                  />
                </Card>
              </div>
            </Section>
          )}

          {tab === "attendance" && (
            <Section title="Attendance analytics" icon={<Clock3 size={18} />}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Attendance rate"
                  value={`${data.attendance.attendanceRate}%`}
                  icon={Clock3}
                />
                <StatCard
                  label="Total work hours"
                  value={data.attendance.totalWorkHours.toFixed(1)}
                  icon={Clock3}
                />
                <StatCard
                  label="Estimated overtime"
                  value={`${data.attendance.estimatedOvertimeHours.toFixed(1)} hrs`}
                  icon={Clock3}
                />
                <StatCard
                  label="Late arrivals"
                  value={data.attendance.lateRecords}
                  icon={Clock3}
                />
                <StatCard
                  label="Early departures"
                  value={data.attendance.earlyDepartureRecords}
                  icon={Clock3}
                />
                <StatCard
                  label="Regularized"
                  value={data.attendance.regularized}
                  icon={Clock3}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Attendance status" />
                  <Chart data={data.attendance.byStatus} />
                </Card>
                <Card>
                  <CardHeader title="Daily attendance rate" />
                  <Chart
                    data={data.attendance.daily}
                    dataKey="attendanceRate"
                  />
                </Card>
              </div>
              <DataTable
                title="Daily attendance breakdown"
                columns={[
                  ["Date", "label"],
                  ["Records", "total"],
                  ["Present", "present"],
                  ["Absent", "absent"],
                  ["Half Day", "halfDay"],
                  ["Work Hours", "workHours"],
                  ["Overtime", "overtimeHours"],
                  ["Rate", "attendanceRate"],
                ]}
                rows={data.attendance.daily.map((row) => ({
                  ...row,
                  attendanceRate: `${row.attendanceRate}%`,
                }))}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Late-arrival pattern by weekday" />
                  <Chart
                    data={data.attendance.lateByWeekday}
                    dataKey="lateRecords"
                  />
                </Card>
                <Card>
                  <CardHeader title="Attendance exceptions" />
                  <div className="grid grid-cols-2 gap-3 p-4 text-[12px]">
                    <div>
                      <span className="text-ink-faint">Late minutes</span>
                      <div className="font-semibold">
                        {data.attendance.lateMinutes}
                      </div>
                    </div>
                    <div>
                      <span className="text-ink-faint">
                        Early-departure minutes
                      </span>
                      <div className="font-semibold">
                        {data.attendance.earlyDepartureMinutes}
                      </div>
                    </div>
                    <div>
                      <span className="text-ink-faint">Comp-off credited</span>
                      <div className="font-semibold">
                        {data.attendance.compOffCreditedRecords}
                      </div>
                    </div>
                    <div>
                      <span className="text-ink-faint">Comp-off earned</span>
                      <div className="font-semibold">
                        {data.attendance.compOffEarnedHours} hrs
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
              <DataTable
                title="Employees with the most late arrivals"
                columns={[
                  ["Employee", "employeeId"],
                  ["Late Records", "lateRecords"],
                  ["Late Minutes", "lateMinutes"],
                  ["Early Departures", "earlyDepartureRecords"],
                  ["Early Minutes", "earlyDepartureMinutes"],
                ]}
                rows={data.attendance.lateEmployeeSummary}
              />
              <DataTable
                title="Individual attendance summary"
                columns={[
                  ["Employee", "employeeId"],
                  ["Records", "records"],
                  ["Present", "present"],
                  ["Absent", "absent"],
                  ["Half Day", "halfDay"],
                  ["Leave", "leave"],
                  ["Rate", "attendanceRate"],
                  ["Work Hours", "workHours"],
                  ["Overtime", "overtimeHours"],
                ]}
                rows={data.attendance.employeeSummary.map((row) => ({
                  ...row,
                  attendanceRate: `${row.attendanceRate}%`,
                }))}
              />
              <p className="text-[11px] text-ink-faint">
                Late-arrival frequency is grouped by weekday and employee to
                surface recurring attendance exceptions. Comp-off metrics are
                sourced from credited attendance records and Comp-Off entries.
              </p>
            </Section>
          )}

          {tab === "leave" && (
            <Section title="Leave analytics" icon={<CalendarDays size={18} />}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Requests"
                  value={data.leave.total}
                  icon={CalendarDays}
                />
                <StatCard
                  label="Leave days"
                  value={data.leave.totalDays}
                  icon={CalendarDays}
                />
                <StatCard
                  label="Approved"
                  value={bucketValue(data.leave.byStatus, "APPROVED")}
                  icon={CalendarDays}
                />
                <StatCard
                  label="Rejected"
                  value={bucketValue(data.leave.byStatus, "REJECTED")}
                  icon={CalendarDays}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Requests by status" />
                  <Chart data={data.leave.byStatus} />
                </Card>
                <Card>
                  <CardHeader title="Leave types" />
                  <Chart data={data.leave.byType} />
                </Card>
              </div>
              <Card>
                <CardHeader title="Monthly leave trend" />
                <Chart data={data.leave.monthly} />
              </Card>
            </Section>
          )}

          {tab === "payroll" && (
            <Section title="Payroll analytics" icon={<IndianRupee size={18} />}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Gross"
                  value={money(data.payroll.totalGross)}
                  icon={IndianRupee}
                />
                <StatCard
                  label="Deductions"
                  value={money(data.payroll.totalDeductions)}
                  icon={IndianRupee}
                />
                <StatCard
                  label="Net pay"
                  value={money(data.payroll.totalNet)}
                  icon={IndianRupee}
                />
                <StatCard
                  label="LOP"
                  value={money(data.payroll.totalLop)}
                  icon={IndianRupee}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Net payroll trend" />
                  <Chart
                    data={data.payroll.byRun.map((x) => ({
                      label: x.label,
                      value: x.net,
                    }))}
                  />
                </Card>
                <Card>
                  <CardHeader title="Payroll cost by department" />
                  <Chart data={data.payroll.byDepartment} />
                </Card>
              </div>
              <DataTable
                title="Payroll runs"
                columns={[
                  ["Run", "label"],
                  ["Headcount", "headcount"],
                  ["Gross", "gross"],
                  ["Deductions", "deductions"],
                  ["Net", "net"],
                  ["LOP", "lop"],
                ]}
                rows={data.payroll.byRun}
              />
            </Section>
          )}

          {tab === "recruitment" && data.recruitment && (
            <Section
              title="Recruitment analytics"
              icon={<BriefcaseBusiness size={18} />}
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard
                  label="Applications"
                  value={data.recruitment.applications}
                  icon={BriefcaseBusiness}
                />
                <StatCard
                  label="Open roles"
                  value={data.recruitment.openRoles}
                  icon={BriefcaseBusiness}
                />
                <StatCard
                  label="Offers sent"
                  value={data.recruitment.offersSent}
                  icon={BriefcaseBusiness}
                />
                <StatCard
                  label="Accepted"
                  value={data.recruitment.offersAccepted}
                  icon={BriefcaseBusiness}
                />
                <StatCard
                  label="Hired"
                  value={data.recruitment.hired}
                  icon={BriefcaseBusiness}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Recruitment funnel" />
                  <Chart data={data.recruitment.funnel} />
                </Card>
                <Card>
                  <CardHeader title="Candidate sources" />
                  <Chart data={data.recruitment.bySource} />
                </Card>
              </div>
              <p className="text-[12px] text-ink-soft">
                Offer acceptance rate:{" "}
                <strong>{data.recruitment.offerAcceptanceRate}%</strong>
              </p>
            </Section>
          )}

          {tab === "performance" && (
            <Section title="Performance analytics" icon={<Target size={18} />}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Reviews"
                  value={data.performance.reviews}
                  icon={Target}
                />
                <StatCard
                  label="Average rating"
                  value={`${data.performance.averageRating}/5`}
                  icon={Target}
                />
                <StatCard
                  label="Rated reviews"
                  value={data.performance.ratingDistribution.reduce(
                    (sum, row) => sum + row.value,
                    0,
                  )}
                  icon={Target}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Rating distribution" />
                  <Chart data={data.performance.ratingDistribution} />
                </Card>
                <Card>
                  <CardHeader title="Performance outcomes" />
                  <Chart data={data.performance.outcomes} />
                </Card>
              </div>
            </Section>
          )}

          {tab === "tickets" && (
            <Section
              title="Ticket analytics"
              icon={<MessageSquare size={18} />}
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Total tickets"
                  value={data.tickets.total}
                  icon={MessageSquare}
                />
                <StatCard
                  label="Resolved / closed"
                  value={data.tickets.resolved}
                  icon={MessageSquare}
                />
                <StatCard
                  label="Avg resolution"
                  value={`${data.tickets.averageResolutionHours.toFixed(1)} hrs`}
                  icon={MessageSquare}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader title="By category" />
                  <Chart data={data.tickets.byCategory} />
                </Card>
                <Card>
                  <CardHeader title="By status" />
                  <Chart data={data.tickets.byStatus} />
                </Card>
                <Card>
                  <CardHeader title="By priority" />
                  <Chart data={data.tickets.byPriority} />
                </Card>
              </div>
            </Section>
          )}

          {tab === "audit" && canAudit && (
            <Section
              title="Audit & compliance report"
              icon={<ShieldCheck size={18} />}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard
                  label="Audit events"
                  value={data.audit.total}
                  icon={ShieldCheck}
                />
                <StatCard
                  label="Recent events shown"
                  value={data.audit.recent.length}
                  icon={ShieldCheck}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Actions" />
                  <Chart data={data.audit.byAction} />
                </Card>
                <Card>
                  <CardHeader title="Entities" />
                  <Chart data={data.audit.byEntity} />
                </Card>
              </div>
              <DataTable
                title="Recent audit activity"
                columns={[
                  ["Time", "createdAt"],
                  ["Action", "action"],
                  ["Entity", "entity"],
                  ["Entity ID", "entityId"],
                  ["User", "userId"],
                  ["IP", "ipAddress"],
                ]}
                rows={data.audit.recent}
              />
            </Section>
          )}

          {tab === "documents" && (
            <Section
              title="Document & asset report"
              icon={<FileText size={18} />}
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Documents"
                  value={data.documents.total}
                  icon={FileText}
                />
                <StatCard
                  label="Verified"
                  value={data.documents.verified}
                  icon={FileText}
                />
                <StatCard
                  label="Pending"
                  value={data.documents.pending}
                  icon={FileText}
                />
                <StatCard
                  label="Assigned assets"
                  value={data.documents.assignedAssets}
                  icon={BriefcaseBusiness}
                />
                <StatCard
                  label="Compliance rate"
                  value={`${data.documents.complianceRate}%`}
                  icon={ShieldCheck}
                />
              </div>
            </Section>
          )}
        </>
      )}

      <ExecutiveBriefingModal
        isOpen={briefingModalOpen}
        onClose={() => setBriefingModalOpen(false)}
        data={briefingData ?? null}
        isLoading={isBriefingLoading}
        onRefresh={() => refetchBriefing()}
      />
    </div>
  );
}

function bucketValue(rows: { label: string; value: number }[], label: string) {
  return rows.find((row) => row.label === label)?.value ?? 0;
}

function DataTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: [string, string][];
  rows: Record<string, any>[];
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-line">
              {columns.map(([label]) => (
                <th
                  key={label}
                  className="px-4 py-3 font-semibold text-ink-soft"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-ink-faint"
                >
                  No data for the selected filters.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={`${String(row[columns[0][1]])}-${index}`}
                  className="border-b border-line last:border-0"
                >
                  {columns.map(([, key]) => (
                    <td key={key} className="px-4 py-3 text-ink">
                      {typeof row[key] === "number" &&
                      ["gross", "deductions", "net", "lop"].includes(key)
                        ? money(row[key])
                        : String(row[key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Overview({
  data,
  isFetching,
  onOpenBriefing,
  onAskAi,
}: {
  data: any;
  isFetching: boolean;
  onOpenBriefing: () => void;
  onAskAi: (query: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* AI Executive Briefing Hero Card */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-200/80 bg-gradient-to-br from-brand-50/70 via-white to-purple-50/50 p-5 shadow-sm transition-all hover:shadow-md">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-100/90 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700">
              <Sparkles size={12} className="text-brand-600 animate-pulse" />
              AI HR Intelligence
            </div>
            <h3 className="font-display text-[16px] font-bold text-ink">
              Executive HR Briefing & Organization Health
            </h3>
            <p className="max-w-2xl text-[12px] leading-relaxed text-ink-soft">
              Synthesize workforce momentum, attendance stability, payroll risk, ticket SLA health, and department-level friction points into an executive management narrative with strategic recommendations.
            </p>
          </div>
          <div className="shrink-0">
            <Button
              size="sm"
              onClick={onOpenBriefing}
              className="bg-gradient-to-r from-brand-600 via-purple-600 to-indigo-600 hover:from-brand-700 hover:via-purple-700 hover:to-indigo-700 text-white shadow-sm border-0 px-4 py-2"
              leftIcon={<Sparkles size={14} className="text-amber-300 animate-pulse" />}
            >
              Generate AI Briefing
            </Button>
          </div>
        </div>
      </div>

      {/* Ask HR AI Quick Bar */}
      <div className="rounded-2xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-white p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
            <Sparkles size={18} className="text-amber-300" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
              Ask HR Data
              <span className="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px] font-semibold border border-indigo-200">
                Natural Language AI
              </span>
            </div>
            <p className="text-[11.5px] text-ink-soft">
              Instant answers for absenteeism, headcount, payroll costs, tickets, or ratings.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onAskAi("Which department has the highest absenteeism?")}
            className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-amber-800 hover:bg-amber-50/80 transition-all shadow-xs"
          >
            Highest absenteeism?
          </button>
          <button
            type="button"
            onClick={() => onAskAi("What was our total payroll disbursement?")}
            className="rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-emerald-800 hover:bg-emerald-50/80 transition-all shadow-xs"
          >
            Total payroll?
          </button>
          <button
            type="button"
            onClick={() => onAskAi("Show unresolved high-priority tickets")}
            className="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-rose-800 hover:bg-rose-50/80 transition-all shadow-xs"
          >
            High-priority tickets?
          </button>
          <Button
            size="sm"
            onClick={() => onAskAi("")}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] py-1.5 px-3.5 shadow-xs"
          >
            Ask HR AI ✦
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total employees"
          value={data.workforce.total}
          icon={Users}
        />
        <StatCard
          label="Active employees"
          value={data.workforce.active}
          icon={Users}
        />
        <StatCard
          label="Attendance rate"
          value={`${data.attendance.attendanceRate}%`}
          icon={Clock3}
        />
        <StatCard
          label="Open roles"
          value={data.recruitment?.openRoles ?? "—"}
          icon={BriefcaseBusiness}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="New hires"
          value={data.workforce.recentHires}
          icon={Users}
        />
        <StatCard
          label="Leave days"
          value={data.leave.totalDays}
          icon={CalendarDays}
        />
        <StatCard
          label="Payroll net"
          value={money(data.payroll.totalNet)}
          icon={IndianRupee}
        />
        <StatCard
          label="Avg performance"
          value={`${data.performance.averageRating}/5`}
          icon={Target}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Headcount by department" />
          <Chart data={data.workforce.byDepartment} />
        </Card>
        <Card>
          <CardHeader title="Attendance status" />
          <Chart data={data.attendance.byStatus} />
        </Card>
      </div>
      {isFetching && (
        <p className="text-[11px] text-ink-faint">Refreshing report data…</p>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-indigo-100/80 bg-gradient-to-r from-indigo-50/80 to-white px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">{icon}</span>
        <div><h2 className="font-display text-[18px] font-semibold">{title}</h2><p className="text-[11px] text-ink-faint">Detailed metrics for the selected reporting scope.</p></div>
      </div>
      {children}
    </div>
  );
}
