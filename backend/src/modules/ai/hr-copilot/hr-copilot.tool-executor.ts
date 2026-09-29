import * as attendanceRepo from "@/modules/attendance/attendance.repository";
import * as employeeRepo from "@/modules/employees/employees.repository";
import * as leaveRepo from "@/modules/leave/leave.repository";
import * as performanceRepo from "@/modules/performance/performance.repository";
import * as organizationRepo from "@/modules/organization/organization.repository";
import * as calendarRepo from "@/modules/calendar/calendar.repository";
import * as documentsRepo from "@/modules/documents/documents.repository";
import * as ticketRepo from "@/modules/tickets/ticket.repository";
import * as announcementRepo from "@/modules/announcements/announcement.repository";
import * as recruitmentRepo from "@/modules/recruitment/recruitment.repository";
import * as reportsRepo from "@/modules/reports/reports.repository";
import * as dashboardRepo from "@/modules/dashboard/dashboard.repository";

import type {
  HrCopilotUserContext,
  HrCopilotSource,
} from "./hr-copilot.types";

import type {
  HrCopilotPlan,
} from "./hr-copilot.planner";

type ExecutorResult = {
  data: Record<string, any>;
  sources: HrCopilotSource[];
};

type EmployeeTarget = {
  employee: any | null;
  employeeId: string | null;
  message?: string;
};

type DateRange = {
  start: string;
  end: string;
};

type HrCopilotExecutorScope = HrCopilotPlan["scope"] | "TEAM";

