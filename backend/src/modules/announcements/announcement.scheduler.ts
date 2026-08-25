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
    const published = await announcementRepo.publishDueAnnouncements();

    if (!published.length) {
      return;
    }

    for (const announcement of published) {
      try {
        console.log(
          `[Announcement Scheduler] Published: ${announcement.title}`,
        );

        console.log(
          `[Announcement Scheduler] Targeting: audience=${announcement.audience}, departments=${JSON.stringify(
            announcement.departments ?? [],
          )}, locations=${JSON.stringify(
            announcement.locations ?? [],
          )}, targetRoles=${JSON.stringify(announcement.targetRoles ?? [])}`,
        );

        /* -------------------------------------------------
           IN-APP NOTIFICATION
        ------------------------------------------------- */

        if (announcement.channels?.includes("IN_APP")) {
          const result =
            await notificationRepo.broadcastAnnouncementNotification({
              title: announcement.title,
              body: announcement.body,
              audience: announcement.audience,
              departments: announcement.departments ?? [],
              locations: announcement.locations ?? [],
              targetRoles: announcement.targetRoles ?? [],
            });

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

        if (announcement.channels?.includes("EMAIL")) {
          if (process.env.NODE_ENV !== "production") {
            console.log(
              `[Announcement Scheduler] Email broadcast skipped in development: ${announcement.title}`,
            );
          } else {
            const result = await notificationRepo.broadcastAnnouncementEmail({
              title: announcement.title,
              body: announcement.body,
              audience: announcement.audience,
              departments: announcement.departments ?? [],
              locations: announcement.locations ?? [],
              targetRoles: announcement.targetRoles ?? [],
            });

            console.log(
              `[Announcement Scheduler] Email broadcast completed: ${announcement.title}. Sent: ${
                result?.sent ?? 0
              }, Failed: ${result?.failed ?? 0}`,
            );
          }
        }
      } catch (error) {
        console.error(
          `[Announcement Scheduler] Delivery failed for "${announcement.title}":`,
          error,
        );
      }
    }
  } catch (error) {
    console.error("[Announcement Scheduler] Failed:", error);
  } finally {
    schedulerRunning = false;
  }
}

/* =========================================================
   START SCHEDULER
========================================================= */

export function startAnnouncementScheduler() {
  console.log("[Announcement Scheduler] Started. Checking every 60 seconds.");

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
