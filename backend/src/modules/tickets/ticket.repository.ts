import * as Models from "@/db/models";

// Support different export styles from the models module
const Ticket: any =
  (Models as any).Ticket || (Models as any).default || (Models as any).ticket;

const TicketMessage: any =
  (Models as any).TicketMessage || (Models as any).ticketMessage;

const Employee: any = (Models as any).Employee || (Models as any).employee;

const TicketEscalationHistory: any =
  (Models as any).TicketEscalationHistory ||
  (Models as any).ticketEscalationHistory;

const TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_EMPLOYEE",
  "RESOLVED",
  "CLOSED",
] as const;

export function isTicketStatus(
  status: string,
): status is (typeof TICKET_STATUSES)[number] {
  return TICKET_STATUSES.includes(
    status as (typeof TICKET_STATUSES)[number],
  );
}

const TICKET_ESCALATION_TARGETS = ["HR_ADMIN", "SUPER_ADMIN"] as const;

type TicketEscalationTarget = (typeof TICKET_ESCALATION_TARGETS)[number];

function isTicketEscalationTarget(
  target: string,
): target is TicketEscalationTarget {
  return (TICKET_ESCALATION_TARGETS as readonly string[]).includes(target);
}

function getSlaHours(priority: string) {
  // SmartHR Pro SLA Standards:
  // CRITICAL: 1 Hour (Harassment, safety, legal, major business blocker)
  // HIGH: 4 Hours (Payroll discrepancies, IT outage, urgent HR deadlines)
  // MEDIUM: 24 Hours / 1 Business Day (Leave disputes, general policy queries)
  // LOW: 72 Hours / 3 Business Days (Facilities, routine feedback)
  switch (priority) {
    case "CRITICAL":
      return 1;
    case "HIGH":
      return 4;
    case "MEDIUM":
      return 24;
    case "LOW":
    default:
      return 72;
  }
}

function calculateSlaDueAt(createdAt: string, priority: string) {
  const created = new Date(createdAt);

  if (Number.isNaN(created.getTime())) {
    throw new Error("Invalid ticket creation date.");
  }

  return new Date(
    created.getTime() + getSlaHours(priority) * 60 * 60 * 1000,
  ).toISOString();
}

function calculateSlaStatus(
  dueAt: string | null,
  status: string,
  now = new Date(),
) {
  if (!dueAt) return "ON_TRACK";

  if (status === "RESOLVED" || status === "CLOSED") {
    return "PAUSED";
  }

  const due = new Date(dueAt);

  if (Number.isNaN(due.getTime())) {
    return "ON_TRACK";
  }

  if (due.getTime() <= now.getTime()) {
    return "BREACHED";
  }

  const remainingMs = due.getTime() - now.getTime();
  const remainingHours = remainingMs / (60 * 60 * 1000);

  // Mark as DUE_SOON if less than 25% of SLA window or <= 2 hours remaining
  return remainingHours <= 2 ? "DUE_SOON" : "ON_TRACK";
}

async function refreshTicketSla(ticket: any) {
  if (!ticket) return ticket;

  const slaStatus = calculateSlaStatus(ticket.slaDueAt ?? null, ticket.status);

  if (ticket.slaStatus !== slaStatus) {
    await Ticket.updateOne(
      { _id: ticket._id },
      {
        $set: {
          slaStatus,
          updatedAt: new Date().toISOString(),
        },
      },
    );

    ticket.slaStatus = slaStatus;
  }

  return ticket;
}

// =========================================================
// TICKET ID
// =========================================================

function generateTicketId(category: string) {
  const prefix = category.substring(0, 2).toUpperCase();

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const random = Math.floor(100 + Math.random() * 900);

  return `${prefix}-${date}-${random}`;
}

// =========================================================
// ASSIGN DEPARTMENT
// =========================================================

