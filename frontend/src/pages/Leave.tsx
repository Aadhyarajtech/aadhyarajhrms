import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Sparkles,
  AlertTriangle,
  Users,
  CheckCircle2,
} from "lucide-react";
import { EmployeesApi, LeaveApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { StatusBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { TextField, SelectField, TextareaField } from "@/components/ui/Field";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import { formatDate, monthName, cx } from "@/lib/format";

const MANAGER_ROLES: string[] = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"];

const applySchema = z.object({
  leaveTypeId: z.string().min(1, "Select a leave type"),
  startDate: z.string().min(1, "Required"),
  endDate: z.string().min(1, "Required"),
  reason: z.string().min(3, "Add a short reason"),
});

type ApplyForm = z.infer<typeof applySchema>;

export default function Leave() {
  const { hasPermission } = useAuth();
  const [params] = useSearchParams();

  const isManager = hasPermission("leave.manage");

  const [tab, setTab] = useState(
    params.get("tab") === "team" && isManager ? "team" : "mine",
  );

  const [applyOpen, setApplyOpen] = useState(false);

  const tabs = [
    { key: "mine", label: "My Leave" },
    ...(isManager
      ? [
          { key: "team", label: "Team Approvals" },
          { key: "analytics", label: "Leave Analytics" },
          { key: "patterns", label: "Pattern Detection" },
        ]
      : []),
    { key: "calendar", label: "Calendar" },
  ];

  return (
    <div>
      <PageHeader
        title="Leave"
        subtitle="Apply for leave, track balances, and manage approvals."
        action={
          <Button
            leftIcon={<Plus size={16} />}
            onClick={() => setApplyOpen(true)}
          >
            Apply for leave
          </Button>
        }
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-6 w-fit" />

      {tab === "mine" && <MyLeave />}
      {tab === "team" && isManager && <TeamApprovals />}
      {tab === "analytics" && isManager && <LeaveAnalytics />}
      {tab === "patterns" && isManager && <LeavePatternDetection />}
      {tab === "calendar" && <LeaveCalendar />}

      <ApplyModal open={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  );
}

function MyLeave() {
  const { user } = useAuth();
  const employeeId = user?.employee?.id;

  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: ["leave", "balances", "mine"],
    queryFn: () => LeaveApi.balances(employeeId),
    enabled: !!employeeId,
  });

  const { data: requests, isLoading: requestsLoading } = useQuery({
    queryKey: ["leave", "requests", "mine"],
    queryFn: () => LeaveApi.requests({ employeeId }),
    enabled: !!employeeId,
  });

  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const cancelMutation = useMutation({
    mutationFn: (id: string) => LeaveApi.cancel(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["leave"],
      });

      showToast("Leave request cancelled.");
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {balancesLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-3xl" />
            ))
          : balances?.map((b) => (
              <Card key={b.id} className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-ink">{b.name}</p>

                  <p className="mt-1 text-[12px] text-ink-faint">
                    {b.allotted - b.used} of {b.allotted} days left
                  </p>
                </div>

                <ProgressRing
                  value={((b.allotted - b.used) / b.allotted) * 100}
                  size={48}
                  strokeWidth={5}
                  color={b.colorHex}
                  trackColor="#F1F0EE"
                />
              </Card>
            ))}
      </div>

      <Card>
        <CardHeader title="My requests" />

        {requestsLoading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : !requests?.length ? (
          <EmptyState
            icon={CalendarDays}
            title="No leave requests yet"
            description="Apply for leave using the button above."
          />
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3"
              >
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {r.leaveTypeName} · {r.totalDays} day(s)
                  </p>

                  <p className="text-[12px] text-ink-faint">
                    {formatDate(r.startDate)} – {formatDate(r.endDate)}
                  </p>

                  <p className="mt-0.5 text-[12px] text-ink-faint">
                    "{r.reason}"
                  </p>

                  {r.decisionNote && (
                    <p className="mt-0.5 text-[12px] italic text-ink-faint">
                      Note: {r.decisionNote}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={r.status} />

                  {r.status === "PENDING" && (
                    <button
                      onClick={() => cancelMutation.mutate(r.id)}
                      className="text-[11px] font-medium text-danger-500 hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TeamApprovals() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [filter, setFilter] = useState("PENDING");

  const {
    data: requests,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["leave", "requests", "team", filter],

    queryFn: () =>
      LeaveApi.requests({
        scope: "team",
        status: filter || undefined,
      }),
  });

  const decideMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "APPROVED" | "REJECTED";
    }) => LeaveApi.decide(id, status),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["leave"],
      });

      showToast("Decision recorded.");
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Card>
      <CardHeader
        title="Team approvals"
        subtitle="Requests from your direct reports"
        action={
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 rounded-xl border border-line bg-white px-3 text-sm"
          >
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="">All</option>
          </select>
        }
      />

      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : isError ? (
        <EmptyState
          icon={X}
          title="Unable to load team requests"
          description="We couldn't retrieve leave requests for your team."
        />
      ) : !requests?.length ? (
        <EmptyState
          icon={Check}
          title="Nothing to review"
          description="Requests from your direct reports will show up here."
        />
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  firstName={r.firstName}
                  lastName={r.lastName}
                  src={r.avatarUrl}
                  size="sm"
                />

                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {r.firstName} {r.lastName}
                  </p>

                  <p className="text-[12px] text-ink-faint">
                    {r.leaveTypeName} · {formatDate(r.startDate)} –{" "}
                    {formatDate(r.endDate)} ({r.totalDays}d)
                  </p>

                  <p className="text-[12px] text-ink-faint">"{r.reason}"</p>
                </div>
              </div>

              {r.status === "PENDING" ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<X size={14} />}
                    isLoading={decideMutation.isPending}
                    onClick={() =>
                      decideMutation.mutate({
                        id: r.id,
                        status: "REJECTED",
                      })
                    }
                  >
                    Reject
                  </Button>

                  <Button
                    size="sm"
                    leftIcon={<Check size={14} />}
                    isLoading={decideMutation.isPending}
                    onClick={() =>
                      decideMutation.mutate({
                        id: r.id,
                        status: "APPROVED",
                      })
                    }
                  >
                    Approve
                  </Button>
                </div>
              ) : (
                <StatusBadge status={r.status} />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LeaveAnalytics() {
  const { user } = useAuth();

  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 5);
    date.setDate(1);
    return date.toISOString().slice(0, 10);
  });

  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    return date.toISOString().slice(0, 10);
  });

  const [employeeId, setEmployeeId] = useState("");

  /*
   * Employee selector follows the same pattern used by
   * Attendance AI.
   */
  const canSelectEmployee = !!user && MANAGER_ROLES.includes(user.role);

  const { data: employeeData, isLoading: employeesLoading } = useQuery({
    queryKey: ["leave", "ai", "employees", user?.role, user?.employee?.id],
    queryFn: async () => {
      const result = await EmployeesApi.list({
        page: 1,
        pageSize: 100,
      });

      return result;
    },
    enabled:
      canSelectEmployee && (user?.role !== "MANAGER" || !!user?.employee?.id),
  });

  const employees = employeeData?.employees ?? [];
  const validDateRange = !!startDate && !!endDate && startDate <= endDate;

  const {
    data: analytics,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["leave", "ai-analytics", startDate, endDate, employeeId],
    queryFn: () =>
      LeaveApi.aiAnalytics(startDate, endDate, employeeId || undefined),
    enabled: !!user && MANAGER_ROLES.includes(user.role) && validDateRange,
    staleTime: 30_000,
  });

  const formatNumber = (value: number) =>
    Number.isFinite(value) ? value.toFixed(1).replace(/\.0$/, "") : "0";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="AI Leave Analytics"
          subtitle="Understand leave usage, trends, and approval patterns."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <TextField
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />

          <TextField
            label="End date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Employee
            </label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={employeesLoading}
              className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
            >
              <option value="">Overall</option>

              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                  {employee.employeeCode ? ` · ${employee.employeeCode}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {!validDateRange ? (
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Invalid date range"
            description="Select a valid start and end date."
          />
        </Card>
      ) : isFetching ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-3xl" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <EmptyState
            icon={X}
            title="Unable to load leave analytics"
            description="The analytics service is temporarily unavailable."
          />
        </Card>
      ) : !analytics ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="No analytics available"
            description="Select a valid period to analyze leave data."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-[12px] text-ink-faint">Total requests</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {analytics.overview.totalRequests}
              </p>
            </Card>

            <Card>
              <p className="text-[12px] text-ink-faint">Approved leave days</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {formatNumber(analytics.overview.approvedLeaveDays)}
              </p>
            </Card>

            <Card>
              <p className="text-[12px] text-ink-faint">Approval rate</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {formatNumber(analytics.overview.approvalRate)}%
              </p>
            </Card>

            <Card>
              <p className="text-[12px] text-ink-faint">
                Avg. approved duration
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {formatNumber(analytics.overview.averageApprovedLeaveDuration)}{" "}
                <span className="text-sm font-normal text-ink-faint">days</span>
              </p>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Leave overview"
              subtitle={`${analytics.period.startDate} – ${analytics.period.endDate} · ${analytics.scope}`}
            />

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Pending", analytics.overview.pendingRequests],
                ["Approved", analytics.overview.approvedRequests],
                ["Rejected", analytics.overview.rejectedRequests],
                ["Cancelled", analytics.overview.cancelledRequests],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-line/60 bg-surface px-4 py-3"
                >
                  <p className="text-[11px] text-ink-faint">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Leave by type" />
              {!analytics.leaveTypes.length ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No leave type data"
                  description="No leave requests were found for this period."
                />
              ) : (
                <div className="space-y-2">
                  {analytics.leaveTypes.map((item) => (
                    <div
                      key={item.leaveTypeId}
                      className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3"
                    >
                      <div>
                        <p className="text-[13px] font-medium text-ink">
                          {item.leaveTypeName}
                        </p>
                        <p className="text-[11px] text-ink-faint">
                          {item.requestCount} request
                          {item.requestCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <p className="text-[13px] font-semibold text-ink">
                        {formatNumber(item.approvedDays)}d
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Monthly trend" />
              {!analytics.monthlyTrend.length ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No monthly data"
                  description="No leave activity was found for this period."
                />
              ) : (
                <div className="space-y-2">
                  {analytics.monthlyTrend.map((item) => (
                    <div
                      key={item.month}
                      className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3"
                    >
                      <p className="text-[13px] font-medium text-ink">
                        {item.month}
                      </p>
                      <div className="text-right">
                        <p className="text-[12px] font-medium text-ink">
                          {item.requestCount} request
                          {item.requestCount !== 1 ? "s" : ""}
                        </p>
                        <p className="text-[10px] text-ink-faint">
                          {formatNumber(item.approvedDays)} approved day
                          {item.approvedDays !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Top employees by leave usage"
              subtitle="Employees with the highest approved leave days in the selected period."
            />

            {!analytics.topEmployees.length ? (
              <EmptyState
                icon={Users}
                title="No employee data"
                description="No leave activity was found for this period."
              />
            ) : (
              <div className="space-y-2">
                {analytics.topEmployees.map((employee) => (
                  <div
                    key={employee.employeeId}
                    className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        firstName={employee.firstName ?? ""}
                        lastName={employee.lastName ?? ""}
                        size="sm"
                      />
                      <div>
                        <p className="text-[13px] font-medium text-ink">
                          {[employee.firstName, employee.lastName]
                            .filter(Boolean)
                            .join(" ") || "Employee"}
                        </p>
                        <p className="text-[11px] text-ink-faint">
                          {employee.requestCount} request
                          {employee.requestCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    <p className="text-[13px] font-semibold text-ink">
                      {formatNumber(employee.approvedDays)}d
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="AI summary"
              subtitle="Generated from the calculated leave analytics."
            />
            <div className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100">
                <Sparkles size={17} className="text-brand-600" />
              </div>
              <p className="text-[13px] leading-6 text-ink">
                {analytics.explanation}
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function LeavePatternDetection() {
  const { user } = useAuth();

  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 5);
    date.setDate(1);
    return date.toISOString().slice(0, 10);
  });

  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const [employeeId, setEmployeeId] = useState("");

  const canSelectEmployee = !!user && MANAGER_ROLES.includes(user.role);

  const { data: employeeData, isLoading: employeesLoading } = useQuery({
    queryKey: ["leave", "ai", "employees", user?.role, user?.employee?.id],
    queryFn: async () => {
      const result = await EmployeesApi.list({
        page: 1,
        pageSize: 100,
      });

      return result;
    },
    enabled:
      canSelectEmployee && (user?.role !== "MANAGER" || !!user?.employee?.id),
  });

  const employees = employeeData?.employees ?? [];

  const validDateRange = !!startDate && !!endDate && startDate <= endDate;

  const {
    data: patterns,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["leave", "ai-patterns", startDate, endDate, employeeId],
    queryFn: () =>
      LeaveApi.aiPatterns(startDate, endDate, employeeId || undefined),
    enabled: !!user && MANAGER_ROLES.includes(user.role) && validDateRange,
    staleTime: 30_000,
  });

  const patternLabel = (type: string) => {
    switch (type) {
      case "WEEKDAY_PATTERN":
        return "Weekday pattern";
      case "HOLIDAY_ADJACENCY":
        return "Holiday adjacency";
      case "REPEATED_SHORT_LEAVE":
        return "Repeated short leave";
      default:
        return "Leave pattern";
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="AI Leave Pattern Detection"
          subtitle="Identify recurring leave patterns from recorded HRMS leave data."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <TextField
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />

          <TextField
            label="End date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Employee
            </label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={employeesLoading}
              className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
            >
              <option value="">Overall</option>

              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                  {employee.employeeCode ? ` · ${employee.employeeCode}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {!validDateRange ? (
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Invalid date range"
            description="Select a valid start and end date."
          />
        </Card>
      ) : isFetching ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-3xl" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <EmptyState
            icon={X}
            title="Unable to detect leave patterns"
            description="The pattern detection service is temporarily unavailable."
          />
        </Card>
      ) : !patterns ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="No pattern analysis available"
            description="Select a valid period to analyze leave patterns."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-[12px] text-ink-faint">Patterns detected</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {patterns.patterns.length}
              </p>
            </Card>

            <Card>
              <p className="text-[12px] text-ink-faint">Employees analyzed</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {patterns.employeesAnalyzed}
              </p>
            </Card>

            <Card>
              <p className="text-[12px] text-ink-faint">Requests analyzed</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {patterns.requestsAnalyzed}
              </p>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Detected patterns"
              subtitle={`${patterns.period.startDate} – ${patterns.period.endDate} · ${patterns.scope}`}
            />

            {!patterns.patterns.length ? (
              <EmptyState
                icon={CheckCircle2}
                title="No recurring patterns detected"
                description="No supported recurring leave pattern met the detection threshold for this period."
              />
            ) : (
              <div className="space-y-3">
                {patterns.patterns.map((pattern, index) => (
                  <div
                    key={`${pattern.type}-${pattern.employeeId ?? "org"}-${index}`}
                    className="rounded-2xl border border-line/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-medium text-brand-700">
                            {patternLabel(pattern.type)}
                          </span>

                          {pattern.employeeName && (
                            <span className="text-[11px] text-ink-faint">
                              {pattern.employeeName}
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-[13px] font-semibold text-ink">
                          {pattern.title}
                        </p>

                        <p className="mt-1 text-[12px] leading-5 text-ink-faint">
                          {pattern.description}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-lg font-semibold text-ink">
                          {pattern.occurrenceCount}
                        </p>
                        <p className="text-[10px] text-ink-faint">
                          occurrence
                          {pattern.occurrenceCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    {pattern.dates.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pattern.dates.map((date) => (
                          <span
                            key={date}
                            className="rounded-lg bg-surface px-2.5 py-1 text-[10px] text-ink-faint"
                          >
                            {date}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="AI interpretation"
              subtitle="The AI explains detected patterns without changing the underlying data."
            />

            <div className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100">
                <Sparkles size={17} className="text-brand-600" />
              </div>

              <p className="text-[13px] leading-6 text-ink">
                {patterns.explanation}
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function LeaveCalendar() {
  const [cursor, setCursor] = useState(new Date());

  const month = cursor.getMonth() + 1;
  const year = cursor.getFullYear();

  const { data: entries, isLoading } = useQuery({
    queryKey: ["leave", "calendar", month, year],
    queryFn: () => LeaveApi.calendar(month, year),
  });

  const days = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);

    const daysInMonth = new Date(year, month, 0).getDate();

    const startOffset = firstDay.getDay();

    const cells: {
      date: Date | null;
    }[] = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push({ date: null });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        date: new Date(year, month - 1, d),
      });
    }

    return cells;
  }, [month, year]);

  function entriesForDay(date: Date) {
    if (!entries) return [];

    const iso = date.toISOString().slice(0, 10);

    return entries.filter(
      (e: any) =>
        e.startDate.slice(0, 10) <= iso && e.endDate.slice(0, 10) >= iso,
    );
  }

  return (
    <Card>
      <CardHeader
        title={`${monthName(month)} ${year}`}
        subtitle="Approved leave across the organization"
        action={
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCursor(new Date(year, month - 2, 1))}
            >
              <ChevronLeft size={14} />
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setCursor(new Date(year, month, 1))}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="pb-1 text-[11px] font-medium text-ink-faint"
            >
              {d}
            </div>
          ))}

          {days.map((cell, i) => {
            if (!cell.date) {
              return <div key={i} />;
            }

            const dayEntries = entriesForDay(cell.date);

            const isToday =
              cell.date.toDateString() === new Date().toDateString();

            return (
              <div
                key={i}
                className={cx(
                  "min-h-[72px] rounded-xl border border-line/50 p-1.5 text-left",
                  isToday && "border-brand-300 bg-brand-50/40",
                )}
              >
                <p
                  className={cx(
                    "text-[11px]",
                    isToday ? "font-semibold text-brand-600" : "text-ink-faint",
                  )}
                >
                  {cell.date.getDate()}
                </p>

                <div className="mt-1 flex flex-wrap gap-0.5">
                  {dayEntries.slice(0, 3).map((e: any) => (
                    <span
                      key={e.id}
                      title={`${e.firstName} ${e.lastName} — ${e.leaveTypeName}`}
                      className="h-4 w-4 overflow-hidden rounded-full"
                    >
                      <Avatar
                        firstName={e.firstName}
                        lastName={e.lastName}
                        src={e.avatarUrl}
                        size="xs"
                      />
                    </span>
                  ))}

                  {dayEntries.length > 3 && (
                    <span className="text-[9px] text-ink-faint">
                      +{dayEntries.length - 3}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ApplyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const employeeId = user?.employee?.id;

  const [generatingReason, setGeneratingReason] = useState(false);

  const { data: leaveTypes } = useQuery({
    queryKey: ["leave-types"],
    queryFn: LeaveApi.types,
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors },
  } = useForm<ApplyForm>({
    resolver: zodResolver(applySchema),
  });

  /*
   * Watch the selected dates so the conflict analysis
   * automatically refreshes whenever the employee changes
   * the leave period.
   */
  const startDate = watch("startDate");
  const endDate = watch("endDate");

  const validDateRange = !!startDate && !!endDate && startDate <= endDate;

  const {
    data: conflictAnalysis,
    isFetching: conflictLoading,
    isError: conflictError,
  } = useQuery({
    queryKey: ["leave", "ai-conflict", employeeId, startDate, endDate],

    queryFn: () => LeaveApi.checkConflict(employeeId!, startDate, endDate),

    enabled: open && !!employeeId && validDateRange,

    staleTime: 30_000,
  });

  const handleGenerateReason = async () => {
    const reason = getValues("reason")?.trim();

    if (!reason || reason.length < 3) {
      setError("reason", {
        type: "manual",
        message: "Enter a short reason first.",
      });

      return;
    }

    try {
      setGeneratingReason(true);
      clearErrors("reason");

      const generatedReason = await LeaveApi.generateReason(reason);

      setValue("reason", generatedReason, {
        shouldValidate: true,
        shouldDirty: true,
      });
    } catch (error) {
      console.error("Failed to generate leave reason:", error);

      showToast("Unable to generate a professional reason.", "error");
    } finally {
      setGeneratingReason(false);
    }
  };

  const mutation = useMutation<
    Awaited<ReturnType<typeof LeaveApi.apply>>,
    unknown,
    ApplyForm
  >({
    mutationFn: async (values: ApplyForm) => {
      /*
       * Existing leave submission logic remains
       * unchanged.
       */
      return LeaveApi.apply({
        leaveTypeId: values.leaveTypeId,
        startDate: values.startDate,
        endDate: values.endDate,
        reason: values.reason,
      });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["leave"],
      });

      showToast("Leave request submitted for approval.");

      reset();
      onClose();
    },

    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apply for leave"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>

          <Button
            onClick={handleSubmit((v) => mutation.mutate(v))}
            isLoading={mutation.isPending}
          >
            Submit request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          label="Leave type"
          required
          error={errors.leaveTypeId?.message}
          {...register("leaveTypeId")}
        >
          <option value="">Select leave type</option>

          {leaveTypes?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectField>

        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Start date"
            type="date"
            min="1900-01-01"
            max="9999-12-31"
            required
            error={errors.startDate?.message}
            {...register("startDate")}
          />

          <TextField
            label="End date"
            type="date"
            min="1900-01-01"
            max="9999-12-31"
            required
            error={errors.endDate?.message}
            {...register("endDate")}
          />
        </div>

        {/* ------------------------------------------------------------- */}
        {/* AI Leave Conflict & Team Impact                               */}
        {/* ------------------------------------------------------------- */}
        {validDateRange && (
          <LeaveConflictCard
            analysis={conflictAnalysis}
            loading={conflictLoading}
            error={conflictError}
          />
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-ink">
              Reason <span className="text-danger-500">*</span>
            </label>

            <button
              type="button"
              onClick={handleGenerateReason}
              disabled={generatingReason}
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={13} />

              {generatingReason ? "Generating..." : "Generate with AI"}
            </button>
          </div>

          <TextareaField
            label=""
            required
            error={errors.reason?.message}
            {...register("reason")}
          />
        </div>
      </div>
    </Modal>
  );
}

function LeaveConflictCard({
  analysis,
  loading,
  error,
}: {
  analysis:
    | (Awaited<ReturnType<typeof LeaveApi.checkConflict>> & {
        approvalRecommendation?: "APPROVE" | "REVIEW" | "DO_NOT_APPROVE";
        approvalReasons?: string[];
        teamAvailability?: {
          totalTeamMembers: number;
          availableTeamMembers: number;
          unavailableTeamMembers: number;
          unavailableEmployees: Array<{
            employeeId: string;
            firstName?: string | null;
            lastName?: string | null;
            leaveTypeName?: string | null;
            status?: string;
            overlapStartDate: string;
            overlapEndDate: string;
            overlappingDays: number;
          }>;
        };
      })
    | undefined;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-line/60 bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
            <Sparkles size={17} className="text-brand-600" />
          </div>

          <div>
            <p className="text-[13px] font-medium text-ink">
              Analyzing team availability...
            </p>

            <p className="mt-0.5 text-[11px] text-ink-faint">
              Checking overlapping team leave and generating an approval
              recommendation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-line/60 bg-surface p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50">
            <AlertTriangle size={17} className="text-amber-600" />
          </div>

          <div>
            <p className="text-[13px] font-medium text-ink">
              Team availability could not be analyzed
            </p>

            <p className="mt-0.5 text-[11px] leading-5 text-ink-faint">
              The conflict analysis is temporarily unavailable. You can still
              submit your leave request normally.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const recommendation = analysis.approvalRecommendation;

  const recommendationStyles = {
    APPROVE: {
      container: "border-emerald-200 bg-emerald-50/70",
      icon: "bg-emerald-100 text-emerald-600",
      title: "text-emerald-800",
      text: "text-emerald-700",
      label: "APPROVE",
    },

    REVIEW: {
      container: "border-amber-200 bg-amber-50/70",
      icon: "bg-amber-100 text-amber-600",
      title: "text-amber-800",
      text: "text-amber-700",
      label: "REVIEW",
    },

    DO_NOT_APPROVE: {
      container: "border-red-200 bg-red-50/70",
      icon: "bg-red-100 text-red-600",
      title: "text-red-800",
      text: "text-red-700",
      label: "DO NOT APPROVE",
    },
  };

  const recommendationStyle = recommendation
    ? recommendationStyles[recommendation]
    : recommendationStyles.REVIEW;

  const unavailableEmployees =
    analysis.teamAvailability?.unavailableEmployees ?? [];

  /*
   * ---------------------------------------------------------
   * No conflict
   * ---------------------------------------------------------
   */
  if (!analysis.hasConflict) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
              <CheckCircle2 size={17} className="text-emerald-600" />
            </div>

            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-emerald-800">
                No team conflict detected
              </p>

              <p className="mt-1 text-[12px] leading-5 text-emerald-700">
                {analysis.explanation}
              </p>
            </div>
          </div>
        </div>

        {recommendation && (
          <div
            className={cx(
              "rounded-2xl border p-4",
              recommendationStyle.container,
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  recommendationStyle.icon,
                )}
              >
                <Sparkles size={17} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={cx(
                      "text-[13px] font-semibold",
                      recommendationStyle.title,
                    )}
                  >
                    AI approval recommendation
                  </p>

                  <span
                    className={cx(
                      "rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide",
                      recommendationStyle.icon,
                    )}
                  >
                    {recommendationStyle.label}
                  </span>
                </div>

                <p
                  className={cx(
                    "mt-1 text-[12px] leading-5",
                    recommendationStyle.text,
                  )}
                >
                  No overlapping team leave was detected for the requested
                  period.
                </p>

                {analysis.approvalReasons &&
                  analysis.approvalReasons.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {analysis.approvalReasons.map((reason, index) => (
                        <p
                          key={index}
                          className={cx(
                            "text-[11px] leading-5",
                            recommendationStyle.text,
                          )}
                        >
                          • {reason}
                        </p>
                      ))}
                    </div>
                  )}

                <p
                  className={cx(
                    "mt-3 text-[10px] italic",
                    recommendationStyle.text,
                  )}
                >
                  Final approval remains with the authorized HR/manager.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * Conflict detected
   * ---------------------------------------------------------
   */

  const impactClasses = {
    LOW: {
      container: "border-amber-200 bg-amber-50/60",
      icon: "bg-amber-100 text-amber-600",
      title: "text-amber-800",
      text: "text-amber-700",
      badge: "bg-amber-100 text-amber-700",
    },

    MEDIUM: {
      container: "border-orange-200 bg-orange-50/60",
      icon: "bg-orange-100 text-orange-600",
      title: "text-orange-800",
      text: "text-orange-700",
      badge: "bg-orange-100 text-orange-700",
    },

    HIGH: {
      container: "border-red-200 bg-red-50/60",
      icon: "bg-red-100 text-red-600",
      title: "text-red-800",
      text: "text-red-700",
      badge: "bg-red-100 text-red-700",
    },
  };

  const styles = impactClasses[analysis.impactLevel];

  return (
    <div className="space-y-3">
      {/* Team conflict */}
      <div className={cx("rounded-2xl border p-4", styles.container)}>
        <div className="flex items-start gap-3">
          <div
            className={cx(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              styles.icon,
            )}
          >
            <AlertTriangle size={17} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cx("text-[13px] font-semibold", styles.title)}>
                Team leave conflict detected
              </p>

              <span
                className={cx(
                  "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                  styles.badge,
                )}
              >
                {analysis.impactLevel} impact
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <div
                className={cx(
                  "flex items-center gap-1 text-[11px]",
                  styles.text,
                )}
              >
                <Users size={12} />
                {analysis.affectedEmployees} employee
                {analysis.affectedEmployees !== 1 ? "s" : ""} affected
              </div>

              <div
                className={cx(
                  "flex items-center gap-1 text-[11px]",
                  styles.text,
                )}
              >
                <CalendarDays size={12} />
                {analysis.affectedDays} overlapping day
                {analysis.affectedDays !== 1 ? "s" : ""}
              </div>
            </div>

            <p className={cx("mt-2 text-[12px] leading-5", styles.text)}>
              {analysis.explanation}
            </p>

            {/* Existing conflicts */}
            {analysis.conflicts.length > 0 && (
              <div className="mt-3 space-y-2">
                {analysis.conflicts.map((conflict) => (
                  <div
                    key={`${conflict.employeeId}-${conflict.startDate}-${conflict.endDate}`}
                    className="rounded-xl border border-black/5 bg-white/70 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-medium text-ink">
                          {[conflict.firstName, conflict.lastName]
                            .filter(Boolean)
                            .join(" ") || "Team member"}
                        </p>

                        <p className="mt-0.5 text-[10px] text-ink-faint">
                          {conflict.leaveTypeName || "Leave"} ·{" "}
                          {formatDate(conflict.startDate)} –{" "}
                          {formatDate(conflict.endDate)}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-medium text-ink">
                          {conflict.overlappingDays} day
                          {conflict.overlappingDays !== 1 ? "s" : ""} overlap
                        </p>

                        <p className="mt-0.5 text-[9px] text-ink-faint">
                          {conflict.status}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Team availability */}
      {analysis.teamAvailability && (
        <div className="rounded-2xl border border-line/60 bg-surface p-4">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-brand-600" />

            <p className="text-[13px] font-semibold text-ink">
              Team availability
            </p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-surface px-3 py-2 text-center">
              <p className="text-lg font-semibold text-ink">
                {analysis.teamAvailability.totalTeamMembers}
              </p>
              <p className="text-[9px] text-ink-faint">Total team</p>
            </div>

            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center">
              <p className="text-lg font-semibold text-emerald-700">
                {analysis.teamAvailability.availableTeamMembers}
              </p>
              <p className="text-[9px] text-emerald-600">Available</p>
            </div>

            <div className="rounded-xl bg-red-50 px-3 py-2 text-center">
              <p className="text-lg font-semibold text-red-700">
                {analysis.teamAvailability.unavailableTeamMembers}
              </p>
              <p className="text-[9px] text-red-600">Unavailable</p>
            </div>
          </div>

          {unavailableEmployees.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-[11px] font-medium text-ink">
                Team members unavailable during this period
              </p>

              <div className="space-y-2">
                {unavailableEmployees.map((employee) => (
                  <div
                    key={`${employee.employeeId}-${employee.overlapStartDate}`}
                    className="rounded-xl border border-line/60 bg-white px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-ink">
                          {[employee.firstName, employee.lastName]
                            .filter(Boolean)
                            .join(" ") || "Team member"}
                        </p>

                        <p className="mt-0.5 text-[10px] text-ink-faint">
                          {employee.leaveTypeName || "Leave"} ·{" "}
                          {formatDate(employee.overlapStartDate)} -{" "}
                          {formatDate(employee.overlapEndDate)}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-medium text-ink">
                          {employee.overlappingDays} day
                          {employee.overlappingDays !== 1 ? "s" : ""}
                        </p>

                        <p className="text-[9px] text-ink-faint">
                          {employee.status}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI approval recommendation */}
      {recommendation && (
        <div
          className={cx(
            "rounded-2xl border p-4",
            recommendationStyle.container,
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                recommendationStyle.icon,
              )}
            >
              <Sparkles size={17} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={cx(
                    "text-[13px] font-semibold",
                    recommendationStyle.title,
                  )}
                >
                  AI approval recommendation
                </p>

                <span
                  className={cx(
                    "rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide",
                    recommendationStyle.icon,
                  )}
                >
                  {recommendationStyle.label}
                </span>
              </div>

              <p
                className={cx(
                  "mt-2 text-[12px] leading-5",
                  recommendationStyle.text,
                )}
              >
                Based on the current team availability and overlapping leave,
                the recommended action is{" "}
                <strong>{recommendationStyle.label}</strong>.
              </p>

              {analysis.approvalReasons &&
                analysis.approvalReasons.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p
                      className={cx(
                        "text-[11px] font-semibold",
                        recommendationStyle.title,
                      )}
                    >
                      Why?
                    </p>

                    {analysis.approvalReasons.map((reason, index) => (
                      <p
                        key={index}
                        className={cx(
                          "text-[11px] leading-5",
                          recommendationStyle.text,
                        )}
                      >
                        • {reason}
                      </p>
                    ))}
                  </div>
                )}

              <div className="mt-3 flex items-start gap-1.5">
                {/* <Sparkles
                  size={11}
                  className={recommendationStyle.text}
                /> */}

                {/* <p
                  className={cx(
                    "text-[10px] italic",
                    recommendationStyle.text,
                  )}
                >
                  This is an AI-assisted recommendation based
                  on HRMS leave data. Final approval remains
                  with the authorized HR/manager.
                </p> */}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
