import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  LogIn,
  LogOut,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Download,
  Coffee,
} from "lucide-react";
import { AttendanceApi } from "@/lib/endpoints";
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
import { TextField, TextareaField } from "@/components/ui/Field";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import { formatDate, formatTime, monthName } from "@/lib/format";
import type { AttendanceRecord } from "@/types";

const MANAGER_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"];

function localDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    date,
  );
}

type TeamAttendanceRecord = AttendanceRecord & {
  firstName: string | null;
  lastName: string | null;
  employeeCode: string | null;
  departmentName: string | null;
};

function shiftMonth(month: number, year: number, delta: number) {
  const value = new Date(year, month - 1 + delta, 1);
  return { month: value.getMonth() + 1, year: value.getFullYear() };
}

function getDisplayAttendanceStatus(
  record: AttendanceRecord,
): AttendanceRecord["status"] {
  if ((record.earlyDepartureMinutes ?? 0) > 0) {
    return "EARLY_DEPARTURE";
  }
  return record.status;
}

export default function Attendance() {
  const { user } = useAuth();
  const isManager = !!user && MANAGER_ROLES.includes(user.role);
  const [tab, setTab] = useState("mine");
  const [regOpen, setRegOpen] = useState(false);

  const tabs = [
    { key: "mine", label: "My Attendance" },
    ...(isManager
      ? [
          { key: "team", label: "Team View" },
          { key: "exceptions", label: "Attendance Exceptions" },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="Track work hours, history, and team presence."
        action={
          <Button
            size="sm"
            variant="outline"
            leftIcon={<CalendarClock size={14} />}
            onClick={() => setRegOpen(true)}
          >
            Request regularization
          </Button>
        }
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-6 w-fit" />
      {tab === "mine" && <MyAttendance />}
      {tab === "team" && isManager && <TeamAttendance />}
      {tab === "exceptions" && isManager && <TeamAttendanceExceptions />}
      <RegularizeModal open={regOpen} onClose={() => setRegOpen(false)} />
    </div>
  );
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

function MyAttendance() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [earlyDepartureOpen, setEarlyDepartureOpen] = useState(false);
  const [earlyDepartureReason, setEarlyDepartureReason] = useState("");
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const exportAttendance = async (format: "xlsx" | "pdf") => {
    try {
      setExporting(format);
      const blob = await AttendanceApi.exportMine(month, year, format);
      downloadBlob(
        blob,
        `attendance-${year}-${String(month).padStart(2, "0")}.${format}`,
      );
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setExporting(null);
    }
  };

  const {
    data: records,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["attendance", "mine", month, year],
    queryFn: () => AttendanceApi.mine(month, year),
  });

  const { data: todayRecord, isLoading: todayLoading } = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: AttendanceApi.today,
  });

  const getCurrentLocation = () =>
    new Promise<{ latitude: number; longitude: number; accuracy?: number }>(
      (resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation is not supported by this browser."));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          ({ coords }) =>
            resolve({
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy: Number.isFinite(coords.accuracy)
                ? coords.accuracy
                : undefined,
            }),
          () =>
            reject(
              new Error(
                "Unable to get your location. Please allow location access and try again.",
              ),
            ),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
        );
      },
    );

  const checkInMutation = useMutation({
    mutationFn: async () =>
      AttendanceApi.checkInWithLocation(await getCurrentLocation()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      showToast("Checked in successfully.");
    },
    onError: (error) => showToast(getErrorMessage(error), "error"),
  });

  const checkOutMutation = useMutation({
    mutationFn: async (reason?: string) => {
      const location = await getCurrentLocation();
      return AttendanceApi.checkOutWithOptions({
        ...location,
        ...(reason?.trim() ? { earlyDepartureReason: reason.trim() } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setEarlyDepartureOpen(false);
      setEarlyDepartureReason("");
      showToast("Checked out successfully.");
    },
    onError: (error) => {
      const message = getErrorMessage(error);
      if (message === "A reason is required for early departure.") {
        // Preserve the required early-departure message and show the reason prompt.
        showToast(message, "error");
        setEarlyDepartureReason("");
        setEarlyDepartureOpen(true);
        return;
      }
      showToast(message, "error");
    },
  });

  const breakMutation = useMutation({
    mutationFn: async (action: "start" | "end") =>
      action === "start"
        ? AttendanceApi.startBreak()
        : AttendanceApi.endBreak(),
    onSuccess: (_record, action) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      showToast(action === "start" ? "Break started." : "Break ended.");
    },
    onError: (error) => showToast(getErrorMessage(error), "error"),
  });

  const summary = useMemo(() => {
    const data = records ?? [];
    const present = data.filter((r) =>
      ["PRESENT", "LATE", "EARLY_DEPARTURE"].includes(r.status as string),
    ).length;
    const wfh = data.filter((r) => r.status === "WORK_FROM_HOME").length;
    const onLeave = data.filter((r) => r.status === "ON_LEAVE").length;
    const absent = data.filter((r) => r.status === "ABSENT").length;
    const halfDay = data.filter((r) => r.status === "HALF_DAY").length;
    const late = data.filter(
      (r) => r.status === ("LATE" as typeof r.status),
    ).length;
    const overtime = data.reduce((sum, r) => sum + (r.overtimeHours ?? 0), 0);
    const totalHours = data.reduce((sum, r) => sum + (r.workHours ?? 0), 0);
    return {
      present,
      wfh,
      onLeave,
      absent,
      halfDay,
      late,
      overtime,
      totalHours: Math.round(totalHours * 100) / 100,
    };
  }, [records]);

  const goMonth = (delta: number) => {
    const next = shiftMonth(month, year, delta);
    setMonth(next.month);
    setYear(next.year);
  };

  const canCheckIn =
    !todayRecord?.checkIn && !checkInMutation.isPending && !todayLoading;
  const canCheckOut =
    !!todayRecord?.checkIn &&
    !todayRecord.checkOut &&
    !checkOutMutation.isPending &&
    !todayLoading;
  const breakInProgress = !!todayRecord?.breaks?.some((item) => !item.end);
  const canStartBreak =
    !!todayRecord?.checkIn &&
    !todayRecord.checkOut &&
    !breakInProgress &&
    !breakMutation.isPending &&
    !todayLoading;
  const canEndBreak =
    !!todayRecord?.checkIn &&
    !todayRecord.checkOut &&
    breakInProgress &&
    !breakMutation.isPending &&
    !todayLoading;

  const displayStatus =
    todayRecord?.earlyDepartureMinutes && todayRecord.earlyDepartureMinutes > 0
      ? ("EARLY_DEPARTURE" as AttendanceRecord["status"])
      : todayRecord?.status;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Today"
          subtitle={localDateString()}
          action={
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Download size={14} />}
                onClick={() => exportAttendance("xlsx")}
                disabled={!!exporting}
              >
                {exporting === "xlsx" ? "Exporting..." : "Excel"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Download size={14} />}
                onClick={() => exportAttendance("pdf")}
                disabled={!!exporting}
              >
                {exporting === "pdf" ? "Exporting..." : "PDF"}
              </Button>
            </div>
          }
        />
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
            <div>
              <p className="text-[11px] text-ink-faint">Check-in</p>
              <p className="mt-1 text-sm font-medium text-ink">
                {todayRecord?.checkIn ? formatTime(todayRecord.checkIn) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink-faint">Check-out</p>
              <p className="mt-1 text-sm font-medium text-ink">
                {todayRecord?.checkOut ? formatTime(todayRecord.checkOut) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink-faint">Hours</p>
              <p className="mt-1 text-sm font-medium text-ink">
                {todayRecord?.workHours ? `${todayRecord.workHours}h` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink-faint">Status</p>
              <div className="mt-1 min-h-8 flex items-center">
                {todayRecord ? (
                  <StatusBadge status={displayStatus ?? todayRecord.status} />
                ) : (
                  <span className="text-sm text-ink-faint">Not checked in</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-ink-faint">Break</p>
              <p className="mt-1 text-sm font-medium text-ink">
                {todayRecord?.breakMinutes ?? 0} min
                {breakInProgress ? " · In progress" : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-4">
            <Button
              size="sm"
              className="w-[120px] shrink-0"
              leftIcon={<LogIn size={14} />}
              onClick={() => checkInMutation.mutate()}
              disabled={!canCheckIn}
              isLoading={checkInMutation.isPending}
            >
              Check in
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-[120px] shrink-0"
              leftIcon={<Coffee size={14} />}
              onClick={() => breakMutation.mutate("start")}
              disabled={!canStartBreak}
              isLoading={breakMutation.isPending && !breakInProgress}
            >
              Take break
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-[120px] shrink-0"
              leftIcon={<Coffee size={14} />}
              onClick={() => breakMutation.mutate("end")}
              disabled={!canEndBreak}
              isLoading={breakMutation.isPending && breakInProgress}
            >
              End break
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-[120px] shrink-0"
              leftIcon={<LogOut size={14} />}
              onClick={() => checkOutMutation.mutate(undefined)}
              disabled={!canCheckOut}
              isLoading={checkOutMutation.isPending}
            >
              Check out
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        open={earlyDepartureOpen}
        onClose={() => {
          if (!checkOutMutation.isPending) {
            setEarlyDepartureOpen(false);
            setEarlyDepartureReason("");
          }
        }}
        title="Early departure reason"
        subtitle="You are checking out before the scheduled shift end time. Please provide a reason to complete checkout."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEarlyDepartureOpen(false);
                setEarlyDepartureReason("");
              }}
              disabled={checkOutMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const reason = earlyDepartureReason.trim();
                if (reason.length < 3) {
                  showToast(
                    "Please provide a reason for early departure.",
                    "error",
                  );
                  return;
                }
                checkOutMutation.mutate(reason);
              }}
              isLoading={checkOutMutation.isPending}
            >
              Confirm checkout
            </Button>
          </>
        }
      >
        <TextareaField
          label="Reason"
          required
          placeholder="E.g. Personal emergency, medical appointment, or approved early departure."
          maxLength={1000}
          value={earlyDepartureReason}
          onChange={(e) => setEarlyDepartureReason(e.target.value)}
        />
      </Modal>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          icon={CheckCircle2}
          tone="success"
          label="Present days"
          value={summary.present}
        />
        <SummaryCard
          icon={AlertCircle}
          tone="warning"
          label="Half-day / leave"
          value={`${summary.halfDay + summary.onLeave}`}
        />
        <SummaryCard
          icon={Clock}
          tone="gold"
          label="Late days"
          value={summary.late}
        />
        <SummaryCard
          icon={Clock}
          tone="brand"
          label="Total hours"
          value={`${summary.totalHours}h`}
        />
        <SummaryCard
          icon={Clock}
          tone="gold"
          label="Overtime hours"
          value={`${Math.round(summary.overtime * 100) / 100}h`}
        />
      </div>

      <Card>
        <CardHeader
          title={`${monthName(month)} ${year}`}
          subtitle="Daily attendance log"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => goMonth(-1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => goMonth(1)}>
                Next
              </Button>
            </div>
          }
        />
        {isLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Unable to load attendance"
            description="Please try again."
          />
        ) : !records?.length ? (
          <EmptyState icon={Clock} title="No attendance yet this month" />
        ) : (
          <AttendanceTable records={records} />
        )}
      </Card>
    </div>
  );
}

