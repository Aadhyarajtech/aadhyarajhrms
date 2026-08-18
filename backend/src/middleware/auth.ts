import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";
import type { AuthUser } from "@/types/express";
import { User } from "@/db/models";

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(
      AppError.unauthorized("Missing or malformed Authorization header"),
    );
  }

  const token = header.slice("Bearer ".length).trim();

  if (!token) {
    return next(AppError.unauthorized("Missing authentication token"));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthUser;

    const user = await User.findById(payload.userId).select("isActive");

    if (!user) {
      return next(AppError.unauthorized("User account not found"));
    }

    if (!user.isActive) {
      return next(
        AppError.unauthorized(
          "Your account is inactive or suspended. Please contact HR.",
        ),
      );
    }

    req.user = payload;
    next();
  } catch {
    next(
      AppError.unauthorized(
        "Invalid or expired session. Please sign in again.",
      ),
    );
  }
}

/** Optional auth: attaches req.user if a valid token is present, but never blocks the request. */
export function attachUserIfPresent(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice(7), env.jwtSecret) as AuthUser;
    } catch {
      /* ignore invalid token in optional context */
    }
  }
  next();
}
