import { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/errors";
import { logger } from "@/utils/logger";

export function notFoundHandler(req: Request, res: Response) {
  logger.warn("Route not found", {
    method: req.method,
    path: req.originalUrl || req.path,
  });

  return res.status(404).json({
    error: {
      message: `No route matches ${req.method} ${req.path}`,
    },
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const authenticatedUser = (
    req as Request & {
      user?: { id?: string; _id?: string };
    }
  ).user;

  const requestInfo = {
    method: req.method,
    path: req.originalUrl || req.path,
    userId: authenticatedUser?.id ?? authenticatedUser?._id,
  };

  if (err instanceof AppError) {
    const errorInfo = {
      ...requestInfo,
      statusCode: err.statusCode,
      message: err.message,
      details: err.details,
    };

    if (err.statusCode >= 500) {
      logger.error("Handled application error", {
        ...errorInfo,
        stack: err.stack,
      });
    } else {
      logger.warn("Request rejected", errorInfo);
    }

    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        details: err.details,
      },
    });
  }

  const message =
    err instanceof Error ? err.message : "Unexpected error";

  const mongoCode = (err as { code?: number } | null)?.code;

  logger.error("Unhandled error", {
    ...requestInfo,
    message,
    mongoCode,
    stack: err instanceof Error ? err.stack : undefined,
  });

  if (
    mongoCode === 11000 ||
    message.includes("E11000") ||
    message.includes("UNIQUE constraint failed")
  ) {
    return res.status(409).json({
      error: {
        message: "A record with this value already exists.",
      },
    });
  }

  return res.status(500).json({
    error: {
      message: "Something went wrong on our end. Please try again.",
    },
  });
}