// hr-copilot.analyzer.ts
// This module provides a lightweight analysis of a user's HR request.
// It extracts the relevant HR domains, target employee (if any), time range,
// required fields, and identifies high‑level conditions. It does *not* perform
// any data fetching or UI rendering, ensuring existing functionality remains
// untouched.

// Keep the analyzer independent from the planner's private helpers. The
// planner intentionally does not expose those implementation details.
const detectDomains = (message: string): string[] => {
  const domains: string[] = [];
  const checks: Array<[string, RegExp]> = [
    ["ATTENDANCE", /attendance|present|absent|punch|clock[- ]?in|clock[- ]?out|leave/i],
    ["EMPLOYEE", /employee|profile|staff|designation|department|joining|salary/i],
    ["PAYROLL", /payroll|payslip|pay slip|salary|deduction/i],
    ["LEAVE", /leave|holiday|vacation/i],
    ["ORGANIZATION", /organization|organisation|org\s+chart|team|reports\s+to|works\s+under|manager|hierarchy|list\s+of\s+employees|all\s+employees/i],
  ];
  for (const [domain, pattern] of checks) {
    if (pattern.test(message)) domains.push(domain);
  }
  return domains;
};

const extractNamedEmployee = (message: string): string | null => {
  const match = message.match(/(?:for|of|about|employee)\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)?)/);
  return match?.[1] ?? null;
};

const extractManagerLookupEmployeeName = (message: string): string | null => {
  const match = message.match(/(?:who does|manager of|reports to|works under)\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)?)/i);
  return match?.[1] ?? null;
};

const isSelfAttendanceQuestion = (message: string): boolean =>
  /\b(my|me|mine|myself|i)\b.*\b(attendance|present|absent|punch|clock)/i.test(message);

const isOverallSelfSummary = (message: string): boolean =>
  /\b(my|me|mine|myself)\b.*\b(summary|overview|status|details|information)\b/i.test(message);

const isSelfEmployeeLookupQuestion = (message: string): boolean =>
  /\b(my|me|mine|myself)\b.*\b(profile|employee|designation|department|details)\b/i.test(message);

const detectTimeRange = (message: string): string => {
  if (/today/i.test(message)) return "TODAY";
  if (/this\s+week/i.test(message)) return "THIS_WEEK";
  if (/this\s+month/i.test(message)) return "THIS_MONTH";
  if (/yesterday/i.test(message)) return "YESTERDAY";
  return "UNSPECIFIED";
};

const detectRequestedEmployeeFields = (message: string): string[] => {
  const fields: string[] = [];
  const checks: Array<[string, RegExp]> = [
    ["name", /\bname\b/i],
    ["email", /\bemail\b/i],
    ["department", /\bdepartment\b/i],
    ["designation", /\bdesignation|title|role\b/i],
    ["joiningDate", /\b(joining|join)\s+date\b/i],
  ];
  for (const [field, pattern] of checks) {
    if (pattern.test(message)) fields.push(field);
  }
  return fields;
};

export interface HrRequestAnalysis {
  /** HR modules that the request touches */
  domains: string[];
  /** Name of the employee the request is about, or null for self/unknown */
  targetEmployeeName: string | null;
  /** Detected time range (e.g., TODAY, THIS_WEEK) */
  timeRange: string;
  /** High‑level flags useful for downstream routing */
  conditions: string[];
  /** Specific employee fields the user asked for */
  requestedFields: string[];
}

/**
 * Analyse a free‑text HR request and return a structured description.
 *
 * The implementation mirrors the fallback planner logic but stops after the
 * identification phase – no plan generation or data access occurs. This keeps
 * the function side‑effect‑free and safe to call from anywhere (including UI
 * components) without altering existing behaviour.
 */
export function analyzeHrRequest(message: string): HrRequestAnalysis {
  const conditions: string[] = [];
  let targetEmployeeName: string | null = null;

  // Overall self‑summary detection
  if (isOverallSelfSummary(message)) {
    conditions.push("SELF_SUMMARY");
  }

  // Self attendance detection
  if (isSelfAttendanceQuestion(message)) {
    conditions.push("SELF_ATTENDANCE");
  }

  // Manager lookup – e.g., "Who does Alice report to?"
  const managerName = extractManagerLookupEmployeeName(message);
  if (managerName) {
    targetEmployeeName = managerName;
    conditions.push("MANAGER_LOOKUP");
  } else {
    // Named employee extraction (excluding self‑references)
    const named = extractNamedEmployee(message);
    if (named && !/\b(my|me|mine|myself)\b/i.test(named)) {
      targetEmployeeName = named;
      conditions.push("NAMED_EMPLOYEE");
    }
  }

  // Self employee lookup (asking for own profile)
  if (isSelfEmployeeLookupQuestion(message)) {
    conditions.push("SELF_EMPLOYEE_LOOKUP");
  }

  const domains = detectDomains(message);
  const timeRange = detectTimeRange(message);
  const requestedFields = detectRequestedEmployeeFields(message);

  return {
    domains,
    targetEmployeeName,
    timeRange,
    conditions,
    requestedFields,
  };
}
