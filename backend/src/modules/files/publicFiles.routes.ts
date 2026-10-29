import { Router } from "express";
import { findGridFsFile, streamGridFsFile } from "@/services/gridfsStorage.service";

export const publicFilesRouter = Router();

// Profile photos were previously served from the public /uploads directory.
// Keep the same visibility while storing the actual bytes in MongoDB GridFS.
publicFilesRouter.get("/avatars/:id", async (req, res, next) => {
  try {
    const file = await findGridFsFile(req.params.id);
    if (!file || file.metadata?.category !== "avatar") {
      return res.status(404).json({ error: { message: "Profile image not found." } });
    }
    res.setHeader("Content-Type", file.contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=300");
    streamGridFsFile(req.params.id, res);
  } catch (error) { next(error); }
});

// Candidate resume URLs were already public /uploads URLs in the current app.
// Keep URL compatibility for existing UI links while moving file bytes to GridFS.
publicFilesRouter.get("/resumes/:id", async (req, res, next) => {
  try {
    const file = await findGridFsFile(req.params.id);
    if (!file || file.metadata?.category !== "resume") {
      return res.status(404).json({ error: { message: "Resume not found." } });
    }
    const safeName = String(file.filename || "resume").replace(/[^a-zA-Z0-9._ -]/g, "_");
    res.setHeader("Content-Type", file.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    streamGridFsFile(req.params.id, res);
  } catch (error) { next(error); }
});
