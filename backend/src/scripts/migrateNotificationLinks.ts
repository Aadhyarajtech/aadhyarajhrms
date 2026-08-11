import { connectDB } from "@/db/connection";
import { Notification } from "@/db/models";

async function main() {
  await connectDB();

  console.log("Scanning notifications for legacy links...");

  const rows = await Notification.find({ link: { $ne: null } }).lean();

  let updated = 0;

  for (const r of rows) {
    const link = (r as any).link;
    if (typeof link !== "string") continue;
    if (!link.startsWith("/")) continue; // skip absolute URLs like http(s)
    if (link.startsWith("/app/")) continue; // already normalized

    const normalized = "/app" + link;

    try {
      await Notification.updateOne({ _id: r._id }, { $set: { link: normalized } });
      updated++;
      console.log(`Updated: ${r._id} -> ${normalized}`);
    } catch (err) {
      console.error("Failed to update notification", r._id, err);
    }
  }

  console.log(`Migration complete. Updated ${updated} notification(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
