import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";
import { Readable } from "node:stream";

export type StoredFileCategory = "avatar" | "resume" | "ticket-attachment" | "general";

export interface StoredGridFsFile {
  id: string;
  filename: string;
  contentType: string;
  length: number;
  category: StoredFileCategory;
}

function getBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB is not connected; cannot access file storage.");
  return new GridFSBucket(db, { bucketName: "hrmsFiles" });
}

export async function storeGridFsFile(input: {
  buffer: Buffer;
  filename: string;
  contentType: string;
  category: StoredFileCategory;
}): Promise<StoredGridFsFile> {
  const bucket = getBucket();
  const uploadStream = bucket.openUploadStream(input.filename, {
    contentType: input.contentType || "application/octet-stream",
    metadata: { category: input.category, originalName: input.filename },
  });
  await new Promise<void>((resolve, reject) => {
    Readable.from([input.buffer]).pipe(uploadStream).on("error", reject).on("finish", resolve);
  });
  return {
    id: String(uploadStream.id),
    filename: input.filename,
    contentType: input.contentType || "application/octet-stream",
    length: input.buffer.length,
    category: input.category,
  };
}

export async function findGridFsFile(id: string): Promise<any | null> {
  if (!ObjectId.isValid(id)) return null;
  const files = await getBucket().find({ _id: new ObjectId(id) }).limit(1).toArray();
  return files[0] ?? null;
}

export async function getGridFsFileBuffer(id: string, category?: StoredFileCategory): Promise<{ file: any; buffer: Buffer } | null> {
  const file = await findGridFsFile(id);
  if (!file || (category && file.metadata?.category !== category)) return null;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    getBucket().openDownloadStream(new ObjectId(id))
      .on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
      .on("error", reject)
      .on("end", resolve);
  });
  return { file, buffer: Buffer.concat(chunks) };
}

export function streamGridFsFile(id: string, res: import("express").Response) {
  if (!ObjectId.isValid(id)) return false;
  getBucket().openDownloadStream(new ObjectId(id)).on("error", (error: any) => {
    if (!res.headersSent) res.status(error?.code === "ENOENT" ? 404 : 500).end();
    else res.destroy(error);
  }).pipe(res);
  return true;
}

export async function deleteGridFsFile(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) return;
  try { await getBucket().delete(new ObjectId(id)); } catch { /* best-effort cleanup */ }
}
