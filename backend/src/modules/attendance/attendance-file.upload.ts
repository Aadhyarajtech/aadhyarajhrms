import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

export const ATTENDANCE_FILES_DIR = path.join(
    process.cwd(),
    "private-uploads",
    "attendance",
);

fs.mkdirSync(ATTENDANCE_FILES_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set([".xlsx", ".xls", ".csv"]);

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, ATTENDANCE_FILES_DIR);
    },
    filename: (_req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        cb(
            null,
            `${Date.now()}-${crypto.randomBytes(16).toString("hex")}${extension}`,
        );
    },
});

export const attendanceFileUpload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
    },
    fileFilter: (_req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();

        if (!ALLOWED_EXTENSIONS.has(extension)) {
            return cb(
                new Error("Only XLSX, XLS, and CSV files are allowed."),
            );
        }

        cb(null, true);
    },
});
