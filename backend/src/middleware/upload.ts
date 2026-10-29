
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { storeGridFsFile, deleteGridFsFile } from "../services/gridfsStorage.service";

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

const PRIVATE_DOCUMENT_DIR = path.join(
  process.cwd(),
  "private-uploads",
  "documents",
);

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

const persistentGridFsStorage: multer.StorageEngine = {
  _handleFile(_req, file, callback) {
    const chunks: Buffer[] = [];
    file.stream.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    file.stream.on("error", callback);
    file.stream.on("end", () => {
      void storeGridFsFile({
        buffer: Buffer.concat(chunks),
        filename: file.originalname,
        contentType: file.mimetype,
        category: "general",
      }).then((stored) => callback(null, { filename: stored.id, size: stored.length }))
        .catch(callback);
    });
  },
  _removeFile(_req, file, callback) {
    void deleteGridFsFile(String(file.filename || "")).then(() => callback(null)).catch(callback);
  },
};

export const upload = multer({
  storage: persistentGridFsStorage,
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

// Persistent-storage uploads use memoryStorage so uploaded bytes can be written
// directly to MongoDB GridFS instead of Render's ephemeral filesystem.
const memoryStorage = multer.memoryStorage();
const persistentFileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error("Unsupported file type. Please upload a PDF, Word document, or image."));
  }
  cb(null, true);
};

export const ticketAttachmentUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: persistentFileFilter,
});

export const candidateResumeUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.mimetype)) {
      return cb(new Error("Resume must be a PDF, DOC, or DOCX file."));
    }
    cb(null, true);
  },
});

export const persistentProfileImageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!PROFILE_IMAGE_MIME.has(file.mimetype)) {
      return cb(new Error("Invalid profile image. Please upload a PNG, JPEG, or WebP image."));
    }
    cb(null, true);
  },
});

// Kept for documents.routes.ts compatibility in deployments that use the
// GridFS-based document upload route. Its handler receives file.buffer.
export const documentsGridFsUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: persistentFileFilter,
});

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
