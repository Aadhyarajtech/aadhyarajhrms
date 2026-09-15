import {
  Employee,
  LeaveRequest,
  LeaveType,
  LeaveBalance,
  Holiday,
} from "@/db/models";

type LeaveReasonResponse = {
  reason: string;
};

type LeaveConflictEmployee = {
  employeeId: string;
  firstName: string | null;
  lastName: string | null;
  leaveTypeName: string | null;
  status: string;
  startDate: string;
  endDate: string;
  overlappingDays: number;
  overlapStartDate: string;
  overlapEndDate: string;
};

type LeaveConflictResponse = {
  hasConflict: boolean;
  impactLevel: "LOW" | "MEDIUM" | "HIGH";
  affectedEmployees: number;
  affectedDays: number;
  teamAvailability: {
    totalTeamMembers: number;
    availableTeamMembers: number;
    unavailableTeamMembers: number;
    unavailableEmployees: Array<{
      employeeId: string;
      firstName: string | null;
      lastName: string | null;
      leaveTypeName: string | null;
      status: string;
      overlapStartDate: string;
      overlapEndDate: string;
      overlappingDays: number;
    }>;
  };
  approvalRecommendation: "APPROVE" | "REVIEW" | "DO_NOT_APPROVE";
  approvalReasons: string[];
  conflicts: LeaveConflictEmployee[];
  explanation: string;
};
type LeaveApprovalRecommendation =
  | "APPROVE"
  | "REVIEW";

type LeaveApprovalRiskLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

type LeaveApprovalSuggestionResponse = {
  recommendation: LeaveApprovalRecommendation;
  riskScore: number;
  riskLevel: LeaveApprovalRiskLevel;

  leaveBalance: {
    available: number | null;
    requested: number;
    sufficient: boolean | null;
  };

  teamImpact: {
    affectedEmployees: number;
    affectedDays: number;
    impactLevel: "LOW" | "MEDIUM" | "HIGH";
  };

  reasons: string[];
  explanation: string;
};

const GROQ_BASE_URL =
  process.env.GROQ_BASE_URL ||
  "https://api.groq.com/openai/v1";

const GROQ_MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-20b";

const GROQ_TIMEOUT_MS =
  Number(process.env.GROQ_TIMEOUT_MS || 20000);

/* ============================================================
 * LEAVE REASON ASSISTANT
 * ============================================================ */

function buildFallbackReason(input: string): string {
  const cleaned = input.trim();

  if (!cleaned) {
    return "I would like to request leave for a personal reason.";
  }

  return `I would like to request leave ${cleaned
    .replace(/\.$/, "")
    .toLowerCase()}.`;
}

async function callGroq(
  input: string,
): Promise<LeaveReasonResponse> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GROQ_BASE_URL}/chat/completions`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model: GROQ_MODEL,

          messages: [
            {
              role: "system",
              content:
                "You are a professional HRMS leave reason assistant. Convert the employee's short leave reason into a clear, professional and sufficiently detailed leave description suitable for an official leave request. Preserve the exact meaning of the employee's input. Expand the wording naturally when possible, but never invent facts, dates, names, events, medical details, or circumstances that were not provided. The result should normally be 2 to 3 complete sentences and should sound professional and natural. Return only valid JSON.",
            },
            {
              role: "user",
              content: `
Rewrite the following leave reason into a professional and detailed leave description.

Employee reason:
${input}

