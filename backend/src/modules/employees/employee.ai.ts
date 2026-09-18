import { z } from "zod";
import { generateOrganizationAI } from "@/services/ai.service";

/* -------------------------------------------------------------------------- */
/* Shared Types                                                               */
/* -------------------------------------------------------------------------- */

const competencyLevels = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "EXPERT",
] as const;

/* -------------------------------------------------------------------------- */
/* AI Career & Development Insights                                           */
/* -------------------------------------------------------------------------- */

/**
 * Career Insights
 *
 * The AI may occasionally omit a section even when the prompt asks for it.
 * Defaults prevent a valid partial AI response from failing the entire request
 * and forcing the application to use the generic fallback.
 */

const careerStrengthSchema = z.object({
  area: z.string().min(1).max(150),
  evidence: z.string().min(1).max(400),
});

const careerDevelopmentAreaSchema = z.object({
  area: z.string().min(1).max(150),
  reason: z.string().min(1).max(400),
});

const recommendedSkillSchema = z.object({
  skill: z.string().min(1).max(100),
  reason: z.string().min(1).max(300),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

const careerPathSchema = z.object({
  role: z.string().min(1).max(150),
  rationale: z.string().min(1).max(400),
});

export const careerInsightsSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(1000)
    .default(
      "There is not enough structured employee data to generate detailed career insights yet.",
    ),

  strengths: z
    .array(careerStrengthSchema)
    .max(6)
    .default([]),

  developmentAreas: z
    .array(careerDevelopmentAreaSchema)
    .max(6)
    .default([]),

  recommendedSkills: z
    .array(recommendedSkillSchema)
    .max(8)
    .default([]),

  careerPaths: z
    .array(careerPathSchema)
    .max(5)
    .default([]),

  developmentActions: z
    .array(z.string().min(1).max(300))
    .max(8)
    .default([]),

  confidence: z
    .number()
    .min(0)
    .max(1)
    .default(0),
});

export type CareerInsights = z.infer<typeof careerInsightsSchema>;

/* -------------------------------------------------------------------------- */
/* AI Employee 360° Summary                                                   */
/* -------------------------------------------------------------------------- */

export const employee360SummarySchema = z.object({
  executiveSummary: z
    .string()
    .min(1)
    .max(1200)
    .default(
      "Employee 360° information is available across profile, skills, performance, attendance, and leave.",
    ),

  profile: z
    .object({
      role: z.string().min(1).max(200).default("Not available"),
      department: z.string().min(1).max(200).default("Not available"),
      experienceSummary: z
        .string()
        .min(1)
        .max(400)
        .default("Experience information is not available."),
    })
    .default({
      role: "Not available",
      department: "Not available",
      experienceSummary: "Experience information is not available.",
    }),

  skills: z
    .object({
      overview: z
        .string()
        .min(1)
        .max(500)
        .default("Skill information is not available."),
      strongestSkills: z
        .array(z.string().min(1).max(100))
        .max(8)
        .default([]),
      developmentSkills: z
        .array(z.string().min(1).max(100))
        .max(8)
        .default([]),
    })
    .default({
      overview: "Skill information is not available.",
      strongestSkills: [],
      developmentSkills: [],
    }),

  performance: z
    .object({
      overview: z
        .string()
        .min(1)
        .max(600)
        .default("Performance information is not available."),
      strengths: z
        .array(z.string().min(1).max(300))
        .max(6)
        .default([]),
      developmentAreas: z
        .array(z.string().min(1).max(300))
        .max(6)
        .default([]),
    })
    .default({
      overview: "Performance information is not available.",
      strengths: [],
      developmentAreas: [],
    }),

  attendance: z
    .object({
      overview: z
        .string()
        .min(1)
        .max(500)
        .default("Attendance information is not available."),
      observations: z
        .array(z.string().min(1).max(300))
        .max(6)
        .default([]),
    })
    .default({
      overview: "Attendance information is not available.",
      observations: [],
    }),

  leave: z
    .object({
      overview: z
        .string()
        .min(1)
        .max(500)
        .default("Leave information is not available."),
      observations: z
        .array(z.string().min(1).max(300))
        .max(6)
        .default([]),
    })
    .default({
      overview: "Leave information is not available.",
      observations: [],
    }),

  development: z
    .object({
      priorities: z
        .array(z.string().min(1).max(300))
        .max(6)
        .default([]),
      suggestedActions: z
        .array(z.string().min(1).max(300))
        .max(6)
        .default([]),
    })
    .default({
      priorities: [],
      suggestedActions: [],
    }),

  managerView: z
    .object({
      discussionPoints: z
        .array(z.string().min(1).max(300))
        .max(6)
        .default([]),
    })
    .default({
      discussionPoints: [],
    }),
});

