// path: src/config/env.ts

import dotenv from "dotenv";

dotenv.config();

/* =========================================================
   REQUIRED ENVIRONMENT VARIABLE
========================================================= */

function required(
  name: string,
  fallback?: string,
): string {
  const value =
    process.env[name] ?? fallback;

  if (value === undefined) {
    throw new Error(
      `Missing required environment variable: ${name}`,
    );
  }

  return value;
}

function positiveDays(name: string, fallback: number): number {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

/* =========================================================
   CLIENT ORIGINS
========================================================= */

function parseOrigins(
  raw: string | undefined,
  fallback: string,
): string[] {
  const value =
    raw && raw.trim().length > 0
      ? raw
      : fallback;

  return value
    .split(",")
    .map((origin) =>
      origin.trim().replace(/\/+$/, ""),
    )
    .filter(Boolean);
}

/* =========================================================
   ENVIRONMENT CONFIGURATION
========================================================= */

export const env = {
  /* -------------------------------------------------------
     SERVER
  ------------------------------------------------------- */

  port:
    Number(process.env.PORT) || 4000,

  nodeEnv:
    process.env.NODE_ENV ||
    "development",

  isProd:
    process.env.NODE_ENV ===
    "production",

  /* -------------------------------------------------------
     AUTHENTICATION
  ------------------------------------------------------- */

  jwtSecret:
    required(
      "JWT_SECRET",
      "dev-secret-not-for-production",
    ),

  jwtExpiresIn:
    process.env.JWT_EXPIRES_IN ||
    "8h",

  /* -------------------------------------------------------
     EXPIRY CONFIGURATION

     These values are the server-side defaults. Individual
     announcements/tickets can override their expiry through
     their stored expiryDays value where supported.
  ------------------------------------------------------- */

  // Leave requests expire after 2 days.
  leaveRequestExpiryDays:
    positiveDays("LEAVE_REQUEST_EXPIRY_DAYS", 2),

  // Attendance regularization requests expire after 1 day.
  regularizationExpiryDays:
    positiveDays("REGULARIZATION_EXPIRY_DAYS", 1),

  // Notifications are deleted after 1 day.
  notificationExpiryDays:
    positiveDays("NOTIFICATION_EXPIRY_DAYS", 1),

  // Announcements remain in history as EXPIRED after 7 days by default.
  announcementExpiryDays:
    positiveDays("ANNOUNCEMENT_EXPIRY_DAYS", 7),

  /* -------------------------------------------------------
     FRONTEND
  ------------------------------------------------------- */

  clientOrigins:
    parseOrigins(
      process.env.CLIENT_ORIGIN,
      "http://localhost:5173",
    ),

  /* -------------------------------------------------------
     DATABASE
  ------------------------------------------------------- */

  mongoUri:
    required("MONGODB_URI"),

  /* -------------------------------------------------------
     SMTP / EMAIL
  ------------------------------------------------------- */

  smtpHost:
    process.env.SMTP_HOST ||
    "",

  smtpPort:
    Number(
      process.env.SMTP_PORT || 587,
    ),

  smtpSecure:
    process.env.SMTP_SECURE ===
    "true",

  smtpUser:
    process.env.SMTP_USER ||
    "",

  smtpPass:
    process.env.SMTP_PASS ||
    "",

  smtpFrom:
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "",

  /* -------------------------------------------------------
     AI / GROQ
  ------------------------------------------------------- */

  groqApiKey:
    process.env.GROQ_API_KEY ||
    "",

  groqModel:
    process.env.GROQ_MODEL ||
    "llama-3.3-70b-versatile",

  /* -------------------------------------------------------
     GOOGLE CALENDAR / GOOGLE MEET
  ------------------------------------------------------- */

  googleCalendarId:
    process.env.GOOGLE_CALENDAR_ID ||
    "primary",

  googleCalendarTimeZone:
    process.env.GOOGLE_CALENDAR_TIME_ZONE ||
    "Asia/Kolkata",

  googleClientId:
    process.env.GOOGLE_CLIENT_ID ||
    "",

  googleClientSecret:
    process.env.GOOGLE_CLIENT_SECRET ||
    "",

  googleRefreshToken:
    process.env.GOOGLE_REFRESH_TOKEN ||
    "",

  googleServiceAccountEmail:
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    "",

  googleServiceAccountPrivateKey:
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
    "",

  googleCalendarImpersonateEmail:
    process.env.GOOGLE_CALENDAR_IMPERSONATE_EMAIL ||
    "",
};
