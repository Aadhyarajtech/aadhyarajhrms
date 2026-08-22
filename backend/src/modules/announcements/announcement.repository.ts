<<<<<<< HEAD
import {
  Announcement,
  AnnouncementReceipt,
  Employee,
  Department,
} from "@/db/models";

/* =========================================================
   API DOCUMENT
========================================================= */

function toApiDoc(doc: any) {
  if (!doc) {
    return undefined;
  }
=======
import crypto from "node:crypto";

import {
  Announcement,
  type AnnouncementAudience,
  type AnnouncementChannel,
  type AnnouncementStatus,
  type AnnouncementType,
} from "./announcement.model";

import { AnnouncementReceipt, Employee, Department } from "@/db/models";

import { nowIso } from "@/db/connection";

/**
 * Convert Mongo/Mongoose documents to the API shape used by the
 * existing HRMS frontend: `_id` becomes `id`.
 */
function toApiDoc<T extends Record<string, any>>(doc: T | null | undefined) {
  if (!doc) return undefined;
>>>>>>> f8f0289 (Added feature to check performance of the employees)

  const { _id, ...rest } = doc;

  return {
<<<<<<< HEAD
    id: String(_id),
=======
    id: _id,
>>>>>>> f8f0289 (Added feature to check performance of the employees)
    ...rest,
  };
}

<<<<<<< HEAD
/* =========================================================
   NORMALIZATION HELPERS
========================================================= */

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalize(item))
    .filter(Boolean);
}

/**
 * A targeting value can be:
 *
 * - department ID
 * - department name
 * - department code
 *
 * Therefore we resolve the employee's department to all
 * possible comparable values.
 */
async function getEmployeeTargetingInfo(
  userId: string,
  role?: string,
) {
  if (!userId) {
    return {
      departmentValues: [] as string[],
      locationValues: [] as string[],
      roleValues: role ? [normalize(role)] : [],
    };
  }

  /*
   * Authentication gives us a USER ID.
   * Resolve the corresponding Employee first.
   *
   * Primary lookup:
   *   Employee.userId === authenticated user ID
   *
   * Fallback:
   *   Employee._id === authenticated user ID
   *
   * The fallback keeps compatibility with installations where
   * the employee ID was historically passed directly.
   */
  let employee =
    await Employee.findOne({
      userId,
    }).lean();

  if (!employee) {
    employee =
      await Employee.findById(
        userId,
      ).lean();
  }

  if (!employee) {
    console.log(
      "[Announcements] Employee not found for user:",
      userId,
    );

    return {
      departmentValues: [] as string[],
      locationValues: [] as string[],
      roleValues: role ? [normalize(role)] : [],
    };
  }

  const departmentValues =
    new Set<string>();

  if (employee.departmentId) {
    departmentValues.add(
      normalize(
        employee.departmentId,
      ),
    );

    const department =
      await Department.findById(
        employee.departmentId,
      ).lean();

    if (department) {
      if (department.name) {
        departmentValues.add(
          normalize(
            department.name,
          ),
        );
      }

      if (department.code) {
        departmentValues.add(
          normalize(
            department.code,
          ),
        );
      }
    }
  }

  const locationValues =
    new Set<string>();

  if (employee.city) {
    locationValues.add(
      normalize(employee.city),
    );
  }

  if (employee.state) {
    locationValues.add(
      normalize(employee.state),
    );
  }

  if (employee.country) {
    locationValues.add(
      normalize(employee.country),
    );
  }

  const roleValues = [
    normalize(role),
  ].filter(Boolean);

  console.log(
    "[Announcements] Employee targeting resolved:",
    {
      userId,
      employeeId: String(
        employee._id,
      ),
      role: roleValues,
      departments:
        Array.from(
          departmentValues,
        ),
      locations:
        Array.from(
          locationValues,
        ),
    },
  );

  return {
    departmentValues:
      Array.from(
        departmentValues,
      ),

    locationValues:
      Array.from(
        locationValues,
      ),

    roleValues,
  };
}

/* =========================================================
   TARGETING MATCH
========================================================= */

