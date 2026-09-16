import { z } from "zod";

import {
  generateCalendarAI,
} from "@/services/ai.service";

/* =========================================================
   1. TEAM CALENDAR CONFLICT RESOLVER
========================================================= */

export type CalendarConflictAIResult = {
  summary: string;
  recommendedAlternativeTime: string;
  impact: string;
  recommendation: string;
};

const calendarConflictAISchema =
  z.object({
    summary: z
      .string()
      .min(1)
      .max(500),

    recommendedAlternativeTime: z
      .string()
      .min(1)
      .max(300),

    impact: z
      .string()
      .min(1)
      .max(500),

    recommendation: z
      .string()
      .min(1)
      .max(500),
  });

export async function generateCalendarConflictAI(
  input: {
    employeeId: string;
    startAt: string;
    endAt: string;
    conflictData: unknown;
  },
): Promise<CalendarConflictAIResult> {
  const fallback: CalendarConflictAIResult = {
    summary:
      "Calendar conflict analysis is based on overlapping scheduled events.",

    recommendedAlternativeTime:
      "No reliable alternative time could be determined automatically.",

    impact:
      "One or more scheduled events overlap during the selected period.",

    recommendation:
      "Review the conflicting events and consider moving the meeting to a supported available slot.",
  };

  const systemPrompt = `
You are an AI calendar assistant for an enterprise HRMS.

Your job is to explain deterministic calendar conflict analysis.

Rules:
- Use ONLY the supplied calendar conflict data.
- Never invent employees, meetings, availability, or times.
- Never claim that a time is available unless the supplied data supports it.
- If alternativeSlots contains valid slots, you may recommend one of those slots.
- If alternativeSlots is empty, explicitly say that no reliable alternative time was determined.
- Do not change deterministic conflict counts or impact calculations.
- Keep the response concise and practical.
- Return valid JSON only.

Output:
{
  "summary": "brief conflict summary",
  "recommendedAlternativeTime": "supported alternative time or unavailable",
  "impact": "business/team impact",
  "recommendation": "recommended action"
}
`;

  const userMessage = `
Analyze this calendar conflict.

Employee ID:
${input.employeeId}

Analysis window:
${input.startAt} to ${input.endAt}

Deterministic conflict analysis:
${JSON.stringify(
  input.conflictData,
  null,
  2,
)}

Return JSON only.
`;

  return generateCalendarAI(
    systemPrompt,
    userMessage,
    calendarConflictAISchema,
    fallback,
    {
      temperature: 0.2,
      maxTokens: 500,
      timeoutMs: 8000,
    },
  );
}

/* =========================================================
   2. EMPLOYEE CALENDAR HEALTH
========================================================= */

export type CalendarHealthAIResult = {
  summary: string;
  recommendation: string;
  focusRecommendation: string;
  meetingLoadAssessment: string;
};

const calendarHealthAISchema =
  z.object({
    summary: z
      .string()
      .min(1)
      .max(500),

    recommendation: z
      .string()
      .min(1)
      .max(500),

    focusRecommendation: z
      .string()
      .min(1)
      .max(500),

    meetingLoadAssessment: z
      .string()
      .min(1)
      .max(500),
  });

export async function generateCalendarHealthAI(
  input: {
    employeeId: string;
    healthData: unknown;
  },
): Promise<CalendarHealthAIResult> {
  const fallback: CalendarHealthAIResult = {
    summary:
      "Calendar health was calculated from the employee's scheduled events.",

    recommendation:
      "Maintain a balanced mix of meetings, focus time, and breaks.",

    focusRecommendation:
      "Protect dedicated focus time where possible.",

    meetingLoadAssessment:
      "Review meeting duration and back-to-back scheduling regularly.",
  };

  const systemPrompt = `
You are an AI workplace productivity assistant.

Analyze the employee calendar health metrics provided by the HRMS.

Rules:
- Use ONLY the supplied metrics.
- Do not invent meetings or calendar events.
- Do not diagnose health or medical conditions.
- Focus only on workplace scheduling and productivity.
- Do not change or override the deterministic score.
- Keep recommendations practical.
- Return JSON only.

Output:
{
  "summary": "short assessment",
  "recommendation": "main recommendation",
  "focusRecommendation": "focus-time recommendation",
  "meetingLoadAssessment": "meeting-load assessment"
}
`;

  const userMessage = `
Analyze this employee calendar.

Employee ID:
${input.employeeId}

Calendar health metrics:
${JSON.stringify(
  input.healthData,
  null,
  2,
)}

Return JSON only.
`;

  return generateCalendarAI(
    systemPrompt,
    userMessage,
    calendarHealthAISchema,
    fallback,
    {
      temperature: 0.3,
      maxTokens: 500,
      timeoutMs: 8000,
    },
  );
}

/* =========================================================
   3. MEETING NECESSITY
========================================================= */

