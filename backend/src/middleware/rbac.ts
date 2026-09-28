import { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/errors";
import type { AuthUser } from "@/types/express";

/**
 * Restricts a route to one or more roles.
 * Use after `authenticate`.
 */
export function requireRole(...roles: AuthUser["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }

    if (!roles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `This action requires one of the following roles: ${roles.join(", ")}`
        )
      );
    }

    next();
  };
}

export const isAdmin = requireRole(
  "SUPER_ADMIN",
  "HR_ADMIN"
);

export const isAdminOrFinance = requireRole(
  "SUPER_ADMIN",
  "HR_ADMIN",
  "FINANCE"
);

export const isAdminOrRecruiter = requireRole(
  "SUPER_ADMIN",
  "HR_ADMIN",
  "RECRUITER"
);

export const isAdminOrRecruiterOrManager = requireRole(
  "SUPER_ADMIN",
  "HR_ADMIN",
  "RECRUITER",
  "MANAGER"
);

export function isManagerOrAbove(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user) return next(AppError.unauthorized());
  if (
    req.user.role === "SUPER_ADMIN" ||
    req.user.role === "HR_ADMIN" ||
    req.user.role === "MANAGER" ||
    req.user.isManager
  ) {
    return next();
  }
  return next(
    AppError.forbidden(
      "This action requires an administrator or an employee marked as a manager.",
    ),
  );
}
