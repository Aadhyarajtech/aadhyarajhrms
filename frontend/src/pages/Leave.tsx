import { useMemo, useState, useEffect } from "react";
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
import {
  TextField,
  SelectField,
  TextareaField,
} from "@/components/ui/Field";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import { formatDate, monthName, cx } from "@/lib/format";
import ExpiryBadge from "@/components/common/ExpiryBadge";
import { AiLeaveAssistantView } from "@/components/leave/AiLeaveAssistantView";
import { AiLeaveApprovalModal } from "@/components/leave/AiLeaveApprovalModal";

const MANAGER_ROLES: string[] = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "MANAGER",
];

/**
 * Leave application rules are shared by the form UI and validation:
 * - past dates are not allowed
 * - Saturday/Sunday are not allowed
 */
const getTodayIso = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());

const isWeekendIso = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return false;

  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 || weekday === 6;
};

const getDateRange = (startDate: string, endDate: string) => {
  const dates: string[] = [];
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

  if (
    !startYear ||
    !startMonth ||
    !startDay ||
    !endYear ||
    !endMonth ||
    !endDay
  ) {
    return dates;
  }

  const cursor = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  while (cursor <= end) {
    dates.push(
      [
        cursor.getFullYear(),
        String(cursor.getMonth() + 1).padStart(2, "0"),
        String(cursor.getDate()).padStart(2, "0"),
      ].join("-"),
    );
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const getCalendarDateIso = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

const getLeaveEmployeeName = (entry: any, employee?: any) =>
  [
    entry?.firstName ?? employee?.firstName,
    entry?.lastName ?? employee?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim() ||
  entry?.employeeName ||
  entry?.employee?.fullName ||
  entry?.employee?.name ||
  entry?.fullName ||
  "Team member";

const applySchema = z
  .object({
    leaveTypeId: z.string().min(1, "Select a leave type"),
    startDate: z.string().min(1, "Required"),
    endDate: z.string().min(1, "Required"),
    halfDay: z.boolean().optional().default(false),
    halfDayType: z.enum(["FIRST_HALF", "SECOND_HALF"]).nullable().optional(),
    reason: z.string().min(3, "Add a short reason"),
  })
  .superRefine((value, ctx) => {
    const today = getTodayIso();

    if (value.startDate < today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message: "Leave cannot be applied for a previous date",
      });
    }

    if (value.endDate < today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "Leave cannot be applied for a previous date",
      });
    }

    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date cannot be before start date",
      });
    }

    if (value.startDate <= value.endDate) {
      const weekendDates = getDateRange(value.startDate, value.endDate).filter(
        isWeekendIso,
      );

      if (weekendDates.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startDate"],
          message: "Leave can only be applied on working days. Weekends are not allowed.",
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endDate"],
          message: "Select a working day (Monday-Friday)",
        });
      }
    }

    if (value.halfDay) {
      if (value.startDate !== value.endDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "Half-day leave can only be applied for one day" });
      }
      if (!value.halfDayType) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["halfDayType"], message: "Select first half or second half" });
      }
    } else if (value.halfDayType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["halfDayType"], message: "Half-day type is only allowed for half-day leave" });
    }
  });

type ApplyForm = z.infer<typeof applySchema>;

export default function Leave() {
  const { user } = useAuth();
  const [params] = useSearchParams();

  const isManager =
    !!user && MANAGER_ROLES.includes(user.role);

  const [tab, setTab] = useState(
    params.get("tab") === "team" && isManager
      ? "team"
      : "mine",
  );

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyPrefill, setApplyPrefill] = useState<{
    startDate?: string;
    endDate?: string;
    reason?: string;
    leaveTypeId?: string;
  } | null>(null);

  const tabs = [
    { key: "mine", label: "My Leave" },
    { key: "assistant", label: "AI Leave Assistant ✦" },
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
    <div className="premium-page space-y-1">
      <PageHeader
        title="Leave"
        subtitle="Apply for leave, track balances, and manage approvals."
        action={
          <Button
            leftIcon={<Plus size={16} />}
            onClick={() => {
              setApplyPrefill(null);
              setApplyOpen(true);
            }}
          >
            Apply for leave
          </Button>
        }
      />

      <Tabs
        tabs={tabs}
        active={tab}
        onChange={setTab}
        className="mb-6 w-fit"
      />

      {tab === "mine" && <MyLeave />}
      {tab === "assistant" && (
        <AiLeaveAssistantView
          onApplyWithDates={(payload) => {
            setApplyPrefill(payload);
            setApplyOpen(true);
          }}
        />
      )}
      {tab === "team" && isManager && <TeamApprovals />}
      {tab === "analytics" && isManager && <LeaveAnalytics />}
      {tab === "patterns" && isManager && <LeavePatternDetection />}
      {tab === "calendar" && <LeaveCalendar />}

      <ApplyModal
        open={applyOpen}
        onClose={() => {
          setApplyOpen(false);
          setApplyPrefill(null);
        }}
        prefillData={applyPrefill}
      />
    </div>
  );
}

