import {
  Notification,
  Announcement,
  User,
  Employee,
  Department,
} from "@/db/models";

import { nowIso } from "@/db/connection";

import {
  sendAnnouncementEmail,
} from "@/services/email.service";

/* =========================================================
   NOTIFICATION TYPES
========================================================= */

export type NotificationType =
  | "LEAVE_REQUEST"
  | "LEAVE_DECISION"
  | "ANNOUNCEMENT"
  | "PAYROLL"
  | "PERFORMANCE"
  | "RECRUITMENT"
  | "TICKET_MESSAGE"
  | "SYSTEM"
  | "DOCUMENT_REQUESTED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_READY";
  
/* =========================================================
   API DOCUMENT
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
   CREATE NOTIFICATION
========================================================= */

export async function notify(input: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}) {
  const doc = await Notification.create({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link ?? null,
    isRead: false,
    createdAt: nowIso(),
  });

  return doc._id;
}

/* =========================================================
   LIST NOTIFICATIONS
========================================================= */

export async function listNotifications(
  userId: string,
  unreadOnly = false,
) {
  const query: Record<string, any> = {
    userId,
  };

  if (unreadOnly) {
    query.isRead = false;
  }

  const rows = await Notification.find(query)
    .sort({
      createdAt: -1,
    })
    .limit(50)
    .lean();

  return rows.map(toApiDoc);
}

/* =========================================================
   UNREAD COUNT
========================================================= */

export async function unreadCount(
  userId: string,
) {
  return Notification.countDocuments({
    userId,
    isRead: false,
  });
}

/* =========================================================
   MARK READ
========================================================= */

export async function markRead(
  id: string,
  userId: string,
) {
  const result = await Notification.updateOne(
    {
      _id: id,
      userId,
    },
    {
      $set: {
        isRead: true,
      },
    },
  );

  /*
   * Return the write result so the route/UI can distinguish:
   *   - the notification belonged to this user
   *   - the notification did not belong to this user
   *
   * This remains completely role-neutral.
   */
  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  };
}

/* =========================================================
   MARK ALL READ
========================================================= */

export async function markAllRead(
  userId: string,
) {
  await Notification.updateMany(
    {
      userId,
    },
    {
      $set: {
        isRead: true,
      },
    },
  );
}

/* =========================================================
   LIST ANNOUNCEMENTS
========================================================= */

export async function listAnnouncements() {
  const rows = await Announcement.find({})
    .sort({
      pinned: -1,
      createdAt: -1,
    })
    .lean();

  return rows.map(toApiDoc);
}

/* =========================================================
   ANNOUNCEMENT RECIPIENT RESOLUTION
========================================================= */

/*
 * Rules:
 *
 * 1. Audience determines the base roles.
 * 2. Target roles further restrict the audience.
 * 3. Multiple target roles are OR.
 * 4. Multiple departments are OR.
 * 5. Multiple locations are OR.
 * 6. Different targeting dimensions are AND.
 * 7. Empty targeting means no restriction.
 *
 * Examples:
 *
 * ALL
 *   -> every active user
 *
 * ALL + MANAGER
 *   -> active managers
 *
 * ALL + Engineering
 *   -> Engineering employees
 *
 * ALL + Engineering + Hyderabad
 *   -> Engineering employees in Hyderabad
 *
 * ALL + MANAGER + Hyderabad
 *   -> Hyderabad managers
 *
 * ALL + Engineering + Hyderabad + MANAGER
 *   -> Hyderabad Engineering managers
 */

