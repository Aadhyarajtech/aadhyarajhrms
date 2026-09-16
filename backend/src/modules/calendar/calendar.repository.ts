import { CalendarEvent } from "@/db/models";

/* =========================================================
   HELPERS
========================================================= */

function toApiDoc(doc: any) {
  if (!doc) return undefined;

  const { _id, ...rest } = doc;

  return {
    id: _id,
    ...rest,
  };
}

/* =========================================================
   LIST EVENTS
========================================================= */

export async function listEvents(input: {
  employeeId?: string;
  participantId?: string;
  startAt?: string;
  endAt?: string;
}) {
  const query: Record<string, any> = {};

  /*
   * If employeeId is supplied, return events where the
   * employee is either:
   *
   * 1. The owner of the event
   * 2. A participant in the event
   */
  if (input.employeeId) {
    query.$or = [
      {
        employeeId: input.employeeId,
      },
      {
        participantIds: input.employeeId,
      },
    ];
  }

  if (input.participantId) {
    query.participantIds = input.participantId;
  }

  if (input.startAt || input.endAt) {
    query.$and = [];

    if (input.startAt) {
      query.$and.push({
        endAt: {
          $gte: input.startAt,
        },
      });
    }

    if (input.endAt) {
      query.$and.push({
        startAt: {
          $lte: input.endAt,
        },
      });
    }
  }

  const rows = await CalendarEvent.find(query)
    .sort({ startAt: 1 })
    .lean();

  return rows.map(toApiDoc);
}

/* =========================================================
   GET SINGLE EVENT
========================================================= */

export async function getEvent(id: string) {
  const row = await CalendarEvent.findById(id).lean();

  return toApiDoc(row);
}

/* =========================================================
   CREATE EVENT
========================================================= */

export async function createEvent(input: {
  title: string;
  description?: string;
  type?: string;
  employeeId: string;
  participantIds?: string[];
  startAt: string;
  endAt: string;
  location?: string;
  isRecurring?: boolean;
  recurrenceRule?: string | null;
  isImportant?: boolean;
  isCritical?: boolean;
  source?: string;
  sourceId?: string | null;
}) {
  if (!input.title?.trim()) {
    throw new Error("Calendar event title is required.");
  }

  if (!input.employeeId) {
    throw new Error("Employee is required.");
  }

  if (!input.startAt || !input.endAt) {
    throw new Error(
      "Calendar event start and end time are required.",
    );
  }

  if (
    new Date(input.startAt).getTime() >=
    new Date(input.endAt).getTime()
  ) {
    throw new Error(
      "Calendar event end time must be after start time.",
    );
  }

  const now = new Date().toISOString();

  const doc = await CalendarEvent.create({
    title: input.title.trim(),

    description:
      input.description?.trim() ?? "",

    type:
      input.type ?? "MEETING",

    status:
      "SCHEDULED",

    employeeId:
      input.employeeId,

    participantIds:
      Array.from(
        new Set(input.participantIds ?? []),
      ),

    startAt:
      input.startAt,

    endAt:
      input.endAt,

    location:
      input.location?.trim() ?? "",

    isRecurring:
      input.isRecurring ?? false,

    recurrenceRule:
      input.recurrenceRule ?? null,

    isImportant:
      input.isImportant ?? false,

    isCritical:
      input.isCritical ?? false,

    source:
      input.source ?? "MANUAL",

    sourceId:
      input.sourceId ?? null,

    createdAt:
      now,

    updatedAt:
      now,
  });

  return toApiDoc(
    await CalendarEvent.findById(doc._id).lean(),
  );
}

/* =========================================================
   UPDATE EVENT
========================================================= */

export async function updateEvent(
  id: string,
  input: {
    title?: string;
    description?: string;
    type?: string;
    participantIds?: string[];
    startAt?: string;
    endAt?: string;
    location?: string;
    isRecurring?: boolean;
    recurrenceRule?: string | null;
    isImportant?: boolean;
    isCritical?: boolean;
    status?: string;
  },
) {
  const existing =
    await CalendarEvent.findById(id).lean();

  if (!existing) {
    return undefined;
  }

  const startAt =
    input.startAt ?? existing.startAt;

  const endAt =
    input.endAt ?? existing.endAt;

  if (
    new Date(startAt).getTime() >=
    new Date(endAt).getTime()
  ) {
    throw new Error(
      "Calendar event end time must be after start time.",
    );
  }

  const update: Record<string, any> = {
    updatedAt:
      new Date().toISOString(),
  };

  if (input.title !== undefined) {
    if (!input.title.trim()) {
      throw new Error(
        "Calendar event title is required.",
      );
    }

    update.title =
      input.title.trim();
  }

  if (input.description !== undefined) {
    update.description =
      input.description.trim();
  }

  if (input.type !== undefined) {
    update.type =
      input.type;
  }

  if (input.participantIds !== undefined) {
    update.participantIds =
      Array.from(
        new Set(input.participantIds),
      );
  }

  if (input.startAt !== undefined) {
    update.startAt =
      input.startAt;
  }

  if (input.endAt !== undefined) {
    update.endAt =
      input.endAt;
  }

  if (input.location !== undefined) {
    update.location =
      input.location.trim();
  }

  if (input.isRecurring !== undefined) {
    update.isRecurring =
      input.isRecurring;
  }

  if (input.recurrenceRule !== undefined) {
    update.recurrenceRule =
      input.recurrenceRule;
  }

  if (input.isImportant !== undefined) {
    update.isImportant =
      input.isImportant;
  }

  if (input.isCritical !== undefined) {
    update.isCritical =
      input.isCritical;
  }

  if (input.status !== undefined) {
    update.status =
      input.status;
  }

  const row =
    await CalendarEvent.findByIdAndUpdate(
      id,
      update,
      {
        new: true,
        lean: true,
      },
    );

  return toApiDoc(row);
}

