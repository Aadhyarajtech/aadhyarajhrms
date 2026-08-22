import { Announcement } from "./announcement.model";
import { AnnouncementReceipt, Employee, Department } from "@/db/models";

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
   */
  let employee = await Employee.findOne({
    userId,
  }).lean();

  if (!employee) {
    try {
      employee = await Employee.findById(userId).lean();
    } catch {
      employee = null;
    }
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

  const departmentValues = new Set<string>();

  if (employee.departmentId) {
    departmentValues.add(
      normalize(employee.departmentId),
    );

    const department = await Department.findById(
      employee.departmentId,
    ).lean();

    if (department) {
      if (department.name) {
        departmentValues.add(
          normalize(department.name),
        );
      }

      if (department.code) {
        departmentValues.add(
          normalize(department.code),
        );
      }
    }
  }

  /*
   * Support installations where departmentName is stored
   * directly on Employee.
   */
  if ((employee as any).departmentName) {
    departmentValues.add(
      normalize((employee as any).departmentName),
    );
  }

  const locationValues = new Set<string>();

  if (employee.city) {
    locationValues.add(normalize(employee.city));
  }

  if (employee.state) {
    locationValues.add(normalize(employee.state));
  }

  if (employee.country) {
    locationValues.add(normalize(employee.country));
  }

  if ((employee as any).location) {
    locationValues.add(
      normalize((employee as any).location),
    );
  }

  /*
   * Keep the authenticated role plus known role aliases.
   *
   * This is important for:
   * - Recruiter
   * - IT Support
   * - HR Admin
   * - Finance
   * - Manager
   * - Employee
   * - Super Admin
   */
  const normalizedRole = normalize(role);

  /*
   * Canonical role aliases.
   *
   * IMPORTANT:
   * The same canonicalization is used by:
   *   1. announcement audience matching
   *   2. target-role matching
   *   3. read-receipt recipient calculation
   *
   * This prevents "manager" vs "managers", "it_support" vs
   * "IT Support", and "recruiter" vs "talent_acquisition" from
   * behaving differently in different parts of the system.
   */
  const roleAliases: Record<string, string[]> = {
    super_admin: ["super_admin", "superadmin", "super admin"],
    hr_admin: [
      "hr_admin",
      "hr",
      "human_resources",
      "human_resources_team",
      "human resources",
      "hr admin",
    ],
    finance: [
      "finance",
      "finance_payroll",
      "finance_team",
      "payroll",
      "finance payroll",
    ],
    manager: [
      "manager",
      "managers",
      "management",
    ],
    recruiter: [
      "recruiter",
      "recruiters",
      "recruitment",
      "recruitment_team",
      "talent_acquisition",
      "talent_acquisition_team",
      "talent acquisition",
    ],
    it_support: [
      "it_support",
      "it_support_team",
      "it support",
      "itsupport",
      "it",
      "technical_support",
      "technical_support_team",
      "technical support",
      "it support team",
    ],
    employee: [
      "employee",
      "employees",
    ],
  };

  const canonicalRole = (value: unknown): string => {
    const normalized = normalize(value);

    if (!normalized) {
      return "";
    }

    for (const [canonical, aliases] of Object.entries(roleAliases)) {
      if (canonical === normalized || aliases.includes(normalized)) {
        return canonical;
      }
    }

    return normalized;
  };

  const canonicalCurrentRole = canonicalRole(normalizedRole);

  const roleValues = Array.from(
    new Set([
      canonicalCurrentRole,
      normalizedRole,
      ...(roleAliases[canonicalCurrentRole] ?? []),
    ]),
  ).filter(Boolean);

  console.log(
    "[Announcements] Employee targeting resolved:",
    {
      userId,
      employeeId: String(employee._id),
      role: roleValues,
      departments: Array.from(departmentValues),
      locations: Array.from(locationValues),
    },
  );

  return {
    departmentValues: Array.from(departmentValues),
    locationValues: Array.from(locationValues),
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
    normalizeArray(announcement.departments);

  const announcementLocations =
    normalizeArray(announcement.locations);

  const announcementRoles =
    normalizeArray(announcement.targetRoles);

  /*
   * Empty targeting field means "no restriction".
   *
   * Example:
   *
   * departments = []
   * locations = ["hyderabad"]
   * targetRoles = []
   *
   * means:
   * Any employee in Hyderabad.
   */

  const departmentMatches =
    announcementDepartments.length === 0 ||
    announcementDepartments.some((value) =>
      targeting.departmentValues.includes(value),
    );

  const locationMatches =
    announcementLocations.length === 0 ||
    announcementLocations.some((value) =>
      targeting.locationValues.includes(value),
    );

  const roleMatches =
    announcementRoles.length === 0 ||
    announcementRoles.some((value) =>
      targeting.roleValues.includes(value),
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
  const audience = normalize(announcementAudience);
  const currentRole = normalize(role);

  /*
   * ALL means every authenticated role can receive the announcement.
   */
  if (
    audience === "all" ||
    audience === "all_employees"
  ) {
    return true;
  }

  if (!currentRole) {
    return false;
  }

  /*
   * Keep audience matching canonical and symmetric.
   * For example:
   *   audience = "it_support"
   *   role     = "IT Support"
   * must both resolve to "it_support".
   */
  const roleAliases: Record<string, string[]> = {
    super_admin: ["super_admin", "superadmin", "super admin"],
    hr_admin: [
      "hr_admin",
      "hr",
      "human_resources",
      "human_resources_team",
      "human resources",
      "hr admin",
    ],
    finance: [
      "finance",
      "finance_payroll",
      "finance_team",
      "payroll",
      "finance payroll",
    ],
    manager: [
      "manager",
      "managers",
      "management",
    ],
    recruiter: [
      "recruiter",
      "recruiters",
      "recruitment",
      "recruitment_team",
      "talent_acquisition",
      "talent_acquisition_team",
      "talent acquisition",
    ],
    it_support: [
      "it_support",
      "it_support_team",
      "it support",
      "itsupport",
      "it",
      "technical_support",
      "technical_support_team",
      "technical support",
      "it support team",
    ],
    employee: [
      "employee",
      "employees",
    ],
  };

  const canonicalRole = (value: unknown): string => {
    const normalized = normalize(value);

    if (!normalized) {
      return "";
    }

    for (const [canonical, aliases] of Object.entries(roleAliases)) {
      if (canonical === normalized || aliases.includes(normalized)) {
        return canonical;
      }
    }

    return normalized;
  };

  return canonicalRole(audience) === canonicalRole(currentRole);
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

  /*
   * Audience and targeting apply to EVERY role,
   * including SUPER_ADMIN and HR_ADMIN.
   *
   * ALL means no role restriction, but
   * department/location/target-role restrictions
   * still apply.
   */
  const announcements = await Announcement.find(query)
    .sort({
      pinned: -1,
      createdAt: -1,
    })
    .lean();

  if (announcements.length === 0) {
    return [];
  }

  /*
   * If no user ID exists, only apply audience filtering.
   */
  if (!userId) {
    return announcements
      .filter((announcement) =>
        matchesAudience(
          announcement.audience,
          role,
        ),
      )
      .map(toApiDoc);
  }

  const targeting =
    await getEmployeeTargetingInfo(
      userId,
      role,
    );

  /*
   * One recipient rule for ALL channels:
   *
   * Audience
   * AND Department
   * AND Location
   * AND Target Role
   */
  const visibleAnnouncements =
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

  if (visibleAnnouncements.length === 0) {
    return [];
  }

  /*
   * Load receipts for the CURRENT USER.
   *
   * This applies to:
   * - Super Admin
   * - HR Admin
   * - Recruiter
   * - Manager
   * - Finance
   * - IT Support
   * - Employee
   *
   * A missing receipt means UNREAD.
   */
  /*
   * Read receipts are keyed by authenticated USER ID.
   *
   * The employee _id is intentionally NOT used for new writes.
   * For old installations that accidentally stored employee._id,
   * we also read that legacy key so existing read history is not lost.
   */
  let legacyEmployeeId: string | null = null;

  try {
    const employee = await Employee.findOne({
      userId,
    })
      .select("_id")
      .lean();

    legacyEmployeeId = employee?._id
      ? String(employee._id)
      : null;
  } catch {
    legacyEmployeeId = null;
  }

  const receiptUserIds = Array.from(
    new Set(
      [
        userId,
        legacyEmployeeId,
      ].filter(Boolean),
    ),
  );

  const receipts =
    (await AnnouncementReceipt.find({
      announcementId: {
        $in: visibleAnnouncements.map(
          (announcement) =>
            announcement._id,
        ),
      },

      userId: {
        $in: receiptUserIds,
      },
    }).lean()) as any[];

  const receiptMap = new Map<string, any>();

  for (const receipt of receipts) {
    const announcementKey = String(
      receipt.announcementId,
    );

    const existing = receiptMap.get(
      announcementKey,
    );

    /*
     * Prefer the receipt written with the authenticated USER ID.
     * This prevents an old employee._id receipt from overriding
     * the correct current-user receipt.
     */
    if (
      !existing ||
      String(receipt.userId) === userId
    ) {
      receiptMap.set(
        announcementKey,
        receipt,
      );
    }
  }

  return visibleAnnouncements.map(
    (announcement) => {
      const receipt =
        receiptMap.get(
          String(announcement._id),
        );

      return toApiDoc({
        ...announcement,

        receipt: receipt
          ? {
              isRead: Boolean(
                receipt.isRead,
              ),

              isAcknowledged: Boolean(
                receipt.isAcknowledged,
              ),

              readAt:
                receipt.readAt ?? null,

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
    await Announcement.findById(id).lean();

  if (!announcement) {
    return undefined;
  }

  const receipt =
    (await AnnouncementReceipt.findOne({
      announcementId: id,
      userId,
    }).lean()) as any;

  return toApiDoc({
    ...announcement,

    receipt: receipt
      ? {
          isRead: Boolean(
            receipt.isRead,
          ),

          isAcknowledged: Boolean(
            receipt.isAcknowledged,
          ),

          readAt:
            receipt.readAt ?? null,

          acknowledgedAt:
            receipt.acknowledgedAt ??
            null,
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
  if (!announcementId?.trim()) {
    throw new Error(
      "Announcement ID is required.",
    );
  }

  if (!userId?.trim()) {
    throw new Error(
      "Authenticated user ID is required.",
    );
  }

  const announcement =
    await Announcement.findById(
      announcementId,
    )
      .select("_id")
      .lean();

  if (!announcement) {
    throw new Error(
      "Announcement not found.",
    );
  }

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
  if (!announcementId?.trim()) {
    throw new Error(
      "Announcement ID is required.",
    );
  }

  if (!userId?.trim()) {
    throw new Error(
      "Authenticated user ID is required.",
    );
  }

  const announcement =
    await Announcement.findById(
      announcementId,
    )
      .select("_id type")
      .lean();

  if (!announcement) {
    throw new Error(
      "Announcement not found.",
    );
  }

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

/*
 * IMPORTANT:
 *
 * The Read Receipts screen must show ALL eligible recipients,
 * not just users who already have AnnouncementReceipt records.
 *
 * Therefore:
 *
 * Employee
 *     LEFT JOIN
 * AnnouncementReceipt
 *
 * No receipt = unread.
 */
export async function listAnnouncementReadStatus(
  announcementId: string,
) {
  /* -------------------------------------------------------
     GET ANNOUNCEMENT
  ------------------------------------------------------- */

  const announcement =
    (await Announcement.findById(
      announcementId,
    ).lean()) as any;

  if (!announcement) {
    return [];
  }

  /* -------------------------------------------------------
     GET ALL EMPLOYEES
  ------------------------------------------------------- */

  const employees =
    (await Employee.find({}).lean()) as any[];

  if (employees.length === 0) {
    return [];
  }

  /* -------------------------------------------------------
     GET DEPARTMENTS ONCE
  ------------------------------------------------------- */

  const departments =
    (await Department.find({}).lean()) as any[];

  const departmentMap =
    new Map<string, any>(
      departments.map(
        (department: any) => [
          String(department._id),
          department,
        ],
      ),
    );

  /* -------------------------------------------------------
     GET EXISTING RECEIPTS
  ------------------------------------------------------- */

  const receipts =
    (await AnnouncementReceipt.find({
      announcementId,
    }).lean()) as any[];

  const receiptMap =
    new Map<string, any>(
      receipts.map(
        (receipt: any) => [
          String(receipt.userId),
          receipt,
        ],
      ),
    );

  /* -------------------------------------------------------
     BUILD RECIPIENT STATUS
  ------------------------------------------------------- */

  const status: any[] = [];

  for (const employee of employees) {
    /*
     * AnnouncementReceipt.userId stores USER ID.
     */
    const userId = employee.userId
      ? String(employee.userId)
      : "";

    /*
     * Employees without an authenticated user account
     * cannot mark an announcement as read.
     */
    if (!userId) {
      continue;
    }

    /* -----------------------------------------------------
       ROLE
    ----------------------------------------------------- */

    const role =
      employee.role ??
      employee.designation ??
      employee.jobTitle ??
      "";

    /* -----------------------------------------------------
       DEPARTMENT
    ----------------------------------------------------- */

    const departmentValues =
      new Set<string>();

    if (employee.departmentId) {
      departmentValues.add(
        normalize(
          employee.departmentId,
        ),
      );

      const department =
        departmentMap.get(
          String(
            employee.departmentId,
          ),
        );

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

    /*
     * Support direct departmentName.
     */
    if (employee.departmentName) {
      departmentValues.add(
        normalize(
          employee.departmentName,
        ),
      );
    }

    /* -----------------------------------------------------
       LOCATION
    ----------------------------------------------------- */

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

    if (employee.location) {
      locationValues.add(
        normalize(employee.location),
      );
    }

    /* -----------------------------------------------------
       ROLE VALUES
    ----------------------------------------------------- */

    const normalizedRole =
      normalize(role);

    const roleAliases: Record<
      string,
      string[]
    > = {
      super_admin: [
        "super_admin",
        "superadmin",
      ],

      hr_admin: [
        "hr_admin",
        "hr",
        "human_resources",
        "human_resources_team",
      ],

      finance: [
        "finance",
        "finance_payroll",
        "finance_team",
        "payroll",
      ],

      manager: [
        "manager",
        "managers",
        "management",
      ],

      recruiter: [
        "recruiter",
        "recruiters",
        "recruitment",
        "recruitment_team",
        "talent_acquisition",
        "talent_acquisition_team",
      ],

      it_support: [
        "it_support",
        "it_support_team",
        "it support",
        "itsupport",
        "it",
        "technical_support",
        "technical_support_team",
      ],

      employee: [
        "employee",
        "employees",
      ],
    };

    const roleValues =
      Array.from(
        new Set([
          normalizedRole,
          ...(roleAliases[
            normalizedRole
          ] ?? []),
        ]),
      ).filter(Boolean);

    const targeting = {
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

    /* -----------------------------------------------------
       AUDIENCE MATCH
    ----------------------------------------------------- */

    const audienceMatches =
      matchesAudience(
        announcement.audience,
        role,
      );

    if (!audienceMatches) {
      continue;
    }

    /* -----------------------------------------------------
       TARGETING MATCH
    ----------------------------------------------------- */

    const targetingMatches =
      matchesTargeting(
        announcement,
        targeting,
      );

    if (!targetingMatches) {
      continue;
    }

    /* -----------------------------------------------------
       RECEIPT
    ----------------------------------------------------- */

    const receipt =
      receiptMap.get(userId);

    /* -----------------------------------------------------
       EMPLOYEE NAME
    ----------------------------------------------------- */

    const firstName =
      employee.firstName ??
      employee.first_name ??
      "";

    const lastName =
      employee.lastName ??
      employee.last_name ??
      "";

    const composedName =
      `${String(firstName).trim()} ${String(
        lastName,
      ).trim()}`.trim();

    const employeeName =
      employee.name ??
      employee.fullName ??
      employee.displayName ??
      employee.employeeName ??
      composedName ??
      "";

    /* -----------------------------------------------------
       DEPARTMENT DISPLAY NAME
    ----------------------------------------------------- */

    let departmentName = "";

    if (employee.departmentId) {
      const department =
        departmentMap.get(
          String(
            employee.departmentId,
          ),
        );

      if (department?.name) {
        departmentName =
          String(
            department.name,
          );
      }
    }

    if (
      !departmentName &&
      employee.departmentName
    ) {
      departmentName =
        String(
          employee.departmentName,
        );
    }

    /* -----------------------------------------------------
       PUSH STATUS
    ----------------------------------------------------- */

    status.push({
      id: employee._id
        ? String(employee._id)
        : userId,

      announcementId:
        String(announcementId),

      userId,

      employeeId:
        employee._id
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

      /*
       * NO RECEIPT = UNREAD
       */
      isRead: receipt
        ? Boolean(receipt.isRead)
        : false,

      isAcknowledged:
        receipt
          ? Boolean(
              receipt.isAcknowledged,
            )
          : false,

      readAt:
        receipt?.readAt ?? null,

      acknowledgedAt:
        receipt?.acknowledgedAt ??
        null,

      createdAt:
        receipt?.createdAt ?? null,

      updatedAt:
        receipt?.updatedAt ?? null,
    });
  }

  /* -------------------------------------------------------
     SORT

     Unread users first.
     Then alphabetical by employee name.
  ------------------------------------------------------- */

  status.sort(
    (a: any, b: any) => {
      if (
        a.isRead !== b.isRead
      ) {
        return a.isRead ? 1 : -1;
      }

      return String(
        a.employeeName,
      ).localeCompare(
        String(
          b.employeeName,
        ),
      );
    },
  );

  return status;
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
      ? new Date(data.scheduledAt)
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

  const channels =
    Array.from(
      new Set(
        (
          data.channels ??
          ["IN_APP"]
        )
          .map((channel) =>
            String(channel)
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      ),
    );

  if (
    channels.length === 0
  ) {
    throw new Error(
      "At least one notification channel is required.",
    );
  }

  const showBanner =
    channels.includes(
      "BANNER",
    );

  const calendarEnabled =
    channels.includes(
      "CALENDAR",
    );

  if (calendarEnabled) {
    if (
      !data.eventStartAt ||
      !data.eventEndAt
    ) {
      throw new Error(
        "Event start and end date/time are required when Calendar is selected.",
      );
    }

    const eventStart =
      new Date(
        data.eventStartAt,
      );

    const eventEnd =
      new Date(
        data.eventEndAt,
      );

    if (
      Number.isNaN(
        eventStart.getTime(),
      ) ||
      Number.isNaN(
        eventEnd.getTime(),
      )
    ) {
      throw new Error(
        "Invalid calendar event date/time.",
      );
    }

    if (
      eventEnd.getTime() <
      eventStart.getTime()
    ) {
      throw new Error(
        "Event end date/time cannot be before event start date/time.",
      );
    }
  }

  const requiresAcknowledgement =
    data.requiresAcknowledgement ??
    data.type ===
      "POLICY_UPDATE";

  const announcement =
    await Announcement.create({
      title: data.title.trim(),

      body: data.body.trim(),

      type: data.type,

      audience: data.audience,

      departments:
        data.departments ?? [],

      locations:
        data.locations ?? [],

      targetRoles:
        data.targetRoles ?? [],

      channels,

      showBanner,

      requiresAcknowledgement,

      calendarEnabled,

      eventStartAt:
        calendarEnabled
          ? (data.eventStartAt ??
            "")
          : "",

      eventEndAt:
        calendarEnabled
          ? (data.eventEndAt ??
            "")
          : "",

      eventLocation:
        calendarEnabled
          ? (data.eventLocation ??
            "")
          : "",

      pinned: data.pinned,

      attachment:
        data.attachment || "",

      createdBy:
        data.createdBy,

      status:
        publishNow
          ? "PUBLISHED"
          : "SCHEDULED",

      scheduledAt:
        data.scheduledAt ?? "",

      publishedAt:
        publishNow
          ? now
          : "",

      createdAt: now,

      updatedAt: now,
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
    data.title !== undefined
  ) {
    update.title =
      data.title.trim();
  }

  if (
    data.body !== undefined
  ) {
    update.body =
      data.body.trim();
  }

  if (
    data.type !== undefined
  ) {
    update.type =
      data.type;
  }

  if (
    data.audience !== undefined
  ) {
    update.audience =
      data.audience;
  }

  if (
    data.pinned !== undefined
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
    const channels =
      Array.from(
        new Set(
          data.channels
            .map((channel) =>
              String(channel)
                .trim()
                .toUpperCase(),
            )
            .filter(Boolean),
        ),
      );

    if (
      channels.length === 0
    ) {
      throw new Error(
        "At least one notification channel is required.",
      );
    }

    const hasBanner =
      channels.includes(
        "BANNER",
      );

    const hasCalendar =
      channels.includes(
        "CALENDAR",
      );

    update.channels =
      channels;

    update.showBanner =
      hasBanner;

    update.calendarEnabled =
      hasCalendar;

    if (!hasCalendar) {
      update.eventStartAt =
        "";

      update.eventEndAt =
        "";

      update.eventLocation =
        "";
    }
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
    const existing =
      (await Announcement.findById(
        id,
      )
        .select(
          "status scheduledAt publishedAt",
        )
        .lean()) as any;

    if (!existing) {
      return undefined;
    }

    update.scheduledAt =
      data.scheduledAt;

    const previousScheduledAt =
      existing.scheduledAt ?? "";

    const nextScheduledAt =
      data.scheduledAt ?? "";

    const scheduleChanged =
      previousScheduledAt !==
      nextScheduledAt;

    if (scheduleChanged) {
      const scheduledDate =
        nextScheduledAt
          ? new Date(
              nextScheduledAt,
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
          ? (existing.publishedAt ??
            new Date().toISOString())
          : "";
    }
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

  return toApiDoc(
    updated,
  );
}

/* =========================================================
   PUBLISH SCHEDULED ANNOUNCEMENTS
========================================================= */

export async function publishDueAnnouncements() {
  const now =
    new Date().toISOString();

  const dueAnnouncements =
    (await Announcement.find({
      status: "SCHEDULED",

      scheduledAt: {
        $ne: "",
        $lte: now,
      },
    }).lean()) as any[];

  if (
    dueAnnouncements.length ===
    0
  ) {
    return [];
  }

  const published: any[] =
    [];

  for (
    const announcement of dueAnnouncements
  ) {
    const updated =
      (await Announcement.findOneAndUpdate(
        {
          _id:
            announcement._id,

          status: "SCHEDULED",

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
      ).lean()) as any;

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
    _id: announcement._id,
  });

  return announcement;
}