/* =========================================================
   NORMALIZATION HELPERS
========================================================= */

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeUpper(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function canonicalRole(value: unknown): string {
  const normalized = normalizeUpper(value)
    .replace(/[-\s]+/g, "_");

  const aliases: Record<string, string> = {
    SUPERADMIN: "SUPER_ADMIN",
    SUPER_ADMIN: "SUPER_ADMIN",

    HR: "HR_ADMIN",
    HRADMIN: "HR_ADMIN",
    HR_ADMIN: "HR_ADMIN",

    FINANCE: "FINANCE",
    PAYROLL: "FINANCE",

    MANAGER: "MANAGER",

    RECRUITER: "RECRUITER",
    RECRUITMENT: "RECRUITER",

    IT: "IT_SUPPORT",
    ITSUPPORT: "IT_SUPPORT",
    IT_SUPPORT: "IT_SUPPORT",

    EMPLOYEE: "EMPLOYEE",
    STAFF: "EMPLOYEE",
  };

  return aliases[normalized] ?? normalized;
}

function getRoleAliases(role: string): string[] {
  const canonical = canonicalRole(role);

  const aliases: Record<string, string[]> = {
    SUPER_ADMIN: ["SUPER_ADMIN", "SUPERADMIN"],
    HR_ADMIN: ["HR_ADMIN", "HRADMIN", "HR"],
    FINANCE: ["FINANCE", "PAYROLL"],
    MANAGER: ["MANAGER"],
    RECRUITER: ["RECRUITER", "RECRUITMENT"],
    IT_SUPPORT: ["IT_SUPPORT", "ITSUPPORT", "IT"],
    EMPLOYEE: ["EMPLOYEE", "STAFF"],
  };

  return aliases[canonical] ?? [canonical];
}

function normalizeStringArray(
  values?: string[],
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) =>
          String(value ?? "").trim(),
        )
        .filter(Boolean),
    ),
  );
}

function escapeRegExp(value: string) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

/* =========================================================
   AUDIENCE ROLE MAP
========================================================= */

const AUDIENCE_ROLE_MAP: Record<
  string,
  string[]
> = {
  ALL: [
    "SUPER_ADMIN",
    "HR_ADMIN",
    "MANAGER",
    "RECRUITER",
    "FINANCE",
    "IT_SUPPORT",
    "EMPLOYEE",
  ],

  HR_ADMIN: [
    "HR_ADMIN",
  ],

  FINANCE: [
    "FINANCE",
  ],

  MANAGER: [
    "MANAGER",
  ],

  RECRUITER: [
    "RECRUITER",
  ],

  IT_SUPPORT: [
    "IT_SUPPORT",
  ],

  EMPLOYEE: [
    "EMPLOYEE",
  ],
};

/* =========================================================
   RESOLVE DEPARTMENTS
========================================================= */

async function resolveDepartmentIds(
  departments: string[],
): Promise<string[]> {
  if (!departments.length) {
    return [];
  }

  const normalizedTargets =
    departments.map(normalize);

  /*
   * First try normal Mongo queries.
   */
  const departmentDocs =
    await Department.find({
      $or: [
        {
          name: {
            $in: departments,
          },
        },
        {
          code: {
            $in: departments,
          },
        },
        {
          _id: {
            $in: departments,
          },
        },
      ],
    })
      .select("_id name code")
      .lean();

  /*
   * If exact matching did not find everything,
   * load departments and perform case-insensitive
   * matching in JavaScript.
   *
   * This handles:
   *
   * Engineering
   * engineering
   * ENGINEERING
   *
   * and similar frontend free-text values.
   */
  let allDepartmentDocs: any[] = departmentDocs;

  if (
    departmentDocs.length <
    departments.length
  ) {
    allDepartmentDocs =
      await Department.find({})
        .select("_id name code")
        .lean();
  }

  const matchedIds = new Set<string>();

  for (const department of allDepartmentDocs) {
    const id = normalize(department._id);
    const name = normalize(department.name);
    const code = normalize(department.code);

    const matched =
      normalizedTargets.includes(id) ||
      normalizedTargets.includes(name) ||
      normalizedTargets.includes(code);

    if (matched) {
      matchedIds.add(
        String(department._id),
      );
    }
  }

  /*
   * Also preserve exact query results.
   */
  for (const department of departmentDocs) {
    matchedIds.add(
      String(department._id),
    );
  }

  return Array.from(matchedIds);
}

/* =========================================================
   RESOLVE ANNOUNCEMENT USERS
========================================================= */

