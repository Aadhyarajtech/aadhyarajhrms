import { z } from "zod";

import { generateOrganizationAI } from "@/services/ai.service";

import {
  HR_COPILOT_PLANNER_PROMPT,
  buildHrCopilotPlannerUserPrompt,
} from "./hr-copilot.planner.prompts";

/**
 * The planner only forwards these contexts to the prompt builder.  Keep the
 * input types local because the context module does not export these names.
 */
export type HrCopilotPageContext = object;
export type HrCopilotUserContext = object;

/**
 * ============================================================================
 * PLANNER SCHEMA
 * ============================================================================
 */

export const hrCopilotPlanSchema = z.object({
  task: z.enum([
    "LOOKUP",
    "SUMMARY",
    "IDENTIFY_ISSUES",
    "COMPARE",
    "ANALYZE",
    "COUNT",
    "LIST",
    "STATUS",
    "TREND",
    "GENERAL",
  ]),

  scope: z.enum([
    "SELF",
    "EMPLOYEE",
    "MY_TEAM",
    "DEPARTMENT",
    "ORGANIZATION",
    "AUTHORIZED_EMPLOYEES",
    "UNKNOWN",
  ]),

  domains: z
    .array(
      z.enum([
        "EMPLOYEE",
        "ATTENDANCE",
        "LEAVE",
        "PERFORMANCE",
        "GOALS",
        "CALENDAR",
        "PAYROLL",
        "DOCUMENTS",
        "TICKETS",
        "ANNOUNCEMENTS",
        "RECRUITMENT",
        "ORGANIZATION",
        "REPORTS",
        "DASHBOARD",
      ]),
    )
    .min(1)
    .max(14),

  targetEmployeeName: z.string().nullable(),

  timeRange: z.enum([
    "TODAY",
    "YESTERDAY",
    "THIS_WEEK",
    "LAST_WEEK",
    "THIS_MONTH",
    "THIS_YEAR",
    "LAST_MONTH",
    "LAST_30_DAYS",
    "LAST_90_DAYS",
    "UPCOMING",
    "CURRENT",
    "UNKNOWN",
  ]),

  conditions: z
    .array(z.string())
    .max(10),

  requestedFields: z
    .array(z.string())
    .max(15),

  reasoning: z
    .string()
    .max(500),
});

export type HrCopilotPlan = z.infer<
  typeof hrCopilotPlanSchema
>;

/**
 * ============================================================================
 * INPUT
 * ============================================================================
 */

export interface BuildHrCopilotPlanInput {
  message: string;

  user: HrCopilotUserContext;

  page: HrCopilotPageContext;

  conversation?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

/**
 * ============================================================================
 * CROSS-MODULE PERSONAL DOMAINS
 * ============================================================================
 */

const CROSS_MODULE_SELF_DOMAINS: HrCopilotPlan["domains"] = [
  "EMPLOYEE",
  "ATTENDANCE",
  "LEAVE",
  "PERFORMANCE",
  "GOALS",
  "CALENDAR",
  "PAYROLL",
  "DOCUMENTS",
  "TICKETS",
  "ANNOUNCEMENTS",
];

/**
 * ============================================================================
 * TIME RANGE
 * ============================================================================
 */

function detectTimeRange(
  message: string,
): HrCopilotPlan["timeRange"] {
  const text = message
    .toLowerCase()
    .trim();

  if (
    /\btoday\b|\bright now\b|\btoday's\b/.test(
      text,
    )
  ) {
    return "TODAY";
  }

  if (/\byesterday\b/.test(text)) {
    return "YESTERDAY";
  }

  if (/\bthis week\b/.test(text)) {
    return "THIS_WEEK";
  }

  if (/\blast week\b/.test(text)) {
    return "LAST_WEEK";
  }

  if (/\bthis month\b/.test(text)) {
    return "THIS_MONTH";
  }

  if (/\bthis year\b/.test(text)) {
    return "THIS_YEAR";
  }

  if (/\blast month\b/.test(text)) {
    return "LAST_MONTH";
  }

  if (/\blast 30 days\b/.test(text)) {
    return "LAST_30_DAYS";
  }

