import { Announcement } from "./announcement.model";
import {
  AnnouncementReceipt,
  Employee,
  Department,
  User,
} from "@/db/models";
import { env } from "@/config/env";

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

  return value.map((item) => normalize(item)).filter(Boolean);
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
async function getEmployeeTargetingInfo(userId: string, role?: string) {
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
    console.log("[Announcements] Employee not found for user:", userId);

    return {
      departmentValues: [] as string[],
      locationValues: [] as string[],
      roleValues: role ? [normalize(role)] : [],
    };
  }

  const departmentValues = new Set<string>();

  if (employee.departmentId) {
    departmentValues.add(normalize(employee.departmentId));

    const department = await Department.findById(employee.departmentId).lean();

    if (department) {
      if (department.name) {
        departmentValues.add(normalize(department.name));
      }

      if (department.code) {
        departmentValues.add(normalize(department.code));
      }
    }
  }

  /*
   * Support installations where departmentName is stored
   * directly on Employee.
   */
  if ((employee as any).departmentName) {
    departmentValues.add(normalize((employee as any).departmentName));
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
    locationValues.add(normalize((employee as any).location));
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
    manager: ["manager", "managers", "management"],
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
    employee: ["employee", "employees"],
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

  console.log("[Announcements] Employee targeting resolved:", {
    userId,
    employeeId: String(employee._id),
    role: roleValues,
    departments: Array.from(departmentValues),
    locations: Array.from(locationValues),
  });

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
  const announcementDepartments = normalizeArray(announcement.departments);

  const announcementLocations = normalizeArray(announcement.locations);

  const announcementRoles = normalizeArray(announcement.targetRoles);

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
    announcementRoles.some((value) => targeting.roleValues.includes(value));

  return departmentMatches && locationMatches && roleMatches;
}

/* =========================================================
   AUDIENCE MATCH
========================================================= */