function MyLeave() {
  const { user } = useAuth();
  const employeeId = user?.employee?.id;

  const {
    data: balances,
    isLoading: balancesLoading,
  } = useQuery({
    queryKey: ["leave", "balances", "mine"],
    queryFn: () => LeaveApi.balances(employeeId),
    enabled: !!employeeId,
  });

  const {
    data: requests,
    isLoading: requestsLoading,
  } = useQuery({
    queryKey: ["leave", "requests", "mine"],
    queryFn: () => LeaveApi.requests({ employeeId }),
    enabled: !!employeeId,
  });

  // Expired leave requests are retained in the database for history, but are
  // intentionally excluded from the active employee list.
  const activeRequests = requests?.filter((request) => request.status !== "EXPIRED");

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

    onError: (err) =>
      showToast(getErrorMessage(err), "error"),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {balancesLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-28 rounded-3xl"
              />
            ))
          : balances?.map((b) => (
              <Card
                key={b.id}
                className="flex items-center justify-between bg-gradient-to-br from-white via-white to-[#F8F7FF]"
              >
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {b.name}
                  </p>

                  <p className="mt-1 text-[12px] text-ink-faint">
                    {b.allotted - b.used} of {b.allotted} days
                    left
                  </p>
                </div>

                <ProgressRing
                  value={
                    ((b.allotted - b.used) / b.allotted) *
                    100
                  }
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
        ) : !activeRequests?.length ? (
          <EmptyState
            icon={CalendarDays}
            title="No leave requests yet"
            description="Apply for leave using the button above."
          />
        ) : (
          <div className="space-y-2">
            {(activeRequests ?? []).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-gradient-to-r from-white to-slate-50/60 px-4 py-3 shadow-[0_4px_14px_rgba(15,23,42,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200/70 hover:shadow-[0_10px_24px_rgba(91,79,229,0.08)]"
              >
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {r.leaveTypeName} · {r.totalDays} day(s)
                  </p>

                  <p className="text-[12px] text-ink-faint">
                    {formatDate(r.startDate)} –{" "}
                    {formatDate(r.endDate)}
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
                  <ExpiryBadge expiresAt={r.expiresAt} expiredAt={r.expiredAt} status={r.status} />

                  {r.status === "PENDING" && (
                    <button
                      onClick={() =>
                        cancelMutation.mutate(r.id)
                      }
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
  const [selectedAiRequest, setSelectedAiRequest] = useState<{
    id: string;
    employeeName: string;
    employeeCode?: string;
    avatarUrl?: string | null;
    leaveTypeName: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    reason: string;
  } | null>(null);

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

  // EXPIRED requests remain stored for audit/history but must not appear in
  // the active team approval list.
  const activeRequests = requests?.filter((request) => request.status !== "EXPIRED");

  const decideMutation = useMutation({
    mutationFn: ({
      id,
      status,
      decisionNote,
    }: {
      id: string;
      status: "APPROVED" | "REJECTED";
      decisionNote?: string;
    }) => LeaveApi.decide(id, status, decisionNote),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["leave"],
      });
      setSelectedAiRequest(null);
      showToast("Decision recorded.");
    },

    onError: (err) =>
      showToast(getErrorMessage(err), "error"),
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
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
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
      ) : !activeRequests?.length ? (
        <EmptyState
          icon={Check}
          title="Nothing to review"
          description="Requests from your direct reports will show up here."
        />
      ) : (
        <div className="space-y-3">
          {(activeRequests ?? []).map((r) => {
            const daysCount =
              r.totalDays && r.totalDays > 0
                ? r.totalDays
                : Math.max(
                    1,
                    Math.round(
                      (new Date(r.endDate).getTime() -
                        new Date(r.startDate).getTime()) /
                        (1000 * 60 * 60 * 24),
                    ) + 1,
                  );

            const durationLabel = (r as any).halfDay
              ? "0.5 day (Half Day)"
              : `${daysCount} ${daysCount === 1 ? "day" : "days"}`;

            return (
              <div
                key={r.id}
                className="group relative rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:border-brand-200 hover:shadow-md"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  {/* Employee info & details */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="shrink-0 ring-2 ring-slate-100 ring-offset-1 rounded-full overflow-hidden mt-0.5">
                      <Avatar
                        firstName={r.firstName}
                        lastName={r.lastName}
                        src={r.avatarUrl}
                        size="md"
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold text-slate-900">
                          {r.firstName} {r.lastName}
                        </span>
                        {r.employeeCode && (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600">
                            {r.employeeCode}
                          </span>
                        )}
                        <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700 border border-brand-200/60">
                          {r.leaveTypeName}
                        </span>
                        <span className="inline-flex items-center rounded-md bg-amber-50/90 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200/60">
                          {durationLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[12px] text-slate-500 font-medium">
                        <CalendarDays size={13} className="text-slate-400 shrink-0" />
                        <span>
                          {formatDate(r.startDate)}
                          {r.startDate !== r.endDate ? ` – ${formatDate(r.endDate)}` : ""}
                        </span>
                      </div>

                      {r.reason && (
                        <p className="mt-1 rounded-xl bg-slate-50/80 border border-slate-100 px-3 py-1.5 text-[12.5px] italic text-slate-600 leading-relaxed">
                          "{r.reason}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {r.status === "PENDING" ? (
                    <div className="flex items-center gap-2 shrink-0 self-end lg:self-center pt-2 lg:pt-0">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedAiRequest({
                            id: r.id,
                            employeeName: `${r.firstName} ${r.lastName}`,
                            employeeCode: r.employeeCode,
                            avatarUrl: r.avatarUrl,
                            leaveTypeName: r.leaveTypeName,
                            startDate: r.startDate,
                            endDate: r.endDate,
                            totalDays: daysCount,
                            reason: r.reason,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200/90 bg-gradient-to-r from-violet-50 via-indigo-50 to-purple-50 px-3.5 py-1.5 text-[12px] font-semibold text-indigo-700 shadow-xs transition-all hover:border-indigo-300 hover:from-violet-100 hover:to-indigo-100 hover:shadow-sm active:scale-[0.98] whitespace-nowrap shrink-0"
                      >
                        <Sparkles size={13} className="text-amber-500 animate-pulse shrink-0" />
                        AI Analysis
                      </button>

                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<X size={14} />}
                        isLoading={decideMutation.isPending}
                        className="border-slate-200 text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
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
                        variant="primary"
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
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <StatusBadge status={r.status} />
                      <ExpiryBadge
                        expiresAt={r.expiresAt}
                        expiredAt={r.expiredAt}
                        status={r.status}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Approval Recommendation Modal */}
      <AiLeaveApprovalModal
        open={!!selectedAiRequest}
        onClose={() => setSelectedAiRequest(null)}
        request={selectedAiRequest}
        onDecide={(id, status, note) =>
          decideMutation.mutate({ id, status, decisionNote: note })
        }
        isDeciding={decideMutation.isPending}
      />
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
  const canSelectEmployee =
    !!user && MANAGER_ROLES.includes(user.role);

  const {
    data: employeeData,
    isLoading: employeesLoading,
  } = useQuery({
    queryKey: [
      "leave",
      "ai",
      "employees",
      user?.role,
      user?.employee?.id,
    ],
    queryFn: async () => {
      const result = await EmployeesApi.list({
        page: 1,
        pageSize: 100,
      });

      return result;
    },
    enabled:
      canSelectEmployee &&
      (user?.role !== "MANAGER" || !!user?.employee?.id),
  });

  const employees = employeeData?.employees ?? [];
  const validDateRange =
    !!startDate &&
    !!endDate &&
    startDate <= endDate;

  const {
    data: analytics,
    isFetching,
    isError,
  } = useQuery({
    queryKey: [
      "leave",
      "ai-analytics",
      startDate,
      endDate,
      employeeId,
    ],
    queryFn: () =>
      LeaveApi.aiAnalytics(
        startDate,
        endDate,
        employeeId || undefined,
      ),
    enabled:
      !!user &&
      MANAGER_ROLES.includes(user.role) &&
      validDateRange,
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
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-brand-300 focus:ring-2 focus:ring-brand-100 text-ink"
            >
              <option value="">Overall</option>

              {employees.map((employee) => (
                <option
                  key={employee.id}
                  value={employee.id}
                >
                  {employee.firstName}{" "}
                  {employee.lastName}
                  {employee.employeeCode
                    ? ` · ${employee.employeeCode}`
                    : ""}
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
            <Skeleton
              key={index}
              className="h-28 rounded-3xl"
            />
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
              <p className="text-[12px] text-ink-faint">
                Total requests
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {analytics.overview.totalRequests}
              </p>
            </Card>

            <Card>
              <p className="text-[12px] text-ink-faint">
                Approved leave days
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {formatNumber(analytics.overview.approvedLeaveDays)}
              </p>
            </Card>

            <Card>
              <p className="text-[12px] text-ink-faint">
                Approval rate
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {formatNumber(analytics.overview.approvalRate)}%
              </p>
            </Card>

            <Card>
              <p className="text-[12px] text-ink-faint">
                Avg. approved duration
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {formatNumber(
                  analytics.overview.averageApprovedLeaveDuration,
                )}{" "}
                <span className="text-sm font-normal text-ink-faint">
                  days
                </span>
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
                  className="rounded-2xl border border-slate-200/70 bg-gradient-to-r from-white to-slate-50/70 px-4 py-3 shadow-[0_4px_14px_rgba(15,23,42,0.035)]"
                >
                  <p className="text-[11px] text-ink-faint">
                    {label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-ink">
                    {value}
                  </p>
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
                      className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-gradient-to-r from-white to-slate-50/60 px-4 py-3 shadow-[0_4px_14px_rgba(15,23,42,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200/70 hover:shadow-[0_10px_24px_rgba(91,79,229,0.08)]"
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
                      className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-gradient-to-r from-white to-slate-50/60 px-4 py-3 shadow-[0_4px_14px_rgba(15,23,42,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200/70 hover:shadow-[0_10px_24px_rgba(91,79,229,0.08)]"
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
                    className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-gradient-to-r from-white to-slate-50/60 px-4 py-3 shadow-[0_4px_14px_rgba(15,23,42,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200/70 hover:shadow-[0_10px_24px_rgba(91,79,229,0.08)]"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
  firstName={employee.firstName ?? ""}
  lastName={employee.lastName ?? ""}
  size="sm"
/>
                      <div>
                        <p className="text-[13px] font-medium text-ink">
                          {[
                            employee.firstName,
                            employee.lastName,
                          ]
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
            <div className="flex items-start gap-3 rounded-2xl border border-brand-100/80 bg-gradient-to-br from-[#F5F2FF] via-white to-[#F8F7FF] p-4 shadow-[0_7px_20px_rgba(91,79,229,0.06)]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-white text-brand-700 shadow-sm">
                <Sparkles
                  size={17}
                  className="text-brand-600"
                />
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

  const canSelectEmployee =
    !!user && MANAGER_ROLES.includes(user.role);

  const {
    data: employeeData,
    isLoading: employeesLoading,
  } = useQuery({
    queryKey: [
      "leave",
      "ai",
      "employees",
      user?.role,
      user?.employee?.id,
    ],
    queryFn: async () => {
      const result = await EmployeesApi.list({
        page: 1,
        pageSize: 100,
      });

      return result;
    },
    enabled:
      canSelectEmployee &&
      (user?.role !== "MANAGER" || !!user?.employee?.id),
  });

  const employees = employeeData?.employees ?? [];

  const validDateRange =
    !!startDate &&
    !!endDate &&
    startDate <= endDate;

  const {
    data: patterns,
    isFetching,
    isError,
  } = useQuery({
    queryKey: [
      "leave",
      "ai-patterns",
      startDate,
      endDate,
      employeeId,
    ],
    queryFn: () =>
      LeaveApi.aiPatterns(
        startDate,
        endDate,
        employeeId || undefined,
      ),
    enabled:
      !!user &&
      MANAGER_ROLES.includes(user.role) &&
      validDateRange,
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
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-brand-300 focus:ring-2 focus:ring-brand-100 text-ink"
            >
              <option value="">Overall</option>

              {employees.map((employee) => (
                <option
                  key={employee.id}
                  value={employee.id}
                >
                  {employee.firstName}{" "}
                  {employee.lastName}
                  {employee.employeeCode
                    ? ` · ${employee.employeeCode}`
                    : ""}
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
            <Skeleton
              key={index}
              className="h-32 rounded-3xl"
            />
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
              <p className="text-[12px] text-ink-faint">
                Patterns detected
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {patterns.patterns.length}
              </p>
            </Card>

            <Card>
              <p className="text-[12px] text-ink-faint">
                Employees analyzed
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {patterns.employeesAnalyzed}
              </p>
            </Card>

            <Card>
              <p className="text-[12px] text-ink-faint">
                Requests analyzed
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
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
                    className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_5px_18px_rgba(15,23,42,0.04)]"
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

            <div className="flex items-start gap-3 rounded-2xl border border-brand-100/80 bg-gradient-to-br from-[#F5F2FF] via-white to-[#F8F7FF] p-4 shadow-[0_7px_20px_rgba(91,79,229,0.06)]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-white text-brand-700 shadow-sm">
                <Sparkles
                  size={17}
                  className="text-brand-600"
                />
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
  const { user } = useAuth();
  const employeeId = user?.employee?.id;
  const [cursor, setCursor] = useState(new Date());
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const month = cursor.getMonth() + 1;
  const year = cursor.getFullYear();
  const todayIso = getTodayIso();
  const currentYear = Number(todayIso.slice(0, 4));
  const [balanceYear, setBalanceYear] = useState(currentYear);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["leave", "calendar", month, year],
    queryFn: () => LeaveApi.calendar(month, year),
    staleTime: 30_000,
  });

  const { data: employeeData } = useQuery({
    queryKey: ["leave", "calendar", "employees"],
    queryFn: () =>
      EmployeesApi.list({
        page: 1,
        pageSize: 100,
      }),
    staleTime: 5 * 60_000,
  });

  const employeeMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const employee of employeeData?.employees ?? []) {
      if (employee?.id) map.set(employee.id, employee);
    }
    return map;
  }, [employeeData?.employees]);

  const { data: balances = [], isFetching: balancesLoading } = useQuery({
    queryKey: ["leave", "balances", "calendar", employeeId, balanceYear],
    queryFn: () => LeaveApi.balances(employeeId, balanceYear),
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const leaveTypes = Array.from(
    new Set(
      entries
        .map((entry: any) => entry.leaveTypeName ?? entry.leaveType ?? "")
        .filter(Boolean),
    ),
  ).sort((a, b) => String(a).localeCompare(String(b)));

  const filteredEntries = entries.filter((entry: any) => {
    const type = String(entry.type ?? "LEAVE").toUpperCase();
    const leaveType = entry.leaveTypeName ?? entry.leaveType ?? "";
    const status = String(entry.status ?? "APPROVED").toUpperCase();

    if (type === "HOLIDAY") return true;

    return (
      (leaveTypeFilter === "ALL" || leaveType === leaveTypeFilter) &&
      (statusFilter === "ALL" || status === statusFilter)
    );
  });

  const days = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const previousMonthDays = firstDay.getDay();
    const cells: Date[] = [];

    for (let i = 0; i < previousMonthDays; i++) {
      cells.push(new Date(year, month - 1, -previousMonthDays + i + 1));
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(year, month - 1, d));
    }

    while (cells.length < 42) {
      const nextDay = cells.length - previousMonthDays - daysInMonth + 1;
      cells.push(new Date(year, month, nextDay));
    }

    return cells;
  }, [month, year]);

  function entriesForDay(date: Date) {
    const iso = getCalendarDateIso(date);
    return filteredEntries.filter((entry: any) => {
      if (String(entry.type).toUpperCase() === "HOLIDAY") {
        return String(entry.date).slice(0, 10) === iso;
      }
      return String(entry.startDate).slice(0, 10) <= iso && String(entry.endDate).slice(0, 10) >= iso;
    });
  }

  const isCurrentMonth = (date: Date) => date.getMonth() === month - 1;

  const monthEntries = filteredEntries.filter((entry: any) => {
    if (String(entry.type).toUpperCase() === "HOLIDAY") return false;
    const start = String(entry.startDate).slice(0, 10);
    const end = String(entry.endDate).slice(0, 10);
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
    return start <= monthEnd && end >= monthStart;
  });

  const onLeaveToday = entries.filter((entry: any) => {
    if (String(entry.type).toUpperCase() !== "LEAVE") return false;
    const start = String(entry.startDate).slice(0, 10);
    const end = String(entry.endDate).slice(0, 10);
    return start <= todayIso && end >= todayIso;
  }).length;

  const upcomingLeaves = entries
    .filter(
      (entry: any) =>
        String(entry.type).toUpperCase() === "LEAVE" &&
        String(entry.endDate).slice(0, 10) >= todayIso,
    )
    .sort(
      (a: any, b: any) =>
        new Date(String(a.startDate).slice(0, 10)).getTime() -
        new Date(String(b.startDate).slice(0, 10)).getTime(),
    )
    .slice(0, 5);

  const holidayEntries = entries.filter(
    (entry: any) => String(entry.type).toUpperCase() === "HOLIDAY",
  );

  const goToday = () => setCursor(new Date());
  const goThisYear = () => {
    setBalanceYear(currentYear);
    setCursor(new Date());
  };
  const goPrevious = () => setCursor(new Date(year, month - 2, 1));
  const goNext = () => setCursor(new Date(year, month, 1));

  const statusOptions = Array.from(
    new Set(
      entries
        .map((entry: any) => String(entry.status ?? "APPROVED").toUpperCase())
        .filter(Boolean),
    ),
  );

  return (
    <div className="space-y-5">
      {/* Calendar header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">
            Leave Calendar
          </h2>
          <p className="mt-1 text-[13px] text-ink-faint">
            View team leaves, company holidays, and plan your time better.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={goToday}>
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={goPrevious}>
              <ChevronLeft size={15} />
            </Button>
            <Button size="sm" variant="outline" onClick={goNext}>
              <ChevronRight size={15} />
            </Button>
          </div>
          <div className="rounded-xl border border-line/60 bg-white px-3 py-2 text-[12px] font-semibold text-ink">
            {monthName(month)} {year}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-gradient-to-br from-brand-50 to-white">
          <p className="text-[11px] font-medium text-ink-faint">Total leave entries</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{monthEntries.length}</p>
          <p className="mt-1 text-[10px] text-ink-faint">For {monthName(month)}</p>
        </Card>
        <Card className="bg-gradient-to-br from-success-50 to-white">
          <p className="text-[11px] font-medium text-ink-faint">On leave today</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{onLeaveToday}</p>
          <p className="mt-1 text-[10px] text-ink-faint">Across the organization</p>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-white">
          <p className="text-[11px] font-medium text-ink-faint">Upcoming leaves</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{upcomingLeaves.length}</p>
          <p className="mt-1 text-[10px] text-ink-faint">Next scheduled requests</p>
        </Card>
        <Card className="bg-gradient-to-br from-gold-50 to-white">
          <p className="text-[11px] font-medium text-ink-faint">Holidays & festivals</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{holidayEntries.length}</p>
          <p className="mt-1 text-[10px] text-ink-faint">Available in calendar data</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line/60 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <select
          value={leaveTypeFilter}
          onChange={(event) => setLeaveTypeFilter(event.target.value)}
          className="rounded-xl border border-line/60 bg-white px-3 py-2 text-[11px] font-medium text-ink outline-none focus:border-brand-300"
        >
          <option value="ALL">All Leave Types</option>
          {leaveTypes.map((leaveType) => (
            <option key={String(leaveType)} value={String(leaveType)}>
              {String(leaveType)}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-xl border border-line/60 bg-white px-3 py-2 text-[11px] font-medium text-ink outline-none focus:border-brand-300"
        >
          <option value="ALL">All Statuses</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-3 text-[10px] text-ink-faint">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> My Leave</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-success-500" /> Team Leave</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Holiday</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gold-500" /> Festival</span>
        </div>
      </div>

      {/* Calendar + side panels */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line/60 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-[15px] font-semibold text-ink">
                  {monthName(month)} {year}
                </p>
                <p className="text-[10px] text-ink-faint">
                  Approved leave and calendar events
                </p>
              </div>
              <button
                type="button"
                onClick={goToday}
                title="Go to current month"
                aria-label="Go to current month"
                className="rounded-lg p-1.5 text-brand-600 transition hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <CalendarDays size={18} />
              </button>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="m-4 h-[560px] rounded-2xl" />
          ) : (
            <div className="grid grid-cols-7">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  className="border-b border-line/60 bg-canvas/60 px-2 py-2.5 text-center text-[10px] font-semibold text-ink-faint"
                >
                  {day}
                </div>
              ))}

              {days.map((date) => {
                const iso = getCalendarDateIso(date);
                const dayEntries = entriesForDay(date);
                const currentMonth = isCurrentMonth(date);
                const isToday = iso === todayIso;
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                return (
                  <div
                    key={iso}
                    className={cx(
                      "min-h-[112px] border-b border-r border-line/50 p-2 text-left transition",
                      !currentMonth && "bg-slate-50/70",
                      isWeekend && currentMonth && "bg-slate-50/80",
                      isToday && "bg-brand-50/60",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cx(
                          "flex h-6 w-6 items-center justify-center rounded-full text-[11px]",
                          isToday
                            ? "bg-brand-600 font-semibold text-white"
                            : currentMonth
                              ? isWeekend
                                ? "font-semibold text-slate-500"
                                : "font-semibold text-slate-800"
                              : "font-medium text-slate-400",
                        )}
                      >
                        {date.getDate()}
                      </span>
                      {dayEntries.length > 0 ? (
                        <span className="text-[9px] font-medium text-slate-500">
                          {dayEntries.length} leave{dayEntries.length > 1 ? "s" : ""}
                        </span>
                      ) : isWeekend && currentMonth ? (
                        <span className="text-[8px] font-medium uppercase tracking-wide text-slate-400">
                          Weekend
                        </span>
                      ) : !currentMonth ? (
                        <span className="text-[8px] font-medium text-slate-400">
                          Outside month
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 space-y-1">
                      {dayEntries.slice(0, 3).map((entry: any) => {
                        const employee = employeeMap.get(entry.employeeId);
                        const employeeName = getLeaveEmployeeName(entry, employee);
                        const type = String(
                          entry.category ?? entry.type ?? entry.leaveTypeName ?? "LEAVE",
                        ).toUpperCase();
                        const isHoliday = type.includes("HOLIDAY");
                        const isFestival = type.includes("FESTIVAL");
                        const isMine = employeeId && entry.employeeId === employeeId;

                        return (
                          <div
                            key={entry.id}
                            title={`${employeeName} · ${entry.leaveTypeName ?? entry.type ?? "Leave"}`}
                            className={cx(
                              "truncate rounded-lg px-2 py-1 text-[9px] font-medium",
                              isHoliday
                                ? "bg-red-50 text-red-700"
                                : isFestival
                                  ? "bg-gold-50 text-gold-700"
                                  : isMine
                                    ? "bg-brand-50 text-brand-700"
                                    : "bg-success-50 text-success-700",
                            )}
                          >
                            {isHoliday || isFestival
                              ? entry.name ?? "Holiday"
                              : `${isMine ? "You" : employeeName} · ${entry.leaveTypeName ?? "Leave"}`}
                          </div>
                        );
                      })}
                      {dayEntries.length > 3 && (
                        <p className="px-1 text-[9px] font-medium text-brand-600">
                          +{dayEntries.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          {/* Leave balance */}
          <Card>
            <div className="flex items-center justify-between">
              <CardHeader title="My Leave Balance" />
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-50 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-100"
                onClick={goThisYear}
                aria-label={`Show leave balance for ${currentYear}`}
              >
                This year
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {balancesLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 rounded-xl" />
                ))
              ) : balances.length ? (
                balances.slice(0, 4).map((balance: any) => {
                  const allotted = Math.max(0, Number(balance.allotted ?? 0));
                  const used = Math.max(0, Number(balance.used ?? 0));
                  const available = Math.max(0, allotted - used);
                  const percentage =
                    allotted > 0
                      ? Math.min(100, Math.round((available / allotted) * 100))
                      : 0;

                  return (
                    <div
                      key={balance.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                    >
                      <p className="truncate text-[10px] font-semibold text-slate-800">
                        {balance.name}
                      </p>
                      <p className="mt-1 text-[14px] font-bold text-slate-900">
                        {available}{" "}
                        <span className="font-medium text-slate-500">
                          / {allotted}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[9px] font-medium text-slate-500">
                        days available
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="col-span-2 py-3 text-[11px] font-medium text-slate-500">
                  No leave balance is available for {balanceYear}.
                </p>
              )}
            </div>
          </Card>

          {/* Upcoming leaves */}
          <Card>
            <div className="flex items-center justify-between">
              <CardHeader title="Upcoming Leaves" />
              <span className="text-[11px] font-medium text-brand-600">
                {upcomingLeaves.length}
              </span>
            </div>

            <div className="space-y-3">
              {upcomingLeaves.map((entry: any) => {
                const employee = employeeMap.get(entry.employeeId);
                const employeeName = getLeaveEmployeeName(entry, employee);

                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white px-2.5 py-2"
                  >
                    <Avatar
                      firstName={entry.firstName ?? employee?.firstName ?? ""}
                      lastName={entry.lastName ?? employee?.lastName ?? ""}
                      src={entry.avatarUrl ?? employee?.avatarUrl}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-slate-900">
                        {employeeName}
                      </p>
                      <p className="truncate text-[10px] font-medium text-slate-600">
                        {entry.leaveTypeName ?? entry.leaveType ?? "Leave"}
                      </p>
                      <p className="text-[9px] font-medium text-slate-500">
                        {formatDate(entry.startDate)} – {formatDate(entry.endDate)}
                      </p>
                    </div>
                  </div>
                );
              })}

              {!upcomingLeaves.length && (
                <p className="py-3 text-[11px] text-ink-faint">
                  No upcoming leaves.
                </p>
              )}
            </div>
          </Card>

          {/* Holidays */}
          <Card>
            <div className="flex items-center justify-between">
              <CardHeader title="Holidays & Festivals" />
              <span className="text-[11px] font-medium text-brand-600">
                {holidayEntries.length}
              </span>
            </div>

            <div className="space-y-2">
              {holidayEntries.slice(0, 5).map((entry: any) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2.5 rounded-xl border border-line/50 bg-canvas/30 p-2.5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-50 text-gold-700">
                    <CalendarDays size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-ink">
                      {entry.name ?? "Holiday"}
                    </p>
                    <p className="text-[9px] text-ink-faint">
                      {formatDate(entry.date)}
                    </p>
                  </div>
                </div>
              ))}

              {!holidayEntries.length && (
                <p className="py-3 text-[11px] text-ink-faint">
                  No holiday entries available for this month.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ApplyModal({
  open,
  onClose,
  prefillData,
}: {
  open: boolean;
  onClose: () => void;
  prefillData?: {
    startDate?: string;
    endDate?: string;
    reason?: string;
    leaveTypeId?: string;
  } | null;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const employeeId = user?.employee?.id;
  const todayIso = getTodayIso();

  const [generatingReason, setGeneratingReason] =
    useState(false);

  const {
    data: leaveTypes,
  } = useQuery({
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
    defaultValues: { halfDay: false, halfDayType: null },
  });

  useEffect(() => {
    if (open) {
      if (prefillData) {
        if (prefillData.startDate) setValue("startDate", prefillData.startDate);
        if (prefillData.endDate) setValue("endDate", prefillData.endDate);
        if (prefillData.reason) setValue("reason", prefillData.reason);
        if (prefillData.leaveTypeId) setValue("leaveTypeId", prefillData.leaveTypeId);
      } else {
        reset();
      }
    }
  }, [open, prefillData, setValue, reset]);

  /*
   * Watch the selected dates so the conflict analysis
   * automatically refreshes whenever the employee changes
   * the leave period.
   */
  const startDate = watch("startDate");
  const endDate = watch("endDate");

  const validDateRange =
    !!startDate &&
    !!endDate &&
    startDate <= endDate;

  const {
    data: conflictAnalysis,
    isFetching: conflictLoading,
    isError: conflictError,
  } = useQuery({
    queryKey: [
      "leave",
      "ai-conflict",
      employeeId,
      startDate,
      endDate,
    ],

    queryFn: () =>
      LeaveApi.checkConflict(
        employeeId!,
        startDate,
        endDate,
      ),

    enabled:
      open &&
      !!employeeId &&
      validDateRange,

    staleTime: 30_000,
  });

  const handleGenerateReason = async () => {
    const reason =
      getValues("reason")?.trim();

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

      const generatedReason =
        await LeaveApi.generateReason(reason);

      setValue(
        "reason",
        generatedReason,
        {
          shouldValidate: true,
          shouldDirty: true,
        },
      );
    } catch (error) {
      console.error(
        "Failed to generate leave reason:",
        error,
      );

      showToast(
        "Unable to generate a professional reason.",
        "error",
      );
    } finally {
      setGeneratingReason(false);
    }
  };

  const mutation = useMutation<
    Awaited<ReturnType<typeof LeaveApi.apply>>,
    unknown,
    ApplyForm
  >({
    mutationFn: async (
      values: ApplyForm,
    ) => {
      /*
       * Existing leave submission logic remains
       * unchanged.
       */
      return LeaveApi.apply({
        leaveTypeId:
          values.leaveTypeId,
        startDate:
          values.startDate,
        endDate:
          values.endDate,
        halfDay: values.halfDay === true,
        halfDayType: values.halfDay ? values.halfDayType ?? null : null,
        reason:
          values.reason,
      });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["leave"],
      });

      showToast(
        "Leave request submitted for approval.",
      );

      reset();
      onClose();
    },

    onError: (err) =>
      showToast(
        getErrorMessage(err),
        "error",
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apply for leave"
      footer={
        <>
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>

          <Button
            onClick={handleSubmit((v) =>
              mutation.mutate(v),
            )}
            isLoading={
              mutation.isPending
            }
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
          error={
            errors.leaveTypeId?.message
          }
          {...register("leaveTypeId")}
        >
          <option value="">
            Select leave type
          </option>

          {leaveTypes?.map((t) => (
            <option
              key={t.id}
              value={t.id}
            >
              {t.name}
            </option>
          ))}
        </SelectField>

        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Start date"
            type="date"
            required
            min={todayIso}
            error={
              errors.startDate?.message
            }
            {...register("startDate")}
          />

          <TextField
            label="End date"
            type="date"
            required
            min={startDate || todayIso}
            error={
              errors.endDate?.message
            }
            {...register("endDate")}
          />
        </div>

        <p className="text-[11px] font-medium text-slate-500">
          Leave can be applied only for today or future working days. Previous
          dates and Saturdays/Sundays are not available for leave application.
        </p>

        <div className="space-y-2 rounded-xl border border-line/60 bg-canvas/30 p-3">
          <label className="flex items-center gap-2 text-[12px] font-medium text-ink">
            <input type="checkbox" className="h-4 w-4 rounded border-line" {...register("halfDay")} />
            Apply as half-day
          </label>
          {watch("halfDay") && (
            <SelectField label="Half-day" required error={errors.halfDayType?.message} {...register("halfDayType")}>
              <option value="">Select half-day</option>
              <option value="FIRST_HALF">First half</option>
              <option value="SECOND_HALF">Second half</option>
            </SelectField>
          )}
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
              Reason{" "}
              <span className="text-danger-500">
                *
              </span>
            </label>

            <button
              type="button"
              onClick={
                handleGenerateReason
              }
              disabled={
                generatingReason
              }
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={13} />

              {generatingReason
                ? "Generating..."
                : "Generate with AI"}
            </button>
          </div>

          <TextareaField
            label=""
            required
            error={
              errors.reason?.message
            }
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
    | (Awaited<
        ReturnType<typeof LeaveApi.checkConflict>
      > & {
        approvalRecommendation?:
          | "APPROVE"
          | "REVIEW"
          | "DO_NOT_APPROVE";
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
      <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50/70 p-4 shadow-[0_5px_18px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-50 text-brand-700 shadow-sm">
            <Sparkles
              size={17}
              className="text-brand-600"
            />
          </div>

          <div>
            <p className="text-[13px] font-medium text-ink">
              Analyzing team availability...
            </p>

            <p className="mt-0.5 text-[11px] text-ink-faint">
              Checking overlapping team leave and generating an
              approval recommendation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50/70 p-4 shadow-[0_5px_18px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-white text-amber-700 shadow-sm">
            <AlertTriangle
              size={17}
              className="text-amber-600"
            />
          </div>

          <div>
            <p className="text-[13px] font-medium text-ink">
              Team availability could not be analyzed
            </p>

            <p className="mt-0.5 text-[11px] leading-5 text-ink-faint">
              The conflict analysis is temporarily unavailable.
              You can still submit your leave request normally.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const recommendation =
    analysis.approvalRecommendation;

  const recommendationStyles = {
    APPROVE: {
      container:
        "border-emerald-200 bg-emerald-50/70",
      icon:
        "bg-emerald-100 text-emerald-600",
      title:
        "text-emerald-800",
      text:
        "text-emerald-700",
      label: "APPROVE",
    },

    REVIEW: {
      container:
        "border-amber-200 bg-amber-50/70",
      icon:
        "bg-amber-100 text-amber-600",
      title:
        "text-amber-800",
      text:
        "text-amber-700",
      label: "REVIEW",
    },

    DO_NOT_APPROVE: {
      container:
        "border-red-200 bg-red-50/70",
      icon:
        "bg-red-100 text-red-600",
      title:
        "text-red-800",
      text:
        "text-red-700",
      label: "DO NOT APPROVE",
    },
  };

  const recommendationStyle =
    recommendation
      ? recommendationStyles[recommendation]
      : recommendationStyles.REVIEW;

  const unavailableEmployees =
    analysis.teamAvailability?.unavailableEmployees ??
    [];

  /*
   * ---------------------------------------------------------
   * No conflict
   * ---------------------------------------------------------
   */
  if (!analysis.hasConflict) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-white p-4 shadow-[0_7px_20px_rgba(16,185,129,0.06)]">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-white text-emerald-700 shadow-sm">
              <CheckCircle2
                size={17}
                className="text-emerald-600"
              />
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
                  No overlapping team leave was detected for
                  the requested period.
                </p>

                {analysis.approvalReasons &&
                  analysis.approvalReasons.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {analysis.approvalReasons.map(
                        (reason, index) => (
                          <p
                            key={index}
                            className={cx(
                              "text-[11px] leading-5",
                              recommendationStyle.text,
                            )}
                          >
                            • {reason}
                          </p>
                        ),
                      )}
                    </div>
                  )}

                <p
                  className={cx(
                    "mt-3 text-[10px] italic",
                    recommendationStyle.text,
                  )}
                >
                  Final approval remains with the authorized
                  HR/manager.
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
      container:
        "border-amber-200 bg-amber-50/60",
      icon:
        "bg-amber-100 text-amber-600",
      title:
        "text-amber-800",
      text:
        "text-amber-700",
      badge:
        "bg-amber-100 text-amber-700",
    },

    MEDIUM: {
      container:
        "border-orange-200 bg-orange-50/60",
      icon:
        "bg-orange-100 text-orange-600",
      title:
        "text-orange-800",
      text:
        "text-orange-700",
      badge:
        "bg-orange-100 text-orange-700",
    },

    HIGH: {
      container:
        "border-red-200 bg-red-50/60",
      icon:
        "bg-red-100 text-red-600",
      title:
        "text-red-800",
      text:
        "text-red-700",
      badge:
        "bg-red-100 text-red-700",
    },
  };

  const styles =
    impactClasses[analysis.impactLevel];

  return (
    <div className="space-y-3">
      {/* Team conflict */}
      <div
        className={cx(
          "rounded-2xl border p-4",
          styles.container,
        )}
      >
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
              <p
                className={cx(
                  "text-[13px] font-semibold",
                  styles.title,
                )}
              >
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
                {analysis.affectedEmployees !== 1
                  ? "s"
                  : ""}{" "}
                affected
              </div>

              <div
                className={cx(
                  "flex items-center gap-1 text-[11px]",
                  styles.text,
                )}
              >
                <CalendarDays size={12} />
                {analysis.affectedDays} overlapping day
                {analysis.affectedDays !== 1
                  ? "s"
                  : ""}
              </div>
            </div>

            <p
              className={cx(
                "mt-2 text-[12px] leading-5",
                styles.text,
              )}
            >
              {analysis.explanation}
            </p>

            {/* Existing conflicts */}
            {analysis.conflicts.length > 0 && (
              <div className="mt-3 space-y-2">
                {analysis.conflicts.map(
                  (conflict) => (
                    <div
                      key={`${conflict.employeeId}-${conflict.startDate}-${conflict.endDate}`}
                      className="rounded-xl border border-black/5 bg-white/70 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-medium text-ink">
                            {[
                              conflict.firstName,
                              conflict.lastName,
                            ]
                              .filter(Boolean)
                              .join(" ") ||
                              "Team member"}
                          </p>

                          <p className="mt-0.5 text-[10px] text-ink-faint">
                            {conflict.leaveTypeName ||
                              "Leave"}{" "}
                            ·{" "}
                            {formatDate(
                              conflict.startDate,
                            )}{" "}
                            –{" "}
                            {formatDate(
                              conflict.endDate,
                            )}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-[10px] font-medium text-ink">
                            {conflict.overlappingDays} day
                            {conflict.overlappingDays !==
                            1
                              ? "s"
                              : ""}{" "}
                            overlap
                          </p>

                          <p className="mt-0.5 text-[9px] text-ink-faint">
                            {conflict.status}
                          </p>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Team availability */}
      {analysis.teamAvailability && (
        <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50/70 p-4 shadow-[0_5px_18px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-2">
            <Users
              size={16}
              className="text-brand-600"
            />

            <p className="text-[13px] font-semibold text-ink">
              Team availability
            </p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200/60 bg-slate-50 px-3 py-2 text-center">
              <p className="text-lg font-semibold text-ink">
                {
                  analysis.teamAvailability
                    .totalTeamMembers
                }
              </p>
              <p className="text-[9px] text-ink-faint">
                Total team
              </p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-center shadow-sm">
              <p className="text-lg font-semibold text-emerald-700">
                {
                  analysis.teamAvailability
                    .availableTeamMembers
                }
              </p>
              <p className="text-[9px] text-emerald-600">
                Available
              </p>
            </div>

            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-center shadow-sm">
              <p className="text-lg font-semibold text-red-700">
                {
                  analysis.teamAvailability
                    .unavailableTeamMembers
                }
              </p>
              <p className="text-[9px] text-red-600">
                Unavailable
              </p>
            </div>
          </div>

          {unavailableEmployees.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-[11px] font-medium text-ink">
                Team members unavailable during this period
              </p>

              <div className="space-y-2">
                {unavailableEmployees.map(
                  (employee) => (
                    <div
                      key={`${employee.employeeId}-${employee.overlapStartDate}`}
                      className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-ink">
                            {[
                              employee.firstName,
                              employee.lastName,
                            ]
                              .filter(Boolean)
                              .join(" ") ||
                              "Team member"}
                          </p>

                          <p className="mt-0.5 text-[10px] text-ink-faint">
                            {employee.leaveTypeName ||
                              "Leave"}{" "}
                            ·{" "}
                            {formatDate(
                              employee.overlapStartDate,
                            )}{" "}
                            -{" "}
                            {formatDate(
                              employee.overlapEndDate,
                            )}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-[10px] font-medium text-ink">
                            {employee.overlappingDays} day
                            {employee.overlappingDays !==
                            1
                              ? "s"
                              : ""}
                          </p>

                          <p className="text-[9px] text-ink-faint">
                            {employee.status}
                          </p>
                        </div>
                      </div>
                    </div>
                  ),
                )}
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
                Based on the current team availability and
                overlapping leave, the recommended action is{" "}
                <strong>
                  {recommendationStyle.label}
                </strong>
                .
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

                    {analysis.approvalReasons.map(
                      (reason, index) => (
                        <p
                          key={index}
                          className={cx(
                            "text-[11px] leading-5",
                            recommendationStyle.text,
                          )}
                        >
                          • {reason}
                        </p>
                      ),
                    )}
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