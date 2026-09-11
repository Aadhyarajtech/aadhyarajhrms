import { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/errors";
import { hasPermission } from "@/modules/governance/governance.repository";

/**
 * Permission-based authorization. Super Admin is always allowed.
 * A manage permission also satisfies the corresponding view permission.
 */
export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const allowed = await hasPermission(req.user.role, permission);
      if (!allowed) {
        return next(AppError.forbidden(`Missing permission: ${permission}`));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAnyPermission(...permissions: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      for (const permission of permissions) {
        if (await hasPermission(req.user.role, permission)) return next();
      }
      return next(
        AppError.forbidden(
          "You do not have permission to perform this action.",
        ),
      );
    } catch (err) {
      next(err);
    }
  };
}
