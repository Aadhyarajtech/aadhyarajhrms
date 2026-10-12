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

    // Manager is a capability derived from Employee.isManager/reporting lines,
    // not a separately assignable business role. Keep legacy routes working by
    // interpreting a requested MANAGER gate as the manager capability.
    const requestsManagerCapability = roles.includes("MANAGER" as AuthUser["role"]);
    const roleAllowed = req.user.role !== "MANAGER" && roles.includes(req.user.role);
    const managerCapabilityAllowed = requestsManagerCapability && req.user.isManager === true;
    if (!roleAllowed && !managerCapabilityAllowed) {
      return next(
        AppError.forbidden(
          `This action requires one of the following roles or an authorized reporting-manager capability: ${roles.join(", ")}`
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

export function isAdminOrRecruiterOrManager(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user) return next(AppError.unauthorized());
  if (["SUPER_ADMIN", "HR_ADMIN", "RECRUITER"].includes(req.user.role) || req.user.isManager) {
    return next();
  }
  return next(AppError.forbidden("This action requires an administrator, recruiter, or reporting manager."));
}

export function isManagerOrAbove(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user) return next(AppError.unauthorized());
  if (
    req.user.role === "SUPER_ADMIN" ||
    req.user.role === "HR_ADMIN" ||
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
