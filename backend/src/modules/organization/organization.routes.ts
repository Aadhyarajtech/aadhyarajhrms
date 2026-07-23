import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isAdmin } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import * as repo from "./organization.repository";

export const organizationRouter = Router();
organizationRouter.use(authenticate);

organizationRouter.get("/departments", async (_req, res, next) => {
  try {
    res.json({ departments: await repo.listDepartments() });
  } catch (err) {
    next(err);
  }
});

const departmentSchema = z.object({
  name: z.string().min(2, "Department name is required."),
  code: z.string().min(2).max(10),
  description: z.string().optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

organizationRouter.post("/departments", isAdmin, validate(departmentSchema), async (req, res, next) => {
  try {
    res.status(201).json({ department: await repo.createDepartment(req.body) });
  } catch (err) {
    next(err);
  }
});

const updateDepartmentSchema = departmentSchema.partial().extend({ headId: z.string().nullable().optional() });

organizationRouter.patch("/departments/:id", isAdmin, validate(updateDepartmentSchema), async (req, res, next) => {
  try {
    const dept = await repo.updateDepartment(req.params.id, req.body);
    if (!dept) throw AppError.notFound("Department not found.");
    res.json({ department: dept });
  } catch (err) {
    next(err);
  }
});

organizationRouter.get("/designations", async (req, res, next) => {
  try {
    res.json({ designations: await repo.listDesignations(req.query.departmentId as string | undefined) });
  } catch (err) {
    next(err);
  }
});

const designationSchema = z.object({
  title: z.string().min(2),
  level: z.number().int().min(1).max(10),
  departmentId: z.string(),
});

organizationRouter.post("/designations", isAdmin, validate(designationSchema), async (req, res, next) => {
  try {
    res.status(201).json({ designation: await repo.createDesignation(req.body) });
  } catch (err) {
    next(err);
  }
});

organizationRouter.get("/holidays", async (req, res, next) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    res.json({ holidays: await repo.listHolidays(year) });
  } catch (err) {
    next(err);
  }
});

const holidaySchema = z.object({
  name: z.string().min(2),
  date: z.string(), // YYYY-MM-DD
  isOptional: z.boolean().optional(),
});

organizationRouter.post("/holidays", isAdmin, validate(holidaySchema), async (req, res, next) => {
  try {
    res.status(201).json({ holiday: await repo.createHoliday(req.body) });
  } catch (err) {
    next(err);
  }
});

organizationRouter.delete("/holidays/:id", isAdmin, async (req, res, next) => {
  try {
    await repo.deleteHoliday(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