function matchesTargeting(
  announcement: any,
  targeting: {
    departmentValues: string[];
    locationValues: string[];
    roleValues: string[];
  },
) {
  const announcementDepartments =
    normalizeArray(
      announcement.departments,
    );

  const announcementLocations =
    normalizeArray(
      announcement.locations,
    );

  const announcementRoles =
    normalizeArray(
      announcement.targetRoles,
    );

  /*
   * Empty targeting field means "no restriction".
   *
   * Example:
   * departments = []
   * locations = ["hyderabad"]
   * targetRoles = []
   *
   * means:
   * Any employee in Hyderabad.
   */

  const departmentMatches =
    announcementDepartments.length === 0 ||
    announcementDepartments.some(
      (value) =>
        targeting.departmentValues.includes(
          value,
        ),
    );

  const locationMatches =
    announcementLocations.length === 0 ||
    announcementLocations.some(
      (value) =>
        targeting.locationValues.includes(
          value,
        ),
    );

  const roleMatches =
    announcementRoles.length === 0 ||
    announcementRoles.some(
      (value) =>
        targeting.roleValues.includes(
          value,
        ),
    );

  return (
    departmentMatches &&
    locationMatches &&
    roleMatches
  );
}

/* =========================================================
   AUDIENCE MATCH
========================================================= */

function matchesAudience(
  announcementAudience: string,
  role?: string,
) {
  const audience =
    normalize(announcementAudience);

  const currentRole =
    normalize(role);

  if (audience === "all") {
    return true;
  }

  if (!currentRole) {
    return false;
  }

  return (
    audience === currentRole
  );
}

/* =========================================================
   GET ALL
========================================================= */

export async function getAnnouncements(
  role?: string,
  userId?: string,
) {
  const query: Record<string, unknown> = {
    /*
     * Scheduled announcements must NEVER be visible
     * before their scheduled publishing time.
     */
    status: "PUBLISHED",
  };

  const isAdmin =
    role === "SUPER_ADMIN" ||
    role === "HR_ADMIN";

  /*
   * Admin users can see all published announcements.
   *
   * IMPORTANT:
   * We intentionally do NOT return early for admins.
   * Admins must also receive their own AnnouncementReceipt
   * so "Mark as read" works for admin accounts too.
   */
  if (!isAdmin) {
    const audienceMap: Record<
      string,
      string[]
    > = {
      SUPER_ADMIN: [
        "ALL",
        "SUPER_ADMIN",
        "HR_ADMIN",
        "FINANCE",
        "MANAGER",
        "RECRUITER",
        "IT_SUPPORT",
        "EMPLOYEE",
      ],

      HR_ADMIN: [
        "ALL",
        "HR_ADMIN",
        "FINANCE",
        "MANAGER",
        "RECRUITER",
        "IT_SUPPORT",
        "EMPLOYEE",
      ],

      FINANCE: [
        "ALL",
        "FINANCE",
      ],

      MANAGER: [
        "ALL",
        "MANAGER",
      ],

      RECRUITER: [
        "ALL",
        "RECRUITER",
      ],

      IT_SUPPORT: [
        "ALL",
        "IT_SUPPORT",
      ],

      EMPLOYEE: [
        "ALL",
        "EMPLOYEE",
      ],
    };

    query.audience = {
      $in:
        audienceMap[
          String(role)
        ] ?? ["ALL"],
    };
  }

  const announcements =
    await Announcement.find(query)
      .sort({
        pinned: -1,
        createdAt: -1,
      })
      .lean();

  if (
    announcements.length === 0
  ) {
    return [];
  }

  /*
   * Admins see every published announcement.
   *
   * Non-admin users additionally go through
   * department/location/target-role filtering.
   */
  let visibleAnnouncements =
    announcements;

  if (
    !isAdmin &&
    userId
  ) {
    const targeting =
      await getEmployeeTargetingInfo(
        userId,
        role,
      );

    visibleAnnouncements =
      announcements.filter(
        (announcement) =>
          matchesAudience(
            announcement.audience,
            role,
          ) &&
          matchesTargeting(
            announcement,
            targeting,
          ),
      );
  }

  if (
    visibleAnnouncements.length === 0
  ) {
    return [];
  }

  /*
   * Without a user ID there is no receipt to attach.
   */
  if (!userId) {
    return visibleAnnouncements.map(
      toApiDoc,
    );
  }

  /*
   * Load receipts for the CURRENT USER.
   *
   * This is deliberately done for admins as well as
   * normal employees. Previously admins returned before
   * this query, which caused receipt to remain null and
   * made "Mark as read" appear again after every refresh.
   */
  const receipts =
    (await AnnouncementReceipt.find({
      announcementId: {
        $in:
          visibleAnnouncements.map(
            (announcement) =>
              announcement._id,
          ),
      },
      userId,
    }).lean()) as any[];

  const receiptMap =
    new Map(
      receipts.map(
        (receipt) => [
          String(
            receipt.announcementId,
          ),
          receipt,
        ],
      ),
    );

  return visibleAnnouncements.map(
    (announcement) => {
      const receipt =
        receiptMap.get(
          String(
            announcement._id,
          ),
        );

      return toApiDoc({
        ...announcement,

        receipt: receipt
          ? {
              isRead:
                Boolean(
                  receipt.isRead,
                ),

              isAcknowledged:
                Boolean(
                  receipt.isAcknowledged,
                ),

              readAt:
                receipt.readAt ??
                null,

              acknowledgedAt:
                receipt.acknowledgedAt ??
                null,
            }
          : null,
      });
    },
  );
}

