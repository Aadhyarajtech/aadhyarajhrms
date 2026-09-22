import * as attendanceRepo from "@/modules/attendance/attendance.repository";
import * as employeeRepo from "@/modules/employees/employees.repository";
import * as leaveRepo from "@/modules/leave/leave.repository";
import * as performanceRepo from "@/modules/performance/performance.repository";
import * as organizationRepo from "@/modules/organization/organization.repository";

import * as calendarRepo from "@/modules/calendar/calendar.repository";
import * as payrollRepo from "@/modules/payroll/payroll.repository";
import * as documentsRepo from "@/modules/documents/documents.repository";
import * as ticketRepo from "@/modules/tickets/ticket.repository";
import * as announcementRepo from "@/modules/announcements/announcement.repository";

import {
  HrCopilotUserContext,
  HrCopilotSource,
} from "./hr-copilot.types";

import { HrCopilotPlan } from "./hr-copilot.planner";

/**
 * ============================================================================
 * PERMISSIONS
 * ============================================================================
 */

function hasPermission(
  user: HrCopilotUserContext,
  permission: string,
): boolean {
  if (
    user.role === "SUPER_ADMIN"
  ) {
    return true;
  }

  if (
    user.permissions.includes(
      permission,
    )
  ) {
    return true;
  }

  if (
    permission.endsWith(".view")
  ) {
    return user.permissions.includes(
      `${permission.slice(0, -5)}.manage`,
    );
  }

  return false;
}

/**
 * ============================================================================
 * SAFE REPOSITORY EXECUTION
 * ============================================================================
 */

async function safe<T>(
  promise: Promise<T>,
): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.warn(
      "[HR Copilot Tool Executor]",
      error instanceof Error
        ? error.message
        : String(error),
    );

    return null;
  }
}

/**
 * ============================================================================
 * EMPLOYEE SANITIZATION
 * ============================================================================
 *
 * Never send the complete employee Mongo document to the LLM.
 */

function sanitizeEmployee(
  employee: any,
) {
  if (!employee) {
    return null;
  }

  const name =
    employee.fullName ??
    employee.name ??
    [
      employee.firstName,
      employee.lastName,
    ]
      .filter(Boolean)
      .join(" ");

  const manager =
    employee.manager?.name ??
    employee.managerName ??
    [
      employee.managerFirstName,
      employee.managerLastName,
    ]
      .filter(Boolean)
      .join(" ");

  return {
    id:
      employee._id ??
      employee.id ??
      employee.employeeId ??
      null,

    name: name || null,

    employeeCode:
      employee.employeeCode ??
      null,

    department:
      employee.department?.name ??
      employee.departmentName ??
      null,

    designation:
      employee.designation?.title ??
      employee.designationTitle ??
      null,

    designationLevel:
      employee.designationLevel ??
      null,

    status:
      employee.status ??
      null,

    employmentType:
      employee.employmentType ??
      null,

    workLocation:
      employee.workLocation ??
      null,

    dateOfJoining:
      employee.dateOfJoining ??
      null,

    manager:
      manager || null,

    skills:
      Array.isArray(
        employee.skills,
      )
        ? employee.skills
            .slice(0, 30)
            .map((skill: any) => ({
              name:
                skill.name ??
                null,

              category:
                skill.category ??
                null,

              competencyLevel:
                skill.competencyLevel ??
                null,
            }))
        : [],
  };
}

/**
 * ============================================================================
 * DATE RANGE
 * ============================================================================
 */

function resolveDateRange(
  plan: HrCopilotPlan,
): {
  start: string;
  end: string;
} {
  const now = new Date();

  if (
    plan.timeRange === "TODAY"
  ) {
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    return {
      start:
        start
          .toISOString()
          .slice(0, 10),

      end:
        now
          .toISOString()
          .slice(0, 10),
    };
  }

  if (
    plan.timeRange === "LAST_MONTH"
  ) {
    const start = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );

    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
    );

    return {
      start:
        start
          .toISOString()
          .slice(0, 10),

      end:
        end
          .toISOString()
          .slice(0, 10),
    };
  }

  if (
    plan.timeRange === "THIS_YEAR"
  ) {
    const start = new Date(
      now.getFullYear(),
      0,
      1,
    );

    return {
      start:
        start
          .toISOString()
          .slice(0, 10),

      end:
        now
          .toISOString()
          .slice(0, 10),
    };
  }

  if (
    plan.timeRange === "LAST_30_DAYS"
  ) {
    const start = new Date(
      now.getTime() -
        30 *
          24 *
          60 *
          60 *
          1000,
    );

    return {
      start:
        start
          .toISOString()
          .slice(0, 10),

      end:
        now
          .toISOString()
          .slice(0, 10),
    };
  }

  if (
    plan.timeRange === "LAST_90_DAYS"
  ) {
    const start = new Date(
      now.getTime() -
        90 *
          24 *
          60 *
          60 *
          1000,
    );

    return {
      start:
        start
          .toISOString()
          .slice(0, 10),

      end:
        now
          .toISOString()
          .slice(0, 10),
    };
  }

  if (
    plan.timeRange === "THIS_WEEK"
  ) {
    const day =
      now.getDay();

    const diff =
      day === 0
        ? 6
        : day - 1;

    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - diff,
    );

    return {
      start:
        start
          .toISOString()
          .slice(0, 10),

      end:
        now
          .toISOString()
          .slice(0, 10),
    };
  }

  /**
   * CURRENT / UNKNOWN
   *
   * Attendance AI currently works best with
   * the current month.
   */
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  );

  return {
    start:
      start
        .toISOString()
        .slice(0, 10),

    end:
      now
        .toISOString()
        .slice(0, 10),
  };
}

