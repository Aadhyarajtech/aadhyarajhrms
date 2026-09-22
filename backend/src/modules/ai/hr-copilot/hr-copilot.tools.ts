import { HrCopilotIntent } from "./hr-copilot.types";

export function detectHrCopilotIntent(message: string): HrCopilotIntent {
  const text = message.toLowerCase().trim();

  // Specific reporting-line questions must be resolved through the
  // organization data layer, not the generic workforce reports layer.
  // Examples: "teammates under Adithya", "employees reporting to Adithya",
  // "who reports to Adithya".
  if (
    /\b(?:teammates?|team members?|employees?|people|staff|direct reports?|reports?)\s+(?:under|reporting\s+to|report(?:s)?\s+to)\b/i.test(text) ||
    /\bwho\s+(?:reports?|is\s+reporting)\s+to\b/i.test(text) ||
    /\bwho\s+is\s+under\b/i.test(text)
  ) {
    return "ORGANIZATION";
  }

  // Organization/team/workforce scope must be checked before personal-summary
  // phrases so questions such as "overall summary of my team" are not treated
  // as the authenticated user's personal summary.
  if (
    /\b(my team|our team|team summary|team status|team performance|team attendance|team leave|team workload|team availability|team overview|team members|direct reports|my direct reports|workforce|workforce status|workforce summary|workforce overview|headcount|company-wide|company wide|organization-wide|organization wide|overall company|company status|company summary|company overview|department summary|department status|department overview|all employees|everyone)\b/.test(text)
  ) {
    return "REPORTS";
  }

  // Employee-specific questions should be routed to the database-backed
  // employee lookup layer. This includes simple factual questions such as
  // "What is the employee code of Adithya Nuthakki?".
  if (
    /\b(employee\s*(?:code|id|number)|staff\s*(?:code|id|number)|employee profile|employee details|employee information|who is|who's|tell me about|show me.*employee|find.*employee|search.*employee|team member details|person details|colleague details)\b/.test(text)
  ) {
    return "EMPLOYEE_LOOKUP";
  }

  if (/\b(attendance|present|absent|late|check.?in|check.?out|working hours|overtime|regularization)\b/.test(text)) {
    return "ATTENDANCE";
  }

  if (/\b(leave|holiday|comp.?off|leave balance|leave request|time off)\b/.test(text)) {
    return "LEAVE";
  }

  if (/\b(performance|goal|goals|review|rating|scorecard|pip|feedback|development)\b/.test(text)) {
    return "PERFORMANCE";
  }

  if (/\b(calendar|meeting|schedule|event|appointment|upcoming)\b/.test(text)) {
    return "CALENDAR";
  }

  if (/\b(salary|payroll|payslip|ctc|compensation|deduction|net pay|gross pay)\b/.test(text)) {
    return "PAYROLL";
  }

  if (/\b(recruitment|candidate|job opening|hiring|applicant|vacanc(?:y|ies)|open role)\b/.test(text)) {
    return "RECRUITMENT";
  }

  if (/\b(organization|org chart|department|designation|manager|reporting structure|reporting)\b/.test(text)) {
    return "ORGANIZATION";
  }

  if (/\b(document|documents|offer letter|appointment letter|experience letter|certificate|expiry|compliance)\b/.test(text)) {
    return "DOCUMENTS";
  }

  if (/\b(report|reports|analytics|workforce|headcount|attrition|company metrics|company summary|company-wide)\b/.test(text)) {
    return "REPORTS";
  }

  if (/\b(dashboard|kpi|company overview|company status|business status)\b/.test(text)) {
    return "DASHBOARD";
  }

  if (/\b(my tickets|my ticket|support ticket|helpdesk|ticket status)\b/.test(text)) {
    return "CROSS_MODULE";
  }

  if (/\b(my overall|overall summary|my work status|my status|how am i doing|my progress|my work|my career|my profile summary|my performance summary|my attendance summary|my leave summary)\b/.test(text)) {
    return "SELF_SUMMARY";
  }

  if (/\b(my|me|mine|i|overall)\b/.test(text)) {
    return "CROSS_MODULE";
  }

  return "GENERAL";
}
