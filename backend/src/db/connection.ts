import mongoose from "mongoose";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

mongoose.set("strictQuery", true);

let connectPromise: Promise<typeof mongoose> | null = null;

/** Connects to MongoDB Atlas (idempotent — safe to call multiple times). */
export function connectDB(): Promise<typeof mongoose> {
  if (!connectPromise) {
    connectPromise = mongoose
      .connect(env.mongoUri)
      .then((conn) => {
        logger.info("Connected to MongoDB");
        return conn;
      })
      .catch((err) => {
        connectPromise = null;
        logger.error("Failed to connect to MongoDB", { message: err instanceof Error ? err.message : String(err) });
        throw err;
      });
  }
  return connectPromise;
}

/** Current ISO-8601 timestamp string, matching the format previously stored in SQLite TEXT columns. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Strips Mongo/Mongoose internals from a lean document and renames `_id` to `id`, to match the previous API shape. */
export function toApi<T = any>(input: any): T {
  if (Array.isArray(input)) return input.map(toApi) as any;
  if (input === null || input === undefined || typeof input !== "object") return input;
  const { _id, __v, ...rest } = input;
  return (_id !== undefined ? { id: _id, ...rest } : rest) as T;
}
