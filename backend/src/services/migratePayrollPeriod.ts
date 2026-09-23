import { connectDB } from "@/db/connection";
import { PayrollRun } from "@/db/models";

/**
 * One-time migration for payroll periods.
 *
 * Existing monthly payroll runs are backfilled to their full calendar month.
 * The old unique month/year index is removed because payroll runs are now
 * uniquely identified by startDate + endDate.
 */
async function main() {
  await connectDB();

  const runs = await PayrollRun.find({
    $or: [{ startDate: null }, { endDate: null }, { startDate: { $exists: false } }, { endDate: { $exists: false } }],
  }).lean();

  for (const run of runs) {
    const startDate = `${run.year}-${String(run.month).padStart(2, "0")}-01`;
    const monthEnd = new Date(run.year, run.month, 0);
    const endDate = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;
    await PayrollRun.updateOne(
      { _id: run._id },
      { $set: { startDate, endDate } },
    );
  }

  try {
    await PayrollRun.collection.dropIndex("month_1_year_1");
    console.log("Removed legacy unique month/year payroll index.");
  } catch (error: any) {
    if (error?.codeName === "IndexNotFound") {
      console.log("Legacy month/year index was already removed.");
    } else {
      throw error;
    }
  }

  await PayrollRun.collection.createIndex(
    { startDate: 1, endDate: 1 },
    { unique: true, sparse: true },
  );

  console.log(`Backfilled ${runs.length} payroll run(s).`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
