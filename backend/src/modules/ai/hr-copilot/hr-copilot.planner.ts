import { z } from "zod";

import { generateOrganizationAI } from "@/services/ai.service";

import {
  HrCopilotPageContext,
  HrCopilotUserContext,
} from "./hr-copilot.types";

import { buildHrCopilotPlannerPrompt } from "./hr-copilot.planner.prompts";

/**
 * ============================================================================
 * PLANNER SCHEMA
 * ============================================================================
 *
 * The planner only understands the user's request.
 * It does NOT access the database.
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
      ]),
    )
    .min(1)
    .max(8),

  targetEmployeeName: z.string().nullable(),

  timeRange: z.enum([
    "TODAY",
    "THIS_WEEK",
    "THIS_MONTH",
    "THIS_YEAR",
    "LAST_MONTH",
    "LAST_30_DAYS",
    "LAST_90_DAYS",
    "UPCOMING",
    "CURRENT",
    "UNKNOWN",
  ]),

  conditions: z.array(z.string()).max(8),

  requestedFields: z.array(z.string()).max(12),

  reasoning: z.string().max(500),
});

export type HrCopilotPlan = z.infer<typeof hrCopilotPlanSchema>;

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
 * CONSTANTS
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
];

const CROSS_MODULE_EMPLOYEE_DOMAINS: HrCopilotPlan["domains"] = [
  "EMPLOYEE",
  "ATTENDANCE",
  "LEAVE",
  "PERFORMANCE",
  "GOALS",
  "CALENDAR",
  "PAYROLL",
  "DOCUMENTS",
];

/**
 * ============================================================================
 * EMPLOYEE FIELD DETECTION
 * ============================================================================
 */

function detectRequestedEmployeeField(
  message: string,
): string {
  const text = message.toLowerCase();

  if (
    /\b(employee\s*code|employee\s*id|employee\s*number|staff\s*id|staff\s*code)\b/.test(
      text,
    )
  ) {
    return "employeeCode";
  }

  if (/\bdesignation\b|\bjob title\b|\bjob role\b/.test(text)) {
    return "designation";
  }

  if (/\bdepartment\b/.test(text)) {
    return "department";
  }

  if (
    /\bmanager\b|\breporting manager\b|\breports to\b/.test(
      text,
    )
  ) {
    return "manager";
  }

  if (
    /\bwork location\b|\boffice location\b|\blocation\b/.test(
      text,
    )
  ) {
    return "workLocation";
  }

  if (/\bemployment type\b/.test(text)) {
    return "employmentType";
  }

  if (/\bstatus\b/.test(text)) {
    return "status";
  }

  if (
    /\bjoining date\b|\bdate of joining\b|\bjoined\b/.test(
      text,
    )
  ) {
    return "dateOfJoining";
  }

  if (/\bskills?\b|\bskill set\b/.test(text)) {
    return "skills";
  }

  return "profile";
}

/**
 * ============================================================================
 * EMPLOYEE NAME EXTRACTION
 * ============================================================================
 */

