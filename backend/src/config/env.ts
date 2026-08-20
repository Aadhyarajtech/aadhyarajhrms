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
};