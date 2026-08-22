<<<<<<< HEAD
// path: src/modules/announcements/announcement.scheduler.ts

import * as announcementRepo from "./announcement.repository";
import * as notificationRepo from "@/modules/notifications/notifications.repository";

/* =========================================================
   ANNOUNCEMENT SCHEDULER

   Checks every minute for announcements whose scheduled
   publishing time has arrived.

   SCHEDULED
      ↓
   scheduledAt reached
      ↓
   PUBLISHED
      ↓
   Resolve target recipients
      ↓
   IN-APP notification
      ↓
   EMAIL only when production email delivery is enabled
========================================================= */

let schedulerRunning = false;

/* =========================================================
   PROCESS SCHEDULED ANNOUNCEMENTS
========================================================= */

export async function processScheduledAnnouncements() {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;

  try {
    const published =
      await announcementRepo.publishDueAnnouncements();

    if (!published.length) {
=======
import { publishDueAnnouncements } from "./announcement.repository";

import { notify } from "@/modules/notifications/notifications.repository";

import { Employee } from "@/db/models";

const SCHEDULER_INTERVAL_MS = 10_000;

let schedulerTimer: NodeJS.Timeout | undefined;

let isRunning = false;

/**
 * Return employees who should receive an announcement.
 *
 * This currently uses the employee fields available through the
 * existing HRMS Employee model. The detailed targeting rules will
 * be finalized when the existing notification layer is connected
 * to this dedicated announcement module.
 */
async function getTargetUserIds(announcement: any): Promise<string[]> {
  const query: Record<string, any> = {};

  /*
   * ALL means every employee.
   */
  if (!announcement.audience || announcement.audience === "ALL") {
    const employees = await Employee.find({})
      .select({
        _id: 1,
        userId: 1,
      })
      .lean();

    return employees
      .map((employee: any) => employee.userId ?? employee._id)
      .filter(Boolean)
      .map(String);
  }

  /*
   * For role-based audiences, use the role field where available.
   */
  if (
    announcement.audience === "EMPLOYEE" ||
    announcement.audience === "MANAGER" ||
    announcement.audience === "HR_ADMIN" ||
    announcement.audience === "FINANCE" ||
    announcement.audience === "RECRUITER" ||
    announcement.audience === "IT_SUPPORT"
  ) {
    query.role = announcement.audience;

    const employees = await Employee.find(query)
      .select({
        _id: 1,
        userId: 1,
      })
      .lean();

    return employees
      .map((employee: any) => employee.userId ?? employee._id)
      .filter(Boolean)
      .map(String);
  }

  /*
   * If explicit target roles are supplied, use them.
   */
  if (
    Array.isArray(announcement.targetRoles) &&
    announcement.targetRoles.length > 0
  ) {
    query.role = {
      $in: announcement.targetRoles,
    };
  }

  /*
   * Department targeting.
   */
  if (
    Array.isArray(announcement.departments) &&
    announcement.departments.length > 0
  ) {
    query.department = {
      $in: announcement.departments,
    };
  }

  /*
   * Location targeting.
   */
  if (
    Array.isArray(announcement.locations) &&
    announcement.locations.length > 0
  ) {
    query.location = {
      $in: announcement.locations,
    };
  }

  const employees = await Employee.find(query)
    .select({
      _id: 1,
      userId: 1,
    })
    .lean();

  return employees
    .map((employee: any) => employee.userId ?? employee._id)
    .filter(Boolean)
    .map(String);
}

/**
 * Process one published announcement.
 *
 * At this stage, IN_APP is connected to the existing notification
 * repository. EMAIL will be connected when the existing notification
 * email layer is updated.
 *
 * BANNER and CALENDAR are persisted announcement properties and are
 * consumed by the corresponding frontend views.
 */
async function processAnnouncement(announcement: any) {
  const channels = Array.isArray(announcement.channels)
    ? announcement.channels
    : [];

  /*
   * Only published announcements should
   * generate delivery actions.
   */
  if (announcement.status !== "PUBLISHED") {
    return;
  }

  const userIds = channels.includes("IN_APP")
    ? await getTargetUserIds(announcement)
    : [];

  /*
   * In-app notification.
   *
   * `notify()` follows the existing project's
   * userId-based Notification model.
   */
  if (channels.includes("IN_APP") && userIds.length > 0) {
    await Promise.all(
      userIds.map((userId) =>
        notify({
          userId,
          type: "ANNOUNCEMENT",
          title: announcement.title,
          message: announcement.body,
          link: "/app/announcements",
        }),
      ),
    );
  }

  /*
   * EMAIL:
   *
   * Do not send email here yet because the currently existing
   * notifications repository does not expose an email broadcast
   * function. This will be connected in the existing notification
   * layer without changing the announcement schema.
   */

  /*
   * BANNER:
   *
   * The Dashboard reads the persisted `showBanner` value.
   * No separate database operation is required here.
   */

  /*
   * CALENDAR:
   *
   * The Calendar reads the persisted `calendarEnabled`,
   * eventStartAt, eventEndAt and eventLocation values.
   * No separate database operation is required here.
   */
}

/**
 * Publish and process all announcements whose scheduled time
 * has arrived.
 */
export async function runAnnouncementScheduler() {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    const published = await publishDueAnnouncements();

    if (published.length === 0) {
>>>>>>> f8f0289 (Added feature to check performance of the employees)
      return;
    }

    for (const announcement of published) {
<<<<<<< HEAD
      try {
        console.log(
          `[Announcement Scheduler] Published: ${announcement.title}`,
        );

        console.log(
          `[Announcement Scheduler] Targeting: audience=${announcement.audience}, departments=${JSON.stringify(
            announcement.departments ?? [],
          )}, locations=${JSON.stringify(
            announcement.locations ?? [],
          )}, targetRoles=${JSON.stringify(
            announcement.targetRoles ?? [],
          )}`,
        );

        /* -------------------------------------------------
           IN-APP NOTIFICATION
        ------------------------------------------------- */

        if (
          announcement.channels?.includes("IN_APP")
        ) {
          const result =
            await notificationRepo.broadcastAnnouncementNotification(
              {
                title: announcement.title,
                body: announcement.body,
                audience: announcement.audience,
                departments:
                  announcement.departments ?? [],
                locations:
                  announcement.locations ?? [],
                targetRoles:
                  announcement.targetRoles ?? [],
              },
            );

          console.log(
            `[Announcement Scheduler] In-app notification sent: ${announcement.title}. Recipients: ${
              result?.sent ?? 0
            }`,
          );
        }

        /* -------------------------------------------------
           EMAIL BROADCAST

           DEVELOPMENT SAFETY:
           Do not send announcement emails while running
           the local development environment.

           This prevents repeated Mail Delivery Subsystem
           bounce messages from test @aadhyaraj.com accounts.

           Production email delivery remains available.
        ------------------------------------------------- */

        if (
          announcement.channels?.includes("EMAIL")
        ) {
          if (
            process.env.NODE_ENV !== "production"
          ) {
            console.log(
              `[Announcement Scheduler] Email broadcast skipped in development: ${announcement.title}`,
            );
          } else {
            const result =
              await notificationRepo.broadcastAnnouncementEmail(
                {
                  title: announcement.title,
                  body: announcement.body,
                  audience:
                    announcement.audience,
                  departments:
                    announcement.departments ?? [],
                  locations:
                    announcement.locations ?? [],
                  targetRoles:
                    announcement.targetRoles ?? [],
                },
              );

            console.log(
              `[Announcement Scheduler] Email broadcast completed: ${announcement.title}. Sent: ${
                result?.sent ?? 0
              }, Failed: ${
                result?.failed ?? 0
              }`,
            );
          }
        }
      } catch (error) {
        console.error(
          `[Announcement Scheduler] Delivery failed for "${announcement.title}":`,
=======
      if (!announcement) {
        continue;
      }

      try {
        await processAnnouncement(announcement);
      } catch (error) {
        console.error(
          `[AnnouncementScheduler] Failed to process announcement ${announcement.id}:`,
>>>>>>> f8f0289 (Added feature to check performance of the employees)
          error,
        );
      }
    }
  } catch (error) {
    console.error(
<<<<<<< HEAD
      "[Announcement Scheduler] Failed:",
      error,
    );
  } finally {
    schedulerRunning = false;
  }
}

/* =========================================================
   START SCHEDULER
========================================================= */

export function startAnnouncementScheduler() {
  console.log(
    "[Announcement Scheduler] Started. Checking every 60 seconds.",
  );

  /*
   * Run once immediately when the server starts.
   */
  void processScheduledAnnouncements();

  /*
   * Check every 60 seconds.
   */
  setInterval(() => {
    void processScheduledAnnouncements();
  }, 60 * 1000);
}
=======
      "[AnnouncementScheduler] Failed to publish scheduled announcements:",
      error,
    );
  } finally {
    isRunning = false;
  }
}

/**
 * Start the scheduler.
 *
 * The scheduler checks every 10 seconds, matching the short polling
 * interval commonly used by the current HRMS backend.
 */
export function startAnnouncementScheduler() {
  if (schedulerTimer) {
    return schedulerTimer;
  }

  void runAnnouncementScheduler();

  schedulerTimer = setInterval(() => {
    void runAnnouncementScheduler();
  }, SCHEDULER_INTERVAL_MS);

  console.log("[AnnouncementScheduler] Started.");

  return schedulerTimer;
}

/**
 * Stop the scheduler.
 *
 * Useful for tests and graceful shutdown.
 */
export function stopAnnouncementScheduler() {
  if (!schedulerTimer) {
    return;
  }

  clearInterval(schedulerTimer);

  schedulerTimer = undefined;

  console.log("[AnnouncementScheduler] Stopped.");
}

export default startAnnouncementScheduler;
>>>>>>> f8f0289 (Added feature to check performance of the employees)
