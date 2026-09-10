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
} from "lucide-react";
import { LeaveApi } from "@/lib/endpoints";
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

const MANAGER_ROLES: string[] = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "MANAGER",
];

const applySchema = z
  .object({
    leaveTypeId: z.string().min(1, "Select a leave type"),
    startDate: z.string().min(1, "Required"),
    endDate: z.string().min(1, "Required"),
    halfDay: z.boolean().default(false),
    halfDayType: z
      .enum(["FIRST_HALF", "SECOND_HALF"])
      .nullable()
      .optional(),
    reason: z.string().min(3, "Add a short reason"),
  })
  .superRefine((value, ctx) => {
    if (value.halfDay && !value.halfDayType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["halfDayType"],
        message: "Select half-day type",
      });
    }

    if (
      value.halfDay &&
      value.startDate !== value.endDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message:
          "Half-day leave must be for one date",
      });
    }
  });


type ApplyForm = z.infer<typeof applySchema>;

export default function Leave() {
  const { user } = useAuth();
  const [params] = useSearchParams();

  const isManager =
    !!user && MANAGER_ROLES.includes(user.role);

  const isHrOrAdmin =
    !!user &&
    (user.role === "HR_ADMIN" || user.role === "SUPER_ADMIN");

  const requestedTab = params.get("tab");

  const [tab, setTab] = useState(
    requestedTab === "hr" && isHrOrAdmin
      ? "hr"
      : requestedTab === "team" && isManager
        ? "team"
        : "mine",
  );

  const [applyOpen, setApplyOpen] = useState(false);

  const tabs = [
    {
      key: "mine",
      label: "My Leave",
    },
    ...(isManager
      ? [
          {
            key: "team",
            label: "Team Approvals",
          },
        ]
      : []),
    ...(isHrOrAdmin
      ? [
          {
            key: "hr",
            label: "HR Approvals",
          },
        ]
      : []),
    {
      key: "calendar",
      label: "Calendar",
    },
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

      <Tabs
        tabs={tabs}
        active={tab}
        onChange={setTab}
        className="mb-6 w-fit"
      />

      {tab === "mine" && <MyLeave />}

      {tab === "team" && isManager && (
        <TeamApprovals />
      )}

      {tab === "hr" && isHrOrAdmin && (
        <HrApprovals />
      )}

      {tab === "calendar" && <LeaveCalendar />}

      <ApplyModal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
      />
    </div>
  );
}