/**
 * ============================================================================
 * EMPLOYEE SEARCH
 * ============================================================================
 *
 * Supports:
 * - Full name
 * - Partial name
 * - EMP0001-style employee code
 * - emp_xxxxx-style employee code
 */

async function findEmployeeMatches(
  searchText: string,
): Promise<any[]> {
  const cleaned = searchText.trim();

  if (!cleaned) {
    return [];
  }

  // 1. Existing organization full-name resolver.
  const nameMatches =
    (await safe(
      organizationRepo.findEmployeesByName(cleaned),
    )) ?? [];

  if (nameMatches.length > 0) {
    return nameMatches;
  }

  // 2. Existing employee repository search.
  const directSearch =
    await safe(
      employeeRepo.listEmployees({
        search: cleaned,
        page: 1,
        pageSize: 20,
      }),
    );

  const directMatches =
    directSearch?.employees ?? [];

  const normalizeName = (value: unknown) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const displayName = (employee: any) =>
    String(
      employee?.fullName ??
        employee?.name ??
        [employee?.firstName, employee?.lastName]
          .filter(Boolean)
          .join(" ") ??
        "",
    ).trim();

  const normalizedSearch =
    normalizeName(cleaned);

  const exactDirectMatches =
    directMatches.filter(
      (employee: any) =>
        normalizeName(displayName(employee)) ===
        normalizedSearch,
    );

  if (exactDirectMatches.length > 0) {
    return exactDirectMatches;
  }

  if (directMatches.length === 1) {
    return directMatches;
  }

  // 3. Full-name fallback. Search each token and then match the
  // complete normalized employee name. This handles names such as
  // "Dosa Damodar" when listEmployees searches individual fields.
  const tokens = cleaned
    .split(/\s+/)
    .filter((token) => token.length >= 2);

  if (tokens.length < 2) {
    return directMatches;
  }

  const candidateMap = new Map<string, any>();

  for (const token of tokens) {
    const result =
      await safe(
        employeeRepo.listEmployees({
          search: token,
          page: 1,
          pageSize: 20,
        }),
      );

    for (const employee of result?.employees ?? []) {
      const id = String(
        employee?.id ??
          employee?._id ??
          employee?.employeeId ??
          "",
      );

      if (id) {
        candidateMap.set(id, employee);
      }
    }
  }

  const candidates =
    Array.from(candidateMap.values());

  const exactMatches =
    candidates.filter(
      (employee: any) =>
        normalizeName(displayName(employee)) ===
        normalizedSearch,
    );

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return candidates.filter((employee: any) => {
    const fullName =
      normalizeName(displayName(employee));

    return tokens.every((token) =>
      fullName.includes(normalizeName(token)),
    );
  });
}

/**
 * ============================================================================
 * EMPLOYEE TARGET RESOLUTION
 * ============================================================================
 *
 * This is the central authorization boundary for named employees.
 *
 * Rules:
 * - SUPER_ADMIN -> authorized
 * - HR_ADMIN -> authorized
 * - Employee asking about self -> authorized
 * - MANAGER -> only direct reports
 * - Other users -> only self
 */

