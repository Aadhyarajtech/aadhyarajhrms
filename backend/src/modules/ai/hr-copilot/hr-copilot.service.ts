import { z } from "zod";

import * as attendanceRepo from "@/modules/attendance/attendance.repository";
import * as leaveRepo from "@/modules/leave/leave.repository";
import * as performanceRepo from "@/modules/performance/performance.repository";
import * as employeeRepo from "@/modules/employees/employees.repository";
import * as calendarRepo from "@/modules/calendar/calendar.repository";
import * as payrollRepo from "@/modules/payroll/payroll.repository";
import * as documentsRepo from "@/modules/documents/documents.repository";
import * as ticketRepo from "@/modules/tickets/ticket.repository";
import * as reportsRepo from "@/modules/reports/reports.repository";
import * as dashboardRepo from "@/modules/dashboard/dashboard.repository";
import * as recruitmentRepo from "@/modules/recruitment/recruitment.repository";
import * as organizationRepo from "@/modules/organization/organization.repository";
import * as announcementRepo from "@/modules/announcements/announcement.repository";
import { generateOrganizationAI } from "@/services/ai.service";
import {
  buildHrCopilotPlan,
  buildFallbackHrCopilotPlan,
} from "./hr-copilot.planner";

import {
  executeHrCopilotPlan,
} from "./hr-copilot.tool-executor";

import {
  HrCopilotContext,
  HrCopilotIntent,
  HrCopilotPageContext,
  HrCopilotUserContext,
  HrCopilotSource,
} from "./hr-copilot.types";
import { detectHrCopilotIntent } from "./hr-copilot.tools";
import { buildPageContext, buildUserContext } from "./hr-copilot.context";
import { buildHrCopilotSystemPrompt } from "./hr-copilot.prompts";

export interface HrCopilotRequest {
  message: string;
  conversation?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  pageContext?: HrCopilotPageContext;
}

function hasPermission(user: HrCopilotUserContext, permission: string): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.permissions.includes(permission)) return true;
  if (permission.endsWith(".view")) {
    return user.permissions.includes(`${permission.slice(0, -5)}.manage`);
  }
  return false;
}

async function safe<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.warn("[HR Copilot] Data source unavailable:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

function sanitizeEmployee(employee: any) {
  if (!employee) return null;

  return {
    id: employee._id ?? employee.id,
    name:
      employee.fullName ??
      employee.name ??
      [employee.firstName, employee.lastName].filter(Boolean).join(" "),
    employeeCode: employee.employeeCode ?? null,
    department: employee.department?.name ?? employee.departmentName ?? null,
    designation: employee.designation?.title ?? employee.designationTitle ?? null,
    designationLevel: employee.designationLevel ?? null,
    status: employee.status ?? null,
    employmentType: employee.employmentType ?? null,
    workLocation: employee.workLocation ?? null,
    dateOfJoining: employee.dateOfJoining ?? null,
    manager:
      (employee.manager?.name ??
      employee.managerName ??
      [employee.managerFirstName, employee.managerLastName]
        .filter(Boolean)
        .join(" ")) ?? null,
    skills: Array.isArray(employee.skills)
      ? employee.skills.slice(0, 30).map((skill: any) => ({
          name: skill.name,
          category: skill.category ?? null,
          competencyLevel: skill.competencyLevel ?? null,
        }))
      : [],
  };
}

function sanitizeAttendance(value: any) {
  if (!value) return null;
  return {
    period: value.period ?? null,
    summary: value.summary ?? null,
    timing: value.timing ?? null,
    trend: value.trend ?? null,
    patterns: Array.isArray(value.patterns) ? value.patterns.slice(0, 10) : [],
    recommendations: Array.isArray(value.recommendations)
      ? value.recommendations.slice(0, 8)
      : [],
  };
}

function sanitizeLeave(value: any) {
  if (!Array.isArray(value)) return value ?? null;
  return value.slice(0, 20).map((item: any) => ({
    name: item.name ?? null,
    allotted: item.allotted ?? null,
    used: item.used ?? null,
    carriedOver: item.carriedOver ?? null,
    pendingDays: item.pendingDays ?? null,
    available:
      typeof item.allotted === "number" && typeof item.used === "number"
        ? item.allotted + Number(item.carriedOver ?? 0) - item.used
        : null,
  }));
}

function sanitizePerformance(value: any) {
  if (!value) return null;
  return {
    overallRating: value.overallRating ?? null,
    performanceHistory: Array.isArray(value.performanceHistory)
      ? value.performanceHistory.slice(-8)
      : [],
    managerRating: value.managerRating ?? null,
    goalAchievement: value.goalAchievement ?? null,
    feedbackRating: value.feedbackRating ?? null,
    strengths: Array.isArray(value.strengths) ? value.strengths.slice(0, 10) : [],
    developmentAreas: Array.isArray(value.developmentAreas)
      ? value.developmentAreas.slice(0, 10)
      : [],
    review: value.review ?? null,
    goalCount: value.goalCount ?? 0,
  };
}

function sanitizeCalendar(events: any[]) {
  if (!Array.isArray(events)) return [];
  return events.slice(0, 20).map((event: any) => ({
    id: event.id ?? event._id,
    title: event.title ?? null,
    type: event.type ?? null,
    status: event.status ?? null,
    startAt: event.startAt ?? null,
    endAt: event.endAt ?? null,
    location: event.location ?? null,
  }));
}

function sanitizePayroll(value: any[]) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).map((item: any) => ({
    month: item.month ?? null,
    year: item.year ?? null,
    runStatus: item.runStatus ?? null,
    grossEarnings: item.grossEarnings ?? null,
    totalDeductions: item.totalDeductions ?? null,
    netPay: item.netPay ?? null,
    overtimeHours: item.overtimeHours ?? null,
    overtimeAmount: item.overtimeAmount ?? null,
    lop: item.lop ?? null,
  }));
}

function sanitizeDocuments(value: any[]) {
  if (!Array.isArray(value)) return [];
  const today = new Date();
  return value.slice(0, 30).map((item: any) => {
    const expiryDate = item.expiryDate ?? null;
    let complianceStatus = item.status ?? "PENDING";
    if (expiryDate) {
      const expiry = new Date(expiryDate);
      if (!Number.isNaN(expiry.getTime())) {
        if (expiry.getTime() < today.getTime()) complianceStatus = "EXPIRED";
        else if (expiry.getTime() <= today.getTime() + 30 * 86_400_000)
          complianceStatus = "EXPIRING_SOON";
        else complianceStatus = item.status ?? "VERIFIED";
      }
    }
    return {
      type: item.type ?? null,
      fileName: item.fileName ?? null,
      uploadedAt: item.uploadedAt ?? null,
      expiryDate,
      status: item.status ?? null,
      complianceStatus,
      rejectionReason: item.rejectionReason ?? null,
    };
  });
}

function sanitizeTickets(value: any[]) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item: any) => ({
    ticketId: item.ticketId ?? item._id,
    category: item.category ?? null,
    subject: item.subject ?? null,
    priority: item.priority ?? null,
    status: item.status ?? null,
    slaStatus: item.slaStatus ?? null,
    slaRiskLevel: item.slaRiskLevel ?? null,
    createdAt: item.createdAt ?? null,
    updatedAt: item.updatedAt ?? null,
  }));
}

function sanitizeDashboard(value: any) {
  if (!value) return null;
  return {
    headcount: value.headcount ?? null,
    newHires30d: value.newHires30d ?? null,
    exits90d: value.exits90d ?? null,
    pendingLeave: value.pendingLeave ?? null,
    openRoles: value.openRoles ?? null,
    presentToday: value.presentToday ?? null,
    onLeaveToday: value.onLeaveToday ?? null,
    attritionRate: value.attritionRate ?? null,
    attendanceRate: value.attendanceRate ?? null,
    attendanceDate: value.attendanceDate ?? null,
    attendanceIsToday: value.attendanceIsToday ?? null,
  };
}