export function assignDepartment(category: string) {
  switch (category) {
    case "HR":
    case "Policy Query":
    case "Leave Issue":
    case "Leave":
    case "Attendance":
    case "Employee Referral":
      return "RECRUITER";

    case "Other":
      return "HR_ADMIN";

    case "Payroll Issue":
    case "Payroll":
      return "FINANCE";

    case "Manager Concern":
      // Manager concerns route to Senior Leadership / Super Admin
      return "SUPER_ADMIN";

    case "Harassment Complaint":
      // POSH & Workplace harassment complaints route to dedicated HR / Legal / Super Admin
      return "HR_ADMIN";

    case "IT Support":
      return "IT_SUPPORT";

    case "Infrastructure":
      return "HR_ADMIN";

    case "Recruitment":
      return "RECRUITER";

    case "Complaint":
      return "HR_ADMIN";

    default:
      return "HR_ADMIN";
  }
}

// =========================================================
// CREATE TICKET
// =========================================================

export async function createTicket(data: {
  employeeId: string;
  managerId?: string | null;
  category: string;
  priority: string;
  subject: string;
  description: string;
  attachment?: string;
  aiCategory?: string | null;
  aiIntent?: string | null;
  aiConfidence?: number | null;
  aiReason?: string | null;
  aiPriority?: string | null;
  aiPriorityReason?: string | null;
  aiSentiment?: string | null;
}) {
  const now = new Date().toISOString();

  // Enforce CRITICAL priority and POSH isolation for Harassment Complaints
  let effectivePriority = data.priority;

  if (data.category === "Harassment Complaint") {
    effectivePriority = "CRITICAL";
  }

  // Manager isolation:
  // Complaint tickets can retain the employee's manager relationship.
  // Manager Concern and Harassment Complaint are not assigned to direct managers.
  let assignedManagerId: string | null = null;

  if (data.category === "Complaint") {
    assignedManagerId = data.managerId || null;
  }

  const ticket = await Ticket.create({
    ticketId: generateTicketId(data.category),

    employeeId: data.employeeId,

    category: data.category,

    priority: effectivePriority,

    subject: data.subject,

    description: data.description,

    attachment: data.attachment || "",

    assignedTo: assignDepartment(data.category),

    assignedManagerId,

    status: "OPEN",

    slaDueAt: calculateSlaDueAt(now, effectivePriority),

    slaStatus: "ON_TRACK",

    isEscalated: false,

    escalatedAt: null,

    escalatedById: null,

    escalatedTo: null,

    escalationReason: null,

    // AI classification metadata
    aiCategory: data.aiCategory ?? null,

    aiIntent: data.aiIntent ?? null,

    aiConfidence: data.aiConfidence ?? null,

    aiReason: data.aiReason ?? null,

    aiPriority: data.aiPriority ?? null,

    aiPriorityReason: data.aiPriorityReason ?? null,

    aiSentiment: data.aiSentiment ?? null,

    createdAt: now,

    updatedAt: now,
  });

  return ticket;
}

// =========================================================
// GET ALL TICKETS
// =========================================================

export async function getTickets() {
  return Ticket.find({})
    .sort({ createdAt: -1 })
    .lean();
}

// =========================================================
// GET SINGLE TICKET
// =========================================================

export async function getTicket(id: string) {
  const ticket = await Ticket.findById(id).lean();

  if (!ticket) {
    return ticket;
  }

  return refreshTicketSla(ticket);
}

// =========================================================
// UPDATE TICKET STATUS
// =========================================================

export async function updateTicketStatus(
  id: string,
  status: string,
) {
  if (!isTicketStatus(status)) {
    throw new Error("Invalid ticket status.");
  }

  return Ticket.findByIdAndUpdate(
    id,
    {
      $set: {
        status,
        updatedAt: new Date().toISOString(),
      },
    },
    {
      new: true,
    },
  ).lean();
}

// =========================================================
// GET EMPLOYEE'S TICKETS
// =========================================================

export async function getMyTickets(employeeId: string) {
  console.log(
    "[Tickets] Loading tickets for employee:",
    employeeId,
  );

  const tickets = await Ticket.find({
    employeeId: employeeId,
  })
    .sort({
      createdAt: -1,
    })
    .lean();

  console.log(
    `[Tickets] Found ${tickets.length} ticket(s) for employee ${employeeId}`,
  );

  return tickets;
}

// =========================================================
// GET TICKETS BY ASSIGNED ROLE
// =========================================================

export async function getTicketsByAssignees(
  assignees: string[],
) {
  return Ticket.find({
    assignedTo: {
      $in: assignees,
    },
  })
    .sort({
      createdAt: -1,
    })
    .lean();
}