async function resolveEmployeeTarget(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  if (
    !plan.targetEmployeeName
  ) {
    return {
      employee: null,
      employeeId: null,
      message:
        "No specific employee was identified.",
    };
  }

  if (
    !hasPermission(
      user,
      "employees.view",
    )
  ) {
    return {
      employee: null,
      employeeId: null,
      message:
        "You do not have permission to view employee information.",
    };
  }

  let searchText =
    plan.targetEmployeeName
      .trim();

  if (
    /^(me|myself|my)$/i.test(
      searchText,
    )
  ) {
    if (
      !user.employeeId
    ) {
      return {
        employee: null,
        employeeId: null,
        message:
          "Your account is not linked to an employee profile.",
      };
    }

    const ownEmployee =
      await safe(
        employeeRepo.getEmployeeById(
          String(
            user.employeeId,
          ),
        ),
      );

    if (!ownEmployee) {
      return {
        employee: null,
        employeeId: null,
        message:
          "Your employee profile could not be found.",
      };
    }

    return {
      employee:
        sanitizeEmployee(
          ownEmployee,
        ),

      employeeId:
        String(
          user.employeeId,
        ),
    };
  }

  const matches =
    await findEmployeeMatches(
      searchText,
    );

  if (
    matches.length === 0
  ) {
    return {
      employee: null,
      employeeId: null,
      message:
        `No employee named or identified as ${searchText} was found.`,
    };
  }

  if (
    matches.length > 1
  ) {
    return {
      employee: null,
      employeeId: null,
      message:
        `Multiple employees matched ${searchText}. Please provide the employee's full name or employee code.`,
    };
  }

  const matched =
    matches[0];

  const employeeId =
    String(
      matched._id ??
        matched.id ??
        matched.employeeId ??
        "",
    );

  if (!employeeId) {
    return {
      employee: null,
      employeeId: null,
      message:
        "The employee was found, but their employee ID could not be resolved.",
    };
  }

  /**
   * Get the fully enriched record.
   */
  const enrichedEmployee =
    await safe(
      employeeRepo.getEmployeeById(
        employeeId,
      ),
    );

  if (!enrichedEmployee) {
    return {
      employee: null,
      employeeId: null,
      message:
        `Employee ${searchText} was found, but their profile information could not be retrieved.`,
    };
  }

  /**
   * Authorization.
   */
  const currentEmployeeId =
    user.employeeId
      ? String(
          user.employeeId,
        )
      : null;

  const isSelf =
    employeeId ===
    currentEmployeeId;

  const isAdmin =
    user.role ===
      "SUPER_ADMIN" ||
    user.role ===
      "HR_ADMIN";

  const isDirectReport =
    user.role ===
      "MANAGER" &&
    String(
      enrichedEmployee.managerId ??
        matched.managerId ??
        "",
    ) ===
      String(
        user.employeeId ??
          "",
      );

  if (
    !isSelf &&
    !isAdmin &&
    !isDirectReport
  ) {
    return {
      employee: null,
      employeeId: null,
      message:
        "You do not have permission to view this employee's HR information.",
    };
  }

  return {
    employee:
      sanitizeEmployee(
        enrichedEmployee,
      ),

    employeeId,
  };
}

/**
 * ============================================================================
 * MY TEAM
 * ============================================================================
 */

async function getMyTeam(
  user: HrCopilotUserContext,
) {
  if (
    !user.employeeId
  ) {
    return {
      employees: [],
      message:
        "The authenticated user is not linked to an employee profile.",
    };
  }

  if (
    !hasPermission(
      user,
      "employees.view",
    )
  ) {
    return {
      employees: [],
      message:
        "You do not have permission to view employee information.",
    };
  }

  /**
   * Use the dedicated repository method.
   *
   * This is safer than asking the LLM to determine
   * who belongs to the team.
   */
  const employees =
    await safe(
      employeeRepo.listDirectReports(
        String(
          user.employeeId,
        ),
      ),
    );

  if (!employees) {
    return {
      employees: [],
      message:
        "The team information could not be retrieved right now.",
    };
  }

  return {
    employees:
      employees.map(
        sanitizeEmployee,
      ),

    total:
      employees.length,
  };
}

/**
 * ============================================================================
 * TEAM ORGANIZATION LIST
 * ============================================================================
 */

async function executeMyTeamOrganization(
  user: HrCopilotUserContext,
) {
  const team =
    await getMyTeam(
      user,
    );

  if (
    team.message
  ) {
    return team;
  }

  return {
    scope: "MY_TEAM",

    total:
      team.total ?? 0,

    employees:
      team.employees,
  };
}

/**
 * ============================================================================
 * TEAM ATTENDANCE
 * ============================================================================
 */

