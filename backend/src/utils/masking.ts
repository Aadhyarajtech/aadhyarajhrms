/**
 * Utility functions for masking sensitive PII and financial numbers (Bank Account, PAN, Aadhaar)
 * to comply with data privacy standards and prevent sensitive data leakage to external AI APIs.
 */

/**
 * Masks a bank account number, displaying only the last 4 digits.
 * Example: "91823746192837" -> "••••••••2837"
 */
export function maskBankAccount(accountNumber: string | null | undefined): string {
  if (!accountNumber) return "—";
  const cleaned = accountNumber.replace(/\s+/g, "").trim();
  if (cleaned.length <= 4) return "••••";
  return `••••••••${cleaned.slice(-4)}`;
}

/**
 * Masks an Indian Permanent Account Number (PAN), displaying only the last 4 characters.
 * Example: "ABCDE1234F" -> "•••••1234F"
 */
export function maskPan(pan: string | null | undefined): string {
  if (!pan) return "—";
  const cleaned = pan.replace(/[\s-]/g, "").trim().toUpperCase();
  if (cleaned.length <= 4) return "•••••";
  return `•••••${cleaned.slice(-4)}`;
}

/**
 * Masks an Indian Aadhaar identification number, displaying only the last 4 digits.
 * Example: "987654321098" -> "•••• •••• 1098"
 */
export function maskAadhaar(aadhaar: string | null | undefined): string {
  if (!aadhaar) return "—";
  const cleaned = aadhaar.replace(/[\s-]/g, "").trim();
  if (cleaned.length <= 4) return "••••••••";
  return `•••• •••• ${cleaned.slice(-4)}`;
}

/**
 * Sanitizes free-form text before sending to external AI LLMs (Groq, OpenAI, etc.).
 * Redacts any detected raw PAN cards, Aadhaar numbers, and bank account sequences
 * so that sensitive employee financial identifiers are NEVER transmitted to external model providers.
 */
export function sanitizeTextForAI(text: string | null | undefined): string {
  if (!text) return "";
  let sanitized = text;

  // 1. Redact Indian PAN Card numbers (5 letters, 4 numbers, 1 letter)
  sanitized = sanitized.replace(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/gi, (match) => {
    return `[PAN: •••••${match.slice(-4).toUpperCase()}]`;
  });

  // 2. Redact 12-digit Indian Aadhaar numbers (with optional spaces or dashes)
  sanitized = sanitized.replace(/\b(\d{4})[\s-](\d{4})[\s-](\d{4})\b/g, (_match, _p1, _p2, p3) => {
    return `[AADHAAR: •••• •••• ${p3}]`;
  });
  sanitized = sanitized.replace(/\b(\d{12})\b/g, (match) => {
    return `[AADHAAR: •••• •••• ${match.slice(-4)}]`;
  });

  // 3. Redact Bank Account numbers (9 to 18 continuous digits not already caught)
  sanitized = sanitized.replace(/\b(\d{9,18})\b/g, (match) => {
    return `[ACCOUNT: ••••••••${match.slice(-4)}]`;
  });

  return sanitized;
}
