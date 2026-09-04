import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import { isManagerOrAbove } from "@/middleware/rbac";
import * as repo from "./reports.repository";
import { buildExcelReport, buildPdfReport } from "./reportExport.service";

export const reportsRouter = Router();
reportsRouter.use(authenticate, isManagerOrAbove);

function filtersFromRequest(req: any) {
  return {
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
    departmentId:
      typeof req.query.departmentId === "string"
        ? req.query.departmentId
        : undefined,
  };
}

reportsRouter.get("/overview", async (req, res, next) => {
  try {
    const data = await repo.getReports(
      filtersFromRequest(req),
      req.user!.role,
      req.user!.employeeId,
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/export/:format", async (req, res, next) => {
  try {
    const format = req.params.format.toLowerCase();
    if (!["xlsx", "pdf"].includes(format)) {
      res.status(400).json({ message: "Supported formats are xlsx and pdf." });
      return;
    }

    const data = await repo.getReports(
      filtersFromRequest(req),
      req.user!.role,
      req.user!.employeeId,
    );

    const filename = `hrms-report-${data.filters.from ?? "all"}-to-${data.filters.to ?? "all"}.${format}`;

    if (format === "xlsx") {
      const buffer = await buildExcelReport(data);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send(buffer);
      return;
    }

    const buffer = await buildPdfReport(data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