/* =========================================================
   CANCEL EVENT
========================================================= */

export async function cancelEvent(id: string) {
  const row =
    await CalendarEvent.findByIdAndUpdate(
      id,
      {
        status: "CANCELLED",
        updatedAt:
          new Date().toISOString(),
      },
      {
        new: true,
        lean: true,
      },
    );

  return toApiDoc(row);
}

/* =========================================================
   DELETE EVENT
========================================================= */

export async function deleteEvent(id: string) {
  const row =
    await CalendarEvent.findByIdAndDelete(id).lean();

  return toApiDoc(row);
}

/* =========================================================
   EVENTS FOR AI ANALYSIS
========================================================= */

/**
 * Returns events involving an employee during a time range.
 *
 * Used by:
 * - Calendar Conflict Resolver
 * - Calendar Health
 * - Meeting Necessity
 * - Schedule Optimizer
 */

export async function getEmployeeSchedule(input: {
  employeeId: string;
  startAt: string;
  endAt: string;
}) {
  const rows =
    await CalendarEvent.find({
      status: {
        $ne: "CANCELLED",
      },

      $and: [
        {
          endAt: {
            $gte: input.startAt,
          },
        },

        {
          startAt: {
            $lte: input.endAt,
          },
        },

        {
          $or: [
            {
              employeeId:
                input.employeeId,
            },

            {
              participantIds:
                input.employeeId,
            },
          ],
        },
      ],
    })
      .sort({ startAt: 1 })
      .lean();

  return rows.map(toApiDoc);
}

/* =========================================================
   TEAM SCHEDULE
========================================================= */

export async function getTeamSchedule(input: {
  employeeIds: string[];
  startAt: string;
  endAt: string;
}) {
  if (!input.employeeIds.length) {
    return [];
  }

  const rows =
    await CalendarEvent.find({
      status: {
        $ne: "CANCELLED",
      },

      $and: [
        {
          endAt: {
            $gte: input.startAt,
          },
        },

        {
          startAt: {
            $lte: input.endAt,
          },
        },

        {
          $or: [
            {
              employeeId: {
                $in: input.employeeIds,
              },
            },

            {
              participantIds: {
                $in: input.employeeIds,
              },
            },
          ],
        },
      ],
    })
      .sort({ startAt: 1 })
      .lean();

  return rows.map(toApiDoc);
}

/* =========================================================
   MEETING HISTORY
========================================================= */

/**
 * Used by the AI Meeting Necessity Score.
 *
 * Looks at previous meetings with the same title and
 * overlapping participants.
 */

export async function getMeetingHistory(input: {
  employeeId: string;
  title: string;
  participantIds: string[];
  before: string;
  limit?: number;
}) {
  const allParticipantIds =
    Array.from(
      new Set([
        input.employeeId,
        ...input.participantIds,
      ]),
    );

  const rows =
    await CalendarEvent.find({
      type: "MEETING",

      status: {
        $ne: "CANCELLED",
      },

      startAt: {
        $lt: input.before,
      },

      $or: [
        {
          employeeId:
            input.employeeId,
        },

        {
          participantIds:
            input.employeeId,
        },
      ],
    })
      .sort({ startAt: -1 })
      .limit(input.limit ?? 20)
      .lean();

  const normalizedTitle =
    input.title
      .trim()
      .toLowerCase();

  return rows
    .filter((row: any) => {
      const title =
        String(row.title ?? "")
          .trim()
          .toLowerCase();

      if (title === normalizedTitle) {
        return true;
      }

      const rowParticipants =
        new Set([
          row.employeeId,
          ...(row.participantIds ?? []),
        ]);

      const overlap =
        allParticipantIds.filter(
          (id) =>
            rowParticipants.has(id),
        );

      return overlap.length >= 2;
    })
    .map(toApiDoc);
}

/* =========================================================
   UPCOMING EVENTS
========================================================= */

export async function getUpcomingEvents(
  employeeId: string,
  from: string,
  until: string,
) {
  return getEmployeeSchedule({
    employeeId,
    startAt: from,
    endAt: until,
  });
}