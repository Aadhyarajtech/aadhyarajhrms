import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BriefcaseBusiness, CalendarDays, Clock3, FileText, IndianRupee, MessageSquare, RefreshCw, Target, Users } from "lucide-react";
import { ReportsApi } from "@/lib/endpoints";
import { OrganizationApi } from "@/lib/endpoints";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { formatCurrencyINR } from "@/lib/format";

const TABS = [
  ["overview", "Overview"], ["workforce", "Workforce"], ["attendance", "Attendance"], ["leave", "Leave"],
  ["payroll", "Payroll"], ["recruitment", "Recruitment"], ["performance", "Performance"], ["tickets", "Tickets"], ["documents", "Documents"],
] as const;

type Tab = typeof TABS[number][0];

function Chart({ data, dataKey = "value" }: { data: { label: string; value?: number; gross?: number; net?: number }[]; dataKey?: string }) {
  return <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey={dataKey} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}

function money(value: number) { return formatCurrencyINR(value); }

export default function Reports() {
  const { user } = useAuth();
  const isManager = user?.role === "MANAGER";
  const canRecruitment = user?.role === "SUPER_ADMIN" || user?.role === "HR_ADMIN";
  const [tab, setTab] = useState<Tab>("overview");
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [departmentId, setDepartmentId] = useState("");
  const { data: departments = [] } = useQuery({ queryKey: ["reports", "departments"], queryFn: OrganizationApi.departments });
  const filters = useMemo(() => ({ from, to, ...(departmentId ? { departmentId } : {}) }), [from, to, departmentId]);
  const { data, isLoading, isFetching, refetch } = useQuery({ queryKey: ["reports", "overview", filters], queryFn: () => ReportsApi.overview(filters) });

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ["Report", "Metric", "Value"],
      ["Workforce", "Total Employees", data.workforce.total],
      ["Workforce", "Active Employees", data.workforce.active],
      ["Workforce", "New Hires", data.workforce.recentHires],
      ["Workforce", "Exits", data.workforce.exits],
      ["Attendance", "Attendance Rate", `${data.attendance.attendanceRate}%`],
      ["Attendance", "Average Work Hours", data.attendance.averageWorkHours],
      ["Leave", "Requests", data.leave.total],
      ["Leave", "Leave Days", data.leave.totalDays],
      ["Payroll", "Gross", data.payroll.totalGross],
      ["Payroll", "Deductions", data.payroll.totalDeductions],
      ["Payroll", "Net Pay", data.payroll.totalNet],
      ["Performance", "Average Rating", data.performance.averageRating],
      ["Tickets", "Total Tickets", data.tickets.total],
      ["Documents", "Total Documents", data.documents.total],
    ];
    if (data.recruitment) rows.push(["Recruitment", "Applications", data.recruitment.applications], ["Recruitment", "Open Roles", data.recruitment.openRoles], ["Recruitment", "Hired", data.recruitment.hired]);
    const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `hrms-report-${from}-to-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return <div>
    <PageHeader title="Reports & Analytics" subtitle={isManager ? "Team reporting and analytics" : "Organization-wide HR reporting and decision insights"} action={<div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => refetch()} leftIcon={<RefreshCw size={14} />}>Refresh</Button><Button size="sm" onClick={exportCsv} disabled={!data}>Export CSV</Button></div>} />

    <Card className="mb-6">
      <div className="grid gap-3 p-4 md:grid-cols-3">
        <label className="text-[12px] font-medium text-ink-soft">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px]" /></label>
        <label className="text-[12px] font-medium text-ink-soft">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px]" /></label>
        <label className="text-[12px] font-medium text-ink-soft">Department<select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px]"><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      </div>
    </Card>

    <div className="mb-6 flex flex-wrap gap-2">{TABS.filter(([key]) => key !== "recruitment" || canRecruitment).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-xl px-3 py-2 text-[12px] font-medium ${tab === key ? "bg-brand-600 text-white" : "bg-black/[0.04] text-ink-soft hover:bg-black/[0.07]"}`}>{label}</button>)}</div>

    {isLoading || !data ? <Card><div className="p-10 text-center text-[13px] text-ink-faint">Loading reports…</div></Card> : <>
      {tab === "overview" && <Overview data={data} isFetching={isFetching} />}
      {tab === "workforce" && <Section title="Workforce report" icon={<Users size={18} />}><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader title="Department distribution" /><Chart data={data.workforce.byDepartment} /></Card><Card><CardHeader title="Employment type" /><Chart data={data.workforce.byEmploymentType} /></Card></div></Section>}
      {tab === "attendance" && <Section title="Attendance analytics" icon={<Clock3 size={18} />}><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader title="Attendance status" /><Chart data={data.attendance.byStatus} /></Card><Card><CardHeader title="Working hours" /><div className="grid gap-3 p-5 sm:grid-cols-2"><StatCard label="Total work hours" value={data.attendance.totalWorkHours.toFixed(1)} icon={Clock3} /><StatCard label="Average / record" value={`${data.attendance.averageWorkHours.toFixed(1)} hrs`} icon={Clock3} /></div></Card></div></Section>}
      {tab === "leave" && <Section title="Leave analytics" icon={<CalendarDays size={18} />}><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader title="Requests by status" /><Chart data={data.leave.byStatus} /></Card><Card><CardHeader title="Leave types" /><Chart data={data.leave.byType} /></Card></div></Section>}
      {tab === "payroll" && <Section title="Payroll analytics" icon={<IndianRupee size={18} />}><Card><CardHeader title="Payroll run trend" /><Chart data={data.payroll.byRun.map(x => ({ label: x.label, value: x.net }))} /></Card></Section>}
      {tab === "recruitment" && data.recruitment && <Section title="Recruitment analytics" icon={<BriefcaseBusiness size={18} />}><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader title="Candidate pipeline" /><Chart data={data.recruitment.byStage} /></Card><Card><CardHeader title="Candidate sources" /><Chart data={data.recruitment.bySource} /></Card></div></Section>}
      {tab === "performance" && <Section title="Performance analytics" icon={<Target size={18} />}><Card><CardHeader title="Rating distribution" /><Chart data={data.performance.ratingDistribution} /></Card></Section>}
      {tab === "tickets" && <Section title="Ticket analytics" icon={<MessageSquare size={18} />}><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader title="By category" /><Chart data={data.tickets.byCategory} /></Card><Card><CardHeader title="By status" /><Chart data={data.tickets.byStatus} /></Card></div></Section>}
      {tab === "documents" && <Section title="Document & asset report" icon={<FileText size={18} />}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Documents" value={data.documents.total} icon={FileText} /><StatCard label="Verified" value={data.documents.verified} icon={FileText} /><StatCard label="Pending" value={data.documents.pending} icon={FileText} /><StatCard label="Assigned assets" value={data.documents.assignedAssets} icon={BriefcaseBusiness} /></div></Section>}
    </>}
  </div>;
}

