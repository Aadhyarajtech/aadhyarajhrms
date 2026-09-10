require("dotenv").config();

const mongoose = require("mongoose");

async function main() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL;

  if (!uri) {
    throw new Error(
      "MongoDB connection URI not found in environment variables."
    );
  }

  await mongoose.connect(uri);

  const db = mongoose.connection.db;

  console.log("\nConnected database:", db.databaseName);

  const payrollRuns = await db
    .collection("payrollruns")
    .find({ month: 9, year: 2026 })
    .toArray();

  console.log("\n=== SEPTEMBER 2026 PAYROLL RUN ===");
  console.log(JSON.stringify(payrollRuns, null, 2));

  const employees = await db
    .collection("employees")
    .find({
      $or: [
        { _id: "emp_8d00bfdd39f240dd" },
        { employeeCode: /KAVYA/i },
        { firstName: /Kavya/i },
        { name: /Kavya/i },
      ],
    })
    .toArray();

  console.log("\n=== KAVYA EMPLOYEE ===");
  console.log(JSON.stringify(employees, null, 2));

  if (payrollRuns.length > 0) {
    const runIds = payrollRuns.map((r) => r._id);

    const payslips = await db
      .collection("payslips")
      .find({
        payrollRunId: { $in: runIds },
      })
      .toArray();

    console.log("\n=== SEPTEMBER PAYSLIPS ===");
    console.log(JSON.stringify(payslips, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\nERROR:", err);
  process.exit(1);
});