function cleanExtractedName(
  value: string,
): string {
  return value
    .trim()
    .replace(/[?.!,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmployeeNameFromMessage(
  message: string,
): string | null {
  const text = message.trim();

  const patterns = [
    /**
     * What is the designation of Naga Chandana Sakala?
     */
    /\bwhat\s+(?:is|are)\s+(?:the\s+)?(?:designation|department|employee\s*code|employee\s*id|employee\s*number|manager|work\s*location|employment\s*type|status|joining\s*date|date\s*of\s*joining)\s+(?:of|for)\s+(.+?)[?.!]*$/i,

    /**
     * What is Naga Chandana Sakala's designation?
     */
    /\bwhat\s+(?:is|are)\s+(.+?)['’]s\s+(?:designation|department|employee\s*code|employee\s*id|employee\s*number|manager|work\s*location|employment\s*type|status|joining\s*date|date\s*of\s*joining)[?.!]*$/i,

    /**
     * Tell me about Naga Chandana Sakala.
     */
    /\b(?:tell|show)\s+me\s+(?:about\s+)?(.+?)(?:'s)?\s+(?:profile|details|information)[?.!]*$/i,

    /**
     * Give me Naga Chandana Sakala's profile.
     */
    /\b(?:give|show)\s+(?:me\s+)?(.+?)['’]s\s+(?:profile|details|information)[?.!]*$/i,

    /**
     * What is the designation for Naga Chandana Sakala?
     */
    /\b(?:designation|department|employee\s*code|employee\s*id|manager|work\s*location|employment\s*type|status)\s+(?:of|for)\s+(.+?)[?.!]*$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      const candidate = cleanExtractedName(
        match[1],
      );

      if (
        candidate &&
        !/^(my|me|mine|myself|my team|our team)$/i.test(
          candidate,
        )
      ) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * ============================================================================
 * REPORTING / TEAM NAME EXTRACTION
 * ============================================================================
 */

function extractReportingEmployeeName(
  message: string,
): string | null {
  const patterns = [
    /\bwho\s+will\s+report\s+to\s+(.+?)[?.!]*$/i,

    /\bwho\s+reports?\s+to\s+(.+?)[?.!]*$/i,

    /\bwho\s+is\s+reporting\s+to\s+(.+?)[?.!]*$/i,

    /\bwho\s+reports?\s+directly\s+to\s+(.+?)[?.!]*$/i,

    /\bwho\s+is\s+under\s+(.+?)[?.!]*$/i,

    /\bwho\s+are\s+(.+?)['’]s\s+(?:team|direct\s+reports?)[?.!]*$/i,

    /\b(?:show|list)\s+(.+?)['’]s\s+(?:team|direct\s+reports?)[?.!]*$/i,

    /\b(?:show|list)\s+(?:the\s+)?(?:employees|people|members|team)\s+(?:under|reporting\s+to)\s+(.+?)[?.!]*$/i,

    /\b(?:employees|people|team\s+members?)\s+(?:under|reporting\s+to)\s+(.+?)[?.!]*$/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      const candidate = cleanExtractedName(
        match[1],
      );

      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * ============================================================================
 * SELF SUMMARY DETECTION
 * ============================================================================
 */

function isOverallSelfSummary(
  message: string,
): boolean {
  const text = message.toLowerCase();

  const selfWords =
    /\b(my|me|mine|myself|i)\b/.test(text);

  const summaryWords =
    /\b(overall|complete|full|entire|summary|overview|work status|employee status|hr status|current status|how am i doing|how am i|my status)\b/.test(
      text,
    );

  return selfWords && summaryWords;
}

/**
 * ============================================================================
 * EMPLOYEE SUMMARY DETECTION
 * ============================================================================
 */

function isEmployeeSummary(
  message: string,
): boolean {
  const text = message.toLowerCase();

  return (
    /\b(overall|complete|full|entire|summary|overview)\b/.test(
      text,
    ) &&
    extractEmployeeNameFromMessage(message) !== null
  );
}

/**
 * ============================================================================
 * DOMAIN DETECTION
 * ============================================================================
 */

function detectDomains(
  message: string,
): HrCopilotPlan["domains"] {
  const text = message.toLowerCase();

  const domains: HrCopilotPlan["domains"] = [];

  const add = (
    domain: HrCopilotPlan["domains"][number],
  ) => {
    if (!domains.includes(domain)) {
      domains.push(domain);
    }
  };

  if (
    /\b(attendance|absent|absence|late|lateness|check.?in|check.?out|working hours|overtime|regularization)\b/.test(
      text,
    )
  ) {
    add("ATTENDANCE");
  }

  if (
    /\b(leave|holiday|time off|comp.?off|leave balance|leave request)\b/.test(
      text,
    )
  ) {
    add("LEAVE");
  }

  if (
    /\b(performance|rating|review|feedback|scorecard|pip|development)\b/.test(
      text,
    )
  ) {
    add("PERFORMANCE");
  }

  if (
    /\b(goal|goals|progress|target|achievement|objective)\b/.test(
      text,
    )
  ) {
    add("GOALS");
  }

  if (
    /\b(payroll|salary|payslip|payslip|ctc|compensation|deduction|net pay|gross pay)\b/.test(
      text,
    )
  ) {
    add("PAYROLL");
  }

  if (
    /\b(document|documents|certificate|offer letter|appointment letter|expiry|compliance)\b/.test(
      text,
    )
  ) {
    add("DOCUMENTS");
  }

  if (
    /\b(calendar|meeting|schedule|event|appointment|upcoming)\b/.test(
      text,
    )
  ) {
    add("CALENDAR");
  }

  if (
    /\b(ticket|tickets|helpdesk|support)\b/.test(
      text,
    )
  ) {
    add("TICKETS");
  }

  if (
    /\b(announcement|announcements|notice|notices|company update|updates)\b/.test(
      text,
    )
  ) {
    add("ANNOUNCEMENTS");
  }

  if (
    /\b(recruitment|candidate|hiring|job opening|vacancy|applicant|open role)\b/.test(
      text,
    )
  ) {
    add("RECRUITMENT");
  }

  if (
    /\b(employee|profile|designation|department|manager|employee code|employee id|work location)\b/.test(
      text,
    )
  ) {
    add("EMPLOYEE");
  }

  if (
    /\b(organization|org chart|reporting structure|reporting|team hierarchy|direct reports|team members)\b/.test(
      text,
    )
  ) {
    add("ORGANIZATION");
  }

  if (
    /\b(report|reports|analytics|metrics|headcount|attrition|workforce)\b/.test(
      text,
    )
  ) {
    add("REPORTS");
  }

  return domains;
}

/**
 * ============================================================================
 * TASK DETECTION
 * ============================================================================
 */

function detectTask(
  message: string,
): HrCopilotPlan["task"] {
  const text = message.toLowerCase();

  if (
    /\b(summary|overview|overall|complete summary|full summary)\b/.test(
      text,
    )
  ) {
    return "SUMMARY";
  }

  if (
    /\b(compare|compared|versus|vs)\b/.test(
      text,
    )
  ) {
    return "COMPARE";
  }

  if (
    /\b(analy[sz]e|analysis|why|reason)\b/.test(
      text,
    )
  ) {
    return "ANALYZE";
  }

  if (
    /\b(issue|issues|problem|problems|anomal(?:y|ies)|concern|concerns)\b/.test(
      text,
    )
  ) {
    return "IDENTIFY_ISSUES";
  }

  if (
    /\b(how many|count|number of)\b/.test(
      text,
    )
  ) {
    return "COUNT";
  }

  if (
    /\b(who|which|list|show|team members|employees under|people under)\b/.test(
      text,
    )
  ) {
    return "LIST";
  }

  if (
    /\b(status|state|how is|how are)\b/.test(
      text,
    )
  ) {
    return "STATUS";
  }

  if (
    /\b(trend|trending|increasing|decreasing|improving|declining)\b/.test(
      text,
    )
  ) {
    return "TREND";
  }

  if (
    /\b(what is|what's|tell me|show me|give me|find|lookup|look up)\b/.test(
      text,
    )
  ) {
    return "LOOKUP";
  }

  return "GENERAL";
}

/**
 * ============================================================================
 * TIME RANGE
 * ============================================================================
 */

function detectTimeRange(
  message: string,
): HrCopilotPlan["timeRange"] {
  const text = message.toLowerCase();

  if (
    /\b(today|right now)\b/.test(text)
  ) {
    return "TODAY";
  }

  if (
    /\b(current|currently)\b/.test(text)
  ) {
    return "CURRENT";
  }

  if (
    /\bthis week|weekly\b/.test(text)
  ) {
    return "THIS_WEEK";
  }

  if (
    /\bthis month|monthly\b/.test(text)
  ) {
    return "THIS_MONTH";
  }

  if (
    /\bthis year|yearly|annual\b/.test(text)
  ) {
    return "THIS_YEAR";
  }

  if (
    /\blast month\b/.test(text)
  ) {
    return "LAST_MONTH";
  }

  if (
    /\b(last|past) 30 days\b/.test(text)
  ) {
    return "LAST_30_DAYS";
  }

  if (
    /\b(last|past) 90 days\b/.test(text)
  ) {
    return "LAST_90_DAYS";
  }

  if (
    /\b(upcoming|next)\b/.test(text)
  ) {
    return "UPCOMING";
  }

  return "UNKNOWN";
}

/**
 * ============================================================================
 * FALLBACK PLANNER
 * ============================================================================
 */

function isTodayAttendanceStatusQuestion(message: string): boolean {
  const text = message.toLowerCase().trim();

  const attendance = /\b(attendance|attendence|check.?in|check.?out|present|absent)\b/.test(text);
  const status = /\b(status|today|currently|right now|present today|attendance today)\b/.test(text);
  const self = /\b(my|me|mine|myself|i)\b/.test(text);

  return self && attendance && status;
}

export function buildFallbackHrCopilotPlan(
  input: BuildHrCopilotPlanInput,
): HrCopilotPlan {
  const originalMessage =
    input.message.trim();

  const message =
    originalMessage.toLowerCase();

  /**
   * --------------------------------------------------
   * 0. Today's attendance status
   * --------------------------------------------------
   */
  if (isTodayAttendanceStatusQuestion(originalMessage)) {
    return {
      task: "STATUS",
      scope: "SELF",
      domains: ["ATTENDANCE"],
      targetEmployeeName: null,
      timeRange: "TODAY",
      conditions: ["TODAY_ATTENDANCE"],
      requestedFields: [
        "attendance status",
        "check-in",
        "check-out",
        "work hours",
      ],
      reasoning:
        "The user is asking for their attendance status for today.",
    };
  }

  /**
   * --------------------------------------------------
   * 1. Overall self summary
   * --------------------------------------------------
   */
  if (
    isOverallSelfSummary(
      originalMessage,
    )
  ) {
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
      ],
      reasoning:
        "The user is requesting an overall summary of their own HRMS work status.",
    };
  }

  /**
   * --------------------------------------------------
   * 2. Direct-report / organization query
   * --------------------------------------------------
   */
  const reportingEmployeeName =
    extractReportingEmployeeName(
      originalMessage,
    );

  if (reportingEmployeeName) {
    return {
      task: "LIST",
      scope: "EMPLOYEE",
      domains: ["ORGANIZATION"],
      targetEmployeeName:
        reportingEmployeeName,
      timeRange: "CURRENT",
      conditions: [
        "DIRECT_REPORTS",
      ],
      requestedFields: [
        "employee name",
        "employee code",
        "department",
        "designation",
        "work location",
        "status",
      ],
      reasoning:
        "The user is asking for employees who directly report to a specific employee.",
    };
  }

  /**
   * --------------------------------------------------
   * 3. Overall summary of a named employee
   * --------------------------------------------------
   */
  if (
    isEmployeeSummary(
      originalMessage,
    )
  ) {
    const targetEmployeeName =
      extractEmployeeNameFromMessage(
        originalMessage,
      );

    return {
      task: "SUMMARY",
      scope: "EMPLOYEE",
      domains: [
        ...CROSS_MODULE_EMPLOYEE_DOMAINS,
      ],
      targetEmployeeName,
      timeRange: "CURRENT",
      conditions: [
        "CROSS_MODULE",
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
      ],
      reasoning:
        "The user is requesting a cross-module summary for a specific employee.",
    };
  }

  /**
   * --------------------------------------------------
   * 4. Named employee profile lookup
   * --------------------------------------------------
   */
  const employeeQuestionName =
    extractEmployeeNameFromMessage(
      originalMessage,
    );

  if (employeeQuestionName) {
    const requestedField =
      detectRequestedEmployeeField(
        originalMessage,
      );

    const domain =
      requestedField === "profile" ||
      requestedField === "employeeCode" ||
      requestedField === "department" ||
      requestedField === "designation" ||
      requestedField === "manager" ||
      requestedField === "workLocation" ||
      requestedField === "employmentType" ||
      requestedField === "status" ||
      requestedField === "dateOfJoining" ||
      requestedField === "skills"
        ? "EMPLOYEE"
        : null;

    return {
      task: "LOOKUP",
      scope: "EMPLOYEE",
      domains: domain
        ? ["EMPLOYEE"]
        : detectDomains(
            originalMessage,
          ),
      targetEmployeeName:
        employeeQuestionName,
      timeRange: "CURRENT",
      conditions: [],
      requestedFields: [
        requestedField,
      ],
      reasoning:
        "The user is requesting information about a specific employee.",
    };
  }

  /**
   * --------------------------------------------------
   * 5. My team
   * --------------------------------------------------
   */
  if (
    /\b(my team|our team|my direct reports|my teammates|my team members)\b/.test(
      message,
    )
  ) {
    const domains =
      detectDomains(
        originalMessage,
      );

    if (
      domains.length === 0
    ) {
      domains.push(
        "ORGANIZATION",
      );
    }

    return {
      task: message.includes("attendance")
        ? "SUMMARY"
        : "LIST",
      scope: "MY_TEAM",
      domains,
      targetEmployeeName: null,
      timeRange:
        detectTimeRange(
          originalMessage,
        ),
      conditions: [
        "DIRECT_REPORTS",
      ],
      requestedFields: [
        "employee name",
        "employee code",
        "department",
        "designation",
        "status",
      ],
      reasoning:
        "The user is asking about their direct team.",
    };
  }

  /**
   * --------------------------------------------------
   * 6. Generic scope
   * --------------------------------------------------
   */
  let scope: HrCopilotPlan["scope"] =
    "UNKNOWN";

  if (
    /\b(my team|our team|my direct reports|my teammates)\b/.test(
      message,
    )
  ) {
    scope = "MY_TEAM";
  } else if (
    /\b(my|me|mine|myself|i)\b/.test(
      message,
    )
  ) {
    scope = "SELF";
  } else if (
    /\b(department|department-wise|team-wise)\b/.test(
      message,
    )
  ) {
    scope = "DEPARTMENT";
  } else if (
    /\b(company|organization|workforce|all employees|everyone|company-wide)\b/.test(
      message,
    )
  ) {
    scope = "ORGANIZATION";
  }

  let domains =
    detectDomains(
      originalMessage,
    );

  if (
    domains.length === 0
  ) {
    domains = ["EMPLOYEE"];
  }

  /**
   * For a self-summary that wasn't caught
   * above, expand to cross-module data.
   */
  const task =
    detectTask(
      originalMessage,
    );

  if (
    scope === "SELF" &&
    task === "SUMMARY"
  ) {
    domains = [
      ...CROSS_MODULE_SELF_DOMAINS,
    ];
  }

  /**
   * Prevent more than 8 domains.
   */
  domains = domains.slice(0, 8);

  return {
    task,
    scope,
    domains,
    targetEmployeeName: null,
    timeRange:
      detectTimeRange(
        originalMessage,
      ),
    conditions: [],
    requestedFields: [],
    reasoning:
      "Fallback plan generated from the user's request.",
  };
}

/**
 * ============================================================================
 * NORMALIZATION OF AI PLAN
 * ============================================================================
 *
 * Even when Groq succeeds, deterministic HR-specific rules have priority for
 * identity-sensitive employee lookups.
 */
function normalizeAiPlan(
  input: BuildHrCopilotPlanInput,
  aiPlan: HrCopilotPlan,
): HrCopilotPlan {
  const message =
    input.message.trim();

  const selfSummary =
    isOverallSelfSummary(
      message,
    );

  if (selfSummary) {
    return {
      ...aiPlan,
      task: "SUMMARY",
      scope: "SELF",
      domains: [
        ...CROSS_MODULE_SELF_DOMAINS,
      ],
      targetEmployeeName: null,
      timeRange: "CURRENT",
     conditions: Array.from(
    new Set([
    ...(aiPlan.conditions ?? []),
    "CROSS_MODULE",
    "SELF_SUMMARY",
  ]),
).slice(0, 8),
      requestedFields: [
        ...CROSS_MODULE_SELF_DOMAINS,
      ].slice(0, 8),
    };
  }

  if (isTodayAttendanceStatusQuestion(message)) {
    return {
      ...aiPlan,
      task: "STATUS",
      scope: "SELF",
      domains: ["ATTENDANCE"],
      targetEmployeeName: null,
      timeRange: "TODAY",
      conditions: Array.from(
        new Set([
          ...(aiPlan.conditions ?? []),
          "TODAY_ATTENDANCE",
        ]),
      ).slice(0, 8),
      requestedFields: [
        "attendance status",
        "check-in",
        "check-out",
        "work hours",
      ],
    };
  }

  const reportingName =
    extractReportingEmployeeName(
      message,
    );

  if (reportingName) {
    return {
      ...aiPlan,
      task: "LIST",
      scope: "EMPLOYEE",
      domains: ["ORGANIZATION"],
      targetEmployeeName:
        reportingName,
      timeRange: "CURRENT",
      conditions: [
        "DIRECT_REPORTS",
      ],
      requestedFields: [
        "employee name",
        "employee code",
        "department",
        "designation",
        "work location",
        "status",
      ],
    };
  }

  const explicitEmployeeName =
    extractEmployeeNameFromMessage(
      message,
    );

  if (explicitEmployeeName) {
    const requestedField =
      detectRequestedEmployeeField(
        message,
      );

    if (
      isEmployeeSummary(message)
    ) {
      return {
        ...aiPlan,
        task: "SUMMARY",
        scope: "EMPLOYEE",
        domains: [
          ...CROSS_MODULE_EMPLOYEE_DOMAINS,
        ],
        targetEmployeeName:
          explicitEmployeeName,
        timeRange: "CURRENT",
        conditions: [
          ...new Set([
            ...(aiPlan.conditions ?? []),
            "CROSS_MODULE",
          ]).values(),
        ].slice(0, 8),
        requestedFields: [
          "employee profile",
          "attendance",
          "leave",
          "performance",
          "goals",
          "calendar",
          "payroll",
          "documents",
        ],
      };
    }

    return {
      ...aiPlan,
      task: "LOOKUP",
      scope: "EMPLOYEE",
      domains: ["EMPLOYEE"],
      targetEmployeeName:
        explicitEmployeeName,
      timeRange: "CURRENT",
      requestedFields: [
        requestedField,
      ],
    };
  }

  /**
   * Keep the AI plan for normal requests,
   * but guarantee valid domains.
   */
  let domains =
    Array.from(
      new Set(
        aiPlan.domains,
      ),
    );

  if (
    domains.length === 0
  ) {
    domains = ["EMPLOYEE"];
  }

  return {
    ...aiPlan,
    domains:
      domains.slice(0, 8) as HrCopilotPlan["domains"],
    requestedFields:
      Array.from(
        new Set(
          aiPlan.requestedFields ?? [],
        ),
      ).slice(0, 12),
  };
}

/**
 * ============================================================================
 * AI PLANNER
 * ============================================================================
 */

export async function buildHrCopilotPlan(
  input: BuildHrCopilotPlanInput,
): Promise<HrCopilotPlan> {
  const fallback =
    buildFallbackHrCopilotPlan(
      input,
    );

  const systemPrompt =
    buildHrCopilotPlannerPrompt(
      input,
    );

  const result =
    await generateOrganizationAI(
      systemPrompt,
      hrCopilotPlanSchema,
      fallback,
      {
        userMessage:
          input.message,

        temperature: 0.05,

        maxTokens: 700,

        timeoutMs: 8000,
      },
    );

  return normalizeAiPlan(
    input,
    result,
  );
}