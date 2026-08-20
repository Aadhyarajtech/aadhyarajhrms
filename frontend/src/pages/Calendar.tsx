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
} from "lucide-react";

import { AnnouncementsApi } from "@/lib/endpoints";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

type Announcement = {
  id: string;
  title: string;
  body: string;
  type: string;
  status?: string;
  createdAt?: string;
  publishedAt?: string;

  calendarEnabled?: boolean;
  eventStartAt?: string;
  eventEndAt?: string;
  eventLocation?: string;

  pinned?: boolean;

  channels?: string[];
  notificationMethods?: string[];
};

type CalendarEvent = {
  id: string;
  title: string;
  body: string;
  start: Date;
  end?: Date;
  location?: string;
  type: string;
  pinned: boolean;
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
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function parseDate(value?: string): Date | null {
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
    last.getDate() + (6 - last.getDay()),
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
  announcement: Announcement,
): CalendarEvent | null {
  /*
   * Only published announcements should be visible
   * to employees in the calendar.
   */
  if (
    announcement.status &&
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
    announcement.type === "COMPANY_EVENT" ||
    announcement.type === "MEETING_NOTICE";

  const hasCalendarFlag =
    announcement.calendarEnabled === true;

  /*
   * Also support CALENDAR channel for announcements
   * returned by older/newer backend versions.
   */
  const hasCalendarChannel =
    announcement.channels?.some(
      (channel) =>
        channel.toUpperCase() === "CALENDAR",
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
    useState<Date>(() => new Date());

  /* =======================================================
     ANNOUNCEMENTS API
  ======================================================= */

  const {
    data: announcements = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery<Announcement[], Error>({
    queryKey: [
      "announcements",
      "calendar",
    ],

    queryFn: async () => {
      const result =
        await AnnouncementsApi.list();

      return Array.isArray(result)
        ? result
        : [];
    },

    /*
     * Automatically check for newly-created
     * announcements.
     */
    refetchInterval: 15000,

    staleTime: 0,
  });

  /* =======================================================
     CONVERT ANNOUNCEMENTS TO CALENDAR EVENTS
  ======================================================= */

  const events = useMemo<CalendarEvent[]>(() => {
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

    return result.sort(
      (first, second) =>
        first.start.getTime() -
        second.start.getTime(),
    );
  }, [announcements]);

  /* =======================================================
     CALENDAR DAYS
  ======================================================= */

  const calendarDays = useMemo(
    () =>
      buildCalendarDays(
        currentMonth,
      ),
    [currentMonth],
  );

  /* =======================================================
     SELECTED DAY EVENTS
  ======================================================= */

  const selectedEvents = useMemo(() => {
    const filtered = events.filter(
      (event) =>
        sameDay(
          event.start,
          selectedDate,
        ),
    );

    return filtered.sort(
      (first, second) =>
        first.start.getTime() -
        second.start.getTime(),
    );
  }, [
    events,
    selectedDate,
  ]);

  /* =======================================================
     TODAY
  ======================================================= */

  const today = new Date();

  /* =======================================================
     NAVIGATION
  ======================================================= */

  const goToPreviousMonth = () => {
    setCurrentMonth(
      (month) =>
        new Date(
          month.getFullYear(),
          month.getMonth() - 1,
          1,
        ),
    );
  };

  const goToNextMonth = () => {
    setCurrentMonth(
      (month) =>
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

    setSelectedDate(now);
  };

  const handleRefresh = async () => {
    await refetch();
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="w-full">

      {/* ===================================================
          HEADER
      =================================================== */}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <div className="flex items-center gap-2">

            <CalendarDays
              size={22}
              className="text-brand-600"
            />

            <h1 className="font-display text-2xl font-semibold text-ink">
              Calendar
            </h1>

          </div>

          <p className="mt-1 text-sm text-ink-faint">
            Company events, meetings and important
            announcements.
          </p>
        </div>

        <div className="flex items-center gap-2">

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isFetching}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
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
            className="inline-flex items-center justify-center rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface"
          >
            Today
          </button>

        </div>

      </div>

      {/* ===================================================
          ERROR
      =================================================== */}

      {isError && (
        <Card className="mb-6">

          <div className="p-5">

            <p className="text-sm font-medium text-red-600">
              Failed to load calendar events.
            </p>

            <button
              type="button"
              onClick={handleRefresh}
              className="mt-3 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
            >
              Try again
            </button>

          </div>

        </Card>
      )}

      {/* ===================================================
          MAIN CONTENT
      =================================================== */}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">

        {/* =================================================
            CALENDAR
        ================================================= */}

        <Card className="overflow-hidden">

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
                  className="rounded-lg p-2 text-ink-faint hover:bg-surface hover:text-ink"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>

                <button
                  type="button"
                  onClick={
                    goToNextMonth
                  }
                  className="rounded-lg p-2 text-ink-faint hover:bg-surface hover:text-ink"
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>

              </div>
            }
          />

          {/* WEEK DAYS */}

          <div className="border-t border-line/60">

            <div className="grid grid-cols-7 border-b border-line/60">

              {WEEKDAYS.map(
                (day) => (
                  <div
                    key={day}
                    className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-faint"
                  >
                    {day}
                  </div>
                ),
              )}

            </div>

            {/* CALENDAR GRID */}

            <div className="grid grid-cols-7">

              {calendarDays.map(
                (day) => {

                  const dayEvents =
                    events
                      .filter(
                        (event) =>
                          sameDay(
                            event.start,
                            day,
                          ),
                      )
                      .sort(
                        (
                          first,
                          second,
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
                    sameDay(
                      day,
                      today,
                    );

                  const isSelected =
                    sameDay(
                      day,
                      selectedDate,
                    );

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() =>
                        setSelectedDate(
                          day,
                        )
                      }
                      className={[
                        /*
                         * IMPORTANT:
                         * Keep the cell as a vertical layout.
                         * This prevents the event count from
                         * appearing beside the date as "241".
                         */
                        "group relative flex min-h-[125px] flex-col border-b border-r border-line/50 p-2 text-left transition",
                        "hover:bg-brand-50/40",
                        !isCurrentMonth
                          ? "bg-surface/50"
                          : "bg-white",
                        isSelected
                          ? "bg-brand-50/70 ring-1 ring-inset ring-brand-300"
                          : "",
                      ].join(" ")}
                    >

                      {/* DATE HEADER */}

                      <div className="flex min-h-7 w-full items-start justify-between gap-2">

                        <span
                          className={[
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                            !isCurrentMonth
                              ? "text-ink-faint"
                              : "text-ink",
                            isToday
                              ? "bg-brand-600 text-white"
                              : "",
                          ].join(" ")}
                        >
                          {day.getDate()}
                        </span>

                        {/* EVENT COUNT */}

                        {dayEvents.length > 0 && (
                          <span
                            className={[
                              "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
                              isSelected
                                ? "bg-brand-600 text-white"
                                : "bg-brand-50 text-brand-700",
                            ].join(" ")}
                            title={`${dayEvents.length} event${
                              dayEvents.length === 1
                                ? ""
                                : "s"
                            }`}
                          >
                            {dayEvents.length}
                          </span>
                        )}

                      </div>

                      {/* EVENTS */}

                      <div className="mt-2 min-w-0 flex-1 space-y-1 overflow-hidden">

                        {dayEvents
                          .slice(0, 3)
                          .map(
                            (event) => (
                              <div
                                key={
                                  event.id
                                }
                                title={`${formatTime(
                                  event.start,
                                )} - ${
                                  event.title
                                }`}
                                className={[
                                  "block w-full min-w-0 truncate rounded-md px-2 py-1.5 text-[10px] font-medium leading-tight",
                                  event.pinned
                                    ? "bg-brand-100 text-brand-700"
                                    : "bg-brand-50 text-brand-700",
                                ].join(" ")}
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
                                  {event.title}
                                </span>
                              </div>
                            ),
                          )}

                        {dayEvents.length > 3 && (
                          <div className="px-1 pt-0.5 text-[10px] font-medium text-ink-faint">
                            +
                            {dayEvents.length - 3}{" "}
                            more
                          </div>
                        )}

                      </div>

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

            ) : selectedEvents.length === 0 ? (

              <div className="rounded-xl border border-dashed border-line p-6 text-center">

                <CalendarDays
                  size={24}
                  className="mx-auto text-ink-faint"
                />

                <p className="mt-2 text-sm font-medium text-ink">
                  No events
                </p>

                <p className="mt-1 text-xs text-ink-faint">
                  Nothing is scheduled for
                  this day.
                </p>

              </div>

            ) : (

              selectedEvents.map(
                (event) => (

                  <div
                    key={event.id}
                    className="rounded-2xl border border-line/70 bg-surface/40 p-4"
                  >

                    <div className="flex items-start gap-3">

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">

                        <Megaphone
                          size={17}
                        />

                      </div>

                      <div className="min-w-0 flex-1">

                        {/* TITLE */}

                        <div className="flex flex-wrap items-center gap-2">

                          <h3 className="text-sm font-semibold text-ink">
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

                        </div>

                        {/* TYPE */}

                        <div className="mt-2">

                          <span className="inline-flex rounded-full bg-brand-50 px-2 py-1 text-[10px] font-medium text-brand-700">
                            {getAnnouncementTypeLabel(
                              event.type,
                            )}
                          </span>

                        </div>

                        {/* TIME / LOCATION */}

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

                        {/* MESSAGE */}

                        {event.body && (
                          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                            {event.body}
                          </p>
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