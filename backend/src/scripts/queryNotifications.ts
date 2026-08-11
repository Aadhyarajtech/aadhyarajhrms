import { connectDB } from "@/db/connection";
import { User, Employee, Notification } from "@/db/models";

const demoEmails = [
  "admin@aadhyaraj.com",
  "hr.admin@aadhyaraj.com",
  "manager.demo@aadhyaraj.com",
  "recruiter.demo@aadhyaraj.com",
  "finance.demo@aadhyaraj.com",
  "employee.demo@aadhyaraj.com",
  "it.support.demo@aadhyaraj.com",
];

async function main() {
  await connectDB();

  for (const email of demoEmails) {
    const user = await User.findOne({ email }).lean();
    if (!user) {
      console.log(`No user found for email: ${email}`);
      continue;
    }

    const employee = await Employee.findOne({ userId: user._id }).lean();
    const notifications = await Notification.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    console.log("\n========================================");
    console.log(`Email: ${email}`);
    console.log(`UserId: ${user._id}`);
    console.log(`Role: ${user.role}`);
    console.log(`EmployeeId: ${employee?._id ?? "(none)"}`);
    console.log(`Notification count: ${notifications.length}`);
    if (notifications.length === 0) {
      console.log("  No notifications found.");
      continue;
    }

    for (const notif of notifications) {
      console.log("----------------------------------------");
      console.log(`  NotificationId: ${notif._id}`);
      console.log(`  Type: ${notif.type}`);
      console.log(`  Title: ${notif.title}`);
      console.log(`  Message: ${notif.message}`);
      console.log(`  Link: ${notif.link}`);
      console.log(`  isRead: ${notif.isRead}`);
      console.log(`  CreatedAt: ${notif.createdAt}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