/* =========================================================
   GET ANNOUNCEMENT WITH RECEIPT
========================================================= */

export async function getAnnouncementWithReceipt(
  id: string,
  userId: string,
) {
  const announcement =
    await Announcement.findById(
      id,
    ).lean();

  if (!announcement) {
    return undefined;
  }

  const receipt =
    (await AnnouncementReceipt.findOne(
      {
        announcementId: id,
        userId,
      },
    ).lean()) as any;

  return toApiDoc({
    ...announcement,

    receipt: receipt
      ? {
          isRead:
            receipt.isRead,

          isAcknowledged:
            receipt.isAcknowledged,

          readAt:
            receipt.readAt,

          acknowledgedAt:
            receipt.acknowledgedAt,
        }
      : null,
  });
}

/* =========================================================
   MARK ANNOUNCEMENT READ
========================================================= */

export async function markAnnouncementRead(
  announcementId: string,
  userId: string,
) {
  const now =
    new Date().toISOString();

  await AnnouncementReceipt.updateOne(
    {
      announcementId,
      userId,
    },
    {
      $set: {
        isRead: true,
        readAt: now,
        updatedAt: now,
      },

      $setOnInsert: {
        announcementId,
        userId,
        createdAt: now,
      },
    },
    {
      upsert: true,
    },
  );
}

/* =========================================================
   ACKNOWLEDGE ANNOUNCEMENT
========================================================= */

export async function acknowledgePolicyAnnouncement(
  announcementId: string,
  userId: string,
) {
  const now =
    new Date().toISOString();

  await AnnouncementReceipt.updateOne(
    {
      announcementId,
      userId,
    },
    {
      $set: {
        isRead: true,
        readAt: now,

        isAcknowledged: true,
        acknowledgedAt: now,

        updatedAt: now,
      },

      $setOnInsert: {
        announcementId,
        userId,
        createdAt: now,
      },
    },
    {
      upsert: true,
    },
  );
}

/* =========================================================
   LIST READ STATUS
========================================================= */

export async function listAnnouncementReadStatus(
  announcementId: string,
) {
  /*
   * AnnouncementReceipt stores the authenticated USER ID, not the
   * employee display information. Resolve that user ID back to the
   * Employee record so the read-receipts screen can show the actual
   * employee name, department and role instead of the generic
   * "Employee" label.
   *
   * We deliberately keep the receipt query as the source of truth for
   * who has a receipt. This does not create receipts for unread users;
   * it only enriches the receipts that actually exist.
   */
  const receipts =
    (await AnnouncementReceipt.find({
      announcementId,
    })
      .sort({
        updatedAt: -1,
      })
      .lean()) as any[];

  if (receipts.length === 0) {
    return [];
  }

  const enriched = await Promise.all(
    receipts.map(async (receipt: any) => {
      /*
       * Normal case:
       *   AnnouncementReceipt.userId -> Employee.userId
       *
       * Compatibility fallback:
       *   older data may have stored Employee._id directly.
       */
      let employee =
        await Employee.findOne({
          userId: receipt.userId,
        }).lean();

      if (!employee) {
        try {
          employee =
            await Employee.findById(
              receipt.userId,
            ).lean();
        } catch {
          employee = null;
        }
      }

      let department: any = null;

      if (employee?.departmentId) {
        try {
          department =
            await Department.findById(
              employee.departmentId,
            ).lean();
        } catch {
          department = null;
        }
      }

      /*
       * Support the common employee-name field variations used by the
       * HRMS data model without changing the Employee schema.
       */
      const employeeRecord =
        (employee ?? {}) as any;

      const firstName =
        employeeRecord.firstName ??
        employeeRecord.first_name ??
        "";

      const lastName =
        employeeRecord.lastName ??
        employeeRecord.last_name ??
        "";

      const composedName =
        `${String(firstName).trim()} ${String(
          lastName,
        ).trim()}`.trim();

      const employeeName =
        employeeRecord.name ??
        employeeRecord.fullName ??
        employeeRecord.displayName ??
        employeeRecord.employeeName ??
        composedName ??
        "";

      const departmentName =
        department?.name ??
        employeeRecord.departmentName ??
        "";

      const role =
        employeeRecord.role ??
        employeeRecord.designation ??
        employeeRecord.jobTitle ??
        "";

      return {
        id: String(receipt._id),

        announcementId:
          String(receipt.announcementId),

        /*
         * Keep the original userId because the frontend/API may use it
         * for identity or debugging.
         */
        userId:
          receipt.userId,

        /*
         * Human-readable employee information for Read Receipts.
         */
        employeeId: employee?._id
          ? String(employee._id)
          : null,

        employeeName:
          String(employeeName).trim() ||
          "Employee",

        name:
          String(employeeName).trim() ||
          "Employee",

        department:
          String(departmentName).trim() ||
          "—",

        role:
          String(role).trim() ||
          "—",

        isRead:
          Boolean(receipt.isRead),

        isAcknowledged:
          Boolean(receipt.isAcknowledged),

        readAt:
          receipt.readAt ?? null,

        acknowledgedAt:
          receipt.acknowledgedAt ?? null,

        createdAt:
          receipt.createdAt,

        updatedAt:
          receipt.updatedAt,
      };
    }),
  );

  return enriched;
}

