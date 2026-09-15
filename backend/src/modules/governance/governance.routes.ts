import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { requirePermission } from "@/middleware/permissions";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import { GOVERNANCE_ROLES } from "./governance.model";
import * as repo from "./governance.repository";

export const governanceRouter = Router();
governanceRouter.use(authenticate);

const governanceAdmin = requirePermission("governance.manage");

governanceRouter.get("/", governanceAdmin, async (_req, res, next) => {
  try {
    res.json(await repo.getGovernance());
  } catch (err) {
    next(err);
  }
});

governanceRouter.get("/me", async (req, res, next) => {
  try {
    const permissions = await repo.getRolePermissions(req.user!.role);
    res.json({ role: req.user!.role, permissions });
  } catch (err) {
    next(err);
  }
});

const roleSchema = z.object({
  permissions: z.array(z.string()).max(100),
});

governanceRouter.patch(
  "/roles/:role",
  governanceAdmin,
  validate(roleSchema),
  async (req, res, next) => {
    try {
      const role = req.params.role.toUpperCase();
      if (!GOVERNANCE_ROLES.includes(role as any))
        throw AppError.badRequest("Invalid role.");
      const updated = await repo.updateRole(
        role,
        req.body.permissions,
        req.user!.userId,
      );
      if (!updated) throw AppError.notFound("Role configuration not found.");
      res.json({ role: updated });
    } catch (err) {
      next(err);
    }
  },
);

const policiesSchema = z.object({
  updates: z
    .array(
      z.object({
        key: z.string(),
        value: z.union([z.boolean(), z.number(), z.string()]),
      }),
    )
    .max(50),
});

governanceRouter.patch(
  "/policies",
  governanceAdmin,
  validate(policiesSchema),
  async (req, res, next) => {
    try {
      const policies = await repo.updatePolicies(
        req.body.updates,
        req.user!.userId,
      );
      res.json({ policies });
    } catch (err) {
      next(err);
    }
  },
);
