import { Router } from "express";
import { z } from "zod";
import path from "node:path";
import { authenticate } from "@/middleware/auth";
import { isAdmin } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { privateDocumentUpload } from "@/middleware/upload";
import { AppError } from "@/utils/errors";
import * as repo from "./documents.repository";

export const documentsRouter = Router();
documentsRouter.use(authenticate);

// --- Helper to get standard MIME types without external libraries ---
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

// --- Helper function to resolve "myself" or empty string to actual user employeeId ---
function resolveEmployeeId(paramId: string, currentUserEmployeeId?: string | null): string {
  if (paramId === "myself" || !paramId) {
    return String(currentUserEmployeeId || "");
  }
  return String(paramId);
}

// --- Document types -----------------------------------------------------
const EMPLOYEE_PROVIDED_TYPES = [
  "ID_PROOF",
  "ADDRESS_PROOF",
  "EDUCATIONAL",
  "CONTRACT",
  "OTHER",
] as const;

const COMPANY_ISSUED_TYPES = [
  "OFFER_LETTER",
  "APPOINTMENT_LETTER",
  "EXPERIENCE_LETTER",
  "RELIEVING_LETTER",
  "SALARY_CERTIFICATE",
  "EMPLOYMENT_CERTIFICATE",
  "OTHER",
] as const;

const ALL_DOC_TYPES = [
  "OFFER_LETTER",
  "ID_PROOF",
  "ADDRESS_PROOF",
  "EDUCATIONAL",
  "CONTRACT",
  "APPOINTMENT_LETTER",
  "EXPERIENCE_LETTER",
  "RELIEVING_LETTER",
  "SALARY_CERTIFICATE",
  "EMPLOYMENT_CERTIFICATE",
  "OTHER",
] as const;

const REQUESTER_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"];
const COMPANY_PROCESSOR_ROLES = ["SUPER_ADMIN", "HR_ADMIN"];

// --- Schemas ---
const directUploadTypeSchema = z.enum(ALL_DOC_TYPES);

// Preprocess empty string "" to undefined so optional date checks pass cleanly
const expiryDateSchema = z.preprocess(
  (val) => (val === "" ? undefined : val),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid expiry date.")
    .optional()
    .nullable()
);

const documentRequestSchema = z.object({
  employeeId: z.string().min(1).optional(),
  type: z.enum(ALL_DOC_TYPES),
  note: z.string().trim().max(500).optional(),
});

const documentReviewSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  rejectionReason: z.string().trim().optional(),
});

const assignSchema = z.object({
  employeeId: z.string(),
  assetTag: z.string().min(1),
  category: z.string().min(1),
  name: z.string().min(1),
});

const assetStatusSchema = z.object({
  status: z.enum(["ASSIGNED", "RETURNED", "DAMAGED", "LOST"]),
});

// --- Documents ---
documentsRouter.get("/employee/:employeeId", async (req, res, next) => {
  try {
    const targetEmployeeId = resolveEmployeeId(req.params.employeeId, req.user?.employeeId);
    const isOwner = targetEmployeeId === String(req.user!.employeeId ?? "");
    const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(req.user!.role);
    if (!isOwner && !isPrivileged) throw AppError.forbidden();
    res.json({ documents: await repo.listDocuments(targetEmployeeId) });
  } catch (err) {
    next(err);
  }
});