Rules:
- Preserve the employee's original meaning.
- Expand the wording naturally to make it suitable for an official HRMS leave request.
- Normally provide 2 to 3 complete sentences.
- Clearly explain the purpose of the leave based only on the information provided.
- Do not invent names, dates, locations, events, medical conditions, family details, or any other facts.
- Do not change the reason or add assumptions.
- Use professional workplace language.
- Avoid unnecessary repetition.
- Return only the JSON object.
`,
            },
          ],

          temperature: 0.2,

          max_completion_tokens: 300,

          reasoning_effort: "low",

          response_format: {
            type: "json_schema",

            json_schema: {
              name: "leave_reason",

              strict: true,

              schema: {
                type: "object",

                properties: {
                  reason: {
                    type: "string",
                  },
                },

                required: ["reason"],

                additionalProperties: false,
              },
            },
          },
        }),

        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Groq request failed: ${response.status} ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content =
      data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error(
        "Groq returned an empty response.",
      );
    }

    const parsed = JSON.parse(content) as {
      reason?: unknown;
    };

    if (
      typeof parsed.reason !== "string" ||
      !parsed.reason.trim()
    ) {
      throw new Error(
        "Groq returned an invalid leave reason.",
      );
    }

    return {
      reason: parsed.reason.trim(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate a professional leave description.
 *
 * AI is only used to improve the wording.
 * It does not validate, approve or submit the leave request.
 */
export async function generateLeaveReason(
  input: string,
): Promise<LeaveReasonResponse> {
  const cleaned = input.trim();

  if (!cleaned) {
    throw new Error(
      "Please enter a short leave reason first.",
    );
  }

  if (cleaned.length > 500) {
    throw new Error(
      "Leave reason must not exceed 500 characters.",
    );
  }

  const fallback = {
    reason: buildFallbackReason(cleaned),
  };

  try {
    return await callGroq(cleaned);
  } catch (error) {
    console.error(
      "Leave Reason AI/Groq failed. Using fallback.",
      error,
    );

    return fallback;
  }
}

/* ============================================================
 * LEAVE CONFLICT & TEAM IMPACT
 * ============================================================ */

function daysBetweenInclusive(
  startDate: string,
  endDate: string,
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  return (
    Math.round(
      (end.getTime() - start.getTime()) /
        86_400_000,
    ) + 1
  );
}

function getOverlappingDays(
  requestedStart: string,
  requestedEnd: string,
  existingStart: string,
  existingEnd: string,
): number {
  const start = new Date(
    Math.max(
      new Date(requestedStart).getTime(),
      new Date(existingStart).getTime(),
    ),
  );

  const end = new Date(
    Math.min(
      new Date(requestedEnd).getTime(),
      new Date(existingEnd).getTime(),
    ),
  );

  if (start > end) {
    return 0;
  }

  return daysBetweenInclusive(
    start.toISOString(),
    end.toISOString(),
  );
}

function getOverlapRange(
  requestedStart: string,
  requestedEnd: string,
  leaveStart: string,
  leaveEnd: string,
): {
  overlapStartDate: string;
  overlapEndDate: string;
} {
  const requestedStartTime = new Date(requestedStart).getTime();
  const requestedEndTime = new Date(requestedEnd).getTime();
  const leaveStartTime = new Date(leaveStart).getTime();
  const leaveEndTime = new Date(leaveEnd).getTime();

  const overlapStartTime = Math.max(
    requestedStartTime,
    leaveStartTime,
  );

  const overlapEndTime = Math.min(
    requestedEndTime,
    leaveEndTime,
  );

  return {
    overlapStartDate: new Date(
      overlapStartTime,
    ).toISOString().slice(0, 10),
    overlapEndDate: new Date(
      overlapEndTime,
    ).toISOString().slice(0, 10),
  };
}

function calculateImpactLevel(
  affectedEmployees: number,
  affectedDays: number,
): "LOW" | "MEDIUM" | "HIGH" {
  if (affectedEmployees >= 3 || affectedDays >= 5) {
    return "HIGH";
  }

  if (affectedEmployees >= 2 || affectedDays >= 3) {
    return "MEDIUM";
  }

  if (affectedEmployees >= 1) {
    return "LOW";
  }

  return "LOW";
}

function buildConflictFallback(
  hasConflict: boolean,
  impactLevel: "LOW" | "MEDIUM" | "HIGH",
  affectedEmployees: number,
  affectedDays: number,
): string {
  if (!hasConflict) {
    return "No overlapping leave was found for your team during the selected dates. Team availability appears normal for this period.";
  }

  return `${affectedEmployees} team member${
    affectedEmployees === 1 ? "" : "s"
  } ${
    affectedEmployees === 1 ? "has" : "have"
  } overlapping leave during the selected period, covering ${affectedDays} overlapping day${
    affectedDays === 1 ? "" : "s"
  }. The potential team impact is ${impactLevel.toLowerCase()}. Consider coordinating with your team or manager before submitting the request.`;
}

async function callGroqForConflict(
  data: {
    startDate: string;
    endDate: string;
    affectedEmployees: number;
    affectedDays: number;
    impactLevel: "LOW" | "MEDIUM" | "HIGH";
    conflicts: LeaveConflictEmployee[];
  },
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GROQ_BASE_URL}/chat/completions`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model: GROQ_MODEL,

          messages: [
            {
              role: "system",
              content:
                "You are an HRMS team availability assistant. Explain leave conflicts and potential team impact using only the supplied HRMS data. Do not make approval decisions. Do not invent workload, project deadlines, employee responsibilities, or staffing information. Keep the explanation professional, clear and useful. Return only valid JSON.",
            },
            {
              role: "user",
              content: `
Analyze the following leave conflict information.

Requested leave:
${data.startDate} to ${data.endDate}

Affected team members:
${data.affectedEmployees}

Affected overlapping days:
${data.affectedDays}

Calculated impact level:
${data.impactLevel}

Overlapping leave records:
${JSON.stringify(data.conflicts, null, 2)}

Rules:
- Explain whether there is a meaningful team availability concern.
- Mention the number of affected employees.
- Mention the overlapping days when useful.
- Do not invent project or workload information.
- Do not recommend rejection.
- Do not approve or reject the leave.
- Keep the explanation professional and easy to understand.
- Return only the JSON object.
`,
            },
          ],

          temperature: 0.2,

          max_completion_tokens: 300,

          reasoning_effort: "low",

          response_format: {
            type: "json_schema",

            json_schema: {
              name: "leave_conflict",
              strict: true,

              schema: {
                type: "object",

                properties: {
                  explanation: {
                    type: "string",
                  },
                },

                required: ["explanation"],

                additionalProperties: false,
              },
            },
          },
        }),

        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Groq conflict request failed: ${response.status} ${errorText}`,
      );
    }

    const result = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content =
      result.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error(
        "Groq returned an empty conflict response.",
      );
    }

    const parsed = JSON.parse(content) as {
      explanation?: unknown;
    };

    if (
      typeof parsed.explanation !== "string" ||
      !parsed.explanation.trim()
    ) {
      throw new Error(
        "Groq returned an invalid conflict explanation.",
      );
    }

    return parsed.explanation.trim();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Analyze overlapping team leave.
 *
 * Database calculations determine the actual conflict.
 * Groq is only used to explain the result.
 *
 * This function does not approve, reject or create leave.
 */
export async function analyzeLeaveConflict(input: {
  employeeId: string;
  startDate: string;
  endDate: string;
}): Promise<LeaveConflictResponse> {
  const {
    employeeId,
    startDate,
    endDate,
  } = input;

  if (!employeeId) {
    throw new Error("Employee ID is required.");
  }

  if (!startDate || !endDate) {
    throw new Error(
      "Start date and end date are required.",
    );
  }

  if (
    new Date(startDate).getTime() >
    new Date(endDate).getTime()
  ) {
    throw new Error(
      "Start date cannot be after end date.",
    );
  }

  /*
   * Find the employee making the request.
   */
  const employee = await Employee.findById(employeeId)
    .select("_id managerId departmentId")
    .lean();

  if (!employee) {
    throw new Error("Employee not found.");
  }

  /*
   * Get the employee's team members.
   *
   * Primary relationship: employees with the same manager.
   * If no manager is assigned, fall back to the same department.
   * This keeps conflict detection useful for existing HRMS records
   * where managerId may not be populated.
   */
  const teamConditions: Record<string, any>[] = [];

  if (employee.managerId) {
    teamConditions.push({
      managerId: employee.managerId,
    });
  }

  if (employee.departmentId) {
    teamConditions.push({
      departmentId: employee.departmentId,
    });
  }

  if (!teamConditions.length) {
    return {
      hasConflict: false,
      impactLevel: "LOW",
      affectedEmployees: 0,
      affectedDays: 0,
      teamAvailability: {
        totalTeamMembers: 0,
        availableTeamMembers: 0,
        unavailableTeamMembers: 0,
        unavailableEmployees: [],
      },
      approvalRecommendation: "REVIEW",
      approvalReasons: [
        "Team membership could not be determined from the employee record.",
      ],
      conflicts: [],
      explanation:
        "Team membership could not be determined, so team capacity should be reviewed manually.",
    };
  }

  const teamMembers = await Employee.find({
    $and: [
      { _id: { $ne: employeeId } },
      {
        status: {
          $in: [
            "ACTIVE",
            "ON_PROBATION",
            "ON_LEAVE",
            "NOTICE_PERIOD",
          ],
        },
      },
      { $or: teamConditions },
    ],
  })
    .select("_id firstName lastName managerId departmentId")
    .lean();

  if (teamMembers.length === 0) {
    return {
      hasConflict: false,
      impactLevel: "LOW",
      affectedEmployees: 0,
      affectedDays: 0,
      teamAvailability: {
        totalTeamMembers: 0,
        availableTeamMembers: 0,
        unavailableTeamMembers: 0,
        unavailableEmployees: [],
      },
      approvalRecommendation: "APPROVE",
      approvalReasons: [
        "No other active team members were found for the selected employee.",
      ],
      conflicts: [],
      explanation:
        "No other active team members were found, so no team leave conflict was identified.",
    };
  }

  const teamEmployeeIds = teamMembers.map(
    (member) => member._id,
  );

  /*
   * Find leave requests that overlap the requested period.
   *
   * Both APPROVED and PENDING requests are included.
   * CANCELLED and REJECTED requests are excluded.
   */
  const overlappingRequests =
    await LeaveRequest.find({
      employeeId: {
        $in: teamEmployeeIds,
      },

      status: {
        $in: ["APPROVED", "PENDING"],
      },

      startDate: {
        $lte: endDate,
      },

      endDate: {
        $gte: startDate,
      },
    })
      .sort({
        startDate: 1,
      })
      .lean();

  if (overlappingRequests.length === 0) {
    return {
      hasConflict: false,
      impactLevel: "LOW",
      affectedEmployees: 0,
      affectedDays: 0,
      teamAvailability: {
        totalTeamMembers: teamMembers.length,
        availableTeamMembers: teamMembers.length,
        unavailableTeamMembers: 0,
        unavailableEmployees: [],
      },
      approvalRecommendation: "APPROVE",
      approvalReasons: [
        "No approved or pending leave overlaps the requested dates for the team.",
      ],
      conflicts: [],
      explanation:
        "No approved or pending team leave overlaps the selected dates. Team availability appears normal for this period.",
    };
  }

  const leaveTypeIds = [
    ...new Set(
      overlappingRequests.map(
        (request) => request.leaveTypeId,
      ),
    ),
  ];

  const leaveTypes = await LeaveType.find({
    _id: {
      $in: leaveTypeIds,
    },
  })
    .select("_id name")
    .lean();

  const employeeMap = new Map(
    teamMembers.map((member) => [
      String(member._id),
      member,
    ]),
  );

  const leaveTypeMap = new Map(
    leaveTypes.map((type) => [
      String(type._id),
      type,
    ]),
  );

  const conflicts: LeaveConflictEmployee[] =
    overlappingRequests.map((request) => {
      const member = employeeMap.get(
        String(request.employeeId),
      );

      const leaveType = leaveTypeMap.get(
        String(request.leaveTypeId),
      );

      const overlappingDays =
        getOverlappingDays(
          startDate,
          endDate,
          request.startDate,
          request.endDate,
        );
       const { overlapStartDate, overlapEndDate } = getOverlapRange(
  startDate,
  endDate,
  request.startDate,
  request.endDate,
);

      return {
        employeeId: String(request.employeeId),

        firstName:
          member?.firstName ?? null,

        lastName:
          member?.lastName ?? null,

        leaveTypeName:
          leaveType?.name ?? null,

        status: request.status,

        startDate: request.startDate,

        endDate: request.endDate,

        overlappingDays,
        overlapStartDate,
        overlapEndDate,
      };
    });

  /*
   * Count unique affected employees.
   */
  const affectedEmployeeIds = [
    ...new Set(
      conflicts.map(
        (conflict) => conflict.employeeId,
      ),
    ),
  ];

  const affectedEmployees =
    affectedEmployeeIds.length;

  /*
   * Count unique calendar days affected by
   * at least one team member's leave.
   */
  const affectedDateSet = new Set<string>();

  for (const conflict of conflicts) {
    const overlapStart = new Date(
      Math.max(
        new Date(startDate).getTime(),
        new Date(conflict.startDate).getTime(),
      ),
    );

    const overlapEnd = new Date(
      Math.min(
        new Date(endDate).getTime(),
        new Date(conflict.endDate).getTime(),
      ),
    );

    const cursor = new Date(overlapStart);

    while (cursor <= overlapEnd) {
      affectedDateSet.add(
        cursor.toISOString().slice(0, 10),
      );

      cursor.setUTCDate(
        cursor.getUTCDate() + 1,
      );
    }
  }

  const affectedDays =
    affectedDateSet.size;

  const impactLevel =
    calculateImpactLevel(
      affectedEmployees,
      affectedDays,
    );

  const fallbackExplanation =
    buildConflictFallback(
      true,
      impactLevel,
      affectedEmployees,
      affectedDays,
    );

  let explanation = fallbackExplanation;

  /*
   * Groq explains the deterministic result.
   * If Groq fails, the calculated fallback is returned.
   */
  try {
    explanation =
      await callGroqForConflict({
        startDate,
        endDate,
        affectedEmployees,
        affectedDays,
        impactLevel,
        conflicts,
      });
  } catch (error) {
    console.error(
      "Leave Conflict AI/Groq failed. Using fallback.",
      error,
    );
  }

  const unavailableEmployees = conflicts.map((conflict) => ({
    employeeId: conflict.employeeId,
    firstName: conflict.firstName,
    lastName: conflict.lastName,
    leaveTypeName: conflict.leaveTypeName,
    status: conflict.status,
    overlapStartDate: conflict.overlapStartDate,
    overlapEndDate: conflict.overlapEndDate,
    overlappingDays: conflict.overlappingDays,
  }));

  const unavailableTeamMembers = new Set(
    unavailableEmployees.map((employee) => employee.employeeId),
  ).size;

  const totalTeamMembers = teamMembers.length;
  const availableTeamMembers = Math.max(
    0,
    totalTeamMembers - unavailableTeamMembers,
  );

  let approvalRecommendation:
    | "APPROVE"
    | "REVIEW"
    | "DO_NOT_APPROVE";

  const approvalReasons: string[] = [];

  if (impactLevel === "HIGH") {
    approvalRecommendation = "DO_NOT_APPROVE";
    approvalReasons.push(
      `${unavailableTeamMembers} team member(s) are unavailable during the requested period.`,
      `Team impact is HIGH across ${affectedDays} overlapping day(s).`,
    );
  } else if (impactLevel === "MEDIUM") {
    approvalRecommendation = "REVIEW";
    approvalReasons.push(
      `${unavailableTeamMembers} team member(s) are unavailable during the requested period.`,
      `Team impact is MEDIUM across ${affectedDays} overlapping day(s).`,
    );
  } else {
    approvalRecommendation = "APPROVE";
    approvalReasons.push(
      `${unavailableTeamMembers} team member(s) are unavailable, but the calculated team impact is LOW.`,
    );
  }

  return {
    hasConflict: true,
    impactLevel,
    affectedEmployees,
    affectedDays,
    teamAvailability: {
      totalTeamMembers,
      availableTeamMembers,
      unavailableTeamMembers,
      unavailableEmployees,
    },
    approvalRecommendation,
    approvalReasons,
    conflicts,
    explanation,
  };
}
/* ============================================================
 * AI LEAVE APPROVAL ASSISTANT
 * ============================================================ */

function calculateApprovalRiskScore(data: {
  affectedEmployees: number;
  affectedDays: number;
  requestedDays: number;
  balanceSufficient: boolean | null;
}): number {
  let score = 0;

  /*
   * Team conflict risk
   */
  if (data.affectedEmployees >= 3) {
    score += 45;
  } else if (data.affectedEmployees === 2) {
    score += 30;
  } else if (data.affectedEmployees === 1) {
    score += 15;
  }

  /*
   * Overlapping duration risk
   */
  if (data.affectedDays >= 5) {
    score += 25;
  } else if (data.affectedDays >= 3) {
    score += 15;
  } else if (data.affectedDays >= 1) {
    score += 5;
  }

  /*
   * Requested leave duration
   */
  if (data.requestedDays >= 10) {
    score += 15;
  } else if (data.requestedDays >= 5) {
    score += 10;
  } else if (data.requestedDays >= 3) {
    score += 5;
  }

  /*
   * Leave balance
   *
   * A missing balance is not automatically treated
   * as insufficient. It requires manual review.
   */
  if (data.balanceSufficient === false) {
    score += 30;
  }

  return Math.min(score, 100);
}

function getApprovalRiskLevel(
  riskScore: number,
): LeaveApprovalRiskLevel {
  if (riskScore >= 60) {
    return "HIGH";
  }

  if (riskScore >= 30) {
    return "MEDIUM";
  }

  return "LOW";
}

function buildApprovalFallback(
  recommendation: LeaveApprovalRecommendation,
  riskLevel: LeaveApprovalRiskLevel,
  riskScore: number,
  reasons: string[],
): string {
  const recommendationText =
    recommendation === "APPROVE"
      ? "The available HRMS data supports approval."
      : "The available HRMS data suggests that the request should be reviewed carefully before making a decision.";

  const reasonText = reasons.length
    ? reasons.join(" ")
    : "No significant availability concern was identified.";

  return `${recommendationText} ${reasonText} The calculated leave risk is ${riskScore}/100 (${riskLevel.toLowerCase()} risk).`;
}

async function callGroqForApprovalSuggestion(
  data: {
    employeeName: string;
    leaveTypeName: string;
    startDate: string;
    endDate: string;
    requestedDays: number;
    availableBalance: number | null;
    balanceSufficient: boolean | null;
    affectedEmployees: number;
    affectedDays: number;
    teamImpactLevel: "LOW" | "MEDIUM" | "HIGH";
    riskScore: number;
    riskLevel: LeaveApprovalRiskLevel;
    recommendation: LeaveApprovalRecommendation;
    reasons: string[];
  },
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GROQ_BASE_URL}/chat/completions`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model: GROQ_MODEL,

          messages: [
            {
              role: "system",
              content:
                "You are an HRMS leave approval assistant. Explain an approval recommendation using only the supplied HRMS data. The risk score and recommendation have already been calculated deterministically by the HRMS. Do not change the recommendation or risk score. Do not invent project deadlines, workload, employee responsibilities, staffing requirements, medical information, or other facts. Do not make the final approval or rejection decision. The authorized HR or manager will make the final decision. Return only valid JSON.",
            },
            {
              role: "user",
              content: `
Explain the following leave approval analysis.

Employee:
${data.employeeName}

Leave type:
${data.leaveTypeName}

Requested period:
${data.startDate} to ${data.endDate}

Requested days:
${data.requestedDays}

Available leave balance:
${
  data.availableBalance === null
    ? "Not available"
    : data.availableBalance
}

Balance sufficient:
${
  data.balanceSufficient === null
    ? "Unknown"
    : data.balanceSufficient
}

Affected team employees:
${data.affectedEmployees}

Affected overlapping days:
${data.affectedDays}

Team impact:
${data.teamImpactLevel}

Deterministic risk score:
${data.riskScore}/100

Risk level:
${data.riskLevel}

Deterministic recommendation:
${data.recommendation}

Calculated reasons:
${JSON.stringify(data.reasons)}

Rules:
- Explain the existing recommendation.
- Do not change APPROVE to REVIEW or REVIEW to APPROVE.
- Do not change the risk score.
- Do not invent missing information.
- Do not approve or reject the leave.
- Do not mention information that is not supplied.
- Keep the explanation professional and concise.
- Return only the JSON object.
`,
            },
          ],

          temperature: 0.2,

          max_completion_tokens: 300,

          reasoning_effort: "low",

          response_format: {
            type: "json_schema",

            json_schema: {
              name: "leave_approval",
              strict: true,

              schema: {
                type: "object",

                properties: {
                  explanation: {
                    type: "string",
                  },
                },

                required: ["explanation"],

                additionalProperties: false,
              },
            },
          },
        }),

        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Groq approval request failed: ${response.status} ${errorText}`,
      );
    }

    const result = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content =
      result.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error(
        "Groq returned an empty approval response.",
      );
    }

    const parsed = JSON.parse(content) as {
      explanation?: unknown;
    };

    if (
      typeof parsed.explanation !== "string" ||
      !parsed.explanation.trim()
    ) {
      throw new Error(
        "Groq returned an invalid approval explanation.",
      );
    }

    return parsed.explanation.trim();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Analyze a pending leave request and provide an
 * approval recommendation for authorized reviewers.
 *
 * Database values determine the risk score.
 * Groq only explains the calculated result.
 *
 * This function NEVER approves or rejects a request.
 */
export async function analyzeLeaveApproval(
  input: {
    requestId: string;
    requesterRole:
      | "SUPER_ADMIN"
      | "HR_ADMIN"
      | "MANAGER";
    requesterEmployeeId: string;
  },
): Promise<LeaveApprovalSuggestionResponse> {
  const {
    requestId,
    requesterRole,
    requesterEmployeeId,
  } = input;

  if (!requestId) {
    throw new Error("Leave request ID is required.");
  }

  if (!requesterEmployeeId) {
    throw new Error(
      "Approver employee profile is required.",
    );
  }

  const allowedRoles = [
    "SUPER_ADMIN",
    "HR_ADMIN",
    "MANAGER",
  ];

  if (!allowedRoles.includes(requesterRole)) {
    throw new Error(
      "You are not authorized to use the leave approval assistant.",
    );
  }

  const request = await LeaveRequest.findById(
    requestId,
  )
    .lean();

  if (!request) {
    throw new Error("Leave request not found.");
  }

  if (request.status !== "PENDING") {
    throw new Error(
      "AI approval suggestions are available only for pending leave requests.",
    );
  }

  const employee = await Employee.findById(
    request.employeeId,
  )
    .select(
      "_id firstName lastName managerId",
    )
    .lean();

  if (!employee) {
    throw new Error("Employee not found.");
  }

  /*
   * Managers can only analyze requests from
   * their own direct reports.
   *
   * HR Admin and Super Admin can analyze
   * requests across the organization.
   */
  if (requesterRole === "MANAGER") {
    if (
      String(employee.managerId ?? "") !==
      String(requesterEmployeeId)
    ) {
      throw new Error(
        "You can only analyze leave requests from your direct reports.",
      );
    }
  }

  const leaveType = await LeaveType.findById(
    request.leaveTypeId,
  )
    .select("_id name")
    .lean();

  if (!leaveType) {
    throw new Error("Leave type not found.");
  }

  /*
   * Current leave balance.
   *
   * The existing HRMS stores:
   * allotted + carriedOver - used.
   */
  const requestYear = new Date(
    request.startDate,
  ).getFullYear();

  const balance = await LeaveBalance.findOne({
    employeeId: request.employeeId,
    leaveTypeId: request.leaveTypeId,
    year: requestYear,
  })
    .select("allotted used carriedOver")
    .lean();

  const availableBalance =
    balance
      ? Math.max(
          0,
          balance.allotted +
            balance.carriedOver -
            balance.used,
        )
      : null;

  const balanceSufficient =
    availableBalance === null
      ? null
      : availableBalance >= request.totalDays;

  /*
   * Analyze the employee's team using the
   * same deterministic conflict logic already
   * used by the Leave Conflict feature.
   */
  const conflict =
    await analyzeLeaveConflict({
      employeeId: request.employeeId,
      startDate: request.startDate,
      endDate: request.endDate,
    });

  const reasons: string[] = [];

  if (balanceSufficient === false) {
    reasons.push(
      `The employee has ${availableBalance} leave day(s) available, while ${request.totalDays} day(s) are requested.`,
    );
  } else if (balanceSufficient === true) {
    reasons.push(
      `The employee has sufficient leave balance for the requested ${request.totalDays} day(s).`,
    );
  } else {
    reasons.push(
      "The leave balance could not be determined from the available HRMS data.",
    );
  }

  if (conflict.hasConflict) {
    reasons.push(
      `${conflict.affectedEmployees} team member(s) have overlapping leave covering ${conflict.affectedDays} day(s).`,
    );
  } else {
    reasons.push(
      "No overlapping pending or approved team leave was found.",
    );
  }

  if (request.totalDays >= 5) {
    reasons.push(
      "The requested leave duration is relatively long and should be considered when reviewing team availability.",
    );
  }

  /*
   * Deterministic risk score.
   */
  const riskScore =
    calculateApprovalRiskScore({
      affectedEmployees:
        conflict.affectedEmployees,
      affectedDays:
        conflict.affectedDays,
      requestedDays:
        request.totalDays,
      balanceSufficient,
    });

  const riskLevel =
    getApprovalRiskLevel(riskScore);

  /*
   * We deliberately use only APPROVE / REVIEW.
   *
   * AI must not make a final rejection decision.
   */
  const recommendation =
    riskScore < 40 &&
    balanceSufficient !== false
      ? "APPROVE"
      : "REVIEW";

  const fallbackExplanation =
    buildApprovalFallback(
      recommendation,
      riskLevel,
      riskScore,
      reasons,
    );

  let explanation =
    fallbackExplanation;

  try {
    explanation =
      await callGroqForApprovalSuggestion({
        employeeName:
          `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() ||
          "Employee",

        leaveTypeName:
          leaveType.name,

        startDate:
          request.startDate,

        endDate:
          request.endDate,

        requestedDays:
          request.totalDays,

        availableBalance,

        balanceSufficient,

        affectedEmployees:
          conflict.affectedEmployees,

        affectedDays:
          conflict.affectedDays,

        teamImpactLevel:
          conflict.impactLevel,

        riskScore,

        riskLevel,

        recommendation,

        reasons,
      });
  } catch (error) {
    console.error(
      "Leave Approval AI/Groq failed. Using fallback.",
      error,
    );
  }

  return {
    recommendation,
    riskScore,
    riskLevel,

    leaveBalance: {
      available:
        availableBalance,
      requested:
        request.totalDays,
      sufficient:
        balanceSufficient,
    },

    teamImpact: {
      affectedEmployees:
        conflict.affectedEmployees,
      affectedDays:
        conflict.affectedDays,
      impactLevel:
        conflict.impactLevel,
    },

    reasons,
    explanation,
  };
}