function Overview({ data, isFetching }: { data: any; isFetching: boolean }) {
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Total employees" value={data.workforce.total} icon={Users} /><StatCard label="Active employees" value={data.workforce.active} icon={Users} /><StatCard label="Attendance rate" value={`${data.attendance.attendanceRate}%`} icon={Clock3} /><StatCard label="Open roles" value={data.recruitment?.openRoles ?? "—"} icon={BriefcaseBusiness} /></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="New hires" value={data.workforce.recentHires} icon={Users} /><StatCard label="Leave days" value={data.leave.totalDays} icon={CalendarDays} /><StatCard label="Payroll net" value={money(data.payroll.totalNet)} icon={IndianRupee} /><StatCard label="Avg performance" value={`${data.performance.averageRating}/5`} icon={Target} /></div>
    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader title="Headcount by department" /><Chart data={data.workforce.byDepartment} /></Card><Card><CardHeader title="Attendance status" /><Chart data={data.attendance.byStatus} /></Card></div>
    {isFetching && <p className="text-[11px] text-ink-faint">Refreshing report data…</p>}
  </div>;
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) { return <div className="space-y-4"><div className="flex items-center gap-2 text-ink"><span className="text-brand-600">{icon}</span><h2 className="font-display text-[18px] font-semibold">{title}</h2></div>{children}</div>; }