async function executeTeamAttendance(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  if (
    !hasPermission(
      user,
      "attendance.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view attendance information.",
    };
  }

  const team =
    await getMyTeam(
      user,
    );

  if (
    team.message
  ) {
    return team;
  }

  const employees =
    team.employees ?? [];

  if (
    employees.length === 0
  ) {
    return {
      teamSize: 0,
      employees: [],
      message:
        "No direct reports were found for your team.",
    };
  }

  const range =
    resolveDateRange(
      plan,
    );

  const attendanceResults =
    await Promise.all(
      employees.map(
        async (
          employee: any,
        ) => {
          const employeeId =
            String(
              employee.id,
            );

          const attendance =
            await safe(
              attendanceRepo.getAiAttendanceInsights(
                employeeId,
                range.start,
                range.end,
              ),
            );

          return {
            employee: {
              id:
                employee.id,

              name:
                employee.name,

              employeeCode:
                employee.employeeCode,

              department:
                employee.department,

              designation:
                employee.designation,
            },

            attendance:
              attendance ??
              null,
          };
        },
      ),
    );

  return {
    scope: "MY_TEAM",

    period:
      range,

    teamSize:
      employees.length,

    employees:
      attendanceResults,
  };
}

/**
 * ============================================================================
 * INDIVIDUAL ATTENDANCE
 * ============================================================================
 */

async function executeEmployeeAttendance(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  if (
    !hasPermission(
      user,
      "attendance.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view attendance information.",
    };
  }

  const target =
    await resolveEmployeeTarget(
      user,
      plan,
    );

  if (
    target.message
  ) {
    return target;
  }

  if (
    !target.employeeId
  ) {
    return {
      message:
        "No employee could be resolved for this request.",
    };
  }

  const range =
    resolveDateRange(
      plan,
    );

  const attendance =
    await safe(
      attendanceRepo.getAiAttendanceInsights(
        target.employeeId,
        range.start,
        range.end,
      ),
    );

  return {
    employee:
      target.employee,

    period:
      range,

    attendance:
      attendance ?? null,
  };
}

/**
 * ============================================================================
 * PERFORMANCE
 * ============================================================================
 */

async function executePerformance(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  if (
    !hasPermission(
      user,
      "performance.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view performance information.",
    };
  }

  const target =
    await resolveEmployeeTarget(
      user,
      plan,
    );

  if (
    target.message
  ) {
    return target;
  }

  if (
    !target.employeeId
  ) {
    return {
      message:
        "No employee could be resolved for this request.",
    };
  }

  const performance =
    await safe(
      performanceRepo.getPerformanceScorecard(
        target.employeeId,
      ),
    );

  return {
    employee:
      target.employee,

    performance:
      performance ??
      null,
  };
}

/**
 * ============================================================================
 * LEAVE
 * ============================================================================
 */

async function executeLeave(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  if (
    !hasPermission(
      user,
      "leave.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view leave information.",
    };
  }

  const target =
    await resolveEmployeeTarget(
      user,
      plan,
    );

  if (
    target.message
  ) {
    return target;
  }

  if (
    !target.employeeId
  ) {
    return {
      message:
        "No employee could be resolved for this request.",
    };
  }

  const leave =
    await safe(
      leaveRepo.listBalancesForEmployee(
        target.employeeId,
        new Date().getFullYear(),
      ),
    );

  return {
    employee:
      target.employee,

    leave:
      leave ??
      null,
  };
}

/**
 * ============================================================================
 * ORGANIZATION / DIRECT REPORTS
 * ============================================================================
 */

async function executeOrganizationQuery(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  if (
    !hasPermission(
      user,
      "employees.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view organization information.",
    };
  }

  const target =
    await resolveEmployeeTarget(
      user,
      plan,
    );

  if (
    target.message
  ) {
    return target;
  }

  if (
    !target.employeeId
  ) {
    return {
      message:
        "No employee could be resolved for this organization query.",
    };
  }

  const directReports =
    await safe(
      employeeRepo.listDirectReports(
        target.employeeId,
      ),
    );

  if (
    !directReports
  ) {
    return {
      message:
        "The organization information could not be retrieved right now.",
    };
  }

  const employees =
    directReports.map(
      (
        employee: any,
      ) =>
        sanitizeEmployee(
          employee,
        ),
    );

  return {
    targetEmployee:
      target.employee?.name ??
      plan.targetEmployeeName,

    relationship:
      "Direct reports",

    total:
      employees.length,

    employees,
  };
}

/**
 * ============================================================================
 * EMPLOYEE PROFILE LOOKUP
 * ============================================================================
 */