/* ============================================================
 * AI LEAVE ANALYTICS
 * ============================================================ */

type LeaveAnalyticsStatusCounts = {
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
};

type LeaveAnalyticsType = {
  leaveTypeId: string;
  leaveTypeName: string;
  requestCount: number;
  approvedDays: number;
};

type LeaveAnalyticsMonth = {
  month: string;
  requestCount: number;
  approvedDays: number;
};

type LeaveAnalyticsEmployee = {
  employeeId: string;
  firstName: string | null;
  lastName: string | null;
  requestCount: number;
  approvedDays: number;
};

export type LeaveAnalyticsResponse = {
  period: {
    startDate: string;
    endDate: string;
  };
  scope: "ORGANIZATION" | "TEAM" | "EMPLOYEE";
  overview: {
    totalRequests: number;
    approvedRequests: number;
    pendingRequests: number;
    rejectedRequests: number;
    cancelledRequests: number;
    approvedLeaveDays: number;
    averageApprovedLeaveDuration: number;
    approvalRate: number;
  };
  statusCounts: LeaveAnalyticsStatusCounts;
  leaveTypes: LeaveAnalyticsType[];
  monthlyTrend: LeaveAnalyticsMonth[];
  topEmployees: LeaveAnalyticsEmployee[];
  explanation: string;
};

