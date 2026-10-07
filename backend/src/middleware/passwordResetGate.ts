
import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { env } from "@/config/env";
import { User } from "@/db/models";

export async function requirePasswordResetComplete(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authorization = req.headers.authorization;

    // Let the route's own authentication middleware handle missing tokens.
    if (!authorization?.startsWith("Bearer ")) {
      return next();
    }

    const token = authorization.slice("Bearer ".length).trim();

    if (!token) {
      return next();
    }

    let decoded: string | JwtPayload;

    try {
      decoded = jwt.verify(token, env.jwtSecret);
    } catch {
      // The route's own authentication middleware will reject invalid tokens.
      return next();
    }

    if (
      typeof decoded === "string" ||
      typeof decoded.userId !== "string"
    ) {
      return next();
    }

    const user = await User.findById(decoded.userId)
      .select("mustResetPwd isActive")
      .lean();

    if (!user || !user.isActive) {
      return next();
    }

    if (user.mustResetPwd) {
      return res.status(403).json({
        error: {
          code: "PASSWORD_RESET_REQUIRED",
          message: "Please change your temporary password to continue.",
        },
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}