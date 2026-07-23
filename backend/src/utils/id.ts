import crypto from "node:crypto";

/** Generates a short, readable, collision-safe ID with a type prefix, e.g. "emp_4f9a1c2b8e". */
export function genId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}
