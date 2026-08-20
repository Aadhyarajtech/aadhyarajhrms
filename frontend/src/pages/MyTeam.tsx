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
    <div>
      <div className="mb-6">
        <h1 className="font-display text-xl font-medium text-ink">My Team</h1>

        <p className="mt-1 text-[13px] text-ink-faint">
          View and monitor your direct team members.
        </p>
      </div>

      <Tabs
        tabs={tabs}
        active={tab}
        onChange={(value) => setTab(value as TeamTab)}
        className="mb-6 w-fit"
      />

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

  return (
    <Card>
      <CardHeader
        title="Direct team members"
        subtitle="Employees who report directly to you."
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

      {!isLoading && !isError && teamMembers && teamMembers.length > 0 && (
        <div className="space-y-2">
          {teamMembers.map((employee) => (
            <div
              key={employee.id}
              className="flex flex-col gap-4 rounded-2xl border border-line/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
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
    <Card>
      <CardHeader
        title="Team leave requests"
        subtitle="Review leave requests submitted by your direct reports."
        action={
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="h-9 rounded-xl border border-line bg-white px-3 text-sm"
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
                  className="flex flex-col gap-4 rounded-2xl border border-line/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
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
        <Card>
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

        <Card>
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

        <Card>
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

      <Card>
        <CardHeader
          title="Team attendance"
          subtitle="Monitor attendance records and exceptions for your direct reports."
          action={
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="h-9 rounded-xl border border-line bg-white px-3 text-sm"
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
                      <tr key={employee.id} className="border-t border-line/60">
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
