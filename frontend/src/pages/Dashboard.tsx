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
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

import {
  Users,
  Clock,
  CalendarClock,
  Briefcase,
  Cake,
  Award,
  PartyPopper,
  ArrowRight,
  Megaphone,
  ExternalLink,
} from "lucide-react";

import { Link } from "react-router-dom";
import { DashboardApi, AnnouncementsApi } from "@/lib/endpoints";
import { useAuth } from "@/context/AuthContext";

import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CardSkeleton } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";

import {
  formatDate,
  formatCurrencyINR,
  timeAgo,
  monthName,
} from "@/lib/format";

import type { Announcement } from "@/types";

const GENDER_COLORS = ["#5B4FE5", "#C9A14A", "#94A3B8"];

export default function Dashboard() {
  const { user } = useAuth();

  /* =========================================================
     DASHBOARD DATA
  ========================================================= */

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: DashboardApi.overview,
  });

  /* =========================================================
     ANNOUNCEMENTS
  ========================================================= */

  const { data: announcements = [] } = useQuery<Announcement[]>({
    queryKey: ["announcements"],
    queryFn: AnnouncementsApi.list,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  /* Show at most two published banner announcements.
     Pinned announcements come first, then newest published. */
  const dashboardAnnouncements = announcements
    .filter(
      (announcement) =>
        announcement.status === "PUBLISHED" && announcement.showBanner === true,
    )
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }

      const aDate = new Date(a.publishedAt ?? a.createdAt).getTime();

      const bDate = new Date(b.publishedAt ?? b.createdAt).getTime();

      return bDate - aDate;
    })
    .slice(0, 2);

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

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={`Here's how Aadhyaraj Technologies is doing${
          kpis.attendanceIsToday
            ? " today"
            : ` as of ${formatDate(kpis.attendanceDate)}`
        }.`}
        action={
          <div className="max-w-xs rounded-2xl border border-line/60 bg-gradient-to-br from-brand-50 to-gold-50 p-4 shadow-sm">
            <p className="font-display text-[13px] font-medium text-ink">
              Need help?
            </p>

            <p className="mt-1 text-[12px] text-ink-faint">
              Reach IT & Security for access or technical issues.
            </p>
          </div>
        }
      />

      {/* =====================================================
          DASHBOARD ANNOUNCEMENT BANNERS
      ===================================================== */}

      {dashboardAnnouncements.length > 0 && (
        <div className="mb-6 space-y-3">
          {dashboardAnnouncements.map((announcement) => (
            <Card
              key={announcement.id}
              className="overflow-hidden border-brand-200 bg-gradient-to-r from-brand-50 via-white to-gold-50"
            >
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
                  <Megaphone size={20} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-[15px] font-semibold text-ink">
                      {announcement.title}
                    </p>

                    {announcement.pinned && (
                      <Badge tone="brand" className="px-2 py-0.5 text-[10px]">
                        Pinned
                      </Badge>
                    )}

                    <Badge tone="neutral" className="px-2 py-0.5 text-[10px]">
                      {announcement.type.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-faint">
                    {announcement.body}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                    <span>
                      {formatDate(
                        announcement.publishedAt ?? announcement.createdAt,
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        },
                      )}
                    </span>

                    {announcement.requiresAcknowledgement && (
                      <span className="font-medium text-brand-700">
                        Acknowledgement required
                      </span>
                    )}
                  </div>
                </div>

                <Link
                  to="/app/announcements"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-[12px] font-medium text-white transition hover:bg-brand-700"
                >
                  View announcements
                  <ExternalLink size={14} />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* =====================================================
          KPI CARDS
      ===================================================== */}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active employees"
          value={kpis.headcount}
          icon={Users}
          iconTone="brand"
          delta={{
            value: `+${kpis.newHires30d} this month`,
            positive: true,
          }}
        />

        <StatCard
          label={
            kpis.attendanceIsToday
              ? "Attendance today"
              : "Attendance (last working day)"
          }
          value={`${kpis.attendanceRate}%`}
          icon={Clock}
          iconTone="success"
          ringValue={kpis.attendanceRate}
          caption={`${kpis.presentToday} of ${kpis.headcount} present`}
        />

        <StatCard
          label="Pending leave approvals"
          value={kpis.pendingLeave}
          icon={CalendarClock}
          iconTone="warning"
          caption={`${kpis.onLeaveToday} on leave today`}
        />

        <StatCard
          label="Open roles"
          value={kpis.openRoles}
          icon={Briefcase}
          iconTone="gold"
          caption="Across all departments"
        />
      </div>

      {/* =====================================================
          MAIN DASHBOARD
      ===================================================== */}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* =================================================
              HEADCOUNT TREND
          ================================================= */}

          <Card>
            <CardHeader
              title="Headcount trend"
              subtitle="Active employees over the last 6 months"
            />

            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.headcountTrend}>
                <defs>
                  <linearGradient
                    id="headcountFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#5B4FE5" stopOpacity={0.25} />

                    <stop offset="100%" stopColor="#5B4FE5" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid vertical={false} stroke="#EFEEEB" />

                <XAxis
                  dataKey="month"
                  tick={{
                    fontSize: 12,
                    fill: "#8A8FA3",
                  }}
                  axisLine={false}
                  tickLine={false}
                />

                <YAxis
                  tick={{
                    fontSize: 12,
                    fill: "#8A8FA3",
                  }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />

                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #E7E5E0",
                    fontSize: 13,
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="headcount"
                  stroke="#5B4FE5"
                  strokeWidth={2.5}
                  fill="url(#headcountFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* =================================================
              HEADCOUNT / GENDER
          ================================================= */}

          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader title="Headcount by department" />

              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={data.headcountByDepartment}
                  layout="vertical"
                  margin={{ left: 8 }}
                >
                  <XAxis type="number" hide />

                  <YAxis
                    type="category"
                    dataKey="department"
                    width={92}
                    tick={{
                      fontSize: 11,
                      fill: "#4B5066",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #E7E5E0",
                      fontSize: 13,
                    }}
                  />

                  <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                    {data.headcountByDepartment.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <CardHeader title="Gender diversity" />

              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={data.genderDiversity}
                    dataKey="count"
                    nameKey="gender"
                    innerRadius={50}
                    outerRadius={78}
                    paddingAngle={3}
                  >
                    {data.genderDiversity.map((_, i) => (
                      <Cell
                        key={i}
                        fill={GENDER_COLORS[i % GENDER_COLORS.length]}
                      />
                    ))}
                  </Pie>

                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #E7E5E0",
                      fontSize: 13,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-2 flex flex-wrap justify-center gap-3">
                {data.genderDiversity.map((g, i) => (
                  <span
                    key={g.gender}
                    className="flex items-center gap-1.5 text-[12px] text-ink-faint"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: GENDER_COLORS[i % GENDER_COLORS.length],
                      }}
                    />
                    {g.gender} · {g.count}
                  </span>
                ))}
              </div>
            </Card>
          </div>

          {/* =================================================
              ATTENDANCE / PAYROLL
          ================================================= */}

          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader
                title="Attendance trend"
                subtitle="% present, last 6 months"
              />

              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data.attendanceTrend}>
                  <CartesianGrid vertical={false} stroke="#EFEEEB" />

                  <XAxis
                    dataKey="month"
                    tick={{
                      fontSize: 11,
                      fill: "#8A8FA3",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <YAxis hide domain={[0, 100]} />

                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #E7E5E0",
                      fontSize: 13,
                    }}
                  />

                  <Line
                    type="monotone"
                    dataKey="presentRate"
                    stroke="#1A9E72"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <CardHeader
                title="Payroll cost trend"
                subtitle="Net payout, last runs"
              />

              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={data.costTrend.map((c) => ({
                    ...c,
                    label: `${monthName(c.month).slice(0, 3)} '${String(
                      c.year,
                    ).slice(2)}`,
                  }))}
                >
                  <CartesianGrid vertical={false} stroke="#EFEEEB" />

                  <XAxis
                    dataKey="label"
                    tick={{
                      fontSize: 11,
                      fill: "#8A8FA3",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <YAxis hide />

                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #E7E5E0",
                      fontSize: 13,
                    }}
                    formatter={(value) => formatCurrencyINR(Number(value ?? 0))}
                  />

                  <Bar
                    dataKey="totalNet"
                    radius={[8, 8, 0, 0]}
                    fill="#C9A14A"
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>

        {/* ===================================================
            RIGHT SIDEBAR
        =================================================== */}

        <div className="space-y-6">
          {/* =================================================
              RECENT ACTIVITY
          ================================================= */}

          <Card>
            <CardHeader title="Recent activity" />

            <div className="space-y-3.5">
              {data.recentActivity.slice(0, 7).map((item: any, i: number) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />

                  <div className="text-[13px] leading-snug">
                    <span className="font-medium text-ink">
                      {item.firstName} {item.lastName}
                    </span>{" "}
                    <span className="text-ink-faint">
                      {item.kind === "leave" && `applied for ${item.label}`}

                      {item.kind === "hire" && `joined as ${item.label}`}

                      {item.kind === "candidate" && `applied for ${item.label}`}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge tone="neutral" className="px-2 py-0.5 text-[10px]">
                        {item.detail.replace(/_/g, " ")}
                      </Badge>

                      <span className="text-[11px] text-ink-faint">
                        {timeAgo(item.at)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* =================================================
              COMING UP
          ================================================= */}

          <Card>
            <CardHeader title="Coming up" />

            <div className="space-y-4">
              {data.upcomingBirthdays.slice(0, 3).map((b: any) => (
                <div key={b.id} className="flex items-center gap-3">
                  <Avatar
                    firstName={b.firstName}
                    lastName={b.lastName}
                    src={b.avatarUrl}
                    size="sm"
                  />

                  <div className="flex-1 text-[13px]">
                    <p className="font-medium text-ink">
                      {b.firstName} {b.lastName}
                    </p>

                    <p className="text-[12px] text-ink-faint">
                      Birthday ·{" "}
                      {formatDate(b.dateOfBirth, {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>

                  <Cake size={15} className="text-gold-500" />
                </div>
              ))}

              {data.upcomingAnniversaries.slice(0, 2).map((a: any) => (
                <div key={a.id} className="flex items-center gap-3">
                  <Avatar
                    firstName={a.firstName}
                    lastName={a.lastName}
                    src={a.avatarUrl}
                    size="sm"
                  />

                  <div className="flex-1 text-[13px]">
                    <p className="font-medium text-ink">
                      {a.firstName} {a.lastName}
                    </p>

                    <p className="text-[12px] text-ink-faint">
                      {a.years}-yr anniversary ·{" "}
                      {formatDate(a.dateOfJoining, {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>

                  <Award size={15} className="text-brand-500" />
                </div>
              ))}

              {data.upcomingHolidays.slice(0, 2).map((h) => (
                <div key={h.id} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success-50">
                    <PartyPopper size={15} className="text-success-700" />
                  </div>

                  <div className="flex-1 text-[13px]">
                    <p className="font-medium text-ink">{h.name}</p>

                    <p className="text-[12px] text-ink-faint">
                      {formatDate(h.date)}
                    </p>
                  </div>
                </div>
              ))}

              {!data.upcomingBirthdays.length &&
                !data.upcomingAnniversaries.length &&
                !data.upcomingHolidays.length && (
                  <p className="text-[13px] text-ink-faint">
                    Nothing on the horizon in the next 30 days.
                  </p>
                )}
            </div>
          </Card>

          {/* =================================================
              RECRUITMENT
          ================================================= */}

          <Link to="/app/recruitment" className="block">
            <Card
              hoverable
              className="bg-gradient-to-br from-brand-600 to-brand-800 text-white"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-medium text-white/70">
                    Recruitment pipeline
                  </p>

                  <p className="mt-1 font-display text-2xl font-medium">
                    {kpis.openRoles} open roles
                  </p>
                </div>

                <ArrowRight size={18} />
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
