/* eslint-disable no-console */
/**
 * One-time migration from the HR_ADMIN role key to ADMIN.
 *
 * SAFETY: Back up the target database first. Run against the intended DATABASE_URL/MONGO_URI.
 * Updates canonical role fields and known role-routing fields only. It does not
 * change employee reporting lines, Employee.isManager, passwords, or audit logs.
 *
 * Run from backend/: npx tsx src/scripts/migrateHrAdminRoleToAdmin.ts
 */
import mongoose from "mongoose";
import { connectDB, nowIso } from "@/db/connection";
import { User } from "@/db/models";
import { GovernanceRole } from "@/modules/governance/governance.model";

async function main() {
  await connectDB();
  const now = nowIso();

  const userCount = await User.countDocuments({ role: "HR_ADMIN" });
  const governanceCount = await GovernanceRole.countDocuments({ role: "HR_ADMIN" });
  console.log(`Preflight: ${userCount} user(s), ${governanceCount} governance role document(s) use HR_ADMIN.`);

  // The code must be deployed with ADMIN accepted by the User schema before running this.
  const userResult = await User.collection.updateMany(
    { role: "HR_ADMIN" },
    { $set: { role: "ADMIN", updatedAt: now } },
  );

  // Keep the existing permission array and metadata; change only role key and label.
  const governanceResult = await GovernanceRole.collection.updateMany(
    { role: "HR_ADMIN" },
    { $set: { role: "ADMIN", label: "Admin", updatedAt: now } },
  );

  // Role-routed ticket queues use the role string as an assignee target.
  const db = mongoose.connection.db;
  if (db) {
    const ticketCollectionNames = ["tickets", "ticketmessages", "ticket_messages"];
    for (const collectionName of ticketCollectionNames) {
      const exists = await db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
      if (!exists) continue;
      const collection = db.collection(collectionName);
      await collection.updateMany({ assignedTo: "HR_ADMIN" }, { $set: { assignedTo: "ADMIN" } });
      await collection.updateMany({ escalatedTo: "HR_ADMIN" }, { $set: { escalatedTo: "ADMIN" } });
    }
    const announcementsExists = await db.listCollections({ name: "announcements" }, { nameOnly: true }).hasNext();
    if (announcementsExists) {
      const announcements = db.collection("announcements");
      await announcements.updateMany(
        { targetRoles: "HR_ADMIN" },
        { $addToSet: { targetRoles: "ADMIN" } },
      );
      await announcements.updateMany(
        { targetRoles: { $in: ["HR_ADMIN"] } },
        { $pull: { targetRoles: "HR_ADMIN" } as any },
      );
    }
  }

  const remainingUsers = await User.countDocuments({ role: "HR_ADMIN" });
  const remainingGovernance = await GovernanceRole.countDocuments({ role: "HR_ADMIN" });
  console.log(`Users updated: ${userResult.modifiedCount}; governance role docs updated: ${governanceResult.modifiedCount}.`);
  console.log(`Remaining HR_ADMIN user roles: ${remainingUsers}; governance role docs: ${remainingGovernance}.`);
  if (remainingUsers || remainingGovernance) throw new Error("Migration verification failed; inspect the database before retrying.");
  console.log("Role-key migration complete. Existing permissions were preserved.");
}

main()
  .catch((error) => {
    console.error("HR_ADMIN -> ADMIN migration failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