documentsRouter.post(
  "/employee/:employeeId",
  privateDocumentUpload.single("file"),
  async (req, res, next) => {
    try {
      const employeeId = resolveEmployeeId(req.params.employeeId, req.user?.employeeId);
      if (!req.file) {
        throw AppError.badRequest("Please attach a file.");
      }
      const requestId = (req.body.requestId as string) || null;

      // --- Uploading to fulfil an existing request ---
      if (requestId) {
        const request = await repo.getDocumentRequest(requestId);
        if (!request) {
          throw AppError.notFound("Document request not found.");
        }
        if (String(request.employeeId) !== employeeId) {
          throw AppError.badRequest(
            "This request does not belong to the specified employee.",
          );
        }
        if (request.status !== "PENDING") {
          throw AppError.badRequest(
            "This document request has already been processed.",
          );
        }

        if (request.direction === "COMPANY_TO_EMPLOYEE") {
          const isOwner = employeeId === String(req.user!.employeeId ?? "");
          if (!isOwner) throw AppError.forbidden();
        } else {
          const isProcessor = COMPANY_PROCESSOR_ROLES.includes(req.user!.role);
          if (!isProcessor) throw AppError.forbidden();
        }

        const parsedExpiryDate = expiryDateSchema.safeParse(req.body.expiryDate);

        if (!parsedExpiryDate.success) {
          throw AppError.badRequest("Invalid expiry date.");
        }

        const { document } = await repo.fulfillDocumentRequest({
          requestId,
          fileName: req.file.originalname,
          fileUrl: "pending",
          storageKey: req.file.filename,
          uploadedByUserId: req.user!.userId,
          expiryDate: parsedExpiryDate.data ?? null,
        });

        const secureDocument = await repo.setDocumentFileUrl(
          document.id,
          req.file.filename,
        );

        res.status(201).json({ document: secureDocument });
        return;
      }

      // --- Normal, non-request-based upload ---
      const isOwner = employeeId === String(req.user!.employeeId ?? "");
      const isAdminPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(
        req.user!.role,
      );
      let isAuthorized = isOwner || isAdminPrivileged;

      if (!isAuthorized && req.user!.role === "MANAGER") {
        isAuthorized = await repo.isDirectReport(
          req.user!.employeeId as string,
          employeeId,
        );
      }
      if (!isAuthorized) {
        throw AppError.forbidden();
      }

      const parsedType = directUploadTypeSchema.safeParse(
        req.body.type || "OTHER",
      );
      const type = parsedType.success ? parsedType.data : "OTHER";

      const parsedExpiryDate = expiryDateSchema.safeParse(req.body.expiryDate);

      if (!parsedExpiryDate.success) {
        throw AppError.badRequest("Invalid expiry date.");
      }

      const document = await repo.addDocument({
        employeeId,
        uploadedBy: req.user!.userId,
        requestId: null,
        type,
        fileName: req.file.originalname,
        fileUrl: "pending",
        storageKey: req.file.filename,
        expiryDate: parsedExpiryDate.data ?? null,
      });

      const secureDocument = await repo.setDocumentFileUrl(
        document.id,
        req.file.filename,
      );

      res.status(201).json({ document: secureDocument });
    } catch (error) {
      next(error);
    }
  },
);

