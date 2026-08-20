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

  const { _id, ...rest } = doc;

  return {
    id: String(_id),
    ...rest,
  };
}

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
    title: string;
    body: string;
    type: string;
    audience: string;

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