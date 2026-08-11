import TicketMessage from "@/db/TicketMessage";
import { Employee } from "@/db/models";

function toApiDoc(doc: any) {
  if (!doc) {
    return undefined;
  }

  const { _id, ...rest } = doc;

  // Ensure createdAt is an ISO string for API clients
  const createdAt = rest.createdAt
    ? new Date(rest.createdAt).toISOString()
    : new Date().toISOString();

  return {
    id: String(_id),
    ...rest,
    createdAt,
  };
}

export async function getTicketMessages(ticketId: string) {
  const messages = await TicketMessage.find({ ticketId }).lean();

  // Sort by full timestamp (compatibly handling string or Date values)
  messages.sort((a: any, b: any) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return ta - tb;
  });

  // Resolve sender names for messages that contain employee ids
  const idsToResolve = new Set<string>();
  for (const m of messages) {
    if (m.senderName && /^emp_/.test(String(m.senderName))) {
      idsToResolve.add(String(m.senderName));
    } else if (!m.senderName && m.employeeId) {
      idsToResolve.add(String(m.employeeId));
    }
  }

  let nameMap: Record<string, string> = {};
  if (idsToResolve.size) {
    const rows = await Employee.find({ _id: { $in: Array.from(idsToResolve) } }).lean();
    for (const r of rows) {
      nameMap[r._id] = `${r.firstName} ${r.lastName}`.trim();
    }
  }

  const normalized = messages.map((m: any) => {
    // If senderName is an employee id, replace with resolved name
    if (m.senderName && /^emp_/.test(String(m.senderName))) {
      m.senderName = nameMap[m.senderName] || m.senderName;
    } else if ((!m.senderName || String(m.senderName).startsWith("emp_")) && m.employeeId) {
      m.senderName = nameMap[m.employeeId] || m.senderName || m.employeeId;
    }

    return toApiDoc(m);
  });

  return normalized;
}

export async function createTicketMessage(data: {
  ticketId: string;
  employeeId: string;
  senderName: string;
  senderRole: string;
  message?: string;
  attachment?: string;
}) {
  const message = await TicketMessage.create({
    ticketId: data.ticketId,
    employeeId: data.employeeId,
    senderName: data.senderName,
    senderRole: data.senderRole,
    message: data.message?.trim() || "",
    attachment: data.attachment || "",
    createdAt: new Date(),
  });

  const savedMessage = await TicketMessage.findById(message._id).lean();

  // Resolve sender name if it's an employee id
  if (savedMessage) {
    if (savedMessage.senderName && /^emp_/.test(String(savedMessage.senderName))) {
      const emp = await Employee.findById(savedMessage.senderName).lean();
      if (emp) savedMessage.senderName = `${emp.firstName} ${emp.lastName}`.trim();
    } else if ((!savedMessage.senderName || /^emp_/.test(String(savedMessage.senderName))) && savedMessage.employeeId) {
      const emp = await Employee.findById(savedMessage.employeeId).lean();
      if (emp) savedMessage.senderName = `${emp.firstName} ${emp.lastName}`.trim();
    }
  }

  return toApiDoc(savedMessage);
}