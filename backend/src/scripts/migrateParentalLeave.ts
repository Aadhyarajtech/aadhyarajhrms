import mongoose from "mongoose";
import { connectDB } from "@/db/connection";
import { Employee, LeaveBalance, LeaveRequest, LeaveType } from "@/db/models";

// One-time migration. Back up MongoDB before running this script.
// 26 weeks = 182 calendar days; applicable 12-week cases should be adjusted to 84 days by HR.
const DEFAULT_ENTITLEMENT_DAYS = Number(process.env.PARENTAL_LEAVE_DEFAULT_DAYS || 182);

async function migrateParentalLeave(): Promise<void> {
  if (!Number.isFinite(DEFAULT_ENTITLEMENT_DAYS) || DEFAULT_ENTITLEMENT_DAYS <= 0) {
    throw new Error("PARENTAL_LEAVE_DEFAULT_DAYS must be a positive number.");
  }
  await connectDB();

  const [existingParental, maternity, paternity] = await Promise.all([
    LeaveType.findOne({ name: /^Parental Leave$/i }),
    LeaveType.findOne({ name: /^Maternity Leave$/i }),
    LeaveType.findOne({ name: /^Paternity Leave$/i }),
  ]);

  let parental = existingParental;
  if (!parental) {
    parental = await LeaveType.create({
      name: "Parental Leave", colorHex: "#0E7490", defaultDaysPerYear: DEFAULT_ENTITLEMENT_DAYS,
      isPaid: true, requiresApproval: true, isActive: true,
    });
  }
  parental.name = "Parental Leave";
  parental.colorHex = "#0E7490";
  if (Number(parental.defaultDaysPerYear || 0) <= 0) parental.defaultDaysPerYear = DEFAULT_ENTITLEMENT_DAYS;
  parental.isPaid = true;
  parental.requiresApproval = true;
  parental.isActive = true;
  await parental.save();

  const unifiedId = String(parental._id);
  const legacyTypes = [maternity, paternity]
    .filter((type): type is NonNullable<typeof type> => Boolean(type))
    .filter((type) => String(type._id) !== unifiedId);

  // Preserve historical requests by changing their type reference before deleting legacy types.
  for (const legacy of legacyTypes) {
    await LeaveRequest.updateMany({ leaveTypeId: String(legacy._id) }, { $set: { leaveTypeId: unifiedId } });
    const balances = await LeaveBalance.find({ leaveTypeId: String(legacy._id) }).lean<Array<{
      _id: string; employeeId: string; year: number; allotted: number; used: number; carriedOver: number;
    }>>();

    for (const balance of balances) {
      const target = await LeaveBalance.findOne({ employeeId: balance.employeeId, leaveTypeId: unifiedId, year: balance.year });
      if (target) {
        // Do not add maternity + paternity entitlements together. Preserve the larger allotment and sum used days so usage is not lost.
        target.allotted = Math.max(Number(target.allotted || 0), Number(balance.allotted || 0));
        target.used = Number(target.used || 0) + Number(balance.used || 0);
        target.carriedOver = Math.max(Number(target.carriedOver || 0), Number(balance.carriedOver || 0));
        await target.save();
        await LeaveBalance.deleteOne({ _id: balance._id });
      } else {
        await LeaveBalance.updateOne({ _id: balance._id }, { $set: { leaveTypeId: unifiedId } });
      }
    }
  }

  // Ensure each active employee has a current-year Parental Leave card/balance.
  const year = new Date().getFullYear();
  const employees = await Employee.find({ status: { $nin: ["TERMINATED", "RESIGNED", "INACTIVE"] } }).select("_id").lean<Array<{ _id: string }>>();
  for (const employee of employees) {
    const employeeId = String(employee._id);
    const existing = await LeaveBalance.findOne({ employeeId, leaveTypeId: unifiedId, year });
    if (!existing) {
      await LeaveBalance.create({
        _id: undefined, employeeId, leaveTypeId: unifiedId, year,
        allotted: DEFAULT_ENTITLEMENT_DAYS, used: 0, carriedOver: 0,
      });
    } else if (Number(existing.allotted || 0) <= 0) {
      // Fix the zero-day placeholder; do not reset any existing usage.
      existing.allotted = DEFAULT_ENTITLEMENT_DAYS;
      await existing.save();
    }
  }

  await LeaveType.deleteMany({ name: { $in: ["Maternity Leave", "Paternity Leave"] } });
  console.log(`Parental Leave migration completed. Default allotment: ${DEFAULT_ENTITLEMENT_DAYS} days. Adjust eligible 12-week cases to 84 days in the balance records.`);
}

migrateParentalLeave()
  .catch((error: unknown) => { console.error("Parental Leave migration failed:", error); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
