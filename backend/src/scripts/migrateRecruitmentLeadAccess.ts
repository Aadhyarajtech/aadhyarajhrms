import mongoose from "mongoose";
import { connectDB, nowIso } from "@/db/connection";
import { User } from "@/db/models";

const RECRUITMENT_HEAD_EMAILS = [
  "geetha.balachandran@aadhyarajtech.com",
  "meghana.sahithi@aadhyarajtech.com",
] as const;

async function main() {
  await connectDB();

  const users = await User.find({ email: { $in: [...RECRUITMENT_HEAD_EMAILS] } })
    .select("_id email role isActive")
    .lean<Array<{ _id: string; email: string; role: string; isActive: boolean }>>();

  const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const missing = RECRUITMENT_HEAD_EMAILS.filter((email) => !byEmail.has(email));
  if (missing.length) {
    throw new Error(`Migration stopped; user record(s) not found: ${missing.join(", ")}`);
  }

  const inactive = RECRUITMENT_HEAD_EMAILS.filter((email) => !byEmail.get(email)?.isActive);
  if (inactive.length) {
    throw new Error(`Migration stopped; inactive user record(s): ${inactive.join(", ")}`);
  }

  const updatedAt = nowIso();
  for (const email of RECRUITMENT_HEAD_EMAILS) {
    const user = byEmail.get(email)!;
    if (user.role !== "RECRUITER") {
      await User.updateOne(
        { _id: user._id, email },
        { $set: { role: "RECRUITER", updatedAt } },
      );
      process.stdout.write(`${email}: ${user.role} -> RECRUITER\n`);
    } else {
      process.stdout.write(`${email}: already RECRUITER (unchanged)\n`);
    }
  }

  process.stdout.write("Recruitment lead role migration completed.\n");
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Recruitment lead migration failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
