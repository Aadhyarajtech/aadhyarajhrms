import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isAdmin, isAdminOrFinance } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import * as repo from "./payroll.repository";

export const payrollRouter = Router();
payrollRouter.use(authenticate);

payrollRouter.get(
  "/salary-structure/:employeeId",
  isAdminOrFinance,
  async (req, res, next) => {
    try {
      res.json({
        structure:
          (await repo.getSalaryStructure(req.params.employeeId)) ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

const structureSchema = z.object({
  employeeId: z.string(),
  ctc: z.number().nonnegative().optional(),
  basicPercentage: z.number().min(40).max(50).optional(),
  hraPercentage: z.number().min(20).max(40).optional(),
  basic: z.number().min(0),
  hra: z.number().min(0),
  conveyance: z.number().min(0),
  medical: z.number().min(0),
  specialAllowance: z.number().min(0),
  performanceBonus: z.number().min(0).optional(),
  advanceRecovery: z.number().min(0).optional(),
  overtimeRate: z.number().min(0).optional(),
  pf: z.number().min(0).optional(),
  professionalTax: z.number().min(0).optional(),
  incomeTax: z.number().min(0).optional(),
  taxRegime: z.enum(["NEW", "OLD"]).optional(),
  taxYear: z.number().int().min(2020).optional(),
  taxOtherIncome: z.number().min(0).optional(),
  taxHraExemption: z.number().min(0).optional(),
  taxDeduction80C: z.number().min(0).optional(),
  taxDeduction80D: z.number().min(0).optional(),
  taxDeduction80CCD1B: z.number().min(0).optional(),
  taxDeduction80TTA: z.number().min(0).optional(),
  taxPreviousTds: z.number().min(0).optional(),
});

const taxPreviewSchema = structureSchema.pick({
  employeeId: true,
  basic: true,
  hra: true,
  conveyance: true,
  medical: true,
  specialAllowance: true,
  performanceBonus: true,
  taxRegime: true,
  taxYear: true,
  taxOtherIncome: true,
  taxHraExemption: true,
  taxDeduction80C: true,
  taxDeduction80D: true,
  taxDeduction80CCD1B: true,
  taxDeduction80TTA: true,
});

payrollRouter.post(
  "/tax-preview",
  isAdmin,
  validate(taxPreviewSchema),
  async (req, res, next) => {
    try {
      res.json({ tax: await repo.previewTax(req.body) });
    } catch (err) {
      next(err);
    }
  },
);

payrollRouter.put(
  "/salary-structure",
  isAdmin,
  validate(structureSchema),
  async (req, res, next) => {
    try {
      res.json({ structure: await repo.upsertSalaryStructure(req.body) });
    } catch (err) {
      next(err);
    }
  },
);

payrollRouter.get("/runs", isAdminOrFinance, async (_req, res, next) => {
  try {
    res.json({ runs: await repo.listPayrollRuns() });
  } catch (err) {
    next(err);
  }
});

const processSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
});
payrollRouter.post(
  "/runs/lock-attendance",
  isAdminOrFinance,
  validate(processSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({
        run: await repo.lockAttendanceForPayroll(req.body.month, req.body.year),
      });
    } catch (err) {
      next(err);
    }
  },
);

payrollRouter.post(
  "/runs/process",
  isAdminOrFinance,
  validate(processSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({
        run: await repo.processPayrollRun(req.body.month, req.body.year),
      });
    } catch (err) {
      next(err);
    }
  },
);

payrollRouter.post(
  "/runs/:id/submit-review",
  isAdminOrFinance,
  async (req, res, next) => {
    try {
      res.json({
        run: await repo.submitPayrollForReview(req.params.id, req.user!.userId),
      });
    } catch (err) {
      next(err);
    }
  },
);

payrollRouter.post(
  "/runs/:id/approve",
  isAdminOrFinance,
  async (req, res, next) => {
    try {
      res.json({
        run: await repo.approvePayrollRun(req.params.id, req.user!.userId),
      });
    } catch (err) {
      next(err);
    }
  },
);

payrollRouter.post(
  "/runs/:id/mark-paid",
  isAdminOrFinance,
  async (req, res, next) => {
    try {
      res.json({
        run: await repo.markRunPaid(req.params.id, req.user!.userId),
      });
    } catch (err) {
      next(err);
    }
  },
);

payrollRouter.post(
  "/runs/:id/send-payslips",
  isAdminOrFinance,
  async (req, res, next) => {
    try {
      res.json({
        run: await repo.sendPayslipsForRun(req.params.id, req.user!.userId),
      });
    } catch (err) {
      next(err);
    }
  },
);

payrollRouter.get(
  "/runs/:id/payslips",
  isAdminOrFinance,
  async (req, res, next) => {
    try {
      res.json({ payslips: await repo.listPayslipsForRun(req.params.id) });
    } catch (err) {
      next(err);
    }
  },
);

payrollRouter.get("/payslips/mine", async (req, res, next) => {
  try {
    if (!req.user!.employeeId) throw AppError.forbidden();
    res.json({
      payslips: await repo.listPayslipsForEmployee(req.user!.employeeId),
    });
  } catch (err) {
    next(err);
  }
});

payrollRouter.get(
  "/payslips/employee/:employeeId",
  isAdminOrFinance,
  async (req, res, next) => {
    try {
      res.json({
        payslips: await repo.listPayslipsForEmployee(req.params.employeeId),
      });
    } catch (err) {
      next(err);
    }
  },
);

payrollRouter.get("/payslips/:id", async (req, res, next) => {
  try {
    const payslip = (await repo.getPayslip(req.params.id)) as any;
    if (!payslip) throw AppError.notFound("Payslip not found.");
    const isOwner = payslip.employeeId === req.user!.employeeId;
    const isPrivileged = ["SUPER_ADMIN", "HR_ADMIN", "FINANCE"].includes(
      req.user!.role,
    );
    if (isOwner && payslip.runStatus !== "PAID" && !isPrivileged)
      throw AppError.forbidden();
    if (!isOwner && !isPrivileged) throw AppError.forbidden();
    res.json({ payslip });
  } catch (err) {
    next(err);
  }
});

payrollRouter.get(
  "/analytics/cost-trend",
  isAdminOrFinance,
  async (req, res, next) => {
    try {
      const months = req.query.months ? Number(req.query.months) : 6;
      res.json({ data: await repo.getCostTrend(months) });
    } catch (err) {
      next(err);
    }
  },
);

// --- Payslip requests ---------------------------------------------------------
// Period/status validated against fixed enums; employeeId is always derived
// from the authenticated user, never trusted from the request body.

const payslipRequestSchema = z.object({
  period: z.enum(["3_MONTHS", "6_MONTHS", "12_MONTHS"]),
});

payrollRouter.post(
  "/payslip-requests",
  validate(payslipRequestSchema),
  async (req, res, next) => {
    try {
      if (!req.user!.employeeId) throw AppError.forbidden();
      const request = await repo.createPayslipRequest(
        req.user!.employeeId,
        req.user!.userId,
        req.body.period,
      );
      res.status(201).json({ request });
    } catch (err) {
      next(err);
    }
  },
);

payrollRouter.get("/payslip-requests/mine", async (req, res, next) => {
  try {
    if (!req.user!.employeeId) throw AppError.forbidden();
    res.json({
      requests: await repo.listMyPayslipRequests(req.user!.employeeId),
    });
  } catch (err) {
    next(err);
  }
});

payrollRouter.get("/payslip-requests", isAdmin, async (_req, res, next) => {
  try {
    res.json({ requests: await repo.listPayslipRequests() });
  } catch (err) {
    next(err);
  }
});

payrollRouter.get("/payslip-requests/:id", isAdmin, async (req, res, next) => {
  try {
    const request = await repo.getPayslipRequest(req.params.id);
    if (!request) throw AppError.notFound("Payslip request not found.");
    res.json({ request });
  } catch (err) {
    next(err);
  }
});

payrollRouter.post(
  "/payslip-requests/:id/send",
  isAdmin,
  async (req, res, next) => {
    try {
      res.json({
        request: await repo.sendPayslipRequest(req.params.id, req.user!.userId),
      });
    } catch (err) {
      next(err);
    }
  },
);
