import {
  DocumentRecord,
  DocumentRequest,
  Asset,
  Employee,
  User,
} from "@/db/models";
import { nowIso } from "@/db/connection";
import { notify } from "@/modules/notifications/notifications.repository";
import { AppError } from "@/utils/errors";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";
import {
  PRIVATE_DOCUMENT_DIR_ABSOLUTE,
  UPLOAD_DIR_ABSOLUTE,
} from "@/middleware/upload";

function toApiDoc(doc: any) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
}

function formatDocType(type: string) {
  return String(type)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- Authorization helpers ---
export async function isDirectReport(managerId: string, employeeId: string) {
  if (!managerId || !employeeId) return false;
  const emp = await Employee.findById(employeeId).lean();
  return !!emp && String(emp.managerId) === String(managerId);
}

// --- Documents ---
export async function listDocuments(employeeId: string) {
  const rows = await DocumentRecord.find({ employeeId })
    .sort({ uploadedAt: -1 })
    .lean();

  const reviewerIds = rows
    .map((doc) => doc.reviewedBy)
    .filter(Boolean);

  const reviewers = await Employee.find({
    userId: { $in: reviewerIds },
  })
    .select("userId firstName lastName")
    .lean();

  const reviewerMap = new Map(
    reviewers.map((user) => [
      String(user.userId),
      `${user.firstName} ${user.lastName}`.trim(),
    ])
  );

  return rows.map((doc) => ({
    ...toApiDoc(doc),
    reviewedBy: doc.reviewedBy
      ? reviewerMap.get(String(doc.reviewedBy)) ?? doc.reviewedBy
      : null,
  }));
}

export async function addDocument(input: {
  employeeId: string;
  type: string;
  fileName: string;
  fileUrl: string;
  storageKey?: string | null;
  uploadedBy?: string | null;
  requestId?: string | null;
  expiryDate?: string | null;
}) {
  const doc = await DocumentRecord.create({
    employeeId: input.employeeId,
    type: input.type,
    fileName: input.fileName,
    fileUrl: input.fileUrl,
    storageKey: input.storageKey ?? null,
    uploadedAt: nowIso(),
    uploadedBy: input.uploadedBy ?? null,
    requestId: input.requestId ?? null,
    expiryDate: input.expiryDate ?? null,
  });

  return toApiDoc(
    (await DocumentRecord.findById(doc._id).lean())!,
  );
}

export async function setDocumentFileUrl(
  id: string,
  storageKey: string,
) {
  await DocumentRecord.updateOne(
    { _id: id },
    {
      $set: {
        storageKey,
        fileUrl: `/api/documents/${id}/download`,
      },
    },
  );
  return getDocument(id);
}

export async function updateDocumentExpiryDate(
  id: string,
  expiryDate: string | null,
) {
  const doc = await DocumentRecord.findByIdAndUpdate(
    id,
    { $set: { expiryDate } },
    { new: true },
  );

  if (!doc) {
    throw AppError.notFound("Document not found.");
  }

  return toApiDoc(doc);
}

function safePrivateDocumentPath(storageKey: string) {
  const safeKey = path.basename(storageKey);
  const root = path.resolve(PRIVATE_DOCUMENT_DIR_ABSOLUTE);
  const target = path.resolve(root, safeKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw AppError.forbidden();
  }
  return target;
}

function safePublicUploadPath(storageKey: string) {
  const safeKey = path.basename(storageKey);
  const root = path.resolve(UPLOAD_DIR_ABSOLUTE);
  const target = path.resolve(root, safeKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw AppError.forbidden();
  }
  return target;
}

const GRIDFS_PREFIX = "gridfs:";
const GRIDFS_BUCKET_NAME = "hrmsDocuments";

function getDocumentsBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB is not connected; document storage is unavailable.");
  return new GridFSBucket(db, { bucketName: GRIDFS_BUCKET_NAME });
}