function hasPermission(
  user: HrCopilotUserContext,
  permission: string,
): boolean {
  if (
    user.role === "SUPER_ADMIN" ||
    user.role === "HR_ADMIN"
  ) {
    return true;
  }

  if (
    user.permissions.includes(permission)
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

function getRoleScope(
  user: HrCopilotUserContext,
): "ALL" | "TEAM" | "SELF" {
  if (
    user.role === "SUPER_ADMIN" ||
    user.role === "HR_ADMIN"
  ) {
    return "ALL";
  }

  if (
    user.role === "MANAGER"
  ) {
    return "TEAM";
  }

  return "SELF";
}

async function executePayroll(
  _user: HrCopilotUserContext,
  _plan: HrCopilotPlan,
) {
  return {
    message: "Payroll information is outside the AI HR Copilot scope.",
  };
}

/**
 * ============================================================================
 * AUTHORIZED REQUEST SCOPE
 * ============================================================================
 *
 * The planner's scope describes what the user is asking for. It is NOT an
 * authorization grant. The authenticated user's role remains the security
 * boundary.
 *
 * This helper preserves the existing supported planner scopes while ensuring
 * that a planner/LLM response can never expand the authenticated user's data
 * scope. Named-employee requests (EMPLOYEE) remain available so the existing
 * resolveEmployeeTarget() authorization flow can enforce self/direct-report
 * access.
 */
function getAuthorizedRequestScope(
  user: HrCopilotUserContext,
  requestedScope: HrCopilotPlan["scope"] | undefined,
): HrCopilotExecutorScope {
  const requested = String(
    requestedScope ?? "SELF",
  ).toUpperCase();

  const roleScope = getRoleScope(user);

  /**
   * Organization-wide roles may keep the planner's requested scope.
   * MY_TEAM is normalized to the executor's existing TEAM scope so the
   * established team execution paths continue to work.
   */
  if (roleScope === "ALL") {
    if (requested === "MY_TEAM") {
      return "TEAM";
    }

    return requested as HrCopilotPlan["scope"];
  }

  /**
   * Managers may work with their own team or their own employee record, but
   * they cannot expand the request to department/organization/all employees.
   * EMPLOYEE is intentionally preserved because resolveEmployeeTarget()
   * verifies that the named employee is a direct report or the manager.
   */
  if (roleScope === "TEAM") {
    switch (requested) {
      case "SELF":
      case "EMPLOYEE":
        return requested as HrCopilotPlan["scope"];

      case "MY_TEAM":
        return "TEAM";

      case "DEPARTMENT":
      case "ORGANIZATION":
      case "AUTHORIZED_EMPLOYEES":
      case "UNKNOWN":
      default:
        return "TEAM";
    }
  }

  /**
   * SELF-scoped roles can never be expanded by planner output. A named
   * employee request remains EMPLOYEE so the existing employee-target
   * authorization path can return the appropriate denial when necessary.
   */
  switch (requested) {
    case "EMPLOYEE":
      return "EMPLOYEE";

    case "SELF":
    case "MY_TEAM":
    case "DEPARTMENT":
    case "ORGANIZATION":
    case "AUTHORIZED_EMPLOYEES":
    case "UNKNOWN":
    default:
      return "SELF";
  }
}

/**
 * ============================================================================
 * SAFE REPOSITORY CALL
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
 * EMPLOYEE HELPERS
 * ============================================================================
 */

function displayName(
  employee: any,
): string {
  return String(
    employee?.fullName ??
      employee?.name ??
      [
        employee?.firstName,
        employee?.lastName,
      ]
        .filter(Boolean)
        .join(" ") ??
      "",
  ).trim();
}

function normalizeName(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function sanitizeEmployee(
  employee: any,
) {
  if (!employee) {
    return null;
  }

  return {
    id:
      employee.id !== undefined &&
      employee.id !== null
        ? String(employee.id)
        : employee._id !== undefined &&
            employee._id !== null
          ? String(employee._id)
          : employee.employeeId !== undefined &&
              employee.employeeId !== null
            ? String(employee.employeeId)
            : null,

    name:
      displayName(employee) ||
      "Employee",

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
      employee.manager?.name ??
      employee.managerName ??
      ([
        employee.managerFirstName,
        employee.managerLastName,
      ]
        .filter(Boolean)
        .join(" ") ||
        null),

    skills:
      Array.isArray(
        employee.skills,
      )
        ? employee.skills
            .slice(0, 30)
            .map(
              (skill: any) => ({
                name:
                  skill.name ??
                  skill,
                category:
                  skill.category ??
                  null,
                competencyLevel:
                  skill.competencyLevel ??
                  null,
              }),
            )
        : [],
  };
}

/**
 * ============================================================================
 * EMPLOYEE SEARCH
 * ============================================================================
 */

async function findEmployeeMatches(
  searchText: string,
): Promise<any[]> {
  const cleaned = searchText.trim();
  if (!cleaned) return [];

  const normalizedSearch = normalizeName(cleaned);
  const tokens = normalizedSearch
    .split(" ")
    .filter((token) => token.length >= 2);

  const candidateMap = new Map<string, any>();

  const addCandidates = (rows: any[]) => {
    for (const employee of rows) {
      const id = String(
        employee?.id ??
          employee?._id ??
          employee?.employeeId ??
          "",
      ).trim();
      if (id) candidateMap.set(id, employee);
    }
  };

  // Search both repositories instead of returning from the first partial match.
  // The organization search is useful for names, while employee search also
  // supports employee codes and email addresses.
  const [nameMatches, directSearch] = await Promise.all([
    safe<any[]>(organizationRepo.findEmployeesByName(cleaned)),
    safe<any>(
      employeeRepo.listEmployees({
        search: cleaned,
        page: 1,
        pageSize: 50,
      }),
    ),
  ]);

  addCandidates(Array.isArray(nameMatches) ? nameMatches : []);
  addCandidates(
    Array.isArray(directSearch?.employees)
      ? directSearch.employees
      : [],
  );

  if (tokens.length >= 2) {
    const tokenResults = await Promise.all(
      tokens.map((token) =>
        safe<any>(
          employeeRepo.listEmployees({
            search: token,
            page: 1,
            pageSize: 50,
          }),
        ),
      ),
    );

    for (const result of tokenResults) {
      addCandidates(
        Array.isArray(result?.employees)
          ? result.employees
          : [],
      );
    }
  }

  const candidates = Array.from(candidateMap.values());
  if (!candidates.length) return [];

  const exactNameMatches = candidates.filter(
    (employee: any) =>
      normalizeName(displayName(employee)) === normalizedSearch,
  );
  if (exactNameMatches.length) return exactNameMatches;

  const exactCodeMatches = candidates.filter(
    (employee: any) =>
      String(employee?.employeeCode ?? "").trim().toLowerCase() ===
      cleaned.toLowerCase(),
  );
  if (exactCodeMatches.length) return exactCodeMatches;

  const tokenMatches =
    tokens.length >= 2
      ? candidates.filter((employee: any) => {
          const fullName = normalizeName(displayName(employee));
          return tokens.every((token) => fullName.includes(token));
        })
      : [];

  if (tokenMatches.length) return tokenMatches;

  // A single unambiguous candidate is safe to use; otherwise preserve all
  // candidates so resolveEmployeeTarget can ask for clarification.
  return candidates;
}

/**
 * ============================================================================
 * DIRECT REPORT CHECK
 * ============================================================================
 */

async function isDirectReport(
  user: HrCopilotUserContext,
  employeeId: string,
): Promise<boolean> {
  if (
    !user.employeeId
  ) {
    return false;
  }

  if (
    String(
      user.employeeId,
    ) ===
    String(employeeId)
  ) {
    return true;
  }

  const reports =
    await safe<any[]>(
      employeeRepo.listDirectReports(
        String(
          user.employeeId,
        ),
      ),
    );

  if (
    !Array.isArray(reports)
  ) {
    return false;
  }

  return reports.some(
    (employee: any) =>
      String(
        employee?.id ??
          employee?._id ??
          employee?.employeeId ??
          "",
      ) ===
      String(employeeId),
  );
}

/**
 * ============================================================================
 * EMPLOYEE TARGET RESOLUTION
 * ============================================================================
 *
 * THIS FUNCTION IS THE CENTRAL DATA SECURITY BOUNDARY.
 *
 * Groq cannot bypass this function.
 */

async function resolveEmployeeTarget(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
): Promise<EmployeeTarget> {
  /**
   * SELF always means authenticated employee.
   *
   * Never search the database using the words "my", "me", etc.
   */

  if (
    plan.scope === "SELF"
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

    const employee =
      await safe<any>(
        employeeRepo.getEmployeeById(
          String(
            user.employeeId,
          ),
        ),
      );

    if (!employee) {
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
          employee,
        ),
      employeeId:
        String(
          user.employeeId,
        ),
    };
  }

  /**
   * If no employee was explicitly identified,
   * use self when appropriate.
   */

  if (
    !plan.targetEmployeeName
  ) {
    return {
      employee: null,
      employeeId: null,
      message:
        "No specific employee was identified for this request.",
    };
  }

  /**
   * Employee lookup requires employee-view permission.
   */

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
    plan.targetEmployeeName.trim();

  /**
   * "me", "my", "myself"
   */

  if (
    /^(me|my|myself)$/i.test(
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

    const own =
      await safe<any>(
        employeeRepo.getEmployeeById(
          String(
            user.employeeId,
          ),
        ),
      );

    return {
      employee:
        sanitizeEmployee(
          own,
        ),
      employeeId:
        String(
          user.employeeId,
        ),
    };
  }

  /**
   * Search employee.
   */

  const matches =
    await findEmployeeMatches(
      searchText,
    );

  if (
    !matches.length
  ) {
    return {
      employee: null,
      employeeId: null,
      message:
        `No employee matching "${searchText}" was found.`,
    };
  }

  if (
    matches.length > 1
  ) {
    return {
      employee: null,
      employeeId: null,
      message:
        `More than one employee matches "${searchText}". Please provide the employee's full name or employee code.`,
    };
  }

  const candidate =
    matches[0];

  const candidateId =
    String(
      candidate?.id ??
        candidate?._id ??
        candidate?.employeeId ??
        "",
    );

  if (!candidateId) {
    return {
      employee: null,
      employeeId: null,
      message:
        "The employee record could not be resolved.",
    };
  }

  /**
   * Fetch enriched employee record.
   */

  const enriched =
    await safe<any>(
      employeeRepo.getEmployeeById(
        candidateId,
      ),
    );

  if (!enriched) {
    return {
      employee: null,
      employeeId: null,
      message:
        "The employee profile could not be retrieved.",
    };
  }

  /**
   * ========================================================================
   * AUTHORIZATION
   * ========================================================================
   */

  const role = String(user.role ?? "").toUpperCase();

  if (role === "SUPER_ADMIN" || role === "HR_ADMIN") {
    return {
      employee: sanitizeEmployee(enriched),
      employeeId: candidateId,
    };
  }

  if (
    user.employeeId &&
    String(user.employeeId) === candidateId
  ) {
    return {
      employee:
        sanitizeEmployee(
          enriched,
        ),
      employeeId:
        candidateId,
    };
  }

  /**
   * MANAGER
   *
   * Only direct reports.
   */

  if (
    role === "MANAGER"
  ) {
    const allowed =
      await isDirectReport(
        user,
        candidateId,
      );

    if (!allowed) {
      return {
        employee: null,
        employeeId: null,
        message:
          "You are only authorized to view your own information and information belonging to your direct reports.",
      };
    }

    return {
      employee:
        sanitizeEmployee(
          enriched,
        ),
      employeeId:
        candidateId,
    };
  }

  /**
   * EMPLOYEE / FINANCE / IT_SUPPORT / RECRUITER
   *
   * Self only.
   */

  return {
    employee: null,
    employeeId: null,
    message:
      "You are only authorized to view your own HR information.",
  };
}

/**
 * ============================================================================
 * DATE RANGE
 * ============================================================================
 */

function resolveDateRange(
  plan: HrCopilotPlan,
): DateRange {
  const IST_TIME_ZONE = "Asia/Kolkata";
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const base = new Date(`${today}T00:00:00.000Z`);
  const toDateString = (date: Date) => date.toISOString().slice(0, 10);

  if (plan.timeRange === "TODAY") {
    return { start: today, end: today };
  }

  if (plan.timeRange === "YESTERDAY") {
    const date = new Date(base);
    date.setUTCDate(date.getUTCDate() - 1);
    const value = toDateString(date);
    return { start: value, end: value };
  }

  if (plan.timeRange === "THIS_WEEK") {
    const date = new Date(base);
    const day = date.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    date.setUTCDate(date.getUTCDate() - diff);
    return { start: toDateString(date), end: today };
  }

  if (plan.timeRange === "LAST_WEEK") {
    const end = new Date(base);
    const day = end.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    end.setUTCDate(end.getUTCDate() - diff - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    return { start: toDateString(start), end: toDateString(end) };
  }

  if (plan.timeRange === "THIS_MONTH") {
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    return { start: toDateString(start), end: today };
  }

  if (plan.timeRange === "THIS_YEAR") {
    const start = new Date(Date.UTC(base.getUTCFullYear(), 0, 1));
    return { start: toDateString(start), end: today };
  }

  if (plan.timeRange === "LAST_MONTH") {
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 0));
    return { start: toDateString(start), end: toDateString(end) };
  }

  if (plan.timeRange === "LAST_30_DAYS") {
    const start = new Date(base);
    start.setUTCDate(start.getUTCDate() - 30);
    return { start: toDateString(start), end: today };
  }

  if (plan.timeRange === "LAST_90_DAYS") {
    const start = new Date(base);
    start.setUTCDate(start.getUTCDate() - 90);
    return { start: toDateString(start), end: today };
  }

  // Preserve the existing default behavior for CURRENT/UNKNOWN: current month.
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  return { start: toDateString(start), end: today };
}

/**
 * ============================================================================
 * ATTENDANCE
 * ============================================================================
 */

async function executeAttendance(
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
    target.message &&
    !target.employeeId
  ) {
    return target;
  }

  if (
    !target.employeeId
  ) {
    return {
      message:
        "No employee could be resolved for this attendance request.",
    };
  }

  const range =
    resolveDateRange(
      plan,
    );

  const attendance =
    await safe<any>(
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
      attendance ??
      null,
  };
}

/**
 * ============================================================================
 * PERFORMANCE / GOALS
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
    target.message &&
    !target.employeeId
  ) {
    return target;
  }

  if (
    !target.employeeId
  ) {
    return {
      message:
        "No employee could be resolved for this performance request.",
    };
  }

  const performance =
    await safe<any>(
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
    target.message &&
    !target.employeeId
  ) {
    return target;
  }

  if (
    !target.employeeId
  ) {
    return {
      message:
        "No employee could be resolved for this leave request.",
    };
  }

  const leave =
    await safe<any>(
      leaveRepo.listBalancesForEmployee(
        target.employeeId,
        new Date().getFullYear(),
      ),
    );

  const requests =
    await safe<any[]>(
      leaveRepo.listRequests({
        employeeId:
          target.employeeId,
      }),
    );

  const year =
    new Date().getFullYear();

  const yearStart =
    `${year}-01-01`;

  const yearEnd =
    `${year}-12-31`;

  const approvedRequests =
    Array.isArray(requests)
      ? requests.filter(
          (request: any) =>
            String(
              request?.status ??
                "",
            ).toUpperCase() ===
              "APPROVED" &&
            String(
              request?.startDate ??
                "",
            ) <= yearEnd &&
            String(
              request?.endDate ??
                "",
            ) >= yearStart,
        )
      : [];

  const pendingRequests =
    Array.isArray(requests)
      ? requests.filter(
          (request: any) =>
            String(
              request?.status ??
                "",
            ).toUpperCase() ===
              "PENDING" &&
            String(
              request?.startDate ??
                "",
            ) <= yearEnd &&
            String(
              request?.endDate ??
                "",
            ) >= yearStart,
        )
      : [];

  const balances =
    Array.isArray(leave)
      ? leave.map((balance: any) => {
          const leaveTypeId = String(
            balance?.leaveTypeId ?? "",
          );
          const pending = pendingRequests
            .filter(
              (request: any) =>
                String(
                  request?.leaveTypeId ?? "",
                ) === leaveTypeId,
            )
            .reduce(
              (total: number, request: any) =>
                total + Number(request?.totalDays ?? 0),
              0,
            );
          const allotted =
            Number(balance?.allotted ?? 0) +
            Number(balance?.carriedOver ?? 0);
          const used = Number(balance?.used ?? 0);

          return {
            ...balance,
            pending,
            available: Math.max(0, allotted - used - pending),
          };
        })
      : [];

  const leavesTakenThisYear =
    approvedRequests.reduce(
      (
        total: number,
        request: any,
      ) =>
        total +
        Number(
          request?.totalDays ??
            0,
        ),
      0,
    );

  return {
    employee:
      target.employee,

    leave:
      leave ??
      [],

    balances,

    leaveRequests:
      requests ??
      [],

    requests:
      requests ??
      [],

    leaveSummary: {
      year,
      leavesTakenThisYear,
      approvedRequestCount:
        approvedRequests.length,
    },
  };
}

/**
 * ============================================================================
 * CALENDAR
 * ============================================================================
 */

async function executeCalendar(
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
        "You do not have permission to view calendar information.",
    };
  }

  const target =
    await resolveEmployeeTarget(
      user,
      plan,
    );

  if (
    target.message &&
    !target.employeeId
  ) {
    return target;
  }

  if (
    !target.employeeId
  ) {
    return {
      message:
        "No employee could be resolved for this calendar request.",
    };
  }

  const now =
    new Date();

  const until =
    new Date(
      now.getTime() +
        14 *
          24 *
          60 *
          60 *
          1000,
    );

  const events =
    await safe<any[]>(
      calendarRepo.getUpcomingEvents(
        target.employeeId,
        now.toISOString(),
        until.toISOString(),
      ),
    );

  return {
    employee:
      target.employee,

    calendar:
      events ??
      [],
  };
}

