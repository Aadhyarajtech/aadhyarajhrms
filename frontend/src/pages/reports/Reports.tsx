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
  Target,
  Users,
} from "lucide-react";
import { ReportsApi, OrganizationApi } from "@/lib/endpoints";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { formatCurrencyINR } from "@/lib/format";

const TABS = [
  ["overview", "Overview"],
  ["workforce", "Workforce"],
  ["attendance", "Attendance"],
  ["leave", "Leave"],
  ["payroll", "Payroll"],
  ["recruitment", "Recruitment"],
  ["performance", "Performance"],
  ["tickets", "Tickets"],
  ["documents", "Documents"],
  ["audit", "Audit & Compliance"],
  ["custom", "Custom Report"],
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
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [departmentId, setDepartmentId] = useState("");
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [customSections, setCustomSections] = useState<string[]>([
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

  const exportReport = async (format: "xlsx" | "pdf") => {
    try {
      setExporting(format);
      await ReportsApi.export(format, filters);
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
    <div>
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

      <Card className="mb-6">
        <div className="grid gap-3 p-4 md:grid-cols-3">
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

      <div className="mb-6 flex flex-wrap gap-2">
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

      {isLoading || !data ? (
        <Card>
          <div className="p-10 text-center text-[13px] text-ink-faint">
            Loading reports…
          </div>
        </Card>
      ) : (
        <>
          {tab === "overview" && (
            <Overview data={data} isFetching={isFetching} />
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
                Estimated overtime is calculated from recorded attendance work
                hours above 8 hours per day. Comp-off credits are not shown
                because the current attendance data model does not store
                comp-off balances.
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

          {tab === "custom" && !isManager && (
            <CustomReport
              data={data}
              sections={customSections}
              setSections={setCustomSections}
            />
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
              </div>
            </Section>
          )}
        </>
      )}
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

function CustomReport({
  data,
  sections,
  setSections,
}: {
  data: any;
  sections: string[];
  setSections: (value: string[]) => void;
}) {
  const available = [
    "Workforce",
    "Attendance",
    "Leave",
    "Payroll",
    "Recruitment",
    "Performance",
    "Tickets",
    "Documents",
  ];

  const toggle = (section: string) => {
    setSections(
      sections.includes(section)
        ? sections.filter((item) => item !== section)
        : [...sections, section],
    );
  };

  const metrics: Record<string, [string, string | number][]> = {
    Workforce: [
      ["Total Employees", data.workforce.total],
      ["Active Employees", data.workforce.active],
      ["New Hires", data.workforce.recentHires],
      ["Exits", data.workforce.exits],
    ],
    Attendance: [
      ["Attendance Rate", `${data.attendance.attendanceRate}%`],
      ["Work Hours", data.attendance.totalWorkHours],
      ["Estimated Overtime", data.attendance.estimatedOvertimeHours],
    ],
    Leave: [
      ["Requests", data.leave.total],
      ["Leave Days", data.leave.totalDays],
    ],
    Payroll: [
      ["Gross", money(data.payroll.totalGross)],
      ["Deductions", money(data.payroll.totalDeductions)],
      ["Net Pay", money(data.payroll.totalNet)],
      ["LOP", money(data.payroll.totalLop)],
    ],
    Recruitment: data.recruitment
      ? [
          ["Applications", data.recruitment.applications],
          ["Offers Sent", data.recruitment.offersSent],
          ["Offers Accepted", data.recruitment.offersAccepted],
          ["Hired", data.recruitment.hired],
        ]
      : [],
    Performance: [
      ["Reviews", data.performance.reviews],
      ["Average Rating", `${data.performance.averageRating}/5`],
    ],
    Tickets: [
      ["Total", data.tickets.total],
      ["Resolved / Closed", data.tickets.resolved],
      ["Avg Resolution", `${data.tickets.averageResolutionHours} hrs`],
    ],
    Documents: [
      ["Total", data.documents.total],
      ["Verified", data.documents.verified],
      ["Pending", data.documents.pending],
      ["Assigned Assets", data.documents.assignedAssets],
    ],
  };

  return (
    <Section title="Custom report builder" icon={<FileText size={18} />}>
      <Card>
        <CardHeader title="Select report sections" />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {available.map((section) => (
            <label
              key={section}
              className="flex items-center gap-2 text-[12px] text-ink"
            >
              <input
                type="checkbox"
                checked={sections.includes(section)}
                onChange={() => toggle(section)}
              />
              {section}
            </label>
          ))}
        </div>
      </Card>
      <DataTable
        title="Selected report metrics"
        columns={[
          ["Report", "report"],
          ["Metric", "metric"],
          ["Value", "value"],
        ]}
        rows={sections.flatMap((section) =>
          (metrics[section] ?? []).map(([metric, value]) => ({
            report: section,
            metric,
            value,
          })),
        )}
      />
      <p className="text-[11px] text-ink-faint">
        The custom report uses the same role-scoped and date/department-filtered
        data as the standard reports. Excel and PDF exports contain the full
        report dataset.
      </p>
    </Section>
  );
}

function Overview({ data, isFetching }: { data: any; isFetching: boolean }) {
  return (
    <div className="space-y-6">
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
      <div className="flex items-center gap-2 text-ink">
        <span className="text-brand-600">{icon}</span>
        <h2 className="font-display text-[18px] font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}