export type Employee360Summary = z.infer<
  typeof employee360SummarySchema
>;

/* -------------------------------------------------------------------------- */
/* Fallbacks                                                                  */
/* -------------------------------------------------------------------------- */

export const careerInsightsFallback = (): CareerInsights => ({
  summary:
    "There is not enough structured employee data to generate detailed career insights yet.",

  strengths: [],

  developmentAreas: [],

  recommendedSkills: [],

  careerPaths: [],

  developmentActions: [
    "Review the employee's current skills and development goals.",
    "Add measurable career goals to improve the quality of future recommendations.",
  ],

  confidence: 0,
});

export const employee360SummaryFallback = (): Employee360Summary => ({
  executiveSummary:
    "A complete AI employee summary could not be generated because sufficient employee information was not available.",

  profile: {
    role: "Not available",
    department: "Not available",
    experienceSummary: "Not enough information available.",
  },

  skills: {
    overview: "Skill information is not available.",
    strongestSkills: [],
    developmentSkills: [],
  },

  performance: {
    overview: "Performance information is not available.",
    strengths: [],
    developmentAreas: [],
  },

  attendance: {
    overview: "Attendance information is not available.",
    observations: [],
  },

  leave: {
    overview: "Leave information is not available.",
    observations: [],
  },

  development: {
    priorities: [],
    suggestedActions: [
      "Review the employee profile and define development goals.",
    ],
  },

  managerView: {
    discussionPoints: [],
  },
});

/* -------------------------------------------------------------------------- */
/* Input Types                                                                */
/* -------------------------------------------------------------------------- */

export interface EmployeeCareerInput {
  employee: {
    firstName: string;
    lastName: string;
    employeeCode: string;

    workLocation?: string | null;

    grade?: string | null;

    employmentType?: string | null;

    dateOfJoining?: Date | string | null;

    skills?: Array<{
      name: string;
      category?: string | null;
      competencyLevel:
        | "BEGINNER"
        | "INTERMEDIATE"
        | "ADVANCED"
        | "EXPERT";
    }>;

    education?: unknown[];

    certifications?: unknown[];

    workHistory?: unknown[];
  };

  department?: {
    name?: string | null;
  } | null;

  designation?: {
    title?: string | null;
    level?: number | null;
  } | null;

  manager?: {
    name?: string | null;
  } | null;

  performance?: {
    latestRating?: number | null;

    strengths?: string[];

    developmentAreas?: string[];

    goals?: Array<{
      title?: string;
      progress?: number;
      status?: string;
    }>;
  } | null;
}

/* -------------------------------------------------------------------------- */
/* Career Prompt                                                              */
/* -------------------------------------------------------------------------- */

const CAREER_SYSTEM_PROMPT = `
You are an AI career-development assistant inside an HR Management System.

Your task is to analyze ONLY the employee information provided to you and
produce structured career and development insights.

IMPORTANT:

- Return ONLY valid JSON.
- Do NOT use Markdown.
- Do NOT wrap the JSON in triple backticks.
- The response MUST contain ALL of the following top-level fields:
  summary
  strengths
  developmentAreas
  recommendedSkills
  careerPaths
  developmentActions
  confidence

- summary must be a string.
- strengths must be an array of objects with:
  {
    "area": "string",
    "evidence": "string"
  }

- developmentAreas must be an array of objects with:
  {
    "area": "string",
    "reason": "string"
  }

- recommendedSkills must be an array of objects with:
  {
    "skill": "string",
    "reason": "string",
    "priority": "HIGH" | "MEDIUM" | "LOW"
  }

- careerPaths must be an array of objects with:
  {
    "role": "string",
    "rationale": "string"
  }

- developmentActions must be an array of strings.

- confidence must be a number between 0 and 1.

If there is insufficient evidence for a section, return an empty array
for that section rather than inventing information.

Do not invent employee achievements.
Do not invent skills.
Do not invent certifications.
Do not invent performance results.
Do not assume a promotion is guaranteed.
Do not make employment decisions.
Do not classify the employee as good/bad/high/low performer.
Career paths are suggestions, not decisions.
Base every recommendation on evidence in the supplied data.
If evidence is insufficient, say so.
Prefer practical development actions.
Do not use sensitive personal information.

Return ONLY JSON matching the requested schema.
`;

/* -------------------------------------------------------------------------- */
/* Employee 360 Prompt                                                        */
/* -------------------------------------------------------------------------- */

