import { Router } from "express";
import { z } from "zod";
import { upload, UPLOADS_PUBLIC_PATH } from "@/middleware/upload";
import { AppError } from "@/utils/errors";
import * as portalRepo from "./candidatePortal.repository";

export const candidatePortalRouter = Router();

const responseSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED"]),
});

const documentTypeSchema = z.object({
  type: z.string().min(2),
});

candidatePortalRouter.get("/:token", async (req, res, next) => {
  try {
    const candidate = await portalRepo.getCandidateByToken(req.params.token);
    if (!candidate)
      throw AppError.notFound("Candidate offer link is invalid or expired.");
    res.json({ candidate });
  } catch (err) {
    next(err);
  }
});

candidatePortalRouter.post("/:token/respond", async (req, res, next) => {
  try {
    const parsed = responseSchema.safeParse(req.body);
    if (!parsed.success)
      throw AppError.badRequest("A valid offer response is required.");

    const candidate = await portalRepo.respondToOfferByToken(
      req.params.token,
      parsed.data.status,
    );

    if (!candidate)
      throw AppError.notFound("Candidate offer link is invalid or expired.");

    res.json({
      message: `Offer ${parsed.data.status.toLowerCase()} successfully.`,
      candidate,
    });
  } catch (err) {
    next(err);
  }
});

candidatePortalRouter.post(
  "/:token/preboarding/documents/upload",
  upload.single("document"),
  async (req, res, next) => {
    try {
      const parsed = documentTypeSchema.safeParse(req.body);
      if (!parsed.success)
        throw AppError.badRequest("Document type is required.");
      if (!req.file)
        throw AppError.badRequest("Pre-boarding document is required.");

      const url = `${UPLOADS_PUBLIC_PATH}/${req.file.filename}`;
      const candidate = await portalRepo.addPreboardingDocumentByToken(
        req.params.token,
        parsed.data.type,
        url,
      );

      if (!candidate)
        throw AppError.notFound("Candidate offer link is invalid or expired.");

      res.status(201).json({
        message: "Pre-boarding document uploaded successfully.",
        candidate,
      });
    } catch (err) {
      next(err);
    }
  },
);
