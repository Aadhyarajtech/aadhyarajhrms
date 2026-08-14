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
  uploadedBy?: string | null;
  requestId?: string | null;
}) {
  const doc = await DocumentRecord.create({
    employeeId: input.employeeId,
    type: input.type,
    fileName: input.fileName,
    fileUrl: input.fileUrl,
    uploadedAt: nowIso(),
    uploadedBy: input.uploadedBy ?? null,
    requestId: input.requestId ?? null,
  });
  return toApiDoc((await DocumentRecord.findById(doc._id).lean())!);
}

export async function deleteDocument(id: string) {
  await DocumentRecord.deleteOne({ _id: id });
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
  uploadedByUserId: string;
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
    uploadedBy: input.uploadedByUserId,
    requestId: requestRow._id,
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
