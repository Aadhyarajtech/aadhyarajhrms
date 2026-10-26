
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 10);
    cb(
      null,
      `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`,
    );
  },
});

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/**
 * Private document storage.
 *
 * Local development keeps the existing project-relative directory.
 * In production, set DOCUMENT_STORAGE_DIR to a persistent mounted directory,
 * e.g. /var/data/documents when a Render disk is mounted at /var/data.
 *
 * IMPORTANT: This directory is only persistent if the configured path is
 * actually on a persistent disk. An ordinary Render filesystem path is not.
 */
const PRIVATE_DOCUMENT_DIR = process.env.DOCUMENT_STORAGE_DIR
  ? path.resolve(process.env.DOCUMENT_STORAGE_DIR)
  : path.join(process.cwd(), "private-uploads", "documents");

if (!fs.existsSync(PRIVATE_DOCUMENT_DIR)) {
  fs.mkdirSync(PRIVATE_DOCUMENT_DIR, { recursive: true });
}

const privateDocumentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PRIVATE_DOCUMENT_DIR),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 10);
    cb(
      null,
      `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${safeExt}`,
    );
  },
});

export const privateDocumentUpload = multer({
  storage: privateDocumentStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(
        new Error(
          "Unsupported file type. Please upload a PDF, Word document, or image.",
        ),
      );
    }

    cb(null, true);
  },
});

export const PRIVATE_DOCUMENT_DIR_ABSOLUTE = PRIVATE_DOCUMENT_DIR;

// Dedicated upload middleware for sensitive profile change proof.
// This folder is not served through the public /uploads static route.
const SENSITIVE_PROOF_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export const sensitiveChangeProofUpload = multer({
  storage: privateDocumentStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!SENSITIVE_PROOF_MIME.has(file.mimetype)) {
      return cb(
        new Error("Only PDF, JPG, and PNG supporting documents are allowed."),
      );
    }

    cb(null, true);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(
        new Error(
          "Unsupported file type. Please upload a PDF, Word document, or image.",
        ),
      );
    }

    cb(null, true);
  },
});

export const UPLOADS_PUBLIC_PATH = "/uploads";

const PROFILE_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const profileImageUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!PROFILE_IMAGE_MIME.has(file.mimetype)) {
      return cb(
        new Error(
          "Invalid profile image. Please upload a PNG, JPEG, or WebP image.",
        ),
      );
    }

    cb(null, true);
  },
});

export const UPLOAD_DIR_ABSOLUTE = UPLOAD_DIR;
export { UPLOAD_DIR };
