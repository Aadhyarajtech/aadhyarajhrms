/**
 * Users who have recruitment-head approval authority in addition to their
 * normal RECRUITER role. Keep this list limited to explicitly authorized leads.
 */
const RECRUITMENT_HEAD_EMAILS = new Set([
  "geetha.balachandran@aadhyarajtech.com",
  "meghana.sahithi@aadhyarajtech.com",
]);

export function isRecruitmentHeadEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && RECRUITMENT_HEAD_EMAILS.has(email.trim().toLowerCase());
}