function parseAnalyticsDate(value: string): Date {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date;
}

function formatAnalyticsMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function getInclusiveOverlapDays(
  requestStart: string,
  requestEnd: string,
  periodStart: string,
  periodEnd: string,
): number {
  const requestStartTime = parseAnalyticsDate(requestStart).getTime();
  const requestEndTime = parseAnalyticsDate(requestEnd).getTime();
  const periodStartTime = parseAnalyticsDate(periodStart).getTime();
  const periodEndTime = parseAnalyticsDate(periodEnd).getTime();

  const overlapStart = Math.max(
    requestStartTime,
    periodStartTime,
  );

  const overlapEnd = Math.min(
    requestEndTime,
    periodEndTime,
  );

  if (overlapStart > overlapEnd) {
    return 0;
  }

  return (
    Math.round(
      (overlapEnd - overlapStart) / 86_400_000,
    ) + 1
  );
}

function buildAnalyticsMonthList(
  startDate: string,
  endDate: string,
): string[] {
  const start = parseAnalyticsDate(startDate);
  const end = parseAnalyticsDate(endDate);

  const cursor = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      1,
    ),
  );

  const lastMonth = new Date(
    Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      1,
    ),
  );

  const months: string[] = [];

  while (cursor <= lastMonth) {
    months.push(formatAnalyticsMonth(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

function roundAnalyticsValue(
  value: number,
  decimals = 1,
): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildAnalyticsFallback(
  data: {
    totalRequests: number;
    approvedRequests: number;
    pendingRequests: number;
    approvedLeaveDays: number;
    averageApprovedLeaveDuration: number;
    approvalRate: number;
    topLeaveType: string | null;
    peakMonth: string | null;
  },
): string {
  if (data.totalRequests === 0) {
    return "No leave requests were found for the selected period and scope.";
  }

  const parts = [
    `${data.totalRequests} leave request(s) were recorded during the selected period.`,
    `${data.approvedRequests} request(s) were approved, covering ${data.approvedLeaveDays} leave day(s).`,
  ];

  if (data.pendingRequests > 0) {
    parts.push(
      `${data.pendingRequests} request(s) are still pending.`,
    );
  }

  if (data.topLeaveType) {
    parts.push(
      `${data.topLeaveType} is the most requested leave type in the selected data.`,
    );
  }

  if (data.peakMonth) {
    parts.push(
      `${data.peakMonth} has the highest approved leave usage.`,
    );
  }

  parts.push(
    `The approval rate is ${data.approvalRate}% and the average approved leave duration is ${data.averageApprovedLeaveDuration} day(s).`,
  );

  return parts.join(" ");
}

async function callGroqForLeaveAnalytics(
  data: {
    periodStart: string;
    periodEnd: string;
    scope: "ORGANIZATION" | "TEAM" | "EMPLOYEE";
    totalRequests: number;
    approvedRequests: number;
    pendingRequests: number;
    rejectedRequests: number;
    cancelledRequests: number;
    approvedLeaveDays: number;
    averageApprovedLeaveDuration: number;
    approvalRate: number;
    leaveTypes: LeaveAnalyticsType[];
    monthlyTrend: LeaveAnalyticsMonth[];
    topEmployees: LeaveAnalyticsEmployee[];
  },
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GROQ_BASE_URL}/chat/completions`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model: GROQ_MODEL,

          messages: [
            {
              role: "system",
              content:
                "You are an HRMS leave analytics assistant. Explain leave analytics using only the supplied deterministic HRMS metrics. Do not recalculate, alter, or invent numbers. Do not infer medical, personal, workload, performance, or staffing reasons. Do not make approval or rejection decisions. Identify useful trends and observations in concise professional language. Return only valid JSON.",
            },
            {
              role: "user",
              content: `
Analyze the following HRMS leave analytics.

Period:
${data.periodStart} to ${data.periodEnd}

Scope:
${data.scope}

Total requests:
${data.totalRequests}

Approved requests:
${data.approvedRequests}

Pending requests:
${data.pendingRequests}

Rejected requests:
${data.rejectedRequests}

Cancelled requests:
${data.cancelledRequests}

Approved leave days:
${data.approvedLeaveDays}

Average approved leave duration:
${data.averageApprovedLeaveDuration}

Approval rate:
${data.approvalRate}%

Leave type distribution:
${JSON.stringify(data.leaveTypes, null, 2)}

Monthly trend:
${JSON.stringify(data.monthlyTrend, null, 2)}

Top employees by approved leave:
${JSON.stringify(data.topEmployees, null, 2)}

Rules:
- Use only the supplied HRMS data.
- Do not change any number.
- Highlight meaningful leave usage or request-status trends.
- Do not claim a reason for leave unless the data explicitly supports it.
- Do not infer employee performance or attendance quality.
- Do not make approval or rejection recommendations.
- Keep the explanation concise and professional.
- Return only the JSON object.
`,
            },
          ],

          temperature: 0.2,

          max_completion_tokens: 400,

          reasoning_effort: "low",

          response_format: {
            type: "json_schema",

            json_schema: {
              name: "leave_analytics",

              strict: true,

              schema: {
                type: "object",

                properties: {
                  explanation: {
                    type: "string",
                  },
                },

                required: ["explanation"],

                additionalProperties: false,
              },
            },
          },
        }),

        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Groq leave analytics request failed: ${response.status} ${errorText}`,
      );
    }

    const result = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content =
      result.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error(
        "Groq returned an empty leave analytics response.",
      );
    }

    const parsed = JSON.parse(content) as {
      explanation?: unknown;
    };

    if (
      typeof parsed.explanation !== "string" ||
      !parsed.explanation.trim()
    ) {
      throw new Error(
        "Groq returned an invalid leave analytics explanation.",
      );
    }

    return parsed.explanation.trim();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Analyze leave usage and request trends for an authorized scope.
 *
 * All metrics are calculated deterministically from HRMS data.
 * Groq only explains the resulting metrics.
 *
 * Supported scopes:
 * - ORGANIZATION: all employees, for HR/Admin.
 * - TEAM: direct reports of the manager.
 * - EMPLOYEE: one employee, for HR/Admin or that employee's manager.
 *
 * This function only reads data. It does not modify leave requests,
 * balances, approvals, or employee records.
 */
