import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  MapPin,
  Clock3,
  Megaphone,
  RefreshCw,
  Brain,
  Sparkles,
  AlertTriangle,
  Activity,
  WandSparkles,
  CheckCircle2,
} from "lucide-react";

import {
  AnnouncementsApi,
  AuthApi,
  CalendarApi,
} from "@/lib/endpoints";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

import type { Announcement as AppAnnouncement } from "@/types";

type CalendarEvent = {
  id: string;
  title: string;
  body: string;
  start: Date;
  end?: Date;
  location?: string;
  type: string;
  pinned: boolean;
  source: "ANNOUNCEMENT" | "CALENDAR";
  calendarEventId?: string;
  status?: string;
  isImportant?: boolean;
  isCritical?: boolean;
  participantCount?: number;
};

const WEEKDAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

/* =========================================================
   DATE HELPERS
========================================================= */

function isValidDate(value: unknown): value is Date {
  return (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  );
}

function parseDate(
  value?: string | null,
): Date | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);

  if (isValidDate(date)) {
    return date;
  }

  return null;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
}

function isPastDate(date: Date) {
  const today = startOfDay(new Date());

  return (
    startOfDay(date).getTime() <
    today.getTime()
  );
}

function isCurrentOrFutureMonth(month: Date) {
  const today = new Date();

  const currentMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    1,
  );

  const targetMonth = new Date(
    month.getFullYear(),
    month.getMonth(),
    1,
  );

  return (
    targetMonth.getTime() >=
    currentMonth.getTime()
  );
}

function buildCalendarDays(month: Date): Date[] {
  const first = new Date(
    month.getFullYear(),
    month.getMonth(),
    1,
  );

  const last = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  );

  const start = new Date(first);

  start.setDate(
    first.getDate() - first.getDay(),
  );

  const end = new Date(last);

  end.setDate(
    last.getDate() +
      (6 - last.getDay()),
  );

  const days: Date[] = [];

  const cursor = new Date(start);

  while (cursor <= end) {
    days.push(new Date(cursor));

    cursor.setDate(
      cursor.getDate() + 1,
    );
  }

  return days;
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatTime(date?: Date) {
  if (!date || !isValidDate(date)) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getAnnouncementTypeLabel(type: string) {
  switch (type) {
    case "COMPANY_EVENT":
      return "Company Event";

    case "MEETING_NOTICE":
      return "Meeting Notice";

    case "HOLIDAY_NOTICE":
      return "Holiday Notice";

    case "POLICY_UPDATE":
      return "Policy Update";

    case "EMPLOYEE_RECOGNITION":
      return "Employee Recognition";

    case "BENEFITS_UPDATE":
      return "Benefits Update";

    case "TRAINING_LD":
      return "Training & L&D";

    default:
      return "General Notice";
  }
}

/* =========================================================
   CALENDAR EVENT CONVERTER
========================================================= */

function announcementToCalendarEvent(
  announcement: AppAnnouncement,
): CalendarEvent | null {
  /*
   * Only published announcements should be visible
   * to employees in the calendar.
   */
  if (
    announcement.status !== undefined &&
    announcement.status !== "PUBLISHED"
  ) {
    return null;
  }

  /*
   * Company Event and Meeting Notice are automatically
   * considered calendar events when eventStartAt exists.
   *
   * Other announcement types require calendarEnabled.
   */
  const isEventType =
    announcement.type ===
      "COMPANY_EVENT" ||
    announcement.type ===
      "MEETING_NOTICE";

  const hasCalendarFlag =
    announcement.calendarEnabled === true;

  /*
   * Also support CALENDAR channel for announcements
   * returned by older/newer backend versions.
   */
  const hasCalendarChannel =
    announcement.channels?.some(
      (channel: string) =>
        channel.toUpperCase() ===
        "CALENDAR",
    ) === true;

  if (
    !isEventType &&
    !hasCalendarFlag &&
    !hasCalendarChannel
  ) {
    return null;
  }

  if (!announcement.eventStartAt) {
    return null;
  }

  const start = parseDate(
    announcement.eventStartAt,
  );

  if (!start) {
    return null;
  }

  const end = parseDate(
    announcement.eventEndAt,
  );

  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    start,
    end: end ?? undefined,
    location:
      announcement.eventLocation?.trim() ||
      undefined,
    type: announcement.type,
    pinned: announcement.pinned === true,
    source: "ANNOUNCEMENT",
  };
}

