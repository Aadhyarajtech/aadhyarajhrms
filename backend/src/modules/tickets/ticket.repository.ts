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

type TicketStatus = (typeof TICKET_STATUSES)[number];

function isTicketStatus(status: string): status is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(status);
}

const TICKET_ESCALATION_TARGETS = ["HR_ADMIN", "SUPER_ADMIN"] as const;

type TicketEscalationTarget = (typeof TICKET_ESCALATION_TARGETS)[number];

function isTicketEscalationTarget(
  target: string,
): target is TicketEscalationTarget {
  return (TICKET_ESCALATION_TARGETS as readonly string[]).includes(target);
}

function getSlaHours(priority: string) {
  // These are the repository defaults. They can be replaced by a central
  // configuration later without changing the ticket workflow.
  switch (priority) {
    case "HIGH":
      return 24;
    case "LOW":
      return 72;
    case "MEDIUM":
    default:
      return 48;
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

  return remainingHours <= 24 ? "DUE_SOON" : "ON_TRACK";
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

function assignDepartment(category: string) {
  switch (category) {
    case "HR":
      return "HR_ADMIN";

    case "Payroll":
      return "FINANCE";

    case "Leave":
      return "HR_ADMIN";

    case "Attendance":
      return "HR_ADMIN";

    case "Recruitment":
      return "MANAGER";

    case "Employee Referral":
      return "HR_ADMIN";

    case "Complaint":
      return "HR_ADMIN";

    case "IT Support":
      return "IT_SUPPORT";

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
}) {
  const now = new Date().toISOString();

  const ticket = await Ticket.create({
    ticketId: generateTicketId(data.category),

    employeeId: data.employeeId,

    category: data.category,

    priority: data.priority,

    subject: data.subject,

    description: data.description,

    attachment: data.attachment || "",

    assignedTo: assignDepartment(data.category),

    assignedManagerId:
      data.category === "Complaint" ? data.managerId || null : null,

    status: "OPEN",

    slaDueAt: calculateSlaDueAt(now, data.priority),
    slaStatus: "ON_TRACK",

    isEscalated: false,
    escalatedAt: null,
    escalatedById: null,
    escalatedTo: null,
    escalationReason: null,

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
    .sort({
      createdAt: -1,
    })
    .lean();
}

// =========================================================
// GET SINGLE TICKET
// =========================================================

export async function getTicket(id: string) {
  const ticket = await Ticket.findById(id).lean();

  if (!ticket) return ticket;

  return refreshTicketSla(ticket);
}

// =========================================================
// UPDATE TICKET STATUS
// =========================================================

export async function updateTicketStatus(id: string, status: string) {
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
  console.log("[Tickets] Loading tickets for employee:", employeeId);

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

export async function getTicketsByAssignees(assignees: string[]) {
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
// GET MANAGER'S TEAM GRIEVANCE TICKETS
// =========================================================
//
// Manager grievance access is scoped by the actual manager
// employee id stored in assignedManagerId. This prevents one
// manager from seeing complaints belonging to another manager.
// =========================================================

export async function getTeamGrievanceTickets(managerId: string) {
  if (!managerId) {
    return [];
  }

  const directReports = await Employee.find({
    managerId,
  })
    .select("_id")
    .lean();

  const employeeIds = directReports.map((employee: any) => employee._id);

  if (employeeIds.length === 0) {
    return [];
  }

  return Ticket.find({
    category: "Complaint",
    assignedManagerId: managerId,
    employeeId: { $in: employeeIds },
  })
    .sort({
      createdAt: -1,
    })
    .lean();
}

// =========================================================
// GET SINGLE TEAM GRIEVANCE TICKET
// =========================================================
//
// Used by manager-only routes before returning a ticket or
// allowing a manager to act on it.
// =========================================================

export async function getTeamGrievanceTicket(
  ticketId: string,
  managerId: string,
) {
  if (!ticketId || !managerId) {
    return undefined;
  }

  const directReports = await Employee.find({
    managerId,
  })
    .select("_id")
    .lean();

  const employeeIds = directReports.map((employee: any) => employee._id);

  if (employeeIds.length === 0) {
    return undefined;
  }

  return Ticket.findOne({
    _id: ticketId,
    category: "Complaint",
    assignedManagerId: managerId,
    employeeId: { $in: employeeIds },
  }).lean();
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
    throw new Error("Ticket id and manager id are required.");
  }

  if (!isTicketEscalationTarget(escalatedTo)) {
    throw new Error("Invalid escalation target.");
  }

  const normalizedReason = reason.trim();

  if (!normalizedReason) {
    throw new Error("Escalation reason is required.");
  }

  if (normalizedReason.length > 1000) {
    throw new Error("Escalation reason must not exceed 1000 characters.");
  }

  const teamTicket = await getTeamGrievanceTicket(ticketId, managerId);

  if (!teamTicket) {
    throw new Error("Grievance not found or not assigned to this manager.");
  }

  const ticket = await refreshTicketSla(teamTicket);

  if ((ticket as any).isEscalated) {
    throw new Error("This grievance has already been escalated.");
  }

  const now = new Date().toISOString();
  const slaStatus = calculateSlaStatus(
    (ticket as any).slaDueAt ?? null,
    (ticket as any).status,
  );

  const escalationReason = slaStatus === "BREACHED" ? "SLA_BREACH" : "MANUAL";

  const updatedTicket = await Ticket.findOneAndUpdate(
    {
      _id: ticketId,
      category: "Complaint",
      assignedManagerId: managerId,
      isEscalated: { $ne: true },
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
    { new: true },
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

export async function getGrievanceEscalationHistory(
  ticketId: string,
  managerId: string,
) {
  const teamTicket = await getTeamGrievanceTicket(ticketId, managerId);

  if (!teamTicket) {
    throw new Error("Grievance not found or not assigned to this manager.");
  }

  if (!TicketEscalationHistory) {
    return [];
  }

  return TicketEscalationHistory.find({ ticketId })
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Refresh SLA state for open complaint tickets.
 *
 * This can be called by a scheduled job as well as by Manager grievance
 * screens. It does not escalate the ticket by itself; it only makes the
 * current SLA state durable. Escalation remains an explicit workflow action.
 */
export async function refreshOpenGrievanceSla() {
  const tickets = await Ticket.find({
    category: "Complaint",
    status: { $in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE"] },
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
        { _id: ticket._id },
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

  return { updated };
}

// =========================================================
// GET TICKET MESSAGES
// =========================================================

export async function getTicketMessages(ticketId: string) {
  if (!TicketMessage) {
    throw new Error("TicketMessage model is not available");
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
    throw new Error("TicketMessage model is not available");
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
