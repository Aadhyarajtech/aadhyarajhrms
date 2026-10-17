import { Employee, User } from "@/db/models";
import { nowIso } from "@/db/connection";
import { notify } from "@/modules/notifications/notifications.repository";

let started = false;

/**
 * Checks probation deadlines periodically. Reminders are sent once per current
 * probation end date; changing/extending the end date resets the sent marker.
 */
export function startProbationReminderScheduler() {
  if (started) return;
  started = true;

  const run = async () => {
    try {
      const now = new Date();
      const horizon = new Date(now);
      horizon.setDate(horizon.getDate() + 7);
      const candidates = await Employee.find({
        status: "ON_PROBATION",
        probationEndDate: { $ne: null, $lte: horizon.toISOString() },
      }).select("_id userId managerId firstName lastName employeeCode probationEndDate probationReminderSentAt").lean<any[]>();

      for (const employee of candidates) {
        if (employee.probationReminderSentAt) continue;
        const endDate = employee.probationEndDate ? new Date(employee.probationEndDate) : null;
        if (!endDate || Number.isNaN(endDate.getTime())) continue;
        const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / 86400000);
        const name = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || employee.employeeCode;

        const recipientUserIds = new Set<string>();
        const manager = employee.managerId
          ? await Employee.findById(employee.managerId).select("userId").lean<any>()
          : null;
        if (manager?.userId) recipientUserIds.add(String(manager.userId));
        const hrUsers = await User.find({ role: { $in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true }).select("_id").lean<any[]>();
        hrUsers.forEach((user) => recipientUserIds.add(String(user._id)));

        const dueText = daysLeft < 0
          ? `probation ended ${Math.abs(daysLeft)} day(s) ago`
          : daysLeft === 0
            ? "probation ends today"
            : `probation ends in ${daysLeft} day(s)`;
        await Promise.all([...recipientUserIds].map((userId) => notify({
          userId,
          type: "EMPLOYEE_LIFECYCLE",
          title: "Probation review required",
          message: `${name}'s ${dueText}. Please review and record a probation decision.`,
          link: `/app/employees/${employee._id}`,
          dedupeKey: `probation-reminder:${String(employee._id)}:${String(employee.probationEndDate)}:${userId}`,
        })));

        await Employee.updateOne(
          { _id: employee._id, probationEndDate: employee.probationEndDate, probationReminderSentAt: null },
          { $set: { probationReminderSentAt: nowIso(), updatedAt: nowIso() } },
        );
      }
    } catch (error) {
      console.error("[probation-reminders] failed to check probation deadlines", error);
    }
  };

  // Run once after startup, then every 6 hours. DB-level dedupe keys and the
  // employee marker prevent duplicate reminders across repeated checks.
  void run();
  const timer = setInterval(() => void run(), 6 * 60 * 60 * 1000);
  timer.unref?.();
}