function calendarApiEventToCalendarEvent(
  event: {
    _id: string;
    title: string;
    description: string;
    type: string;
    status: string;
    startAt: string;
    endAt: string;
    location: string;
    isImportant: boolean;
    isCritical: boolean;
    participantIds: string[];
  },
): CalendarEvent | null {
  const start = parseDate(event.startAt);
  const end = parseDate(event.endAt);

  if (!start || !end) {
    return null;
  }

  return {
    id: `calendar-${event._id}`,
    calendarEventId: event._id,
    title: event.title,
    body: event.description || "",
    start,
    end,
    location:
      event.location?.trim() || undefined,
    type: event.type,
    pinned: event.isImportant === true,
    source: "CALENDAR",
    status: event.status,
    isImportant: event.isImportant,
    isCritical: event.isCritical,
    participantCount:
      Array.isArray(event.participantIds)
        ? event.participantIds.length
        : 0,
  };
}

/* =========================================================
   PAGE
========================================================= */

export default function Calendar() {
  const [currentMonth, setCurrentMonth] =
    useState<Date>(() => {
      const now = new Date();

      return new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
      );
    });

  const [selectedDate, setSelectedDate] =
    useState<Date>(() => {
      return startOfDay(new Date());
    });

  /* =======================================================
     CURRENT USER
  ======================================================= */

  const { data: currentUser } =
    useQuery({
      queryKey: ["auth", "me"],
      queryFn: AuthApi.me,
      staleTime: 5 * 60 * 1000,
    });

  const employeeId = useMemo(() => {
    const user = currentUser as
      | {
          employeeId?: string | null;
          employee?: {
            id?: string | null;
          } | null;
        }
      | null
      | undefined;

    return (
      user?.employeeId ||
      user?.employee?.id ||
      null
    );
  }, [currentUser]);

  /* =======================================================
     CALENDAR RANGE
  ======================================================= */

  const calendarDays = useMemo(
    () =>
      buildCalendarDays(currentMonth),
    [currentMonth],
  );

  const calendarRange = useMemo(() => {
    const first =
      calendarDays[0] ??
      startOfDay(currentMonth);

    const last =
      calendarDays[
        calendarDays.length - 1
      ] ??
      startOfDay(currentMonth);

    const end = new Date(last);

    end.setDate(end.getDate() + 1);

    return {
      startAt: first.toISOString(),
      endAt: end.toISOString(),
    };
  }, [calendarDays, currentMonth]);

  /* =======================================================
     ANNOUNCEMENTS API
  ======================================================= */

  const {
    data: announcements = [],
    isLoading: announcementsLoading,
    isFetching: announcementsFetching,
    isError: announcementsError,
    refetch: refetchAnnouncements,
  } = useQuery<
    AppAnnouncement[],
    Error
  >({
    queryKey: [
      "announcements",
      "calendar",
    ],

    queryFn:
      async (): Promise<
        AppAnnouncement[]
      > => {
        const result =
          await AnnouncementsApi.list();

        return Array.isArray(result)
          ? (result as AppAnnouncement[])
          : [];
      },

    refetchInterval: 15000,
    staleTime: 0,
  });

  /* =======================================================
     CALENDAR EVENTS API
  ======================================================= */

  const {
    data: apiCalendarEvents = [],
    isLoading: calendarEventsLoading,
    isFetching: calendarEventsFetching,
    isError: calendarEventsError,
    refetch: refetchCalendarEvents,
  } = useQuery({
    queryKey: [
      "calendar",
      employeeId,
      calendarRange.startAt,
      calendarRange.endAt,
    ],

    queryFn: () =>
      CalendarApi.list(
        employeeId!,
        calendarRange.startAt,
        calendarRange.endAt,
      ),

    enabled: Boolean(employeeId),
    refetchInterval: 15000,
    staleTime: 0,
  });

  /* =======================================================
     AI ANALYSIS
  ======================================================= */

  const selectedDayRange = useMemo(() => {
    const start =
      startOfDay(selectedDate);

    const end = new Date(start);

    end.setDate(
      end.getDate() + 1,
    );

    return {
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    };
  }, [selectedDate]);

  const [aiError, setAiError] =
    useState<string | null>(null);

  const conflictQuery = useQuery({
    queryKey: [
      "calendar",
      "ai-conflict",
      employeeId,
      selectedDayRange.startAt,
      selectedDayRange.endAt,
    ],

    queryFn: () =>
      CalendarApi.aiConflict(
        employeeId!,
        selectedDayRange.startAt,
        selectedDayRange.endAt,
      ),

    enabled: false,
  });

  const healthQuery = useQuery({
    queryKey: [
      "calendar",
      "ai-health",
      employeeId,
      selectedDayRange.startAt,
      selectedDayRange.endAt,
    ],

    queryFn: () =>
      CalendarApi.aiHealth(
        employeeId!,
        selectedDayRange.startAt,
        selectedDayRange.endAt,
      ),

    enabled: false,
  });

  const optimizeQuery = useQuery({
    queryKey: [
      "calendar",
      "ai-optimize",
      employeeId,
      selectedDayRange.startAt,
      selectedDayRange.endAt,
    ],

    queryFn: () =>
      CalendarApi.aiOptimize(
        employeeId!,
        selectedDayRange.startAt,
        selectedDayRange.endAt,
      ),

    enabled: false,
  });

  const [
    selectedMeetingId,
    setSelectedMeetingId,
  ] = useState<string | null>(null);

  const meetingNecessityQuery =
    useQuery({
      queryKey: [
        "calendar",
        "ai-meeting-necessity",
        selectedMeetingId,
      ],

      queryFn: () =>
        CalendarApi.aiMeetingNecessity(
          selectedMeetingId!,
        ),

      enabled:
        Boolean(selectedMeetingId),
    });

  const events = useMemo<
    CalendarEvent[]
  >(() => {
    const result: CalendarEvent[] = [];

    for (const announcement of announcements) {
      const event =
        announcementToCalendarEvent(
          announcement,
        );

      if (event) {
        result.push(event);
      }
    }

    for (const apiEvent of apiCalendarEvents) {
      const event =
        calendarApiEventToCalendarEvent(
          apiEvent,
        );

      if (event) {
        result.push(event);
      }
    }

    return result.sort(
      (
        first: CalendarEvent,
        second: CalendarEvent,
      ) =>
        first.start.getTime() -
        second.start.getTime(),
    );
  }, [
    announcements,
    apiCalendarEvents,
  ]);

  const isLoading =
    announcementsLoading ||
    calendarEventsLoading;

  const isFetching =
    announcementsFetching ||
    calendarEventsFetching;

  const isError =
    announcementsError ||
    calendarEventsError;

  const handleRefresh = async () => {
    await Promise.all([
      refetchAnnouncements(),
      refetchCalendarEvents(),
    ]);
  };

  /* =======================================================
     SELECTED DAY EVENTS
  ======================================================= */

  const selectedEvents = useMemo(() => {
    const filtered = events.filter(
      (event: CalendarEvent) =>
        sameDay(
          event.start,
          selectedDate,
        ),
    );

    return filtered.sort(
      (
        first: CalendarEvent,
        second: CalendarEvent,
      ) =>
        first.start.getTime() -
        second.start.getTime(),
    );
  }, [events, selectedDate]);

  /* =======================================================
     TODAY
  ======================================================= */

  const today =
    startOfDay(new Date());

  const canGoToPreviousMonth =
    useMemo(() => {
      const previousMonth =
        new Date(
          currentMonth.getFullYear(),
          currentMonth.getMonth() - 1,
          1,
        );

      return isCurrentOrFutureMonth(
        previousMonth,
      );
    }, [currentMonth]);

  /* =======================================================
     NAVIGATION
  ======================================================= */

  const goToPreviousMonth = () => {
    const previousMonth =
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() - 1,
        1,
      );

    if (
      !isCurrentOrFutureMonth(
        previousMonth,
      )
    ) {
      return;
    }

    setCurrentMonth(
      previousMonth,
    );
  };

  const goToNextMonth = () => {
    setCurrentMonth(
      (month: Date) =>
        new Date(
          month.getFullYear(),
          month.getMonth() + 1,
          1,
        ),
    );
  };

  const goToToday = () => {
    const now = new Date();

    setCurrentMonth(
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
      ),
    );

    setSelectedDate(
      startOfDay(now),
    );
  };

  const handleDateSelect = (
    date: Date,
  ) => {
    if (isPastDate(date)) {
      return;
    }

    setSelectedDate(date);
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="premium-page w-full">
      {/* ===================================================
          HEADER
      =================================================== */}

      <div className="relative mb-7 flex flex-col gap-4 overflow-hidden rounded-[24px] border border-slate-200/70 bg-gradient-to-r from-white via-white to-[#F8F6FF] px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.045)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays
              size={22}
              className="text-brand-600"
            />

            <h1 className="font-display text-[28px] font-semibold tracking-[-0.025em] text-ink">
              Calendar
            </h1>
          </div>

          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
            Company events, meetings
            and important
            announcements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isFetching}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={15}
              className={
                isFetching
                  ? "animate-spin"
                  : ""
              }
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={goToToday}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
          >
            Today
          </button>
        </div>
      </div>

      {/* ===================================================
          AI CALENDAR ASSISTANT
      =================================================== */}

      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-line/60 bg-gradient-to-r from-brand-50/80 to-white px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <Brain size={19} />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-ink">
                    AI Calendar Assistant
                  </h2>

                  <Badge
                    tone="brand"
                    className="px-2 py-0.5 text-[10px]"
                  >
                    AI
                  </Badge>
                </div>

                <p className="mt-1 text-xs text-ink-faint">
                  Analyze conflicts,
                  calendar health and
                  optimize your day.
                </p>
              </div>
            </div>

            {!employeeId && (
              <p className="text-xs text-amber-600">
                Employee profile is not
                available yet.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-3">
          <button
            type="button"
            disabled={
              !employeeId ||
              conflictQuery.isFetching
            }
            onClick={() => {
              setAiError(null);
              void conflictQuery.refetch();
            }}
            className="rounded-2xl border border-line/70 bg-white p-4 text-left transition hover:border-brand-300 hover:bg-brand-50/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <AlertTriangle
                  size={17}
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-ink">
                  Team Conflict
                </p>

                <p className="mt-0.5 text-[11px] text-ink-faint">
                  Check unavailable and
                  affected members
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={
              !employeeId ||
              healthQuery.isFetching
            }
            onClick={() => {
              setAiError(null);
              void healthQuery.refetch();
            }}
            className="rounded-2xl border border-line/70 bg-white p-4 text-left transition hover:border-brand-300 hover:bg-brand-50/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Activity
                  size={17}
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-ink">
                  Calendar Health
                </p>

                <p className="mt-0.5 text-[11px] text-ink-faint">
                  Score meetings, focus
                  time and breaks
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={
              !employeeId ||
              optimizeQuery.isFetching
            }
            onClick={() => {
              setAiError(null);
              void optimizeQuery.refetch();
            }}
            className="rounded-2xl border border-line/70 bg-white p-4 text-left transition hover:border-brand-300 hover:bg-brand-50/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <WandSparkles
                  size={17}
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-ink">
                  Optimize My Day
                </p>

                <p className="mt-0.5 text-[11px] text-ink-faint">
                  Reduce conflicts and
                  improve focus time
                </p>
              </div>
            </div>
          </button>
        </div>

        {(aiError ||
          conflictQuery.isError ||
          healthQuery.isError ||
          optimizeQuery.isError ||
          meetingNecessityQuery.isError) && (
          <div className="mx-5 mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {aiError ||
              (conflictQuery.isError
                ? "Unable to analyze calendar conflicts."
                : healthQuery.isError
                  ? "Unable to analyze calendar health."
                  : optimizeQuery.isError
                    ? "Unable to optimize your schedule."
                    : "Unable to analyze meeting necessity.")}
          </div>
        )}

        {conflictQuery.data && (
          <div className="mx-5 mb-5 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-start gap-3">
              {conflictQuery.data
                .hasConflict ? (
                <AlertTriangle
                  size={18}
                  className="mt-0.5 shrink-0 text-amber-600"
                />
              ) : (
                <CheckCircle2
                  size={18}
                  className="mt-0.5 shrink-0 text-emerald-600"
                />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {conflictQuery.data
                    .hasConflict
                    ? "Team Conflict Detected"
                    : "No Team Conflict Detected"}
                </p>

                <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                  {conflictQuery.data.ai
                    ?.summary ||
                    conflictQuery.data
                      .explanation}
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] text-ink-faint">
                      Conflicts
                    </p>

                    <p className="text-sm font-semibold text-ink">
                      {
                        conflictQuery
                          .data
                          .conflictCount
                      }
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] text-ink-faint">
                      Unavailable
                    </p>

                    <p className="text-sm font-semibold text-ink">
                      {
                        conflictQuery
                          .data
                          .unavailableEmployees
                      }
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] text-ink-faint">
                      Critical affected
                    </p>

                    <p className="text-sm font-semibold text-ink">
                      {
                        conflictQuery
                          .data
                          .criticalEmployeesAffected
                      }
                    </p>
                  </div>
                </div>

                {(conflictQuery.data.ai
                  ?.recommendedAlternativeTime ||
                  conflictQuery.data
                    .alternativeSlots
                    .length > 0) && (
                  <div className="mt-3 rounded-xl border border-brand-200 bg-white px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                      Recommended alternative
                    </p>

                    <p className="mt-1 text-xs text-ink">
                      {conflictQuery.data.ai
                        ?.recommendedAlternativeTime ||
                        `${formatTime(
                          new Date(
                            conflictQuery.data
                              .alternativeSlots[0]
                              .startAt,
                          ),
                        )} - ${formatTime(
                          new Date(
                            conflictQuery.data
                              .alternativeSlots[0]
                              .endAt,
                          ),
                        )}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {healthQuery.data && (
          <div className="mx-5 mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex items-start gap-3">
              <Activity
                size={18}
                className="mt-0.5 shrink-0 text-emerald-600"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Calendar Health
                    </p>

                    <p className="mt-1 text-xs text-ink-faint">
                      {healthQuery.data.ai
                        ?.summary ||
                        healthQuery.data
                          .explanation}
                    </p>
                  </div>

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-emerald-200 bg-white text-sm font-bold text-ink">
                    {Math.round(
                      healthQuery.data
                        .score,
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] text-ink-faint">
                      Meeting hours
                    </p>

                    <p className="text-sm font-semibold text-ink">
                      {healthQuery.data.meetingHours.toFixed(
                        1,
                      )}
                      h
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] text-ink-faint">
                      Back-to-back
                    </p>

                    <p className="text-sm font-semibold text-ink">
                      {
                        healthQuery
                          .data
                          .backToBackMeetings
                      }
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] text-ink-faint">
                      Focus time
                    </p>

                    <p className="text-sm font-semibold text-ink">
                      {healthQuery.data.focusTimeHours.toFixed(
                        1,
                      )}
                      h
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] text-ink-faint">
                      Breaks
                    </p>

                    <p className="text-sm font-semibold text-ink">
                      {healthQuery.data.breakHours.toFixed(
                        1,
                      )}
                      h
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-ink-faint">
                  {healthQuery.data.ai
                    ?.recommendation ||
                    healthQuery.data
                      .recommendations[0] ||
                    "No additional recommendation."}
                </p>
              </div>
            </div>
          </div>
        )}

        {optimizeQuery.data && (
          <div className="mx-5 mb-5 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
            <div className="flex items-start gap-3">
              <WandSparkles
                size={18}
                className="mt-0.5 shrink-0 text-violet-600"
              />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  Schedule Optimization
                </p>

                <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                  {optimizeQuery.data.ai
                    ?.summary ||
                    optimizeQuery.data
                      .explanation}
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] text-ink-faint">
                      Conflicts reduced
                    </p>

                    <p className="text-sm font-semibold text-ink">
                      {
                        optimizeQuery
                          .data
                          .conflictsReduced
                      }
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] text-ink-faint">
                      Focus blocks
                    </p>

                    <p className="text-sm font-semibold text-ink">
                      {
                        optimizeQuery
                          .data
                          .focusBlocksAdded
                      }
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] text-ink-faint">
                      Breaks added
                    </p>

                    <p className="text-sm font-semibold text-ink">
                      {
                        optimizeQuery
                          .data
                          .breaksAdded
                      }
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] text-ink-faint">
                      Back-to-back reduced
                    </p>

                    <p className="text-sm font-semibold text-ink">
                      {
                        optimizeQuery
                          .data
                          .backToBackMeetingsReduced
                      }
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-ink-faint">
                  {optimizeQuery.data.ai
                    ?.productivityRecommendation ||
                    optimizeQuery.data
                      .recommendations[0] ||
                    "Your schedule has been analyzed."}
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ===================================================
          ERROR
      =================================================== */}

      {isError && (
        <Card className="mb-6 border-rose-200/70 bg-gradient-to-r from-rose-50/70 to-white">
          <div className="p-5">
            <p className="text-sm font-semibold text-rose-700">
              Failed to load calendar
              events.
            </p>

            <button
              type="button"
              onClick={handleRefresh}
              className="mt-3 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
            >
              Try again
            </button>
          </div>
        </Card>
      )}

      {/* ===================================================
          MAIN CONTENT
      =================================================== */}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* =================================================
            CALENDAR
        ================================================= */}

        <Card className="overflow-hidden shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
          <CardHeader
            title={currentMonth.toLocaleDateString(
              [],
              {
                month: "long",
                year: "numeric",
              },
            )}
            action={
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={
                    goToPreviousMonth
                  }
                  disabled={
                    !canGoToPreviousMonth
                  }
                  className={[
                    "rounded-lg p-2 transition",
                    canGoToPreviousMonth
                      ? "text-ink-faint hover:bg-surface hover:text-ink"
                      : "cursor-not-allowed text-ink-faint/40 opacity-50",
                  ].join(" ")}
                  aria-label="Previous month"
                  title={
                    canGoToPreviousMonth
                      ? "Previous month"
                      : "Past months are not available"
                  }
                >
                  <ChevronLeft
                    size={18}
                  />
                </button>

                <button
                  type="button"
                  onClick={goToNextMonth}
                  className="rounded-lg p-2 text-ink-faint transition hover:bg-surface hover:text-ink"
                  aria-label="Next month"
                  title="Next month"
                >
                  <ChevronRight
                    size={18}
                  />
                </button>
              </div>
            }
          />

          <div className="border-t border-slate-200/70">
            <div className="grid grid-cols-7 border-b border-slate-200/70 bg-slate-50/70">
              {WEEKDAYS.map(
                (day: string) => (
                  <div
                    key={day}
                    className="px-2 py-3 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"
                  >
                    {day}
                  </div>
                ),
              )}
            </div>

            <div className="grid grid-cols-7">
              {calendarDays.map(
                (day: Date) => {
                  const dayEvents =
                    events
                      .filter(
                        (
                          event: CalendarEvent,
                        ) =>
                          sameDay(
                            event.start,
                            day,
                          ),
                      )
                      .sort(
                        (
                          first: CalendarEvent,
                          second: CalendarEvent,
                        ) =>
                          first.start.getTime() -
                          second.start.getTime(),
                      );

                  const isCurrentMonth =
                    day.getMonth() ===
                      currentMonth.getMonth() &&
                    day.getFullYear() ===
                      currentMonth.getFullYear();

                  const isToday =
                    sameDay(day, today);

                  const isSelected =
                    sameDay(
                      day,
                      selectedDate,
                    );

                  const isPast =
                    isPastDate(day);

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() =>
                        handleDateSelect(day)
                      }
                      disabled={isPast}
                      className={[
                        "group relative flex min-h-[125px] flex-col border-b border-r border-slate-200/60 p-2.5 text-left transition-all duration-200",

                        !isPast
                          ? "hover:bg-brand-50/50 hover:shadow-[inset_0_0_0_1px_rgba(91,79,229,0.10)]"
                          : "cursor-not-allowed bg-surface/20 opacity-35",

                        !isCurrentMonth &&
                        !isPast
                          ? "bg-slate-50/60"
                          : "",

                        isCurrentMonth &&
                        !isPast
                          ? "bg-white"
                          : "",

                        isSelected &&
                        !isPast
                          ? "bg-brand-50/70 ring-1 ring-inset ring-brand-300 shadow-[inset_0_0_0_1px_rgba(91,79,229,0.12)]"
                          : "",
                      ].join(" ")}
                      aria-label={formatLongDate(
                        day,
                      )}
                      title={
                        isPast
                          ? "Past dates are not available"
                          : formatLongDate(
                              day,
                            )
                      }
                    >
                      <div className="flex min-h-7 w-full items-start justify-between gap-2">
                        <span
                          className={[
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",

                            isPast
                              ? "text-ink-faint/50"
                              : !isCurrentMonth
                                ? "text-ink-faint"
                                : "text-ink",

                            isToday
                              ? "bg-brand-600 text-white shadow-[0_4px_10px_rgba(91,79,229,0.22)]"
                              : "",
                          ].join(" ")}
                        >
                          {day.getDate()}
                        </span>

                        {!isPast &&
                          dayEvents.length >
                            0 && (
                            <span
                              className={[
                                "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",

                                isSelected
                                  ? "bg-brand-600 text-white shadow-[0_4px_10px_rgba(91,79,229,0.22)]"
                                  : "bg-brand-50 text-brand-700",
                              ].join(" ")}
                              title={`${dayEvents.length} event${
                                dayEvents.length ===
                                1
                                  ? ""
                                  : "s"
                              }`}
                            >
                              {
                                dayEvents.length
                              }
                            </span>
                          )}
                      </div>

                      {!isPast && (
                        <div className="mt-2 min-w-0 flex-1 space-y-1 overflow-hidden">
                          {dayEvents
                            .slice(0, 3)
                            .map(
                              (
                                event: CalendarEvent,
                              ) => (
                                <div
                                  key={
                                    event.id
                                  }
                                  title={`${formatTime(
                                    event.start,
                                  )} - ${event.title}`}
                                  className={[
                                    "block w-full min-w-0 truncate rounded-lg border border-brand-100/70 px-2 py-1.5 text-[10px] font-semibold leading-tight shadow-sm",

                                    event.pinned
                                      ? "bg-brand-100 text-brand-700"
                                      : "bg-brand-50 text-brand-700",
                                  ].join(
                                    " ",
                                  )}
                                >
                                  <span className="font-semibold">
                                    {formatTime(
                                      event.start,
                                    )}
                                  </span>

                                  <span className="mx-1">
                                    ·
                                  </span>

                                  <span>
                                    {
                                      event.title
                                    }
                                  </span>
                                </div>
                              ),
                            )}

                          {dayEvents.length >
                            3 && (
                            <div className="px-1 pt-0.5 text-[10px] font-medium text-ink-faint">
                              +
                              {dayEvents.length -
                                3}{" "}
                              more
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        </Card>

        {/* =================================================
            SELECTED DATE EVENTS
        ================================================= */}

        <Card>
          <CardHeader
            title="Events"
            subtitle={formatLongDate(
              selectedDate,
            )}
          />

          <div className="space-y-4 px-5 pb-5">
            {isLoading ? (
              <p className="text-sm text-ink-faint">
                Loading events...
              </p>
            ) : selectedEvents.length ===
              0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-7 text-center">
                <CalendarDays
                  size={24}
                  className="mx-auto text-ink-faint"
                />

                <p className="mt-2 text-sm font-medium text-ink">
                  No events
                </p>

                <p className="mt-1 text-xs text-ink-faint">
                  Nothing is scheduled
                  for this day.
                </p>
              </div>
            ) : (
              selectedEvents.map(
                (
                  event: CalendarEvent,
                ) => (
                  <div
                    key={event.id}
                    className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50/70 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_12px_25px_rgba(15,23,42,0.07)]"
                  >
                    <div className="flex items-start gap-3">
                      {/* FIXED: icon div now correctly stays inside the flex row */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-white text-brand-600 shadow-sm ring-1 ring-brand-100">
                        {event.source ===
                        "CALENDAR" ? (
                          <CalendarDays
                            size={17}
                          />
                        ) : (
                          <Megaphone
                            size={17}
                          />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[14px] font-bold text-slate-800">
                            {event.title}
                          </h3>

                          {event.pinned && (
                            <Badge
                              tone="brand"
                              className="px-2 py-0.5 text-[10px]"
                            >
                              Pinned
                            </Badge>
                          )}

                          {event.source ===
                            "CALENDAR" && (
                            <Badge
                              tone="brand"
                              className="px-2 py-0.5 text-[10px]"
                            >
                              Calendar
                            </Badge>
                          )}

                          {event.isCritical && (
                            <Badge
                              tone="brand"
                              className="px-2 py-0.5 text-[10px]"
                            >
                              Critical
                            </Badge>
                          )}
                        </div>

                        <div className="mt-2">
                          <span className="inline-flex rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[10px] font-bold text-brand-700">
                            {event.source ===
                            "CALENDAR"
                              ? event.type
                                  .replaceAll(
                                    "_",
                                    " ",
                                  )
                                  .toLowerCase()
                                  .replace(
                                    /\b\w/g,
                                    (
                                      char,
                                    ) =>
                                      char.toUpperCase(),
                                  )
                              : getAnnouncementTypeLabel(
                                  event.type,
                                )}
                          </span>
                        </div>

                        <div className="mt-3 space-y-1.5 text-xs text-ink-faint">
                          <div className="flex items-center gap-2">
                            <Clock3
                              size={13}
                            />

                            <span>
                              {formatTime(
                                event.start,
                              )}

                              {event.end
                                ? ` - ${formatTime(
                                    event.end,
                                  )}`
                                : ""}
                            </span>
                          </div>

                          {event.location && (
                            <div className="flex items-center gap-2">
                              <MapPin
                                size={13}
                              />

                              <span>
                                {
                                  event.location
                                }
                              </span>
                            </div>
                          )}
                        </div>

                        {event.body && (
                          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
                            {event.body}
                          </p>
                        )}

                        {event.source ===
                          "CALENDAR" &&
                          event.calendarEventId &&
                          event.type ===
                            "MEETING" && (
                            <div className="mt-4 border-t border-line/60 pt-3">
                              <button
                                type="button"
                                disabled={
                                  meetingNecessityQuery.isFetching &&
                                  selectedMeetingId ===
                                    event.calendarEventId
                                }
                                onClick={() => {
                                  setAiError(
                                    null,
                                  );

                                  setSelectedMeetingId(
                                    event.calendarEventId!,
                                  );
                                }}
                                className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Sparkles
                                  size={13}
                                />

                                Analyze Meeting
                                Necessity
                              </button>

                              {selectedMeetingId ===
                                event.calendarEventId &&
                                meetingNecessityQuery.data && (
                                  <div className="mt-3 rounded-xl border border-brand-200 bg-white p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-xs font-semibold text-ink">
                                          Necessity
                                          Score
                                        </p>

                                        <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
                                          {meetingNecessityQuery
                                            .data
                                            .ai
                                            ?.explanation ||
                                            meetingNecessityQuery.data.reasons.join(
                                              " ",
                                            )}
                                        </p>
                                      </div>

                                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                                        {Math.round(
                                          meetingNecessityQuery
                                            .data
                                            .score,
                                        )}
                                      </div>
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                      <Badge
                                        tone="brand"
                                        className="px-2 py-1 text-[10px]"
                                      >
                                        {meetingNecessityQuery
                                          .data
                                          .ai
                                          ?.recommendation ||
                                          meetingNecessityQuery
                                            .data
                                            .recommendation}
                                      </Badge>

                                      <span className="text-[10px] text-ink-faint">
                                        {
                                          meetingNecessityQuery
                                            .data
                                            .durationMinutes
                                        }{" "}
                                        min ·{" "}
                                        {
                                          meetingNecessityQuery
                                            .data
                                            .participantCount
                                        }{" "}
                                        participants
                                      </span>
                                    </div>

                                    {meetingNecessityQuery
                                      .data
                                      .ai
                                      ?.suggestedAction && (
                                      <p className="mt-2 text-[11px] text-ink-faint">
                                        {
                                          meetingNecessityQuery
                                            .data
                                            .ai
                                            .suggestedAction
                                        }
                                      </p>
                                    )}
                                  </div>
                                )}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                ),
              )
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}