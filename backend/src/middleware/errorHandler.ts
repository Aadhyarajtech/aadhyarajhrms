import { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/errors";
import { logger } from "@/utils/logger";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { message: `No route matches ${req.method} ${req.path}` } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error(err.message, { stack: err.stack });
    return res.status(err.statusCode).json({ error: { message: err.message, details: err.details } });
  }

  const message = err instanceof Error ? err.message : "Unexpected error";
  logger.error("Unhandled error", { message, path: req.path, stack: err instanceof Error ? err.stack : undefined });

  const mongoCode = (err as { code?: number } | null)?.code;
  if (mongoCode === 11000 || message.includes("E11000") || message.includes("UNIQUE constraint failed")) {
    return res.status(409).json({ error: { message: "A record with this value already exists." } });
  }

  res.status(500).json({ error: { message: "Something went wrong on our end. Please try again." } });
}
