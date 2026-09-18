import { expireTimedRecords } from "@/services/expiry.service";

export function startRequestExpiryJob() {
  const run = async () => {
    try {
      const result = await expireTimedRecords();

      // Ticket expiry has been removed. Keep this job for the
      // remaining timed modules only.
      if (
        result.leave > 0 ||
        result.regularization > 0 ||
        result.notifications > 0 ||
        result.announcements > 0
      ) {
        console.info("[Request Expiry] Processed:", {
          leave: result.leave,
          regularization: result.regularization,
          notifications: result.notifications,
          announcements: result.announcements,
        });
      }
    } catch (error) {
      console.error("[Request Expiry] Failed:", error);
    }
  };

  void run();
  return setInterval(() => void run(), 60 * 1000);
}
