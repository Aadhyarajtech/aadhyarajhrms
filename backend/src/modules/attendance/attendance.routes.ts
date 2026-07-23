import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isManagerOrAbove } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import * as repo from "./attendance.repository";

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

attendanceRouter.get("/today", async (req, res, next) => {
  try {
    if (!req.user!.employeeId) return res.json({ record: null });
    res.json({ record: (await repo.getTodayRecord(req.user!.employeeId)) ?? null });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.post("/check-in", async (req, res, next) => {
  try {
    if (!req.user!.employeeId) throw AppError.forbidden("Only employees can check in.");
    res.json({ record: await repo.checkIn(req.user!.employeeId) });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.post("/check-out", async (req, res, next) => {
  try {
    if (!req.user!.employeeId) throw AppError.forbidden("Only employees can check out.");
    const record = await repo.checkOut(req.user!.employeeId);
    if (!record) throw AppError.badRequest("You need to check in before you can check out.");
    res.json({ record });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get("/me", async (req, res, next) => {
  try {
    const month = req.query.month ? Number(req.query.month) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;
    res.json({ records: await repo.listForEmployee(req.user!.employeeId!, month, year) });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get("/employee/:employeeId", isManagerOrAbove, async (req, res, next) => {
  try {
    const month = req.query.month ? Number(req.query.month) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;
    res.json({ records: await repo.listForEmployee(req.params.employeeId, month, year) });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get("/by-date/:date", isManagerOrAbove, async (req, res, next) => {
  try {
    res.json({ records: await repo.listForDate(req.params.date) });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get("/summary/today", async (_req, res, next) => {
  try {
    res.json(await repo.getTodaySummary());
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get("/analytics/trend", isManagerOrAbove, async (req, res, next) => {
  try {
    const months = req.query.months ? Number(req.query.months) : 6;
    res.json({ data: await repo.getMonthlyAttendanceTrend(months) });
  } catch (err) {
    next(err);
  }
});

const regularizationSchema = z.object({
  date: z.string(),
  note: z.string().min(3, "Please describe the reason for regularization."),
});

attendanceRouter.post("/regularize", validate(regularizationSchema), async (req, res, next) => {
  try {
    if (!req.user!.employeeId) throw AppError.forbidden();
    const { date, note } = req.body as z.infer<typeof regularizationSchema>;
    res.json({ record: await repo.requestRegularization(req.user!.employeeId, date, note) });
  } catch (err) {
    next(err);
  }
});
