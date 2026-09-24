/**
 * ============================================================================
 * AI HR COPILOT - SHARED TYPES
 * ============================================================================
 *
 * These types are shared by:
 * - hr-copilot.service.ts
 * - hr-copilot.planner.ts
 * - hr-copilot.tool-executor.ts
 * - hr-copilot.context.ts
 * - hr-copilot.tools.ts
 * - hr-copilot.schema.ts
 *
 * IMPORTANT:
 * - These are TypeScript types only.
 * - Authorization is NOT enforced by these types.
 * - Authorization must always be enforced by the tool executor.
 * - Groq can interpret a request, but it must never decide what data
 *   the authenticated user is allowed to access.
 */

/* ============================================================================
 * INTENT
 * ========================================================================== */

export type HrCopilotIntent =
  | "SELF_SUMMARY"
  | "EMPLOYEE_LOOKUP"
  | "ATTENDANCE"
  | "LEAVE"
  | "PERFORMANCE"
  | "CALENDAR"
  | "PAYROLL"
  | "RECRUITMENT"
  | "ORGANIZATION"
  | "DOCUMENTS"
  | "REPORTS"
  | "DASHBOARD"
  | "CROSS_MODULE"
  | "GENERAL";

/* ============================================================================
 * DATA SOURCES
 * ========================================================================== */

export type HrCopilotDataSource =
  | "employee"
  | "attendance"
  | "leave"
  | "performance"
  | "calendar"
  | "payroll"
  | "recruitment"
  | "organization"
  | "documents"
  | "reports"
  | "dashboard"
  | "tickets"
  | "announcements";

/* ============================================================================
 * ROLE DATA SCOPE
 * ========================================================================== */

export type HrCopilotRoleScope =
  | "ALL"
  | "TEAM"
  | "SELF";

/* ============================================================================
 * PLANNER TASK
 * ========================================================================== */

export type HrCopilotTask =
  | "LOOKUP"
  | "SUMMARY"
  | "IDENTIFY_ISSUES"
  | "COMPARE"
  | "ANALYZE"
  | "COUNT"
  | "LIST"
  | "STATUS"
  | "TREND"
  | "GENERAL";

/* ============================================================================
 * PLANNER SCOPE
 * ========================================================================== */

export type HrCopilotScope =
  | "SELF"
  | "EMPLOYEE"
  | "MY_TEAM"
  | "DEPARTMENT"
  | "ORGANIZATION"
  | "AUTHORIZED_EMPLOYEES"
  | "UNKNOWN";

/* ============================================================================
 * HR DOMAINS
 * ========================================================================== */

export type HrCopilotDomain =
  | "EMPLOYEE"
  | "ATTENDANCE"
  | "LEAVE"
  | "PERFORMANCE"
  | "GOALS"
  | "CALENDAR"
  | "PAYROLL"
  | "DOCUMENTS"
  | "TICKETS"
  | "ANNOUNCEMENTS"
  | "RECRUITMENT"
  | "ORGANIZATION"
  | "REPORTS"
  | "DASHBOARD";

/* ============================================================================
 * TIME RANGE
 * ========================================================================== */

export type HrCopilotTimeRange =
  | "TODAY"
  | "YESTERDAY"
  | "THIS_WEEK"
  | "LAST_WEEK"
  | "THIS_MONTH"
  | "THIS_YEAR"
  | "LAST_MONTH"
  | "LAST_30_DAYS"
  | "LAST_90_DAYS"
  | "UPCOMING"
  | "CURRENT"
  | "UNKNOWN";

/* ============================================================================
 * AUTHENTICATED USER CONTEXT
 * ========================================================================== */

export interface HrCopilotUserContext {
  /**
   * Authenticated User._id
   */
  userId: string;

  /**
   * Employee._id associated with the authenticated user.
   *
   * null is allowed because some users may not have an employee record.
   */
  employeeId: string | null;

  /**
   * Authenticated application role.
   */
  role: string;

  /**
   * Permissions assigned to the authenticated user.
   */
  permissions: string[];
}

/* ============================================================================
 * PAGE CONTEXT
 * ========================================================================== */

export interface HrCopilotPageContext {
  /**
   * Current frontend pathname.
   */
  pathname?: string;

  /**
   * Human-readable page title.
   */
  pageTitle?: string;

  /**
   * Optional entity currently being viewed.
   */
  entityId?: string;

  /**
   * Current UI module.
   *
   * IMPORTANT:
   * This is contextual information only.
   * It must NEVER be treated as authorization.
   */
  module?: string;
}

/* ============================================================================
 * COPILOT REQUEST
 * ========================================================================== */

export interface HrCopilotRequest {
  /**
   * Current user message.
   */
  message: string;

  /**
   * Optional conversation history.
   */
  conversation?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;

  /**
   * Current frontend page context.
   */
  pageContext?: HrCopilotPageContext;
}

/* ============================================================================
 * SOURCE
 * ========================================================================== */

export interface HrCopilotSource {
  /**
   * Backend HRMS module from which information was retrieved.
   */
  module: HrCopilotDataSource;

  /**
   * Human-readable description of the source.
   */
  description: string;
}

/* ============================================================================
 * AUTHORIZED COPILOT CONTEXT
 * ========================================================================== */

export interface HrCopilotContext {
  /**
   * Authenticated user.
   */
  user: HrCopilotUserContext;

  /**
   * Current frontend page.
   */
  page: HrCopilotPageContext;

  /**
   * Authorized HRMS data collected by the executor.
   */
  data: Record<string, unknown>;

  /**
   * Modules used to construct the answer.
   */
  sources: HrCopilotSource[];
}

/* ============================================================================
 * PLANNER OUTPUT
 * ========================================================================== */

export interface HrCopilotPlan {
  /**
   * What the user is trying to accomplish.
   */
  task: HrCopilotTask;

  /**
   * Requested data scope.
   *
   * IMPORTANT:
   * This is NOT authorization.
   * The executor must enforce the authenticated user's permissions.
   */
  scope: HrCopilotScope;

  /**
   * HRMS domains required to answer the request.
   */
  domains: HrCopilotDomain[];

  /**
   * Named employee requested by the user.
   *
   * null when the request refers to the authenticated user,
   * a team, or the organization.
   */
  targetEmployeeName: string | null;

  /**
   * Requested time range.
   */
  timeRange: HrCopilotTimeRange;

  /**
   * Additional conditions detected from the request.
   */
  conditions: string[];

  /**
   * Specific information requested by the user.
   */
  requestedFields: string[];

  /**
   * Internal planner explanation.
   */
  reasoning?: string;
}

/* ============================================================================
 * TOOL EXECUTION RESULT
 * ========================================================================== */

export interface HrCopilotToolResult {
  /**
   * Authorized data retrieved from HRMS repositories.
   */
  data: Record<string, unknown>;

  /**
   * Backend sources used to retrieve the data.
   */
  sources: HrCopilotSource[];
}

/* ============================================================================
 * FINAL COPILOT RESPONSE
 * ========================================================================== */

export interface HrCopilotResponse {
  /**
   * Final human-readable answer.
   */
  answer: string;

  /**
   * Detected Copilot intent.
   */
  intent: HrCopilotIntent;

  /**
   * Modules used to produce the answer.
   */
  sources: HrCopilotSource[];
}