function matchesAudience(announcementAudience: string, role?: string) {
  const audience = normalize(announcementAudience);
  const currentRole = normalize(role);

  /*
   * ALL means every authenticated role can receive the announcement.
   */
  if (audience === "all" || audience === "all_employees") {
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
    manager: ["manager", "managers", "management"],
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
    employee: ["employee", "employees"],
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

export async function getAnnouncements(role?: string, userId?: string) {
  const query: Record<string, unknown> = {
    /*
     * Scheduled announcements must NEVER be visible
     * before their scheduled publishing time.
     */
    status: { $in: ["PUBLISHED", "EXPIRED"] },
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
      .filter((announcement) => matchesAudience(announcement.audience, role))
      .map(toApiDoc);
  }

  const targeting = await getEmployeeTargetingInfo(userId, role);

  /*
   * One recipient rule for ALL channels:
   *
   * Audience
   * AND Department
   * AND Location
   * AND Target Role
   */
  const visibleAnnouncements = announcements.filter(
    (announcement) =>
      matchesAudience(announcement.audience, role) &&
      matchesTargeting(announcement, targeting),
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

    legacyEmployeeId = employee?._id ? String(employee._id) : null;
  } catch {
    legacyEmployeeId = null;
  }

  const receiptUserIds = Array.from(
    new Set([userId, legacyEmployeeId].filter(Boolean)),
  );

  const receipts = (await AnnouncementReceipt.find({
    announcementId: {
      $in: visibleAnnouncements.map((announcement) => announcement._id),
    },

    userId: {
      $in: receiptUserIds,
    },
  }).lean()) as any[];

  const receiptMap = new Map<string, any>();

  for (const receipt of receipts) {
    const announcementKey = String(receipt.announcementId);

    const existing = receiptMap.get(announcementKey);

    /*
     * Prefer the receipt written with the authenticated USER ID.
     * This prevents an old employee._id receipt from overriding
     * the correct current-user receipt.
     */
    if (!existing || String(receipt.userId) === userId) {
      receiptMap.set(announcementKey, receipt);
    }
  }

  return visibleAnnouncements.map((announcement) => {
    const receipt = receiptMap.get(String(announcement._id));

    return toApiDoc({
      ...announcement,

      isExpired: announcement.status === "EXPIRED" || (announcement.expiresAt ? new Date(announcement.expiresAt).getTime() <= Date.now() : false),
      receipt: receipt
        ? {
            isRead: Boolean(receipt.isRead),

            isAcknowledged: Boolean(receipt.isAcknowledged),

            readAt: receipt.readAt ?? null,

            acknowledgedAt: receipt.acknowledgedAt ?? null,
          }
        : null,
    });
  });
}

/* =========================================================
   GET ANNOUNCEMENT WITH RECEIPT
========================================================= */

export async function getAnnouncementWithReceipt(id: string, userId: string) {
  const announcement = await Announcement.findOne({ _id: id, status: "PUBLISHED" }).lean();

  if (!announcement) {
    return undefined;
  }

  const receipt = (await AnnouncementReceipt.findOne({
    announcementId: id,
    userId,
  }).lean()) as any;

  return toApiDoc({
    ...announcement,

    receipt: receipt
      ? {
          isRead: Boolean(receipt.isRead),

          isAcknowledged: Boolean(receipt.isAcknowledged),

          readAt: receipt.readAt ?? null,

          acknowledgedAt: receipt.acknowledgedAt ?? null,
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
    throw new Error("Announcement ID is required.");
  }

  if (!userId?.trim()) {
    throw new Error("Authenticated user ID is required.");
  }

  const announcement = await Announcement.findOne({ _id: announcementId, status: "PUBLISHED" })
    .select("_id")
    .lean();

  if (!announcement) {
    throw new Error("Announcement not found.");
  }

  if ((announcement as any).status === "EXPIRED") {
    throw new Error("This announcement has expired.");
  }

  const now = new Date().toISOString();

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
    throw new Error("Announcement ID is required.");
  }

  if (!userId?.trim()) {
    throw new Error("Authenticated user ID is required.");
  }

  const announcement = await Announcement.findOne({ _id: announcementId, status: "PUBLISHED" })
    .select("_id type")
    .lean();

  if (!announcement) {
    throw new Error("Announcement not found.");
  }

  if ((announcement as any).status === "EXPIRED") {
    throw new Error("This announcement has expired.");
  }

  const now = new Date().toISOString();

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
 * not only employees who already have AnnouncementReceipt records.
 *
 * Therefore:
 *
 * Employee
 *     LEFT JOIN
 * AnnouncementReceipt
 *
 * No receipt = unread.
 *
 * Employee.userId is linked to User._id.
 * The authoritative application role is stored in User.role.
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
     GET USER ROLES

     Employee.userId -> User._id

     User.role is the authoritative role used by the
     authentication/authorization system.
  ------------------------------------------------------- */

  const userIds = employees
    .map((employee: any) =>
      employee.userId
        ? String(employee.userId)
        : "",
    )
    .filter(Boolean);

  const users =
    userIds.length > 0
      ? ((await User.find({
          _id: {
            $in: userIds,
          },
        })
          .select("_id role")
          .lean()) as any[])
      : [];

  const userRoleMap =
    new Map<string, string>(
      users.map(
        (user: any) => [
          String(user._id),
          String(user.role ?? ""),
        ],
      ),
    );

  /* -------------------------------------------------------
     GET EXISTING RECEIPTS

     New receipts use authenticated USER ID.
     Legacy installations may contain Employee._id.
  ------------------------------------------------------- */

  const receipts =
    (await AnnouncementReceipt.find({
      announcementId,
    }).lean()) as any[];

  const receiptMap =
    new Map<string, any>();

  for (const receipt of receipts) {
    const key = String(
      receipt.userId,
    );

    const existing =
      receiptMap.get(key);

    /* Prefer the newest receipt if duplicate
       legacy records exist. */
    if (
      !existing ||
      new Date(
        receipt.updatedAt ??
          receipt.createdAt ??
          0,
      ).getTime() >
        new Date(
          existing.updatedAt ??
            existing.createdAt ??
            0,
        ).getTime()
    ) {
      receiptMap.set(
        key,
        receipt,
      );
    }
  }

  /* -------------------------------------------------------
     BUILD ELIGIBLE RECIPIENTS
  ------------------------------------------------------- */

  const status: any[] = [];

  for (const employee of employees) {
    /*
     * AnnouncementReceipt.userId stores
     * the authenticated USER ID.
     */
    const userId =
      employee.userId
        ? String(employee.userId)
        : "";

    /*
     * Employees without a user account cannot
     * receive/read an announcement.
     */
    if (!userId) {
      continue;
    }

    /* -----------------------------------------------------
       ROLE

       IMPORTANT:
       Employee does not have the authoritative role field.
       User.role does.

       Keep the Employee fallbacks for compatibility with
       any old records/data structures.
    ----------------------------------------------------- */

    const role =
      userRoleMap.get(userId) ??
      employee.role ??
      employee.designation ??
      employee.jobTitle ??
      "";

    /* -----------------------------------------------------
       DEPARTMENT VALUES
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
     * Support direct departmentName
     * for compatibility.
     */
    if (employee.departmentName) {
      departmentValues.add(
        normalize(
          employee.departmentName,
        ),
      );
    }

    /* -----------------------------------------------------
       LOCATION VALUES
    ----------------------------------------------------- */

    const locationValues =
      new Set<string>();

    if (employee.city) {
      locationValues.add(
        normalize(
          employee.city,
        ),
      );
    }

    if (employee.state) {
      locationValues.add(
        normalize(
          employee.state,
        ),
      );
    }

    if (employee.country) {
      locationValues.add(
        normalize(
          employee.country,
        ),
      );
    }

    if (employee.location) {
      locationValues.add(
        normalize(
          employee.location,
        ),
      );
    }

    /* -----------------------------------------------------
       ROLE VALUES
    ----------------------------------------------------- */

    const normalizedRole =
      normalize(role);

    const roleValues =
      new Set<string>();

    if (normalizedRole) {
      roleValues.add(
        normalizedRole,
      );

      /*
       * Keep compatibility with role aliases used by
       * the existing targeting implementation.
       */
      const roleAliases: Record<
        string,
        string[]
      > = {
        super_admin: [
          "super admin",
          "superadmin",
          "administrator",
          "admin",
        ],
        hr_admin: [
          "hr admin",
          "hr",
          "human resources",
          "human resource",
        ],
        manager: [
          "manager",
          "people manager",
          "team manager",
        ],
        recruiter: [
          "recruiter",
          "recruitment",
          "talent acquisition",
        ],
        finance: [
          "finance",
          "financial",
          "accounts",
        ],
        it_support: [
          "it support",
          "it",
          "support",
        ],
        employee: [
          "employee",
          "staff",
        ],
      };

      for (
        const alias of
          roleAliases[
            normalizedRole
          ] ?? []
      ) {
        roleValues.add(
          normalize(alias),
        );
      }
    }

    const targeting = {
      departmentValues:
        Array.from(
          departmentValues,
        ),

      locationValues:
        Array.from(
          locationValues,
        ),

      roleValues:
        Array.from(
          roleValues,
        ),
    };

    /* -----------------------------------------------------
       AUDIENCE MATCH
    ----------------------------------------------------- */

    if (
      !matchesAudience(
        announcement.audience,
        role,
      )
    ) {
      continue;
    }

    /* -----------------------------------------------------
       TARGETING MATCH
    ----------------------------------------------------- */

    if (
      !matchesTargeting(
        announcement,
        targeting,
      )
    ) {
      continue;
    }

    /* -----------------------------------------------------
       RECEIPT

       Primary:
         authenticated User ID

       Compatibility fallback:
         Employee ID
    ----------------------------------------------------- */

    let receipt =
      receiptMap.get(
        userId,
      );

    if (
      !receipt &&
      employee._id
    ) {
      receipt =
        receiptMap.get(
          String(
            employee._id,
          ),
        );
    }

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
      `${String(
        firstName,
      ).trim()} ${String(
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

    let departmentName =
      "";

    if (
      employee.departmentId
    ) {
      const department =
        departmentMap.get(
          String(
            employee.departmentId,
          ),
        );

      if (department) {
        departmentName =
          department.name ??
          department.code ??
          "";
      }
    }

    if (
      !departmentName &&
      employee.departmentName
    ) {
      departmentName =
        employee.departmentName;
    }

    /* -----------------------------------------------------
       READ STATUS

       No receipt = UNREAD.
    ----------------------------------------------------- */

    const isRead =
      receipt
        ? Boolean(
            receipt.isRead,
          )
        : false;

    const isAcknowledged =
      receipt
        ? Boolean(
            receipt.isAcknowledged,
          )
        : false;

    /* -----------------------------------------------------
       PUSH RESULT
    ----------------------------------------------------- */

    status.push({
      id: receipt?._id
        ? String(
            receipt._id,
          )
        : `${announcementId}:${userId}`,

      announcementId:
        String(
          announcementId,
        ),

      userId,

      employeeId:
        employee._id
          ? String(
              employee._id,
            )
          : null,

      employeeName:
        String(
          employeeName,
        ).trim() ||
        "Employee",

      name:
        String(
          employeeName,
        ).trim() ||
        "Employee",

      department:
        String(
          departmentName,
        ).trim() ||
        "—",

      role:
        String(
          role,
        ).trim() ||
        "—",

      isRead,

      isAcknowledged,

      readAt:
        receipt?.readAt ??
        null,

      acknowledgedAt:
        receipt?.acknowledgedAt ??
        null,

      createdAt:
        receipt?.createdAt ??
        null,

      updatedAt:
        receipt?.updatedAt ??
        null,
    });
  }

  /* -------------------------------------------------------
     SORT

     Unread first, then employee name.
  ------------------------------------------------------- */

  status.sort(
    (a, b) => {
      if (
        a.isRead !==
        b.isRead
      ) {
        return a.isRead
          ? 1
          : -1;
      }

      return String(
        a.employeeName ??
          "",
      ).localeCompare(
        String(
          b.employeeName ??
            "",
        ),
      );
    },
  );

  return status;
}

/* =========================================================
   GET ONE
========================================================= */

export async function getAnnouncement(id: string) {
  const announcement = await Announcement.findOne({ _id: id, status: "PUBLISHED" }).lean();

  return toApiDoc(announcement);
}

/* =========================================================
   CREATE
========================================================= */

export async function createAnnouncement(data: {
  title: string;
  body: string;
  type: string;
  audience: string;

  departments?: string[];
  locations?: string[];
  targetRoles?: string[];

  pinned?: boolean;
  attachment?: string;
  createdBy: string;

  scheduledAt?: string;

  showBanner?: boolean;

  requiresAcknowledgement?: boolean;

  channels?: string[];

  calendarEnabled?: boolean;

  eventStartAt?: string;

  eventEndAt?: string;

  eventLocation?: string;
  expiryDays?: number;
}) {
  const now = new Date().toISOString();

  const scheduledDate = data.scheduledAt ? new Date(data.scheduledAt) : null;

  if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
    throw new Error("Invalid scheduled date/time.");
  }

  const publishNow = !scheduledDate || scheduledDate.getTime() <= Date.now();

  const channels = Array.from(
    new Set(
      (data.channels ?? ["IN_APP"])
        .map((channel) => String(channel).trim().toUpperCase())
        .filter(Boolean),
    ),
  );

  if (channels.length === 0) {
    throw new Error("At least one notification channel is required.");
  }

  const showBanner = channels.includes("BANNER");

  const calendarEnabled = channels.includes("CALENDAR");

  if (calendarEnabled) {
    if (!data.eventStartAt || !data.eventEndAt) {
      throw new Error(
        "Event start and end date/time are required when Calendar is selected.",
      );
    }

    const eventStart = new Date(data.eventStartAt);

    const eventEnd = new Date(data.eventEndAt);

    if (
      Number.isNaN(eventStart.getTime()) ||
      Number.isNaN(eventEnd.getTime())
    ) {
      throw new Error("Invalid calendar event date/time.");
    }

    if (eventEnd.getTime() < eventStart.getTime()) {
      throw new Error(
        "Event end date/time cannot be before event start date/time.",
      );
    }
  }

  const requiresAcknowledgement =
    data.requiresAcknowledgement ?? data.type === "POLICY_UPDATE";

  const expiryDays = Number(data.expiryDays ?? env.announcementExpiryDays);
  if (!Number.isFinite(expiryDays) || expiryDays <= 0 || expiryDays > 365) {
    throw new Error("Announcement expiry must be between 1 and 365 days.");
  }

  const announcement = await Announcement.create({
    title: data.title.trim(),

    body: data.body.trim(),

    type: data.type,

    audience: data.audience,

    departments: data.departments ?? [],

    locations: data.locations ?? [],

    targetRoles: data.targetRoles ?? [],

    channels,

    showBanner,

    requiresAcknowledgement,

    calendarEnabled,

    eventStartAt: calendarEnabled ? (data.eventStartAt ?? "") : "",

    eventEndAt: calendarEnabled ? (data.eventEndAt ?? "") : "",

    eventLocation: calendarEnabled ? (data.eventLocation ?? "") : "",

    pinned: data.pinned ?? false,

    attachment: data.attachment || "",

    createdBy: data.createdBy,

    status: publishNow ? "PUBLISHED" : "SCHEDULED",

    scheduledAt: data.scheduledAt ?? "",

    publishedAt: publishNow ? now : "",
    expiryDays,
    expiresAt: publishNow ? new Date(new Date(now).getTime() + expiryDays * 24 * 60 * 60 * 1000).toISOString() : null,
    expiredAt: null,

    createdAt: now,

    updatedAt: now,
  });

  const saved = await Announcement.findById(announcement._id).lean();

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
    expiryDays?: number;
  },
) {
  const existingAnnouncement = (await Announcement.findById(id)
    .select("status expiresAt")
    .lean()) as any;

  if (!existingAnnouncement) return undefined;

  const isExpired =
    existingAnnouncement.status === "EXPIRED" ||
    Boolean(
      existingAnnouncement.expiresAt &&
        new Date(existingAnnouncement.expiresAt).getTime() <= Date.now(),
    );

  if (isExpired) {
    throw new Error("Expired announcements cannot be edited.");
  }

  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (data.title !== undefined) {
    update.title = data.title.trim();
  }

  if (data.body !== undefined) {
    update.body = data.body.trim();
  }

  if (data.type !== undefined) {
    update.type = data.type;
  }

  if (data.audience !== undefined) {
    update.audience = data.audience;
  }

  if (data.pinned !== undefined) {
    update.pinned = data.pinned;
  }

  if (data.attachment !== undefined) {
    update.attachment = data.attachment;
  }

  if (data.departments !== undefined) {
    update.departments = data.departments;
  }

  if (data.locations !== undefined) {
    update.locations = data.locations;
  }

  if (data.targetRoles !== undefined) {
    update.targetRoles = data.targetRoles;
  }

  if (data.channels !== undefined) {
    const channels = Array.from(
      new Set(
        data.channels
          .map((channel) => String(channel).trim().toUpperCase())
          .filter(Boolean),
      ),
    );

    if (channels.length === 0) {
      throw new Error("At least one notification channel is required.");
    }

    const hasBanner = channels.includes("BANNER");

    const hasCalendar = channels.includes("CALENDAR");

    update.channels = channels;

    update.showBanner = hasBanner;

    update.calendarEnabled = hasCalendar;

    if (!hasCalendar) {
      update.eventStartAt = "";

      update.eventEndAt = "";

      update.eventLocation = "";
    }
  }

  if (data.showBanner !== undefined) {
    update.showBanner = data.showBanner;
  }

  if (data.requiresAcknowledgement !== undefined) {
    update.requiresAcknowledgement = data.requiresAcknowledgement;
  }

  if (data.scheduledAt !== undefined) {
    const existing = (await Announcement.findById(id)
      .select("status scheduledAt publishedAt")
      .lean()) as any;

    if (!existing) {
      return undefined;
    }

    update.scheduledAt = data.scheduledAt;

    const previousScheduledAt = existing.scheduledAt ?? "";

    const nextScheduledAt = data.scheduledAt ?? "";

    const scheduleChanged = previousScheduledAt !== nextScheduledAt;

    if (scheduleChanged) {
      const scheduledDate = nextScheduledAt ? new Date(nextScheduledAt) : null;

      const publishNow =
        !scheduledDate ||
        Number.isNaN(scheduledDate.getTime()) ||
        scheduledDate.getTime() <= Date.now();

      update.status = publishNow ? "PUBLISHED" : "SCHEDULED";

      update.publishedAt = publishNow
        ? (existing.publishedAt ?? new Date().toISOString())
        : "";
    }
  }

  if (data.calendarEnabled !== undefined) {
    update.calendarEnabled = data.calendarEnabled;
  }

  if (data.eventStartAt !== undefined) {
    update.eventStartAt = data.eventStartAt;
  }

  if (data.eventEndAt !== undefined) {
    update.eventEndAt = data.eventEndAt;
  }

  if (data.eventLocation !== undefined) {
    update.eventLocation = data.eventLocation;
  }

  if (data.expiryDays !== undefined) {
    const expiryDays = Number(data.expiryDays);
    if (!Number.isFinite(expiryDays) || expiryDays <= 0 || expiryDays > 365) {
      throw new Error("Announcement expiry must be between 1 and 365 days.");
    }

    const existing = await Announcement.findById(id).select("publishedAt createdAt status").lean();
    if (existing?.status === "PUBLISHED") {
      const source = existing.publishedAt || existing.createdAt;
      update.expiresAt = new Date(new Date(source).getTime() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
      update.expiredAt = null;
    }
  }

  const updated = await Announcement.findByIdAndUpdate(id, update, {
    new: true,
  }).lean();

  return toApiDoc(updated);
}

/* =========================================================
   PUBLISH SCHEDULED ANNOUNCEMENTS
========================================================= */

export async function publishDueAnnouncements() {
  const now = new Date().toISOString();

  const dueAnnouncements = (await Announcement.find({
    status: "SCHEDULED",

    scheduledAt: {
      $ne: "",
      $lte: now,
    },
  }).lean()) as any[];

  if (dueAnnouncements.length === 0) {
    return [];
  }

  const published: any[] = [];

  for (const announcement of dueAnnouncements) {
    const updated = (await Announcement.findOneAndUpdate(
      {
        _id: announcement._id,

        status: "SCHEDULED",

        scheduledAt: {
          $ne: "",
          $lte: now,
        },
      },

      {
        $set: {
          status: "PUBLISHED",

          publishedAt: now,
          expiresAt: new Date(new Date(now).getTime() + Number(announcement.expiryDays ?? env.announcementExpiryDays) * 24 * 60 * 60 * 1000).toISOString(),
          expiredAt: null,

          updatedAt: now,
        },
      },

      {
        new: true,
      },
    ).lean()) as any;

    if (updated) {
      published.push(toApiDoc(updated));
    }
  }

  return published;
}

/* =========================================================
   DELETE
========================================================= */

export async function deleteAnnouncement(id: string) {
  const announcement = await Announcement.findById(id);

  if (!announcement) {
    return null;
  }

  const isExpired =
    (announcement as any).status === "EXPIRED" ||
    Boolean(
      (announcement as any).expiresAt &&
        new Date((announcement as any).expiresAt).getTime() <= Date.now(),
    );

  if (isExpired) {
    throw new Error("Expired announcements cannot be deleted.");
  }

  await Announcement.deleteOne({
    _id: announcement._id,
  });

  return announcement;
}