function MyLeave() {
  const { user } = useAuth();
  const employeeId = user?.employee?.id;

  const { data: leaveTypes } = useQuery({
    queryKey: ["leave-types"],
    queryFn: LeaveApi.types,
    enabled: Boolean(employeeId),
  });

  // Preset color palette fallback when the API does not return colorHex.
  const COLOR_PALETTE = [
    "#4F46E5",
    "#EF4444",
    "#F59E0B",
    "#10B981",
    "#9333EA",
    "#2563EB",
    "#64748B",
  ];

  const {
    data: balances,
    isLoading: balancesLoading,
  } = useQuery({
    queryKey: ["leave", "balances", "mine"],
    queryFn: () => LeaveApi.balances(employeeId),
    enabled: !!employeeId,
  });

  const {
    data: compOffBalance,
    isLoading: compOffBalanceLoading,
  } = useQuery({
    queryKey: ["comp-off-balance", employeeId],
    queryFn: () => LeaveApi.compOffBalance(employeeId),
    enabled: Boolean(employeeId),
  });

  const {
    data: compOffCredits,
    isLoading: compOffCreditsLoading,
  } = useQuery({
    queryKey: ["comp-off-credits", employeeId],
    queryFn: () => LeaveApi.compOffCredits(employeeId),
    enabled: Boolean(employeeId),
  });

  const {
    data: requests,
    isLoading: requestsLoading,
  } = useQuery({
    queryKey: ["leave", "requests", "mine"],
    queryFn: () =>
      LeaveApi.requests({
        employeeId,
      }),
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

    onError: (err) =>
      showToast(
        getErrorMessage(err),
        "error",
      ),
  });

  return (
    <div className="space-y-6">
      {/* =====================================================
          LEAVE BALANCES
      ===================================================== */}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {balancesLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-36 rounded-2xl"
              />
            ))
          : balances?.map((b, index) => {
              const leaveType = leaveTypes?.find(
                (type) =>
                  String(type.id) ===
                  String((b as any).leaveTypeId),
              ) as any;

              const isUnlimited = Boolean((b as any).isUnlimited);
              const pendingApproval = Number(
                (b as any).pendingApproval ??
                  (b as any).pendingDays ??
                  0,
              );

              const calculatedRemaining = Math.max(
                Number(b.allotted ?? 0) -
                  Number(b.used ?? 0) -
                  pendingApproval,
                0,
              );

              const remaining = isUnlimited
                ? null
                : calculatedRemaining;

              const percentage =
                isUnlimited
                  ? 100
                  : Number(b.allotted ?? 0) > 0
                    ? (calculatedRemaining / Number(b.allotted ?? 0)) * 100
                    : 0;

              const hasBalance =
                isUnlimited || calculatedRemaining > 0;

              // Keep the original leave names even when the balance API
              // only returns leaveTypeId instead of name.
              const categoryName =
                (b as any).name ||
                (b as any).leaveTypeName ||
                leaveType?.name ||
                [
                  "Casual Leave",
                  "Sick Leave",
                  "Compensatory Off",
                  "Earned Leave",
                  "Maternity Leave",
                  "Paternity Leave",
                  "Loss of Pay",
                ][index] ||
                `Leave Type ${index + 1}`;

              const cardColor =
                (b as any).colorHex ||
                leaveType?.colorHex ||
                COLOR_PALETTE[index % COLOR_PALETTE.length];

              return (
                <Card
                  key={b.id || index}
                  className={cx(
                    "relative overflow-hidden border border-line/60 transition-all",
                    !hasBalance && "bg-gray-50/50 opacity-80",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-line/40 pb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full shadow-sm"
                        style={{ backgroundColor: cardColor }}
                      />
                      <h3 className="truncate text-sm font-bold text-ink">
                        {categoryName}
                      </h3>
                    </div>

                    <span
                      className={cx(
                        "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        hasBalance
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                          : "bg-gray-100 text-gray-500 border border-gray-200",
                      )}
                    >
                      {hasBalance ? "Available" : "No Balance"}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-display text-3xl font-bold text-ink">
                        {isUnlimited ? "Unlimited" : remaining}
                        {!isUnlimited && (
                          <span className="ml-1.5 text-xs font-medium text-ink-faint">
                            {remaining === 1 ? "day left" : "days left"}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs font-medium text-ink-faint">
                        {isUnlimited
                          ? `${Number(b.used ?? 0)} used · No annual limit`
                          : `${Number(b.used ?? 0)} used · ${Number(b.allotted ?? 0)} allocated`}
                      </p>
                      {pendingApproval > 0 && (
                        <p className="mt-1 text-xs font-semibold text-amber-600">
                          {pendingApproval} day{pendingApproval === 1 ? "" : "s"} pending approval
                        </p>
                      )}
                    </div>

                    <ProgressRing
                      value={percentage}
                      size={48}
                      strokeWidth={5}
                      color={hasBalance ? cardColor : "#D1D5DB"}
                      trackColor="#F1F0EE"
                    />
                  </div>

                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#F1F0EE]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: hasBalance ? cardColor : "#D1D5DB",
                      }}
                    />
                  </div>
                </Card>
              );
            })}
      </div>

      {/* =====================================================
          COMP-OFF
      ===================================================== */}

      <Card>
        <CardHeader
          title="Comp-Off"
          subtitle="Earned compensatory leave from eligible overtime attendance."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Available */}
          <div className="rounded-xl border border-line bg-canvas p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Available
            </p>

            <p className="mt-2 font-display text-2xl font-semibold text-ink">
              {compOffBalanceLoading
                ? "—"
                : `${compOffBalance?.available ?? 0} day${
                    (compOffBalance?.available ?? 0) ===
                    1
                      ? ""
                      : "s"
                  }`}
            </p>
          </div>

          {/* Credited */}
          <div className="rounded-xl border border-line bg-canvas p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Credited
            </p>

            <p className="mt-2 font-display text-2xl font-semibold text-ink">
              {compOffBalanceLoading
                ? "—"
                : `${compOffBalance?.allotted ?? 0} day${
                    (compOffBalance?.allotted ?? 0) ===
                    1
                      ? ""
                      : "s"
                  }`}
            </p>
          </div>

          {/* Used */}
          <div className="rounded-xl border border-line bg-canvas p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Used
            </p>

            <p className="mt-2 font-display text-2xl font-semibold text-ink">
              {compOffBalanceLoading
                ? "—"
                : `${compOffBalance?.used ?? 0} day${
                    (compOffBalance?.used ?? 0) ===
                    1
                      ? ""
                      : "s"
                  }`}
            </p>
          </div>
        </div>

        {/* Comp-Off Credits */}
        <div className="mt-5 border-t border-line pt-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-ink">
              Comp-Off Credits
            </h3>

            <p className="mt-1 text-xs text-ink-faint">
              Active credits and their expiry dates.
            </p>
          </div>

          {compOffCreditsLoading ? (
            <p className="text-sm text-ink-faint">
              Loading Comp-Off credits...
            </p>
          ) : compOffCredits &&
            compOffCredits.length > 0 ? (
            <div className="space-y-2">
              {compOffCredits.map((credit) => (
                <div
                  key={credit.id}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {credit.remainingDays} day
                      {credit.remainingDays === 1
                        ? ""
                        : "s"}{" "}
                      remaining
                    </p>

                    <p className="mt-1 text-xs text-ink-faint">
                      Credited:{" "}
                      {new Date(
                        credit.creditedAt,
                      ).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-xs font-medium text-ink-faint">
                      Expires
                    </p>

                    <p className="mt-1 text-sm font-medium text-ink">
                      {new Date(
                        credit.expiresAt,
                      ).toLocaleDateString()}
                    </p>

                    <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                      {credit.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-faint">
              No Comp-Off credits available.
            </p>
          )}
        </div>
      </Card>

      {/* =====================================================
          MY REQUESTS
      ===================================================== */}

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
                    {r.leaveTypeName} ·{" "}
                    {r.totalDays} day(s)
                  </p>

                  <p className="text-[12px] text-ink-faint">
                    {formatDate(r.startDate)} –{" "}
                    {formatDate(r.endDate)}
                  </p>

                  {(() => {
                    const stage = String(
                      (r as any)?.approvalStage ?? "",
                    ).toUpperCase();
                    const managerStatus = String(
                      (r as any)?.managerApprovalStatus ?? "",
                    ).toUpperCase();
                    let label = "Manager Approval Pending";
                    let className =
                      "bg-blue-50 text-blue-700 border border-blue-200";

                    if (stage === "HR_PENDING") {
                      label = "HR Approval Pending";
                      className =
                        "bg-amber-50 text-amber-700 border border-amber-200";
                    } else if (
                      r.status === "APPROVED" ||
                      stage === "COMPLETED"
                    ) {
                      label = "Approval Completed";
                      className =
                        "bg-emerald-50 text-emerald-700 border border-emerald-200";
                    } else if (
                      r.status === "REJECTED" ||
                      managerStatus === "REJECTED"
                    ) {
                      label = "Rejected";
                      className =
                        "bg-red-50 text-red-700 border border-red-200";
                    }

                    return (
                      <span
                        className={cx(
                          "mt-1 inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                          className,
                        )}
                      >
                        {label}
                      </span>
                    );
                  })()}

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
  const { user } = useAuth();

  const isHrOrAdmin =
    user?.role === "HR_ADMIN" ||
    user?.role === "SUPER_ADMIN";

  function getApprovalStage(r: any) {
    const stage = String((r as any)?.approvalStage ?? "").toUpperCase();
    const managerStatus = String(
      r?.managerApprovalStatus ?? "",
    ).toUpperCase();
    if (stage === "HR_PENDING") {
      return {
        label: "HR Approval Pending",
        className:
          "bg-amber-50 text-amber-700 border border-amber-200",
      };
    }

    if (stage === "COMPLETED" || r?.status === "APPROVED") {
      return {
        label: "Approval Completed",
        className:
          "bg-emerald-50 text-emerald-700 border border-emerald-200",
      };
    }

    if (r?.status === "REJECTED" || managerStatus === "REJECTED") {
      return {
        label: "Rejected",
        className:
          "bg-red-50 text-red-700 border border-red-200",
      };
    }

    return {
      label: "Manager Approval Pending",
      className:
        "bg-blue-50 text-blue-700 border border-blue-200",
    };
  }
  const [filter, setFilter] =
    useState("PENDING");

  const {
    data: requests,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [
      "leave",
      "requests",
      "team",
      filter,
    ],

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

    onError: (err) =>
      showToast(
        getErrorMessage(err),
        "error",
      ),
  });

  return (
    <Card>
      <CardHeader
        title="Team approvals"
        subtitle="Requests from your direct reports"
        action={
          <select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value)
            }
            className="h-9 rounded-xl border border-line bg-white px-3 text-sm"
          >
            <option value="PENDING">
              Pending
            </option>

            <option value="APPROVED">
              Approved
            </option>

            <option value="REJECTED">
              Rejected
            </option>

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
                    {r.leaveTypeName} ·{" "}
                    {formatDate(r.startDate)} –{" "}
                    {formatDate(r.endDate)}{" "}
                    ({r.totalDays}d)
                  </p>

                  <p className="text-[12px] text-ink-faint">
                    "{r.reason}"
                  </p>

                  {(() => {
                    const stage = getApprovalStage(r);
                    return (
                      <span
                        className={cx(
                          "mt-2 inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                          stage.className,
                        )}
                      >
                        {stage.label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {r.status === "PENDING" ? (
                <div className="flex flex-col items-end gap-2">
                  {String((r as any)?.approvalStage ?? "").toUpperCase() ===
                    "HR_PENDING" && !isHrOrAdmin ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
                      Waiting for HR approval
                    </span>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<X size={14} />}
                        isLoading={
                          decideMutation.isPending
                        }
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
                        isLoading={
                          decideMutation.isPending
                        }
                        onClick={() =>
                          decideMutation.mutate({
                            id: r.id,
                            status: "APPROVED",
                          })
                        }
                      >
                        {String((r as any)?.approvalStage ?? "").toUpperCase() ===
                        "HR_PENDING"
                          ? "Final Approve"
                          : "Approve"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={r.status} />
                  {r.status === "APPROVED" &&
                    String((r as any)?.hrApprovalStatus ?? "").toUpperCase() ===
                      "APPROVED" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                        HR Approved
                      </span>
                    )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function HrApprovals() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [filter, setFilter] = useState("PENDING");

  const {
    data: requests,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["leave", "requests", "hr", filter],
    queryFn: () =>
      LeaveApi.requests({
        status: filter === "PENDING" ? "PENDING" : undefined,
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
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      showToast("HR decision recorded.");
    },

    onError: (err) =>
      showToast(getErrorMessage(err), "error"),
  });

  const visibleRequests = (requests ?? []).filter((request: any) => {
    const status = String(request?.status ?? "").toUpperCase();
    const stage = String(request?.approvalStage ?? "").toUpperCase();
    const hrStatus = String(request?.hrApprovalStatus ?? "").toUpperCase();

    if (filter === "PENDING") {
      // CRITICAL: manager must approve first.
      return status === "PENDING" && stage === "HR_PENDING";
    }

    if (filter === "APPROVED") {
      return status === "APPROVED" && hrStatus === "APPROVED";
    }

    if (filter === "REJECTED") {
      return status === "REJECTED" && hrStatus === "REJECTED";
    }

    // "All" still excludes manager-pending sensitive leaves from the HR page.
    return (
      (status === "PENDING" && stage === "HR_PENDING") ||
      (status === "APPROVED" && hrStatus === "APPROVED") ||
      (status === "REJECTED" && hrStatus === "REJECTED")
    );
  });

  return (
    <Card>
      <CardHeader
        title="HR approvals"
        subtitle="Sensitive leave requests awaiting HR final approval"
        action={
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="h-9 rounded-xl border border-line bg-white px-3 text-sm"
          >
            <option value="PENDING">Pending HR approval</option>
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
          title="Unable to load HR requests"
          description="We couldn't retrieve leave requests for HR review."
        />
      ) : !visibleRequests.length ? (
        <EmptyState
          icon={Check}
          title="No HR approvals pending"
          description="Manager-approved sensitive leave requests will appear here."
        />
      ) : (
        <div className="space-y-2">
          {visibleRequests.map((request: any) => {
            const stage = String(request?.approvalStage ?? "").toUpperCase();
            const isHrPending = stage === "HR_PENDING" && request?.status === "PENDING";

            return (
              <div
                key={request.id}
                className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    firstName={request.firstName}
                    lastName={request.lastName}
                    src={request.avatarUrl}
                    size="sm"
                  />

                  <div>
                    <p className="text-[13px] font-medium text-ink">
                      {request.firstName} {request.lastName}
                    </p>

                    <p className="text-[12px] text-ink-faint">
                      {request.leaveTypeName} · {formatDate(request.startDate)} – {formatDate(request.endDate)} ({request.totalDays}d)
                    </p>

                    <p className="text-[12px] text-ink-faint">
                      "{request.reason}"
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {stage === "HR_PENDING" && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700">
                          Manager Approved
                        </span>
                      )}

                      <span
                        className={cx(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                          isHrPending
                            ? "border border-amber-200 bg-amber-50 text-amber-700"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-700",
                        )}
                      >
                        {isHrPending ? "HR Pending" : "HR Approved"}
                      </span>
                    </div>
                  </div>
                </div>

                {isHrPending ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<X size={14} />}
                      isLoading={decideMutation.isPending}
                      onClick={() =>
                        decideMutation.mutate({
                          id: request.id,
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
                          id: request.id,
                          status: "APPROVED",
                        })
                      }
                    >
                      Final Approve
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={request.status} />
                    {String(request?.hrApprovalStatus ?? "").toUpperCase() === "APPROVED" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                        HR Approved
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function LeaveCalendar() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const month = cursor.getMonth() + 1;
  const year = cursor.getFullYear();

  const {
    data: entries,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["leave", "calendar", month, year, user?.role, user?.employee?.id],
    queryFn: () => LeaveApi.calendar(month, year),
    enabled: Boolean(user),
  });

  function toDateOnly(value: unknown): string {
    if (!value) return "";
    const text = String(value);
    return text.length >= 10 ? text.slice(0, 10) : text;
  }

  function localDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  const days = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const startOffset = firstDay.getDay();
    const cells: { date: Date | null }[] = [];

    for (let i = 0; i < startOffset; i += 1) {
      cells.push({ date: null });
    }

    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push({ date: new Date(year, month - 1, d) });
    }

    return cells;
  }, [month, year]);

  const calendarEntries = Array.isArray(entries) ? entries : [];

  function leaveEntriesForDay(date: Date) {
    const iso = localDateKey(date);

    return calendarEntries.filter((entry: any) => {
      if (String(entry?.type ?? "").toUpperCase() !== "LEAVE") {
        return false;
      }

      const startDate = toDateOnly(entry?.startDate);
      const endDate = toDateOnly(entry?.endDate);

      return Boolean(startDate && endDate && startDate <= iso && endDate >= iso);
    });
  }

  function holidayForDay(date: Date) {
    const iso = localDateKey(date);

    return (
      calendarEntries.find(
        (entry: any) =>
          String(entry?.type ?? "").toUpperCase() === "HOLIDAY" &&
          toDateOnly(entry?.date) === iso,
      ) ?? null
    );
  }

  const selectedEntries = selectedDate
    ? calendarEntries.filter((entry: any) => {
        if (String(entry?.type ?? "").toUpperCase() !== "LEAVE") {
          return false;
        }

        const startDate = toDateOnly(entry?.startDate);
        const endDate = toDateOnly(entry?.endDate);
        return Boolean(
          startDate && endDate && startDate <= selectedDate && endDate >= selectedDate,
        );
      })
    : [];

  const selectedHoliday = selectedDate
    ? calendarEntries.find(
        (entry: any) =>
          String(entry?.type ?? "").toUpperCase() === "HOLIDAY" &&
          toDateOnly(entry?.date) === selectedDate,
      )
    : null;

  return (
    <Card>
      <CardHeader
        title={`${monthName(month)} ${year}`}
        subtitle={
          user?.role === "HR_ADMIN" || user?.role === "SUPER_ADMIN"
            ? "All approved employee leaves and company holidays — click a date for details"
            : user?.role === "MANAGER"
              ? "Your approved leave and your team's approved leaves — click a date for details"
              : "Your approved leave and company holidays — click a date for details"
        }
        action={
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedDate(null);
                setCursor(new Date(year, month - 2, 1));
              }}
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedDate(null);
                setCursor(new Date(year, month, 1));
              }}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : isError ? (
        <EmptyState
          icon={X}
          title="Unable to load leave calendar"
          description="We couldn't retrieve approved leaves and company holidays."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3 text-xs text-ink-faint">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
              Approved Leave
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              Company Holiday
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
              <div
                key={dayName}
                className="pb-1 text-[11px] font-medium text-ink-faint"
              >
                {dayName}
              </div>
            ))}

            {days.map((cell, index) => {
              if (!cell.date) return <div key={`empty-${index}`} />;

              const dayEntries = leaveEntriesForDay(cell.date);
              const holiday = holidayForDay(cell.date);
              const dateKey = localDateKey(cell.date);
              const isSelected = selectedDate === dateKey;
              const isToday = cell.date.toDateString() === new Date().toDateString();

              return (
                <button
                  type="button"
                  key={dateKey}
                  onClick={() => setSelectedDate(dateKey)}
                  className={cx(
                    "min-h-[118px] w-full rounded-xl border border-line/50 p-1.5 text-left transition hover:border-brand-300 hover:bg-brand-50/20",
                    isToday && "border-brand-300 bg-brand-50/40",
                    holiday && "border-amber-300 bg-amber-50/60",
                    isSelected && "ring-2 ring-brand-300 ring-offset-1",
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p
                      className={cx(
                        "text-[11px]",
                        isToday ? "font-semibold text-brand-600" : "text-ink-faint",
                      )}
                    >
                      {cell.date.getDate()}
                    </p>

                    {holiday && (
                      <span
                        title={holiday.name}
                        className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
                      />
                    )}
                  </div>

                  {holiday && (
                    <p
                      title={holiday.name}
                      className="mt-1 truncate text-[9px] font-semibold text-amber-700"
                    >
                      {holiday.name}
                    </p>
                  )}

                  {dayEntries.length > 0 && (
                    <div className="mt-1">
                      <div className="mb-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[9px] font-semibold text-brand-700">
                        {dayEntries.length} employee{dayEntries.length === 1 ? "" : "s"} on leave
                      </div>

                      <div className="space-y-1">
                        {dayEntries.slice(0, 2).map((entry: any) => {
                          const leaveColor = entry?.leaveTypeColor || "#4F46E5";
                          const employeeName =
                            [entry?.firstName, entry?.lastName].filter(Boolean).join(" ") ||
                            "Employee";

                          return (
                            <div
                              key={`${entry.id}-${dateKey}`}
                              title={`${employeeName} — ${entry?.leaveTypeName || "Leave"}`}
                              className="flex items-center gap-1.5 rounded-md bg-white/90 px-1 py-1 shadow-sm ring-1 ring-line/40"
                            >
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: leaveColor }}
                              />
                              <span className="min-w-0 truncate text-[9px] font-semibold text-ink">
                                {employeeName}
                              </span>
                            </div>
                          );
                        })}

                        {dayEntries.length > 2 && (
                          <p className="text-[9px] font-medium text-ink-faint">
                            +{dayEntries.length - 2} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {selectedDate && (
            <div className="mt-5 rounded-2xl border border-line bg-canvas p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    Leave details for {formatDate(selectedDate)}
                  </h3>
                  <p className="mt-1 text-xs text-ink-faint">
                    {selectedEntries.length} approved employee leave{selectedEntries.length === 1 ? "" : "s"}
                    {selectedHoliday ? " · 1 company holiday" : ""}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="text-xs font-medium text-ink-faint hover:text-ink"
                >
                  Clear
                </button>
              </div>

              {!selectedEntries.length && !selectedHoliday ? (
                <p className="mt-3 text-sm text-ink-faint">
                  No approved leave or company holiday on this date.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {selectedHoliday && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs font-semibold text-amber-800">
                        Company Holiday: {selectedHoliday.name}
                      </p>
                    </div>
                  )}

                  {selectedEntries.map((entry: any) => {
                    const employeeName =
                      [entry?.firstName, entry?.lastName].filter(Boolean).join(" ") ||
                      "Employee";

                    return (
                      <div
                        key={`selected-${entry.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-white px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar
                            firstName={entry?.firstName}
                            lastName={entry?.lastName}
                            src={entry?.avatarUrl}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">
                              {employeeName}
                            </p>
                            <p className="truncate text-xs text-ink-faint">
                              {entry?.leaveTypeName || "Leave"} · {entry?.totalDays ?? ""}
                              {entry?.totalDays ? " day(s)" : "Approved leave"}
                            </p>
                            {entry?.employeeCode && (
                              <p className="truncate text-[11px] text-ink-faint">
                                {entry.employeeCode}
                              </p>
                            )}
                          </div>
                        </div>

                        <StatusBadge status="APPROVED" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ApplyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const employeeId = user?.employee?.id;

  const { data: leaveTypes } = useQuery({
    queryKey: ["leave-types"],
    queryFn: LeaveApi.types,
    enabled: open,
  });

  const { data: balances } = useQuery({
    queryKey: ["leave", "balances", "mine"],
    queryFn: () => LeaveApi.balances(employeeId),
    enabled: open && Boolean(employeeId),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ApplyForm>({
    resolver: zodResolver(applySchema),
    defaultValues: {
      leaveTypeId: "",
      startDate: "",
      endDate: "",
      halfDay: false,
      halfDayType: null,
      reason: "",
    },
  });

  const isHalfDay = watch("halfDay");

  const mutation = useMutation<
    Awaited<ReturnType<typeof LeaveApi.apply>>,
    unknown,
    ApplyForm
  >({
    mutationFn: async (values: ApplyForm) => {
      const selectedType = leaveTypes?.find(
        (type) => String(type.id) === String(values.leaveTypeId),
      ) as any;

      const selectedBalance = balances?.find(
        (b: any) => String(b.leaveTypeId) === String(values.leaveTypeId),
      ) as any;

      const selectedName = String(selectedType?.name ?? "")
        .trim()
        .toLowerCase();

      const isLop =
        selectedName === "loss of pay" ||
        selectedName === "lop" ||
        selectedName.includes("loss of pay");

      const available = selectedBalance
        ? Math.max(
            Number(selectedBalance.allotted ?? 0) -
              Number(selectedBalance.used ?? 0) -
              Number(selectedBalance.pendingApproval ?? selectedBalance.pendingDays ?? 0),
            0,
          )
        : 0;

      if (!isLop && selectedType && selectedBalance && available <= 0) {
        throw new Error(
          "The selected leave type has no available balance. Please choose another leave type.",
        );
      }

      return LeaveApi.apply({
        leaveTypeId: values.leaveTypeId,
        startDate: values.startDate,
        endDate: values.endDate,
        halfDay: values.halfDay,
        halfDayType: values.halfDay
          ? values.halfDayType
          : null,
        reason: values.reason,
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
            onClick={handleSubmit((values) =>
              mutation.mutate(values),
            )}
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
          <option value="">
            Select leave type
          </option>

          {leaveTypes?.map((type) => {
            const bal = balances?.find(
              (b: any) => String(b.leaveTypeId) === String(type.id),
            ) as any;
            const normalized = String(type.name ?? "")
              .trim()
              .toLowerCase();
            const isLop =
              normalized === "loss of pay" ||
              normalized === "lop" ||
              normalized.includes("loss of pay");
            const available = bal
              ? Math.max(
                  Number(bal.allotted ?? 0) -
                    Number(bal.used ?? 0) -
                    Number(bal.pendingApproval ?? bal.pendingDays ?? 0),
                  0,
                )
              : 0;

            return (
              <option
                key={type.id}
                value={type.id}
                disabled={!isLop && available <= 0}
              >
                {type.name}
                {isLop
                  ? " (Unlimited)"
                  : ` (${available} day${available === 1 ? "" : "s"} available)`}
              </option>
            );
          })}
        </SelectField>

        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Start date"
            type="date"
            required
            error={errors.startDate?.message}
            {...register("startDate")}
          />

          <TextField
            label="End date"
            type="date"
            required
            error={errors.endDate?.message}
            {...register("endDate")}
          />
        </div>

        <div className="rounded-xl border border-line bg-canvas p-4 space-y-3">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              {...register("halfDay")}
              className="h-4 w-4"
            />

            <span className="text-sm font-medium text-ink">
              Half-day leave
            </span>
          </label>

          {isHalfDay && (
            <SelectField
              label="Half-day session"
              required
              error={errors.halfDayType?.message}
              {...register("halfDayType")}
            >
              <option value="">
                Select session
              </option>
              <option value="FIRST_HALF">
                First Half
              </option>
              <option value="SECOND_HALF">
                Second Half
              </option>
            </SelectField>
          )}

          {!isHalfDay && (
            <p className="text-xs text-ink-faint">
              Multiple working days are automatically calculated.
              Weekends and holidays are excluded.
            </p>
          )}
        </div>

        <TextareaField
          label="Reason"
          required
          error={errors.reason?.message}
          {...register("reason")}
        />

        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 text-xs text-ink-faint">
          Leave balance is validated in real time. Pending requests are reserved until approval, and LOP is unlimited.
        </div>
      </div>
    </Modal>
  );
}
