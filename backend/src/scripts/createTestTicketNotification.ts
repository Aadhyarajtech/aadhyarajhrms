import { connectDB } from "@/db/connection";
import { User, Employee } from "@/db/models";
import * as ticketRepo from "@/modules/tickets/ticket.repository";
import * as messageRepo from "@/modules/tickets/ticketMessage.repository";
import { notify } from "@/modules/notifications/notifications.repository";

async function main() {
  await connectDB();

  const employeeUser = await User.findOne({ email: "employee.demo@aadhyaraj.com" }).lean();
  const hrUser = await User.findOne({ email: "hr.admin@aadhyaraj.com" }).lean();

  if (!employeeUser || !hrUser) {
    console.error("Demo users not found. Make sure seed data exists.");
    process.exit(1);
  }

  const employee = await Employee.findOne({ userId: employeeUser._id }).lean();
  const hrEmployee = await Employee.findOne({ userId: hrUser._id }).lean();

  if (!employee || !hrEmployee) {
    console.error("Demo employee records not found.");
    process.exit(1);
  }

  console.log(`Using employee ${employee._id} and HR ${hrEmployee._id}`);

  const ticket = await ticketRepo.createTicket({
    employeeId: employee._id,
    category: "HR",
    priority: "LOW",
    subject: "Test ticket notification",
    description: "This is a generated ticket for notification testing.",
  });

  console.log(`Created ticket ${ticket._id} / ${ticket.ticketId}`);

  await notify({
    userId: hrUser._id,
    type: "TICKET_MESSAGE",
    title: `New ticket created: ${ticket.ticketId}`,
    message: ticket.subject,
    link: `/app/tickets/${ticket._id}`,
  });

  console.log("Created a TICKET_MESSAGE notification for HR_ADMIN.");

  const message = await messageRepo.createTicketMessage({
    ticketId: ticket._id,
    employeeId: employee._id,
    senderName: `${employee.firstName} ${employee.lastName}`,
    senderRole: "EMPLOYEE",
    message: "Test message for notification flow.",
    attachment: "",
  });

  console.log(`Created message ${message._id} on ticket ${ticket._id}`);

  await notify({
    userId: hrUser._id,
    type: "TICKET_MESSAGE",
    title: `New message on ${ticket.ticketId}`,
    message: "Employee sent a new ticket message.",
    link: `/app/tickets/${ticket._id}`,
  });

  console.log("Created a second TICKET_MESSAGE notification for HR_ADMIN.");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});