async function executeEmployeeLookup(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  if (
    !hasPermission(
      user,
      "employees.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view employee information.",
    };
  }

  const target =
    await resolveEmployeeTarget(
      user,
      plan,
    );

  if (
    target.message
  ) {
    return {
      message:
        target.message,
    };
  }

  if (
    !target.employee
  ) {
    return {
      message:
        "No employee could be resolved for this request.",
    };
  }

  /**
   * IMPORTANT:
   *
   * Return the employee fields directly.
   *
   * Previous implementation returned:
   *
   * data.employee.employee.designation
   *
   * which made simple fallback answers miss the designation.
   *
   * This implementation returns:
   *
   * data.employee.designation
   */
  return {
    ...target.employee,

    requestedField:
      plan.requestedFields?.[0] ??
      "profile",
  };
}

/**
 * ============================================================================
 * SELF / EMPLOYEE CROSS-MODULE SUMMARY
 * ============================================================================
 */

async function executeWorkSummary(
  user: HrCopilotUserContext,
  employeeId: string,
  employee: any,
  includeAnnouncements: boolean,
) {
  const now =
    new Date();

  const startDate =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    )
      .toISOString()
      .slice(0, 10);

  const endDate =
    now
      .toISOString()
      .slice(0, 10);

  const calendarEnd =
    new Date(
      now.getTime() +
        14 *
          24 *
          60 *
          60 *
          1000,
    ).toISOString();

  const tasks: Promise<unknown>[] =
    [];

  const labels: string[] =
    [];

  /**
   * Employee profile
   */
  if (
    hasPermission(
      user,
      "employees.view",
    )
  ) {
    tasks.push(
      Promise.resolve(
        sanitizeEmployee(
          employee,
        ),
      ),
    );

    labels.push(
      "employee",
    );
  }

  /**
   * Attendance
   */
  if (
    hasPermission(
      user,
      "attendance.view",
    )
  ) {
    tasks.push(
      attendanceRepo.getAiAttendanceInsights(
        employeeId,
        startDate,
        endDate,
      ),
    );

    labels.push(
      "attendance",
    );
  }

  /**
   * Leave
   */
  if (
    hasPermission(
      user,
      "leave.view",
    )
  ) {
    tasks.push(
      leaveRepo.listBalancesForEmployee(
        employeeId,
        now.getFullYear(),
      ),
    );

    labels.push(
      "leave",
    );
  }

  /**
   * Performance
   */
  if (
    hasPermission(
      user,
      "performance.view",
    )
  ) {
    tasks.push(
      performanceRepo.getPerformanceScorecard(
        employeeId,
      ),
    );

    labels.push(
      "performance",
    );
  }

  /**
   * Calendar
   *
   * Existing calendar access is employee-scoped.
   */
  tasks.push(
    calendarRepo.getUpcomingEvents(
      employeeId,
      now.toISOString(),
      calendarEnd,
    ),
  );

  labels.push(
    "calendar",
  );

  /**
   * Payroll
   */
  if (
    hasPermission(
      user,
      "payroll.view",
    )
  ) {
    tasks.push(
      payrollRepo.listPayslipsForEmployee(
        employeeId,
      ),
    );

    labels.push(
      "payroll",
    );
  }

  /**
   * Documents
   */
  if (
    hasPermission(
      user,
      "documents.view",
    )
  ) {
    tasks.push(
      documentsRepo.listDocuments(
        employeeId,
      ),
    );

    labels.push(
      "documents",
    );
  }

  /**
   * Tickets
   */
  if (
    hasPermission(
      user,
      "tickets.view",
    )
  ) {
    tasks.push(
      ticketRepo.getMyTickets(
        employeeId,
      ),
    );

    labels.push(
      "tickets",
    );
  }

  /**
   * Announcements
   *
   * Only included for the authenticated user's own summary.
   */
  if (
    includeAnnouncements &&
    hasPermission(
      user,
      "announcements.view",
    )
  ) {
    tasks.push(
      announcementRepo.getAnnouncements(
        user.role,
        user.userId,
      ),
    );

    labels.push(
      "announcements",
    );
  }

  const results =
    await Promise.allSettled(
      tasks,
    );

  const data:
    Record<string, any> =
    {};

  let index = 0;

  for (
    const label of labels
  ) {
    const result =
      results[index];

    if (
      result?.status ===
      "fulfilled"
    ) {
      data[label] =
        result.value;
    } else {
      data[label] =
        null;
    }

    index += 1;
  }

  return {
    employee:
      sanitizeEmployee(
        employee,
      ),

    period: {
      startDate,
      endDate,
    },

    ...data,

    dataAvailability:
      Object.fromEntries(
        labels.map(
          (
            label,
            position,
          ) => [
            label,
            results[position]
              ?.status ===
              "fulfilled",
          ],
        ),
      ),
  };
}