/**
 * ============================================================================
 * DOCUMENTS
 * ============================================================================
 */

async function executeDocuments(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  if (
    !hasPermission(
      user,
      "documents.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view document information.",
    };
  }

  const target =
    await resolveEmployeeTarget(
      user,
      plan,
    );

  if (
    target.message &&
    !target.employeeId
  ) {
    return target;
  }

  if (
    !target.employeeId
  ) {
    return {
      message:
        "No employee could be resolved for this document request.",
    };
  }

  const documents =
    await safe<any[]>(
      documentsRepo.listDocuments(
        target.employeeId,
      ),
    );

  return {
    employee:
      target.employee,

    documents:
      documents ??
      [],
  };
}

/**
 * ============================================================================
 * TICKETS
 * ============================================================================
 */

async function executeTickets(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  if (
    !hasPermission(
      user,
      "tickets.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view ticket information.",
    };
  }

  const target =
    await resolveEmployeeTarget(
      user,
      plan,
    );

  if (
    target.message &&
    !target.employeeId
  ) {
    return target;
  }

  if (
    !target.employeeId
  ) {
    return {
      message:
        "No employee could be resolved for this ticket request.",
    };
  }

  const tickets =
    await safe<any[]>(
      ticketRepo.getMyTickets(
        target.employeeId,
      ),
    );

  return {
    employee:
      target.employee,

    tickets:
      tickets ??
      [],
  };
}