function sanitizeReports(report: any) {
  if (!report) return null;
  return {
    filters: report.filters ?? null,
    scope: report.scope ?? null,
    workforce: report.workforce
      ? {
          total: report.workforce.total,
          active: report.workforce.active,
          recentHires: report.workforce.recentHires,
          exits: report.workforce.exits,
          headcountTrend: Array.isArray(report.workforce.headcountTrend)
            ? report.workforce.headcountTrend.slice(-12)
            : [],
          byStatus: report.workforce.byStatus,
          byDepartment: report.workforce.byDepartment,
          byEmploymentType: report.workforce.byEmploymentType,
        }
      : null,
    attendance: report.attendance
      ? {
          total: report.attendance.total,
          byStatus: report.attendance.byStatus,
          workHours: report.attendance.workHours,
          regularized: report.attendance.regularized,
          lateMetrics: report.attendance.lateMetrics,
          compOffMetrics: report.attendance.compOffMetrics,
        }
      : null,
    leave: report.leave
      ? {
          total: report.leave.total,
          byStatus: report.leave.byStatus,
          byType: report.leave.byType,
        }
      : null,
    payroll: report.payroll
      ? {
          runs: report.payroll.runs,
          totalGross: report.payroll.totalGross,
          totalDeductions: report.payroll.totalDeductions,
          totalNet: report.payroll.totalNet,
          totalLop: report.payroll.totalLop,
          payslipCount: report.payroll.payslipCount,
          byRun: Array.isArray(report.payroll.byRun)
            ? report.payroll.byRun.slice(-12)
            : [],
          byDepartment: Array.isArray(report.payroll.byDepartment)
            ? report.payroll.byDepartment.slice(0, 20)
            : [],
        }
      : null,
    performance: report.performance
      ? {
          totalReviews: report.performance.totalReviews,
          completedReviews: report.performance.completedReviews,
          averageRating: report.performance.averageRating,
          ratingDistribution: report.performance.ratingDistribution,
          goalAchievement: report.performance.goalAchievement,
        }
      : null,
    tickets: report.tickets
      ? {
          total: report.tickets.total,
          byStatus: report.tickets.byStatus,
          byCategory: report.tickets.byCategory,
          byPriority: report.tickets.byPriority,
        }
      : null,
    documents: report.documents
      ? {
          total: report.documents.total,
          byStatus: report.documents.byStatus,
          expiringSoon: report.documents.expiringSoon,
          expired: report.documents.expired,
        }
      : null,
    recruitment: report.recruitment
      ? Array.isArray(report.recruitment)
        ? report.recruitment.slice(0, 20)
        : report.recruitment
      : null,
  };
}

function source(module: HrCopilotSource["module"], description: string): HrCopilotSource {
  return { module, description };
}

async function collectSelfSummary(user: HrCopilotUserContext) {
  if (!user.employeeId) {
    return { employee: null, message: "The authenticated user is not linked to an employee profile." };
  }

  const employee = await employeeRepo.getEmployeeById(user.employeeId);
  if (!employee) {
    return { employee: null, message: "Employee profile was not found." };
  }

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const endDate = now.toISOString().slice(0, 10);
  const calendarEnd = new Date(now.getTime() + 14 * 86_400_000).toISOString();

  const tasks: Promise<unknown>[] = [];
  const labels: string[] = [];

  const attendanceIndex = hasPermission(user, "attendance.view");
  const leaveIndex = hasPermission(user, "leave.view");
  const performanceIndex = hasPermission(user, "performance.view");
  const payrollIndex = hasPermission(user, "payroll.view");
  const documentsIndex = hasPermission(user, "documents.view");
  const ticketsIndex = hasPermission(user, "tickets.view");
  const announcementsIndex = hasPermission(user, "announcements.view");

  if (attendanceIndex) {
    tasks.push(attendanceRepo.getAiAttendanceInsights(user.employeeId, startDate, endDate));
    labels.push("attendance");
  }
  if (leaveIndex) {
    tasks.push(leaveRepo.listBalancesForEmployee(user.employeeId, now.getFullYear()));
    labels.push("leave");
  }
  if (performanceIndex) {
    tasks.push(performanceRepo.getPerformanceScorecard(user.employeeId));
    labels.push("performance");
  }

  // Calendar is available to authenticated users through the existing calendar module.
  tasks.push(calendarRepo.getUpcomingEvents(user.employeeId, now.toISOString(), calendarEnd));
  labels.push("calendar");

  if (payrollIndex) {
    tasks.push(payrollRepo.listPayslipsForEmployee(user.employeeId));
    labels.push("payroll");
  }
  if (documentsIndex) {
    tasks.push(documentsRepo.listDocuments(user.employeeId));
    labels.push("documents");
  }
  if (ticketsIndex) {
    tasks.push(ticketRepo.getMyTickets(user.employeeId));
    labels.push("tickets");
  }
  if (announcementsIndex) {
    tasks.push(announcementRepo.getAnnouncements(user.role, user.userId));
    labels.push("announcements");
  }

  const results = await Promise.allSettled(tasks);
  const values: Record<string, any> = {};
  labels.forEach((label, index) => {
    const result = results[index];
    values[label] = result.status === "fulfilled" ? result.value : null;
  });

  return {
    employee: sanitizeEmployee(employee),
    period: { startDate, endDate },
    attendance: sanitizeAttendance(values.attendance),
    leave: sanitizeLeave(values.leave),
    performance: sanitizePerformance(values.performance),
    calendar: sanitizeCalendar(values.calendar),
    payroll: sanitizePayroll(values.payroll),
    documents: sanitizeDocuments(values.documents),
    tickets: sanitizeTickets(values.tickets),
    announcements: Array.isArray(values.announcements)
      ? values.announcements.slice(0, 10).map((item: any) => ({
          id: item.id ?? item._id,
          title: item.title ?? null,
          status: item.status ?? null,
          priority: item.priority ?? null,
          publishedAt: item.publishedAt ?? item.createdAt ?? null,
          expiresAt: item.expiresAt ?? null,
        }))
      : [],
    dataAvailability: Object.fromEntries(
      labels.map((label, index) => [label, results[index].status === "fulfilled"]),
    ),
  };
}

function detectEmployeeLookupField(message: string): string {
  const text = message.toLowerCase();

  if (/\b(employee\s*code|employee\s*id|employee\s*number|staff\s*id|staff\s*code)\b/.test(text)) {
    return "employeeCode";
  }

  if (/\bdepartment\b/.test(text)) return "department";
  if (/\bdesignation|job title|role\b/.test(text)) return "designation";
  if (/\bmanager|reporting manager\b/.test(text)) return "manager";
  if (/\bwork location|location\b/.test(text)) return "workLocation";
  if (/\bstatus\b/.test(text)) return "status";
  if (/\bemployment type|employment status\b/.test(text)) return "employmentType";

  return "profile";
}

