// path: src/config/env.ts
import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// CLIENT_ORIGIN can hold one or more comma-separated origins, e.g.:
//   CLIENT_ORIGIN=https://aadhyarajhrms.vercel.app,https://aadhyarajhrms-preview.vercel.app
// Each value is trimmed and any trailing slash is stripped, since browsers
// never send a trailing slash in the Origin header and an exact-match
// mismatch silently breaks every request when credentials: true is set.
function parseOrigins(raw: string | undefined, fallback: string): string[] {
  const value = raw && raw.trim().length > 0 ? raw : fallback;
  return value
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  jwtSecret: required("JWT_SECRET", "dev-secret-not-for-production"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  clientOrigins: parseOrigins(
    process.env.CLIENT_ORIGIN,
    "http://localhost:5173",
  ),
  mongoUri: required("MONGODB_URI"),
};
