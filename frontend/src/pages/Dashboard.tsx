import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {

  ResponsiveContainer,

  AreaChart,

  Area,

  XAxis,

  YAxis,

  Tooltip,

  CartesianGrid,

  BarChart,

  Bar,

  Cell,

  LineChart,

  Line,

} from "recharts";



import {

  Users,

  Clock,

  CalendarClock,

  Briefcase,



  PartyPopper,

  ArrowRight,

  Megaphone,


} from "lucide-react";



import { Link } from "react-router-dom";



import {

  DashboardApi,

  AnnouncementsApi,

} from "@/lib/endpoints";

import { GoogleCalendarApi } from "@/lib/googleCalendar";



import { useAuth } from "@/context/AuthContext";



import { PageHeader } from "@/components/ui/PageHeader";

import { StatCard } from "@/components/ui/StatCard";

import { Card, CardHeader } from "@/components/ui/Card";

import { CardSkeleton } from "@/components/ui/EmptyState";

import { Badge } from "@/components/ui/Badge";



import {

  formatDate,

  formatCurrencyINR,

  timeAgo,

  monthName,

} from "@/lib/format";



import type { Announcement } from "@/types";



type DashboardAnnouncement = Omit<

  Announcement,

  | "status"

  | "channels"

  | "calendarEnabled"

  | "eventStartAt"

  | "eventEndAt"

  | "eventLocation"

> & {

  status?: string | null;

  channels?: string[] | null;

  calendarEnabled?: boolean | null;

  eventStartAt?: string | null;

  eventEndAt?: string | null;

  eventLocation?: string | null;

};





