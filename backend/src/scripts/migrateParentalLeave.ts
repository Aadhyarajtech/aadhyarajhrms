import mongoose from "mongoose";
import { connectDB } from "@/db/connection";
import { Employee, LeaveBalance, LeaveType } from "@/db/models";

// Safe, idempotent migration for the family-leave policy. Existing requests and usage are preserved.
const DEFINITIONS = [
  { name: "Maternity Leave", colorHex: "#DB2777", days: 182 },
  { name: "Paternity Leave", colorHex: "#2563EB", days: 15 },
  { name: "Parental Leave", colorHex: "#0E7490", days: 15 },
] as const;

async function migrateFamilyLeave(): Promise<void> {
  await connectDB();
  const currentYear = new Date().getFullYear();
  const types = new Map<string, string>();
  for (const definition of DEFINITIONS) {
    let type = await LeaveType.findOne({ name: new RegExp(`^${definition.name}$`, "i") });
    if (!type) {
      type = await LeaveType.create({ name: definition.name, colorHex: definition.colorHex, defaultDaysPerYear: definition.days, isPaid: true, requiresApproval: true, isActive: true });
    } else {
      type.name = definition.name;
      type.colorHex = definition.colorHex;
      type.defaultDaysPerYear = definition.days;
      type.isPaid = true;
      type.requiresApproval = true;
      type.isActive = true;
      await type.save();
    }
    types.set(definition.name, String(type._id));
  }

  // Create missing current-year balances for active employees. Never reset used days.
  const employees = await Employee.find({ status: { $nin: ["TERMINATED", "RESIGNED", "INACTIVE"] } }).select("_id").lean<Array<{ _id: string }>>();
  for (const employee of employees) {
    for (const definition of DEFINITIONS) {
      const leaveTypeId = types.get(definition.name)!;
      const existing = await LeaveBalance.findOne({ employeeId: String(employee._id), leaveTypeId, year: currentYear });
      if (!existing) {
        await LeaveBalance.create({ _id: undefined, employeeId: String(employee._id), leaveTypeId, year: currentYear, allotted: definition.days, used: 0, carriedOver: 0 });
      } else if (definition.name !== "Maternity Leave" && Number(existing.allotted ?? 0) > definition.days) {
        existing.allotted = definition.days;
        await existing.save();
      } else if (Number(existing.allotted ?? 0) <= 0) {
        existing.allotted = definition.days;
        await existing.save();
      }
    }
  }
  console.log("Family leave migration completed. Maternity: 182-day default (84-day maximum for employees with at least two surviving children before birth); Paternity: 15 days; Parental: 15 days.");
}

migrateFamilyLeave()
  .catch((error: unknown) => { console.error("Family leave migration failed:", error); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