  if (/\blast 90 days\b/.test(text)) {
    return "LAST_90_DAYS";
  }

  if (
    /\b(upcoming|next|scheduled)\b/.test(
      text,
    )
  ) {
    return "UPCOMING";
  }

  if (
    /\b(current|currently)\b/.test(
      text,
    )
  ) {
    return "CURRENT";
  }

  return "UNKNOWN";
}

/**
 * ============================================================================
 * SELF ATTENDANCE
 * ============================================================================
 */

function isSelfAttendanceQuestion(
  message: string,
): boolean {
  const text = message
    .toLowerCase()
    .trim();

  const self =
    /\b(my|me|mine|myself|i)\b/.test(
      text,
    );

  const attendance =
    /\b(attendance|attendence|check.?in|check.?out|present|absent|late|lateness|working\s+hours?|work\s+hours?|overtime|regularization|regularisation|missing\s+check.?outs?|attendance\s+rate|attendance\s+percentage|attendance\s+status)\b/.test(text);

  return self && attendance;
}

/**
 * ============================================================================
 * OVERALL SELF SUMMARY
 * ============================================================================
 */

function isOverallSelfSummary(
  message: string,
): boolean {
  const text = message
    .toLowerCase()
    .trim();

  const self =
    /\b(my|me|mine|myself|i)\b/.test(
      text,
    );

  const summary =
    /\b(overall|complete|full|entire|summary|summarize|work\s+status|overall\s+status|complete\s+status|full\s+status|hrms\s+summary|work\s+summary|current\s+status|current\s+work|how\s+am\s+i\s+doing|how\s+am\s+i\s+performing)\b/.test(text);

  return self && summary;
}

/**
 * ============================================================================
 * SELF EMPLOYEE LOOKUP
 * ============================================================================
 */

function isSelfEmployeeLookupQuestion(
  message: string,
): boolean {
  const text =
    message.toLowerCase();

  const self =
    /\b(my|me|mine|myself|i)\b/.test(
      text,
    );

  const employeeField =
    /\b(employee\s*(id|code|number)|staff\s*(id|code|number)|designation|job\s+title|department|manager|reporting\s+manager|work\s+location|office\s+location|employment\s+type|joining\s+date|date\s+of\s+joining|skills?)\b/.test(text);

  return self && employeeField;
}

/**
 * ============================================================================
 * MANAGER LOOKUP
 * ============================================================================
 */