/* =========================================================
   GET ONE
========================================================= */

export async function getAnnouncement(
  id: string,
) {
  const announcement =
    await Announcement.findById(
      id,
    ).lean();

  return toApiDoc(
    announcement,
  );
}

/* =========================================================
   CREATE
========================================================= */

export async function createAnnouncement(
  data: {
=======
/**
 * Generate the string IDs used by the HRMS Announcement model.
 *
 * The dedicated announcement model intentionally uses a string `_id`
 * because the existing project uses string IDs for these records.
 */
function createAnnouncementId() {
  return `ann_${crypto.randomUUID()}`;
}

/**
 * Normalize and validate notification channels.
 *
 * `channels` is the single source of truth.
 */
function normalizeChannels(channels?: string[]): AnnouncementChannel[] {
  const normalized = Array.from(
    new Set(
      (channels ?? ["IN_APP"])
        .map((channel) => String(channel).trim().toUpperCase())
        .filter(Boolean),
    ),
  );

  const allowed: AnnouncementChannel[] = [
    "IN_APP",
    "EMAIL",
    "BANNER",
    "CALENDAR",
  ];

  const invalid = normalized.filter(
    (channel) => !allowed.includes(channel as AnnouncementChannel),
  );

  if (invalid.length > 0) {
    throw new Error(`Invalid announcement channel(s): ${invalid.join(", ")}`);
  }

  if (normalized.length === 0) {
    throw new Error("At least one notification channel is required.");
  }

  return normalized as AnnouncementChannel[];
}

/**
 * Validate calendar information whenever CALENDAR is selected.
 */
function normalizeCalendarFields(input: {
  channels: AnnouncementChannel[];
  eventStartAt?: string;
  eventEndAt?: string;
  eventLocation?: string;
}) {
  const calendarEnabled = input.channels.includes("CALENDAR");

  if (!calendarEnabled) {
    return {
      calendarEnabled: false,
      eventStartAt: "",
      eventEndAt: "",
      eventLocation: "",
    };
  }

  if (!input.eventStartAt || !input.eventEndAt) {
    throw new Error(
      "Event start and end date/time are required when Calendar is selected.",
    );
  }

  const eventStart = new Date(input.eventStartAt);

  const eventEnd = new Date(input.eventEndAt);

  if (Number.isNaN(eventStart.getTime()) || Number.isNaN(eventEnd.getTime())) {
    throw new Error("Invalid calendar event date/time.");
  }

  if (eventEnd.getTime() < eventStart.getTime()) {
    throw new Error(
      "Event end date/time cannot be before event start date/time.",
    );
  }

  return {
    calendarEnabled: true,
    eventStartAt: input.eventStartAt,
    eventEndAt: input.eventEndAt,
    eventLocation: input.eventLocation?.trim() ?? "",
  };
}

/**
 * Determine the persisted banner flag from channels.
 *
 * This prevents:
 *
 * channels = ["IN_APP"]
 * showBanner = true
 *
 * from being stored accidentally.
 */
function getBannerEnabled(channels: AnnouncementChannel[]) {
  return channels.includes("BANNER");
}

/**
 * Return published announcements.
 *
 * This repository deliberately does not apply employee targeting here
 * because the existing project exposes a general announcement listing
 * endpoint. Employee-specific filtering can be added at the route/service
 * layer without changing the database contract.
 */
export async function listAnnouncements() {
  const rows = await Announcement.find({
    status: "PUBLISHED",
  })
    .sort({
      pinned: -1,
      publishedAt: -1,
      createdAt: -1,
    })
    .lean();

  return rows.map(toApiDoc);
}

/**
 * Create an announcement.
 */
export async function createAnnouncement(input: {
  title: string;
  body: string;
  type?: string;
  audience?: string;
  departments?: string[];
  locations?: string[];
  targetRoles?: string[];
  channels?: string[];
  showBanner?: boolean;
  requiresAcknowledgement?: boolean;
  pinned?: boolean;
  attachment?: string;
  createdBy: string;
  status?: string;
  scheduledAt?: string;
  publishedAt?: string;
  calendarEnabled?: boolean;
  eventStartAt?: string;
  eventEndAt?: string;
  eventLocation?: string;
}) {
  const now = nowIso();

  const channels = normalizeChannels(input.channels);

  const showBanner = getBannerEnabled(channels);

  const calendar = normalizeCalendarFields({
    channels,
    eventStartAt: input.eventStartAt,
    eventEndAt: input.eventEndAt,
    eventLocation: input.eventLocation,
  });

  const requestedStatus = String(
    input.status ?? "DRAFT",
  ).toUpperCase() as AnnouncementStatus;

  const allowedStatuses: AnnouncementStatus[] = [
    "DRAFT",
    "SCHEDULED",
    "PUBLISHED",
  ];

  if (!allowedStatuses.includes(requestedStatus)) {
    throw new Error(`Invalid announcement status: ${requestedStatus}`);
  }

  if (requestedStatus === "SCHEDULED" && !input.scheduledAt) {
    throw new Error("scheduledAt is required for a scheduled announcement.");
  }

  if (requestedStatus === "PUBLISHED") {
    const publishedAt = input.publishedAt ?? now;

    const doc = await Announcement.create({
      _id: createAnnouncementId(),

      title: input.title.trim(),
      body: input.body,

      type: (input.type ?? "GENERAL_NOTICE") as AnnouncementType,

      audience: (input.audience ?? "ALL") as AnnouncementAudience,

      departments: input.departments ?? [],

      locations: input.locations ?? [],

      targetRoles: input.targetRoles ?? [],

      channels,

      pinned: Boolean(input.pinned),

      showBanner,

      requiresAcknowledgement: Boolean(input.requiresAcknowledgement),

      attachment: input.attachment ?? "",

      createdBy: input.createdBy,

      status: requestedStatus,

      scheduledAt: input.scheduledAt ?? "",

      publishedAt,

      calendarEnabled: calendar.calendarEnabled,

      eventStartAt: calendar.eventStartAt,

      eventEndAt: calendar.eventEndAt,

      eventLocation: calendar.eventLocation,

      createdAt: now,
      updatedAt: now,
    });

    return toApiDoc((await Announcement.findById(doc._id).lean())!);
  }

  const doc = await Announcement.create({
    _id: createAnnouncementId(),

    title: input.title.trim(),
    body: input.body,

    type: (input.type ?? "GENERAL_NOTICE") as AnnouncementType,

    audience: (input.audience ?? "ALL") as AnnouncementAudience,

    departments: input.departments ?? [],

    locations: input.locations ?? [],

    targetRoles: input.targetRoles ?? [],

    channels,

    pinned: Boolean(input.pinned),

    showBanner,

    requiresAcknowledgement: Boolean(input.requiresAcknowledgement),

    attachment: input.attachment ?? "",

    createdBy: input.createdBy,

    status: requestedStatus,

    scheduledAt: input.scheduledAt ?? "",

    publishedAt: input.publishedAt ?? "",

    calendarEnabled: calendar.calendarEnabled,

    eventStartAt: calendar.eventStartAt,

    eventEndAt: calendar.eventEndAt,

    eventLocation: calendar.eventLocation,

    createdAt: now,
    updatedAt: now,
  });

  return toApiDoc((await Announcement.findById(doc._id).lean())!);
}

/**
 * Get one announcement by ID.
 */
export async function getAnnouncement(id: string) {
  const doc = await Announcement.findById(id).lean();

  return toApiDoc(doc);
}

/**
 * Update an announcement.
 */
export async function updateAnnouncement(
  id: string,
  input: Partial<{
>>>>>>> f8f0289 (Added feature to check performance of the employees)
    title: string;
    body: string;
    type: string;
    audience: string;
<<<<<<< HEAD

    departments?: string[];
    locations?: string[];
    targetRoles?: string[];

    pinned: boolean;
    attachment: string;
    createdBy: string;

    scheduledAt?: string;

    showBanner?: boolean;

    requiresAcknowledgement?: boolean;

    channels?: string[];

    calendarEnabled?: boolean;

    eventStartAt?: string;

    eventEndAt?: string;

    eventLocation?: string;
  },
) {
  const now =
    new Date().toISOString();

  const scheduledDate =
    data.scheduledAt
      ? new Date(
          data.scheduledAt,
        )
      : null;

  if (
    scheduledDate &&
    Number.isNaN(
      scheduledDate.getTime(),
    )
  ) {
    throw new Error(
      "Invalid scheduled date/time.",
    );
  }

  const publishNow =
    !scheduledDate ||
    scheduledDate.getTime() <=
      Date.now();

  const requiresAcknowledgement =
    data.requiresAcknowledgement ??
    data.type ===
      "POLICY_UPDATE";

  const announcement =
    await Announcement.create({
      title:
        data.title.trim(),

      body:
        data.body.trim(),

      type:
        data.type,

      audience:
        data.audience,

      departments:
        data.departments ?? [],

      locations:
        data.locations ?? [],

      targetRoles:
        data.targetRoles ?? [],

      channels:
        data.channels ??
        ["IN_APP"],

      showBanner:
        data.showBanner ??
        false,

      requiresAcknowledgement,

      calendarEnabled:
        data.calendarEnabled ??
        false,

      eventStartAt:
        data.eventStartAt ??
        "",

      eventEndAt:
        data.eventEndAt ??
        "",

      eventLocation:
        data.eventLocation ??
        "",

      pinned:
        data.pinned,

      attachment:
        data.attachment || "",

      createdBy:
        data.createdBy,

      status:
        publishNow
          ? "PUBLISHED"
          : "SCHEDULED",

      scheduledAt:
        data.scheduledAt ??
        "",

      publishedAt:
        publishNow
          ? now
          : "",

      createdAt:
        now,

      updatedAt:
        now,
    });

  const saved =
    await Announcement.findById(
      announcement._id,
    ).lean();

  return toApiDoc(saved);
}

/* =========================================================
   UPDATE
========================================================= */

export async function updateAnnouncement(
  id: string,
  data: {
    title?: string;
    body?: string;
    type?: string;
    audience?: string;

    pinned?: boolean;

    attachment?: string;

    departments?: string[];

    locations?: string[];

    targetRoles?: string[];

    channels?: string[];

    showBanner?: boolean;

    requiresAcknowledgement?: boolean;

    scheduledAt?: string;

    calendarEnabled?: boolean;

    eventStartAt?: string;

    eventEndAt?: string;

    eventLocation?: string;
  },
) {
  const update: Record<
    string,
    unknown
  > = {
    updatedAt:
      new Date().toISOString(),
  };

  if (
    data.title !==
    undefined
  ) {
    update.title =
      data.title.trim();
  }

  if (
    data.body !==
    undefined
  ) {
    update.body =
      data.body.trim();
  }

  if (
    data.type !==
    undefined
  ) {
    update.type =
      data.type;
  }

  if (
    data.audience !==
    undefined
  ) {
    update.audience =
      data.audience;
  }

  if (
    data.pinned !==
    undefined
  ) {
    update.pinned =
      data.pinned;
  }

  if (
    data.attachment !==
    undefined
  ) {
    update.attachment =
      data.attachment;
  }

  if (
    data.departments !==
    undefined
  ) {
    update.departments =
      data.departments;
  }

  if (
    data.locations !==
    undefined
  ) {
    update.locations =
      data.locations;
  }

  if (
    data.targetRoles !==
    undefined
  ) {
    update.targetRoles =
      data.targetRoles;
  }

  if (
    data.channels !==
    undefined
  ) {
    update.channels =
      data.channels;
  }

  if (
    data.showBanner !==
    undefined
  ) {
    update.showBanner =
      data.showBanner;
  }

  if (
    data.requiresAcknowledgement !==
    undefined
  ) {
    update.requiresAcknowledgement =
      data.requiresAcknowledgement;
  }

  if (
    data.scheduledAt !==
    undefined
  ) {
    update.scheduledAt =
      data.scheduledAt;

    const scheduledDate =
      data.scheduledAt
        ? new Date(
            data.scheduledAt,
          )
        : null;

    const publishNow =
      !scheduledDate ||
      Number.isNaN(
        scheduledDate.getTime(),
      ) ||
      scheduledDate.getTime() <=
        Date.now();

    update.status =
      publishNow
        ? "PUBLISHED"
        : "SCHEDULED";

    update.publishedAt =
      publishNow
        ? new Date().toISOString()
        : "";
  }

  if (
    data.calendarEnabled !==
    undefined
  ) {
    update.calendarEnabled =
      data.calendarEnabled;
  }

  if (
    data.eventStartAt !==
    undefined
  ) {
    update.eventStartAt =
      data.eventStartAt;
  }

  if (
    data.eventEndAt !==
    undefined
  ) {
    update.eventEndAt =
      data.eventEndAt;
  }

  if (
    data.eventLocation !==
    undefined
  ) {
    update.eventLocation =
      data.eventLocation;
  }

  const updated =
    await Announcement.findByIdAndUpdate(
      id,
      update,
      {
        new: true,
      },
    ).lean();

  return toApiDoc(updated);
}

/* =========================================================
   PUBLISH SCHEDULED ANNOUNCEMENTS
========================================================= */

export async function publishDueAnnouncements() {
  const now =
    new Date().toISOString();

  const dueAnnouncements =
    await Announcement.find({
      status: "SCHEDULED",

      scheduledAt: {
        $ne: "",
        $lte: now,
      },
    }).lean();

  if (
    dueAnnouncements.length ===
    0
  ) {
    return [];
  }

  const published = [];

  for (
    const announcement of dueAnnouncements
  ) {
    const updated =
      await Announcement.findOneAndUpdate(
        {
          _id:
            announcement._id,

          status:
            "SCHEDULED",

          scheduledAt: {
            $ne: "",
            $lte: now,
          },
        },
        {
          $set: {
            status:
              "PUBLISHED",

            publishedAt:
              now,

            updatedAt:
              now,
          },
        },
        {
          new: true,
        },
      ).lean();

    if (updated) {
      published.push(
        toApiDoc(updated),
      );
    }
  }

  return published;
}

/* =========================================================
   DELETE
========================================================= */

export async function deleteAnnouncement(
  id: string,
) {
  const announcement =
    await Announcement.findById(
      id,
    );

  if (!announcement) {
    return null;
  }

  await Announcement.deleteOne({
    _id:
      announcement._id,
  });

  return announcement;
}
=======
    departments: string[];
    locations: string[];
    targetRoles: string[];
    channels: string[];
    showBanner: boolean;
    requiresAcknowledgement: boolean;
    pinned: boolean;
    attachment: string;
    createdBy: string;
    status: string;
    scheduledAt: string;
    publishedAt: string;
    calendarEnabled: boolean;
    eventStartAt: string;
    eventEndAt: string;
    eventLocation: string;
  }>,
) {
  const existing = await Announcement.findById(id).lean();

  if (!existing) {
    return undefined;
  }

  const update: Record<string, any> = {};

  if (input.title !== undefined) {
    update.title = input.title.trim();
  }

  if (input.body !== undefined) {
    update.body = input.body;
  }

  if (input.type !== undefined) {
    update.type = input.type;
  }

  if (input.audience !== undefined) {
    update.audience = input.audience;
  }

  if (input.departments !== undefined) {
    update.departments = input.departments;
  }

  if (input.locations !== undefined) {
    update.locations = input.locations;
  }

  if (input.targetRoles !== undefined) {
    update.targetRoles = input.targetRoles;
  }

  if (input.channels !== undefined) {
    const channels = normalizeChannels(input.channels);

    const calendar = normalizeCalendarFields({
      channels,
      eventStartAt: input.eventStartAt ?? existing.eventStartAt,
      eventEndAt: input.eventEndAt ?? existing.eventEndAt,
      eventLocation: input.eventLocation ?? existing.eventLocation,
    });

    update.channels = channels;

    update.showBanner = getBannerEnabled(channels);

    update.calendarEnabled = calendar.calendarEnabled;

    update.eventStartAt = calendar.eventStartAt;

    update.eventEndAt = calendar.eventEndAt;

    update.eventLocation = calendar.eventLocation;
  } else if (
    input.eventStartAt !== undefined ||
    input.eventEndAt !== undefined ||
    input.eventLocation !== undefined
  ) {
    const channels = normalizeChannels(existing.channels);

    const calendar = normalizeCalendarFields({
      channels,
      eventStartAt: input.eventStartAt ?? existing.eventStartAt,
      eventEndAt: input.eventEndAt ?? existing.eventEndAt,
      eventLocation: input.eventLocation ?? existing.eventLocation,
    });

    update.calendarEnabled = calendar.calendarEnabled;

    update.eventStartAt = calendar.eventStartAt;

    update.eventEndAt = calendar.eventEndAt;

    update.eventLocation = calendar.eventLocation;
  }

  if (input.requiresAcknowledgement !== undefined) {
    update.requiresAcknowledgement = Boolean(input.requiresAcknowledgement);
  }

  if (input.pinned !== undefined) {
    update.pinned = Boolean(input.pinned);
  }

  if (input.attachment !== undefined) {
    update.attachment = input.attachment;
  }

  if (input.createdBy !== undefined) {
    update.createdBy = input.createdBy;
  }

  if (input.status !== undefined) {
    const status = String(input.status).trim().toUpperCase();

    if (!["DRAFT", "SCHEDULED", "PUBLISHED"].includes(status)) {
      throw new Error(`Invalid announcement status: ${status}`);
    }

    if (
      status === "SCHEDULED" &&
      !(input.scheduledAt ?? existing.scheduledAt)
    ) {
      throw new Error("scheduledAt is required for a scheduled announcement.");
    }

    update.status = status;

    if (status === "PUBLISHED") {
      update.publishedAt =
        input.publishedAt ?? existing.publishedAt ?? nowIso();

      update.scheduledAt = input.scheduledAt ?? existing.scheduledAt ?? "";
    }
  }

  if (input.scheduledAt !== undefined) {
    update.scheduledAt = input.scheduledAt;
  }

  if (input.publishedAt !== undefined) {
    update.publishedAt = input.publishedAt;
  }

  /*
   * Keep banner state synchronized even when an update doesn't explicitly
   * send `channels`.
   */
  if (input.channels === undefined && existing.channels) {
    update.showBanner = existing.channels.includes("BANNER");
  }

  update.updatedAt = nowIso();

  const doc = await Announcement.findByIdAndUpdate(
    id,
    {
      $set: update,
    },
    {
      new: true,
      runValidators: true,
    },
  ).lean();

  return toApiDoc(doc);
}

