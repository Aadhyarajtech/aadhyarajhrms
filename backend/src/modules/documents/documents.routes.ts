import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isAdmin } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { upload, UPLOADS_PUBLIC_PATH } from "@/middleware/upload";
import { AppError } from "@/utils/errors";
import * as repo from "./documents.repository";

export const documentsRouter = Router();
documentsRouter.use(authenticate);

// --- Document types -----------------------------------------------------
// Mirrors DocumentRecordType in db/models.ts exactly. Kept in two groups so
// requests can be validated against the correct direction: employees are
// only ever asked for the "employee-provided" set, and can only ever
// request the "company-issued" set back from HR.
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
// Only these roles process EMPLOYEE_TO_COMPANY requests, matching the
// recipient list the repository already notifies when such a request is
// created.
const COMPANY_PROCESSOR_ROLES = ["SUPER_ADMIN", "HR_ADMIN"];

// --- Schemas ---
const directUploadTypeSchema = z.enum(ALL_DOC_TYPES);

const documentRequestSchema = z.object({
  // Only required/used when a privileged user is requesting a document
  // from an employee. Ignored for employee-originated requests: the
  // employee's own id is always derived from the authenticated session.
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
    const isOwner = req.params.employeeId === req.user!.employeeId;
    const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(req.user!.role);
    if (!isOwner && !isPrivileged) throw AppError.forbidden();
    res.json({ documents: await repo.listDocuments(req.params.employeeId) });
  } catch (err) {
    next(err);
  }
});

documentsRouter.post(
  "/employee/:employeeId",
  upload.single("file"),
  async (req, res, next) => {
    try {
      const employeeId = req.params.employeeId;
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
        if (request.employeeId !== employeeId) {
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
          // Only the employee the document was requested from may fulfil it.
          const isOwner = employeeId === req.user!.employeeId;
          if (!isOwner) throw AppError.forbidden();
        } else {
          // EMPLOYEE_TO_COMPANY: only HR/company users may fulfil it.
          const isProcessor = COMPANY_PROCESSOR_ROLES.includes(req.user!.role);
          if (!isProcessor) throw AppError.forbidden();
        }

        // The type is intentionally taken from the request by the
        // repository, not from this payload, so it cannot be overridden.
        const { document } = await repo.fulfillDocumentRequest({
          requestId,
          fileName: req.file.originalname,
          fileUrl: `${UPLOADS_PUBLIC_PATH}/${req.file.filename}`,
          uploadedByUserId: req.user!.userId,
        });
        res.status(201).json({ document });
        return;
      }

      // --- Normal, non-request-based upload ---
      const isOwner = employeeId === req.user!.employeeId;
      const isAdminPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(
        req.user!.role,
      );
      let isAuthorized = isOwner || isAdminPrivileged;
      // A MANAGER may give (upload) a document to an employee only if that
      // employee is assigned to them (Employee.managerId === their id).
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

      const document = await repo.addDocument({
        employeeId,
        uploadedBy: req.user!.userId,
        requestId: null,
        type,
        fileName: req.file.originalname,
        fileUrl: `${UPLOADS_PUBLIC_PATH}/${req.file.filename}`,
      });
      res.status(201).json({ document });
    } catch (error) {
      next(error);
    }
  },
);

documentsRouter.delete("/:id", isAdmin, async (req, res, next) => {
  try {
    await repo.deleteDocument(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

documentsRouter.patch(
  "/:id/review",
  validate(documentReviewSchema),
  async (req, res, next) => {
    try {
      const isReviewer = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"].includes(
        req.user!.role,
      );
      if (!isReviewer) {
        throw AppError.forbidden();
      }
      if (req.body.status === "REJECTED" && !req.body.rejectionReason) {
        throw AppError.badRequest("Rejection reason is required.");
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
      // Direction is decided by whether an employeeId was actually sent,
      // not by role alone: SUPER_ADMIN/HR_ADMIN/MANAGER are also employees
      // and use this same endpoint (via "New request") to ask the company
      // for their own documents, sending no employeeId at all. Branching on
      // role first would wrongly force that self-request down the
      // COMPANY_TO_EMPLOYEE path and demand an employeeId it never has.
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
        // A MANAGER may only request documents from employees assigned to
        // them; SUPER_ADMIN/HR_ADMIN can request from anyone.
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
        // The target employee is always the authenticated user's own
        // employee record. Any employeeId supplied in the request body is
        // ignored so an employee can never request on behalf of someone
        // else.
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
      const isOwner = req.params.employeeId === req.user!.employeeId;
      const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(req.user!.role);
      if (!isOwner && !isPrivileged) throw AppError.forbidden();
      res.json({
        requests: await repo.listDocumentRequestsForEmployee(
          req.params.employeeId,
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
    const isOwner = req.params.employeeId === req.user!.employeeId;
    const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(req.user!.role);
    if (!isOwner && !isPrivileged) throw AppError.forbidden();
    res.json({ assets: await repo.listAssets(req.params.employeeId) });
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