import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";
import type { AuthUser } from "@/types/express";
import { User } from "@/db/models";

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

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

  const token = getBearerToken(req);

  if (!token) {
    return next(AppError.unauthorized("Missing authentication token"));
  }

  let payload: AuthUser;

  try {
    const decoded = jwt.verify(token, env.jwtSecret);

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof (decoded as JwtPayload).userId !== "string" ||
      !(decoded as JwtPayload).userId
    ) {
      return next(AppError.unauthorized("Invalid authentication token"));
    }

    payload = decoded as AuthUser;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(
        AppError.unauthorized(
          "Authentication token has expired. Please sign in again.",
        ),
      );
    }

    if (err instanceof jwt.JsonWebTokenError) {
      return next(
        AppError.unauthorized(
          "Invalid authentication token. Please sign in again.",
        ),
      );
    }

    return next(AppError.unauthorized("Unable to verify authentication token"));
  }

  try {
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
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Optional auth: attaches req.user if a valid token is present, but never blocks the request. */
export function attachUserIfPresent(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const token = getBearerToken(req);

  if (token) {
    try {
      const decoded = jwt.verify(token, env.jwtSecret);

      if (
        typeof decoded === "object" &&
        decoded !== null &&
        typeof (decoded as JwtPayload).userId === "string"
      ) {
        req.user = decoded as AuthUser;
      }
    } catch {
      /* ignore invalid token in optional context */
    }
  }

  next();
}