async function resolveAnnouncementUsers(
  input: {
    audience?: string;
    departments?: string[];
    locations?: string[];
    targetRoles?: string[];
  },
) {
  const audience = normalizeUpper(input.audience ?? "ALL");

  const departments = normalizeStringArray(input.departments);
  const locations = normalizeStringArray(input.locations);
  const targetRoles = normalizeStringArray(input.targetRoles).map(
    normalizeUpper,
  );

  console.log("[Announcements] Resolving recipients:", {
    audience,
    departments,
    locations,
    targetRoles,
  });

  const audienceKey = canonicalRole(audience);

  /*
   * ALL means every active user in the HRMS, regardless of the role string
   * stored on that user. This prevents future roles or legacy role names from
   * being accidentally excluded from an "All Employees" announcement.
   *
   * Once a target role is explicitly selected, the role becomes a restriction.
   */
  const audienceRoles =
    AUDIENCE_ROLE_MAP[audienceKey] ??
    AUDIENCE_ROLE_MAP.ALL;

  /*
   * Target roles further restrict the selected audience.
   * Multiple roles are OR; role + department/location are AND.
   *
   * Normalize both the selected audience and target role so
   * "HR", "HR_ADMIN", "Manager", "SUPERADMIN", etc. all map
   * consistently to the database role.
   */
  const normalizedTargetRoles =
    targetRoles.map(canonicalRole);

  const effectiveRoles =
    normalizedTargetRoles.length > 0
      ? audienceRoles.filter((role) =>
          normalizedTargetRoles.includes(
            canonicalRole(role),
          ),
        )
      : audienceRoles;

  if (!effectiveRoles.length) {
    console.log(
      "[Announcements] No users because target role does not match audience.",
      {
        audience: audienceKey,
        audienceRoles,
        targetRoles: normalizedTargetRoles,
      },
    );
    return [];
  }

  /*
   * Expand canonical roles into supported database aliases.
   * This is important for ALL announcements: every supported
   * role must be included even if older user records use an
   * alternate spelling.
   */
  const roleAliases = Array.from(
    new Set(
      effectiveRoles.flatMap(getRoleAliases),
    ),
  );

  /*
   * Fast path: no department/location targeting.
   *
   * ALL without an explicit target role means EVERY active user.
   * This includes SUPER_ADMIN, HR_ADMIN, FINANCE, MANAGER, RECRUITER,
   * IT_SUPPORT, EMPLOYEE, and any future role added to the HRMS.
   *
   * A selected target role still restricts the recipients.
   */
  if (!departments.length && !locations.length) {
    const hasExplicitRoleRestriction =
      normalizedTargetRoles.length > 0 ||
      audienceKey !== "ALL";

    const userQuery: Record<string, any> = {
      isActive: true,
    };

    if (hasExplicitRoleRestriction) {
      userQuery.role = {
        $in: roleAliases,
      };
    }

    const users = await User.find(userQuery)
      .select("_id email role")
      .lean();

    console.log(
      `[Announcements] Base audience users: ${users.length} | audience=${audienceKey} | roleFilter=${hasExplicitRoleRestriction ? roleAliases.join(",") : "ALL_ACTIVE_USERS"}`,
    );

    return users;
  }

  /*
   * Resolve department names/codes to IDs.
   */
  const departmentIds =
    departments.length > 0
      ? await resolveDepartmentIds(departments)
      : [];

  if (departments.length > 0) {
    console.log("[Announcements] Department resolution:", {
      requested: departments,
      matchedIds: departmentIds,
    });

    if (!departmentIds.length) {
      console.log("[Announcements] No departments matched.");
      return [];
    }
  }

  /*
   * IMPORTANT:
   *
   * Do not combine department/location conditions into a Mongo
   * query that assumes one exact Employee schema representation.
   *
   * Some records may store:
   *   departmentId = department ID
   *   departmentId = department name/code
   *
   * and location may be stored in city/state/country.
   *
   * Fetch the active employees belonging to the selected audience
   * and perform normalized intersection filtering in JavaScript.
   * This guarantees:
   *
   *   Department AND Location AND Role
   *
   * while still supporting OR within each individual dimension.
   */
  const employees = await Employee.find({})
    .select(
      "userId departmentId city state country",
    )
    .lean();

  const normalizedDepartmentIds = new Set(
    departmentIds.map(normalize),
  );

  const normalizedDepartmentValues = new Set(
    departments.map(normalize),
  );

  const normalizedLocations = new Set(
    locations.map(normalize),
  );

  const matchesDepartment = (employee: any) => {
    if (!departments.length) return true;

    const departmentValue = normalize(
      employee.departmentId,
    );

    return (
      normalizedDepartmentIds.has(departmentValue) ||
      normalizedDepartmentValues.has(departmentValue)
    );
  };

  const matchesLocation = (employee: any) => {
    if (!locations.length) return true;

    const employeeLocations = [
      employee.city,
      employee.state,
      employee.country,
    ]
      .map(normalize)
      .filter(Boolean);

    return employeeLocations.some((value) =>
      normalizedLocations.has(value),
    );
  };

  /*
   * First filter employees by department/location.
   */
  const matchingEmployees = employees.filter(
    (employee: any) =>
      matchesDepartment(employee) &&
      matchesLocation(employee),
  );

  console.log(
    `[Announcements] Matching employees: ${matchingEmployees.length}`,
  );

  if (!matchingEmployees.length) {
    return [];
  }

  const employeeUserIds = Array.from(
    new Set(
      matchingEmployees
        .map((employee: any) =>
          String(employee.userId ?? ""),
        )
        .filter(Boolean),
    ),
  );

  if (!employeeUserIds.length) {
    console.log(
      "[Announcements] Employees matched but no userIds found.",
    );
    return [];
  }

  /*
   * Final user query applies BOTH:
   *
   *   1. audience / target role
   *   2. employee department/location match
   */
  const hasExplicitRoleRestriction =
    normalizedTargetRoles.length > 0 ||
    audienceKey !== "ALL";

  const userQuery: Record<string, any> = {
    _id: { $in: employeeUserIds },
    isActive: true,
  };

  if (hasExplicitRoleRestriction) {
    userQuery.role = {
      $in: roleAliases,
    };
  }

  const users = await User.find(userQuery)
    .select("_id email role")
    .lean();

  console.log(
    "[Announcements] Final recipients:",
    users.map((user) => ({
      id: String(user._id),
      email: user.email,
      role: user.role,
    })),
  );

  console.log(
    "[Announcements] Recipient rule:",
    {
      audience: audienceKey,
      targetRoles: normalizedTargetRoles,
      departments,
      locations,
      roleRestricted: hasExplicitRoleRestriction,
      total: users.length,
    },
  );

  return users;
}

