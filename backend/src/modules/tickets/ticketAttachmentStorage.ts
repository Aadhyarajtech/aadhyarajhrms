import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";
import type { Readable } from "node:stream";

const BUCKET_NAME = "ticketAttachments";

function getBucket(): GridFSBucket {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB is not connected; ticket attachment storage is unavailable.");
  return new GridFSBucket(db, { bucketName: BUCKET_NAME });
}

export interface StoredTicketAttachment {
  id: string;
  url: string;
}

export async function storeTicketAttachment(file: Express.Multer.File): Promise<StoredTicketAttachment> {
  const bucket = getBucket();
  const safeName = file.originalname.replace(/[\\/\\\\\r\\n\\\"]/g, "_").slice(0, 180) || "attachment";
  const stream = bucket.openUploadStream(safeName, {
    contentType: file.mimetype,
    metadata: { originalName: safeName, contentType: file.mimetype, size: file.size },
  });
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.once("finish", () => resolve());
    stream.end(file.buffer);
  });
  return { id: String(stream.id), url: `/api/tickets/attachments/${String(stream.id)}` };
}

export function getTicketAttachmentFile(id: string) {
  if (!ObjectId.isValid(id)) return Promise.resolve(null);
  return getBucket().find({ _id: new ObjectId(id) }).toArray().then((files) => files[0] ?? null);
}

export function openTicketAttachmentDownload(id: string): Readable {
  return getBucket().openDownloadStream(new ObjectId(id));
}

export async function deleteTicketAttachment(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) return;
  try { await getBucket().delete(new ObjectId(id)); } catch (error) {
    // Cleanup must not mask the primary ticket-creation error.
    console.error("[Tickets] Failed to clean up an unattached GridFS file.", error);
  }
}
