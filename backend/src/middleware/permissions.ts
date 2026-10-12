import { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/errors";
import { hasPermission } from "@/modules/governance/governance.repository";
import { isRecruitmentHeadEmail } from "@/modules/recruitment/requisitionApprovalAccess";

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


/**
 * Requisition approval route guard. The two explicitly designated recruitment
 * heads may approve/reject while remaining RECRUITERs. Other users must have
 * the normal recruitment.manage permission; the repository performs a second,
 * user-specific authorization check before changing requisition state.
 */
export function requireRequisitionApprovalPermission() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());

      const isRecruitmentHead =
        req.user.role === "RECRUITER" &&
        isRecruitmentHeadEmail(req.user.email);

      if (isRecruitmentHead) return next();

      const allowed = await hasPermission(req.user.role, "recruitment.manage");
      if (!allowed) {
        return next(AppError.forbidden("Missing permission: recruitment.manage"));
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


/**
 * Permission check used by manager workspaces. A user who is explicitly
 * configured as a manager can use the manager-specific action even when
 * their business role is FINANCE, IT_SUPPORT, RECRUITER, or EMPLOYEE.
 */
export function requirePermissionOrManager(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      if (req.user.isManager) return next();
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