/** Persist an uploaded document to MongoDB GridFS and return its stable storage key. */
export async function storeDocumentFile(
  buffer: Buffer,
  fileName: string,
  contentType: string,
): Promise<string> {
  if (!buffer?.length) throw AppError.badRequest("The uploaded file is empty.");
  const bucket = getDocumentsBucket();
  const upload = bucket.openUploadStream(fileName, {
    metadata: { contentType: contentType || "application/octet-stream" },
  });
  await new Promise<void>((resolve, reject) => {
    upload.once("finish", () => resolve());
    upload.once("error", reject);
    upload.end(buffer);
  });
  return `${GRIDFS_PREFIX}${String(upload.id)}`;
}

async function readGridFsFile(storageKey: string): Promise<Buffer> {
  const idText = storageKey.slice(GRIDFS_PREFIX.length);
  if (!ObjectId.isValid(idText)) throw AppError.notFound("Stored document reference is invalid.");
  const bucket = getDocumentsBucket();
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = bucket.openDownloadStream(new ObjectId(idText));
    stream.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    stream.once("error", reject);
    stream.once("end", resolve);
  }).catch((error: any) => {
    if (error?.code === "ENOENT" || error?.codeName === "NoSuchKey") {
      throw AppError.notFound("The uploaded document is missing from database storage.");
    }
    throw error;
  });
  return Buffer.concat(chunks);
}

