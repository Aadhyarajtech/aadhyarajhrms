import cron from "node-cron";
import { Employee, User } from "@/db/models";
import { notify } from "@/modules/notifications/notifications.repository";
import { nowIso } from "@/db/connection";

async function checkProbationReminders() {
  try {
    const now = new Date();

    const employees = await Employee.find({
      status: "ON_PROBATION",
      probationEndDate: {
        $ne: null,
        $lte: now.toISOString(),
      },
    })
      .select("_id employeeCode userId firstName lastName probationEndDate")
      .lean();

    if (employees.length === 0) {
      return;
    }

    const hrUsers = await User.find({
      role: "HR_ADMIN",
      isActive: true,
    })
      .select("_id")
      .lean();

    if (hrUsers.length === 0) {
      return;
    }

    for (const employee of employees) {
      for (const hrUser of hrUsers) {
        await notify({
          userId: hrUser._id,
          type: "SYSTEM",
          title: "Probation Confirmation Required",
          message: `Probation confirmation is due for ${employee.firstName} ${employee.lastName} (${employee.employeeCode}).`,
          link: `/employees/${employee._id}`,
        });
      }
    }

    console.log(
      `[Employee Lifecycle] Probation reminders processed at ${nowIso()}`,
    );
  } catch (error) {
    console.error(
      "[Employee Lifecycle] Failed to process probation reminders:",
      error,
    );
  }
}

export function startEmployeeLifecycleJobs() {
  // Run every day at 9:00 AM.
  cron.schedule(
    "0 9 * * *",
    async () => {
      await checkProbationReminders();
    },
    {
      timezone: "Asia/Kolkata",
    },
  );

  console.log(
    "[Employee Lifecycle] Probation reminder job scheduled for 09:00 IST daily.",
  );
}