function extractEmployeeSearchText(message: string): string {
  let text = message.trim();

  text = text
    .replace(/\bwhat(?:'s| is)\b/gi, " ")
    .replace(/\bcan you tell me\b/gi, " ")
    .replace(/\bcould you tell me\b/gi, " ")
    .replace(/\bplease tell me\b/gi, " ")
    .replace(/\btell me\b/gi, " ")
    .replace(/\bshow me\b/gi, " ")
    .replace(/\bgive me\b/gi, " ")
    .replace(/\bfind\b/gi, " ")
    .replace(/\bsearch for\b/gi, " ")
    .replace(/\bwho is\b/gi, " ")
    .replace(/\bwho's\b/gi, " ")
    .replace(/\bthe\b/gi, " ")
    .replace(/\bemployee\s*(?:code|id|number)\b/gi, " ")
    .replace(/\bstaff\s*(?:code|id|number)\b/gi, " ")
    .replace(/\bcode\b/gi, " ")
    .replace(/\bid\b/gi, " ")
    .replace(/\bnumber\b/gi, " ")
    .replace(/\bof\b/gi, " ")
    .replace(/\bfor\b/gi, " ")
    .replace(/\bemployee\b/gi, " ")
    .replace(/\bprofile\b/gi, " ")
    .replace(/\bdetails?\b/gi, " ")
    .replace(/\binformation\b/gi, " ")
    .replace(/[?!.:,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

async function collectEmployeeLookup(
  user: HrCopilotUserContext,
  message: string,
  page: HrCopilotPageContext,
) {
  if (!hasPermission(user, "employees.view")) {
    return {
      message: "You do not have permission to view employee information.",
      requestedField: detectEmployeeLookupField(message),
    };
  }

  const requestedField = detectEmployeeLookupField(message);

  if (page.entityId) {
    const employee = await safe(employeeRepo.getEmployeeById(page.entityId));
    return {
      employee: sanitizeEmployee(employee),
      requestedField,
      message: employee ? null : "The requested employee was not found.",
    };
  }

  const searchText = extractEmployeeSearchText(message);

  if (!searchText) {
    return {
      requestedField,
      message: "Please provide the employee's name or open an employee profile.",
    };
  }

  let matches: any[] = [];

  try {
    // Name lookup uses the existing organization repository.
    matches = await organizationRepo.findEmployeesByName(searchText);

    // If the query looks like an employee code, also search the employee
    // repository because employeeCode is supported by listEmployees().
    if (matches.length === 0) {
      const result = await employeeRepo.listEmployees({
        search: searchText,
        page: 1,
        pageSize: 8,
      });
      matches = result?.employees ?? [];
    }
  } catch (error) {
    console.warn(
      "[HR Copilot] Employee lookup failed:",
      error instanceof Error ? error.message : String(error),
    );
  }

  const sanitizedMatches = matches.slice(0, 8).map(sanitizeEmployee);

  return {
    matches: sanitizedMatches,
    requestedField,
    searchText,
    message:
      sanitizedMatches.length === 0
        ? "No employee matched that name or employee code."
        : sanitizedMatches.length > 1
          ? "Multiple employees matched. Please clarify which employee you mean."
          : null,
  };
}

function extractTargetEmployeeName(message: string): string | null {
  const text = message
    .replace(/[?!.:,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Examples:
  // "performance of Meghana"
  // "attendance for Meghana"
  // "leave balance of Meghana"
  // "documents for Meghana"
  const ofForMatch = text.match(
    /\b(?:of|for|by|from)\s+([A-Za-z][A-Za-z0-9_.'-]*(?:\s+[A-Za-z][A-Za-z0-9_.'-]*){0,4})\s*$/i,
  );

  if (ofForMatch?.[1]) {
    const candidate = ofForMatch[1]
      .replace(/\b(my|me|mine|myself)\b/gi, "")
      .trim();

    if (candidate) return candidate;
  }

  // Example:
  // "What is Meghana's performance?"
  const possessiveMatch = text.match(
    /\b([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,4})['’]s\s+(?:performance|attendance|leave|payroll|salary|documents?|calendar|schedule|status|profile|details?)\b/i,
  );

  if (possessiveMatch?.[1]) {
    return possessiveMatch[1].trim();
  }

  // Example:
  // "Tell me about Meghana's performance"
  const namedPerformanceMatch = text.match(
    /\b([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,4})\s+(?:performance|attendance|leave|payroll|salary|documents?|calendar|schedule|status|profile|details?)\b/i,
  );

  if (namedPerformanceMatch?.[1]) {
    const candidate = namedPerformanceMatch[1]
      .replace(/^(?:what is|what's|show me|tell me about|give me|details of)\s+/i, "")
      .trim();

    if (candidate && !/^(my|me|mine|i|our|their|the)$/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function resolveTargetEmployee(
  user: HrCopilotUserContext,
  message: string,
) {
  const targetName = extractTargetEmployeeName(message);

  if (!targetName || /^(my|me|mine|myself)$/i.test(targetName)) {
    if (!user.employeeId) {
      return {
        employeeId: null,
        employee: null,
        message: "The authenticated user is not linked to an employee profile.",
      };
    }

    return {
      employeeId: user.employeeId,
      employee: null,
      isSelf: true,
      message: null,
    };
  }

  if (!hasPermission(user, "employees.view")) {
    return {
      employeeId: null,
      employee: null,
      message: "You do not have permission to view another employee's information.",
    };
  }

  // First resolve by name using the organization repository. If that does
  // not match, fall back to the employee repository, which also searches
  // employeeCode. This supports both human names and IDs/codes such as
  // emp_efadal5529055fb6.
  let matches = await safe(organizationRepo.findEmployeesByName(targetName));

  if (!matches?.length) {
    const employeeSearch = await safe(
      employeeRepo.listEmployees({
        search: targetName,
        page: 1,
        pageSize: 8,
      }),
    );
    matches = employeeSearch?.employees ?? [];
  }

  if (!matches?.length) {
    return {
      employeeId: null,
      employee: null,
      message: `No employee named or identified by ${targetName} was found.`,
    };
  }

  if (matches.length > 1) {
    return {
      employeeId: null,
      employee: null,
      message: `Multiple employees matched ${targetName}. Please provide the employee's full name.`,
    };
  }

  const employee = matches[0];
  const employeeId = String(employee._id ?? employee.employeeCode);
  const currentEmployeeId = user.employeeId ? String(user.employeeId) : null;

  // SUPER_ADMIN and HR_ADMIN may view authorized employee records.
  // Managers may view only their direct reports through the Copilot.
  const allowed =
    employeeId === currentEmployeeId ||
    user.role === "SUPER_ADMIN" ||
    user.role === "HR_ADMIN" ||
    (user.role === "MANAGER" && String(employee.managerId ?? "") === String(user.employeeId ?? ""));

  if (!allowed) {
    return {
      employeeId: null,
      employee: null,
      message: "You do not have permission to view this employee's HR information.",
    };
  }

  return {
    employeeId,
    employee: sanitizeEmployee(employee),
    isSelf: employeeId === currentEmployeeId,
    message: null,
  };
}

async function collectReport(
  user: HrCopilotUserContext,
  filters: { from?: string; to?: string } = {},
) {
  if (!hasPermission(user, "reports.view")) {
    return null;
  }

  const report = await safe(reportsRepo.getReports(filters, user.role, user.employeeId));
  return sanitizeReports(report);
}

async function collectContext(
  user: HrCopilotUserContext,
  intent: HrCopilotIntent,
  pageContext: HrCopilotPageContext,
  message: string,
): Promise<HrCopilotContext> {
  const data: Record<string, unknown> = {};
  const sources: HrCopilotSource[] = [];

  if (intent === "SELF_SUMMARY") {
    data.selfSummary = await collectSelfSummary(user);
    sources.push(source("employee", "Authenticated user's employee profile and skills."));
    if (hasPermission(user, "attendance.view")) sources.push(source("attendance", "Authenticated user's current-month attendance."));
    if (hasPermission(user, "leave.view")) sources.push(source("leave", "Authenticated user's current-year leave balances."));
    if (hasPermission(user, "performance.view")) sources.push(source("performance", "Authenticated user's performance scorecard and goals."));
    sources.push(source("calendar", "Authenticated user's upcoming calendar events."));
    if (hasPermission(user, "payroll.view")) sources.push(source("payroll", "Authenticated user's paid payslips."));
    if (hasPermission(user, "documents.view")) sources.push(source("documents", "Authenticated user's document records and expiry status."));
    if (hasPermission(user, "tickets.view")) sources.push(source("tickets", "Authenticated user's support/HR tickets."));
    if (hasPermission(user, "announcements.view")) sources.push(source("announcements", "Announcements visible to the authenticated user."));
    return { user, page: pageContext, data, sources };
  }

  if (intent === "EMPLOYEE_LOOKUP") {
    data.employeeLookup = await collectEmployeeLookup(user, message, pageContext);
    sources.push(source("employee", "Employee profiles visible to the authenticated user."));
    return { user, page: pageContext, data, sources };
  }

  const asksForOrgScope = /\b(company|organization|org|workforce|department|team|my team|overall company|company-wide|everyone|all employees)\b/i.test(message);

  if (
    (intent === "REPORTS" ||
      intent === "DASHBOARD" ||
      (intent === "CROSS_MODULE" && asksForOrgScope) ||
      (asksForOrgScope && ["ATTENDANCE", "LEAVE", "PERFORMANCE", "PAYROLL", "DOCUMENTS", "RECRUITMENT"].includes(intent))) &&
    hasPermission(user, "reports.view")
  ) {
    if (intent === "DASHBOARD") {
      data.dashboard = sanitizeDashboard(await safe(dashboardRepo.getKpis()));
      sources.push(source("dashboard", "Current HRMS dashboard KPIs."));
    } else {
      data.reports = await collectReport(user);
      sources.push(source("reports", "Authorized workforce, attendance, leave, payroll, performance, ticket and document reporting data."));
    }

    if (intent === "CROSS_MODULE" || intent === "REPORTS" || intent === "DASHBOARD") {
      return { user, page: pageContext, data, sources };
    }
  }

  if (intent === "ATTENDANCE" && hasPermission(user, "attendance.view")) {
    const target = await resolveTargetEmployee(user, message);

    if (target.message) {
      data.message = target.message;
    } else if (target.employeeId) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const end = now.toISOString().slice(0, 10);
      data.attendance = sanitizeAttendance(
        await safe(attendanceRepo.getAiAttendanceInsights(target.employeeId, start, end)),
      );
      if (target.employee) data.targetEmployee = target.employee;
      sources.push(
        source(
          "attendance",
          target.isSelf
            ? "Authenticated user's current-month attendance."
            : "Authorized employee current-month attendance.",
        ),
      );
    }
  } else if (intent === "LEAVE" && hasPermission(user, "leave.view")) {
    const target = await resolveTargetEmployee(user, message);

    if (target.message) {
      data.message = target.message;
    } else if (target.employeeId) {
      data.leave = sanitizeLeave(
        await safe(
          leaveRepo.listBalancesForEmployee(
            target.employeeId,
            new Date().getFullYear(),
          ),
        ),
      );
      if (target.employee) data.targetEmployee = target.employee;
      sources.push(
        source(
          "leave",
          target.isSelf
            ? "Authenticated user's current-year leave balances."
            : "Authorized employee current-year leave balances.",
        ),
      );
    }
  } else if (intent === "PERFORMANCE" && hasPermission(user, "performance.view")) {
    const target = await resolveTargetEmployee(user, message);

    if (target.message) {
      data.message = target.message;
    } else if (target.employeeId) {
      const performance = await safe(
        performanceRepo.getPerformanceScorecard(target.employeeId),
      );
      data.performance = sanitizePerformance(performance);
      if (!performance) {
        data.message = "Performance data is not available for this employee.";
      }
      if (target.employee) data.targetEmployee = target.employee;
      sources.push(
        source(
          "performance",
          target.isSelf
            ? "Authenticated user's performance scorecard and goals."
            : "Authorized employee performance scorecard and goals.",
        ),
      );
    }
  } else if (intent === "CALENDAR") {
    const target = await resolveTargetEmployee(user, message);

    if (target.message) {
      data.message = target.message;
    } else if (target.employeeId) {
      const now = new Date();
      data.calendar = sanitizeCalendar(
        (await safe(
          calendarRepo.getUpcomingEvents(
            target.employeeId,
            now.toISOString(),
            new Date(now.getTime() + 30 * 86_400_000).toISOString(),
          ),
        )) ?? [],
      );
      if (target.employee) data.targetEmployee = target.employee;
      sources.push(
        source(
          "calendar",
          target.isSelf
            ? "Authenticated user's upcoming calendar events."
            : "Authorized employee's upcoming calendar events.",
        ),
      );
    }
  } else if (intent === "PAYROLL" && hasPermission(user, "payroll.view")) {
    const target = await resolveTargetEmployee(user, message);

    if (target.message) {
      data.message = target.message;
    } else if (target.employeeId) {
      data.payroll = sanitizePayroll(
        (await safe(payrollRepo.listPayslipsForEmployee(target.employeeId))) ?? [],
      );
      if (target.employee) data.targetEmployee = target.employee;
      sources.push(
        source(
          "payroll",
          target.isSelf
            ? "Authenticated user's paid payslips."
            : "Authorized employee paid payslips.",
        ),
      );
    }
  } else if (intent === "DOCUMENTS" && hasPermission(user, "documents.view")) {
    const target = await resolveTargetEmployee(user, message);

    if (target.message) {
      data.message = target.message;
    } else if (target.employeeId) {
      data.documents = sanitizeDocuments(
        (await safe(documentsRepo.listDocuments(target.employeeId))) ?? [],
      );
      if (target.employee) data.targetEmployee = target.employee;
      sources.push(
        source(
          "documents",
          target.isSelf
            ? "Authenticated user's document records and expiry status."
            : "Authorized employee document records and expiry status.",
        ),
      );
    }
  } else if (intent === "RECRUITMENT" && hasPermission(user, "recruitment.view")) {
    const jobs = (await safe(recruitmentRepo.listJobPostings("OPEN"))) ?? [];
    data.recruitment = jobs.slice(0, 25).map((job: any) => ({
      id: job.id ?? job._id,
      title: job.title ?? job.jobTitle ?? null,
      status: job.status ?? null,
      department: job.departmentName ?? null,
      designation: job.designationTitle ?? null,
      candidateCount: job.candidateCount ?? null,
    }));
    sources.push(source("recruitment", "Authorized open recruitment postings and candidate counts."));
  } else if (intent === "ORGANIZATION") {
    if (hasPermission(user, "employees.view")) {
      const relationMatch = message.match(
        /\b(?:teammates?|team members?|employees?|people|staff|direct reports?|reports?)\s+(?:under|reporting\s+to|report(?:s)?\s+to)\s+(.+?)\s*\??$/i,
      ) ?? message.match(
        /\bwho\s+(?:reports?|is\s+reporting)\s+to\s+(.+?)\s*\??$/i,
      ) ?? message.match(
        /\bwho\s+is\s+under\s+(.+?)\s*\??$/i,
      );

      if (relationMatch?.[1]) {
        const managerName = relationMatch[1].trim();
        const matches = await safe(organizationRepo.findEmployeesByName(managerName));

        if (!matches?.length) {
          data.message = `No employee named ${managerName} was found.`;
        } else if (matches.length > 1) {
          data.message = `Multiple employees matched ${managerName}. Please provide the manager's full name.`;
        } else {
          const manager = matches[0];
          const managerId = String(manager._id ?? manager.employeeCode);
          const teammates = (await safe(
            organizationRepo.searchOrganization({
              employeeName: `${manager.firstName ?? ""} ${manager.lastName ?? ""}`.trim(),
              relation: "DIRECT_REPORTS",
              includeInactive: false,
            }),
          )) ?? [];

          data.organization = {
            relation: "DIRECT_REPORTS",
            manager: sanitizeEmployee(manager),
            employees: teammates.slice(0, 100).map((employee: any) => ({
              id: employee.id ?? employee._id,
              name: `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim(),
              employeeCode: employee.employeeCode ?? null,
              department: employee.departmentName ?? null,
              designation: employee.designationTitle ?? null,
              manager: employee.managerName ?? null,
              workLocation: employee.workLocation ?? null,
              status: employee.status ?? null,
            })),
            total: teammates.length,
          };
          sources.push(source("organization", `Authorized direct-report information for ${manager.firstName ?? ""} ${manager.lastName ?? ""}`.trim() + "."));
        }
      } else {
        const departments = (await safe(organizationRepo.listDepartments())) ?? [];
        data.organization = departments.slice(0, 50).map((department: any) => ({
          id: department.id ?? department._id,
          name: department.name,
          code: department.code,
          headcount: department.headcount ?? null,
          head: [department.headFirstName, department.headLastName].filter(Boolean).join(" ") || null,
        }));
        sources.push(source("organization", "Authorized department and organizational structure information."));
      }
    } else {
      data.message = "You do not have permission to view employee organization information.";
    }
  } else if (intent === "DASHBOARD" && !data.dashboard) {
    data.dashboard = sanitizeDashboard(await safe(dashboardRepo.getKpis()));
    sources.push(source("dashboard", "Current HRMS dashboard KPIs."));
  } else if (intent === "CROSS_MODULE" || intent === "GENERAL") {
    if (user.employeeId) {
      data.selfSummary = await collectSelfSummary(user);
      sources.push(source("employee", "Authenticated user's employee profile and permitted self-service HRMS information."));
      if (hasPermission(user, "attendance.view")) sources.push(source("attendance", "Authenticated user's attendance."));
      if (hasPermission(user, "leave.view")) sources.push(source("leave", "Authenticated user's leave."));
      if (hasPermission(user, "performance.view")) sources.push(source("performance", "Authenticated user's performance."));
    }
  }

  if (Object.keys(data).length === 0) {
    data.message = "No authorized HRMS data was available for this question.";
  }

  return { user, page: pageContext, data, sources };
}

/**
 * The LLM is responsible only for generating the human-readable answer.
 *
 * Intent and sources are authoritative server-side values and must never be
 * generated by the model.
 *
 * This prevents a valid AI answer from being rejected simply because the
 * model omitted, renamed, or reformatted metadata fields.
 */
const copilotAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(8000),
});

type CopilotAnswer = z.infer<typeof copilotAnswerSchema>;

export interface CopilotResponse {
  answer: string;
  intent: HrCopilotIntent;
  sources: HrCopilotSource[];
}

function isSimpleHrCopilotQuestion(message: string): boolean {
  const text = message.toLowerCase().trim();

  const self = /\b(my|me|mine|myself|i)\b/.test(text);

  const simpleAttendance =
    self &&
    ( /\b(attendance|attendence|check.?in|check.?out)\b/.test(text) ||
      /\b(present|absent)\b/.test(text) ) &&
    /\b(status|today|present|absent|currently|right now|did i|am i)\b/.test(text);

  const simpleEmployeeLookup =
    /\b(employee\s*(id|code|number)|staff\s*(id|code|number))\b/.test(text) ||
    /\b(designation|department|job title|manager|work location|office location|employment type|joining date|date of joining)\b/.test(text);

  const namedEmployeeLookup =
    simpleEmployeeLookup &&
    /\b(of|for)\b|['’]s\b/.test(text);

  const selfEmployeeLookup =
    self &&
    simpleEmployeeLookup &&
    !/\b(of|for)\b/.test(text) &&
    !/['’]s\b/.test(text);

  return simpleAttendance || namedEmployeeLookup || selfEmployeeLookup;
}

function buildDeterministicSimpleAnswer(
  context: HrCopilotContext,
  plan: ReturnType<typeof buildFallbackHrCopilotPlan>,
): string {
  const data = context.data as Record<string, any>;

  if (plan.scope === "SELF" && plan.domains.includes("ATTENDANCE") && plan.conditions.includes("TODAY_ATTENDANCE")) {
    const result = data.attendance as any;
    if (result?.message) return String(result.message);

    const attendance = result?.attendance;
    if (!attendance) {
      return "No attendance record has been recorded for today.";
    }

    const status = attendance.status ?? attendance.attendanceStatus ?? null;
    const checkIn = attendance.checkIn ?? attendance.checkInTime ?? null;
    const checkOut = attendance.checkOut ?? attendance.checkOutTime ?? null;
    const workHours = attendance.workHours ?? attendance.totalWorkHours ?? null;

    const lines = ["Today's Attendance", ""];

    if (status) lines.push(`Status: ${formatEnum(status)}`);
    if (checkIn) lines.push(`Check-in: ${formatDateTime(checkIn)}`);
    if (checkOut) lines.push(`Check-out: ${formatDateTime(checkOut)}`);
    if (workHours !== null && workHours !== undefined) {
      lines.push(`Work Hours: ${formatPlainValue(workHours)}`);
    }

    if (lines.length === 2) {
      lines.push("An attendance record exists for today, but its status details are not available.");
    }

    return lines.join("\n");
  }

  if (plan.scope === "EMPLOYEE" && plan.domains.includes("EMPLOYEE")) {
    const lookup = data.employeeLookup as any;
    const employee =
      lookup?.employee ??
      (data.employee as any);

    if (lookup?.message && !employee && !lookup?.matches?.length) {
      return String(lookup.message);
    }

    const matches = Array.isArray(lookup?.matches) ? lookup.matches : [];
    if (!employee && matches.length > 1) {
      return [
        "Multiple employees matched your request.",
        "",
        ...matches.map((item: any) => {
          const name = item.name ?? "Employee";
          return item.employeeCode ? `${name} — ${item.employeeCode}` : name;
        }),
        "",
        "Please provide the employee's full name or employee code.",
      ].join("\n");
    }

    if (!employee) {
      return lookup?.message ?? "No matching employee information is available.";
    }

    const name = employee.name ?? "Employee";
    const field = plan.requestedFields?.[0] ?? employee.requestedField ?? "profile";

    switch (field) {
      case "employeeCode":
        return employee.employeeCode
          ? `${name}'s employee code is ${employee.employeeCode}.`
          : `The employee code for ${name} is not available in the authorized data.`;
      case "department":
        return employee.department
          ? `${name} is in the ${employee.department} department.`
          : `The department for ${name} is not available in the authorized data.`;
      case "designation":
        return employee.designation
          ? `${name}'s designation is ${employee.designation}.`
          : `The designation for ${name} is not available in the authorized data.`;
      case "manager":
        return employee.manager
          ? `${name}'s manager is ${employee.manager}.`
          : `The manager for ${name} is not available in the authorized data.`;
      case "workLocation":
        return employee.workLocation
          ? `${name}'s work location is ${employee.workLocation}.`
          : `The work location for ${name} is not available in the authorized data.`;
      case "employmentType":
        return employee.employmentType
          ? `${name}'s employment type is ${formatEnum(employee.employmentType)}.`
          : `The employment type for ${name} is not available in the authorized data.`;
      case "status":
        return employee.status
          ? `${name}'s status is ${formatEnum(employee.status)}.`
          : `The status for ${name} is not available in the authorized data.`;
      case "dateOfJoining":
        return employee.dateOfJoining
          ? `${name}'s date of joining is ${formatReadableDate(employee.dateOfJoining)}.`
          : `The date of joining for ${name} is not available in the authorized data.`;
      case "skills":
        return Array.isArray(employee.skills) && employee.skills.length
          ? `${name}'s skills are ${employee.skills.map((item: any) => item.name ?? item).join(", ")}.`
          : `No skills are available for ${name} in the authorized data.`;
      default:
        return [
          "Employee Profile",
          "",
          `Name: ${name}`,
          employee.employeeCode ? `Employee Code: ${employee.employeeCode}` : "",
          employee.department ? `Department: ${employee.department}` : "",
          employee.designation ? `Designation: ${employee.designation}` : "",
          employee.manager ? `Manager: ${employee.manager}` : "",
          employee.workLocation ? `Work Location: ${employee.workLocation}` : "",
          employee.status ? `Status: ${formatEnum(employee.status)}` : "",
        ].filter(Boolean).join("\n");
    }
  }

  return "The requested HRMS information is not available in the authorized data.";
}

export async function askHrCopilot(
  req: any,
  input: HrCopilotRequest,
): Promise<CopilotResponse> {
  /**
   * ------------------------------------------------------------
   * 1. Build authenticated user context
   * ------------------------------------------------------------
   */

  const user = await buildUserContext(req);

  /**
   * ------------------------------------------------------------
   * 2. Build current-page context
   *
   * The page is only a hint.
   * It does NOT restrict the Copilot to that module.
   * ------------------------------------------------------------
   */

  const page = buildPageContext(
    input.pageContext,
  );

  /**
   * ------------------------------------------------------------
   * FAST PATH FOR SIMPLE FACTUAL QUESTIONS
   * ------------------------------------------------------------
   * These questions do not need an LLM. This keeps exact HRMS
   * values deterministic and significantly reduces Groq usage.
   */
  if (isSimpleHrCopilotQuestion(input.message)) {
    const simplePlan = buildFallbackHrCopilotPlan({
      message: input.message,
      user,
      page,
      conversation: input.conversation,
    });

    const simpleResult = await executeHrCopilotPlan(
      user,
      simplePlan,
    );

    const simpleContext: HrCopilotContext = {
      user,
      page,
      data: simpleResult.data,
      sources: simpleResult.sources,
    };

    return {
      answer: cleanHrCopilotAnswer(
        buildDeterministicSimpleAnswer(
          simpleContext,
          simplePlan,
        ),
      ),
      intent: detectHrCopilotIntent(input.message),
      sources: simpleResult.sources,
    };
  }

  /**
   * ------------------------------------------------------------
   * 3. AI understands the user's question
   *
   * IMPORTANT:
   *
   * We are no longer using regex intent detection as the
   * primary decision-maker.
   *
   * The planner determines:
   *
   * - task
   * - scope
   * - domains
   * - employee
   * - time range
   * - conditions
   * - required fields
   * ------------------------------------------------------------
   */

  const plan = await buildHrCopilotPlan({
    message: input.message,
    user,
    page,
    conversation: input.conversation,
  });

  /**
   * ------------------------------------------------------------
   * 4. Execute the AI plan through the secure backend
   *
   * The AI never talks directly to MongoDB.
   *
   * The executor:
   *
   * - checks permissions
   * - resolves employees
   * - resolves team membership
   * - calls repositories
   * - sanitizes returned data
   * ------------------------------------------------------------
   */

  const toolResult =
    await executeHrCopilotPlan(
      user,
      plan,
    );

  /**
   * ------------------------------------------------------------
   * 5. Keep the existing intent field for compatibility
   *
   * Your frontend/API already expects `intent`.
   *
   * This value is now metadata only.
   *
   * It is NOT responsible for deciding which repositories
   * are queried.
   * ------------------------------------------------------------
   */

  const intent =
    detectHrCopilotIntent(
      input.message,
    );

  /**
   * ------------------------------------------------------------
   * 6. Convert planner output + tool output into the
   * existing HrCopilotContext structure.
   *
   * This allows your existing answer prompt to continue working
   * without rewriting the entire Copilot.
   * ------------------------------------------------------------
   */

  const context: HrCopilotContext = {
    user,
    page,

    data: {
      ...toolResult.data,

      /**
       * Keep the planner information available to the answer
       * model as internal context.
       *
       * This allows the answer model to understand WHY the
       * retrieved data was collected.
       */
      copilotPlan: {
        task: plan.task,
        scope: plan.scope,
        domains: plan.domains,
        targetEmployeeName:
          plan.targetEmployeeName,
        timeRange: plan.timeRange,
        conditions: plan.conditions,
        requestedFields:
          plan.requestedFields,
      },
    },

    sources:
      toolResult.sources,
  };

  /**
   * ------------------------------------------------------------
   * 7. Build the answer-generation prompt
   *
   * The planner understands the question.
   *
   * The executor provides authorized data.
   *
   * The answer model explains the result to the user.
   * ------------------------------------------------------------
   */

  const baseSystemPrompt =
    buildHrCopilotSystemPrompt(
      context,
      intent,
    );

  const systemPrompt = `
${baseSystemPrompt}

COPILOT UNDERSTANDING PLAN

The question has already been analyzed by the Copilot planning layer.

Task:
${plan.task}

Scope:
${plan.scope}

Relevant HRMS domains:
${plan.domains.join(", ")}

Target employee:
${plan.targetEmployeeName ?? "None"}

Time range:
${plan.timeRange}

Conditions:
${plan.conditions.length
    ? plan.conditions.join(", ")
    : "None"}

Requested information:
${plan.requestedFields.length
    ? plan.requestedFields.join(", ")
    : "Determine from the user's question."}


ANSWERING INSTRUCTIONS

Answer the user's ORIGINAL question directly.

Do not blindly summarize every piece of retrieved data.

Use the plan to understand what the user actually wants.

If the question asks "who", identify the relevant employees.

If the question asks "which employees", identify the relevant employees.

If the question asks about "my team", use only the team data returned by the secure backend.

If the question requires multiple HRMS domains, combine those domains.

If the question asks for issues, identify issues from the supplied data.

Do not invent thresholds, employees, metrics, dates, or conclusions that are not supported by the authorized data.

If the available data is insufficient to determine the answer, clearly say what information is unavailable.

Never expose the internal Copilot plan.

Never mention the planner, executor, repositories, database, tools, or internal implementation.

Return only the user-facing answer.
`;

  /**
   * ------------------------------------------------------------
   * 8. Existing fallback
   * ------------------------------------------------------------
   *
   * We keep your existing fallback system so existing
   * functionality is not lost.
   */

  const fallback: CopilotAnswer = {
    answer:
      buildHrCopilotFallbackAnswer(
        context,
        intent,
      ),
  };

  /**
   * ------------------------------------------------------------
   * 9. Generate final human-readable answer
   * ------------------------------------------------------------
   */

  const result =
    await generateOrganizationAI(
      systemPrompt,
      copilotAnswerSchema,
      fallback,
      {
        userMessage:
          buildConversationPrompt(
            input,
          ),

        temperature: 0.15,

        maxTokens: 1200,

        timeoutMs: 12000,
      },
    );

  /**
   * ------------------------------------------------------------
   * 10. Clean final answer
   * ------------------------------------------------------------
   */

  const cleanedAnswer =
    cleanHrCopilotAnswer(
      result.answer,
    );

  /**
   * ------------------------------------------------------------
   * 11. Return API response
   *
   * Intent and sources remain server-controlled.
   * The LLM cannot modify them.
   * ------------------------------------------------------------
   */

  return {
    answer: cleanedAnswer,
    intent,
    sources: toolResult.sources,
  };
}

function humanizeFieldName(key: string): string {
  const labels: Record<string, string> = {
    employeeCode: "Employee Code",
    attendanceRate: "Attendance Rate",
    presentDays: "Present Days",
    absentDays: "Absent Days",
    wfhDays: "WFH Days",
    leaveDays: "Leave Days",
    halfDays: "Half Days",
    averageWorkHours: "Average Work Hours",
    regularizedDays: "Regularized Days",
    lateCheckIns: "Late Check-ins",
    earlyCheckOuts: "Early Check-outs",
    missingCheckoutDays: "Missing Check-outs",
    goalAchievement: "Goal Achievement",
    goalCount: "Goals Tracked",
    netPay: "Net Pay",
    totalGross: "Total Gross",
    totalDeductions: "Total Deductions",
    payslipCount: "Payslips",
  };

  if (labels[key]) return labels[key];

  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function formatEnum(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not available";
  return String(value)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatReadableDate(value: unknown): string {
  if (!value) return "Date not available";
  const raw = String(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    const [, year, month, day] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: unknown): string {
  if (!value) return "Date not available";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return formatReadableDate(value);

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPlainValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value.map((item) => formatPlainValue(item)).join(", ");
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${humanizeFieldName(key)}: ${formatPlainValue(item)}`)
      .join(", ");
  }

  return String(value);
}

function formatMetricValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not available";
  if (key.toLowerCase().includes("rate")) return `${value}%`;
  if (key.toLowerCase().includes("date") && typeof value === "string") {
    return formatReadableDate(value);
  }
  if (key.toLowerCase().includes("status")) return formatEnum(value);
  return formatPlainValue(value);
}

function appendSection(lines: string[], title: string, items: string[]): void {
  const validItems = items.filter((item) => item && item.trim());
  if (validItems.length === 0) return;

  lines.push("", title, "", ...validItems);
}

function buildHrCopilotFallbackAnswer(
  context: HrCopilotContext,
  intent: HrCopilotIntent,
): string {
  const data = context.data as Record<string, any>;

  if (intent === "EMPLOYEE_LOOKUP" && data.employeeLookup) {
    const lookup = data.employeeLookup;

    if (lookup.message?.includes("permission")) {
      return lookup.message;
    }

    const employee = lookup.employee ?? lookup.matches?.[0];
    const matches = Array.isArray(lookup.matches) ? lookup.matches : [];

    if (!employee && matches.length === 0) {
      return lookup.message ?? "No matching employee information is available.";
    }

    if (!employee && matches.length > 1) {
      return [
        "Employee Search",
        "",
        "Multiple employees matched your request.",
        "",
        ...matches.map((item: any) => {
          const name = item.name ?? "Employee";
          const code = item.employeeCode ? ` — ${item.employeeCode}` : "";
          return `${name}${code}`;
        }),
        "",
        "Please specify the employee's full name.",
      ].join("\n");
    }

    const requestedField = lookup.requestedField ?? "profile";
    const name = employee.name ?? "Employee";

    if (requestedField === "employeeCode") {
      return employee.employeeCode
        ? `${name}'s employee code is ${employee.employeeCode}.`
        : `The employee code for ${name} is not available in the authorized data.`;
    }

    if (requestedField === "department") {
      return employee.department
        ? `${name} is in the ${employee.department} department.`
        : `The department for ${name} is not available in the authorized data.`;
    }

    if (requestedField === "designation") {
      return employee.designation
        ? `${name}'s designation is ${employee.designation}.`
        : `The designation for ${name} is not available in the authorized data.`;
    }

    if (requestedField === "manager") {
      return employee.manager
        ? `${name}'s manager is ${employee.manager}.`
        : `The manager for ${name} is not available in the authorized data.`;
    }

    if (requestedField === "workLocation") {
      return employee.workLocation
        ? `${name}'s work location is ${employee.workLocation}.`
        : `The work location for ${name} is not available in the authorized data.`;
    }

    if (requestedField === "status") {
      return employee.status
        ? `${name}'s status is ${formatEnum(employee.status)}.`
        : `The status for ${name} is not available in the authorized data.`;
    }

    return [
      "Employee Profile",
      "",
      `Name: ${name}`,
      employee.employeeCode ? `Employee Code: ${employee.employeeCode}` : "",
      employee.department ? `Department: ${employee.department}` : "",
      employee.designation ? `Designation: ${employee.designation}` : "",
      employee.manager ? `Manager: ${employee.manager}` : "",
      employee.status ? `Status: ${formatEnum(employee.status)}` : "",
      employee.employmentType ? `Employment Type: ${formatEnum(employee.employmentType)}` : "",
    ].filter(Boolean).join("\n");
  }

  if (intent === "REPORTS" && data.reports) {
    const report = data.reports;
    const lines = ["Workforce Summary", ""];
    const scopeLabel = report.scope === "TEAM"
      ? "your team"
      : report.scope === "ORGANIZATION"
        ? "the organization"
        : "the authorized workforce";

    lines.push(`Here is the current status for ${scopeLabel}.`);

    const workforce = report.workforce;
    if (workforce) {
      appendSection(lines, "Workforce", [
        workforce.total != null ? `Total Employees: ${workforce.total}` : "",
        workforce.active != null ? `Active Employees: ${workforce.active}` : "",
        workforce.recentHires != null ? `Recent Hires: ${workforce.recentHires}` : "",
        workforce.exits != null ? `Exits: ${workforce.exits}` : "",
      ]);
    }

    const attendance = report.attendance;
    if (attendance) {
      appendSection(lines, "Attendance", [
        attendance.total != null ? `Attendance Records: ${attendance.total}` : "",
        attendance.workHours != null ? `Work Hours: ${formatPlainValue(attendance.workHours)}` : "",
        attendance.regularized != null ? `Regularized Records: ${formatPlainValue(attendance.regularized)}` : "",
        attendance.lateMetrics != null ? `Late Attendance: ${formatPlainValue(attendance.lateMetrics)}` : "",
      ]);
    }

    const leave = report.leave;
    if (leave) {
      appendSection(lines, "Leave", [
        leave.total != null ? `Total Leave Records: ${leave.total}` : "",
        leave.byStatus != null ? `Leave Status: ${formatPlainValue(leave.byStatus)}` : "",
        leave.byType != null ? `Leave by Type: ${formatPlainValue(leave.byType)}` : "",
      ]);
    }

    const performance = report.performance;
    if (performance) {
      appendSection(lines, "Performance", [
        performance.totalReviews != null ? `Total Reviews: ${performance.totalReviews}` : "",
        performance.completedReviews != null ? `Completed Reviews: ${performance.completedReviews}` : "",
        performance.averageRating != null ? `Average Rating: ${performance.averageRating}` : "",
        performance.goalAchievement != null ? `Goal Achievement: ${formatPlainValue(performance.goalAchievement)}` : "",
      ]);
    }

    const payroll = report.payroll;
    if (payroll) {
      appendSection(lines, "Payroll", [
        payroll.runs != null ? `Payroll Runs: ${payroll.runs}` : "",
        payroll.payslipCount != null ? `Payslips: ${payroll.payslipCount}` : "",
        payroll.totalGross != null ? `Total Gross: ${formatPlainValue(payroll.totalGross)}` : "",
        payroll.totalDeductions != null ? `Total Deductions: ${formatPlainValue(payroll.totalDeductions)}` : "",
        payroll.totalNet != null ? `Total Net Pay: ${formatPlainValue(payroll.totalNet)}` : "",
      ]);
    }

    const documents = report.documents;
    if (documents) {
      appendSection(lines, "Documents", [
        documents.total != null ? `Total Documents: ${documents.total}` : "",
        documents.expiringSoon != null ? `Expiring Soon: ${documents.expiringSoon}` : "",
        documents.expired != null ? `Expired: ${documents.expired}` : "",
      ]);
    }

    const tickets = report.tickets;
    if (tickets) {
      appendSection(lines, "Support Tickets", [
        tickets.total != null ? `Total Tickets: ${tickets.total}` : "",
        tickets.byStatus != null ? `Ticket Status: ${formatPlainValue(tickets.byStatus)}` : "",
      ]);
    }

    return lines.join("\n").trim();
  }

  if (intent === "DASHBOARD" && data.dashboard) {
    const dashboard = data.dashboard;
    const lines = ["HRMS Dashboard", ""];
    appendSection(lines, "Current Status", [
      dashboard.headcount != null ? `Headcount: ${dashboard.headcount}` : "",
      dashboard.newHires30d != null ? `New Hires in the Last 30 Days: ${dashboard.newHires30d}` : "",
      dashboard.exits90d != null ? `Exits in the Last 90 Days: ${dashboard.exits90d}` : "",
      dashboard.pendingLeave != null ? `Pending Leave: ${dashboard.pendingLeave}` : "",
      dashboard.openRoles != null ? `Open Roles: ${dashboard.openRoles}` : "",
      dashboard.presentToday != null ? `Present Today: ${dashboard.presentToday}` : "",
      dashboard.onLeaveToday != null ? `On Leave Today: ${dashboard.onLeaveToday}` : "",
      dashboard.attritionRate != null ? `Attrition Rate: ${dashboard.attritionRate}%` : "",
      dashboard.attendanceRate != null ? `Attendance Rate: ${dashboard.attendanceRate}%` : "",
    ]);
    return lines.join("\n").trim();
  }

  if (intent === "ATTENDANCE" && data.attendance) {
    const attendance = data.attendance;
    const lines = ["Attendance Summary", ""];
    if (attendance.period) appendSection(lines, "Reporting Period", [formatPlainValue(attendance.period)]);
    if (attendance.summary) {
      appendSection(lines, "Attendance Metrics", Object.entries(attendance.summary).map(([key, value]) => `${humanizeFieldName(key)}: ${formatMetricValue(key, value)}`));
    }
    if (attendance.timing) {
      appendSection(lines, "Timing", Object.entries(attendance.timing).map(([key, value]) => `${humanizeFieldName(key)}: ${formatMetricValue(key, value)}`));
    }
    if (attendance.trend) {
      appendSection(lines, "Trend", Object.entries(attendance.trend).map(([key, value]) => `${humanizeFieldName(key)}: ${formatMetricValue(key, value)}`));
    }
    return lines.join("\n").trim();
  }

  if (intent === "LEAVE" && data.leave) {
    const leave = Array.isArray(data.leave) ? data.leave : [];
    return [
      "Leave Balance",
      "",
      ...(leave.length
        ? leave.map((item: any) => `${item.name ?? "Leave"}: ${item.available ?? "Not available"} days available${Number(item.pendingDays ?? 0) > 0 ? `, ${item.pendingDays} days pending` : ""}`)
        : ["No leave balance information is available."]),
    ].join("\n");
  }

  if (intent === "PERFORMANCE" && data.message) {
    return String(data.message);
  }

  if (intent === "PERFORMANCE" && data.performance) {
    const performance = data.performance;
    const targetEmployee = data.targetEmployee as any;
    const lines = [
      targetEmployee?.name
        ? `Performance and Goals for ${targetEmployee.name}`
        : "Performance and Goals",
      "",
    ];
    appendSection(lines, "Current Metrics", [
      performance.overallRating != null ? `Overall Rating: ${performance.overallRating}` : "",
      performance.managerRating != null ? `Manager Rating: ${performance.managerRating}` : "",
      performance.feedbackRating != null ? `Feedback Rating: ${performance.feedbackRating}` : "",
      performance.goalAchievement != null ? `Goal Achievement: ${formatPlainValue(performance.goalAchievement)}` : "",
      performance.goalCount != null ? `Goals Tracked: ${performance.goalCount}` : "",
    ]);
    return lines.join("\n").trim();
  }

  if (intent === "CALENDAR" && Array.isArray(data.calendar)) {
    return [
      "Upcoming Calendar",
      "",
      ...(data.calendar.length
        ? data.calendar.slice(0, 10).map((event: any) => `${event.title ?? "Untitled Event"} — ${event.startAt ? formatDateTime(event.startAt) : "Date not available"}`)
        : ["No upcoming calendar events are available."]),
    ].join("\n");
  }

  if (intent === "PAYROLL" && Array.isArray(data.payroll)) {
    return [
      "Payroll",
      "",
      ...(data.payroll.length
        ? data.payroll.slice(0, 6).map((item: any) => `${item.month ?? "Period"}/${item.year ?? ""}: ${item.runStatus ? formatEnum(item.runStatus) : "Status not available"}${item.netPay != null ? `, Net Pay: ${item.netPay}` : ""}`)
        : ["No payroll records are available."]),
    ].join("\n");
  }

  if (intent === "DOCUMENTS" && Array.isArray(data.documents)) {
    return [
      "Documents",
      "",
      ...(data.documents.length
        ? data.documents.slice(0, 10).map((item: any) => `${item.type ?? item.fileName ?? "Document"}: ${formatEnum(item.complianceStatus ?? item.status ?? "PENDING")}${item.expiryDate ? `, Expiry: ${formatReadableDate(item.expiryDate)}` : ""}`)
        : ["No document records are available."]),
    ].join("\n");
  }

  if (intent === "RECRUITMENT" && Array.isArray(data.recruitment)) {
    return [
      "Recruitment",
      "",
      ...(data.recruitment.length
        ? data.recruitment.slice(0, 20).map((job: any) => `${job.title ?? "Open Role"}: ${formatEnum(job.status ?? "OPEN")}${job.department ? `, Department: ${job.department}` : ""}${job.candidateCount != null ? `, Candidates: ${job.candidateCount}` : ""}`)
        : ["No open recruitment records are available."]),
    ].join("\n");
  }

  if (intent === "ORGANIZATION" && data.organization) {
    const organization = data.organization as any;

    if (organization.relation === "DIRECT_REPORTS") {
      const managerName = organization.manager?.name ?? "the manager";
      const employees = Array.isArray(organization.employees) ? organization.employees : [];

      return [
        `Team under ${managerName}`,
        "",
        employees.length
          ? `${organization.total ?? employees.length} direct reports were found.`
          : "",
        ...(employees.length
          ? employees.map((employee: any) =>
              `${employee.name ?? "Employee"}${employee.employeeCode ? `, Employee Code: ${employee.employeeCode}` : ""}${employee.designation ? `, Designation: ${employee.designation}` : ""}${employee.department ? `, Department: ${employee.department}` : ""}`,
            )
          : ["No direct reports were found for this manager."]),
      ].filter(Boolean).join("\n");
    }

    if (Array.isArray(organization)) {
      return [
        "Organization",
        "",
        ...(organization.length
          ? organization.map((department: any) => `${department.name ?? "Department"}${department.headcount != null ? `: ${department.headcount} employees` : ""}${department.head ? `, Head: ${department.head}` : ""}`)
          : ["No organizational information is available."]),
      ].join("\n");
    }
  }

  // SELF_SUMMARY, GENERAL and CROSS_MODULE questions can use the
  // authenticated user's complete cross-module HRMS summary.
  // This is also the deterministic fallback when Groq is unavailable
  // or returns an invalid response.
  if (
    (intent === "SELF_SUMMARY" ||
      intent === "GENERAL" ||
      intent === "CROSS_MODULE") &&
    data.selfSummary
  ) {
    const self = data.selfSummary;
    const lines = [
      intent === "SELF_SUMMARY" ? "Overall Work Summary" : "HRMS Summary",
      "",
    ];

    if (self.employee) {
      appendSection(lines, "Employee", [
        self.employee.name ? `Name: ${self.employee.name}` : "",
        self.employee.employeeCode ? `Employee Code: ${self.employee.employeeCode}` : "",
        self.employee.department ? `Department: ${self.employee.department}` : "",
        self.employee.designation ? `Designation: ${self.employee.designation}` : "",
        self.employee.status ? `Status: ${formatEnum(self.employee.status)}` : "",
      ]);
    }

    if (self.attendance?.summary) {
      appendSection(lines, "Attendance", Object.entries(self.attendance.summary).slice(0, 8).map(([key, value]) => `${humanizeFieldName(key)}: ${formatMetricValue(key, value)}`));
    }

    if (Array.isArray(self.leave) && self.leave.length) {
      appendSection(lines, "Leave", self.leave.slice(0, 8).map((item: any) => `${item.name ?? "Leave"}: ${item.available ?? "Not available"} days available`));
    }

    if (self.performance) {
      appendSection(lines, "Performance", [
        self.performance.goalCount != null ? `Goals Tracked: ${self.performance.goalCount}` : "",
        self.performance.goalAchievement != null ? `Goal Achievement: ${formatPlainValue(self.performance.goalAchievement)}` : "",
        self.performance.overallRating != null ? `Overall Rating: ${self.performance.overallRating}` : "",
        self.performance.managerRating != null ? `Manager Rating: ${self.performance.managerRating}` : "",
      ]);
    }

    if (Array.isArray(self.calendar) && self.calendar.length) {
      appendSection(
        lines,
        "Upcoming Calendar",
        self.calendar.slice(0, 5).map((event: any) =>
          `${event.title ?? "Untitled Event"}${event.startAt ? ` — ${formatDateTime(event.startAt)}` : ""}`,
        ),
      );
    }

    if (Array.isArray(self.payroll) && self.payroll.length) {
      const latest = self.payroll[0];
      appendSection(lines, "Latest Payroll", [
        latest.month != null || latest.year != null
          ? `Pay Period: ${latest.month ?? ""} ${latest.year ?? ""}`.trim()
          : "",
        latest.runStatus ? `Status: ${formatEnum(latest.runStatus)}` : "",
        latest.netPay != null ? `Net Pay: ${latest.netPay}` : "",
        latest.totalDeductions != null ? `Total Deductions: ${latest.totalDeductions}` : "",
      ]);
    }

    if (Array.isArray(self.documents) && self.documents.length) {
      const expired = self.documents.filter((item: any) => item.complianceStatus === "EXPIRED").length;
      const expiringSoon = self.documents.filter((item: any) => item.complianceStatus === "EXPIRING_SOON").length;
      appendSection(lines, "Documents", [
        `Documents Tracked: ${self.documents.length}`,
        `Expired Documents: ${expired}`,
        `Expiring Soon: ${expiringSoon}`,
      ]);
    }

    if (Array.isArray(self.tickets) && self.tickets.length) {
      const openTickets = self.tickets.filter((item: any) =>
        !["RESOLVED", "CLOSED"].includes(String(item.status ?? "").toUpperCase()),
      ).length;
      appendSection(lines, "Support Tickets", [
        `Tickets: ${self.tickets.length}`,
        `Open Tickets: ${openTickets}`,
      ]);
    }

    if (Array.isArray(self.announcements) && self.announcements.length) {
      appendSection(lines, "Recent Announcements", self.announcements.slice(0, 8).map((item: any) => `${item.title ?? "Announcement"}${item.publishedAt ? ` — ${formatReadableDate(item.publishedAt)}` : ""}`));
    }

    return lines.join("\n").trim();
  }

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  if (context.sources.length > 0) {
    return "The requested HRMS data was retrieved, but there was not enough structured information to answer this question. Please try asking for a specific employee, attendance, leave, performance, payroll, document, calendar, workforce, or organization detail.";
  }

  return "I do not have authorized HRMS data available for that question.";
}

function buildConversationPrompt(input: HrCopilotRequest): string {
  const history = (input.conversation ?? [])
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  return `USER QUESTION:
${input.message}

CONVERSATION HISTORY (NOT AUTHORITATIVE HRMS DATA):
${history || "No previous conversation."}

Answer only from the authorized server-side HRMS context.
If the conversation history conflicts with that context, ignore the history.

OUTPUT REQUIREMENT:
Return only valid JSON in this exact shape:
{"answer":"your user-facing answer"}

Do not return any other fields.`;
}

function cleanHrCopilotAnswer(answer: string): string {
  if (!answer) return "";

  let cleaned = answer.trim();

  cleaned = cleaned
    .replace(/^```(?:json|markdown|md|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof parsed.answer === "string"
    ) {
      cleaned = parsed.answer.trim();
    }
  } catch {
    // Continue with plain-text cleanup.
  }

  cleaned = cleaned
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\*\*\*(.*?)\*\*\*/gs, "$1")
    .replace(/\*\*(.*?)\*\*/gs, "$1")
    .replace(/__(.*?)__/gs, "$1")
    .replace(/~~(.*?)~~/gs, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Remove Markdown table separator rows.
  cleaned = cleaned.replace(
    /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/gm,
    "",
  );

  // Convert table rows to plain readable text.
  cleaned = cleaned.replace(/^\s*\|(.+)\|\s*$/gm, (_, row: string) =>
    row
      .split("|")
      .map((part: string) => part.trim())
      .filter(Boolean)
      .join(" — "),
  );

  cleaned = cleaned
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

  return cleaned;
}