// =========================================================
// COUNT TICKETS FOR EMPLOYEE(S)
// =========================================================
// Kept for HR Copilot / existing callers.
// =========================================================

export async function countTickets(employeeIds: string[]) {
  if (
    !Array.isArray(employeeIds) ||
    employeeIds.length === 0
  ) {
    return 0;
  }

  return Ticket.countDocuments({
    employeeId: {
      $in: employeeIds,
    },
  });
}

// =========================================================
// GET MANAGER'S TEAM GRIEVANCE TICKETS
// =========================================================
//
// Manager access is scoped by:
//
// 1. Tickets explicitly assigned to the manager through
//    assignedManagerId.
//
// 2. Legacy Complaint tickets created by the manager's
//    direct reports.
//
// This allows existing Complaint records to continue working
// without rewriting historical ticket ownership.
//

export async function getTeamGrievanceTickets(
  managerId: string,
) {
  if (!managerId) {
    return [];
  }

  const normalizedManagerId = String(managerId).trim();

  if (!normalizedManagerId) {
    return [];
  }

  const directReports = await Employee.find({
    managerId: normalizedManagerId,
  })
    .select("_id")
    .lean();

  const directReportIds = directReports
    .map((employee: any) => String(employee._id))
    .filter(Boolean);

  const ownershipConditions: any[] = [
    {
      assignedManagerId: normalizedManagerId,
    },
  ];

  if (directReportIds.length > 0) {
    ownershipConditions.push({
      category: "Complaint",
      employeeId: {
        $in: directReportIds,
      },
    });
  }

  const tickets = await Ticket.find({
    $or: ownershipConditions,
  })
    .sort({
      createdAt: -1,
    })
    .lean();

  console.log(
    `[Tickets] Manager ${normalizedManagerId} -> ${tickets.length} team ticket(s)`,
  );

  return tickets;
}

export async function getTeamGrievanceTicket(
  ticketId: string,
  managerId: string,
) {
  if (!ticketId || !managerId) {
    return undefined;
  }

  const normalizedManagerId = String(managerId).trim();

  if (!normalizedManagerId) {
    return undefined;
  }

  const directReports = await Employee.find({
    managerId: normalizedManagerId,
  })
    .select("_id")
    .lean();

  const directReportIds = directReports
    .map((employee: any) => String(employee._id))
    .filter(Boolean);

  const ownershipConditions: any[] = [
    {
      assignedManagerId: normalizedManagerId,
    },
  ];

  if (directReportIds.length > 0) {
    ownershipConditions.push({
      category: "Complaint",
      employeeId: {
        $in: directReportIds,
      },
    });
  }

  return Ticket.findOne({
    _id: ticketId,
    $or: ownershipConditions,
  }).lean();
}

// =========================================================
// STRICT DEPARTMENT-LEVEL TICKET SEGREGATION
// =========================================================

export const HR_CATEGORIES = [
  "HR",
  "Policy Query",
  "Leave Issue",
  "Leave",
  "Attendance",
  "Recruitment",
  "Employee Referral",
  "Complaint",
  "Manager Concern",
  "Harassment Complaint",
  "Infrastructure",
  "Other",
];