export type MeetingNecessityAIResult = {
  explanation: string;
  recommendation:
    | "KEEP"
    | "SHORTEN"
    | "MAKE_ASYNC"
    | "CANCEL"
    | "REVIEW";
  suggestedAction: string;
};

const meetingNecessityAISchema =
  z.object({
    explanation: z
      .string()
      .min(1)
      .max(700),

    recommendation: z.enum([
      "KEEP",
      "SHORTEN",
      "MAKE_ASYNC",
      "CANCEL",
      "REVIEW",
    ]),

    suggestedAction: z
      .string()
      .min(1)
      .max(500),
  });

export async function generateMeetingNecessityAI(
  input: {
    eventId: string;
    meetingData: unknown;
    history: unknown;
  },
): Promise<MeetingNecessityAIResult> {
  const fallback: MeetingNecessityAIResult = {
    explanation:
      "The meeting should be reviewed using its duration, participant count, importance, recurrence, and meeting history.",

    recommendation:
      "REVIEW",

    suggestedAction:
      "Consider keeping the meeting if synchronous discussion is required; otherwise shorten or convert it to an async update.",
  };

  const systemPrompt = `
You are an AI meeting-efficiency assistant for an enterprise HRMS.

Analyze whether a meeting should remain on the calendar.

Consider:
- Meeting duration
- Number of participants
- Recurring status
- Historical meetings
- Important/critical status
- Existing deterministic necessity score

Rules:
- Use ONLY the supplied meeting data and history.
- Never invent meeting history.
- Never claim a meeting is unnecessary solely because it has few participants.
- Critical meetings must not be recommended for cancellation.
- Do not change or override the deterministic score.
- AI only explains the deterministic result and recommends a practical action.
- Return JSON only.

Output:
{
  "explanation": "why the meeting received its result",
  "recommendation": "KEEP | SHORTEN | MAKE_ASYNC | CANCEL | REVIEW",
  "suggestedAction": "practical next step"
}
`;

  const userMessage = `
Analyze this meeting.

Event ID:
${input.eventId}

Meeting analysis:
${JSON.stringify(
  input.meetingData,
  null,
  2,
)}

Historical meeting information:
${JSON.stringify(
  input.history,
  null,
  2,
)}

Return JSON only.
`;

  return generateCalendarAI(
    systemPrompt,
    userMessage,
    meetingNecessityAISchema,
    fallback,
    {
      temperature: 0.2,
      maxTokens: 600,
      timeoutMs: 8000,
    },
  );
}

/* =========================================================
   4. SCHEDULE OPTIMIZER
========================================================= */

export type ScheduleOptimizerAIResult = {
  summary: string;
  priorityActions: string[];
  productivityRecommendation: string;
};

const scheduleOptimizerAISchema =
  z.object({
    summary: z
      .string()
      .min(1)
      .max(500),

    priorityActions: z
      .array(
        z.string().min(1).max(300),
      )
      .max(8),

    productivityRecommendation:
      z
        .string()
        .min(1)
        .max(500),
  });

export async function generateScheduleOptimizerAI(
  input: {
    employeeId: string;
    scheduleData: unknown;
    optimizationData: unknown;
  },
): Promise<ScheduleOptimizerAIResult> {
  const fallback: ScheduleOptimizerAIResult = {
    summary:
      "Your schedule was reviewed for conflicts, meeting load, focus time, and breaks.",

    priorityActions: [
      "Review back-to-back meetings.",
      "Protect uninterrupted focus time.",
      "Add breaks between long meeting blocks.",
    ],

    productivityRecommendation:
      "Use the deterministic optimization suggestions as the primary scheduling actions.",
  };

  const systemPrompt = `
You are an AI schedule optimization assistant for an enterprise HRMS.

Your task is to turn deterministic calendar analysis into clear scheduling recommendations.

Consider:
- Existing conflicts
- Back-to-back meetings
- Meeting duration
- Focus blocks
- Breaks
- Important events
- Critical events
- Existing optimization suggestions

Rules:
- Use ONLY the supplied schedule and optimization data.
- Never invent meetings.
- Never invent available times.
- Never recommend moving a critical meeting unless the supplied data explicitly supports it.
- Do not delete or modify calendar events.
- Only recommend actions.
- Prioritize the highest-impact improvements first.
- Do not override deterministic optimization results.
- Return JSON only.

Output:
{
  "summary": "short summary",
  "priorityActions": [
    "action 1",
    "action 2"
  ],
  "productivityRecommendation": "overall recommendation"
}
`;

  const userMessage = `
Optimize this employee's schedule.

Employee ID:
${input.employeeId}

Current schedule:
${JSON.stringify(
  input.scheduleData,
  null,
  2,
)}

Deterministic optimization analysis:
${JSON.stringify(
  input.optimizationData,
  null,
  2,
)}

Return JSON only.
`;

  return generateCalendarAI(
    systemPrompt,
    userMessage,
    scheduleOptimizerAISchema,
    fallback,
    {
      temperature: 0.3,
      maxTokens: 700,
      timeoutMs: 8000,
    },
  );
}
