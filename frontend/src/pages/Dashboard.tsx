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
  PieChart,
  Pie,
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
  UserCircle2,
  FileText,
  Ticket,
  CheckCircle2,
  ArrowUpRight,
  CalendarDays,
  Wallet,
  ClipboardCheck,
  CircleDollarSign,
} from "lucide-react";

import { Link } from "react-router-dom";
import { DashboardApi, AnnouncementsApi, AttendanceApi, DocumentsApi, LeaveApi, PayrollApi, PerformanceApi } from "@/lib/endpoints";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

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

const DASHBOARD_COLORS = {
  indigo: "#5B4FE5",
  violet: "#7C5CFC",
  emerald: "#16A67A",
  gold: "#C9A14A",
  amber: "#D88A16",
  rose: "#D95B68",
  blue: "#3B82F6",
  slate: "#64748B",
};


function EmployeeSelfServiceDashboard() {
  const { user } = useAuth();
  const employee = user?.employee;
  const employeeId = employee?.id;

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: todayAttendance, isLoading: attendanceTodayLoading } = useQuery({
    queryKey: ["ess", "attendance", "today"],
    enabled: !!employeeId,
    queryFn: AttendanceApi.today,
  });

  const { data: attendanceRecords = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ["ess", "attendance", month, year],
    enabled: !!employeeId,
    queryFn: () => AttendanceApi.mine(month, year),
  });

  const { data: leaveBalances = [], isLoading: leaveBalancesLoading } = useQuery({
    queryKey: ["ess", "leave", "balances", year],
    enabled: !!employeeId,
    queryFn: () => LeaveApi.balances(employeeId, year),
  });

  const { data: leaveRequests = [], isLoading: leaveRequestsLoading } = useQuery({
    queryKey: ["ess", "leave", "requests"],
    enabled: !!employeeId,
    queryFn: () => LeaveApi.requests(),
  });

  const { data: calendarEntries = [] } = useQuery({
    queryKey: ["ess", "calendar", month, year],
    enabled: !!employeeId,
    queryFn: () => LeaveApi.calendar(month, year),
  });

  const { data: payslips = [], isLoading: payslipsLoading } = useQuery({
    queryKey: ["ess", "payslips"],
    enabled: !!employeeId,
    queryFn: PayrollApi.myPayslips,
  });

  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ["ess", "documents", employeeId],
    enabled: !!employeeId,
    queryFn: () => DocumentsApi.list(employeeId!),
  });

  const { data: review, isLoading: reviewLoading } = useQuery({
    queryKey: ["ess", "performance", "review"],
    enabled: !!employeeId,
    queryFn: PerformanceApi.myReview,
  });

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: ["ess", "tickets"],
    enabled: !!employeeId,
    queryFn: async () => {
      const response = await api.get("/tickets/my");
      return (response.data.tickets ?? []) as Array<{
        _id: string;
        ticketId: string;
        subject: string;
        category: string;
        priority: string;
        status: string;
        createdAt: string;
      }>;
    },
  });

  const { data: announcements = [], isLoading: announcementsLoading } =
    useQuery<Announcement[]>({
      queryKey: ["ess", "announcements"],
      queryFn: AnnouncementsApi.list,
      refetchInterval: 30000,
      staleTime: 15000,
    });

  const presentStatuses = new Set([
    "PRESENT",
    "WORK_FROM_HOME",
    "HALF_DAY",
    "LATE",
    "EARLY_DEPARTURE",
  ]);

  const presentDays = attendanceRecords.filter((record: any) =>
    presentStatuses.has(record.status),
  ).length;

  const attendancePercentage =
    attendanceRecords.length > 0
      ? Math.round((presentDays / attendanceRecords.length) * 100)
      : 0;

  const availableLeave = leaveBalances.reduce((total: number, balance: any) => {
    const pending = balance.pendingDays ?? 0;
    return (
      total +
      Math.max(
        0,
        balance.allotted + balance.carriedOver - balance.used - pending,
      )
    );
  }, 0);

  const openTickets = tickets.filter(
    (ticket) => !["CLOSED", "RESOLVED"].includes(ticket.status),
  ).length;

  const publishedAnnouncements = announcements
    .filter((announcement) => announcement.status === "PUBLISHED")
    .sort(
      (a, b) =>
        new Date(b.publishedAt ?? b.createdAt).getTime() -
        new Date(a.publishedAt ?? a.createdAt).getTime(),
    );

  const upcomingCalendarItems = calendarEntries
    .filter((entry: any) => entry.type === "HOLIDAY")
    .sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
    .slice(0, 3);

  const recentLeaveRequests = [...leaveRequests]
    .sort(
      (a, b) =>
        new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime(),
    )
    .slice(0, 4);

  const recentTickets = [...tickets]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 4);

  const latestPayslip = [...payslips]
    .sort((a, b) => {
      const aKey = Number(a.year ?? 0) * 100 + Number(a.month ?? 0);
      const bKey = Number(b.year ?? 0) * 100 + Number(b.month ?? 0);
      return bKey - aKey;
    })[0];

  const greeting =
    now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 17
        ? "Good afternoon"
        : "Good evening";

  const firstName = employee?.firstName ?? "there";

  if (!employeeId) {
    return (
      <div className="rounded-2xl border border-warning-200 bg-warning-50 p-6">
        <p className="font-display text-base font-semibold text-ink">
          Employee profile is not linked to this account.
        </p>
        <p className="mt-1 text-sm text-ink-faint">
          Please contact HR so your employee account can be linked correctly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${firstName} 👋`}
        subtitle="Here's your personal HR summary."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/app/employees/${employeeId}`}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-[12px] font-medium text-ink transition hover:border-brand-200 hover:bg-brand-50"
            >
              <UserCircle2 size={15} />
              My Profile
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/app/attendance" className="block">
          <StatCard
            label="My Attendance"
            value={attendanceLoading ? "—" : `${attendancePercentage}%`}
            icon={Clock}
            iconTone="success"
            ringValue={attendancePercentage}
            caption={`${presentDays} of ${attendanceRecords.length} recorded days`}
          />
        </Link>

        <Link to="/app/leave" className="block">
          <StatCard
            label="Leave Balance"
            value={leaveBalancesLoading ? "—" : `${availableLeave} days`}
            icon={CalendarClock}
            iconTone="warning"
            caption="Available across leave types"
          />
        </Link>

        <Link to="/app/my-tickets" className="block">
          <StatCard
            label="My Tickets"
            value={ticketsLoading ? "—" : `${openTickets} Open`}
            icon={Ticket}
            iconTone="brand"
            caption={`${tickets.length} total submitted`}
          />
        </Link>

        <Link to="/app/announcements" className="block">
          <StatCard
            label="Announcements"
            value={announcementsLoading ? "—" : `${publishedAnnouncements.length} New`}
            icon={Megaphone}
            iconTone="gold"
            caption="Company news and policy updates"
          />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader
                title="Today's Attendance"
                subtitle={now.toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
              />
              {attendanceTodayLoading ? (
                <CardSkeleton />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-success-50 p-4">
                      <p className="text-[11px] font-medium text-ink-faint">
                        Check-in
                      </p>
                      <p className="mt-1 font-display text-lg font-semibold text-ink">
                        {todayAttendance?.checkIn
                          ? new Date(todayAttendance.checkIn).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-brand-50 p-4">
                      <p className="text-[11px] font-medium text-ink-faint">
                        Check-out
                      </p>
                      <p className="mt-1 font-display text-lg font-semibold text-ink">
                        {todayAttendance?.checkOut
                          ? new Date(todayAttendance.checkOut).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-line/60 px-4 py-3">
                    <div>
                      <p className="text-[11px] text-ink-faint">Status</p>
                      <p className="mt-0.5 text-sm font-semibold text-ink">
                        {todayAttendance?.status?.replaceAll("_", " ") ??
                          "Not recorded"}
                      </p>
                    </div>
                    <Link
                      to="/app/attendance"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800"
                    >
                      Open attendance
                      <ArrowUpRight size={13} />
                    </Link>
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader
                title="My Leave Balance"
                subtitle={`${year} leave summary`}
              />
              {leaveBalancesLoading ? (
                <CardSkeleton />
              ) : leaveBalances.length ? (
                <div className="space-y-2.5">
                  {leaveBalances.slice(0, 5).map((balance: any) => {
                    const available = Math.max(
                      0,
                      balance.allotted +
                        balance.carriedOver -
                        balance.used -
                        (balance.pendingDays ?? 0),
                    );
                    return (
                      <div
                        key={balance.id}
                        className="flex items-center gap-3 rounded-xl bg-ink/[0.025] px-3 py-2.5"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: balance.colorHex }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                          {balance.name}
                        </span>
                        <span className="text-[12px] font-semibold text-ink">
                          {available} days
                        </span>
                      </div>
                    );
                  })}
                  <Link
                    to="/app/leave"
                    className="inline-flex items-center gap-1.5 pt-1 text-xs font-semibold text-brand-600 hover:text-brand-800"
                  >
                    Apply / manage leave
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-ink-faint">
                  No leave balances are available yet.
                </p>
              )}
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader
                title="My Recent Leave Requests"
                subtitle="Your latest leave activity"
              />
              {leaveRequestsLoading ? (
                <CardSkeleton />
              ) : recentLeaveRequests.length ? (
                <div className="space-y-3">
                  {recentLeaveRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-start gap-3 rounded-xl border border-line/50 p-3"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                        <CalendarDays size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-ink">
                          {request.leaveTypeName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-faint">
                          {formatDate(request.startDate)} – {formatDate(request.endDate)}
                        </p>
                      </div>
                      <Badge
                        tone={
                          request.status === "APPROVED"
                            ? "success"
                            : request.status === "REJECTED"
                              ? "danger"
                              : request.status === "PENDING"
                                ? "warning"
                                : "neutral"
                        }
                        className="px-2 py-0.5 text-[10px]"
                      >
                        {request.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-faint">
                  You have not submitted any leave requests yet.
                </p>
              )}
            </Card>

            <Card>
              <CardHeader
                title="My Payslips"
                subtitle="Latest salary information"
              />
              {payslipsLoading ? (
                <CardSkeleton />
              ) : latestPayslip ? (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-brand-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-ink-faint">
                          Latest net pay
                        </p>
                        <p className="mt-1 font-display text-2xl font-semibold text-ink">
                          {formatCurrencyINR(latestPayslip.netPay)}
                        </p>
                      </div>
                      <CircleDollarSign className="text-brand-600" size={24} />
                    </div>
                    <p className="mt-2 text-[11px] text-ink-faint">
                      {latestPayslip.month
                        ? monthName(latestPayslip.month)
                        : "Latest"}{" "}
                      {latestPayslip.year ?? ""}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-ink-faint">Payslips available</span>
                    <span className="font-semibold text-ink">
                      {payslips.length}
                    </span>
                  </div>
                  <Link
                    to="/app/payroll"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800"
                  >
                    View all payslips
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              ) : (
                <div className="py-4">
                  <Wallet size={24} className="text-ink-faint" />
                  <p className="mt-2 text-sm font-medium text-ink">
                    No payslips available
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    Payslips will appear here after payroll is processed.
                  </p>
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader
                title="My Tickets"
                subtitle="Your support and grievance requests"
              />
              {ticketsLoading ? (
                <CardSkeleton />
              ) : recentTickets.length ? (
                <div className="space-y-3">
                  {recentTickets.map((ticket) => (
                    <Link
                      key={ticket._id}
                      to={`/app/tickets/${ticket._id}`}
                      className="flex items-start gap-3 rounded-xl border border-line/50 p-3 transition hover:border-brand-200 hover:bg-brand-50/40"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                        <Ticket size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-brand-600">
                          {ticket.ticketId}
                        </p>
                        <p className="truncate text-[12px] font-medium text-ink">
                          {ticket.subject}
                        </p>
                        <p className="mt-0.5 text-[10px] text-ink-faint">
                          {ticket.category} · {formatDate(ticket.createdAt)}
                        </p>
                      </div>
                      <Badge tone="neutral" className="px-2 py-0.5 text-[10px]">
                        {ticket.status.replaceAll("_", " ")}
                      </Badge>
                    </Link>
                  ))}
                  <Link
                    to="/app/my-tickets"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800"
                  >
                    View all my tickets
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              ) : (
                <div className="py-3">
                  <p className="text-sm text-ink-faint">
                    No support or grievance tickets found.
                  </p>
                  <Link
                    to="/app/my-tickets"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600"
                  >
                    Raise a ticket
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader
                title="My Performance"
                subtitle="Current review status"
              />
              {reviewLoading ? (
                <CardSkeleton />
              ) : review ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-ink-faint">
                        {review.cycleName}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ink">
                        {review.status.replaceAll("_", " ")}
                      </p>
                    </div>
                    {review.finalRating !== null && (
                      <div className="rounded-xl bg-gold-50 px-3 py-2 text-right">
                        <p className="text-[10px] text-ink-faint">Final rating</p>
                        <p className="text-sm font-bold text-ink">
                          {review.finalRating}/5
                        </p>
                      </div>
                    )}
                  </div>
                  {review.selfRating !== null && (
                    <div className="rounded-xl bg-ink/[0.03] px-3 py-2.5 text-xs text-ink-soft">
                      Your self-rating:{" "}
                      <span className="font-semibold text-ink">
                        {review.selfRating}/5
                      </span>
                    </div>
                  )}
                  <Link
                    to="/app/performance"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800"
                  >
                    Open performance
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              ) : (
                <div className="py-3">
                  <p className="text-sm font-medium text-ink">
                    No review cycle assigned yet
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    Your manager or HR will initiate your review.
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="My Profile"
              subtitle="Personal information"
            />
            <div className="flex items-center gap-3">
              <Avatar
                firstName={employee.firstName}
                lastName={employee.lastName}
                src={employee.avatarUrl}
                size="md"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {employee.fullName}
                </p>
                <p className="truncate text-xs text-ink-faint">
                  {employee.designationTitle}
                </p>
                <p className="truncate text-[11px] text-ink-faint">
                  {employee.departmentName} · {employee.employeeCode}
                </p>
              </div>
            </div>
            <Link
              to={`/app/employees/${employeeId}`}
              className="mt-4 flex items-center justify-between rounded-xl border border-line/60 px-3 py-2.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50"
            >
              View / update my profile
              <ArrowUpRight size={13} />
            </Link>
          </Card>

          <Card>
            <CardHeader title="My Documents" subtitle="Your HR files" />
            {documentsLoading ? (
              <CardSkeleton />
            ) : documents.length ? (
              <div className="space-y-2.5">
                {documents.slice(0, 5).map((document: any) => (
                  <div
                    key={document.id ?? document._id}
                    className="flex items-center gap-3 rounded-xl border border-line/50 p-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <FileText size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-ink">
                        {document.name ??
                          document.fileName ??
                          document.title ??
                          "HR Document"}
                      </p>
                      <p className="text-[10px] text-ink-faint">
                        {document.type?.replaceAll("_", " ") ?? "Document"}
                      </p>
                    </div>
                  </div>
                ))}
                <Link
                  to="/app/documents"
                  className="inline-flex items-center gap-1.5 pt-1 text-xs font-semibold text-brand-600 hover:text-brand-800"
                >
                  View all documents
                  <ArrowUpRight size={13} />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-ink-faint">
                No HR documents are available yet.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Announcements"
              subtitle="Company news, events and policies"
            />
            {publishedAnnouncements.slice(0, 3).map((announcement) => (
              <Link
                key={announcement.id}
                to="/app/announcements"
                className="mb-3 block rounded-xl border border-line/50 p-3 transition hover:border-brand-200 hover:bg-brand-50/40"
              >
                <div className="flex items-start gap-2">
                  <Megaphone size={14} className="mt-0.5 shrink-0 text-gold-600" />
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-[12px] font-semibold text-ink">
                      {announcement.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-faint">
                      {announcement.body}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
            {!publishedAnnouncements.length && (
              <p className="text-sm text-ink-faint">
                No published announcements available.
              </p>
            )}
            <Link
              to="/app/announcements"
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800"
            >
              View all announcements
              <ArrowUpRight size={13} />
            </Link>
          </Card>

          <Card>
            <CardHeader
              title="My Calendar"
              subtitle="Approved leave and company holidays"
            />
            {upcomingCalendarItems.length ? (
              <div className="space-y-2.5">
                {upcomingCalendarItems.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-2.5"
                  >
                    <PartyPopper size={15} className="text-gold-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-ink">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-ink-faint">
                        {formatDate(item.date)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-faint">
                No company holidays in this month.
              </p>
            )}
            <Link
              to="/app/calendar"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800"
            >
              Open full calendar
              <ArrowUpRight size={13} />
            </Link>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/app/leave"
              className="rounded-xl border border-line/60 bg-white p-3 text-center transition hover:border-brand-200 hover:bg-brand-50"
            >
              <ClipboardCheck className="mx-auto text-brand-600" size={18} />
              <p className="mt-1 text-[11px] font-semibold text-ink">Apply Leave</p>
            </Link>
            <Link
              to="/app/documents"
              className="rounded-xl border border-line/60 bg-white p-3 text-center transition hover:border-brand-200 hover:bg-brand-50"
            >
              <FileText className="mx-auto text-brand-600" size={18} />
              <p className="mt-1 text-[11px] font-semibold text-ink">My Documents</p>
            </Link>
            <Link
              to="/app/payroll"
              className="rounded-xl border border-line/60 bg-white p-3 text-center transition hover:border-brand-200 hover:bg-brand-50"
            >
              <Wallet className="mx-auto text-brand-600" size={18} />
              <p className="mt-1 text-[11px] font-semibold text-ink">My Payslips</p>
            </Link>
            <Link
              to="/app/performance"
              className="rounded-xl border border-line/60 bg-white p-3 text-center transition hover:border-brand-200 hover:bg-brand-50"
            >
              <CheckCircle2 className="mx-auto text-brand-600" size={18} />
              <p className="mt-1 text-[11px] font-semibold text-ink">Performance</p>
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();

  /* =========================================================
     DASHBOARD DATA
  ========================================================= */

  const isEmployee = user?.role === "EMPLOYEE";

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: DashboardApi.overview,
    enabled: !isEmployee,
  });

  if (isEmployee) {
    return <EmployeeSelfServiceDashboard />;
  }

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
    .slice(0, 1);

  if (isLoading || !data) {
    return (
      <div>
        <PageHeader
          title="Dashboard"
          subtitle="A live pulse of Aadhyaraj Technologies."
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({
            length: 5,
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

  const departmentTotal = data.headcountByDepartment.reduce(
    (total: number, item: any) => total + Number(item.count ?? 0),
    0,
  );

  const topDepartments = [...data.headcountByDepartment]
    .sort((a: any, b: any) => Number(b.count ?? 0) - Number(a.count ?? 0))
    .slice(0, 5);

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
          <div className="max-w-xs rounded-2xl border border-brand-200/70 bg-gradient-to-br from-[#F5F3FF] via-white to-[#FFF8E8] p-4 shadow-[0_10px_30px_rgba(91,79,229,0.08)]">
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
          PREMIUM HERO / ANNOUNCEMENT
      ===================================================== */}

      <div className="relative mb-6 overflow-hidden rounded-[26px] bg-gradient-to-r from-[#3026B8] via-[#5B4FE5] to-[#8B6CF6] px-6 py-6 text-white shadow-[0_18px_45px_rgba(91,79,229,0.24)] sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-[#B9A8FF]/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 opacity-20">
          <svg viewBox="0 0 900 100" className="h-full w-full" preserveAspectRatio="none">
            <path
              d="M0 65 C100 20 180 90 290 48 C400 5 470 75 580 42 C700 5 780 70 900 28 L900 100 L0 100 Z"
              fill="currentColor"
            />
          </svg>
        </div>

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" />
              Aadhyaraj Workforce Intelligence
            </div>

            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Great to see you again, {firstName}! <span className="text-white/80">👋</span>
            </h2>

            <p className="mt-2 text-[13px] leading-relaxed text-white/75">
              People <span className="mx-1.5 text-white/40">•</span>
              Technology <span className="mx-1.5 text-white/40">•</span>
              Growth <span className="mx-1.5 text-white/40">•</span>
              Together
            </p>

            <p className="mt-3 max-w-xl text-[12px] text-white/60">
              A live view of your workforce, attendance, leave, payroll and recruitment activity.
            </p>
          </div>

          <div className="relative w-full max-w-sm rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md lg:w-[340px]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
                <Megaphone size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
                  Latest announcement
                </p>
                <p className="mt-1 truncate text-[13px] font-semibold text-white">
                  {dashboardAnnouncements[0]?.title ?? "Your workforce dashboard"}
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/65">
                  {dashboardAnnouncements[0]?.body ?? "Stay on top of the latest HR operations and workforce insights."}
                </p>
              </div>
            </div>

            <Link
              to="/app/announcements"
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-white transition hover:text-white/80"
            >
              View announcements
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      {/* =====================================================
          PREMIUM KPI CARDS
      ===================================================== */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          {
            label: "Active employees",
            value: kpis.headcount,
            caption: `+${kpis.newHires30d} this month`,
            icon: Users,
            bg: "from-[#EEF5FF] via-white to-[#F5F8FF]",
            iconBg: "from-[#2563EB] to-[#4F46E5]",
            iconRing: "ring-blue-100",
            valueColor: "text-[#172554]",
            accent: "#2563EB",
            trend: [38, 44, 42, 50, 55, 64],
          },
          {
            label: kpis.attendanceIsToday ? "Attendance today" : "Attendance (last working day)",
            value: `${kpis.attendanceRate}%`,
            caption: `${kpis.presentToday} of ${kpis.headcount} present`,
            icon: Clock,
            bg: "from-[#ECFDF5] via-white to-[#F4FFFA]",
            iconBg: "from-[#059669] to-[#10B981]",
            iconRing: "ring-emerald-100",
            valueColor: "text-[#064E3B]",
            accent: "#10B981",
            trend: [28, 34, 31, 48, 44, 62],
          },
          {
            label: "Pending leave approvals",
            value: kpis.pendingLeave,
            caption: `${kpis.onLeaveToday} on leave today`,
            icon: CalendarClock,
            bg: "from-[#FFF1F7] via-white to-[#FFF8FB]",
            iconBg: "from-[#DB2777] to-[#F43F5E]",
            iconRing: "ring-pink-100",
            valueColor: "text-[#831843]",
            accent: "#EC4899",
            trend: [62, 48, 54, 43, 51, 39],
          },
          {
            label: "Open roles",
            value: kpis.openRoles,
            caption: "Across all departments",
            icon: Briefcase,
            bg: "from-[#FFF8E8] via-white to-[#FFFCF4]",
            iconBg: "from-[#D97706] to-[#F59E0B]",
            iconRing: "ring-amber-100",
            valueColor: "text-[#78350F]",
            accent: "#F59E0B",
            trend: [32, 38, 30, 44, 41, 50],
          },
          {
            label: "On leave today",
            value: kpis.onLeaveToday,
            caption: "Approved leave today",
            icon: CalendarDays,
            bg: "from-[#F3F0FF] via-white to-[#FAF8FF]",
            iconBg: "from-[#7C3AED] to-[#6366F1]",
            iconRing: "ring-violet-100",
            valueColor: "text-[#4C1D95]",
            accent: "#7C3AED",
            trend: [26, 35, 31, 42, 36, 48],
          },
        ].map((item) => {
          const Icon = item.icon;
          const max = Math.max(...item.trend);
          const min = Math.min(...item.trend);
          const points = item.trend
            .map((v, i) => {
              const x = (i / (item.trend.length - 1)) * 92 + 4;
              const y = 28 - ((v - min) / Math.max(1, max - min)) * 22;
              return `${x},${y}`;
            })
            .join(" ");

          return (
            <Link
              key={item.label}
              to={
                item.label === "Active employees"
                  ? "/app/employees"
                  : item.label.includes("Attendance")
                    ? "/app/attendance"
                    : item.label.includes("leave")
                      ? "/app/leave"
                      : "/app/recruitment"
              }
              className={`group relative overflow-hidden rounded-[22px] border border-white/80 bg-gradient-to-br ${item.bg} p-4 shadow-[0_10px_30px_rgba(15,23,42,0.07)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(15,23,42,0.11)]`}
            >
              <div
                className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-20 blur-2xl"
                style={{ backgroundColor: item.accent }}
              />

              <div className="relative flex items-start justify-between gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.iconBg} text-white shadow-lg ring-4 ${item.iconRing}`}>
                  <Icon size={18} />
                </div>

                <svg viewBox="0 0 100 32" className="mt-1 h-9 w-20 shrink-0 overflow-visible">
                  <polyline
                    points={points}
                    fill="none"
                    stroke={item.accent}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <p className="relative mt-4 text-[11px] font-medium text-slate-500">
                {item.label}
              </p>

              <div className="relative mt-0.5 flex items-end justify-between gap-2">
                <p className={`font-display text-[27px] font-semibold tracking-tight ${item.valueColor}`}>
                  {item.value}
                </p>
                <ArrowUpRight
                  size={15}
                  className="mb-1 text-slate-300 transition group-hover:text-slate-500"
                />
              </div>

              <p className="relative mt-1 text-[10px] text-slate-400">
                {item.caption}
              </p>
            </Link>
          );
        })}
      </div>

      {/* =====================================================
          QUICK ACTIONS
      ===================================================== */}

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display text-[14px] font-semibold text-ink">
              Quick actions
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              Jump directly to common HR operations.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Employees", to: "/app/employees", icon: Users },
            { label: "Leave approvals", to: "/app/leave", icon: CalendarClock },
            { label: "Recruitment", to: "/app/recruitment", icon: Briefcase },
            { label: "Payroll", to: "/app/payroll", icon: Wallet },
            { label: "Announcements", to: "/app/announcements", icon: Megaphone },
          ].map(({ label, to, icon: Icon }) => (
            <Link
              key={label}
              to={to}
              className="group flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-[0_6px_20px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.09)]"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${
                    label === "Employees"
                      ? "bg-blue-50 text-blue-600"
                      : label === "Leave approvals"
                        ? "bg-emerald-50 text-emerald-600"
                        : label === "Recruitment"
                          ? "bg-violet-50 text-violet-600"
                          : label === "Payroll"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-pink-50 text-pink-600"
                  }`}
                >
                  <Icon size={17} />
                </div>
                <span className="text-[12px] font-semibold text-ink">{label}</span>
              </div>
              <ArrowUpRight
                size={15}
                className="text-ink-faint transition group-hover:text-brand-600"
              />
            </Link>
          ))}
        </div>
      </div>

      {/* =====================================================
          MAIN DASHBOARD
      ===================================================== */}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* =================================================
              HEADCOUNT TREND
          ================================================= */}

          <Card className="border-indigo-100/70 bg-gradient-to-b from-[#FCFBFF] via-white to-white shadow-[0_14px_40px_rgba(91,79,229,0.09)]">
            <CardHeader
              title="Headcount trend"
              subtitle="Workforce growth over the last 6 months"
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
                    <stop offset="0%" stopColor={DASHBOARD_COLORS.indigo} stopOpacity={0.25} />

                    <stop offset="100%" stopColor={DASHBOARD_COLORS.indigo} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid vertical={false} stroke="#E8E6F0" />

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
                    border: "1px solid #E4E1EE",
                    fontSize: 13,
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="headcount"
                  stroke={DASHBOARD_COLORS.indigo}
                  strokeWidth={2.5}
                  fill="url(#headcountFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* =================================================
              HEADCOUNT
          ================================================= */}

          <div className="grid gap-6 sm:grid-cols-2">
            <Card className="border-blue-100/70 bg-gradient-to-b from-[#FBFDFF] via-white to-white shadow-[0_14px_40px_rgba(59,130,246,0.08)]">
              <CardHeader
                title="Headcount by department"
                subtitle="Active employees across teams"
              />

              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={data.headcountByDepartment}
                  layout="vertical"
                  margin={{ left: 8, right: 8 }}
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
                      border: "1px solid #E4E1EE",
                      fontSize: 13,
                    }}
                    formatter={(value) => [`${value} employees`, "Headcount"]}
                  />

                  <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                    {data.headcountByDepartment.map((d: any, i: number) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="border-violet-100/70 bg-gradient-to-b from-[#FCFAFF] via-white to-white shadow-[0_14px_40px_rgba(124,92,252,0.08)]">
              <CardHeader
                title="Workforce distribution"
                subtitle="Largest teams by active headcount"
              />

              <div className="flex items-center gap-5">
                <div className="relative h-40 w-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.headcountByDepartment}
                        dataKey="count"
                        nameKey="department"
                        innerRadius={48}
                        outerRadius={68}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {data.headcountByDepartment.map((d: any, i: number) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid #E4E1EE",
                          fontSize: 12,
                        }}
                        formatter={(value) => [`${value} employees`, "Headcount"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-xl font-semibold text-ink">
                      {departmentTotal}
                    </span>
                    <span className="text-[10px] text-ink-faint">Employees</span>
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-2.5">
                  {topDepartments.map((department: any, index: number) => {
                    const count = Number(department.count ?? 0);
                    const percentage = departmentTotal
                      ? Math.round((count / departmentTotal) * 100)
                      : 0;

                    return (
                      <div key={department.department ?? index} className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: department.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">
                          {department.department}
                        </span>
                        <span className="text-[11px] font-semibold text-ink">
                          {count}
                        </span>
                        <span className="w-9 text-right text-[10px] text-ink-faint">
                          {percentage}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-brand-50/70 px-3 py-2.5 text-[11px] text-ink-faint">
                <span className="font-semibold text-brand-700">Top team:</span>{" "}
                {topDepartments[0]?.department ?? "—"}
                {topDepartments[0]
                  ? ` · ${topDepartments[0].count} employees`
                  : ""}
              </div>
            </Card>
          </div>

          {/* =================================================
              ATTENDANCE / PAYROLL
          ================================================= */}

          <div className="grid gap-6 sm:grid-cols-2">
            <Card className="border-emerald-100/70 bg-gradient-to-b from-[#FAFFFC] via-white to-white shadow-[0_14px_40px_rgba(22,166,122,0.08)]">
              <CardHeader
                title="Attendance trend"
                subtitle="Average daily presence over the last 6 months"
              />

              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data.attendanceTrend}>
                  <CartesianGrid vertical={false} stroke="#E8E6F0" />

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
                      border: "1px solid #E4E1EE",
                      fontSize: 13,
                    }}
                  />

                  <Line
                    type="monotone"
                    dataKey="presentRate"
                    stroke={DASHBOARD_COLORS.emerald}
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card className="border-amber-100/70 bg-gradient-to-b from-[#FFFDF8] via-white to-white shadow-[0_14px_40px_rgba(201,161,74,0.08)]">
              <CardHeader
                title="Payroll cost trend"
                subtitle="Net payroll payout across recent runs"
              />

              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={data.costTrend.map((c: any) => ({
                    ...c,
                    label: `${monthName(c.month).slice(0, 3)} '${String(
                      c.year,
                    ).slice(2)}`,
                  }))}
                >
                  <CartesianGrid vertical={false} stroke="#E8E6F0" />

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
                      border: "1px solid #E4E1EE",
                      fontSize: 13,
                    }}
                    formatter={(value) => formatCurrencyINR(Number(value ?? 0))}
                  />

                  <Bar
                    dataKey="totalNet"
                    radius={[8, 8, 0, 0]}
                    fill={DASHBOARD_COLORS.gold}
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

          <Card className="border-slate-200/70 bg-gradient-to-b from-white to-[#FBFAFF] shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
            <CardHeader title="Recent activity" />

            <div className="space-y-3.5">
              {data.recentActivity.slice(0, 7).map((item: any, i: number) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gradient-to-br from-[#7C5CFC] to-[#5B4FE5] shadow-[0_0_0_3px_#F0EDFF]" />

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

          <Card className="border-slate-200/70 bg-gradient-to-b from-white to-[#FFFCF8] shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
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

              {data.upcomingHolidays.slice(0, 2).map((h: any) => (
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
              className="relative overflow-hidden bg-gradient-to-br from-[#3026B8] via-[#5B4FE5] to-[#8B6CF6] text-white shadow-[0_18px_40px_rgba(91,79,229,0.25)]"
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
      <div className="mt-6 overflow-hidden rounded-2xl border border-brand-100/70 bg-gradient-to-r from-[#F1EEFF] via-white to-[#FFF8E8] px-5 py-4 shadow-[0_12px_32px_rgba(91,79,229,0.09)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <Users size={17} />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-ink">Workforce snapshot</p>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                {kpis.headcount} active employees across {data.headcountByDepartment.length} departments.
              </p>
            </div>
          </div>
          <Link
            to="/app/employees"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-600 hover:text-brand-800"
          >
            Manage workforce
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