/**
 * Delete an announcement.
 */
export async function deleteAnnouncement(id: string) {
  /*
   * Remove announcement receipts first so that read/acknowledgement
   * records don't remain orphaned.
   */
  await AnnouncementReceipt.deleteMany({
    announcementId: id,
  });

  const result = await Announcement.deleteOne({
    _id: id,
  });

  return result.deletedCount === 1;
}

/**
 * Mark an announcement as read for a user.
 *
 * This uses userId, matching the existing Notification repository
 * convention.
 */
export async function markAnnouncementRead(
  announcementId: string,
  userId: string,
) {
  const now = nowIso();

  await AnnouncementReceipt.updateOne(
    {
      announcementId,
      userId,
    },
    {
      $set: {
        isRead: true,
        readAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        announcementId,
        userId,
        isAcknowledged: false,
        acknowledgedAt: null,
        createdAt: now,
      },
    },
    {
      upsert: true,
    },
  );
}

/**
 * Acknowledge an announcement.
 */
export async function acknowledgeAnnouncement(
  announcementId: string,
  userId: string,
) {
  const announcement = await Announcement.findById(announcementId).lean();

  if (!announcement) {
    throw new Error("Announcement not found.");
  }

  if (!announcement.requiresAcknowledgement) {
    throw new Error("This announcement does not require acknowledgement.");
  }

  const now = nowIso();

  await AnnouncementReceipt.updateOne(
    {
      announcementId,
      userId,
    },
    {
      $set: {
        isAcknowledged: true,
        acknowledgedAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        announcementId,
        userId,
        isRead: true,
        readAt: now,
        createdAt: now,
      },
    },
    {
      upsert: true,
    },
  );
}

