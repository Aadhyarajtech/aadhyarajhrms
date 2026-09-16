import { expireTimedRecords } from "@/services/expiry.service";

export function startRequestExpiryJob() {
  const run = async () => {
    try { await expireTimedRecords(); } catch (error) { console.error("[Request Expiry] Failed:", error); }
  };
  void run();
  return setInterval(() => void run(), 60 * 1000);
}