async function executeTicketCount(
  user: HrCopilotUserContext,
) {
  if (!hasPermission(user, "tickets.view")) {
    return {
      message: "You do not have permission to view ticket information.",
    };
  }

  let employeeIds: string[] | undefined;
  const roleScope = getRoleScope(user);

  if (roleScope === "SELF" || roleScope === "TEAM") {
    if (!user.employeeId) {
      return {
        message: "An employee profile is required to count tickets in your scope.",
      };
    }

    employeeIds = [String(user.employeeId)];

    if (roleScope === "TEAM") {
      const directReports = await safe<any[]>(
        employeeRepo.listDirectReports(String(user.employeeId)),
      );

      if (!Array.isArray(directReports)) {
        return {
          message: "The authorized team ticket count is currently unavailable.",
        };
      }

      employeeIds.push(
        ...directReports
          .map((employee: any) =>
            String(employee?.id ?? employee?._id ?? employee?.employeeId ?? ""),
          )
          .filter(Boolean),
      );
      employeeIds = Array.from(new Set(employeeIds));
    }
  }

  const total = await safe<number>(
    roleScope === "ALL"
      ? ticketRepo.getTickets().then((tickets) => tickets.length)
      : ticketRepo.countTickets(employeeIds ?? []),
  );

  if (total === null) {
    return {
      message: "The authorized ticket count is currently unavailable.",
    };
  }

  return {
    total,
    scope: roleScope,
  };
}

async function executeOrganizationEmployeeCount(
  user: HrCopilotUserContext,
) {
  if (
    user.role !== "SUPER_ADMIN" &&
    user.role !== "HR_ADMIN"
  ) {
    return {
      message:
        "Company-wide employee counts are only available to HR administrators.",
    };
  }

  if (!hasPermission(user, "employees.view")) {
    return {
      message: "You do not have permission to view employee information.",
    };
  }

  const [allEmployees, activeEmployees] = await Promise.all([
    safe<any>(employeeRepo.listEmployees({ page: 1, pageSize: 1 })),
    safe<any>(
      employeeRepo.listEmployees({
        status: "ACTIVE",
        page: 1,
        pageSize: 1,
      }),
    ),
  ]);

  if (!allEmployees || !activeEmployees) {
    return {
      message: "Company-wide employee counts are currently unavailable.",
    };
  }

  return {
    total: allEmployees.total,
    active: activeEmployees.total,
  };
}

/**
 * ============================================================================
 * ORGANIZATION / MANAGER / TEAM
 * ============================================================================
 */

async function executeOrganization(
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
    target.message &&
    !target.employeeId
  ) {
    return target;
  }

  if (
    !target.employeeId
  ) {
    return {
      message:
        "No employee could be resolved for this organization request.",
    };
  }

  /**
   * Manager lookup.
   */

  const asksManager =
    [
      ...(plan.conditions ??
        []),
      ...(plan.requestedFields ??
        []),
    ]
      .join(" ")
      .toLowerCase()
      .includes("manager");

  if (
    asksManager
  ) {
    const employee =
      await safe<any>(
        employeeRepo.getEmployeeById(
          target.employeeId,
        ),
      );

    const managerId =
      employee?.managerId ??
      employee?.manager?.id ??
      employee?.manager?._id ??
      null;

    if (
      managerId
    ) {
      const manager =
        await safe<any>(
          employeeRepo.getEmployeeById(
            String(
              managerId,
            ),
          ),
        );

      return {
        relation:
          "MANAGER",

        employee:
          target.employee,

        manager:
          sanitizeEmployee(
            manager,
          ),
      };
    }

    /**
     * Organization repository can sometimes resolve
     * the manager even when the enriched employee object
     * does not contain managerId.
     */

    const organizationManager =
      await safe<any>(
        (
          organizationRepo as any
        ).getEmployeeManager
          ? (
              organizationRepo as any
            ).getEmployeeManager(
              target.employeeId,
            )
          : Promise.resolve(
              null,
            ),
      );

    if (
      organizationManager
    ) {
      return {
        relation:
          "MANAGER",

        employee:
          target.employee,

        manager:
          sanitizeEmployee(
            organizationManager,
          ),
      };
    }

    return {
      relation:
        "MANAGER",

      employee:
        target.employee,

      manager:
        null,

      message:
        "The manager information is not available in the authorized HRMS data.",
    };
  }

  /**
   * Direct reports.
   */

  const directReports =
    await safe<any[]>(
      employeeRepo.listDirectReports(
        target.employeeId,
      ),
    );

  const employees =
    Array.isArray(
      directReports,
    )
      ? directReports.map(
          sanitizeEmployee,
        )
      : [];

  return {
    relation:
      "DIRECT_REPORTS",

    manager:
      target.employee,

    employees,

    total:
      employees.length,
  };
}

/**
 * ============================================================================
 * RECRUITMENT
 * ============================================================================
 */

