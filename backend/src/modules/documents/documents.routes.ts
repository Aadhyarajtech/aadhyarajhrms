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

documentsRouter.post("/employee/:employeeId", isAdmin, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw AppError.badRequest("Please attach a file.");
    const type = (req.body.type as string) || "OTHER";
    const document = await repo.addDocument({
      employeeId: req.params.employeeId,
      type,
      fileName: req.file.originalname,
      fileUrl: `${UPLOADS_PUBLIC_PATH}/${req.file.filename}`,
    });
    res.status(201).json({ document });
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

const assignSchema = z.object({
  employeeId: z.string(),
  assetTag: z.string().min(1),
  category: z.string().min(1),
  name: z.string().min(1),
});
documentsRouter.post("/assets", isAdmin, validate(assignSchema), async (req, res, next) => {
  try {
    res.status(201).json({ asset: await repo.assignAsset(req.body) });
  } catch (err) {
    next(err);
  }
});

const assetStatusSchema = z.object({ status: z.enum(["ASSIGNED", "RETURNED", "DAMAGED", "LOST"]) });
documentsRouter.patch("/assets/:id/status", isAdmin, validate(assetStatusSchema), async (req, res, next) => {
  try {
    res.json({ asset: await repo.updateAssetStatus(req.params.id, req.body.status) });
  } catch (err) {
    next(err);
  }
});
