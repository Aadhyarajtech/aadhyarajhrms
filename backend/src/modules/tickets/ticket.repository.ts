import * as Models from "@/db/models";

// Support different export styles from the models module
const Ticket: any =
  (Models as any).Ticket || (Models as any).default || (Models as any).ticket;

const TicketMessage: any =
  (Models as any).TicketMessage || (Models as any).ticketMessage;

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
  return Ticket.findById(id).lean();
}

// =========================================================
// UPDATE TICKET STATUS
// =========================================================

export async function updateTicketStatus(id: string, status: string) {
  return Ticket.findByIdAndUpdate(
    id,
    {
      status,
      updatedAt: new Date().toISOString(),
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