function extractManagerLookupEmployeeName(
  message: string,
): string | null {
  const patterns = [
    /\bwho\s+does\s+(.+?)\s+report\s+to\s*\??$/i,

    /\bwho\s+is\s+(.+?)['’]s\s+(?:manager|reporting\s+manager)\s*\??$/i,

    /\bwhat\s+is\s+(.+?)['’]s\s+(?:manager|reporting\s+manager)\s*\??$/i,

    /\b(?:manager|reporting\s+manager)\s+(?:of|for)\s+(.+?)\s*\??$/i,

    /\bwho\s+manages\s+(.+?)\s*\??$/i,
    /\bwho\s+works\s+under\s+(.+?)\s*\??$/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return match[1]
        .trim()
        .replace(/\s+/g, " ");
    }
  }

  return null;
}

/**
 * ============================================================================
 * NAMED EMPLOYEE EXTRACTION
 * ============================================================================
 */

function extractNamedEmployee(
  message: string,
): string | null {
  const text = message
    .replace(/[?!.:,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const managerName =
    extractManagerLookupEmployeeName(
      message,
    );

  if (managerName) {
    return managerName;
  }

  /**
   * Natural-language department/team questions:
   *
   * "Which department does Geetha Balachandran belong to?"
   * "Which team does Damodar belong to?"
   * "What department does Geetha work in?"
   */
  const belongTo = text.match(
    /\b(?:which|what)\s+(?:department|team)\s+(?:does|do)\s+(.+?)\s+(?:belong\s+to|work\s+in|work\s+for)\b/i,
  );

  if (belongTo?.[1]) {
    return belongTo[1]
      .trim()
      .replace(/\s+/g, " ");
  }

  /**
   * "Which department is Geetha Balachandran in?"
   * "Which team is Damodar part of?"
   */
  const whichIs = text.match(
    /\bwhich\s+(?:department|team)\s+(?:is|are)\s+(.+?)\s+(?:in|part\s+of)\b/i,
  );

  if (whichIs?.[1]) {
    return whichIs[1]
      .trim()
      .replace(/\s+/g, " ");
  }

  /**
   * Possessive:
   *
   * "Meghana's designation"
   * "Meghana Sahithi's attendance"
   */

  const possessive = text.match(
    /\b([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,4})['’]s\s+(?:designation|department|manager|reporting\s+manager|employee\s*(?:id|code|number)|attendance|leave|performance|goals?|calendar|payroll|salary|payslip|documents?|tickets?|status|profile|details|skills?)\b/i,
  );

  if (possessive?.[1]) {
    return possessive[1].trim();
  }

  /**
   * "attendance of Meghana"
   * "performance for Meghana"
   */

  const ofFor = text.match(
    /\b(?:of|for)\s+([A-Za-z][A-Za-z0-9_.'-]*(?:\s+[A-Za-z][A-Za-z0-9_.'-]*){0,4})\s*$/i,
  );

  if (ofFor?.[1]) {
    const value = ofFor[1]
      .replace(
        /\b(my|me|mine|myself)\b/gi,
        "",
      )
      .trim();

    return value || null;
  }

  // Common short forms such as "designation Sreekanth" or
  // "Sreekanth Dyapa designation". These are intentionally conservative so
  // that normal self questions are not turned into named-employee requests.
  const fieldFirst = text.match(
    /\b(?:designation|department|manager|attendance|leave|performance|goals?|calendar|payroll|salary|payslip|documents?|tickets?|status|profile|skills?)\s+(?:of|for)?\s+([A-Za-z][A-Za-z0-9_.'-]*(?:\s+[A-Za-z][A-Za-z0-9_.'-]*){0,4})\s*$/i,
  );

  if (fieldFirst?.[1]) {
    return fieldFirst[1].trim();
  }

  const nameFirst = text.match(
    /^([A-Za-z][A-Za-z0-9_.'-]*(?:\s+[A-Za-z][A-Za-z0-9_.'-]*){0,4})\s+(?:designation|department|manager|attendance|leave|performance|goals?|calendar|payroll|salary|payslip|documents?|tickets?|status|profile|skills?)\s*$/i,
  );

  if (nameFirst?.[1]) {
    return nameFirst[1].trim();
  }

  return null;
}

/**
 * ============================================================================
 * REQUESTED EMPLOYEE FIELD
 * ============================================================================
 */

function detectRequestedEmployeeFields(
  message: string,
): string[] {
  const text = message.toLowerCase();
  const fields: string[] = [];

  if (/\b(?:employee\s*(?:id|code|number)|staff\s*(?:id|code|number))\b/.test(text)) fields.push("employeeCode");
  if (/\b(?:designation|job\s+title|job\s+role)\b/.test(text)) fields.push("designation");
  if (/\bdepartment\b/.test(text)) fields.push("department");
  if (/\b(?:manager|reporting\s+manager)\b/.test(text)) fields.push("manager");
  if (/\b(?:work\s+location|office\s+location)\b/.test(text)) fields.push("workLocation");
  if (/\bemployment\s+type\b/.test(text)) fields.push("employmentType");
  if (/\b(?:joining\s+date|date\s+of\s+joining)\b/.test(text)) fields.push("dateOfJoining");
  if (/\bstatus\b/.test(text)) fields.push("status");
  if (/\bskills?\b/.test(text)) fields.push("skills");

  return fields.length ? Array.from(new Set(fields)).slice(0, 15) : ["profile"];
}


/**
 * ============================================================================
 * DOMAIN DETECTION
 * ============================================================================
 */

function detectDomains(
  message: string,
): HrCopilotPlan["domains"] {
  const text =
    message.toLowerCase();

  const domains =
    new Set<HrCopilotPlan["domains"][number]>();

  if (
    /\b(?:employee|employees|staff|designation|department|manager|profile|employee\s+id|employee\s+code)\b/.test(text)
  ) {
    domains.add("EMPLOYEE");
  }

  if (
    /\b(?:attendance|attendence|check.?in|check.?out|present|absent|late|lateness|working\s+hours?|work\s+hours?|overtime|regularization|regularisation|missing\s+check.?outs?|attendance\s+rate|attendance\s+percentage)\b/.test(text)
  ) {
    domains.add("ATTENDANCE");
  }

  if (/\b(?:leave|leaves|holiday|holidays|time\s+off|pto|vacation|leave\s+balance|leave\s+request)\b/.test(text)) {
    domains.add("LEAVE");
  }

  if (/\b(?:performance|review|reviews|rating|ratings|appraisal|feedback|career|career\s+development|skill\s+gap)\b/.test(text)) {
    domains.add("PERFORMANCE");
  }

  if (/\b(?:goal|goals|objective|objectives|okr|kpi|milestone)\b/.test(text)) {
    domains.add("GOALS");
  }

  if (/\b(?:calendar|meeting|meetings|schedule|scheduled|event|events|appointment|appointments)\b/.test(text)) {
    domains.add("CALENDAR");
  }

  if (/\b(?:payroll|salary|salaries|payslip|pay\s+slip|compensation|earnings|deductions?|net\s+pay|gross\s+pay|ctc)\b/.test(text)) {
    domains.add("PAYROLL");
  }

  if (/\b(?:document|documents|certificate|certificates|expiry|expired|expiring|compliance|missing\s+documents?)\b/.test(text)) {
    domains.add("DOCUMENTS");
  }

  if (/\b(?:ticket|tickets|support|helpdesk|help\s+desk|issue|issues|incident|incidents)\b/.test(text)) {
    domains.add("TICKETS");
  }

  if (/\b(?:announcement|announcements|notice|notices|internal\s+news|broadcast|broadcasts)\b/.test(text)) {
    domains.add("ANNOUNCEMENTS");
  }

  if (/\b(?:recruitment|recruiting|recruiter|job\s+opening|job\s+openings|job\s+posting|job\s+postings|open\s+roles|vacancies|candidates|applicants|interviews?)\b/.test(text)) {
    domains.add("RECRUITMENT");
  }

  if (/\b(?:organization|organisation|organizational|organisational|org\s+chart|organization\s+chart|reporting\s+structure|reports\s+to|who\s+reports|works\s+under|direct\s+reports|indirect\s+reports|team\s+structure|hierarchy|list\s+of\s+employees|all\s+employees)\b/.test(text)) {
    domains.add("ORGANIZATION");
  }

  if (/\b(?:report|reports|reporting|workforce|headcount|head\s+count|hr\s+metrics|analytics|analysis|statistics|trends?)\b/.test(text)) {
    domains.add("REPORTS");
  }

  if (/\b(?:dashboard|dashboard\s+metrics?|dashboard\s+statistics?|kpi|key\s+performance\s+indicators?)\b/.test(text)) {
    domains.add("DASHBOARD");
  }

  /**
   * Never return an empty domain list because the schema requires
   * at least one domain.
   *
   * EMPLOYEE is used only as the generic HR domain.
   */
  if (domains.size === 0) {
    domains.add("EMPLOYEE");
  }

  return Array.from(domains);
}

/**
 * ============================================================================
 * FALLBACK PLAN
 * ============================================================================
 *
 * This is NOT the normal route.
 *
 * Groq is called first.
 *
 * The fallback is used only when generateOrganizationAI cannot produce a
 * valid plan.
 */
function buildFallbackHrCopilotPlan(
  input: BuildHrCopilotPlanInput,
): HrCopilotPlan {
  const message =
    input.message.trim();

  /**
   * 1. Overall self summary
   */
  if (isOverallSelfSummary(message)) {
    return {
      task: "SUMMARY",
      scope: "SELF",

      domains: [
        ...CROSS_MODULE_SELF_DOMAINS,
      ],

      targetEmployeeName: null,

      timeRange: "CURRENT",

      conditions: [
        "CROSS_MODULE",
        "SELF_SUMMARY",
      ],

      requestedFields: [
        "employee profile",
        "attendance",
        "leave",
        "performance",
        "goals",
        "calendar",
        "payroll",
        "documents",
        "tickets",
        "announcements",
      ],

      reasoning:
        "The user requested an overall cross-module summary of their HRMS status.",
    };
  }

  /**
   * 2. Self attendance
   */
  if (
    isSelfAttendanceQuestion(
      message,
    )
  ) {
    const range =
      detectTimeRange(message);

    return {
      task: "STATUS",
      scope: "SELF",

      domains: ["ATTENDANCE"],

      targetEmployeeName: null,

      timeRange:
        range === "UNKNOWN"
          ? "CURRENT"
          : range,

      conditions: [
        "SELF_ATTENDANCE",
      ],

      requestedFields: [
        "attendance status",
        "attendance summary",
        "check-in",
        "check-out",
        "missing check-outs",
        "work hours",
      ],

      reasoning:
        "The user is asking about their own attendance.",
    };
  }

  /**
   * 3. Manager lookup
   */
  const managerName =
    extractManagerLookupEmployeeName(
      message,
    );

  if (managerName) {
    return {
      task: "LOOKUP",
      scope: "EMPLOYEE",

      domains: [
        "ORGANIZATION",
        "EMPLOYEE",
      ],

      targetEmployeeName:
        managerName,

      timeRange: "CURRENT",

      conditions: [
        "MANAGER_LOOKUP",
      ],

      requestedFields: [
        "employee name",
        "manager",
      ],

      reasoning:
        "The user is asking for an employee's reporting manager.",
    };
  }

  /**
   * 4. Named employee
   */
  const namedEmployee =
    extractNamedEmployee(message) ??
    extractConversationEmployeeName(input);

  if (
    namedEmployee &&
    !/\b(my|me|mine|myself)\b/i.test(
      namedEmployee,
    )
  ) {
    return {
      task: "LOOKUP",
      scope: "EMPLOYEE",

      domains:
        detectDomains(message),

      targetEmployeeName:
        namedEmployee,

      timeRange:
        detectTimeRange(message),

      conditions: [
        "NAMED_EMPLOYEE",
      ],

      requestedFields:
        detectRequestedEmployeeFields(message),

      reasoning:
        "The user is asking about a specific employee.",
    };
  }

  /**
   * 5. Self employee lookup
   */
  if (
    isSelfEmployeeLookupQuestion(
      message,
    )
  ) {
    return {
      task: "LOOKUP",
      scope: "SELF",

      domains: ["EMPLOYEE"],

      targetEmployeeName: null,

      timeRange: "CURRENT",

      conditions: [
        "SELF_EMPLOYEE_LOOKUP",
      ],

      requestedFields:
        detectRequestedEmployeeFields(message),

      reasoning:
        "The user is asking for their own employee information.",
    };
  }

  /**
   * 6. My team
   */
  if (
    /\bmy\s+team\b/i.test(message)
  ) {
    return {
      task: "SUMMARY",
      scope: "MY_TEAM",

      domains: [
        "ORGANIZATION",
        ...detectDomains(message),
      ].filter(
        (value, index, array) =>
          array.indexOf(value) === index,
      ) as HrCopilotPlan["domains"],

      targetEmployeeName: null,

      timeRange:
        detectTimeRange(message),

      conditions: [
        "MY_TEAM",
      ],

      requestedFields: [],

      reasoning:
        "The user is asking about their own team.",
    };
  }

  /**
   * 6.5 Organization
   */
  if (
    /\b(?:organization|organisation|org\s+chart|entire\s+company|whole\s+company|all\s+employees|list\s+of\s+employees|headcount)\b/i.test(message)
  ) {
    return {
      task: "SUMMARY",
      scope: "ORGANIZATION",
      domains: ["ORGANIZATION", ...detectDomains(message)].filter((value, index, array) => array.indexOf(value) === index) as HrCopilotPlan["domains"],
      targetEmployeeName: null,
      timeRange: detectTimeRange(message),
      conditions: ["ORGANIZATION_WIDE"],
      requestedFields: [],
      reasoning: "The user is asking for organization-wide information.",
    };
  }

  /**
   * 7. General request
   */
  return {
    task: "GENERAL",
    scope: "UNKNOWN",

    domains:
      detectDomains(message),

    targetEmployeeName: null,

    timeRange:
      detectTimeRange(message),

    conditions: [],

    requestedFields: [],

    reasoning:
      "The request requires general HRMS understanding.",
  };
}

/**
 * ============================================================================
 * GROQ OUTPUT NORMALIZATION
 * ============================================================================
 *
 * Groq remains PRIMARY.
 *
 * These rules only protect obvious user intent when the model returns an
 * imperfect but schema-valid plan.
 */
function extractConversationEmployeeName(
  input: BuildHrCopilotPlanInput,
): string | null {
  const text = input.message.toLowerCase();
  const needsContext = /\b(?:he|she|they|him|her|them|his|hers|their|that\s+employee|that\s+person|same\s+employee)\b/i.test(text);
  if (!needsContext) return null;

  for (const message of [...(input.conversation ?? [])].reverse()) {
    if (message.role !== "user") continue;
    const candidate = extractNamedEmployee(message.content);
    if (candidate && !/\b(?:my|me|mine|myself)\b/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeAiPlan(
  input: BuildHrCopilotPlanInput,
  aiPlan: HrCopilotPlan,
): HrCopilotPlan {
  const message =
    input.message.trim();

  /**
   * 1. Overall self summary
   */
  if (
    isOverallSelfSummary(message)
  ) {
    return {
      ...aiPlan,

      task: "SUMMARY",

      scope: "SELF",

      domains: [
        ...CROSS_MODULE_SELF_DOMAINS,
      ],

      targetEmployeeName: null,

      timeRange: "CURRENT",

      conditions:
        Array.from(
          new Set([
            ...(aiPlan.conditions ??
              []),
            "CROSS_MODULE",
            "SELF_SUMMARY",
          ]),
        ).slice(0, 10),

      requestedFields: [
        "employee profile",
        "attendance",
        "leave",
        "performance",
        "goals",
        "calendar",
        "payroll",
        "documents",
        "tickets",
        "announcements",
      ],
    };
  }

  /**
   * 2. Attendance before employee lookup
   */
  if (
    isSelfAttendanceQuestion(
      message,
    )
  ) {
    const detectedRange =
      detectTimeRange(message);

    return {
      ...aiPlan,

      task: "STATUS",

      scope: "SELF",

      domains: ["ATTENDANCE"],

      targetEmployeeName: null,

      timeRange:
        detectedRange === "UNKNOWN"
          ? "CURRENT"
          : detectedRange,

      conditions:
        Array.from(
          new Set([
            ...(aiPlan.conditions ??
              []),
            "SELF_ATTENDANCE",
          ]),
        ).slice(0, 10),

      requestedFields: [
        "attendance status",
        "attendance summary",
        "check-in",
        "check-out",
        "missing check-outs",
        "work hours",
      ],
    };
  }

  /**
   * 3. Manager lookup
   */
  const managerName =
    extractManagerLookupEmployeeName(
      message,
    );

  if (managerName) {
    return {
      ...aiPlan,

      task: "LOOKUP",

      scope: "EMPLOYEE",

      domains: [
        "ORGANIZATION",
        "EMPLOYEE",
      ],

      targetEmployeeName:
        managerName,

      timeRange: "CURRENT",

      conditions:
        Array.from(
          new Set([
            ...(aiPlan.conditions ??
              []),
            "MANAGER_LOOKUP",
          ]),
        ).slice(0, 10),

      requestedFields: [
        "employee name",
        "manager",
      ],
    };
  }

  /**
   * 4. Explicit named employee
   */
  const namedEmployee =
    extractNamedEmployee(message) ??
    extractConversationEmployeeName(input);

  if (
    namedEmployee &&
    !/\b(my|me|mine|myself)\b/i.test(
      namedEmployee,
    )
  ) {
    const detectedDomains =
      detectDomains(message);

    return {
      ...aiPlan,

      task:
        aiPlan.task === "GENERAL"
          ? "LOOKUP"
          : aiPlan.task,

      scope: "EMPLOYEE",

      domains: detectedDomains,

      targetEmployeeName:
        namedEmployee,

      timeRange:
        detectTimeRange(message),

      conditions:
        Array.from(
          new Set([
            ...(aiPlan.conditions ??
              []),
            "NAMED_EMPLOYEE",
          ]),
        ).slice(0, 10),

      requestedFields:
        detectRequestedEmployeeFields(message),
    };
  }

  /**
   * 5. Self employee lookup
   */
  if (
    isSelfEmployeeLookupQuestion(
      message,
    )
  ) {
    return {
      ...aiPlan,

      task: "LOOKUP",

      scope: "SELF",

      domains: ["EMPLOYEE"],

      targetEmployeeName: null,

      timeRange: "CURRENT",

      conditions:
        Array.from(
          new Set([
            ...(aiPlan.conditions ??
              []),
            "SELF_EMPLOYEE_LOOKUP",
          ]),
        ).slice(0, 10),

      requestedFields:
        detectRequestedEmployeeFields(message),
    };
  }

  /**
   * 6. My team
   */
  if (
    /\bmy\s+team\b/i.test(
      message,
    )
  ) {
    const domains = [
      "ORGANIZATION",
      ...aiPlan.domains,
    ].filter(
      (value, index, array) =>
        array.indexOf(value) === index,
    ) as HrCopilotPlan["domains"];

    return {
      ...aiPlan,

      scope: "MY_TEAM",

      domains: domains.slice(
        0,
        13,
      ),

      targetEmployeeName: null,

      conditions:
        Array.from(
          new Set([
            ...(aiPlan.conditions ??
              []),
            "MY_TEAM",
          ]),
        ).slice(0, 10),
    };
  }

  /**
   * 7. Explicit organization request
   */
  if (
    /\b(organization|organization-wide|company-wide|entire\s+company|whole\s+company|workforce|headcount|all\s+employees|overall\s+attendance)\b/i.test(message)
  ) {
    const domains = [
      "ORGANIZATION",
      "REPORTS",
      ...( /\b(attendance|attendence|present|absent|late|check.?in|check.?out|attendance\s+(?:rate|percentage))\b/i.test(message)
        ? ["ATTENDANCE"]
        : []),
      ...aiPlan.domains,
    ].filter(
      (value, index, array) =>
        array.indexOf(value) === index,
    ) as HrCopilotPlan["domains"];

    return {
      ...aiPlan,

      scope: "ORGANIZATION",

      domains: domains.slice(
        0,
        13,
      ),
    };
  }

  return aiPlan;
}

/**
 * ============================================================================
 * BUILD PLAN
 * ============================================================================
 *
 * GROQ IS ALWAYS THE PRIMARY ROUTE.
 *
 * We intentionally do NOT bypass Groq for simple questions.
 *
 * If Groq fails, generateOrganizationAI() uses the deterministic fallback.
 */
export async function buildHrCopilotPlan(
  input: BuildHrCopilotPlanInput,
): Promise<HrCopilotPlan> {
  const fallback =
    buildFallbackHrCopilotPlan(
      input,
    );

  /**
   * Groq planner prompt.
   *
   * The prompt contains:
   * - current user request
   * - authenticated user context
   * - current page context
   * - heuristic classification
   */
  const systemPrompt =
    `${HR_COPILOT_PLANNER_PROMPT}\n\n${buildHrCopilotPlannerUserPrompt(
      input.message,
      {
        user: input.user,
        pageContext: input.page,
      } as any,
      input.conversation,
    )}`;

  /**
   * IMPORTANT:
   *
   * Groq is the normal path.
   *
   * generateOrganizationAI handles:
   * - missing API key
   * - Groq errors
   * - rate limits
   * - timeout
   * - malformed JSON
   * - schema validation failure
   *
   * and returns the deterministic fallback.
   */
  const result =
    await generateOrganizationAI(
      systemPrompt,
      hrCopilotPlanSchema,
      fallback,
      {
        userMessage:
          input.message,

        temperature: 0,

        maxTokens: 1200,

        timeoutMs: 12000,
      },
    );

  /**
   * Groq result is still normalized only for obvious intent corrections.
   */
  return normalizeAiPlan(
    input,
    result,
  );
}