/**
 * ============================================================================
 * SELF SUMMARY
 * ============================================================================
 */

async function executeSelfSummary(
  user: HrCopilotUserContext,
) {
  if (
    !user.employeeId
  ) {
    return {
      message:
        "The authenticated user is not linked to an employee profile.",
    };
  }

  if (
    !hasPermission(
      user,
      "employees.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view your employee information.",
    };
  }

  const employee =
    await safe(
      employeeRepo.getEmployeeById(
        String(
          user.employeeId,
        ),
      ),
    );

  if (!employee) {
    return {
      message:
        "Your employee profile could not be retrieved.",
    };
  }

  return executeWorkSummary(
    user,
    String(
      user.employeeId,
    ),
    employee,
    true,
  );
}

/**
 * ============================================================================
 * NAMED EMPLOYEE SUMMARY
 * ============================================================================
 */

async function executeEmployeeSummary(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  const target =
    await resolveEmployeeTarget(
      user,
      plan,
    );

  if (
    target.message
  ) {
    return target;
  }

  if (
    !target.employeeId ||
    !target.employee
  ) {
    return {
      message:
        "No employee could be resolved for this summary.",
    };
  }

  const employee =
    await safe(
      employeeRepo.getEmployeeById(
        target.employeeId,
      ),
    );

  if (!employee) {
    return {
      message:
        "The employee profile could not be retrieved.",
    };
  }

  return executeWorkSummary(
    user,
    target.employeeId,
    employee,
    false,
  );
}

/**
 * ============================================================================
 * GENERAL SELF ATTENDANCE
 * ============================================================================
 */

async function executeTodayAttendance(
  user: HrCopilotUserContext,
) {
  if (!user.employeeId) {
    return {
      message:
        "The authenticated user is not linked to an employee profile.",
    };
  }

  if (!hasPermission(user, "attendance.view")) {
    return {
      message:
        "You do not have permission to view attendance information.",
    };
  }

  const attendance =
    await safe(
      attendanceRepo.getTodayRecord(
        String(user.employeeId),
      ),
    );

  return {
    employeeId: String(user.employeeId),
    date: new Date().toISOString().slice(0, 10),
    attendance: attendance ?? null,
  };
}

async function executeSelfAttendance(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  if (
    !user.employeeId
  ) {
    return {
      message:
        "The authenticated user is not linked to an employee profile.",
    };
  }

  if (
    !hasPermission(
      user,
      "attendance.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view attendance information.",
    };
  }

  if (plan.conditions.includes("TODAY_ATTENDANCE")) {
    return executeTodayAttendance(user);
  }

  const range = resolveDateRange(plan);

  const attendance = await safe(
    attendanceRepo.getAiAttendanceInsights(
      String(user.employeeId),
      range.start,
      range.end,
    ),
  );

  return {
    employeeId: user.employeeId,
    period: range,
    attendance: attendance ?? null,
  };
}

/**
 * ============================================================================
 * GENERAL SELF PERFORMANCE
 * ============================================================================
 */

async function executeSelfPerformance(
  user: HrCopilotUserContext,
) {
  if (
    !user.employeeId
  ) {
    return {
      message:
        "The authenticated user is not linked to an employee profile.",
    };
  }

  if (
    !hasPermission(
      user,
      "performance.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view performance information.",
    };
  }

  const performance =
    await safe(
      performanceRepo.getPerformanceScorecard(
        String(
          user.employeeId,
        ),
      ),
    );

  return {
    employeeId:
      user.employeeId,

    performance:
      performance ?? null,
  };
}

/**
 * ============================================================================
 * GENERAL SELF LEAVE
 * ============================================================================
 */

async function executeSelfLeave(
  user: HrCopilotUserContext,
) {
  if (
    !user.employeeId
  ) {
    return {
      message:
        "The authenticated user is not linked to an employee profile.",
    };
  }

  if (
    !hasPermission(
      user,
      "leave.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view leave information.",
    };
  }

  const leave =
    await safe(
      leaveRepo.listBalancesForEmployee(
        String(
          user.employeeId,
        ),
        new Date().getFullYear(),
      ),
    );

  return {
    employeeId:
      user.employeeId,

    leave:
      leave ?? null,
  };
}

/**
 * ============================================================================
 * MAIN TOOL EXECUTOR
 * ============================================================================
 */

