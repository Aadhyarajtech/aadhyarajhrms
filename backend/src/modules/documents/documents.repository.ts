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
import {
  PRIVATE_DOCUMENT_DIR_ABSOLUTE,
  UPLOAD_DIR_ABSOLUTE,
} from "@/middleware/upload";

function toApiDoc(doc: any) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

function formatDocType(type: string) {
  return String(type)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- Authorization helpers ---
// Used to scope a MANAGER's reach to only the employees assigned to them
// (i.e. Employee.managerId === managerId), so a manager can request/upload
// documents for their own reports but not for the whole company.
export async function isDirectReport(managerId: string, employeeId: string) {
  const emp = await Employee.findById(employeeId).lean();
  return !!emp && emp.managerId === managerId;
}

// --- Documents ---
export async function listDocuments(employeeId: string) {
  const rows = await DocumentRecord.find({ employeeId })
    .sort({ uploadedAt: -1 })
    .lean();
  return rows.map(toApiDoc);
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

function safePrivateDocumentPath(storageKey: string) {
  const safeKey = path.basename(storageKey);
  const root = path.resolve(PRIVATE_DOCUMENT_DIR_ABSOLUTE);
  const target = path.resolve(root, safeKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw AppError.forbidden();
  }
  return target;
}

export async function getPrivateDocumentPath(id: string) {
  const row = await DocumentRecord.findById(id).lean();
  if (!row) throw AppError.notFound("Document not found.");
  if (!row.storageKey) {
    throw AppError.notFound("This document is not available through secure storage yet.");
  }
  const filePath = safePrivateDocumentPath(row.storageKey);
  try {
    await fs.access(filePath);
  } catch {
    throw AppError.notFound("Document file not found.");
  }
  return { row: toApiDoc(row), filePath };
}

export async function deleteDocument(id: string) {
  const row = await DocumentRecord.findById(id).lean();
  if (!row) return;

  if (row.storageKey) {
    try {
      await fs.unlink(safePrivateDocumentPath(row.storageKey));
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  await DocumentRecord.deleteOne({ _id: id });
}

export async function migrateLegacyDocumentsToPrivateStorage() {
  const rows = await DocumentRecord.find({
    $or: [
      { storageKey: { $exists: false } },
      { storageKey: null },
    ],
  }).lean();

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const value = String(row.fileUrl ?? "");
    if (!value.startsWith("/uploads/")) {
      skipped += 1;
      continue;
    }

    const filename = path.basename(value);
    if (!filename || filename === "." || filename === "..") {
      skipped += 1;
      continue;
    }

    const source = path.resolve(UPLOAD_DIR_ABSOLUTE, filename);
    const destination = safePrivateDocumentPath(filename);

    try {
      await fs.access(source);
      await fs.mkdir(PRIVATE_DOCUMENT_DIR_ABSOLUTE, { recursive: true });

      try {
        await fs.rename(source, destination);
      } catch (error: any) {
        if (error?.code !== "EXDEV") throw error;
        await fs.copyFile(source, destination);
        await fs.unlink(source);
      }

      await DocumentRecord.updateOne(
        { _id: row._id },
        {
          $set: {
            storageKey: filename,
            fileUrl: `/api/documents/${row._id}/download`,
          },
        },
      );
      migrated += 1;
    } catch {
      // Never break application startup because one legacy file is missing.
      skipped += 1;
    }
  }

  if (migrated || skipped) {
    console.info(
      `[documents] legacy storage migration complete: ${migrated} migrated, ${skipped} skipped`,
    );
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
    // Notify the employee that a document has been requested from them.
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
    // Notify the appropriate company/HR recipients that an employee has
    // requested a company-issued document.
    const recipients = await User.find({
      role: { $in: ["SUPER_ADMIN", "HR_ADMIN"] },
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
  const empMap = new Map(employees.map((e) => [e._id, e]));

  return rows.map((r) => {
    const emp = empMap.get(r.employeeId);
    const { _id, ...rest } = r;
    return {
      id: _id,
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

  // The document type is always taken from the request itself, never from
  // the uploader's payload, so the requested type cannot be changed silently.
  const document = await addDocument({
  employeeId: requestRow.employeeId,
  type: requestRow.type,
  fileName: input.fileName,
  fileUrl: input.fileUrl,
  storageKey: input.storageKey,
  uploadedBy: input.uploadedByUserId,
  requestId: requestRow._id,
  expiryDate: input.expiryDate ?? null,
});

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
    // Notify only the exact person who originally requested this document.
    await notify({
      userId: requestRow.requestedByUserId,
      type: "DOCUMENT_UPLOADED",
      title: "Document uploaded",
      message: `${formatDocType(requestRow.type)} has been uploaded.`,
      link: "/documents",
    });
  } else {
    // Notify the employee that their requested company document is ready.
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
  const empMap = new Map(employees.map((e) => [e._id, e]));
  return rows.map((r) => {
    const emp = empMap.get(r.employeeId);
    const { _id, ...rest } = r;
    return {
      id: _id,
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