export async function getTicketsForDepartment(
  role: string,
  managerEmployeeId?: string | null,
) {
  const normalizedRole = String(role || "").trim();

  // =======================================================
  // SUPER ADMIN
  // =======================================================
  // Only SUPER_ADMIN gets enterprise-wide visibility.

  if (normalizedRole === "SUPER_ADMIN") {
    return Ticket.find({})
      .sort({
        createdAt: -1,
      })
      .lean();
  }

  // =======================================================
  // HR ADMIN
  // =======================================================
  // HR_ADMIN sees ONLY tickets assigned to HR_ADMIN.

  if (normalizedRole === "HR_ADMIN") {
    return Ticket.find({
      assignedTo: "HR_ADMIN",
    })
      .sort({
        createdAt: -1,
      })
      .lean();
  }

  // =======================================================
  // RECRUITER
  // =======================================================
  // RECRUITER sees ONLY tickets assigned to RECRUITER.

  if (normalizedRole === "RECRUITER") {
    return Ticket.find({
      assignedTo: "RECRUITER",
    })
      .sort({
        createdAt: -1,
      })
      .lean();
  }

  // =======================================================
  // IT SUPPORT
  // =======================================================

  if (normalizedRole === "IT_SUPPORT") {
    return Ticket.find({
      assignedTo: "IT_SUPPORT",
    })
      .sort({
        createdAt: -1,
      })
      .lean();
  }

  // =======================================================
  // FINANCE
  // =======================================================

  if (normalizedRole === "FINANCE") {
    return Ticket.find({
      assignedTo: "FINANCE",
    })
      .sort({
        createdAt: -1,
      })
      .lean();
  }

  // =======================================================
  // MANAGER
  // =======================================================
  // Managers receive only their own assigned manager tickets
  // plus legacy Complaint tickets belonging to direct reports.

  if (normalizedRole === "MANAGER") {
    if (!managerEmployeeId) {
      return [];
    }

    return getTeamGrievanceTickets(
      String(managerEmployeeId),
    );
  }

  // =======================================================
  // EMPLOYEE / UNKNOWN ROLE
  // =======================================================
  // Employee ticket visibility is handled by getMyTickets()
  // from the authenticated employee context.
  //
  // Do NOT return all tickets for unknown roles.

  return [];
}

// =========================================================
// AUTHORIZATION FOR A SINGLE TICKET
// =========================================================

export function isUserAuthorizedForTicket(
  ticket: any,
  user: {
    role: string;
    employeeId?: string | null;
  },
): boolean {
  if (!ticket || !user) {
    return false;
  }

  const role = String(user.role || "").trim();

  // =======================================================
  // SUPER ADMIN
  // =======================================================

  if (role === "SUPER_ADMIN") {
    return true;
  }

  // =======================================================
  // EMPLOYEE SELF ACCESS
  // =======================================================
  //
  // The employee who created the ticket can view their own
  // ticket regardless of assigned department.
  //
  // This is required so employees can track their requests.

  if (
    user.employeeId &&
    String(ticket.employeeId) === String(user.employeeId)
  ) {
    return true;
  }

  // =======================================================
  // HR ADMIN
  // =======================================================

  if (role === "HR_ADMIN") {
    return ticket.assignedTo === "HR_ADMIN";
  }

  // =======================================================
  // RECRUITER
  // =======================================================

  if (role === "RECRUITER") {
    return ticket.assignedTo === "RECRUITER";
  }

  // =======================================================
  // IT SUPPORT
  // =======================================================

  if (role === "IT_SUPPORT") {
    return ticket.assignedTo === "IT_SUPPORT";
  }

  // =======================================================
  // FINANCE
  // =======================================================

  if (role === "FINANCE") {
    return ticket.assignedTo === "FINANCE";
  }

  // =======================================================
  // MANAGER
  // =======================================================
  //
  // Explicit manager ownership is checked here.
  //
  // Legacy direct-report Complaint fallback is handled by
  // getTeamGrievanceTicket() in manager-specific routes.

  if (role === "MANAGER") {
    return (
      !!user.employeeId &&
      String(ticket.assignedManagerId) ===
        String(user.employeeId)
    );
  }

  return false;
}

// =========================================================
// ESCALATE MANAGER GRIEVANCE
// =========================================================
//
// A Manager may escalate only a Complaint assigned to that Manager.
// The original assignedManagerId is intentionally preserved so the
// ownership trail remains available after escalation.
// =========================================================

