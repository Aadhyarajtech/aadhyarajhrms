import * as repo from "./calendar.repository";

/* =========================================================
   TYPES
========================================================= */

export type CalendarConflictResult = {
  hasConflict: boolean;
  totalEvents: number;
  conflictCount: number;
  conflictingEvents: Array<{
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    employeeId: string;
    participantIds: string[];
    isImportant: boolean;
    isCritical: boolean;
  }>;
  unavailableEmployees: number;
  criticalEmployeesAffected: number;
  alternativeSlots: Array<{
    startAt: string;
    endAt: string;
  }>;
  impactLevel: "LOW" | "MEDIUM" | "HIGH";
  explanation: string;
};

export type CalendarHealthResult = {
  score: number;
  meetingHours: number;
  totalMeetingCount: number;
  backToBackMeetings: number;
  focusHours: number;
  focusTimeHours: number;
  breakHours: number;
  totalScheduledHours: number;
  meetingPercentage: number;
  busiestDay: string | null;
  recommendation: string;
  recommendations: string[];
};

export type MeetingNecessityResult = {
  score: number;
  recommendation:
    | "KEEP"
    | "SHORTEN"
    | "MAKE_ASYNC"
    | "CANCEL"
    | "REVIEW";
  reasons: string[];
  meetingDurationMinutes: number;
  participantCount: number;
  recurring: boolean;
  historicalMeetingCount: number;
};

export type ScheduleOptimizationResult = {
  optimized: boolean;
  suggestions: Array<{
    type:
      | "MOVE"
      | "FOCUS_BLOCK"
      | "BREAK"
      | "SHORTEN"
      | "REMOVE";
    title: string;
    reason: string;
    suggestedStartAt?: string;
    suggestedEndAt?: string;
  }>;
};

/* =========================================================
   HELPERS
========================================================= */

function toDate(value: string) {
  return new Date(value);
}

function durationMinutes(
  startAt: string,
  endAt: string,
) {
  const start = toDate(startAt).getTime();
  const end = toDate(endAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }

  return Math.max(0, (end - start) / 60000);
}