async function executeRecruitment(
  user: HrCopilotUserContext,
) {
  if (
    !hasPermission(
      user,
      "recruitment.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view recruitment information.",
    };
  }

  /**
   * Keep the repository call isolated because recruitment
   * implementations can differ between HRMS versions.
   */

  const repository =
    recruitmentRepo as any;

  let result:
    any = null;

  if (
    typeof repository.listJobPostings ===
    "function"
  ) {
    result =
      await safe<any>(
        repository.listJobPostings(
          "OPEN",
        ),
      );
  } else if (
    typeof repository.listJobs ===
    "function"
  ) {
    result =
      await safe<any>(
        repository.listJobs(),
      );
  } else if (
    typeof repository.getOpenPositions ===
    "function"
  ) {
    result =
      await safe<any>(
        repository.getOpenPositions(),
      );
  }

  return {
    recruitment:
      result ??
      [],
  };
}

/**
 * ============================================================================
 * ANNOUNCEMENTS
 * ============================================================================
 */

async function executeAnnouncements(
  user: HrCopilotUserContext,
) {
  if (
    !hasPermission(
      user,
      "announcements.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view announcements.",
    };
  }

  const announcements =
    await safe<any>(
      announcementRepo.getAnnouncements(
        user.role,
        user.userId,
      ),
    );

  return {
    announcements:
      Array.isArray(
        announcements,
      )
        ? announcements
        : announcements?.announcements ??
          [],
  };
}

/**
 * ============================================================================
 * ORGANIZATION ATTENDANCE
 * ============================================================================
 *
 * Organization-wide attendance is allowed only for SUPER_ADMIN / HR_ADMIN.
 * Managers must use the TEAM scope, and other roles remain SELF-only.
 *
 * The attendance repository performs the actual attendance calculation.
 * The Copilot executor only resolves the authorized employee population.
 */

async function executeOrganizationAttendance(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  if (
    user.role !==
      "SUPER_ADMIN" &&
    user.role !==
      "HR_ADMIN"
  ) {
    return {
      message:
        "Organization-wide attendance information is available only within an authorized HR administration scope.",
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
        "You do not have permission to view organization-wide attendance information.",
    };
  }

  const repository =
    employeeRepo as any;

  if (
    typeof repository.listEmployees !==
    "function"
  ) {
    return {
      message:
        "Employee data required for the attendance calculation is not available.",
    };
  }

  /**
   * Retrieve the full active employee population without assuming
   * a fixed page size. listEmployees() exposes total/page/pageSize.
   */
  const pageSize = 100;
  let page = 1;
  let total = 0;
  const employeeIds: string[] = [];

  do {
    const result =
      await safe<any>(
        repository.listEmployees({
          status: "ACTIVE",
          page,
          pageSize,
        }),
      );

    const employees =
      Array.isArray(
        result?.employees,
      )
        ? result.employees
        : [];

    for (
      const employee of employees
    ) {
      const id =
        employee?.id ??
        employee?._id ??
        employee?.employeeId;

      if (id) {
        employeeIds.push(
          String(id),
        );
      }
    }

    total =
      Number(
        result?.total ??
          0,
      );

    if (
      employees.length ===
        0
    ) {
      break;
    }

    page += 1;
  } while (
    employeeIds.length <
      total &&
    page <= 1000
  );

  const uniqueEmployeeIds =
    Array.from(
      new Set(
        employeeIds,
      ),
    );

  const range =
    resolveDateRange(
      plan,
    );

  const repositoryAttendance =
    attendanceRepo as any;

  if (
    typeof repositoryAttendance.getAiAttendanceInsightsForEmployees !==
    "function"
  ) {
    return {
      message:
        "Organization-wide attendance analysis is not available in the current attendance repository.",
    };
  }

  const attendance =
    await safe<any>(
      repositoryAttendance.getAiAttendanceInsightsForEmployees(
        uniqueEmployeeIds,
        range.start,
        range.end,
      ),
    );

  if (
    !attendance
  ) {
    return {
      scope:
        "ORGANIZATION",

      period:
        range,

      employeeCount:
        uniqueEmployeeIds.length,

      attendance:
        null,

      message:
        "No attendance analysis data was returned for the authorized employee population.",
    };
  }

  return {
    scope:
      "ORGANIZATION",

    period:
      range,

    employeeCount:
      uniqueEmployeeIds.length,

    attendance,
  };
}

/**
 * ============================================================================
 * REPORTS
 * ============================================================================
 */

async function executeReports(
  user: HrCopilotUserContext,
) {
  if (!hasPermission(user, "reports.view")) {
    return {
      message: "You do not have permission to view reports.",
    };
  }

  const repository = reportsRepo as any;

  if (typeof repository.workforce === "function") {
    // The reports repository accepts ReportFilters plus an optional employee-ID
    // scope. It does not accept a role string. Build the scope here so the
    // Copilot cannot accidentally expose organization-wide reports to a
    // manager or self-scoped role.
    let employeeIds: string[] | undefined;

    if (user.role === "MANAGER") {
      const reports = await safe<any[]>(
        employeeRepo.listDirectReports(String(user.employeeId ?? "")),
      );
      employeeIds = Array.isArray(reports)
        ? reports
            .map((employee: any) =>
              String(employee?.id ?? employee?._id ?? employee?.employeeId ?? ""),
            )
            .filter(Boolean)
        : [];
    } else if (user.role !== "SUPER_ADMIN" && user.role !== "HR_ADMIN") {
      employeeIds = user.employeeId ? [String(user.employeeId)] : [];
    }

    const report = await safe<any>(
      repository.workforce({}, employeeIds),
    );

    return {
      reports: report ?? null,
    };
  }

  if (typeof repository.getWorkforceReport === "function") {
    // Keep compatibility with older repository versions that expose a legacy
    // method. Prefer the repository's existing method signature when present.
    const report = await safe<any>(
      repository.getWorkforceReport(user.role, user.employeeId),
    );

    return {
      reports: report ?? null,
    };
  }

  return {
    reports: null,
    message: "The requested report is not available.",
  };
}

/**
 * ============================================================================
 * DASHBOARD
 * ============================================================================
 */

async function executeDashboard(
  user: HrCopilotUserContext,
) {
  if (
    !hasPermission(
      user,
      "reports.view",
    )
  ) {
    return {
      message:
        "You do not have permission to view dashboard information.",
    };
  }

  const repository =
    dashboardRepo as any;

  let dashboard:
    any = null;

  if (
    typeof repository.getKpis ===
    "function"
  ) {
    dashboard =
      await safe<any>(
        repository.getKpis(
          user.role,
          user.employeeId,
        ),
      );
  } else if (
    typeof repository.getDashboardKpis ===
    "function"
  ) {
    dashboard =
      await safe<any>(
        repository.getDashboardKpis(
          user.role,
          user.employeeId,
        ),
      );
  } else if (
    typeof repository.getDashboard ===
    "function"
  ) {
    dashboard =
      await safe<any>(
        repository.getDashboard(
          user.role,
          user.employeeId,
        ),
      );
  }

  return {
    dashboard:
      dashboard ??
      null,
  };
}