const EMPLOYEE_360_SYSTEM_PROMPT = `
You are an AI employee-insights assistant inside an HR Management System.

Create a factual Employee 360° summary using ONLY the structured employee
data provided in the user message.

This is NOT a generic employee profile and it is NOT a career-only summary.
You MUST use every available data category: profile, organization, skills,
performance, attendance, and leave.

REQUIRED BEHAVIOR:

1. PROFILE
- Describe the employee's role, department, and organizational experience.
- Use the supplied designation and department exactly as evidence allows.

2. SKILLS
- Identify strongest skills ONLY from the supplied skills.
- Identify development skills only when there is evidence from competency levels,
  performance development areas, or explicit gaps in the supplied data.
- Never invent a skill.

3. PERFORMANCE
- Use the supplied latestRating when it exists.
- Reference supplied strengths and development areas.
- Do not create ratings, achievements, goals, or performance claims that are
  not present.
- If performance data is unavailable, explicitly state that.

4. ATTENDANCE
- You MUST use the supplied attendance metrics when they are available.
- The attendance overview should reference the attendance rate, present days,
  absent days, half days, late days, average work hours, and trend when those
  values are provided.
- Attendance observations must be factual and based only on those metrics.
- Do not invent reasons for absences, lateness, or attendance changes.
- Do not make disciplinary or employment decisions.

5. LEAVE
- You MUST use the supplied leave metrics when they are available.
- The leave overview should reference allocated leave, used leave, remaining
  leave, and recent leave requests when provided.
- Mention relevant request statuses and leave types from the supplied data.
- Never infer why an employee took leave.
- Do not treat leave usage as a performance judgment.

6. DEVELOPMENT
- Combine evidence from skills, performance, attendance, and leave only when
  relevant.
- Development priorities and suggested actions must be practical and evidence-
  based.
- Do not guarantee promotions or employment outcomes.

7. MANAGER VIEW
- Provide discussion points that a manager can use in a normal development
  conversation.
- Discussion points must be based on supplied information.
- Do not recommend disciplinary action.

IMPORTANT:
- Return ONLY valid JSON.
- Do NOT use Markdown.
- Do NOT wrap the JSON in triple backticks.
- Return all top-level fields required by the schema.
- Every section must be populated with meaningful content when its source data
  is available.
- If a source category is genuinely unavailable, state that clearly in its
  overview and use an empty observations array where appropriate.
- Do not produce a generic response when structured metrics are available.
- Never invent employee information.
- Never infer facts that are not present.
- Do not expose sensitive personal information.
- Do not include Aadhaar, PAN, bank details, medical conditions, insurance
  information, passwords, authentication data, or financial information.
- Do not make disciplinary or employment decisions.
- Do not label an employee as a poor performer.
- Distinguish factual observations from recommendations.

Return ONLY JSON matching the requested schema.
`;


/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function calculateExperience(
  dateOfJoining?: Date | string | null,
): string {
  if (!dateOfJoining) {
    return "Joining date not available.";
  }

  const joiningDate = new Date(dateOfJoining);

  if (Number.isNaN(joiningDate.getTime())) {
    return "Joining date not available.";
  }

  const now = new Date();

  if (joiningDate > now) {
    return "Joining date is in the future.";
  }

  const totalMonths =
    (now.getFullYear() - joiningDate.getFullYear()) * 12 +
    (now.getMonth() - joiningDate.getMonth());

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  if (years <= 0) {
    return `${Math.max(months, 0)} month${
      months === 1 ? "" : "s"
    } of organizational experience`;
  }

  if (months === 0) {
    return `${years} year${
      years === 1 ? "" : "s"
    } of organizational experience`;
  }

  return `${years} year${
    years === 1 ? "" : "s"
  } and ${months} month${
    months === 1 ? "" : "s"
  } of organizational experience`;
}

function cleanSkills(
  skills?: EmployeeCareerInput["employee"]["skills"],
) {
  return (skills ?? []).map((skill) => ({
    name: skill.name,
    category: skill.category ?? null,
    competencyLevel: skill.competencyLevel,
  }));
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is string =>
        typeof item === "string",
    )
    .map((item) => item.trim())
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Career & Development AI                                                    */
/* -------------------------------------------------------------------------- */