export async function analyzeLeaveAnalytics(
  input: {
    startDate: string;
    endDate: string;
    requesterRole:
      | "SUPER_ADMIN"
      | "HR_ADMIN"
      | "MANAGER";
    requesterEmployeeId: string;
    employeeId?: string;
  },
): Promise<LeaveAnalyticsResponse> {
  const {
    startDate,
    endDate,
    requesterRole,
    requesterEmployeeId,
    employeeId,
  } = input;

  if (!startDate || !endDate) {
    throw new Error(
      "Analytics start date and end date are required.",
    );
  }

  const start = parseAnalyticsDate(startDate);
  const end = parseAnalyticsDate(endDate);

  if (start.getTime() > end.getTime()) {
    throw new Error(
      "Analytics start date cannot be after end date.",
    );
  }

  if (!requesterEmployeeId) {
    throw new Error(
      "Requester employee profile is required.",
    );
  }

  const isManagementRole =
    requesterRole === "SUPER_ADMIN" ||
    requesterRole === "HR_ADMIN";

  let allowedEmployeeIds: string[] | null = null;

  let scope:
    | "ORGANIZATION"
    | "TEAM"
    | "EMPLOYEE" = "ORGANIZATION";

  if (employeeId) {
    const requestedEmployee =
      await Employee.findById(employeeId)
        .select("_id managerId")
        .lean();

    if (!requestedEmployee) {
      throw new Error("Employee not found.");
    }

    if (!isManagementRole) {
      if (
        String(requestedEmployee.managerId ?? "") !==
        String(requesterEmployeeId)
      ) {
        throw new Error(
          "You can only analyze leave analytics for your direct reports.",
        );
      }
    }

    allowedEmployeeIds = [
      String(requestedEmployee._id),
    ];

    scope = "EMPLOYEE";
  } else if (requesterRole === "MANAGER") {
    const teamMembers = await Employee.find({
      managerId: requesterEmployeeId,
    })
      .select("_id")
      .lean();

    allowedEmployeeIds = teamMembers.map(
      (member) => String(member._id),
    );

    scope = "TEAM";
  }

  const requestQuery: Record<string, unknown> = {
    startDate: {
      $lte: endDate,
    },
    endDate: {
      $gte: startDate,
    },
  };

  if (allowedEmployeeIds) {
    requestQuery.employeeId = {
      $in: allowedEmployeeIds,
    };
  }

  const requests = await LeaveRequest.find(
    requestQuery,
  )
    .sort({
      startDate: 1,
    })
    .lean();

  const employeeIds = [
    ...new Set(
      requests.map((request) =>
        String(request.employeeId),
      ),
    ),
  ];

  const leaveTypeIds = [
    ...new Set(
      requests.map((request) =>
        String(request.leaveTypeId),
      ),
    ),
  ];

  const [employees, leaveTypes] =
    await Promise.all([
      employeeIds.length
        ? Employee.find({
            _id: {
              $in: employeeIds,
            },
          })
            .select("_id firstName lastName")
            .lean()
        : [],
      leaveTypeIds.length
        ? LeaveType.find({
            _id: {
              $in: leaveTypeIds,
            },
          })
            .select("_id name")
            .lean()
        : [],
    ]);

  const employeeMap = new Map(
    employees.map((employee) => [
      String(employee._id),
      employee,
    ]),
  );

  const leaveTypeMap = new Map(
    leaveTypes.map((type) => [
      String(type._id),
      type,
    ]),
  );

  const statusCounts: LeaveAnalyticsStatusCounts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
  };

  const leaveTypeMapData = new Map<
    string,
    LeaveAnalyticsType
  >();

  const monthMap = new Map<
    string,
    LeaveAnalyticsMonth
  >();

  const employeeMapData = new Map<
    string,
    LeaveAnalyticsEmployee
  >();

  for (const month of buildAnalyticsMonthList(
    startDate,
    endDate,
  )) {
    monthMap.set(month, {
      month,
      requestCount: 0,
      approvedDays: 0,
    });
  }

  let approvedRequests = 0;
  let approvedLeaveDays = 0;

  for (const request of requests) {
    const status = String(request.status);

    if (status === "PENDING") {
      statusCounts.pending += 1;
    } else if (status === "APPROVED") {
      statusCounts.approved += 1;
      approvedRequests += 1;
    } else if (status === "REJECTED") {
      statusCounts.rejected += 1;
    } else if (status === "CANCELLED") {
      statusCounts.cancelled += 1;
    }

    const employeeKey = String(
      request.employeeId,
    );

    const leaveTypeKey = String(
      request.leaveTypeId,
    );

    const leaveTypeName =
      leaveTypeMap.get(leaveTypeKey)?.name ??
      "Unknown leave";

    const typeData =
      leaveTypeMapData.get(leaveTypeKey) ?? {
        leaveTypeId: leaveTypeKey,
        leaveTypeName,
        requestCount: 0,
        approvedDays: 0,
      };

    typeData.requestCount += 1;

    const requestStart = parseAnalyticsDate(
      request.startDate,
    );

    const requestEnd = parseAnalyticsDate(
      request.endDate,
    );

    if (requestStart.getTime() > requestEnd.getTime()) {
      continue;
    }

    const overlapDays = getInclusiveOverlapDays(
      request.startDate,
      request.endDate,
      startDate,
      endDate,
    );

    /*
     * Approved leave is the only status counted as
     * actual leave usage.
     */
    if (status === "APPROVED" && overlapDays > 0) {
      approvedLeaveDays += overlapDays;
      typeData.approvedDays += overlapDays;

      const employeeData =
        employeeMapData.get(employeeKey) ?? {
          employeeId: employeeKey,
          firstName:
            employeeMap.get(employeeKey)?.firstName ??
            null,
          lastName:
            employeeMap.get(employeeKey)?.lastName ??
            null,
          requestCount: 0,
          approvedDays: 0,
        };

      employeeData.approvedDays += overlapDays;
      employeeMapData.set(
        employeeKey,
        employeeData,
      );
    }

    leaveTypeMapData.set(
      leaveTypeKey,
      typeData,
    );

    /*
     * Request count is attributed to every calendar month
     * touched by the request. Approved days are counted
     * only for the actual overlap with the selected period.
     */
    const firstMonth = new Date(
      Date.UTC(
        requestStart.getUTCFullYear(),
        requestStart.getUTCMonth(),
        1,
      ),
    );

    const lastMonth = new Date(
      Date.UTC(
        requestEnd.getUTCFullYear(),
        requestEnd.getUTCMonth(),
        1,
      ),
    );

    while (firstMonth <= lastMonth) {
      const monthKey =
        formatAnalyticsMonth(firstMonth);

      const monthData = monthMap.get(monthKey);

      if (monthData) {
        monthData.requestCount += 1;

        if (status === "APPROVED") {
          const monthStart = `${monthKey}-01`;

          const nextMonth = new Date(
            Date.UTC(
              firstMonth.getUTCFullYear(),
              firstMonth.getUTCMonth() + 1,
              1,
            ),
          );

          const nextMonthDate =
            nextMonth.toISOString().slice(0, 10);

          const monthEnd = new Date(
            nextMonth.getTime() - 86_400_000,
          )
            .toISOString()
            .slice(0, 10);

          const approvedMonthDays =
            getInclusiveOverlapDays(
              request.startDate,
              request.endDate,
              monthStart,
              monthEnd,
            );

          monthData.approvedDays +=
            approvedMonthDays;
        }
      }

      firstMonth.setUTCMonth(
        firstMonth.getUTCMonth() + 1,
      );
    }
  }

  /*
   * Count each employee's requests after the main
   * usage calculation so the ranking is deterministic.
   */
  for (const request of requests) {
    const employeeKey = String(
      request.employeeId,
    );

    const employeeData =
      employeeMapData.get(employeeKey) ?? {
        employeeId: employeeKey,
        firstName:
          employeeMap.get(employeeKey)?.firstName ??
          null,
        lastName:
          employeeMap.get(employeeKey)?.lastName ??
          null,
        requestCount: 0,
        approvedDays: 0,
      };

    employeeData.requestCount += 1;

    employeeMapData.set(
      employeeKey,
      employeeData,
    );
  }

  const totalRequests = requests.length;
  const pendingRequests = statusCounts.pending;
  const rejectedRequests = statusCounts.rejected;
  const cancelledRequests =
    statusCounts.cancelled;

  const approvalRate =
    approvedRequests + rejectedRequests > 0
      ? roundAnalyticsValue(
          (approvedRequests /
            (approvedRequests +
              rejectedRequests)) *
            100,
          1,
        )
      : 0;

  const averageApprovedLeaveDuration =
    approvedRequests > 0
      ? roundAnalyticsValue(
          approvedLeaveDays /
            approvedRequests,
          1,
        )
      : 0;

  const leaveTypesAnalytics = [
    ...leaveTypeMapData.values(),
  ].sort((a, b) => {
    if (b.approvedDays !== a.approvedDays) {
      return b.approvedDays - a.approvedDays;
    }

    return b.requestCount - a.requestCount;
  });

  const monthlyTrend = [
    ...monthMap.values(),
  ];

  const topEmployees = [
    ...employeeMapData.values(),
  ]
    .sort((a, b) => {
      if (b.approvedDays !== a.approvedDays) {
        return b.approvedDays - a.approvedDays;
      }

      return b.requestCount - a.requestCount;
    })
    .slice(0, 10);

  const topLeaveType =
    leaveTypesAnalytics[0]?.leaveTypeName ??
    null;

  const peakMonthData = monthlyTrend.reduce<
    LeaveAnalyticsMonth | null
  >((current, month) => {
    if (!current) {
      return month;
    }

    return month.approvedDays >
      current.approvedDays
      ? month
      : current;
  }, null);

  const peakMonth =
    peakMonthData &&
    peakMonthData.approvedDays > 0
      ? peakMonthData.month
      : null;

  const fallbackExplanation =
    buildAnalyticsFallback({
      totalRequests,
      approvedRequests,
      pendingRequests,
      approvedLeaveDays,
      averageApprovedLeaveDuration,
      approvalRate,
      topLeaveType,
      peakMonth,
    });

  let explanation =
    fallbackExplanation;

  try {
    explanation =
      await callGroqForLeaveAnalytics({
        periodStart: startDate,
        periodEnd: endDate,
        scope,
        totalRequests,
        approvedRequests,
        pendingRequests,
        rejectedRequests,
        cancelledRequests,
        approvedLeaveDays,
        averageApprovedLeaveDuration,
        approvalRate,
        leaveTypes: leaveTypesAnalytics,
        monthlyTrend,
        topEmployees,
      });
  } catch (error) {
    console.error(
      "Leave Analytics AI/Groq failed. Using fallback.",
      error,
    );
  }

  return {
    period: {
      startDate,
      endDate,
    },

    scope,

    overview: {
      totalRequests,
      approvedRequests,
      pendingRequests,
      rejectedRequests,
      cancelledRequests,
      approvedLeaveDays,
      averageApprovedLeaveDuration,
      approvalRate,
    },

    statusCounts,

    leaveTypes: leaveTypesAnalytics,

    monthlyTrend,

    topEmployees,

    explanation,
  };
}