export async function executeHrCopilotPlan(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  const data:
    Record<string, unknown> =
    {};

  const sources:
    HrCopilotSource[] =
    [];

  /**
   * --------------------------------------------------------------------------
   * SELF CROSS-MODULE SUMMARY
   * --------------------------------------------------------------------------
   */

  if (
    plan.scope === "SELF" &&
    plan.task === "SUMMARY"
  ) {
    data.selfSummary =
      await executeSelfSummary(
        user,
      );

    sources.push({
      module: "employee",
      description:
        "Authenticated user's authorized employee profile and HRMS summary.",
    });

    if (
      hasPermission(
        user,
        "attendance.view",
      )
    ) {
      sources.push({
        module: "attendance",
        description:
          "Authenticated user's authorized attendance information.",
      });
    }

    if (
      hasPermission(
        user,
        "leave.view",
      )
    ) {
      sources.push({
        module: "leave",
        description:
          "Authenticated user's authorized leave information.",
      });
    }

    if (
      hasPermission(
        user,
        "performance.view",
      )
    ) {
      sources.push({
        module: "performance",
        description:
          "Authenticated user's authorized performance information.",
      });
    }

    if (
      hasPermission(
        user,
        "payroll.view",
      )
    ) {
      sources.push({
        module: "payroll",
        description:
          "Authenticated user's authorized payroll information.",
      });
    }

    if (
      hasPermission(
        user,
        "documents.view",
      )
    ) {
      sources.push({
        module: "documents",
        description:
          "Authenticated user's authorized document information.",
      });
    }

    if (
      hasPermission(
        user,
        "tickets.view",
      )
    ) {
      sources.push({
        module: "tickets",
        description:
          "Authenticated user's authorized ticket information.",
      });
    }

    if (
      hasPermission(
        user,
        "announcements.view",
      )
    ) {
      sources.push({
        module: "announcements",
        description:
          "Announcements available to the authenticated user.",
      });
    }

    sources.push({
      module: "calendar",
      description:
        "Authenticated user's upcoming calendar information.",
    });
  }

  /**
   * --------------------------------------------------------------------------
   * NAMED EMPLOYEE CROSS-MODULE SUMMARY
   * --------------------------------------------------------------------------
   */

  if (
    plan.scope === "EMPLOYEE" &&
    plan.task === "SUMMARY"
  ) {
    data.employeeSummary =
      await executeEmployeeSummary(
        user,
        plan,
      );

    sources.push({
      module: "employee",
      description:
        "Authorized employee profile information.",
    });

    if (
      hasPermission(
        user,
        "attendance.view",
      )
    ) {
      sources.push({
        module: "attendance",
        description:
          "Authorized attendance information for the requested employee.",
      });
    }

    if (
      hasPermission(
        user,
        "leave.view",
      )
    ) {
      sources.push({
        module: "leave",
        description:
          "Authorized leave information for the requested employee.",
      });
    }

    if (
      hasPermission(
        user,
        "performance.view",
      )
    ) {
      sources.push({
        module: "performance",
        description:
          "Authorized performance information for the requested employee.",
      });
    }

    if (
      hasPermission(
        user,
        "payroll.view",
      )
    ) {
      sources.push({
        module: "payroll",
        description:
          "Authorized payroll information for the requested employee.",
      });
    }

    if (
      hasPermission(
        user,
        "documents.view",
      )
    ) {
      sources.push({
        module: "documents",
        description:
          "Authorized document information for the requested employee.",
      });
    }

    if (
      hasPermission(
        user,
        "tickets.view",
      )
    ) {
      sources.push({
        module: "tickets",
        description:
          "Authorized ticket information for the requested employee.",
      });
    }

    sources.push({
      module: "calendar",
      description:
        "Authorized calendar information for the requested employee.",
    });
  }

  /**
   * --------------------------------------------------------------------------
   * EMPLOYEE PROFILE LOOKUP
   * --------------------------------------------------------------------------
   */

  if (
    plan.domains.includes(
      "EMPLOYEE",
    ) &&
    (
      plan.scope ===
        "EMPLOYEE" ||
      plan.scope ===
        "SELF"
    ) &&
    plan.task !== "SUMMARY"
  ) {
    const employeeResult =
      await executeEmployeeLookup(
        user,
        plan,
      );

    /**
     * New canonical shape:
     *
     * data.employee.designation
     *
     * Compatibility shape:
     *
     * data.employeeLookup.employee
     *
     * This allows older fallback code to continue working.
     */
    data.employee =
      employeeResult;

    data.employeeLookup = {
      employee:
        employeeResult,
    };

    sources.push({
      module: "employee",
      description:
        "Authorized employee profile information.",
    });
  }

  /**
   * --------------------------------------------------------------------------
   * MY TEAM ORGANIZATION
   * --------------------------------------------------------------------------
   */

  if (
    plan.scope ===
      "MY_TEAM" &&
    plan.domains.includes(
      "ORGANIZATION",
    )
  ) {
    data.organization =
      await executeMyTeamOrganization(
        user,
      );

    sources.push({
      module: "organization",
      description:
        "Authorized direct-team organization information.",
    });
  }

  /**
   * --------------------------------------------------------------------------
   * MY TEAM ATTENDANCE
   * --------------------------------------------------------------------------
   */

  if (
    plan.scope ===
      "MY_TEAM" &&
    plan.domains.includes(
      "ATTENDANCE",
    )
  ) {
    data.teamAttendance =
      await executeTeamAttendance(
        user,
        plan,
      );

    sources.push({
      module: "attendance",
      description:
        "Authorized attendance information for the authenticated user's direct team.",
    });
  }

  /**
   * --------------------------------------------------------------------------
   * NAMED EMPLOYEE ORGANIZATION
   * --------------------------------------------------------------------------
   */

  if (
    plan.scope ===
      "EMPLOYEE" &&
    plan.domains.includes(
      "ORGANIZATION",
    )
  ) {
    data.organization =
      await executeOrganizationQuery(
        user,
        plan,
      );

    sources.push({
      module: "organization",
      description:
        "Authorized organization reporting information.",
    });
  }

  /**
   * --------------------------------------------------------------------------
   * INDIVIDUAL ATTENDANCE
   * --------------------------------------------------------------------------
   */

  if (
    plan.scope ===
      "EMPLOYEE" &&
    plan.domains.includes(
      "ATTENDANCE",
    ) &&
    plan.task !== "SUMMARY"
  ) {
    data.attendance =
      await executeEmployeeAttendance(
        user,
        plan,
      );

    sources.push({
      module: "attendance",
      description:
        "Authorized attendance information for the requested employee.",
    });
  }

  /**
   * --------------------------------------------------------------------------
   * INDIVIDUAL PERFORMANCE
   * --------------------------------------------------------------------------
   */

  if (
    plan.scope ===
      "EMPLOYEE" &&
    plan.domains.includes(
      "PERFORMANCE",
    ) &&
    plan.task !== "SUMMARY"
  ) {
    data.performance =
      await executePerformance(
        user,
        plan,
      );

    sources.push({
      module: "performance",
      description:
        "Authorized performance information for the requested employee.",
    });
  }

  /**
   * --------------------------------------------------------------------------
   * INDIVIDUAL LEAVE
   * --------------------------------------------------------------------------
   */

  if (
    plan.scope ===
      "EMPLOYEE" &&
    plan.domains.includes(
      "LEAVE",
    ) &&
    plan.task !== "SUMMARY"
  ) {
    data.leave =
      await executeLeave(
        user,
        plan,
      );

    sources.push({
      module: "leave",
      description:
        "Authorized leave information for the requested employee.",
    });
  }

  /**
   * --------------------------------------------------------------------------
   * SELF ATTENDANCE
   * --------------------------------------------------------------------------
   */

  if (
    plan.scope ===
      "SELF" &&
    plan.domains.includes(
      "ATTENDANCE",
    ) &&
    plan.task !== "SUMMARY"
  ) {
    data.attendance =
      await executeSelfAttendance(
        user,
        plan,
      );

    sources.push({
      module: "attendance",
      description:
        "Authenticated user's authorized attendance information.",
    });
  }

  /**
   * --------------------------------------------------------------------------
   * SELF PERFORMANCE
   * --------------------------------------------------------------------------
   */

  if (
    plan.scope ===
      "SELF" &&
    plan.domains.includes(
      "PERFORMANCE",
    ) &&
    plan.task !== "SUMMARY"
  ) {
    data.performance =
      await executeSelfPerformance(
        user,
      );

    sources.push({
      module: "performance",
      description:
        "Authenticated user's authorized performance information.",
    });
  }

  /**
   * --------------------------------------------------------------------------
   * SELF LEAVE
   * --------------------------------------------------------------------------
   */

  if (
    plan.scope ===
      "SELF" &&
    plan.domains.includes(
      "LEAVE",
    ) &&
    plan.task !== "SUMMARY"
  ) {
    data.leave =
      await executeSelfLeave(
        user,
      );

    sources.push({
      module: "leave",
      description:
        "Authenticated user's authorized leave information.",
    });
  }

  /**
   * --------------------------------------------------------------------------
   * SAFETY FALLBACK
   * --------------------------------------------------------------------------
   */

  if (
    Object.keys(data)
      .length === 0
  ) {
    data.message =
      "No authorized HRMS data was available for this question.";
  }

  return {
    data,
    sources,
  };
}