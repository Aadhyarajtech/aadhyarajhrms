import { expireTimedRecords } from "@/services/expiry.service";

/**
 * Central lifecycle worker for leave, regularization, ticket, notification
 * and announcement expiry.
 *
 * It runs once immediately after the database connection is established and
 * then once every minute. The worker is intentionally independent from HTTP
 * requests so a ticket expires even when nobody opens the Tickets screen.
 */
export function startRequestExpiryJob() {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;

    try {
      const result = await expireTimedRecords();
      const total =
        result.leave +
        result.regularization +
        result.tickets +
        result.notifications +
        result.announcements;

      if (total > 0) {
        console.log("[Request Expiry] Expired/cleaned records:", result);
      }
    } catch (error) {
      console.error("[Request Expiry] Failed:", error);
    } finally {
      running = false;
    }
  };

  console.log("[Request Expiry] Started. Checking every 60 seconds.");
  void run();
  return setInterval(() => void run(), 60 * 1000);
}