/* ============================================================
 * AI LEAVE PATTERN DETECTION
 * ============================================================
 *
 * The backend detects objective patterns from leave data.
 * Groq only explains the already-calculated findings.
 *
 * This feature NEVER accuses an employee and NEVER approves
 * or rejects leave.
 */

type LeavePatternType =
  | "WEEKDAY_PATTERN"
  | "HOLIDAY_ADJACENCY"
  | "REPEATED_SHORT_LEAVE";

type LeavePatternFinding = {
  type: LeavePatternType;
  title: string;
  description: string;
  employeeId: string | null;
  employeeName: string | null;
  occurrenceCount: number;
  dates: string[];
};

export type LeavePatternDetectionResponse = {
  period: {
    startDate: string;
    endDate: string;
  };
  scope: "ORGANIZATION" | "TEAM" | "EMPLOYEE";
  patterns: LeavePatternFinding[];
  employeesAnalyzed: number;
  requestsAnalyzed: number;
  explanation: string;
};

function addDaysToDateString(
  value: string,
  days: number,
): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getWeekdayName(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
}

function getDatesBetween(
  startDate: string,
  endDate: string,
): string[] {
  const dates: string[] = [];
  let current = startDate;

  while (current <= endDate) {
    dates.push(current);
    current = addDaysToDateString(current, 1);
  }

  return dates;
}