/**
 * ============================================================================
 * SELF / EMPLOYEE SUMMARY
 * ============================================================================
 *
 * This is intentionally cross-module.
 *
 * "Give me an overall summary of my work status"
 *
 * can retrieve:
 *
 * Employee
 * Attendance
 * Leave
 * Performance
 * Calendar
 * Documents
 * Tickets
 * Announcements
 *
 * depending on authorization and available repositories.
 */

async function executeSummary(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
) {
  const target =
    await resolveEmployeeTarget(
      user,
      plan,
    );

  if (
    target.message &&
    !target.employeeId
  ) {
    return target;
  }

  if (
    !target.employeeId
  ) {
    return {
      message:
        "The employee profile could not be resolved.",
    };
  }

  const employeeId =
    target.employeeId;

  const employee =
    target.employee;

  const result:
    Record<string, any> = {};

  /**
   * Employee
   */

  if (
    hasPermission(
      user,
      "employees.view",
    )
  ) {
    result.employee =
      employee;
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
    const range =
      resolveDateRange(
        plan,
      );

    const attendance =
      await safe<any>(
        attendanceRepo.getAiAttendanceInsights(
          employeeId,
          range.start,
          range.end,
        ),
      );

    result.attendance =
      attendance ??
      null;
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
    const leave =
      await safe<any>(
        leaveRepo.listBalancesForEmployee(
          employeeId,
          new Date().getFullYear(),
        ),
      );

    result.leave =
      leave ??
      [];

    const requests =
      await safe<any[]>(
        leaveRepo.listRequests({
          employeeId,
        }),
      );

    result.leaveRequests =
      requests ??
      [];
  }

  /**
   * Performance / Goals
   */

  if (
    hasPermission(
      user,
      "performance.view",
    )
  ) {
    const performance =
      await safe<any>(
        performanceRepo.getPerformanceScorecard(
          employeeId,
        ),
      );

    result.performance =
      performance ??
      null;
  }

  /**
   * Calendar
   */

  if (
    hasPermission(
      user,
      "employees.view",
    )
  ) {
    const now =
      new Date();

    const until =
      new Date(
        now.getTime() +
          14 *
            24 *
            60 *
            60 *
            1000,
      );

    const events =
      await safe<any[]>(
        calendarRepo.getUpcomingEvents(
          employeeId,
          now.toISOString(),
          until.toISOString(),
        ),
      );

    result.calendar =
      events ??
      [];
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
    const documents =
      await safe<any[]>(
        documentsRepo.listDocuments(
          employeeId,
        ),
      );

    result.documents =
      documents ??
      [];
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
    const tickets =
      await safe<any[]>(
        ticketRepo.getMyTickets(
          employeeId,
        ),
      );

    result.tickets =
      tickets ??
      [];
  }

  /**
   * Announcements
   *
   * Only include announcements for self summaries.
   */

  if (
    hasPermission(
      user,
      "announcements.view",
    )
  ) {
    const announcements =
      await safe<any>(
        announcementRepo.getAnnouncements(
          user.role,
          user.userId,
        ),
      );

    result.announcements =
      Array.isArray(
        announcements,
      )
        ? announcements
        : announcements?.announcements ??
          [];
  }

  return {
    selfSummary:
      result,
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
    user.role !==
    "MANAGER"
  ) {
    return {
      message:
        "Team attendance information is available only within an authorized manager scope.",
    };
  }

  if (
    !user.employeeId
  ) {
    return {
      message:
        "Your manager employee profile could not be resolved.",
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

  const reports =
    await safe<any[]>(
      employeeRepo.listDirectReports(
        String(
          user.employeeId,
        ),
      ),
    );

  const employees =
    Array.isArray(
      reports,
    )
      ? [
          ...reports,
        ]
      : [];

  const selfEmployee =
    await safe<any>(
      employeeRepo.getEmployeeById(
        String(
          user.employeeId,
        ),
      ),
    );

  if (
    selfEmployee
  ) {
    employees.unshift(
      selfEmployee,
    );
  }

  const uniqueEmployees =
    Array.from(
      new Map(
        employees.map(
          (employee: any) => [
            String(
              employee?.id ??
                employee?._id ??
                employee?.employeeId ??
                "",
            ),
            employee,
          ],
        ),
      ).values(),
    );

  const range =
    resolveDateRange(
      plan,
    );

  const attendance =
    await Promise.all(
      uniqueEmployees.map(
        async (
          employee: any,
        ) => {
          const employeeId =
            String(
              employee?.id ??
                employee?._id ??
                employee?.employeeId ??
                "",
            );

          const result =
            employeeId
              ? await safe<any>(
                  attendanceRepo.getAiAttendanceInsights(
                    employeeId,
                    range.start,
                    range.end,
                  ),
                )
              : null;

          return {
            employee:
              sanitizeEmployee(
                employee,
              ),

            attendance:
              result ??
              null,
          };
        },
      ),
    );

  return {
    scope:
      "TEAM",

    period:
      range,

    teamSize:
      uniqueEmployees.length,

    employees:
      attendance,
  };
}

/**
 * ============================================================================
 * TEAM ORGANIZATION
 * ============================================================================
 */

async function executeMyTeam(
  user: HrCopilotUserContext,
) {
  if (
    !user.employeeId
  ) {
    return {
      message:
        "Your employee profile could not be resolved.",
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
        "You do not have permission to view team information.",
    };
  }

  const reports =
    await safe<any[]>(
      employeeRepo.listDirectReports(
        String(
          user.employeeId,
        ),
      ),
    );

  const employees =
    Array.isArray(
      reports,
    )
      ? reports.map(
          sanitizeEmployee,
        )
      : [];

  return {
    scope:
      "TEAM",

    managerEmployeeId:
      String(
        user.employeeId,
      ),

    employees,

    total:
      employees.length,
  };
}

/**
 * ============================================================================
 * EMPLOYEE DIRECTORY / PROFILE
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
    target.message &&
    !target.employeeId
  ) {
    return target;
  }

  if (
    !target.employee
  ) {
    return {
      message:
        "No authorized employee profile was found.",
    };
  }

  return {
    employee:
      target.employee,

    requestedField:
      plan.requestedFields?.[0] ??
      "profile",
  };
}

/**
 * ============================================================================
 * MAIN EXECUTOR
 * ============================================================================
 */

export async function executeHrCopilotPlan(
  user: HrCopilotUserContext,
  plan: HrCopilotPlan,
): Promise<ExecutorResult> {
  const data:
    Record<string, any> = {};

  const sources:
    HrCopilotSource[] = [];

  const domains =
    Array.isArray(
      plan.domains,
    )
      ? plan.domains.map(
          (item) =>
            String(
              item,
            ).toUpperCase(),
        ).filter((domain) => domain !== "PAYROLL")
      : [];

  if (plan.conditions?.includes("PAYROLL_OUT_OF_SCOPE")) {
    return {
      data: {
        message: "Payroll information is outside the AI HR Copilot scope.",
      },
      sources: [],
    };
  }

  const requestedScope = plan.scope;
  const scope = getAuthorizedRequestScope(
    user,
    requestedScope,
  );

  if (scope === "TEAM" && user.role !== "MANAGER") {
    return {
      data: {
        message:
          "You are not authorized to access team-level HR information.",
      },
      sources: [],
    };
  }

  if (plan.conditions?.includes("TICKET_COUNT")) {
    data.tickets = await executeTicketCount(user);
    sources.push({
      module: "tickets",
      description: "Ticket count within the authenticated user's authorized scope.",
    });
    return { data, sources };
  }

  if (plan.conditions?.includes("ORGANIZATION_EMPLOYEE_COUNT")) {
    data.organizationEmployeeCount =
      await executeOrganizationEmployeeCount(user);
    sources.push({
      module: "organization",
      description: "Authorized organization employee counts.",
    });
    return { data, sources };
  }

  /**
   * ===========================================================================
   * SUMMARY
   * ===========================================================================
   *
   * IMPORTANT:
   *
   * Do NOT check:
   *
   * plan.task !== "SUMMARY"
   *
   * here.
   *
   * A summary may contain multiple module domains.
   */

  if (
    plan.task ===
      "SUMMARY" &&
    (
      scope ===
        "SELF" ||
      scope ===
        "EMPLOYEE"
    )
  ) {
    const summary = await executeSummary(user, plan);
    Object.assign(data, summary);

    sources.push({
      module: "employee",
      description: "Authorized employee profile information.",
    });

    if (domains.includes("ATTENDANCE") || data.selfSummary?.attendance) {
      sources.push({
        module: "attendance",
        description: "Authorized attendance information.",
      });
    }

    if (
      domains.includes(
        "LEAVE",
      ) ||
      data.selfSummary?.leave
    ) {
      sources.push({
        module:
          "leave",
        description:
          "Authorized leave information.",
      });
    }

    if (
      domains.includes(
        "PERFORMANCE",
      ) ||
      domains.includes(
        "GOALS",
      ) ||
      data.selfSummary?.performance
    ) {
      sources.push({
        module:
          "performance",
        description:
          "Authorized performance and goal information.",
      });
    }

    if (
      data.selfSummary?.calendar
    ) {
      sources.push({
        module:
          "calendar",
        description:
          "Authorized calendar information.",
      });
    }

    if (
      data.selfSummary?.documents
    ) {
      sources.push({
        module:
          "documents",
        description:
          "Authorized employee document information.",
      });
    }

    if (
      data.selfSummary?.tickets
    ) {
      sources.push({
        module:
          "tickets",
        description:
          "Authorized employee support-ticket information.",
      });
    }

    if (
      data.selfSummary?.announcements
    ) {
      sources.push({
        module:
          "announcements",
        description:
          "Announcements visible to the authenticated user.",
      });
    }

    return {
      data,
      sources,
    };
  }

  /**
   * ===========================================================================
   * SELF ATTENDANCE
   * ===========================================================================
   */

  if (
    scope === "SELF" &&
    domains.includes("ATTENDANCE")
  ) {
    data.attendance = await executeAttendance(user, {
      ...plan,
      scope: "SELF",
    });

    sources.push({
      module: "attendance",
      description: "Authenticated user's authorized attendance information.",
    });
  }

  /**
   * ==========================================================================
   * SELF LEAVE
   * ==========================================================================
   */

  if (
    scope ===
      "SELF" &&
    domains.includes(
      "LEAVE",
    )
  ) {
    data.leave =
      await executeLeave(
        user,
        {
          ...plan,
          scope:
            "SELF",
        },
      );

    sources.push({
      module:
        "leave",
      description:
        "Authenticated user's authorized leave information.",
    });
  }

  /**
   * ==========================================================================
   * SELF PERFORMANCE / GOALS
   * ==========================================================================
   */

  if (
    scope ===
      "SELF" &&
    (
      domains.includes(
        "PERFORMANCE",
      ) ||
      domains.includes(
        "GOALS",
      )
    )
  ) {
    data.performance =
      await executePerformance(
        user,
        {
          ...plan,
          scope:
            "SELF",
        },
      );

    sources.push({
      module:
        "performance",
      description:
        "Authenticated user's authorized performance and goal information.",
    });
  }

  /**
   * ==========================================================================
   * SELF CALENDAR
   * ==========================================================================
   */

  if (
    scope ===
      "SELF" &&
    domains.includes(
      "CALENDAR",
    )
  ) {
    data.calendar =
      await executeCalendar(
        user,
        {
          ...plan,
          scope:
            "SELF",
        },
      );

    sources.push({
      module:
        "calendar",
      description:
        "Authenticated user's authorized calendar information.",
    });
  }

  /**
   * ==========================================================================
   * SELF PAYROLL
   * ==========================================================================
   */

  if (
    scope ===
      "SELF" &&
    domains.includes(
      "PAYROLL",
    )
  ) {
    data.payroll =
      await executePayroll(
        user,
        {
          ...plan,
          scope:
            "SELF",
        },
      );

    sources.push({
      module:
        "payroll",
      description:
        "Authenticated user's authorized payroll information.",
    });
  }

  /**
   * ==========================================================================
   * SELF DOCUMENTS
   * ==========================================================================
   */

  if (
    scope ===
      "SELF" &&
    domains.includes(
      "DOCUMENTS",
    )
  ) {
    data.documents =
      await executeDocuments(
        user,
        {
          ...plan,
          scope:
            "SELF",
        },
      );

    sources.push({
      module:
        "documents",
      description:
        "Authenticated user's authorized document information.",
    });
  }

  /**
   * ==========================================================================
   * SELF TICKETS
   * ==========================================================================
   */

  if (
    scope ===
      "SELF" &&
    domains.includes(
      "TICKETS",
    )
  ) {
    data.tickets =
      await executeTickets(
        user,
        {
          ...plan,
          scope:
            "SELF",
        },
      );

    sources.push({
      module:
        "tickets",
      description:
        "Authenticated user's authorized ticket information.",
    });
  }

  /**
   * ==========================================================================
   * MANAGER TEAM
   * ==========================================================================
   */

  if (
    scope ===
      "TEAM" &&
    domains.includes(
      "ORGANIZATION",
    )
  ) {
    data.organization =
      await executeMyTeam(
        user,
      );

    sources.push({
      module:
        "organization",
      description:
        "Direct reports within the authenticated manager's authorized team scope.",
    });
  }

  /**
   * ==========================================================================
   * MANAGER TEAM ATTENDANCE
   * ==========================================================================
   */

  if (
    scope ===
      "TEAM" &&
    domains.includes(
      "ATTENDANCE",
    )
  ) {
    data.attendance =
      await executeTeamAttendance(
        user,
        plan,
      );

    sources.push({
      module:
        "attendance",
      description:
        "Attendance information limited to the manager's direct reports.",
    });
  }

  /**
   * ==========================================================================
   * NAMED EMPLOYEE
   * ==========================================================================
   *
   * This handles:
   *
   * "What is Meghana's designation?"
   * "What is Abid's attendance?"
   * "Show me X's performance."
   *
   * Authorization is still performed by resolveEmployeeTarget().
   */

  if (
    scope ===
      "EMPLOYEE"
  ) {
    if (
      domains.includes(
        "EMPLOYEE",
      )
    ) {
      data.employee =
        await executeEmployeeLookup(
          user,
          plan,
        );

      sources.push({
        module:
          "employee",
        description:
          "Authorized employee profile information.",
      });
    }

    if (
      domains.includes(
        "ATTENDANCE",
      )
    ) {
      data.attendance =
        await executeAttendance(
          user,
          plan,
        );

      sources.push({
        module:
          "attendance",
        description:
          "Authorized attendance information for the requested employee.",
      });
    }

    if (
      domains.includes(
        "LEAVE",
      )
    ) {
      data.leave =
        await executeLeave(
          user,
          plan,
        );

      sources.push({
        module:
          "leave",
        description:
          "Authorized leave information for the requested employee.",
      });
    }

    if (
      domains.includes(
        "PERFORMANCE",
      ) ||
      domains.includes(
        "GOALS",
      )
    ) {
      data.performance =
        await executePerformance(
          user,
          plan,
        );

      sources.push({
        module:
          "performance",
        description:
          "Authorized performance and goal information for the requested employee.",
      });
    }

    if (
      domains.includes(
        "CALENDAR",
      )
    ) {
      data.calendar =
        await executeCalendar(
          user,
          plan,
        );

      sources.push({
        module:
          "calendar",
        description:
          "Authorized calendar information for the requested employee.",
      });
    }

    if (
      domains.includes(
        "DOCUMENTS",
      )
    ) {
      data.documents =
        await executeDocuments(
          user,
          plan,
        );

      sources.push({
        module:
          "documents",
        description:
          "Authorized document information for the requested employee.",
      });
    }

    if (
      domains.includes(
        "TICKETS",
      )
    ) {
      data.tickets =
        await executeTickets(
          user,
          plan,
        );

      sources.push({
        module:
          "tickets",
        description:
          "Authorized ticket information for the requested employee.",
      });
    }

    if (
      domains.includes(
        "ORGANIZATION",
      )
    ) {
      data.organization =
        await executeOrganization(
          user,
          plan,
        );

      sources.push({
        module:
          "organization",
        description:
          "Authorized organization relationship information.",
      });
    }
  }

  /**
   * ==========================================================================
   * ORGANIZATION
   * ==========================================================================
   */

  if (
    (
      scope ===
        "ORGANIZATION" ||
      scope ===
        "DEPARTMENT"
    ) &&
    domains.includes(
      "ATTENDANCE",
    )
  ) {
    data.organizationAttendance =
      await executeOrganizationAttendance(
        user,
        plan,
      );

    sources.push({
      module:
        "attendance",
      description:
        "Organization-wide attendance calculation for the authorized employee population.",
    });
  }

  if (
    domains.includes(
      "ORGANIZATION",
    ) &&
    (
      scope ===
        "ORGANIZATION" ||
      scope ===
        "DEPARTMENT"
    )
  ) {
    /**
     * Organization-wide employee data is only allowed
     * for SUPER_ADMIN and HR_ADMIN.
     */

    if (
      user.role ===
        "SUPER_ADMIN" ||
      user.role ===
        "HR_ADMIN"
    ) {
      const repository =
        organizationRepo as any;

      if (
        typeof repository.searchOrganization ===
        "function"
      ) {
        const result =
          await safe<any>(
            repository.searchOrganization(
              {},
            ),
          );

        data.organizationOverview =
          result ??
          null;
      }

      sources.push({
        module:
          "organization",
        description:
          "Organization information within the authorized administrative scope.",
      });
    }
  }

  /**
   * ==========================================================================
   * ANNOUNCEMENTS
   * ==========================================================================
   */

  if (
    domains.includes(
      "ANNOUNCEMENTS",
    )
  ) {
    data.announcements =
      await executeAnnouncements(
        user,
      );

    sources.push({
      module:
        "announcements",
      description:
        "Announcements visible to the authenticated user.",
    });
  }

  /**
   * ==========================================================================
   * RECRUITMENT
   * ==========================================================================
   */

  if (
    domains.includes(
      "RECRUITMENT",
    )
  ) {
    data.recruitment =
      await executeRecruitment(
        user,
      );

    sources.push({
      module:
        "recruitment",
      description:
        "Authorized recruitment information.",
    });
  }

  /**
   * ==========================================================================
   * REPORTS
   * ==========================================================================
   */

  if (
    domains.includes(
      "REPORTS",
    )
  ) {
    data.reports =
      await executeReports(
        user,
      );

    sources.push({
      module:
        "reports",
      description:
        "Authorized HR report information.",
    });
  }

  /**
   * ==========================================================================
   * DASHBOARD
   * ==========================================================================
   */

  if (
    domains.includes(
      "DASHBOARD",
    )
  ) {
    data.dashboard =
      await executeDashboard(
        user,
      );

    sources.push({
      module:
        "dashboard",
      description:
        "Authorized HRMS dashboard information.",
    });
  }

  /**
   * ==========================================================================
   * FALLBACK FOR EMPTY DATA
   * ==========================================================================
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