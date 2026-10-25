import { connectDB } from "../db/connection";
import { LeaveType } from "../db/models";

/**
 * Deactivates legacy Parental Leave so it is no longer offered for new leave
 * requests. Historical leave requests and balance records are intentionally kept.
 * Run once against the intended database with the normal backend environment.
 */
async function main() {
  await connectDB();
  const result = await LeaveType.updateMany(
    { name: /^Parental Leave$/i },
    { $set: { isActive: false } },
  );
  console.log(`Parental Leave deactivated. Matched: ${result.matchedCount ?? 0}; modified: ${result.modifiedCount ?? 0}.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Failed to deactivate Parental Leave:", error);
  process.exit(1);
});