function AttendanceTable({ records }: { records: AttendanceRecord[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="text-ink-faint">
            <th className="pb-2 font-medium">Date</th>
            <th className="pb-2 font-medium">Check-in</th>
            <th className="pb-2 font-medium">Check-out</th>
            <th className="pb-2 font-medium">Hours</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {[...records]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((record) => (
              <tr key={record.id} className="border-t border-line/60">
                <td className="py-2.5">{formatDate(record.date)}</td>
                <td className="py-2.5 text-ink-faint">
                  {record.checkIn ? formatTime(record.checkIn) : "—"}
                </td>
                <td className="py-2.5 text-ink-faint">
                  {record.checkOut ? formatTime(record.checkOut) : "—"}
                </td>
                <td className="py-2.5 text-ink-faint">
                  {record.workHours ? `${record.workHours}h` : "—"}
                </td>
                <td className="py-2.5">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={getDisplayAttendanceStatus(record)} />
                    {record.isRegularized && (
                      <span className="text-[11px] text-ink-faint">
                        (regularized)
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Clock;
  tone: string;
  label: string;
  value: string | number;
}) {
  const toneBg: Record<string, string> = {
    success: "bg-success-50 text-success-700",
    brand: "bg-brand-50 text-brand-600",
    warning: "bg-warning-50 text-warning-700",
    gold: "bg-gold-50 text-gold-700",
  };
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneBg[tone] ?? toneBg.brand}`}
        >
          <Icon size={18} />
        </div>
        <div>
          <p className="font-display text-xl font-medium text-ink">{value}</p>
          <p className="text-[12px] text-ink-faint">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function TeamAttendance() {
  const [date, setDate] = useState(localDateString());
  const { showToast } = useToast();
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const exportTeamAttendance = async (format: "xlsx" | "pdf") => {
    try {
      setExporting(format);
      const blob = await AttendanceApi.exportTeam(date, format);
      downloadBlob(blob, `team-attendance-${date}.${format}`);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setExporting(null);
    }
  };
  const { data, isLoading, isError } = useQuery({
    queryKey: ["attendance", "by-date", date],
    queryFn: () => AttendanceApi.byDate(date),
  });

  return (
    <Card>
      <CardHeader
        title="Team attendance"
        subtitle="View attendance for your direct reports on any date"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-xl border border-line bg-white px-3 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Download size={14} />}
              onClick={() => exportTeamAttendance("xlsx")}
              disabled={!!exporting}
            >
              Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Download size={14} />}
              onClick={() => exportTeamAttendance("pdf")}
              disabled={!!exporting}
            >
              PDF
            </Button>
          </div>
        }
      />
      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Unable to load team attendance"
          description="Please try again."
        />
      ) : !data?.length ? (
        <EmptyState
          icon={XCircle}
          title="No team attendance recorded for this date"
          description="This may be a weekend, holiday, or a date with no attendance logged by your direct reports."
        />
      ) : (
        <div className="space-y-2">
          <p className="text-[12px] text-ink-faint">
            {data.length} direct report{data.length === 1 ? "" : "s"} shown
          </p>
          {(data as TeamAttendanceRecord[]).map((record) => (
            <div
              key={record.id}
              className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  firstName={record.firstName ?? ""}
                  lastName={record.lastName ?? ""}
                  size="sm"
                />
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {record.firstName} {record.lastName}
                  </p>
                  <p className="text-[12px] text-ink-faint">
                    {record.departmentName} · {record.employeeCode}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-ink-faint">
                  {record.checkIn ? formatTime(record.checkIn) : "—"}
                  {record.checkOut ? ` – ${formatTime(record.checkOut)}` : ""}
                </span>
                <StatusBadge status={getDisplayAttendanceStatus(record)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TeamAttendanceExceptions() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("PENDING");
  const [decisionRequest, setDecisionRequest] = useState<
    | (Awaited<
        ReturnType<typeof AttendanceApi.teamRegularizationRequests>
      >[number] & { action: "approve" | "reject" })
    | null
  >(null);
  const [decisionNote, setDecisionNote] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["attendance", "regularization", "team", status],
    queryFn: () => AttendanceApi.teamRegularizationRequests(status),
  });

  const decisionMutation = useMutation({
    mutationFn: ({
      requestId,
      action,
      note,
    }: {
      requestId: string;
      action: "approve" | "reject";
      note: string;
    }) =>
      action === "approve"
        ? AttendanceApi.approveRegularization(requestId, note)
        : AttendanceApi.rejectRegularization(requestId, note),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["attendance", "regularization", "team"],
      });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      showToast(
        variables.action === "approve"
          ? "Attendance regularization approved."
          : "Attendance regularization rejected.",
      );
      setDecisionRequest(null);
      setDecisionNote("");
    },
    onError: (error) => showToast(getErrorMessage(error), "error"),
  });

  const requests = data ?? [];
  return (
    <Card>
      <CardHeader
        title="Attendance exceptions"
        subtitle="Review attendance regularization requests from your direct reports"
        action={
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
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
        <Skeleton className="h-64 rounded-2xl" />
      ) : isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Unable to load attendance exceptions"
          description="Please try again."
        />
      ) : !requests.length ? (
        <EmptyState
          icon={CheckCircle2}
          title={
            status === "PENDING"
              ? "No pending attendance exceptions"
              : "No attendance exceptions found"
          }
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div
              key={request.id}
              className="rounded-2xl border border-line/60 p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-medium text-ink">
                      {request.firstName} {request.lastName}
                    </p>
                    <StatusBadge status={request.status} />
                  </div>
                  <p className="mt-1 text-[12px] text-ink-faint">
                    {request.employeeCode ?? "—"} · {formatDate(request.date)}
                  </p>
                </div>
                {request.status === "PENDING" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setDecisionRequest({ ...request, action: "approve" });
                        setDecisionNote("");
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDecisionRequest({ ...request, action: "reject" });
                        setDecisionNote("");
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-3 grid gap-3 text-[12px] sm:grid-cols-3">
                <div>
                  <p className="text-ink-faint">Requested status</p>
                  <p className="mt-1 font-medium text-ink">
                    {request.requestedStatus}
                  </p>
                </div>
                <div>
                  <p className="text-ink-faint">Check-in / Check-out</p>
                  <p className="mt-1 font-medium text-ink">
                    {request.requestedCheckIn
                      ? formatTime(request.requestedCheckIn)
                      : "—"}{" "}
                    /{" "}
                    {request.requestedCheckOut
                      ? formatTime(request.requestedCheckOut)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-ink-faint">Reason</p>
                  <p className="mt-1 font-medium text-ink">{request.reason}</p>
                </div>
              </div>
              {request.decisionNote && (
                <div className="mt-3 rounded-xl bg-surface px-3 py-2 text-[12px] text-ink-faint">
                  Decision note: {request.decisionNote}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {decisionRequest && (
        <Modal
          open
          onClose={() => {
            if (!decisionMutation.isPending) {
              setDecisionRequest(null);
              setDecisionNote("");
            }
          }}
          title={
            decisionRequest.action === "approve"
              ? "Approve attendance exception"
              : "Reject attendance exception"
          }
          subtitle={`${decisionRequest.firstName ?? ""} ${decisionRequest.lastName ?? ""} · ${formatDate(decisionRequest.date)}`}
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setDecisionRequest(null);
                  setDecisionNote("");
                }}
                disabled={decisionMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (
                    decisionRequest.action === "reject" &&
                    decisionNote.trim().length < 3
                  ) {
                    showToast("Please provide a rejection reason.", "error");
                    return;
                  }
                  decisionMutation.mutate({
                    requestId: decisionRequest.id,
                    action: decisionRequest.action,
                    note: decisionNote.trim(),
                  });
                }}
                isLoading={decisionMutation.isPending}
              >
                {decisionRequest.action === "approve" ? "Approve" : "Reject"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-line/60 bg-surface p-3 text-[13px]">
              <p className="font-medium text-ink">Employee reason</p>
              <p className="mt-1 text-ink-faint">{decisionRequest.reason}</p>
            </div>
            <TextareaField
              label={
                decisionRequest.action === "approve"
                  ? "Decision note"
                  : "Rejection reason"
              }
              required={decisionRequest.action === "reject"}
              placeholder={
                decisionRequest.action === "approve"
                  ? "Optional note for the approval..."
                  : "Explain why the attendance correction is rejected..."
              }
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              maxLength={1000}
            />
          </div>
        </Modal>
      )}
    </Card>
  );
}

function RegularizeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { date: localDateString(), note: "" },
  });
  const mutation = useMutation({
    mutationFn: (value: { date: string; note: string }) =>
      AttendanceApi.regularize(value.date, value.note.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      showToast("Regularization request submitted.");
      reset({ date: localDateString(), note: "" });
      onClose();
    },
    onError: (error) => showToast(getErrorMessage(error), "error"),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request attendance regularization"
      subtitle="For a day with a missed or incorrect punch."
      footer={
        <>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit((value) => {
              if (value.note.trim().length < 3) {
                showToast(
                  "Please provide a reason for regularization.",
                  "error",
                );
                return;
              }
              mutation.mutate(value);
            })}
            isLoading={mutation.isPending}
          >
            Submit request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Date" type="date" required {...register("date")} />
        <TextareaField
          label="Reason"
          required
          placeholder="E.g. Forgot to check out after an off-site client visit."
          maxLength={1000}
          {...register("note")}
        />
      </div>
    </Modal>
  );
}