function overlaps(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
) {
  const aStart = toDate(startA).getTime();
  const aEnd = toDate(endA).getTime();
  const bStart = toDate(startB).getTime();
  const bEnd = toDate(endB).getTime();

  if (
    !Number.isFinite(aStart) ||
    !Number.isFinite(aEnd) ||
    !Number.isFinite(bStart) ||
    !Number.isFinite(bEnd)
  ) {
    return false;
  }

  return aStart < bEnd && aEnd > bStart;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function getDayKey(value: string) {
  const date = toDate(value);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-CA");
}

function getDistinctEmployeeIds(events: any[]) {
  const ids = new Set<string>();

  for (const event of events) {
    if (event.employeeId) {
      ids.add(String(event.employeeId));
    }

    for (const participantId of event.participantIds ?? []) {
      if (participantId) {
        ids.add(String(participantId));
      }
    }
  }

  return ids;
}

/* =========================================================
   1. AI TEAM CALENDAR CONFLICT RESOLVER
========================================================= */

/**
 * Deterministically detects conflicts for the proposed
 * calendar interval.
 *
 * AI should only explain the deterministic result and
 * provide human-readable recommendations.
 */
export async function analyzeCalendarConflict(input: {
  employeeId: string;
  startAt: string;
  endAt: string;
}) {
  if (
    !Number.isFinite(toDate(input.startAt).getTime()) ||
    !Number.isFinite(toDate(input.endAt).getTime()) ||
    toDate(input.endAt).getTime() <= toDate(input.startAt).getTime()
  ) {
    throw new Error("Invalid calendar conflict time range.");
  }

  const events = await repo.getEmployeeSchedule({
    employeeId: input.employeeId,
    startAt: input.startAt,
    endAt: input.endAt,
  });

  const scheduledEvents = events
    .filter(
      (event: any) =>
        event.status !== "CANCELLED" &&
        overlaps(
          input.startAt,
          input.endAt,
          event.startAt,
          event.endAt,
        ),
    )
    .sort(
      (a: any, b: any) =>
        toDate(a.startAt).getTime() -
        toDate(b.startAt).getTime(),
    );

  const conflictingEvents = scheduledEvents.map(
    (event: any) => ({
      id: event.id,
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      employeeId: event.employeeId,
      participantIds: event.participantIds ?? [],
      isImportant: Boolean(event.isImportant),
      isCritical: Boolean(event.isCritical),
    }),
  );

  const criticalEvents = scheduledEvents.filter(
    (event: any) => Boolean(event.isCritical),
  );

  const unavailableEmployeeIds =
    getDistinctEmployeeIds(scheduledEvents);

  const unavailableEmployees = Math.max(
    0,
    unavailableEmployeeIds.size -
      (unavailableEmployeeIds.has(input.employeeId) ? 1 : 0),
  );

  const criticalEmployeesAffected =
    new Set(
      criticalEvents.flatMap((event: any) => [
        event.employeeId,
        ...(event.participantIds ?? []),
      ]),
    ).size;

  let impactLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";

  if (
    criticalEvents.length > 0 ||
    scheduledEvents.length >= 3
  ) {
    impactLevel = "HIGH";
  } else if (
    scheduledEvents.some(
      (event: any) => Boolean(event.isImportant),
    ) ||
    scheduledEvents.length > 0
  ) {
    impactLevel = "MEDIUM";
  }

  /*
   * Build safe alternative slots from gaps in the employee's
   * existing schedule. We only suggest slots whose duration
   * can fit the proposed meeting; we do not invent availability.
   */
  const allEvents = events
    .filter(
      (event: any) =>
        event.status !== "CANCELLED" &&
        Number.isFinite(toDate(event.startAt).getTime()) &&
        Number.isFinite(toDate(event.endAt).getTime()),
    )
    .sort(
      (a: any, b: any) =>
        toDate(a.startAt).getTime() -
        toDate(b.startAt).getTime(),
    );

  const requestedDuration =
    durationMinutes(input.startAt, input.endAt);

  const alternativeSlots: Array<{
    startAt: string;
    endAt: string;
  }> = [];

  for (let i = 0; i < allEvents.length - 1; i++) {
    const current = allEvents[i];
    const next = allEvents[i + 1];

    const gapMinutes =
      (toDate(next.startAt).getTime() -
        toDate(current.endAt).getTime()) /
      60000;

    if (gapMinutes >= requestedDuration) {
      alternativeSlots.push({
        startAt: current.endAt,
        endAt: new Date(
          toDate(current.endAt).getTime() +
            requestedDuration * 60000,
        ).toISOString(),
      });
    }

    if (alternativeSlots.length >= 3) {
      break;
    }
  }

  let explanation = "No calendar conflict detected.";

  if (scheduledEvents.length > 0) {
    explanation =
      `${scheduledEvents.length} scheduled event(s) overlap the proposed time.`;
  }

  return {
    hasConflict: scheduledEvents.length > 0,
    totalEvents: events.filter(
      (event: any) => event.status !== "CANCELLED",
    ).length,
    conflictCount: scheduledEvents.length,
    conflictingEvents,
    unavailableEmployees,
    criticalEmployeesAffected,
    alternativeSlots,
    impactLevel,
    explanation,
  } satisfies CalendarConflictResult;
}

/* =========================================================
   2. AI EMPLOYEE CALENDAR HEALTH
========================================================= */

export async function analyzeCalendarHealth(input: {
  employeeId: string;
  startAt: string;
  endAt: string;
}) {
  const events = await repo.getEmployeeSchedule({
    employeeId: input.employeeId,
    startAt: input.startAt,
    endAt: input.endAt,
  });

  const activeEvents = events
    .filter(
      (event: any) =>
        event.status !== "CANCELLED" &&
        Number.isFinite(toDate(event.startAt).getTime()) &&
        Number.isFinite(toDate(event.endAt).getTime()),
    )
    .sort(
      (a: any, b: any) =>
        toDate(a.startAt).getTime() -
        toDate(b.startAt).getTime(),
    );

  const meetings = activeEvents.filter(
    (event: any) => event.type === "MEETING",
  );

  const focusEvents = activeEvents.filter(
    (event: any) => event.type === "FOCUS_TIME",
  );

  const breakEvents = activeEvents.filter(
    (event: any) => event.type === "BREAK",
  );

  const meetingMinutes = meetings.reduce(
    (total: number, event: any) =>
      total +
      durationMinutes(
        event.startAt,
        event.endAt,
      ),
    0,
  );

  const focusMinutes = focusEvents.reduce(
    (total: number, event: any) =>
      total +
      durationMinutes(
        event.startAt,
        event.endAt,
      ),
    0,
  );

  const breakMinutes = breakEvents.reduce(
    (total: number, event: any) =>
      total +
      durationMinutes(
        event.startAt,
        event.endAt,
      ),
    0,
  );

  const totalScheduledMinutes = activeEvents.reduce(
    (total: number, event: any) =>
      total +
      durationMinutes(
        event.startAt,
        event.endAt,
      ),
    0,
  );

  let backToBackMeetings = 0;

  for (let i = 0; i < meetings.length - 1; i++) {
    const current = meetings[i];
    const next = meetings[i + 1];

    if (
      toDate(current.endAt).getTime() >=
      toDate(next.startAt).getTime()
    ) {
      backToBackMeetings++;
    }
  }

  let score = 100;

  if (meetingMinutes > 360) {
    score -= 20;
  } else if (meetingMinutes > 240) {
    score -= 10;
  }

  score -= backToBackMeetings * 5;

  if (
    focusMinutes === 0 &&
    meetingMinutes > 120
  ) {
    score -= 15;
  }

  if (
    breakMinutes === 0 &&
    meetingMinutes > 180
  ) {
    score -= 10;
  }

  score = Math.max(
    0,
    Math.min(100, score),
  );

  let recommendation =
    "Your calendar looks balanced.";

  if (score < 60) {
    recommendation =
      "Reduce meeting load and create protected focus time.";
  } else if (score < 75) {
    recommendation =
      "Consider adding focus blocks and breaks between meetings.";
  } else if (backToBackMeetings >= 2) {
    recommendation =
      "Add short breaks between consecutive meetings.";
  }

  const recommendations: string[] = [];

  if (meetingMinutes > 240) {
    recommendations.push(
      "Reduce or redistribute meeting time.",
    );
  }

  if (backToBackMeetings > 0) {
    recommendations.push(
      "Avoid scheduling meetings without transition time.",
    );
  }

  if (focusMinutes === 0) {
    recommendations.push(
      "Protect at least one focus block.",
    );
  }

  if (breakMinutes === 0 && meetingMinutes > 180) {
    recommendations.push(
      "Add breaks during long meeting-heavy periods.",
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Maintain the current balance between meetings and focused work.",
    );
  }

  const dayMeetingMinutes = new Map<string, number>();

  for (const meeting of meetings) {
    const day = getDayKey(meeting.startAt);

    if (!day) {
      continue;
    }

    dayMeetingMinutes.set(
      day,
      (dayMeetingMinutes.get(day) ?? 0) +
        durationMinutes(
          meeting.startAt,
          meeting.endAt,
        ),
    );
  }

  let busiestDay: string | null = null;
  let busiestMinutes = 0;

  for (const [day, minutes] of dayMeetingMinutes) {
    if (minutes > busiestMinutes) {
      busiestDay = day;
      busiestMinutes = minutes;
    }
  }

  const totalScheduledHours =
    totalScheduledMinutes / 60;

  const meetingPercentage =
    totalScheduledMinutes > 0
      ? (meetingMinutes / totalScheduledMinutes) * 100
      : 0;

  return {
    score,
    meetingHours: round(meetingMinutes / 60),
    totalMeetingCount: meetings.length,
    backToBackMeetings,
    focusHours: round(focusMinutes / 60),
    focusTimeHours: round(focusMinutes / 60),
    breakHours: round(breakMinutes / 60),
    totalScheduledHours: round(
      totalScheduledHours,
    ),
    meetingPercentage: round(
      meetingPercentage,
    ),
    busiestDay,
    recommendation,
    recommendations,
  } satisfies CalendarHealthResult;
}

/* =========================================================
   3. AI MEETING NECESSITY SCORE
========================================================= */

export async function analyzeMeetingNecessity(input: {
  employeeId: string;
  eventId: string;
}) {
  const event = await repo.getEvent(
    input.eventId,
  );

  if (!event) {
    throw new Error(
      "Calendar event not found.",
    );
  }

  if (event.type !== "MEETING") {
    throw new Error(
      "Meeting necessity analysis is only available for meetings.",
    );
  }

  const participantIds =
    event.participantIds ?? [];

  const historicalMeetings =
    await repo.getMeetingHistory({
      employeeId: input.employeeId,
      title: event.title,
      participantIds,
      before: event.startAt,
      limit: 20,
    });

  const meetingDuration = durationMinutes(
    event.startAt,
    event.endAt,
  );

  const participantCount = new Set([
    event.employeeId,
    ...participantIds,
  ]).size;

  let score = 100;
  const reasons: string[] = [];

  if (meetingDuration > 120) {
    score -= 30;
    reasons.push(
      "The meeting duration is longer than two hours.",
    );
  } else if (meetingDuration > 60) {
    score -= 15;
    reasons.push(
      "The meeting is longer than one hour.",
    );
  }

  if (participantCount <= 2) {
    score -= 10;
    reasons.push(
      "The meeting has a small number of participants.",
    );
  }

  if (
    event.isRecurring &&
    historicalMeetings.length >= 4
  ) {
    score -= 20;
    reasons.push(
      "This appears to be a recurring meeting with repeated history.",
    );
  }

  if (event.isCritical) {
    score += 20;
    reasons.push(
      "The meeting is marked as critical.",
    );
  } else if (event.isImportant) {
    score += 10;
    reasons.push(
      "The meeting is marked as important.",
    );
  }

  score = Math.max(
    0,
    Math.min(100, score),
  );

  let recommendation:
    | "KEEP"
    | "SHORTEN"
    | "MAKE_ASYNC"
    | "CANCEL"
    | "REVIEW" = "KEEP";

  if (score < 40 && !event.isCritical) {
    recommendation = "CANCEL";
  } else if (
    score < 55 &&
    !event.isCritical
  ) {
    recommendation = "MAKE_ASYNC";
  } else if (score < 75) {
    recommendation = "SHORTEN";
  } else if (
    event.isCritical ||
    event.isImportant
  ) {
    recommendation = "KEEP";
  }

  if (!reasons.length) {
    reasons.push(
      "The meeting appears reasonable based on the available calendar data.",
    );
  }

  return {
    score,
    recommendation,
    reasons,
    meetingDurationMinutes: round(
      meetingDuration,
    ),
    participantCount,
    recurring: Boolean(event.isRecurring),
    historicalMeetingCount:
      historicalMeetings.length,
  } satisfies MeetingNecessityResult;
}

/* =========================================================
   4. AI SCHEDULE OPTIMIZER
========================================================= */

export async function optimizeSchedule(input: {
  employeeId: string;
  startAt: string;
  endAt: string;
}) {
  const events = await repo.getEmployeeSchedule({
    employeeId: input.employeeId,
    startAt: input.startAt,
    endAt: input.endAt,
  });

  const activeEvents = events
    .filter(
      (event: any) =>
        event.status !== "CANCELLED" &&
        Number.isFinite(toDate(event.startAt).getTime()) &&
        Number.isFinite(toDate(event.endAt).getTime()),
    )
    .sort(
      (a: any, b: any) =>
        toDate(a.startAt).getTime() -
        toDate(b.startAt).getTime(),
    );

  const suggestions: ScheduleOptimizationResult["suggestions"] =
    [];

  const meetings = activeEvents.filter(
    (event: any) => event.type === "MEETING",
  );

  /*
   * Detect overlapping/back-to-back meetings.
   */
  for (let i = 0; i < meetings.length - 1; i++) {
    const current = meetings[i];
    const next = meetings[i + 1];

    const gapMinutes =
      (toDate(next.startAt).getTime() -
        toDate(current.endAt).getTime()) /
      60000;

    if (gapMinutes <= 0) {
      suggestions.push({
        type: "BREAK",
        title:
          `Add a break after "${current.title}"`,
        reason:
          "The meetings are scheduled back-to-back or overlap.",
      });
    }
  }

  /*
   * Detect long non-critical meetings.
   */
  for (const meeting of meetings) {
    const minutes = durationMinutes(
      meeting.startAt,
      meeting.endAt,
    );

    if (
      minutes > 60 &&
      !meeting.isCritical
    ) {
      suggestions.push({
        type: "SHORTEN",
        title:
          `Review "${meeting.title}" duration`,
        reason:
          "The meeting is longer than one hour and is not marked critical.",
      });
    }
  }

  /*
   * Find gaps that can become focus blocks.
   */
  for (
    let i = 0;
    i < activeEvents.length - 1;
    i++
  ) {
    const current = activeEvents[i];
    const next = activeEvents[i + 1];

    const gapMinutes =
      (toDate(next.startAt).getTime() -
        toDate(current.endAt).getTime()) /
      60000;

    if (gapMinutes >= 60) {
      suggestions.push({
        type: "FOCUS_BLOCK",
        title: "Protect a focus block",
        reason:
          `There is approximately ${Math.round(
            gapMinutes,
          )} minutes of available time.`,
        suggestedStartAt:
          current.endAt,
        suggestedEndAt:
          next.startAt,
      });
    }
  }

  /*
   * If there are no events, recommend a focus block.
   */
  if (activeEvents.length === 0) {
    suggestions.push({
      type: "FOCUS_BLOCK",
      title: "Create a focus block",
      reason:
        "No scheduled events were found in the selected period.",
      suggestedStartAt: input.startAt,
      suggestedEndAt: input.endAt,
    });
  }

  /*
   * If only one event exists, preserve the remaining period
   * as a potential focus block when enough time remains.
   */
  if (activeEvents.length === 1) {
    const onlyEvent = activeEvents[0];

    const beforeMinutes =
      (toDate(onlyEvent.startAt).getTime() -
        toDate(input.startAt).getTime()) /
      60000;

    const afterMinutes =
      (toDate(input.endAt).getTime() -
        toDate(onlyEvent.endAt).getTime()) /
      60000;

    if (beforeMinutes >= 60) {
      suggestions.push({
        type: "FOCUS_BLOCK",
        title: "Protect focus time before the event",
        reason:
          `There is approximately ${Math.round(
            beforeMinutes,
          )} minutes available before the scheduled event.`,
        suggestedStartAt: input.startAt,
        suggestedEndAt: onlyEvent.startAt,
      });
    }

    if (afterMinutes >= 60) {
      suggestions.push({
        type: "FOCUS_BLOCK",
        title: "Protect focus time after the event",
        reason:
          `There is approximately ${Math.round(
            afterMinutes,
          )} minutes available after the scheduled event.`,
        suggestedStartAt: onlyEvent.endAt,
        suggestedEndAt: input.endAt,
      });
    }
  }

  return {
    optimized: suggestions.length === 0,
    suggestions,
  } satisfies ScheduleOptimizationResult;
}
