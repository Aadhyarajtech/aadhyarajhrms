/* eslint-disable no-console */
/**
 * One-time, guarded migration for the approved AadhyaRaj HRMS role mapping.
 *
 * Safety properties:
 * - Updates only the explicitly listed accounts.
 * - Preflights every target account before making changes.
 * - Refuses to run if a MANAGER account exists outside the approved mapping.
 * - Does not modify Employee.isManager, managerId, or any employee profile fields.
 * - Calls ensureDefaults() to apply versioned, additive GovernanceRole migrations.
 *
 * Run from backend/ with the intended production DATABASE_URL/MONGO_URI env:
 *   npx tsx src/scripts/migrateRoleBasedAccess.ts
 */
import mongoose from "mongoose";
import { connectDB, nowIso } from "@/db/connection";
import { User } from "@/db/models";
import { ensureDefaults } from "@/modules/governance/governance.repository";

const APPROVED_ROLE_BY_EMAIL: Record<string, string> = {
  "adithya.nuthakki@aadhyarajtech.com": "SUPER_ADMIN",
  "sreevidya.talasila@aadhyarajtech.com": "ADMIN",
  "gangadhar.yedla@aadhyarajtech.com": "FINANCE",

  "geetha.balachandran@aadhyarajtech.com": "RECRUITER",
  "meghana.sahithi@aadhyarajtech.com": "RECRUITER",
  "anshu.sharma@aadhyarajtech.com": "RECRUITER",
  "karthik.gummadi@aadhyarajtech.com": "RECRUITER",
  "kaushal.chowdary@aadhyarajtech.com": "RECRUITER",
  "meghana.kondapalli@aadhyarajtech.com": "RECRUITER",
  "yamini.meka@aadhyarajtech.com": "RECRUITER",
  "sirisha.desina@aadhyarajtech.com": "RECRUITER",
  "anusha.nookanaboina@aadhyarajtech.com": "RECRUITER",

  "kavya.rachupalli@aadhyarajtech.com": "IT_SUPPORT",

  "damodar.dosa@aadhyarajtech.com": "EMPLOYEE",
  "abhiram.bolloju@aadhyarajtech.com": "EMPLOYEE",
  "dhileep.yalla@aadhyarajtech.com": "EMPLOYEE",
  "nagachandana.sakala@aadhyarajtech.com": "EMPLOYEE",
  "himavanth.deevaguntla@aadhyarajtech.com": "EMPLOYEE",
  "jyothika.rachupalli@aadhyarajtech.com": "EMPLOYEE",
  "sreeshanth.dyapa@aadhyarajtech.com": "EMPLOYEE",
  "aniket.nikam@aadhyarajtech.com": "EMPLOYEE",
  "shashikant.srivastva@aadhyarajtech.com": "EMPLOYEE",
};

async function main() {
  await connectDB();

  const emails = Object.keys(APPROVED_ROLE_BY_EMAIL);
  const users = await User.find({ email: { $in: emails } })
    .select("_id email role")
    .lean();
  const foundEmails = new Set(users.map((user) => user.email.toLowerCase()));
  const missingEmails = emails.filter((email) => !foundEmails.has(email));

  if (missingEmails.length) {
    throw new Error(
      `Migration aborted before updates. Approved accounts not found: ${missingEmails.join(", ")}`,
    );
  }

  const unmappedLegacyManagerAccounts = await User.find({ role: "MANAGER" })
    .select("email role")
    .lean();
  const unexpectedManagerAccounts = unmappedLegacyManagerAccounts.filter(
    (user) => !Object.prototype.hasOwnProperty.call(APPROVED_ROLE_BY_EMAIL, user.email.toLowerCase()),
  );

  if (unexpectedManagerAccounts.length) {
    throw new Error(
      "Migration aborted before updates because MANAGER-role accounts exist outside the approved mapping: " +
        unexpectedManagerAccounts.map((user) => user.email).join(", ") +
        ". Verify each account and add its approved destination role before rerunning.",
    );
  }

  const now = nowIso();
  const changed: string[] = [];
  for (const user of users) {
    const email = user.email.toLowerCase();
    const targetRole = APPROVED_ROLE_BY_EMAIL[email];
    if (user.role === targetRole) continue;

    await User.updateOne(
      { _id: user._id, email },
      { $set: { role: targetRole, updatedAt: now } },
    );
    changed.push(`${email}: ${user.role} -> ${targetRole}`);
  }

  // Versioned, additive role-template migration; preserves unrelated
  // administrator-customized permission arrays.
  await ensureDefaults();

  const remainingManagers = await User.find({ role: "MANAGER" })
    .select("email")
    .lean();
  if (remainingManagers.length) {
    throw new Error(
      `Role assignments updated, but ${remainingManagers.length} MANAGER account(s) remain: ${remainingManagers.map((user) => user.email).join(", ")}`,
    );
  }

  console.log(`Role migration complete. Changed ${changed.length} account(s).`);
  changed.forEach((line) => console.log(`  ${line}`));
  console.log("Governance defaults/migrations applied.");
  console.log("Employee.isManager and reporting relationships were not modified.");
}

main()
  .catch((error) => {
    console.error("Role migration failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
