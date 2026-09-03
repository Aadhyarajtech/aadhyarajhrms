import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import { isManagerOrAbove } from "@/middleware/rbac";
import * as repo from "./reports.repository";

export const reportsRouter = Router();
reportsRouter.use(authenticate, isManagerOrAbove);

reportsRouter.get("/overview", async (req, res, next) => {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const departmentId = typeof req.query.departmentId === "string" ? req.query.departmentId : undefined;
    const data = await repo.getReports({ from, to, departmentId }, req.user!.role, req.user!.employeeId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});
