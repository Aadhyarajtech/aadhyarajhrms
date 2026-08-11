import { connectDB } from "@/db/connection";
import { Notification } from "@/db/models";

async function main() {
  await connectDB();
  const notifications = await Notification.find({ type: "TICKET_MESSAGE" })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  console.log(`Found ${notifications.length} TICKET_MESSAGE notification(s)`);
  for (const n of notifications) {
    console.log(`- ${n._id}: ${n.title} | ${n.message} | ${n.link} | isRead=${n.isRead} | createdAt=${n.createdAt}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});