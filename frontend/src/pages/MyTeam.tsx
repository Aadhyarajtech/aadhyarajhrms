import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarDays,
  Check,
  Clock3,
  Users,
  X,
} from "lucide-react";

import { EmployeesApi, AttendanceApi, LeaveApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

import { Card, CardHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";

import { formatDate, formatTime } from "@/lib/format";

type TeamTab = "team" | "leave" | "attendance";

export default function MyTeam() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TeamTab>("team");

  const managerId = user?.employee?.id;

  if (!managerId) {
    return (
      <div>
        <Card>
          <EmptyState
            icon={AlertCircle}
            title="Employee profile not found"
            description="Your employee information is not available."
          />
        </Card>
      </div>
    );
  }

  const tabs = [
    {
      key: "team",
      label: "Team Members",
    },
    {
      key: "leave",
      label: "Leave Requests",
    },
    {
      key: "attendance",
      label: "Attendance",
    },
  ];

  return (
    <div className="premium-page space-y-6">
      <div className="relative overflow-hidden rounded-[26px] border border-violet-200/70 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-6 text-white shadow-[0_22px_60px_-30px_rgba(79,70,229,0.65)] sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative">
          <div className="mb-2 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/85 backdrop-blur">
            Manager Workspace
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">My Team</h1>
              <p className="mt-1 text-sm text-white/75">View and monitor your direct team members.</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-xs text-white/80 backdrop-blur">
              Team management & approvals
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[20px] border border-line/70 bg-white/90 p-1.5 shadow-[0_12px_35px_-28px_rgba(15,23,42,0.5)] backdrop-blur">
        <Tabs
          tabs={tabs}
          active={tab}
          onChange={(value) => setTab(value as TeamTab)}
          className="w-full overflow-x-auto"
        />
      </div>

      {tab === "team" && (
        <TeamMembers
          managerId={managerId}
          onViewProfile={(employeeId) =>
            navigate(`/app/employees/${employeeId}`)
          }
        />
      )}

      {tab === "leave" && <TeamLeaveRequests managerId={managerId} />}

      {tab === "attendance" && <TeamAttendance managerId={managerId} />}
    </div>
  );
}

/* =========================================================
   TEAM MEMBERS
========================================================= */

function TeamMembers({
  managerId,
  onViewProfile,
}: {
  managerId: string;
  onViewProfile: (employeeId: string) => void;
}) {
  const {
    data: teamMembers,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["my-team", "members", managerId],
    queryFn: () => EmployeesApi.directReports(managerId),
    enabled: !!managerId,
  });

  const [search, setSearch] = useState("");

  const filteredTeamMembers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return teamMembers ?? [];
    }

    return (teamMembers ?? []).filter((employee) => {
      const name = `${employee.firstName} ${employee.lastName}`.toLowerCase();
      const code = employee.employeeCode?.toLowerCase() ?? "";
      const designation = employee.designationTitle?.toLowerCase() ?? "";
      const department = employee.departmentName?.toLowerCase() ?? "";

      return (
        name.includes(query) ||
        code.includes(query) ||
        designation.includes(query) ||
        department.includes(query)
      );
    });
  }, [teamMembers, search]);

  return (
    <Card className="border-violet-100/80 shadow-[0_18px_45px_-32px_rgba(79,70,229,0.55)]">
      <CardHeader
        title="Direct team members"
        subtitle="Employees who report directly to you."
        action={
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search team..."
            aria-label="Search direct team members"
            className="h-10 w-48 rounded-xl border border-violet-100 bg-slate-50/80 px-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
          />
        }
      />

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      )}

      {isError && (
        <EmptyState
          icon={AlertCircle}
          title="Unable to load team"
          description="We couldn't retrieve your direct team members."
        />
      )}

      {!isLoading && !isError && (!teamMembers || teamMembers.length === 0) && (
        <EmptyState
          icon={Users}
          title="No direct reports"
          description="You currently don't have any employees reporting to you."
        />
      )}

      {!isLoading &&
        !isError &&
        !!teamMembers &&
        teamMembers.length > 0 &&
        filteredTeamMembers.length === 0 && (
          <EmptyState
            icon={Users}
            title="No matching team members"
            description="Try a different name, employee code, designation, or department."
          />
        )}

      {!isLoading && !isError && filteredTeamMembers.length > 0 && (
        <div className="space-y-2">
          {filteredTeamMembers.map((employee) => (
            <div
              key={employee.id}
              className="group flex flex-col gap-4 rounded-2xl border border-line/60 bg-gradient-to-r from-white to-violet-50/30 px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_12px_30px_-22px_rgba(79,70,229,0.55)] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  firstName={employee.firstName}
                  lastName={employee.lastName}
                  src={employee.avatarUrl}
                  size="sm"
                />

                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {employee.firstName} {employee.lastName}
                  </p>

                  <p className="text-[12px] text-ink-faint">
                    {employee.employeeCode}
                  </p>

                  <p className="text-[12px] text-ink-faint">
                    {employee.designationTitle ?? "—"}
                    {" · "}
                    {employee.departmentName ?? "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <StatusBadge status={employee.status} />

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onViewProfile(employee.id)}
                >
                  View Profile
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* =========================================================
   TEAM LEAVE REQUESTS
========================================================= */

function TeamLeaveRequests({ managerId }: { managerId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [filter, setFilter] = useState("PENDING");

  /*
   * Get this manager's direct team.
   *
   * This is also used to map:
   *
   * employeeId -> employee name
   *
   * so we never display employee IDs
   * in the manager's leave section.
   */
  const { data: teamMembers, isLoading: teamLoading } = useQuery({
    queryKey: ["my-team", "members", managerId],
    queryFn: () => EmployeesApi.directReports(managerId),
    enabled: !!managerId,
  });

  /*
   * Get team leave requests.
   */
  const {
    data: requests,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["my-team", "leave", filter, managerId],
    queryFn: () =>
      LeaveApi.requests({
        scope: "team",
        status: filter || undefined,
      }),
    enabled: !!managerId,
  });

  /*
   * Create employee lookup:
   *
   * employee ID -> employee object
   */
  const teamMap = useMemo(() => {
    return new Map(
      (teamMembers ?? []).map((employee) => [employee.id, employee]),
    );
  }, [teamMembers]);

  /*
   * Extra frontend filtering.
   *
   * Only requests belonging to the
   * manager's direct reports are shown.
   */
  const teamLeaveRequests = useMemo(() => {
    if (!requests || !teamMembers) {
      return [];
    }

    return requests.filter((request) => teamMap.has(request.employeeId));
  }, [requests, teamMembers, teamMap]);

  /*
   * Approve / reject leave request.
   */
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
        queryKey: ["my-team", "leave"],
      });

      queryClient.invalidateQueries({
        queryKey: ["leave"],
      });

      showToast("Leave request updated.");
    },

    onError: (error) => {
      showToast(getErrorMessage(error), "error");
    },
  });

  return (
    <Card className="border-emerald-100/80 shadow-[0_18px_45px_-32px_rgba(16,185,129,0.45)]">
      <CardHeader
        title="Team leave requests"
        subtitle="Review leave requests submitted by your direct reports."
        action={
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="h-10 rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          >
            <option value="PENDING">Pending</option>

            <option value="APPROVED">Approved</option>

            <option value="REJECTED">Rejected</option>

            <option value="">All</option>
          </select>
        }
      />

      {(isLoading || teamLoading) && (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      )}

      {isError && (
        <EmptyState
          icon={AlertCircle}
          title="Unable to load leave requests"
          description="We couldn't retrieve your team's leave requests."
        />
      )}

      {!isLoading &&
        !teamLoading &&
        !isError &&
        teamLeaveRequests.length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title="No leave requests"
            description="Leave requests from your direct reports will appear here."
          />
        )}

      {!isLoading &&
        !teamLoading &&
        !isError &&
        teamLeaveRequests.length > 0 && (
          <div className="space-y-2">
            {teamLeaveRequests.map((request) => {
              const employee = teamMap.get(request.employeeId);

              return (
                <div
                  key={request.id}
                  className="flex flex-col gap-4 rounded-2xl border border-line/60 bg-gradient-to-r from-white to-emerald-50/25 px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_12px_30px_-22px_rgba(16,185,129,0.5)] lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      firstName={employee?.firstName ?? ""}
                      lastName={employee?.lastName ?? ""}
                      src={employee?.avatarUrl}
                      size="sm"
                    />

                    <div>
                      <p className="text-[13px] font-medium text-ink">
                        {employee
                          ? `${employee.firstName} ${employee.lastName}`
                          : "Team member"}
                      </p>

                      <p className="mt-1 text-[12px] text-ink-faint">
                        {request.leaveTypeId}
                        {" · "}
                        {request.totalDays} day(s)
                      </p>

                      <p className="text-[12px] text-ink-faint">
                        {formatDate(request.startDate)}
                        {" – "}
                        {formatDate(request.endDate)}
                      </p>

                      <p className="mt-1 text-[12px] text-ink-faint">
                        {request.reason}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {request.status === "PENDING" ? (
                      <>
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
                          Approve
                        </Button>
                      </>
                    ) : (
                      <StatusBadge status={request.status} />
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

/* =========================================================
   TEAM ATTENDANCE
========================================================= */

function TeamAttendance({ managerId }: { managerId: string }) {
  /*
   * Get direct reports first.
   */
  const { data: teamMembers, isLoading: teamLoading } = useQuery({
    queryKey: ["my-team", "members", managerId],
    queryFn: () => EmployeesApi.directReports(managerId),
    enabled: !!managerId,
  });

  const today = new Date();

  const [selectedDate, setSelectedDate] = useState(
    today.toISOString().slice(0, 10),
  );

  const selected = new Date(`${selectedDate}T00:00:00`);

  const month = selected.getMonth() + 1;

  const year = selected.getFullYear();

  /*
   * Get attendance only for
   * the manager's direct reports.
   */
  const {
    data: attendance,
    isLoading: attendanceLoading,
    isError: attendanceError,
  } = useQuery({
    queryKey: ["my-team", "attendance", managerId, month, year],

    queryFn: async () => {
      if (!teamMembers || teamMembers.length === 0) {
        return [];
      }

      const results = await Promise.all(
        teamMembers.map(async (employee) => {
          const records = await AttendanceApi.forEmployee(
            employee.id,
            month,
            year,
          );

          const record = records.find((item) => item.date === selectedDate);

          return {
            employee,
            record: record ?? null,
          };
        }),
      );

      return results;
    },

    enabled: !!managerId && !!teamMembers && teamMembers.length > 0,
  });

  /*
   * Attendance exceptions:
   *
   * ABSENT
   * HALF_DAY
   * PRESENT without check-in
   * PRESENT without check-out
   */
  const exceptions = useMemo(() => {
    if (!attendance) {
      return 0;
    }

    return attendance.filter(({ record }) => {
      if (!record) {
        return false;
      }

      return (
        record.status === "ABSENT" ||
        record.status === "HALF_DAY" ||
        (record.status === "PRESENT" && !record.checkIn) ||
        (record.status === "PRESENT" && !!record.checkIn && !record.checkOut)
      );
    }).length;
  }, [attendance]);

  /*
   * Present count includes:
   *
   * PRESENT
   * WORK_FROM_HOME
   */
  const presentCount = useMemo(() => {
    if (!attendance) {
      return 0;
    }

    return attendance.filter(
      ({ record }) =>
        record?.status === "PRESENT" || record?.status === "WORK_FROM_HOME",
    ).length;
  }, [attendance]);

  return (
    <div className="space-y-6">
      {/* Summary */}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-violet-100/80 bg-gradient-to-br from-white to-violet-50/45 shadow-[0_14px_35px_-26px_rgba(79,70,229,0.5)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] text-ink-faint">Team Members</p>

              <p className="mt-1 font-display text-2xl font-medium text-ink">
                {teamLoading ? "—" : (teamMembers?.length ?? 0)}
              </p>
            </div>

            <Users size={20} className="text-brand-500" />
          </div>
        </Card>

        <Card className="border-emerald-100/80 bg-gradient-to-br from-white to-emerald-50/45 shadow-[0_14px_35px_-26px_rgba(16,185,129,0.45)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] text-ink-faint">Present</p>

              <p className="mt-1 font-display text-2xl font-medium text-ink">
                {attendanceLoading ? "—" : presentCount}
              </p>
            </div>

            <Check size={20} className="text-success-600" />
          </div>
        </Card>

        <Card className="border-amber-100/80 bg-gradient-to-br from-white to-amber-50/45 shadow-[0_14px_35px_-26px_rgba(245,158,11,0.45)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] text-ink-faint">Exceptions</p>

              <p className="mt-1 font-display text-2xl font-medium text-ink">
                {attendanceLoading ? "—" : exceptions}
              </p>
            </div>

            <AlertCircle size={20} className="text-warning-600" />
          </div>
        </Card>
      </div>

      {/* Attendance */}

      <Card className="border-blue-100/80 shadow-[0_18px_45px_-32px_rgba(59,130,246,0.45)]">
        <CardHeader
          title="Team attendance"
          subtitle="Monitor attendance records and exceptions for your direct reports."
          action={
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="h-10 rounded-xl border border-blue-100 bg-blue-50/40 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          }
        />

        {(attendanceLoading || teamLoading) && (
          <div className="space-y-3">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>
        )}

        {attendanceError && (
          <EmptyState
            icon={AlertCircle}
            title="Unable to load attendance"
            description="We couldn't retrieve attendance records for your team."
          />
        )}

        {!attendanceLoading &&
          !teamLoading &&
          !attendanceError &&
          (!attendance || attendance.length === 0) && (
            <EmptyState
              icon={Clock3}
              title="No team members"
              description="Attendance records will appear once you have direct reports."
            />
          )}

        {!attendanceLoading &&
          !teamLoading &&
          !attendanceError &&
          attendance &&
          attendance.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="text-ink-faint">
                    <th className="pb-3 font-medium">Employee</th>

                    <th className="pb-3 font-medium">Department</th>

                    <th className="pb-3 font-medium">Check-in</th>

                    <th className="pb-3 font-medium">Check-out</th>

                    <th className="pb-3 font-medium">Hours</th>

                    <th className="pb-3 font-medium">Status</th>

                    <th className="pb-3 font-medium">Exception</th>
                  </tr>
                </thead>

                <tbody>
                  {attendance.map(({ employee, record }) => {
                    const hasException =
                      !!record &&
                      (record.status === "ABSENT" ||
                        record.status === "HALF_DAY" ||
                        (record.status === "PRESENT" && !record.checkIn) ||
                        (record.status === "PRESENT" &&
                          !!record.checkIn &&
                          !record.checkOut));

                    return (
                      <tr key={employee.id} className="border-t border-line/60 transition-colors hover:bg-slate-50/70">
                        <td className="py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar
                              firstName={employee.firstName}
                              lastName={employee.lastName}
                              src={employee.avatarUrl}
                              size="sm"
                            />

                            <div>
                              <p className="font-medium text-ink">
                                {employee.firstName} {employee.lastName}
                              </p>

                              <p className="text-[11px] text-ink-faint">
                                {employee.employeeCode}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 text-ink-faint">
                          {employee.departmentName ?? "—"}
                        </td>

                        <td className="py-3 text-ink-faint">
                          {record?.checkIn ? formatTime(record.checkIn) : "—"}
                        </td>

                        <td className="py-3 text-ink-faint">
                          {record?.checkOut ? formatTime(record.checkOut) : "—"}
                        </td>

                        <td className="py-3 text-ink-faint">
                          {record?.workHours ? `${record.workHours}h` : "—"}
                        </td>

                        <td className="py-3">
                          {record ? (
                            <StatusBadge status={record.status} />
                          ) : (
                            <span className="text-[12px] text-ink-faint">
                              No record
                            </span>
                          )}
                        </td>

                        <td className="py-3">
                          {hasException ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-warning-50 px-2 py-1 text-[11px] font-medium text-warning-700">
                              <AlertCircle size={12} />
                              Exception
                            </span>
                          ) : (
                            <span className="text-[12px] text-ink-faint">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  );
}