/* =========================================================
   IN-APP ANNOUNCEMENT NOTIFICATION
========================================================= */

export async function broadcastAnnouncementNotification(
  announcement: {
    title: string;
    body: string;
    audience: string;
    departments?: string[];
    locations?: string[];
    targetRoles?: string[];
  },
) {
  const users =
    await resolveAnnouncementUsers({
      audience:
        announcement.audience,

      departments:
        announcement.departments,

      locations:
        announcement.locations,

      targetRoles:
        announcement.targetRoles,
    });

  if (!users.length) {
    console.log(
      "[Announcements] No matching users for in-app broadcast.",
    );

    return {
      total: 0,
      sent: 0,
      failed: 0,
    };
  }

  const createdAt =
    nowIso();

  const notifications =
    users.map((user) => ({
      userId: user._id,

      type:
        "ANNOUNCEMENT" as const,

      title:
        announcement.title,

      message:
        announcement.body.slice(
          0,
          250,
        ),

      link:
        "/app/announcements",

      isRead: false,

      createdAt,
    }));

  await Notification.insertMany(
    notifications,
  );

  console.log(
    `[Announcements] In-app broadcast completed. Total recipients: ${users.length}, Sent: ${notifications.length}`,
  );

  return {
    total: users.length,
    sent: notifications.length,
    failed: 0,
  };
}