documentsRouter.get("/:id/download", async (req, res, next) => {
  try {
    const document = await repo.getDocument(req.params.id);
    if (!document) throw AppError.notFound("Document not found.");

    const isOwner = String(document.employeeId) === String(req.user!.employeeId ?? "");
    const isAdminPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(
      req.user!.role,
    );
    let isAuthorized = isOwner || isAdminPrivileged;

    if (!isAuthorized && req.user!.role === "MANAGER") {
      isAuthorized = await repo.isDirectReport(
        req.user!.employeeId as string,
        String(document.employeeId),
      );
    }

    if (!isAuthorized) throw AppError.forbidden();

    const { filePath, row } = await repo.getPrivateDocumentPath(req.params.id);

    const mimeType = getMimeType(filePath);
    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${String(row.fileName).replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete("/:id", isAdmin, async (req, res, next) => {
  try {
    await repo.deleteDocument(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

documentsRouter.patch(
  "/:id/expiry-date",
  async (req, res, next) => {
    try {
      const document = await repo.updateDocumentExpiryDate(
        req.params.id,
        req.body.expiryDate ?? null,
      );

      res.json({ document });
    } catch (err) {
      next(err);
    }
  },
);

documentsRouter.patch(
  "/:id/review",
  validate(documentReviewSchema),
  async (req, res, next) => {
    try {
      const isReviewer = ["SUPER_ADMIN", "HR_ADMIN"].includes(
        req.user!.role,
      );
      if (!isReviewer) {
        throw AppError.forbidden();
      }
      if (req.body.status === "REJECTED" && !req.body.rejectionReason) {
        throw AppError.badRequest("Rejection reason is required.");
      }

      if (req.user!.role === "MANAGER") {
        const existing = await repo.getDocument(req.params.id);
        if (!existing) throw AppError.notFound("Document not found.");
        const allowed = await repo.isDirectReport(
          req.user!.employeeId as string,
          String(existing.employeeId),
        );
        if (!allowed) throw AppError.forbidden();
      }

      const document = await repo.reviewDocument(
        req.params.id,
        req.user!.userId,
        req.body.status,
        req.body.rejectionReason ?? null,
      );
      res.json({ document });
    } catch (err) {
      next(err);
    }
  },
);

// --- Document requests (both directions) ---------------------------------

documentsRouter.post(
  "/requests",
  validate(documentRequestSchema),
  async (req, res, next) => {
    try {
      const role = req.user!.role;
      const wantsToRequestFromEmployee = !!req.body.employeeId;
      const isPrivilegedRequester = REQUESTER_ROLES.includes(role);
      const isEmployeeRequester = !!req.user!.employeeId;

      let direction: "COMPANY_TO_EMPLOYEE" | "EMPLOYEE_TO_COMPANY";
      let targetEmployeeId: string;

      if (wantsToRequestFromEmployee) {
        if (!isPrivilegedRequester) throw AppError.forbidden();
        direction = "COMPANY_TO_EMPLOYEE";
        if (!EMPLOYEE_PROVIDED_TYPES.includes(req.body.type)) {
          throw AppError.badRequest(
            "This document type cannot be requested from an employee.",
          );
        }
        if (role === "MANAGER") {
          const allowed = await repo.isDirectReport(
            req.user!.employeeId as string,
            req.body.employeeId,
          );
          if (!allowed) throw AppError.forbidden();
        }
        targetEmployeeId = req.body.employeeId;
      } else if (isEmployeeRequester) {
        direction = "EMPLOYEE_TO_COMPANY";
        if (!COMPANY_ISSUED_TYPES.includes(req.body.type)) {
          throw AppError.badRequest(
            "This document type cannot be requested from the company.",
          );
        }
        targetEmployeeId = req.user!.employeeId as string;
      } else {
        throw AppError.forbidden();
      }

      const request = await repo.createDocumentRequest({
        employeeId: targetEmployeeId,
        requestedByUserId: req.user!.userId,
        type: req.body.type,
        note: req.body.note ?? null,
        direction,
      });

      res.status(201).json({ request });
    } catch (err) {
      next(err);
    }
  },
);

documentsRouter.get(
  "/requests/employee/:employeeId",
  async (req, res, next) => {
    try {
      const targetEmployeeId = resolveEmployeeId(req.params.employeeId, req.user?.employeeId);
      const isOwner = targetEmployeeId === String(req.user!.employeeId ?? "");
      const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(req.user!.role);
      if (!isOwner && !isPrivileged) throw AppError.forbidden();
      res.json({
        requests: await repo.listDocumentRequestsForEmployee(
          targetEmployeeId,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

documentsRouter.get("/requests/company", async (req, res, next) => {
  try {
    const isProcessor = COMPANY_PROCESSOR_ROLES.includes(req.user!.role);
    if (!isProcessor) throw AppError.forbidden();
    const status =
      typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ requests: await repo.listCompanyDocumentRequests(status) });
  } catch (err) {
    next(err);
  }
});

// --- Assets ---
documentsRouter.get("/assets/all", isAdmin, async (_req, res, next) => {
  try {
    res.json({ assets: await repo.listAssets() });
  } catch (err) {
    next(err);
  }
});

documentsRouter.get("/assets/employee/:employeeId", async (req, res, next) => {
  try {
    const targetEmployeeId = resolveEmployeeId(req.params.employeeId, req.user?.employeeId);
    const isOwner = targetEmployeeId === String(req.user!.employeeId ?? "");
    const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(req.user!.role);
    if (!isOwner && !isPrivileged) throw AppError.forbidden();
    res.json({ assets: await repo.listAssets(targetEmployeeId) });
  } catch (err) {
    next(err);
  }
});

documentsRouter.post(
  "/assets",
  isAdmin,
  validate(assignSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({ asset: await repo.assignAsset(req.body) });
    } catch (err) {
      next(err);
    }
  },
);

documentsRouter.patch(
  "/assets/:id/status",
  isAdmin,
  validate(assetStatusSchema),
  async (req, res, next) => {
    try {
      res.json({
        asset: await repo.updateAssetStatus(req.params.id, req.body.status),
      });
    } catch (err) {
      next(err);
    }
  },
);
