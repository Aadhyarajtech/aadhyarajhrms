import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import { isManagerOrAbove } from "@/middleware/rbac";
import * as repo from "./reports.repository";
import { buildExcelReport, buildPdfReport } from "./reportExport.service";

export const reportsRouter = Router();
reportsRouter.use(authenticate, isManagerOrAbove);

type ReportExportSection =
  | "overview"
  | "workforce"
  | "attendance"
  | "leave"
  | "payroll"
  | "recruitment"
  | "performance"
  | "tickets"
  | "documents"
  | "audit"
  | "custom";

const CUSTOM_REPORT_SECTIONS = [
  "Workforce",
  "Attendance",
  "Leave",
  "Payroll",
  "Recruitment",
  "Performance",
  "Tickets",
  "Documents",
] as const;

function exportSectionFromRequest(req: any): ReportExportSection {
  const section =
    typeof req.query.section === "string" ? req.query.section : "overview";

  const allowedSections: readonly ReportExportSection[] = [
    "overview",
    "workforce",
    "attendance",
    "leave",
    "payroll",
    "recruitment",
    "performance",
    "tickets",
    "documents",
    "audit",
    "custom",
  ];

  return allowedSections.includes(section as ReportExportSection)
    ? (section as ReportExportSection)
    : "overview";
}

function customSectionsFromRequest(req: any): string[] {
  if (typeof req.query.customSections !== "string") return [];

  return req.query.customSections
    .split(",")
    .map((section: string) => section.trim())
    .filter((section: string) =>
      (CUSTOM_REPORT_SECTIONS as readonly string[]).includes(section),
    );
}

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

    const section = exportSectionFromRequest(req);
    const customSections = customSectionsFromRequest(req);

    if (section === "custom" && customSections.length === 0) {
      res.status(400).json({
        message: "Select at least one section for a custom report.",
      });
      return;
    }

    const exportData = {
      ...data,
      exportSection: section,
      customSections,
    };

    const filename = `hrms-${section}-report-${data.filters.from ?? "all"}-to-${data.filters.to ?? "all"}.${format}`;

    if (format === "xlsx") {
      const buffer = await buildExcelReport(exportData);
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

    const buffer = await buildPdfReport(exportData);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