function getPatternEmployeeName(
  employee: {
    firstName?: string | null;
    lastName?: string | null;
  },
): string {
  return [employee.firstName, employee.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() || "Employee";
}

function buildLeavePatternFallback(
  input: {
    patterns: LeavePatternFinding[];
    employeesAnalyzed: number;
    requestsAnalyzed: number;
  },
): string {
  if (!input.patterns.length) {
    return `No repeated leave pattern was detected across ${input.employeesAnalyzed} employee(s) and ${input.requestsAnalyzed} leave request(s) in the selected period.`;
  }

  const first = input.patterns[0];

  if (first.employeeName) {
    return `${first.employeeName} shows a repeated ${first.title.toLowerCase()} pattern (${first.occurrenceCount} occurrences). This is an objective leave pattern for HR review and is not a reason to assume intent or misconduct.`;
  }

  return `${input.patterns.length} repeated leave pattern(s) were detected across the selected scope. These findings are objective usage patterns for HR review and do not indicate employee intent or misconduct.`;
}

async function callGroqForLeavePatterns(
  input: {
    periodStart: string;
    periodEnd: string;
    scope: string;
    employeesAnalyzed: number;
    requestsAnalyzed: number;
    patterns: LeavePatternFinding[];
  },
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GROQ_BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            {
              role: "system",
              content:
                "You explain objective leave usage patterns for an HRMS. Never accuse an employee, infer intent, misconduct, performance, health, or personal circumstances. Do not change supplied numbers. Do not make approval or rejection recommendations. Keep the explanation concise and professional. Return only the JSON object.",
            },
            {
              role: "user",
              content: `
Period:
${input.periodStart} to ${input.periodEnd}

Scope:
${input.scope}

Employees analyzed:
${input.employeesAnalyzed}

Leave requests analyzed:
${input.requestsAnalyzed}

Detected patterns:
${JSON.stringify(input.patterns, null, 2)}

Rules:
- Use only the supplied HRMS data.
- Do not change occurrence counts or dates.
- Describe patterns objectively.
- Do not infer why an employee took leave.
- Do not accuse employees of misuse or misconduct.
- Do not recommend approval or rejection.
- State that findings are for HR review when appropriate.
- Return only the JSON object.
`,
            },
          ],
          temperature: 0.2,
          max_completion_tokens: 300,
          reasoning_effort: "low",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "leave_pattern_detection",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  explanation: {
                    type: "string",
                  },
                },
                required: ["explanation"],
                additionalProperties: false,
              },
            },
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Groq leave pattern request failed: ${response.status} ${errorText}`,
      );
    }

    const result = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content =
      result.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error(
        "Groq returned an empty leave pattern response.",
      );
    }

    const parsed = JSON.parse(content) as {
      explanation?: unknown;
    };

    if (
      typeof parsed.explanation !== "string" ||
      !parsed.explanation.trim()
    ) {
      throw new Error(
        "Groq returned an invalid leave pattern explanation.",
      );
    }

    return parsed.explanation.trim();
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeLeavePatterns(
  input: {
    startDate: string;
    endDate: string;
    requesterRole:
      | "SUPER_ADMIN"
      | "HR_ADMIN"
      | "MANAGER";
    requesterEmployeeId: string;
    employeeId?: string;
  },
): Promise<LeavePatternDetectionResponse> {
  const {
    startDate,
    endDate,
    requesterRole,
    requesterEmployeeId,
    employeeId,
  } = input;

  if (!startDate || !endDate) {
    throw new Error(
      "Pattern detection start date and end date are required.",
    );
  }

  const start = parseAnalyticsDate(startDate);
  const end = parseAnalyticsDate(endDate);

  if (start.getTime() > end.getTime()) {
    throw new Error(
      "Pattern detection start date cannot be after end date.",
    );
  }

  if (!requesterEmployeeId) {
    throw new Error(
      "Requester employee profile is required.",
    );
  }

  const isAdmin =
    requesterRole === "SUPER_ADMIN" ||
    requesterRole === "HR_ADMIN";

  let allowedEmployeeIds: string[] | null = null;

  let scope:
    | "ORGANIZATION"
    | "TEAM"
    | "EMPLOYEE" = "ORGANIZATION";

  if (employeeId) {
    const requestedEmployee =
      await Employee.findById(employeeId)
        .select("_id managerId")
        .lean();

    if (!requestedEmployee) {
      throw new Error("Employee not found.");
    }

    if (!isAdmin) {
      if (
        String(requestedEmployee.managerId ?? "") !==
        String(requesterEmployeeId)
      ) {
        throw new Error(
          "You can only analyze leave patterns for your direct reports.",
        );
      }
    }

    allowedEmployeeIds = [
      String(requestedEmployee._id),
    ];

    scope = "EMPLOYEE";
  } else if (requesterRole === "MANAGER") {
    const teamMembers = await Employee.find({
      managerId: requesterEmployeeId,
    })
      .select("_id")
      .lean();

    allowedEmployeeIds = teamMembers.map(
      (member) => String(member._id),
    );

    scope = "TEAM";
  }

  const requestQuery: Record<string, unknown> = {
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
    status: {
      $in: ["APPROVED", "PENDING"],
    },
  };

  if (allowedEmployeeIds) {
    requestQuery.employeeId = {
      $in: allowedEmployeeIds,
    };
  }

  const requests = await LeaveRequest.find(
    requestQuery,
  )
    .sort({ startDate: 1 })
    .lean();

  const employeeIds = [
    ...new Set(
      requests.map((request) =>
        String(request.employeeId),
      ),
    ),
  ];

  const employees =
    employeeIds.length > 0
      ? await Employee.find({
          _id: { $in: employeeIds },
        })
          .select("_id firstName lastName")
          .lean()
      : [];

  const employeeMap = new Map(
    employees.map((employee) => [
      String(employee._id),
      employee,
    ]),
  );

  /*
   * Organization holidays are used only to identify
   * leave immediately before or after a holiday.
   */
  const holidays = await Holiday.find({
    date: {
      $gte: startDate,
      $lte: endDate,
    },
  })
    .select("date name")
    .lean();

  const holidayMap = new Map(
    holidays.map((holiday) => [
      String(holiday.date),
      holiday.name,
    ]),
  );

  const employeeWeekdayCounts = new Map<
    string,
    Map<string, string[]>
  >();

  const employeeHolidayAdjacentDates = new Map<
    string,
    string[]
  >();

  const employeeShortLeaveDates = new Map<
    string,
    string[]
  >();

  for (const request of requests) {
    const id = String(request.employeeId);

    const effectiveStart =
      request.startDate > startDate
        ? request.startDate
        : startDate;

    const effectiveEnd =
      request.endDate < endDate
        ? request.endDate
        : endDate;

    const dates = getDatesBetween(
      effectiveStart,
      effectiveEnd,
    );

    if (!employeeWeekdayCounts.has(id)) {
      employeeWeekdayCounts.set(
        id,
        new Map<string, string[]>(),
      );
    }

    const weekdayCounts =
      employeeWeekdayCounts.get(id)!;

    for (const date of dates) {
      const weekday = getWeekdayName(date);

      const existing =
        weekdayCounts.get(weekday) ?? [];

      existing.push(date);
      weekdayCounts.set(weekday, existing);

      const previousDate =
        addDaysToDateString(date, -1);
      const nextDate =
        addDaysToDateString(date, 1);

      if (
        holidayMap.has(previousDate) ||
        holidayMap.has(nextDate)
      ) {
        const adjacent =
          employeeHolidayAdjacentDates.get(id) ??
          [];

        adjacent.push(date);

        employeeHolidayAdjacentDates.set(
          id,
          adjacent,
        );
      }
    }

    /*
     * A request with one calendar day is treated as
     * short leave for pattern detection.
     */
    if (dates.length === 1) {
      const shortLeaveDates =
        employeeShortLeaveDates.get(id) ?? [];

      shortLeaveDates.push(dates[0]);

      employeeShortLeaveDates.set(
        id,
        shortLeaveDates,
      );
    }
  }

  const patterns: LeavePatternFinding[] = [];

  for (const [employeeId, weekdayMap] of employeeWeekdayCounts) {
    const employee =
      employeeMap.get(employeeId);

    const employeeName = employee
      ? getPatternEmployeeName(employee)
      : null;

    for (const [weekday, dates] of weekdayMap) {
      /*
       * Three or more occurrences of the same weekday
       * in the selected period are considered a repeated
       * weekday pattern.
       */
      if (dates.length >= 3) {
        patterns.push({
          type: "WEEKDAY_PATTERN",
          title: `Repeated ${weekday} leave pattern`,
          description:
            `${employeeName ?? "An employee"} has leave recorded on ${weekday} ${dates.length} times during the selected period.`,
          employeeId,
          employeeName,
          occurrenceCount: dates.length,
          dates: dates.slice(-10),
        });
      }
    }
  }

  for (const [
    employeeId,
    dates,
  ] of employeeHolidayAdjacentDates) {
    if (dates.length < 2) {
      continue;
    }

    const employee =
      employeeMap.get(employeeId);

    const employeeName = employee
      ? getPatternEmployeeName(employee)
      : null;

    patterns.push({
      type: "HOLIDAY_ADJACENCY",
      title: "Leave near holidays",
      description:
        `${employeeName ?? "An employee"} has leave immediately before or after a holiday on ${dates.length} occasions during the selected period.`,
      employeeId,
      employeeName,
      occurrenceCount: dates.length,
      dates: dates.slice(-10),
    });
  }

  for (const [
    employeeId,
    dates,
  ] of employeeShortLeaveDates) {
    if (dates.length < 4) {
      continue;
    }

    const employee =
      employeeMap.get(employeeId);

    const employeeName = employee
      ? getPatternEmployeeName(employee)
      : null;

    patterns.push({
      type: "REPEATED_SHORT_LEAVE",
      title: "Repeated single-day leave",
      description:
        `${employeeName ?? "An employee"} has ${dates.length} single-day leave request(s) during the selected period.`,
      employeeId,
      employeeName,
      occurrenceCount: dates.length,
      dates: dates.slice(-10),
    });
  }

  patterns.sort(
    (a, b) =>
      b.occurrenceCount -
      a.occurrenceCount,
  );

  const limitedPatterns =
    patterns.slice(0, 20);

  const fallbackExplanation =
    buildLeavePatternFallback({
      patterns: limitedPatterns,
      employeesAnalyzed:
        allowedEmployeeIds
          ? allowedEmployeeIds.length
          : employees.length,
      requestsAnalyzed: requests.length,
    });

  let explanation =
    fallbackExplanation;

  try {
    explanation =
      await callGroqForLeavePatterns({
        periodStart: startDate,
        periodEnd: endDate,
        scope,
        employeesAnalyzed:
          allowedEmployeeIds
            ? allowedEmployeeIds.length
            : employees.length,
        requestsAnalyzed: requests.length,
        patterns: limitedPatterns,
      });
  } catch (error) {
    console.error(
      "Leave Pattern Detection AI/Groq failed. Using fallback.",
      error,
    );
  }

  return {
    period: {
      startDate,
      endDate,
    },
    scope,
    patterns: limitedPatterns,
    employeesAnalyzed:
      allowedEmployeeIds
        ? allowedEmployeeIds.length
        : employees.length,
    requestsAnalyzed: requests.length,
    explanation,
  };
}