export async function generateCareerInsights(
  input: EmployeeCareerInput,
): Promise<CareerInsights> {
  const fallback = careerInsightsFallback();

  const skills = cleanSkills(input.employee.skills);

  const userMessage = JSON.stringify(
    {
      employee: {
        name: `${input.employee.firstName} ${input.employee.lastName}`.trim(),

        employeeCode: input.employee.employeeCode,

        workLocation:
          input.employee.workLocation ?? null,

        grade:
          input.employee.grade ?? null,

        employmentType:
          input.employee.employmentType ?? null,

        experience: calculateExperience(
          input.employee.dateOfJoining,
        ),
      },

      organization: {
        department:
          input.department?.name ?? null,

        designation:
          input.designation?.title ?? null,

        designationLevel:
          input.designation?.level ?? null,

        manager:
          input.manager?.name ?? null,
      },

      skills,

      education:
        input.employee.education ?? [],

      certifications:
        input.employee.certifications ?? [],

      workHistory:
        input.employee.workHistory ?? [],

      performance: input.performance
        ? {
            latestRating:
              input.performance.latestRating ?? null,

            strengths: safeStringArray(
              input.performance.strengths,
            ),

            developmentAreas: safeStringArray(
              input.performance.developmentAreas,
            ),

            goals:
              input.performance.goals ?? [],
          }
        : null,
    },
    null,
    2,
  );

  return generateOrganizationAI(
    CAREER_SYSTEM_PROMPT,
    careerInsightsSchema,
    fallback,
    {
      userMessage,

      temperature: 0.2,

      maxTokens: 1400,

      timeoutMs: 8000,
    },
  ) as Promise<CareerInsights>;
}

/* -------------------------------------------------------------------------- */
/* Employee 360° AI                                                           */
/* -------------------------------------------------------------------------- */

export interface Employee360Input {
  profile: {
    firstName: string;
    lastName: string;
    employeeCode: string;

    workLocation?: string | null;

    grade?: string | null;

    employmentType?: string | null;

    dateOfJoining?: Date | string | null;
  };

  department?: string | null;

  designation?: string | null;

  manager?: string | null;

  skills?: Array<{
    name: string;
    category?: string | null;
    competencyLevel:
      | "BEGINNER"
      | "INTERMEDIATE"
      | "ADVANCED"
      | "EXPERT";
  }>;

  performance?: {
    latestRating?: number | null;

    strengths?: string[];

    developmentAreas?: string[];

    goals?: Array<{
      title?: string;
      progress?: number;
      status?: string;
    }>;
  } | null;

  attendance?: {
    attendanceRate?: number | null;

    presentDays?: number;

    absentDays?: number;

    halfDays?: number;

    lateDays?: number;

    averageWorkHours?: number | null;

    trend?: string | null;
  } | null;

  leave?: {
    totalAllocated?: number;

    totalUsed?: number;

    remaining?: number;

    requests?: Array<{
      leaveType?: string;
      totalDays?: number;
      status?: string;
    }>;
  } | null;
}

export async function generateEmployee360Summary(
  input: Employee360Input,
): Promise<Employee360Summary> {
  const fallback = employee360SummaryFallback();

  const userMessage = JSON.stringify(
    {
      profile: {
        name: `${input.profile.firstName} ${input.profile.lastName}`.trim(),

        employeeCode:
          input.profile.employeeCode,

        workLocation:
          input.profile.workLocation ?? null,

        grade:
          input.profile.grade ?? null,

        employmentType:
          input.profile.employmentType ?? null,

        experience: calculateExperience(
          input.profile.dateOfJoining,
        ),
      },

      organization: {
        department:
          input.department ?? null,

        designation:
          input.designation ?? null,

        manager:
          input.manager ?? null,
      },

      skills: cleanSkills(input.skills),

      performance: input.performance
        ? {
            latestRating:
              input.performance.latestRating ?? null,

            strengths: safeStringArray(
              input.performance.strengths,
            ),

            developmentAreas:
              safeStringArray(
                input.performance.developmentAreas,
              ),

            goals:
              input.performance.goals ?? [],
          }
        : null,

      attendance: input.attendance
        ? {
            attendanceRate: input.attendance.attendanceRate ?? null,
            presentDays: input.attendance.presentDays ?? 0,
            absentDays: input.attendance.absentDays ?? 0,
            halfDays: input.attendance.halfDays ?? 0,
            lateDays: input.attendance.lateDays ?? 0,
            averageWorkHours:
              input.attendance.averageWorkHours ?? null,
            trend: input.attendance.trend ?? null,
          }
        : null,

      leave: input.leave
        ? {
            totalAllocated: input.leave.totalAllocated ?? 0,
            totalUsed: input.leave.totalUsed ?? 0,
            remaining: input.leave.remaining ?? 0,
            requests: (input.leave.requests ?? []).slice(0, 20),
          }
        : null,
    },
    null,
    2,
  );

  return generateOrganizationAI(
    EMPLOYEE_360_SYSTEM_PROMPT,
    employee360SummarySchema,
    fallback,
    {
      userMessage,

      temperature: 0.2,

      maxTokens: 1800,

      timeoutMs: 9000,
    },
  ) as Promise<Employee360Summary>;
}