/* =========================================================
   EMAIL ANNOUNCEMENT BROADCAST
========================================================= */

export async function broadcastAnnouncementEmail(
  announcement: {
    title: string;
    body: string;
    audience: string;
    departments?: string[];
    locations?: string[];
    targetRoles?: string[];
  },
) {
  const users =
    await resolveAnnouncementUsers({
      audience:
        announcement.audience,

      departments:
        announcement.departments,

      locations:
        announcement.locations,

      targetRoles:
        announcement.targetRoles,
    });

  if (!users.length) {
    console.log(
      "[Announcements] No matching users for email broadcast.",
    );

    return {
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    };
  }

  /*
   * IMPORTANT:
   *
   * Email delivery must NOT block the announcement request.
   *
   * In-app notifications are inserted before this function is
   * called. Email is therefore queued in the background and the
   * API can return immediately.
   *
   * This also prevents a slow/unreachable recipient mail server
   * from delaying:
   *
   *   - in-app notifications
   *   - dashboard banners
   *   - calendar updates
   *   - announcement publishing response
   *
   * The actual email sending still happens for every resolved
   * recipient and failures are logged individually.
   */

  const emailUsers = users.filter(
    (user) =>
      !!user.email &&
      !!user.email.trim(),
  );

  const skipped =
    users.length - emailUsers.length;

  console.log(
    `[Announcements] Email broadcast queued in background. Total: ${users.length}, Queued: ${emailUsers.length}, Skipped: ${skipped}`,
  );

  /*
   * Fire-and-forget background delivery.
   *
   * Promise.allSettled() prevents one failed email from
   * stopping the remaining recipients.
   *
   * A concurrency limit is used so a large announcement
   * does not open hundreds of SMTP operations at exactly
   * the same time.
   */
  void (async () => {
    let sent = 0;
    let failed = 0;

    const CONCURRENCY = 10;

    for (
      let start = 0;
      start < emailUsers.length;
      start += CONCURRENCY
    ) {
      const batch =
        emailUsers.slice(
          start,
          start + CONCURRENCY,
        );

      const results =
        await Promise.allSettled(
          batch.map(async (user) => {
            const result =
              await sendAnnouncementEmail({
                to: user.email,

                title:
                  announcement.title,

                body:
                  announcement.body,
              });

            return {
              email: user.email,
              result,
            };
          }),
        );

      for (const outcome of results) {
        if (
          outcome.status ===
          "fulfilled"
        ) {
          if (outcome.value.result.sent) {
            sent++;
          }
        } else {
          failed++;

          console.error(
            "[Announcements] Background email delivery failed:",
            outcome.reason,
          );
        }
      }
    }

    console.log(
      `[Announcements] Background email broadcast completed. Total: ${users.length}, Sent: ${sent}, Failed: ${failed}, Skipped: ${skipped}`,
    );
  })().catch((error) => {
    /*
     * Final safety net: background email failures must never
     * become unhandled promise rejections or affect the
     * announcement/in-app delivery path.
     */
    console.error(
      "[Announcements] Background email worker failed:",
      error,
    );
  });

  /*
   * Return immediately. The caller does NOT wait for SMTP.
   */
  return {
    total: users.length,
    sent: 0,
    failed: 0,
    skipped,
    queued: emailUsers.length,
  };
}

/* =========================================================
   CREATE ANNOUNCEMENT
========================================================= */

export async function createAnnouncement(
  input: {
    title: string;
    body: string;
    pinned?: boolean;
    audience?: string;
  },
) {
  const doc =
    await Announcement.create({
      title: input.title,

      body: input.body,

      pinned:
        !!input.pinned,

      audience:
        input.audience ??
        "ALL",

      createdAt:
        nowIso(),

      updatedAt:
        nowIso(),
    });

  return toApiDoc(
    (
      await Announcement.findById(
        doc._id,
      ).lean()
    )!,
  );
}