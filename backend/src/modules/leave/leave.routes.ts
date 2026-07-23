import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isManagerOrAbove } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import * as repo from "./leave.repository";
import { getEmployeeById } from "@/modules/employees/employees.repository";
import { notify } from "@/modules/notifications/notifications.repository";

export const leaveRouter = Router();
leaveRouter.use(authenticate);

leaveRouter.get("/types", async (_req, res, next) => {
  try {
    res.json({ leaveTypes: await repo.listLeaveTypes() });
  } catch (err) {
    next(err);
  }
});

leaveRouter.get("/balances", async (req, res, next) => {
  try {
    const employeeId = (req.query.employeeId as string) || req.user!.employeeId!;
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    res.json({ balances: await repo.listBalancesForEmployee(employeeId, year) });
  } catch (err) {
    next(err);
  }
});

leaveRouter.get("/requests", async (req, res, next) => {
  try {
    const { role, employeeId } = req.user!;
    const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN"].includes(role);
    const filters: any = { status: req.query.status as string | undefined };

    if (req.query.scope === "team" && employeeId) {
      filters.approverId = employeeId;
    } else if (!isPrivileged) {
      filters.employeeId = employeeId;
    } else if (req.query.employeeId) {
      filters.employeeId = req.query.employeeId;
    }

    res.json({ requests: await repo.listRequests(filters) });
  } catch (err) {
    next(err);
  }
});

leaveRouter.get("/calendar", async (req, res, next) => {
  try {
    const now = new Date();
    const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();
    res.json({ entries: await repo.getLeaveCalendar(month, year) });
  } catch (err) {
    next(err);
  }
});

leaveRouter.get("/summary/on-leave-today", async (_req, res, next) => {
  try {
    res.json({ count: await repo.onLeaveToday() });
  } catch (err) {
    next(err);
  }
});

const createRequestSchema = z.object({
  leaveTypeId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().min(3, "Please add a short reason for this leave."),
});

leaveRouter.post("/requests", validate(createRequestSchema), async (req, res, next) => {
  try {
    if (!req.user!.employeeId) throw AppError.forbidden("Only employees can apply for leave.");
    const request = await repo.createRequest({ employeeId: req.user!.employeeId, ...req.body });

    const employee = (await getEmployeeById(req.user!.employeeId)) as any;
    if (employee?.managerId) {
      const manager = (await getEmployeeById(employee.managerId)) as any;
      if (manager) {
        await notify({
          userId: manager.userId,
          type: "LEAVE_REQUEST",
          title: "New leave request to review",
          message: `${employee.firstName} ${employee.lastName} requested ${request.totalDays} day(s) of leave.`,
          link: "/leave?tab=team",
        });
      }
    }

    res.status(201).json({ request });
  } catch (err) {
    next(err);
  }
});

const decisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  decisionNote: z.string().optional(),
});

leaveRouter.post("/requests/:id/decide", isManagerOrAbove, validate(decisionSchema), async (req, res, next) => {
  try {
    const request = await repo.decideRequest(req.params.id, req.user!.employeeId!, req.body.status, req.body.decisionNote);
    if (!request) throw AppError.notFound("Leave request not found.");

    const employee = (await getEmployeeById((request as any).employeeId)) as any;
    if (employee) {
      await notify({
        userId: employee.userId,
        type: "LEAVE_DECISION",
        title: `Your leave request was ${req.body.status.toLowerCase()}`,
        message: req.body.decisionNote || `Your request for ${(request as any).totalDays} day(s) was ${req.body.status.toLowerCase()}.`,
        link: "/leave",
      });
    }

    res.json({ request });
  } catch (err) {
    next(err);
  }
});

leaveRouter.post("/requests/:id/cancel", async (req, res, next) => {
  try {
    const request = await repo.cancelRequest(req.params.id, req.user!.employeeId!);
    res.json({ request });
  } catch (err) {
    next(err);
  }
});