export async function escalateTeamGrievance(
  ticketId: string,
  managerId: string,
  escalatedTo: string,
  reason: string,
) {
  if (!ticketId || !managerId) {
    throw new Error(
      "Ticket id and manager id are required.",
    );
  }

  if (!isTicketEscalationTarget(escalatedTo)) {
    throw new Error("Invalid escalation target.");
  }

  const normalizedReason = reason.trim();

  if (!normalizedReason) {
    throw new Error("Escalation reason is required.");
  }

  if (normalizedReason.length > 1000) {
    throw new Error(
      "Escalation reason must not exceed 1000 characters.",
    );
  }

  const teamTicket = await getTeamGrievanceTicket(
    ticketId,
    managerId,
  );

  if (!teamTicket) {
    throw new Error(
      "Grievance not found or not assigned to this manager.",
    );
  }

  const ticket = await refreshTicketSla(teamTicket);

  if ((ticket as any).isEscalated) {
    throw new Error(
      "This grievance has already been escalated.",
    );
  }

  const now = new Date().toISOString();

  const slaStatus = calculateSlaStatus(
    (ticket as any).slaDueAt ?? null,
    (ticket as any).status,
  );

  const escalationReason =
    slaStatus === "BREACHED"
      ? "SLA_BREACH"
      : "MANUAL";

  const updatedTicket = await Ticket.findOneAndUpdate(
    {
      _id: ticketId,

      category: "Complaint",

      assignedManagerId: managerId,

      isEscalated: {
        $ne: true,
      },
    },
    {
      $set: {
        isEscalated: true,

        escalatedAt: now,

        escalatedById: managerId,

        escalatedTo,

        escalationReason: normalizedReason,

        assignedTo: escalatedTo,

        slaStatus,

        updatedAt: now,
      },
    },
    {
      new: true,
    },
  ).lean();

  if (!updatedTicket) {
    throw new Error(
      "Unable to escalate grievance. It may have already been escalated or is no longer assigned to this manager.",
    );
  }

  // Keep a durable escalation history when the new model is available.
  if (TicketEscalationHistory) {
    await TicketEscalationHistory.create({
      ticketId,

      escalatedById: managerId,

      escalatedFrom: "MANAGER",

      escalatedTo,

      reason: escalationReason,

      note: normalizedReason,

      createdAt: now,
    });
  }

  return updatedTicket;
}

// =========================================================
// GRIEVANCE ESCALATION HISTORY
// =========================================================

export async function getGrievanceEscalationHistory(
  ticketId: string,
  managerId: string,
) {
  const teamTicket = await getTeamGrievanceTicket(
    ticketId,
    managerId,
  );

  if (!teamTicket) {
    throw new Error(
      "Grievance not found or not assigned to this manager.",
    );
  }

  if (!TicketEscalationHistory) {
    return [];
  }

  return TicketEscalationHistory.find({
    ticketId,
  })
    .sort({
      createdAt: -1,
    })
    .lean();
}

// =========================================================
// REFRESH OPEN GRIEVANCE SLA
// =========================================================

/**
 * Refresh SLA state for open complaint tickets.
 *
 * This can be called by a scheduled job as well as by Manager
 * grievance screens. It does not escalate the ticket by itself;
 * it only makes the current SLA state durable.
 */
export async function refreshOpenGrievanceSla() {
  const tickets = await Ticket.find({
    category: "Complaint",

    status: {
      $in: [
        "OPEN",
        "IN_PROGRESS",
        "WAITING_FOR_EMPLOYEE",
      ],
    },
  }).lean();

  const now = new Date();

  let updated = 0;

  for (const ticket of tickets) {
    const slaStatus = calculateSlaStatus(
      (ticket as any).slaDueAt ?? null,
      (ticket as any).status,
      now,
    );

    if ((ticket as any).slaStatus !== slaStatus) {
      await Ticket.updateOne(
        {
          _id: ticket._id,
        },
        {
          $set: {
            slaStatus,

            updatedAt: now.toISOString(),
          },
        },
      );

      updated += 1;
    }
  }

  return {
    updated,
  };
}

// =========================================================
// GET TICKET MESSAGES
// =========================================================

export async function getTicketMessages(
  ticketId: string,
) {
  if (!TicketMessage) {
    throw new Error(
      "TicketMessage model is not available",
    );
  }

  return TicketMessage.find({
    ticketId,
  })
    .sort({
      createdAt: 1,
    })
    .lean();
}

// =========================================================
// CREATE TICKET MESSAGE
// =========================================================

export async function createTicketMessage(data: {
  ticketId: string;
  employeeId: string;
  senderName: string;
  senderRole: string;
  message: string;
}) {
  if (!TicketMessage) {
    throw new Error(
      "TicketMessage model is not available",
    );
  }

  const message = await TicketMessage.create({
    ticketId: data.ticketId,

    employeeId: data.employeeId,

    senderName: data.senderName,

    senderRole: data.senderRole,

    message: data.message,

    createdAt: new Date(),
  });

  return message;
}