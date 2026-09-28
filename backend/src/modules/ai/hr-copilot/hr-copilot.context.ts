import type { Request } from "express";

import type {
  HrCopilotPageContext,
  HrCopilotUserContext,
} from "./hr-copilot.types";

import { GovernanceRole } from "@/modules/governance/governance.model";

/**
 * ============================================================================
 * HR COPILOT CONTEXT
 * ============================================================================
 *
 * This file builds:
 *
 * 1. Current page context
 * 2. Authenticated user context
 * 3. High-level Copilot data scope
 *
 * IMPORTANT:
 *
 * Page context is NEVER an authorization mechanism.
 *
 * Authorization is determined from the authenticated user's role and
 * enforced again by the secure tool executor.
 */

/**
 * ============================================================================
 * PAGE CONTEXT
 * ============================================================================
 *
 * The current page gives the Copilot additional conversational context.
 *
 * Example:
 *
 * User is currently on:
 *   /app/attendance
 *
 * Then the Copilot knows that Attendance is the current page.
 *
 * However, this does NOT mean the Copilot can only answer Attendance
 * questions.
 *
 * Example:
 *
 * User on Attendance page:
 *   "Show me my leave balance"
 *
 * The planner may still select LEAVE.
 */
export function buildPageContext(
  input?: HrCopilotPageContext,
): HrCopilotPageContext {
  return {
    pathname: input?.pathname,
    pageTitle: input?.pageTitle,
    entityId: input?.entityId,
    module: input?.module,
  };
}

/**
 * ============================================================================
 * USER CONTEXT
 * ============================================================================
 *
 * Builds the authenticated user's context for the Copilot.
 *
 * Scope rules:
 *
 * SUPER_ADMIN → ALL
 * HR_ADMIN    → ALL
 * MANAGER     → TEAM
 * Others      → SELF
 *
 * The permissions array is also retained because the existing HRMS permission
 * system may be useful for module-level checks.
 */
export async function buildUserContext(
  req: Request,
): Promise<HrCopilotUserContext> {
  if (!req.user) {
    throw new Error(
      "Authenticated user context is missing.",
    );
  }

  const userId = String(
    req.user.userId ?? "",
  ).trim();

  if (!userId) {
    throw new Error(
      "Authenticated user ID is missing.",
    );
  }

  const employeeId = req.user.employeeId
    ? String(req.user.employeeId).trim()
    : null;

  const role = String(
    req.user.role ?? "",
  )
    .trim()
    .toUpperCase();

  if (!role) {
    throw new Error(
      "Authenticated user role is missing.",
    );
  }

  let permissions: string[] = [];

  /**
   * SUPER_ADMIN has unrestricted access.
   *
   * Avoid an unnecessary GovernanceRole lookup.
   */
  if (role !== "SUPER_ADMIN") {
    const roleDoc = await GovernanceRole.findOne({
      role,
    })
      .select("permissions")
      .lean();

    permissions = Array.isArray(
      roleDoc?.permissions,
    )
      ? roleDoc.permissions.map(String)
      : [];
  }

  return {
    userId,
    employeeId,
    role,
    permissions,
  };
}

/**
 * ============================================================================
 * ROLE → COPILOT DATA SCOPE
 * ============================================================================
 *
 * This is the high-level data boundary used by the Copilot.
 *
 * ALL:
 *   SUPER_ADMIN
 *   HR_ADMIN
 *
 * TEAM:
 *   MANAGER
 *
 * SELF:
 *   EMPLOYEE
 *   FINANCE
 *   IT_SUPPORT
 *   RECRUITER
 *   any other role not explicitly granted a wider scope
 *
 * IMPORTANT:
 *
 * This function does NOT itself retrieve employees or data.
 *
 * The executor must enforce the returned scope when executing tools.
 */
export function getHrCopilotRoleScope(
  user: HrCopilotUserContext,
): "ALL" | "TEAM" | "SELF" {
  const role = String(
    user.role ?? "",
  )
    .trim()
    .toUpperCase();

  switch (role) {
    case "SUPER_ADMIN":
    case "HR_ADMIN":
      return "ALL";

    case "MANAGER":
      return "TEAM";

    default:
      return "SELF";
  }
}

/**
 * ============================================================================
 * ORGANIZATION ACCESS
 * ============================================================================
 *
 * True only for users with organization-wide Copilot data scope.
 */
export function hasHrCopilotOrganizationAccess(
  user: HrCopilotUserContext,
): boolean {
  return (
    getHrCopilotRoleScope(user) === "ALL"
  );
}

/**
 * ============================================================================
 * TEAM ACCESS
 * ============================================================================
 *
 * True only for managers.
 *
 * TEAM means:
 *   - the manager themselves
 *   - their direct reports
 *
 * It does NOT automatically mean:
 *   - indirect reports
 *   - another department
 *   - another manager's team
 *   - the entire organization
 *
 * The executor is responsible for resolving the actual employee IDs.
 */
export function hasHrCopilotTeamAccess(
  user: HrCopilotUserContext,
): boolean {
  return (
    getHrCopilotRoleScope(user) === "TEAM"
  );
}

/**
 * ============================================================================
 * SELF-ONLY ACCESS
 * ============================================================================
 *
 * Users in this scope can access only their own employee data.
 */
export function hasHrCopilotSelfOnlyAccess(
  user: HrCopilotUserContext,
): boolean {
  return (
    getHrCopilotRoleScope(user) === "SELF"
  );
}

/**
 * ============================================================================
 * EMPLOYEE ID REQUIREMENT
 * ============================================================================
 *
 * SELF and TEAM scoped users need an employeeId for employee-level HR data.
 *
 * SUPER_ADMIN / HR_ADMIN may operate organization-wide without a personal
 * employeeId.
 */
export function requiresHrCopilotEmployeeId(
  user: HrCopilotUserContext,
): boolean {
  return (
    getHrCopilotRoleScope(user) !== "ALL"
  );
}

/**
 * ============================================================================
 * SELF ACCESS CHECK
 * ============================================================================
 *
 * Returns true when the requested employee is the authenticated employee.
 *
 * For ALL scope users this also returns true because organization-wide users
 * are not restricted to themselves.
 */
export function canAccessHrCopilotEmployee(
  user: HrCopilotUserContext,
  employeeId: string,
): boolean {
  const scope = getHrCopilotRoleScope(user);

  if (scope === "ALL") {
    return true;
  }

  if (!user.employeeId) {
    return false;
  }

  return (
    String(user.employeeId) ===
    String(employeeId)
  );
}
