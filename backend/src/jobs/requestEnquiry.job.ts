import { expireTimedRecords } from "@/services/expiry.service";

/** Compatibility job for installations that still use this filename. */
export function startRequestEnquiryJob() {
  const run = async () => {
    try {
      await expireTimedRecords();
    } catch (error) {
      console.error("[Request Expiry] Failed:", error);
    }
  };

  void run();
  return setInterval(() => void run(), 60 * 1000);
}
