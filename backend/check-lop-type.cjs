require("dotenv").config();

const mongoose = require("mongoose");

async function main() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL;

  await mongoose.connect(uri);

  const db = mongoose.connection.db;

  const leave = await db.collection("leaverequests").findOne({
    _id: "leave_69203854bbc03e01",
  });

  console.log("\n=== LOP REQUEST ===");
  console.log(JSON.stringify(leave, null, 2));

  if (leave) {
    const leaveType = await db.collection("leavetypes").findOne({
      _id: leave.leaveTypeId,
    });

    console.log("\n=== LEAVE TYPE ===");
    console.log(JSON.stringify(leaveType, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\nERROR:", err);
  process.exit(1);
});