export default function Dashboard() {

  const { user } = useAuth();



  // Super Admin and HR Admin keep the complete dashboard.

  // Recruiters and all other roles see only the shared dashboard sections.

  const isAdminDashboard =

    user?.role === "SUPER_ADMIN" ||

    user?.role === "HR_ADMIN";



  /* =========================================================

     DASHBOARD DATA

  ========================================================= */



  const {

    data,

    isLoading,

  } = useQuery({

    queryKey: ["dashboard", "overview"],

    queryFn: DashboardApi.overview,

    refetchInterval: 30000,

    refetchOnWindowFocus: true,

  });



  /* =========================================================

     ANNOUNCEMENTS



     Separate query so an announcement API problem does NOT

     prevent the main dashboard from loading.

  ========================================================= */



  const {

    data: announcements = [],

  } = useQuery<DashboardAnnouncement[]>({

    queryKey: ["announcements"],

    queryFn: AnnouncementsApi.list,

    refetchInterval: 30000,

    staleTime: 15000,

  });



  /* =========================================================

     EMPLOYEE LIFECYCLE

  ========================================================= */



  const [lifecycleDepartment, setLifecycleDepartment] = useState("ALL");



  // Lifecycle counts are calculated by the backend directly from Employee.status.

  // Refresh periodically so changes made in Employee Management are reflected

  // on an already-open Dashboard without requiring a manual page refresh.

  const employeeLifecycle = data?.employeeLifecycle;



  /* =========================================================

     UPCOMING HOLIDAYS / FESTIVALS FROM ANNOUNCEMENTS

  ========================================================= */



  const {

    data: googleHolidayData,

  } = useQuery({

    queryKey: [

      "google-holidays",

      new Date().getFullYear(),

    ],

    queryFn: () =>

      GoogleCalendarApi.indiaHolidays(

        new Date().getFullYear(),

      ),

    staleTime: 6 * 60 * 60 * 1000,

    refetchInterval: 6 * 60 * 60 * 1000,

  });



  const upcomingAnnouncementHolidays = announcements

    .filter((announcement) => {

      if (announcement.status !== "PUBLISHED") return false;

      if (announcement.type !== "HOLIDAY_NOTICE") return false;



      const calendarEnabled =

        announcement.calendarEnabled === true ||

        announcement.channels?.includes("CALENDAR");



      if (!calendarEnabled || !announcement.eventStartAt) return false;



      const eventDate = new Date(announcement.eventStartAt);

      return !Number.isNaN(eventDate.getTime()) &&

        eventDate.getTime() >= Date.now();

    })

    .sort(

      (a, b) =>

        new Date(a.eventStartAt!).getTime() -

        new Date(b.eventStartAt!).getTime(),

    )

    .map((holiday) => ({

      id: holiday.id,

      title: holiday.title,

      eventStartAt: holiday.eventStartAt!,

      eventLocation: holiday.eventLocation,

      source: "ANNOUNCEMENT" as const,

    }));



  const todayIso = new Date().toISOString().slice(0, 10);



  const upcomingGoogleHolidays = (

    googleHolidayData?.holidays ?? []

  )

    .filter(

      (holiday) =>

        holiday.date.slice(0, 10) >= todayIso,

    )

    .map((holiday) => ({

      id: holiday.id,

      title: holiday.title,

      eventStartAt: holiday.date,

      eventLocation: undefined,

      source: "GOOGLE_CALENDAR" as const,

    }));



  const upcomingHolidays = [

    ...upcomingAnnouncementHolidays,

    ...upcomingGoogleHolidays,

  ]

    .filter((holiday, index, list) =>

      list.findIndex(

        (candidate) =>

          candidate.title.toLowerCase() ===

            holiday.title.toLowerCase() &&

          candidate.eventStartAt.slice(0, 10) ===

            holiday.eventStartAt.slice(0, 10),

      ) === index,

    )

    .sort(

      (a, b) =>

        new Date(a.eventStartAt).getTime() -

        new Date(b.eventStartAt).getTime(),

    )

    .slice(0, 5);



  /* =========================================================

     LOADING

  ========================================================= */



  if (isLoading || !data) {

    return (

      <div>

        <PageHeader

          title="Dashboard"

          subtitle="A live pulse of Aadhyaraj Technologies."

        />



        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          {Array.from({

            length: 4,

          }).map((_, i) => (

            <CardSkeleton key={i} />

          ))}

        </div>

      </div>

    );

  }



  /* =========================================================

     DASHBOARD DATA

  ========================================================= */



  const { kpis } = data;



  const lifecycleDepartments = Array.from(

    new Set(

      (employeeLifecycle?.byDepartment ?? [])

        .map((item) => item.department)

        .filter(Boolean),

    ),

  ).sort((a, b) => String(a).localeCompare(String(b)));



  const selectedLifecycle =

    lifecycleDepartment === "ALL"

      ? employeeLifecycle?.overall

      : employeeLifecycle?.byDepartment?.find(

          (item) => item.department === lifecycleDepartment,

        );



  const lifecycleCounts = [

    {

      key: "ACTIVE",

      label: "Active",

      count: Number(selectedLifecycle?.active ?? 0),

    },

    {

      key: "ONBOARDING",

      label: "Onboarding",

      count: Number(selectedLifecycle?.onboarding ?? 0),

    },

    {

      key: "ON_PROBATION",

      label: "Probation",

      count: Number(selectedLifecycle?.probation ?? 0),

    },

    {

      key: "NOTICE_PERIOD",

      label: "Notice Period",

      count: Number(selectedLifecycle?.noticePeriod ?? 0),

    },

    {

      key: "OFFBOARDING",

      label: "Offboarding",

      count: Number(selectedLifecycle?.offboarding ?? 0),

    },

  ];



  const lifecycleTotal = Number(

    selectedLifecycle?.total ??

      lifecycleCounts.reduce((sum, item) => sum + item.count, 0),

  );



  const lifecycleColors = [

    "bg-success-500",

    "bg-blue-500",

    "bg-brand-500",

    "bg-gold-500",

    "bg-red-400",

  ];



  const firstName = user?.employee?.firstName ?? "there";



  const greeting =

    new Date().getHours() < 12

      ? "Good morning"

      : new Date().getHours() < 17

        ? "Good afternoon"

        : "Good evening";



  /* =========================================================

     RENDER

  ========================================================= */



  if (!isAdminDashboard) {
    return (
      <div className="min-h-full bg-canvas">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
          <Card className="mt-5 overflow-hidden border-line/60 bg-gradient-to-r from-white via-brand-50/30 to-gold-50/30">
            <div className="flex min-h-[145px] items-center justify-between gap-5 px-5 py-5 sm:px-7">
              <div><h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{greeting}, {firstName}</h1><p className="mt-2 text-[12px] text-ink-faint">Have a productive day at Aadhyaraj Technologies!</p></div>
              <div className="hidden items-center gap-3 sm:flex">
                <div className="rounded-2xl border border-line/60 bg-gradient-to-br from-brand-50 to-gold-50 px-4 py-3 shadow-sm">
                  <p className="text-[13px] font-medium text-ink">Need help?</p>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Reach IT &amp; Security for access or technical issues.
                  </p>
                </div>
              </div>
            </div>
          </Card>
          <Card className="mt-5"><div className="flex items-center justify-between gap-3"><CardHeader title="Important announcements" subtitle="Recent HR updates and company communications"/><Link to="/app/announcements" className="mr-5 text-[11px] font-medium text-brand-600 hover:underline">View all</Link></div><div className="px-5 pb-5">{announcements.filter(a=>a.status==="PUBLISHED").sort((a,b)=>new Date(b.publishedAt??b.createdAt).getTime()-new Date(a.publishedAt??a.createdAt).getTime()).slice(0,1).map(a=><Link key={a.id} to="/app/announcements" className="flex items-start gap-4 rounded-2xl border border-line/60 bg-gradient-to-r from-brand-50/50 to-white p-4 transition hover:border-brand-200 hover:bg-brand-50/60"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600"><Megaphone size={18}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-[13px] font-semibold text-ink">{a.title}</p><Badge tone="brand" className="px-2 py-0.5 text-[9px]">New</Badge></div><p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-faint">{a.body}</p><p className="mt-2 text-[10px] text-ink-faint">{formatDate(a.publishedAt??a.createdAt,{day:"numeric",month:"short",year:"numeric"})}</p></div><ArrowRight size={15} className="mt-1 shrink-0 text-brand-500"/></Link>)}{!announcements.length&&<p className="py-5 text-center text-[12px] text-ink-faint">No announcements available.</p>}</div></Card>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Card><div className="flex items-center justify-between"><CardHeader title="Recent activity"/><Link to="/app" className="mr-5 text-[11px] font-medium text-brand-600 hover:underline">View all</Link></div><div className="space-y-4 px-5 pb-5">{data.recentActivity.slice(0,4).map((item:any,i:number)=><div key={i} className="flex items-start gap-3"><div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500"/><div className="min-w-0 flex-1"><p className="text-[12px] leading-snug"><span className="font-medium text-ink">{item.firstName} {item.lastName}</span>{" "}<span className="text-ink-faint">{item.kind==="leave"&&`applied for ${item.label}`}{item.kind==="hire"&&`joined as ${item.label}`}{item.kind==="candidate"&&`applied for ${item.label}`}</span></p><div className="mt-1 flex flex-wrap items-center gap-2"><Badge tone="neutral" className="px-2 py-0.5 text-[9px]">{String(item.detail??"").replace(/_/g," ")}</Badge><span className="text-[10px] text-ink-faint">{timeAgo(item.at)}</span></div></div></div>)}{!data.recentActivity.length&&<p className="py-5 text-center text-[12px] text-ink-faint">No recent activity.</p>}</div></Card>
            <Card><div className="flex items-center justify-between"><CardHeader title="Upcoming holidays & festivals"/><Link to="/app/announcements" className="mr-5 text-[11px] font-medium text-brand-600 hover:underline">View calendar</Link></div><div className="space-y-2 px-5 pb-5">{upcomingHolidays.slice(0,4).map(h=><div key={h.id} className="flex items-center gap-3 rounded-xl border border-success-100 bg-success-50/40 p-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-success-700 shadow-sm"><PartyPopper size={15}/></div><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-medium text-ink">{h.title}</p><p className="mt-0.5 text-[10px] text-ink-faint">{formatDate(h.eventStartAt,{day:"numeric",month:"short",year:"numeric"})}</p></div><Badge tone="brand" className="shrink-0 px-2 py-0.5 text-[9px]">Holiday</Badge></div>)}{!upcomingHolidays.length&&<p className="py-5 text-center text-[12px] text-ink-faint">No upcoming holidays.</p>}</div></Card>
          </div>
          <Link to="/app/recruitment" className="mt-5 block"><Card hoverable className="overflow-hidden border-0 bg-gradient-to-r from-brand-600 via-brand-600 to-brand-800 text-white shadow-lg"><div className="relative flex min-h-[105px] items-center justify-between overflow-hidden px-6 py-5"><div className="absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/10"/><div className="absolute right-24 -bottom-20 h-40 w-40 rounded-full bg-white/10"/><div className="relative flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Briefcase size={23}/></div><div><p className="text-[11px] font-medium text-white/70">Recruitment pipeline</p><p className="mt-1 font-display text-2xl font-medium">{kpis.openRoles} open roles</p></div></div><div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm"><ArrowRight size={19}/></div></div></Card></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-canvas">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle="Here's what's happening across Aadhyaraj Technologies today."
        action={
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-line/60 bg-gradient-to-br from-brand-50 to-gold-50 px-4 py-3 shadow-sm">
              <p className="text-[13px] font-medium text-ink">Need help?</p>
              <p className="mt-1 text-[11px] text-ink-faint">
                <Link
                  to="/app/my-tickets?raise=it-support"
                  className="font-medium text-brand-600 hover:text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2 rounded-sm"
                  aria-label="Reach IT & Security"
                >
                  Reach IT & Security
                </Link>{" "}
                for access or technical issues.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-gold-100 bg-gold-50 px-3 py-2">
              <span className="text-[15px]">☀️</span>
              <div>
                <p className="text-[10px] font-medium text-ink">Today</p>
                <p className="text-[10px] text-ink-faint">
                  {formatDate(new Date().toISOString(), { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>

          </div>
        }
      />

      {/* ========================= KPI CARDS ========================= */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active employees"
          value={kpis.headcount}
          icon={Users}
          iconTone="brand"
          delta={{ value: `+${kpis.newHires30d} from last month`, positive: true }}
        />
        <StatCard
          label={kpis.attendanceIsToday ? "Present today" : "Attendance rate"}
          value={`${kpis.attendanceRate}%`}
          icon={Clock}
          iconTone="success"
          ringValue={kpis.attendanceRate}
          caption={`${kpis.presentToday} / ${kpis.headcount}`}
        />
        <StatCard
          label="Leave requests"
          value={kpis.pendingLeave}
          icon={CalendarClock}
          iconTone="warning"
          caption="Pending approval"
        />
        <StatCard
          label="Open roles"
          value={kpis.openRoles}
          icon={Briefcase}
          iconTone="gold"
          caption="In recruitment"
        />
      </div>

      {/* ========================= MAIN ANALYTICS ========================= */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {/* Headcount trend */}
        <Card>
          <CardHeader
            title="Headcount trend"
            subtitle="Active employees over the last 6 months"
            action={
              <span className="rounded-lg border border-line/60 bg-white px-2.5 py-1 text-[10px] text-ink-faint">
                Last 6 months
              </span>
            }
          />
          <div className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={205}>
              <AreaChart data={data.headcountTrend}>
                <defs>
                  <linearGradient id="adminHeadcountFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5B4FE5" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#5B4FE5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#EFEEEB" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#8A8FA3" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#8A8FA3" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E7E5E0", fontSize: 12 }} />
                <Area type="monotone" dataKey="headcount" stroke="#5B4FE5" strokeWidth={2.5} fill="url(#adminHeadcountFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Headcount by department */}
        <Card>
          <CardHeader title="Headcount by department" />
          <div className="px-4 pb-4">
            {(() => {
              const departments = (data.headcountByDepartment ?? []).filter(
                (department) => Number(department.count ?? 0) > 0,
              );

              const chartHeight = Math.max(
                180,
                Math.min(320, departments.length * 34 + 24),
              );

              if (!departments.length) {
                return (
                  <div className="flex h-[180px] items-center justify-center">
                    <p className="text-[11px] text-ink-faint">
                      No department headcount data available.
                    </p>
                  </div>
                );
              }

              return (
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <BarChart
                    data={departments}
                    layout="vertical"
                    margin={{ top: 4, right: 10, bottom: 4, left: 4 }}
                    barCategoryGap="22%"
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="department"
                      width={112}
                      tick={{
                        fontSize: 10,
                        fill: "#4B5066",
                      }}
                      tickFormatter={(value) => {
                        const label = String(value ?? "");
                        return label.length > 18
                          ? `${label.slice(0, 18)}…`
                          : label;
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 10,
                        border: "1px solid #E7E5E0",
                        fontSize: 12,
                      }}
                      formatter={(value) => [Number(value ?? 0), "Employees"]}
                    />
                    <Bar
                      dataKey="count"
                      barSize={14}
                      radius={[0, 7, 7, 0]}
                    >
                      {departments.map((department, index) => (
                        <Cell
                          key={`${department.department}-${index}`}
                          fill={department.color}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        </Card>

        {/* Employee lifecycle */}
        <Card>
          <div className="flex items-start justify-between gap-3">
            <CardHeader title="Employee lifecycle" subtitle="Current distribution across lifecycle stages" />
            <select
              value={lifecycleDepartment}
              onChange={(event) => setLifecycleDepartment(event.target.value)}
              className="mr-4 mt-4 rounded-lg border border-line/60 bg-white px-2 py-1.5 text-[10px] font-medium text-ink outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            >
              <option value="ALL">All Departments</option>
              {lifecycleDepartments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
          </div>
          <div className="px-4 pb-4">
            <div className="grid grid-cols-[120px_1fr] items-center gap-4">
              <div className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-full" style={{ background: `conic-gradient(#1A9E72 0 72%, #5B8DEF 72% 82%, #C9A14A 82% 90%, #F59E9E 90% 96%, #E8E8E8 96% 100%)` }}>
                <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white">
                  <span className="font-display text-xl font-semibold text-ink">{lifecycleTotal}</span>
                  <span className="text-[9px] text-ink-faint">Total</span>
                </div>
              </div>
              <div className="space-y-2">
                {lifecycleCounts.map((item, index) => {
                  const percentage = lifecycleTotal > 0 ? Math.round((item.count / lifecycleTotal) * 100) : 0;
                  return (
                    <div key={item.key} className="flex items-center gap-2 text-[10px]">
                      <span className={`h-2 w-2 rounded-full ${lifecycleColors[index]}`} />
                      <span className="min-w-0 flex-1 truncate text-ink-faint">{item.label}</span>
                      <span className="font-medium text-ink">{percentage}%</span>
                      <span className="w-6 text-right text-ink-faint">{item.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* Attendance trend */}
        <Card>
          <CardHeader
            title="Attendance trend"
            subtitle="% present, last 6 months"
            action={<span className="rounded-lg border border-line/60 bg-white px-2.5 py-1 text-[10px] text-ink-faint">Last 6 months</span>}
          />
          <div className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={205}>
              <LineChart data={data.attendanceTrend}>
                <CartesianGrid vertical={false} stroke="#EFEEEB" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#8A8FA3" }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E7E5E0", fontSize: 12 }} />
                <Line type="monotone" dataKey="presentRate" stroke="#1A9E72" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Payroll */}
        <Card>
          <CardHeader
            title="Payroll cost trend"
            subtitle="Net payout, last runs"
            action={<span className="rounded-lg border border-line/60 bg-white px-2.5 py-1 text-[10px] text-ink-faint">Last 6 months</span>}
          />
          <div className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={205}>
              <BarChart data={data.costTrend.map(c => ({ ...c, label: `${monthName(c.month).slice(0, 3)} '${String(c.year).slice(2)}` }))}>
                <CartesianGrid vertical={false} stroke="#EFEEEB" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8A8FA3" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E7E5E0", fontSize: 12 }} formatter={(v) => formatCurrencyINR(Number(v ?? 0))} />
                <Bar dataKey="totalNet" fill="#C9A14A" radius={[7, 7, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Important announcements */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <CardHeader title="Important announcements" />
            <Link to="/app/announcements" className="mr-4 text-[10px] font-medium text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-3 px-4 pb-4">
            {announcements.filter(a => a.status === "PUBLISHED").sort((a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime()).slice(0, 3).map(a => (
              <Link key={a.id} to="/app/announcements" className="flex items-start gap-3 rounded-xl border border-line/60 p-3 hover:border-brand-200 hover:bg-brand-50/30">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Megaphone size={14} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-ink">{a.title}</p>
                  <p className="mt-1 line-clamp-1 text-[9px] text-ink-faint">{a.body}</p>
                </div>
                <ArrowRight size={13} className="mt-1 text-ink-faint" />
              </Link>
            ))}
            {!announcements.length && <p className="py-5 text-center text-[11px] text-ink-faint">No announcements available.</p>}
          </div>
        </Card>

        {/* Recent activity */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <CardHeader title="Recent activity" />
            <Link to="/app" className="mr-4 text-[10px] font-medium text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-3 px-4 pb-4">
            {data.recentActivity.slice(0, 5).map((item: any, i: number) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] leading-snug text-ink-faint"><span className="font-medium text-ink">{item.firstName} {item.lastName}</span>{" "}{item.kind === "leave" && `applied for ${item.label}`}{item.kind === "hire" && `joined as ${item.label}`}{item.kind === "candidate" && `applied for ${item.label}`}</p>
                  <div className="mt-1 flex items-center gap-2"><Badge tone="neutral" className="px-1.5 py-0.5 text-[8px]">{String(item.detail ?? "").replace(/_/g, " ")}</Badge><span className="text-[9px] text-ink-faint">{timeAgo(item.at)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Upcoming holidays */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <CardHeader title="Upcoming holidays & festivals" />
            <Link to="/app/announcements" className="mr-4 text-[10px] font-medium text-brand-600 hover:underline">View calendar</Link>
          </div>
          <div className="space-y-2 px-4 pb-4">
            {upcomingHolidays.slice(0, 4).map(h => (
              <div key={h.id} className="flex items-center gap-3 rounded-xl border border-success-100 bg-success-50/40 p-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-success-700"><PartyPopper size={14} /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-[10px] font-medium text-ink">{h.title}</p><p className="mt-0.5 text-[9px] text-ink-faint">{formatDate(h.eventStartAt, { day: "numeric", month: "short", year: "numeric" })}</p></div>
                <Badge tone="brand" className="shrink-0 px-1.5 py-0.5 text-[8px]">Holiday</Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Pending leave approvals */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <CardHeader title="Pending leave approvals" />
            <Link to="/app/leave" className="mr-4 text-[10px] font-medium text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="px-4 pb-4">
            <div className="rounded-2xl border border-warning-100 bg-warning-50/40 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gold-600 shadow-sm"><CalendarClock size={18} /></div>
                <div className="flex-1"><p className="text-xl font-semibold text-ink">{kpis.pendingLeave}</p><p className="text-[10px] text-ink-faint">requests waiting for approval</p></div>
              </div>
              <Link to="/app/leave" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-[9px] font-medium text-brand-600 shadow-sm">Review requests <ArrowRight size={11} /></Link>
            </div>
          </div>
        </Card>

        {/* Recruitment */}
        <Link to="/app/recruitment" className="block">
          <Card hoverable className="h-full overflow-hidden border-0 bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-lg">
            <div className="relative flex min-h-[150px] items-center justify-between overflow-hidden px-5 py-5">
              <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
              <div className="absolute right-12 -bottom-16 h-32 w-32 rounded-full bg-white/10" />
              <div className="relative">
                <p className="text-[10px] font-medium text-white/70">Recruitment pipeline</p>
                <p className="mt-1 font-display text-2xl font-medium">{kpis.openRoles} open roles</p>
                <p className="mt-2 text-[10px] text-white/65">View recruitment pipeline</p>
              </div>
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand-600"><ArrowRight size={17} /></div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}



