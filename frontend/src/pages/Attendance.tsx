import ExpiryBadge from "@/components/common/ExpiryBadge";
import { EmployeeSearchSelect } from "@/components/common/EmployeeSearchSelect";
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
import { AttendanceApi, EmployeesApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { useSearchParams } from "react-router-dom";
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
import AiAttendanceInsights from "@/components/attendance/AiAttendanceInsights";
import AskAI from "@/components/attendance/AskAI";
import AiAttendanceAnomaly from "@/components/attendance/AiAttendanceAnomaly";
import AiAttendanceForecast from "@/components/attendance/AiAttendanceForecast";
import AttendancePatternAnalysis from "@/components/attendance/AttendancePatternAnalysis";
import SmartRegularizationAssistant from "@/components/attendance/SmartRegularizationAssistant";

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
  const { hasPermission } = useAuth();
  const isManager = hasPermission("attendance.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: string =
    isManager &&
      ["team", "regularization", "exceptions"].includes(
        requestedTab ?? "",
      )
      ? (requestedTab ?? "mine")
      : "mine";
  const [tab, setTab] = useState<string>(initialTab);
  const [regOpen, setRegOpen] = useState(false);
  const [regularizationEmployeeId, setRegularizationEmployeeId] =
    useState<string | undefined>();

  const handleTabChange = (nextTab: string) => {
    setTab(nextTab);
    setSearchParams(nextTab === "mine" ? {} : { tab: nextTab });
  };
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<
    string | undefined
  >(undefined);

  const tabs = [
    { key: "mine", label: "My Attendance" },
    ...(isManager
      ? [
          { key: "team", label: "Team View" },
          { key: "regularization", label: "Attendance Regularization" },
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
            onClick={() => {
              setRegularizationEmployeeId(undefined);
              setRegOpen(true);
            }}
          >
            Request regularization
          </Button>
        }
      />
      <Tabs
        tabs={tabs}
        active={tab}
        onChange={handleTabChange}
        className="mb-6 w-fit"
      />
      {tab === "mine" && (
        <MyAttendance
          selectedEmployeeId={selectedEmployeeId}
          onEmployeeChange={setSelectedEmployeeId}
        />
      )}
      {tab === "team" && isManager && <TeamAttendance />}
      {tab === "regularization" && isManager && <TeamRegularizationRequests />}
      {tab === "exceptions" && isManager && (
        <AttendanceExceptionReview
          employeeId={selectedEmployeeId}
          onEmployeeChange={setSelectedEmployeeId}
          onOpenRegularization={(employeeId) => {
            setRegularizationEmployeeId(employeeId);
            setRegOpen(true);
          }}
        />
      )}
      <RegularizeModal
        open={regOpen}
        employeeId={regularizationEmployeeId}
        onClose={() => setRegOpen(false)}
      />
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

function AttendanceExceptionReview({
  employeeId,
  onEmployeeChange,
  onOpenRegularization,
}: {
  employeeId?: string;
  onEmployeeChange: (id?: string) => void;
  onOpenRegularization: (employeeId?: string) => void;
}) {
  const { user, hasPermission } = useAuth();
  const canSelectEmployee = hasPermission("attendance.manage");
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());

  const { data: employeeData, isLoading: employeesLoading } = useQuery({
    queryKey: ["attendance", "exceptions", "employees", user?.role],
    queryFn: () => EmployeesApi.list({ page: 1, pageSize: 100 }),
    enabled: !!user && canSelectEmployee,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["attendance", "exceptions", employeeId, month, year],
    queryFn: () => AttendanceApi.aiAnomalies(month, year, employeeId),
  });

  const employees = employeeData?.employees ?? [];
  const anomalies: Array<{
    id: string;
    title: string;
    date?: string | null;
    severity?: string | null;
    description: string;
    reason?: string | null;
    employeeId?: string;
    employeeName?: string | null;
  }> = data?.anomalies ?? [];
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<{
    title: string;
    content: string;
  } | null>(null);

  const severityStyles: Record<string, string> = {
    HIGH: "bg-red-50 text-red-700 border-red-200",
    MEDIUM: "bg-orange-50 text-orange-700 border-orange-200",
    LOW: "bg-yellow-50 text-yellow-700 border-yellow-200",
  };

  const statusStyles: Record<string, string> = {
    OPEN: "bg-sky-50 text-sky-700 border-sky-200",
    RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    IGNORED: "bg-gray-100 text-gray-700 border-gray-200",
  };

  const groupedEmployees =
    anomalies.reduce<
      Record<
        string,
        {
          employeeId: string;
          employeeName: string;
          items: typeof anomalies;
        }
      >
    >((acc, anomaly) => {
      const employeeId = anomaly.employeeId ?? "selected";
      const employeeName =
        anomaly.employeeName ||
        (employeeId === "selected"
          ? "Selected employee"
          : employeeId === "all"
            ? "All Employees"
            : "Employee");

      if (!acc[employeeId]) {
        acc[employeeId] = {
          employeeId,
          employeeName,
          items: [],
        };
      }

      acc[employeeId].items.push(anomaly);
      return acc;
    }, {});

  return (
    <div className="mb-6 space-y-4">
      <Card className="!overflow-visible">
        <CardHeader
          title="Attendance Exceptions"
          subtitle="Review system-detected attendance issues for the selected employee."
        />
        <div className="space-y-5 px-6 pb-5 pt-4">
          <div className="max-w-md">
            <label className="mb-1.5 block text-[12px] font-medium text-ink">
              Employee
            </label>
            <EmployeeSearchSelect
              employees={employees}
              value={employeeId ?? ""}
              onChange={(id) => onEmployeeChange(id || undefined)}
              allLabel="All Employees"
              disabled={employeesLoading}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink"
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {monthName(index + 1)}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink"
            >
              {Array.from({ length: 5 }, (_, index) => {
                const value = today.getFullYear() - index;
                return (
                  <option key={value} value={value}>
                    {value}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 sm:p-5">
          {isLoading ? (
            <div className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-faint">
              Loading exceptions...
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Unable to load attendance exceptions.
            </div>
          ) : anomalies.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-faint">
              No attendance exceptions found for this selection.
            </div>
          ) : (
            <div className="space-y-3">
              {Object.values(groupedEmployees).map((group) => {
                const isExpanded = expandedEmployeeId === group.employeeId;

                return (
                  <div
                    key={group.employeeId}
                    className="rounded-2xl border border-line bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex-1">
                        <p className="text-lg font-semibold text-ink">{group.employeeName}</p>
                        <p className="text-sm text-ink-faint">
                          {group.items.length} {group.items.length === 1 ? "anomaly" : "anomalies"}
                        </p>
                      </div>

                      <Button
                        size="sm"
                        type="button"
                        onClick={() => setExpandedEmployeeId(isExpanded ? null : group.employeeId)}
                        className="bg-white text-ink hover:bg-surface border border-line"
                      >
                        {isExpanded ? "Hide" : "View"}
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 space-y-3">
                        {group.items.map((anomaly) => {
                          const reasonText = anomaly.reason?.trim() || "No reason provided.";
                          const detailText = anomaly.description?.trim() || "No details available.";

                          return (
                            <div
                              key={anomaly.id}
                              className="rounded-2xl border border-line bg-surface p-4"
                            >
                              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                <div className="grid flex-1 gap-3 text-[13px] md:grid-cols-2 xl:grid-cols-7">
                                  <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Employee</p>
                                    <p className="mt-1 font-medium text-ink">
                                      {anomaly.employeeName ||
                                        (employeeId
                                          ? employees.find((emp) => emp.id === employeeId)?.firstName ?? "Selected employee"
                                          : "All Employees")}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Date</p>
                                    <p className="mt-1 font-medium text-ink">{anomaly.date ? formatDate(anomaly.date) : "—"}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Problem</p>
                                    <p className="mt-1 font-medium text-ink">{anomaly.title}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Severity</p>
                                    <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-medium capitalize ${severityStyles[String(anomaly.severity).toUpperCase()] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                                      {String(anomaly.severity ?? "LOW").toLowerCase()}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Status</p>
                                    <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusStyles.OPEN ?? "bg-sky-50 text-sky-700 border-sky-200"}`}>Open</span>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Reason</p>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedDetail({ title: "Reason", content: reasonText })}
                                      className="mt-1 max-w-full cursor-pointer text-left text-ink-faint transition hover:text-brand-600"
                                    >
                                      {reasonText.length > 40 ? `${reasonText.slice(0, 40)}...` : reasonText}
                                    </button>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Details</p>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedDetail({ title: "Details", content: detailText })}
                                      className="mt-1 max-w-full cursor-pointer text-left text-ink-faint transition hover:text-brand-600"
                                    >
                                      {detailText.length > 40 ? `${detailText.slice(0, 40)}...` : detailText}
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center justify-end xl:pl-3">
                                  <Button
                                    size="sm"
                                    disabled={!anomaly.employeeId && !employeeId}
                                    onClick={() =>
                                      onOpenRegularization(
                                        anomaly.employeeId ?? employeeId,
                                      )
                                    }
                                  >
                                    Create Regularization
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={!!selectedDetail}
        onClose={() => setSelectedDetail(null)}
        title={selectedDetail?.title ?? "Details"}
        footer={
          <Button onClick={() => setSelectedDetail(null)}>Close</Button>
        }
      >
        <p className="whitespace-pre-wrap text-sm leading-6 text-ink">
          {selectedDetail?.content ?? "No details available."}
        </p>
      </Modal>
    </div>
  );
}

function MyAttendance({
  selectedEmployeeId,
  onEmployeeChange,
}: {
  selectedEmployeeId?: string;
  onEmployeeChange: (id?: string) => void;
}) {
  const today = new Date();
  const { user, hasPermission } = useAuth();
  const canSelectEmployee = hasPermission("attendance.manage");
  const { data: employeeData, isLoading: employeesLoading } = useQuery({
    queryKey: ["attendance", "ai", "employees", user?.role, user?.employee?.id],
    queryFn: () => EmployeesApi.list({ page: 1, pageSize: 100 }),
    enabled:
      canSelectEmployee && (user?.role !== "MANAGER" || !!user?.employee?.id),
  });
  const employees = employeeData?.employees ?? [];
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [earlyDepartureOpen, setEarlyDepartureOpen] = useState(false);
  const [earlyDepartureReason, setEarlyDepartureReason] = useState("");
  const [lateCheckInOpen, setLateCheckInOpen] = useState(false);
  const [lateCheckInReason, setLateCheckInReason] = useState("");
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

  const attendanceUserId = user?.employee?.id ?? user?.id ?? "anonymous";

  const {
    data: records,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["attendance", "mine", attendanceUserId, month, year],
    queryFn: () => AttendanceApi.mine(month, year),
    enabled: !!user,
  });

  const { data: todayRecord, isLoading: todayLoading } = useQuery({
    queryKey: ["attendance", "today", attendanceUserId],
    queryFn: AttendanceApi.today,
    enabled: !!user,
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
    mutationFn: async (reason?: string) => {
      const location = await getCurrentLocation();
      return AttendanceApi.checkInWithLocation({
        ...location,
        ...(reason?.trim() ? { lateCheckInReason: reason.trim() } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", "today", attendanceUserId] });
      queryClient.invalidateQueries({ queryKey: ["attendance", "mine", attendanceUserId] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setLateCheckInOpen(false);
      setLateCheckInReason("");
      showToast("Checked in successfully.");
    },
    onError: (error) => {
      const message = getErrorMessage(error);
      if (message === "A reason is required for late check-in.") {
        showToast(message, "error");
        setLateCheckInReason("");
        setLateCheckInOpen(true);
        return;
      }
      showToast(message, "error");
    },
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
      queryClient.invalidateQueries({ queryKey: ["attendance", "today", attendanceUserId] });
      queryClient.invalidateQueries({ queryKey: ["attendance", "mine", attendanceUserId] });
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

  const selectedEmployeeName =
    selectedEmployeeId && employees.length
      ? employees.find((employee) => employee.id === selectedEmployeeId)
      : null;

  const topLogEmployeeId =
    canSelectEmployee ? selectedEmployeeId : attendanceUserId;

  const {
    data: periodRecords,
    isLoading: periodLoading,
    isError: periodError,
  } = useQuery({
    queryKey: [
      "attendance",
      "selected-employee-log",
      topLogEmployeeId,
      month,
      year,
    ],
    queryFn: () =>
      topLogEmployeeId === selectedEmployeeId && selectedEmployeeId
        ? AttendanceApi.forEmployee(selectedEmployeeId, month, year)
        : AttendanceApi.mine(month, year),
    enabled: !!user && (!!selectedEmployeeId || !canSelectEmployee),
  });

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
  const lateCheckInReasonText =
    todayRecord?.lateCheckInReason?.trim() ||
    todayRecord?.note?.trim() ||
    todayRecord?.auditTrail
      ?.find(
        (entry) =>
          entry.action === "CHECK_IN" && !!entry.note?.trim(),
      )
      ?.note?.trim() ||
    null;

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
              {lateCheckInReasonText ? (
                <p className="mt-1 max-w-[180px] text-[10px] leading-4 text-amber-700">
                  {lateCheckInReasonText}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-[11px] text-ink-faint">Check-out</p>
              <p className="mt-1 text-sm font-medium text-ink">
                {todayRecord?.checkOut ? formatTime(todayRecord.checkOut) : "—"}
              </p>
              {todayRecord?.checkOut && todayRecord.earlyDepartureReason ? (
                <p className="mt-1 max-w-[180px] text-[10px] leading-4 text-amber-700">
                  {todayRecord.earlyDepartureReason}
                </p>
              ) : null}
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
              onClick={() => checkInMutation.mutate(undefined)}
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
        open={lateCheckInOpen}
        onClose={() => {
          if (!checkInMutation.isPending) {
            setLateCheckInOpen(false);
            setLateCheckInReason("");
          }
        }}
        title="Late check-in reason"
        subtitle="You checked in later than the office start time. Please provide a reason to complete attendance." 
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setLateCheckInOpen(false);
                setLateCheckInReason("");
              }}
              disabled={checkInMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const reason = lateCheckInReason.trim();
                if (reason.length < 3) {
                  showToast(
                    "Please provide a reason for late check-in.",
                    "error",
                  );
                  return;
                }
                checkInMutation.mutate(reason);
              }}
              isLoading={checkInMutation.isPending}
            >
              Confirm check-in
            </Button>
          </>
        }
      >
        <TextareaField
          label="Reason"
          required
          placeholder="E.g. Traffic delay, medical issue, or personal emergency."
          maxLength={1000}
          value={lateCheckInReason}
          onChange={(e) => setLateCheckInReason(e.target.value)}
        />
      </Modal>

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

      {canSelectEmployee && (
        <Card className="!overflow-visible">
          <CardHeader
            title="Attendance AI Analysis"
            subtitle="Select an employee optionally. Leave it as All Employees to view the overall attendance analysis."
          />
          <div className="px-6 pb-5">
            <div className="max-w-md">
              <label className="mb-1.5 block text-[12px] font-medium text-ink">
                Employee
              </label>
              <EmployeeSearchSelect
                employees={employees}
                value={selectedEmployeeId ?? ""}
                onChange={(id) => onEmployeeChange(id || undefined)}
                allLabel="All Employees"
                disabled={employeesLoading}
              />
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title={
            selectedEmployeeId
              ? `${selectedEmployeeName?.firstName ?? "Selected employee"} ${selectedEmployeeName?.lastName ?? ""}`.trim() + " attendance log"
              : "Attendance log"
          }
          subtitle={`Selected period: ${monthName(month)} ${year}`}
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
        {canSelectEmployee && !selectedEmployeeId ? (
          <EmptyState
            icon={Clock}
            title="Select an employee to view the attendance log"
            description="Choose a person from the dropdown above."
          />
        ) : periodLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : periodError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Unable to load attendance log"
            description="Please try again."
          />
        ) : !periodRecords?.length ? (
          <EmptyState
            icon={Clock}
            title="No attendance for this period"
          />
        ) : (
          <AttendanceTable records={periodRecords} />
        )}
      </Card>

      <AskAI employeeId={selectedEmployeeId} />
      <AiAttendanceInsights employeeId={selectedEmployeeId} />
      <AiAttendanceAnomaly employeeId={selectedEmployeeId} />
      <AiAttendanceForecast employeeId={selectedEmployeeId} />
      <AttendancePatternAnalysis employeeId={selectedEmployeeId} />
      <SmartRegularizationAssistant employeeId={selectedEmployeeId} />

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
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const { showToast } = useToast();
  const [exporting, setExporting] = useState<
    "xlsx" | "pdf" | "monthly-xlsx" | "monthly-pdf" | null
  >(null);

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

  const exportTeamMonthlyAttendance = async (format: "xlsx" | "pdf") => {
    try {
      const key = `monthly-${format}` as "monthly-xlsx" | "monthly-pdf";
      setExporting(key);
      const blob = await AttendanceApi.exportTeamMonthly(month, year, format);
      downloadBlob(
        blob,
        `team-attendance-${year}-${String(month).padStart(2, "0")}.${format}`,
      );
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
  const { data: todaySummary, isLoading: summaryLoading } = useQuery({
    queryKey: ["attendance", "summary", "today"],
    queryFn: () => AttendanceApi.summaryToday(),
    refetchInterval: 30_000,
  });

  const summaryRecords = (data as TeamAttendanceRecord[] | undefined) ?? [];
  const presentCount = summaryRecords.filter(
    (record) =>
      record.checkIn &&
      ["PRESENT", "LATE", "HALF_DAY", "EARLY_DEPARTURE"].includes(
        record.status,
      ),
  ).length;
  const lateCount = summaryRecords.filter(
    (record) => record.status === "LATE",
  ).length;
  const absentCount = summaryRecords.filter(
    (record) => record.status === "ABSENT",
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={CheckCircle2}
          tone="success"
          label="Present today"
          value={
            summaryLoading
              ? "—"
              : `${todaySummary?.present ?? presentCount}/${todaySummary?.total ?? 0}`
          }
        />
        <SummaryCard
          icon={Clock}
          tone="brand"
          label="Team present"
          value={presentCount}
        />
        <SummaryCard
          icon={AlertCircle}
          tone="warning"
          label="Late today"
          value={lateCount}
        />
        <SummaryCard
          icon={XCircle}
          tone="gold"
          label="Absent today"
          value={absentCount}
        />
      </div>
      <Card>
      <CardHeader
        title="Team Attendance"
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
              {exporting === "xlsx" ? "Exporting..." : "Daily Excel"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Download size={14} />}
              onClick={() => exportTeamAttendance("pdf")}
              disabled={!!exporting}
            >
              {exporting === "pdf" ? "Exporting..." : "Daily PDF"}
            </Button>
            <input
              type="month"
              value={`${year}-${String(month).padStart(2, "0")}`}
              onChange={(e) => {
                const [nextYear, nextMonth] = e.target.value
                  .split("-")
                  .map(Number);
                if (nextYear && nextMonth) {
                  setYear(nextYear);
                  setMonth(nextMonth);
                }
              }}
              className="h-9 rounded-xl border border-line bg-white px-3 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Download size={14} />}
              onClick={() => exportTeamMonthlyAttendance("xlsx")}
              disabled={!!exporting}
            >
              {exporting === "monthly-xlsx" ? "Exporting..." : "Monthly Excel"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Download size={14} />}
              onClick={() => exportTeamMonthlyAttendance("pdf")}
              disabled={!!exporting}
            >
              {exporting === "monthly-pdf" ? "Exporting..." : "Monthly PDF"}
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
    </div>
  );
}

function TeamRegularizationRequests() {
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
        title="Attendance Regularization"
        subtitle="Review attendance correction requests from your direct reports"
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
          title="Unable to load attendance regularization"
          description="Please try again."
        />
      ) : !requests.length ? (
        <EmptyState
          icon={CheckCircle2}
          title={
            status === "PENDING"
              ? "No pending regularization requests"
              : "No regularization requests found"
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
                    <ExpiryBadge expiresAt={request.expiresAt} status={request.status} />
                  </div>
                  <p className="mt-1 text-[12px] text-ink-faint">
                    {request.employeeCode ?? "—"} · {formatDate(request.date)}
                  </p>
                  {request.requestedByRole !== "EMPLOYEE" && (
                    <p className="mt-1 text-[12px] text-ink-faint">
                      Submitted by {request.requestedByRole.replaceAll("_", " ")} on behalf of this employee
                    </p>
                  )}
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
              ? "Approve regularization request"
              : "Reject regularization request"
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
  employeeId,
  onClose,
}: {
  open: boolean;
  employeeId?: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      date: localDateString(),
      problem: "MISSED_CHECK_IN",
      requestedStatus: "PRESENT",
      checkIn: "",
      checkOut: "",
      note: "",
    },
  });
  const mutation = useMutation({
    mutationFn: (value: {
      date: string;
      problem: string;
      requestedStatus: string;
      checkIn: string;
      checkOut: string;
      note: string;
    }) => {
      const problemLabel = {
        MISSED_CHECK_IN: "Missed check-in",
        MISSED_CHECK_OUT: "Missed check-out",
        WRONG_PUNCH: "Wrong punch",
        NO_ATTENDANCE: "No attendance",
        OTHER: "Attendance correction",
      }[value.problem] ?? "Attendance correction";

      const normalizedReason = `${problemLabel}: ${value.note.trim()}`;

      return AttendanceApi.regularize(value.date, normalizedReason, employeeId, {
        requestedStatus: value.requestedStatus,
        requestedCheckIn: value.checkIn || null,
        requestedCheckOut: value.checkOut || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      showToast("Regularization request submitted.");
      reset({
        date: localDateString(),
        problem: "MISSED_CHECK_IN",
        requestedStatus: "PRESENT",
        checkIn: "",
        checkOut: "",
        note: "",
      });
      onClose();
    },
    onError: (error) => showToast(getErrorMessage(error), "error"),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employeeId ? "Create attendance regularization" : "Request attendance regularization"}
      subtitle={
        employeeId
          ? "Submit an attendance correction request on behalf of the selected employee."
          : "Submit a correction request for a missed or incorrect attendance entry."
      }
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

        <div className="space-y-2">
          <label className="block text-[12px] font-medium text-ink">
            Problem
          </label>
          <select
            className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
            defaultValue="MISSED_CHECK_IN"
            {...register("problem")}
          >
            <option value="MISSED_CHECK_IN">Missed check-in</option>
            <option value="MISSED_CHECK_OUT">Missed check-out</option>
            <option value="WRONG_PUNCH">Wrong punch</option>
            <option value="NO_ATTENDANCE">No attendance</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-[12px] font-medium text-ink">
              Check-in time
            </label>
            <input
              type="time"
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
              {...register("checkIn")}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[12px] font-medium text-ink">
              Check-out time
            </label>
            <input
              type="time"
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
              {...register("checkOut")}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-[12px] font-medium text-ink">
            Corrected attendance status
          </label>
          <select
            className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
            defaultValue="PRESENT"
            {...register("requestedStatus")}
          >
            <option value="PRESENT">Present</option>
            <option value="ABSENT">Absent</option>
            <option value="HALF_DAY">Half day</option>
            <option value="WORK_FROM_HOME">Work from home</option>
            <option value="ON_LEAVE">On leave</option>
          </select>
        </div>

        <TextareaField
          label="Reason"
          required
          placeholder="E.g. Forgot to check out after an off-site client visit."
          maxLength={1000}
          {...register("note")}
        />

        <div className="space-y-2">
          <label className="block text-[12px] font-medium text-ink">
            Attachment (optional)
          </label>
          <input
            type="file"
            className="block w-full rounded-xl border border-dashed border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </div>
      </div>
    </Modal>
  );
}