/** Reads a document from GridFS or the legacy local folders during migration. */
export async function getPrivateDocumentContent(id: string) {
  const row = await DocumentRecord.findById(id).lean();
  if (!row) throw AppError.notFound("Document not found.");

  let key = String(row.storageKey || "");
  if (key.startsWith(GRIDFS_PREFIX)) {
    return { row: toApiDoc(row), buffer: await readGridFsFile(key) };
  }
  if (!key && row.fileUrl) {
    const value = String(row.fileUrl);
    key = value.startsWith("/uploads/") ? path.basename(value) : "";
  }
  if (!key) {
    throw AppError.notFound(`The uploaded file for "${String(row.fileName || "document")}" is not available in storage.`);
  }

  const candidates = [safePrivateDocumentPath(key), safePublicUploadPath(key)];
  for (const filePath of candidates) {
    try {
      const buffer = await fs.readFile(filePath);
      return { row: toApiDoc(row), buffer };
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw AppError.notFound(`The uploaded file for "${String(row.fileName || key)}" is missing from server storage. It must be restored or re-uploaded.`);
}

export async function deleteDocument(id: string) {
  const row = await DocumentRecord.findById(id).lean();
  if (!row) return;

  const storageKey = String(row.storageKey || "");
  if (storageKey.startsWith(GRIDFS_PREFIX)) {
    const idText = storageKey.slice(GRIDFS_PREFIX.length);
    if (ObjectId.isValid(idText)) {
      try { await getDocumentsBucket().delete(new ObjectId(idText)); }
      catch (error: any) { if (error?.code !== "ENOENT") throw error; }
    }
  } else if (storageKey) {
    for (const candidate of [safePrivateDocumentPath(storageKey), safePublicUploadPath(storageKey)]) {
      try { await fs.unlink(candidate); break; }
      catch (error: any) { if (error?.code !== "ENOENT") throw error; }
    }
  }

  await DocumentRecord.deleteOne({ _id: id });
}

export async function migrateLegacyDocumentsToPrivateStorage() {
  // On startup, move any documents still on local disk into GridFS. This also
  // migrates legacy /uploads records where the original file is still present.
  const rows = await DocumentRecord.find({}).lean();
  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const existingKey = String(row.storageKey || "");
    if (existingKey.startsWith(GRIDFS_PREFIX)) continue;

    let key = existingKey;
    if (!key) {
      const fileUrl = String(row.fileUrl || "");
      if (fileUrl.startsWith("/uploads/")) key = path.basename(fileUrl);
    }
    if (!key || key === "." || key === "..") { skipped += 1; continue; }

    let sourcePath: string | null = null;
    for (const candidate of [safePrivateDocumentPath(key), safePublicUploadPath(key)]) {
      try { await fs.access(candidate); sourcePath = candidate; break; }
      catch (error: any) { if (error?.code !== "ENOENT") throw error; }
    }
    if (!sourcePath) { skipped += 1; continue; }

    try {
      const buffer = await fs.readFile(sourcePath);
      const ext = path.extname(String(row.fileName || key)).toLowerCase();
      const contentType = ext === ".pdf" ? "application/pdf"
        : [".jpg", ".jpeg"].includes(ext) ? "image/jpeg"
        : ext === ".png" ? "image/png"
        : ext === ".webp" ? "image/webp"
        : ext === ".txt" ? "text/plain"
        : ext === ".doc" ? "application/msword"
        : ext === ".docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/octet-stream";
      const gridfsKey = await storeDocumentFile(buffer, String(row.fileName || key), contentType);
      await DocumentRecord.updateOne(
        { _id: row._id },
        { $set: { storageKey: gridfsKey, fileUrl: `/api/documents/${row._id}/download` } },
      );
      await fs.unlink(sourcePath).catch(() => undefined);
      migrated += 1;
    } catch (error) {
      skipped += 1;
      console.warn(`[documents] Could not migrate document ${String(row._id)} to GridFS`, error);
    }
  }

  if (migrated || skipped) {
    console.info(`[documents] GridFS migration complete: ${migrated} migrated, ${skipped} skipped`);
  }
}

export async function getDocument(id: string) {
  const row = await DocumentRecord.findById(id).lean();
  return toApiDoc(row);
}

export async function reviewDocument(
  id: string,
  reviewedByUserId: string,
  status: "VERIFIED" | "REJECTED",
  rejectionReason: string | null,
) {
  const row = await DocumentRecord.findById(id).lean();
  if (!row) throw AppError.notFound("Document not found.");

  await DocumentRecord.updateOne(
    { _id: id },
    {
      $set: {
        status,
        reviewedBy: reviewedByUserId,
        reviewedAt: nowIso(),
        rejectionReason:
          status === "REJECTED" ? (rejectionReason ?? null) : null,
      },
    },
  );

  return toApiDoc((await DocumentRecord.findById(id).lean())!);
}

// --- Document requests (both directions) ---

export async function createDocumentRequest(input: {
  employeeId: string;
  type: string;
  note?: string | null;
  direction: "COMPANY_TO_EMPLOYEE" | "EMPLOYEE_TO_COMPANY";
  requestedByUserId: string;
}) {
  const doc = await DocumentRequest.create({
    employeeId: input.employeeId,
    direction: input.direction,
    type: input.type,
    note: input.note ?? null,
    status: "PENDING",
    requestedByUserId: input.requestedByUserId,
    processedByUserId: null,
    documentId: null,
    requestedAt: nowIso(),
    completedAt: null,
  });
  const request = toApiDoc((await DocumentRequest.findById(doc._id).lean())!);

  if (input.direction === "COMPANY_TO_EMPLOYEE") {
    const employee = await Employee.findById(input.employeeId).lean();
    if (employee) {
      await notify({
        userId: employee.userId,
        type: "DOCUMENT_REQUESTED",
        title: "Document requested",
        message: `${formatDocType(input.type)} has been requested from you.`,
        link: "/documents",
      });
    }
  } else {
    const recipients = await User.find({
      role: { $in: ["SUPER_ADMIN", "ADMIN", "ADMIN"] },
      isActive: true,
    }).lean();
    for (const recipient of recipients) {
      await notify({
        userId: recipient._id,
        type: "DOCUMENT_REQUESTED",
        title: "New document request",
        message: `An employee requested ${formatDocType(input.type)}.`,
        link: "/documents",
      });
    }
  }

  return request;
}

export async function listDocumentRequestsForEmployee(employeeId: string) {
  const rows = await DocumentRequest.find({ employeeId })
    .sort({ requestedAt: -1 })
    .lean();
  return rows.map(toApiDoc);
}

export async function listCompanyDocumentRequests(status?: string) {
  const query: Record<string, any> = { direction: "EMPLOYEE_TO_COMPANY" };
  if (status) query.status = status;

  const rows = await DocumentRequest.find(query)
    .sort({ requestedAt: -1 })
    .lean();
  if (rows.length === 0) return [];

  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
  const employees = await Employee.find({ _id: { $in: employeeIds } }).lean();
  const empMap = new Map(employees.map((e) => [String(e._id), e]));

  return rows.map((r) => {
    const emp = empMap.get(String(r.employeeId));
    const { _id, ...rest } = r;
    return {
      id: String(_id),
      ...rest,
      firstName: emp?.firstName ?? null,
      lastName: emp?.lastName ?? null,
      employeeCode: emp?.employeeCode ?? null,
    };
  });
}

export async function getDocumentRequest(id: string) {
  const row = await DocumentRequest.findById(id).lean();
  return toApiDoc(row);
}

export async function fulfillDocumentRequest(input: {
  requestId: string;
  fileName: string;
  fileUrl: string;
  storageKey: string;
  uploadedByUserId: string;
  expiryDate?: string | null;
}) {
  const requestRow = await DocumentRequest.findById(input.requestId).lean();
  if (!requestRow) throw AppError.notFound("Document request not found.");
  if (requestRow.status !== "PENDING") {
    throw AppError.badRequest(
      "This document request has already been processed.",
    );
  }

  const document = await addDocument({
    employeeId: requestRow.employeeId,
    type: requestRow.type,
    fileName: input.fileName,
    fileUrl: input.storageKey || "pending",
    storageKey: input.storageKey,
    uploadedBy: input.uploadedByUserId,
    requestId: requestRow._id,
    expiryDate: input.expiryDate ?? null,
  });

  if (input.storageKey) {
    await setDocumentFileUrl(document.id, input.storageKey);
  }

  const completedAt = nowIso();
  await DocumentRequest.updateOne(
    { _id: requestRow._id },
    {
      $set: {
        status: "UPLOADED",
        documentId: document!.id,
        processedByUserId: input.uploadedByUserId,
        completedAt,
      },
    },
  );
  const request = toApiDoc(
    (await DocumentRequest.findById(requestRow._id).lean())!,
  );

  if (requestRow.direction === "COMPANY_TO_EMPLOYEE") {
    await notify({
      userId: requestRow.requestedByUserId,
      type: "DOCUMENT_UPLOADED",
      title: "Document uploaded",
      message: `${formatDocType(requestRow.type)} has been uploaded.`,
      link: "/documents",
    });
  } else {
    const employee = await Employee.findById(requestRow.employeeId).lean();
    if (employee) {
      await notify({
        userId: employee.userId,
        type: "DOCUMENT_READY",
        title: "Document ready",
        message: `Your requested ${formatDocType(requestRow.type)} is now available.`,
        link: "/documents",
      });
    }
  }

  return { document, request };
}

// --- Assets ---
export async function listAssets(employeeId?: string) {
  if (employeeId) {
    const rows = await Asset.find({ employeeId })
      .sort({ assignedAt: -1 })
      .lean();
    return rows.map(toApiDoc);
  }
  const rows = await Asset.find({}).sort({ assignedAt: -1 }).lean();
  if (rows.length === 0) return [];
  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
  const employees = await Employee.find({ _id: { $in: employeeIds } }).lean();
  const empMap = new Map(employees.map((e) => [String(e._id), e]));
  return rows.map((r) => {
    const emp = empMap.get(String(r.employeeId));
    const { _id, ...rest } = r;
    return {
      id: String(_id),
      ...rest,
      firstName: emp?.firstName ?? null,
      lastName: emp?.lastName ?? null,
      employeeCode: emp?.employeeCode ?? null,
    };
  });
}

export async function assignAsset(input: {
  employeeId: string;
  assetTag: string;
  category: string;
  name: string;
}) {
  const doc = await Asset.create({
    ...input,
    assignedAt: nowIso(),
    status: "ASSIGNED",
  });
  return toApiDoc((await Asset.findById(doc._id).lean())!);
}

export async function updateAssetStatus(id: string, status: string) {
  const returnedAt = status === "RETURNED" ? nowIso() : null;
  await Asset.updateOne({ _id: id }, { $set: { status, returnedAt } });
  return toApiDoc((await Asset.findById(id).lean())!);
}