/**
 * Return the current user's read/acknowledgement status for an announcement.
 */
export async function getAnnouncementReceipt(
  announcementId: string,
  userId: string,
) {
  const receipt = await AnnouncementReceipt.findOne({
    announcementId,
    userId,
  }).lean();

  if (!receipt) {
    return {
      isRead: false,
      isAcknowledged: false,
      readAt: null,
      acknowledgedAt: null,
    };
  }

  return {
    isRead: Boolean(receipt.isRead),
    isAcknowledged: Boolean(receipt.isAcknowledged),
    readAt: receipt.readAt ?? null,
    acknowledgedAt: receipt.acknowledgedAt ?? null,
  };
}

/**
 * Publish scheduled announcements whose scheduled time has arrived.
 *
 * Notification/email delivery is intentionally handled by the scheduler/
 * notification layer, not directly inside the repository.
 */
export async function publishDueAnnouncements() {
  const now = nowIso();

  const due = await Announcement.find({
    status: "SCHEDULED",
    scheduledAt: {
      $ne: "",
      $lte: now,
    },
  }).lean();

  if (due.length === 0) {
    return [];
  }

  const ids = due.map((announcement) => announcement._id);

  await Announcement.updateMany(
    {
      _id: {
        $in: ids,
      },
      status: "SCHEDULED",
    },
    {
      $set: {
        status: "PUBLISHED",
        publishedAt: now,
        updatedAt: now,
      },
    },
  );

  return Announcement.find({
    _id: {
      $in: ids,
    },
  })
    .sort({
      publishedAt: -1,
    })
    .lean()
    .then((rows) => rows.map(toApiDoc));
}
>>>>>>> f8f0289 (Added feature to check performance of the employees)
