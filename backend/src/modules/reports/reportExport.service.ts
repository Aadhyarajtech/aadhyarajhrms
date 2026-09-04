import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

type ReportData = Record<string, any>;

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

const CUSTOM_SECTION_MAP: Record<
  string,
  Exclude<ReportExportSection, "overview" | "custom">
> = {
  Workforce: "workforce",
  Attendance: "attendance",
  Leave: "leave",
  Payroll: "payroll",
  Recruitment: "recruitment",
  Performance: "performance",
  Tickets: "tickets",
  Documents: "documents",
};

function selectedSections(
  data: ReportData,
): Set<Exclude<ReportExportSection, "overview" | "custom">> {
  const exportSection = data.exportSection as ReportExportSection | undefined;

  if (!exportSection || exportSection === "overview") {
    return new Set([
      "workforce",
      "attendance",
      "leave",
      "payroll",
      "recruitment",
      "performance",
      "tickets",
      "documents",
      "audit",
    ]);
  }

  if (exportSection === "custom") {
    const sections = Array.isArray(data.customSections)
      ? data.customSections
      : [];
    return new Set(
      sections
        .map((section: unknown) =>
          typeof section === "string" ? CUSTOM_SECTION_MAP[section] : undefined,
        )
        .filter(
          (
            section:
              | Exclude<ReportExportSection, "overview" | "custom">
              | undefined,
          ): section is Exclude<ReportExportSection, "overview" | "custom"> =>
            Boolean(section),
        ),
    );
  }

  return new Set([exportSection]);
}

function hasSection(
  sections: Set<Exclude<ReportExportSection, "overview" | "custom">>,
  section: Exclude<ReportExportSection, "overview" | "custom">,
) {
  return sections.has(section);
}

function rowsFromBuckets(buckets: any[] = []) {
  return buckets.map((row) => ({
    Label: row.label ?? "",
    Value: row.value ?? 0,
    ...(row.days !== undefined ? { Days: row.days } : {}),
  }));
}

export async function buildExcelReport(data: ReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AadhyaRaj Technologies";
  workbook.created = new Date();

  const addSheet = (
    name: string,
    rows: Record<string, unknown>[],
    columns?: { header: string; key: string; width: number }[],
  ) => {
    const sheet = workbook.addWorksheet(name);
    const keys = columns?.map((c) => c.key) ?? Object.keys(rows[0] ?? {});
    sheet.columns =
      columns ??
      keys.map((key) => ({
        header: key,
        key,
        width: Math.min(Math.max(key.length + 4, 14), 32),
      }));
    rows.forEach((row) => sheet.addRow(row));
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: "A1",
      to: `${String.fromCharCode(64 + Math.max(1, keys.length))}1`,
    };
    return sheet;
  };

  const sections = selectedSections(data);

  if (data.exportSection === undefined || data.exportSection === "overview") {
    addSheet("Summary", [
      { Report: "Scope", Metric: "Scope", Value: data.scope },
      {
        Report: "Workforce",
        Metric: "Total Employees",
        Value: data.workforce.total,
      },
      {
        Report: "Workforce",
        Metric: "Active Employees",
        Value: data.workforce.active,
      },
      {
        Report: "Workforce",
        Metric: "New Hires",
        Value: data.workforce.recentHires,
      },
      { Report: "Workforce", Metric: "Exits", Value: data.workforce.exits },
      {
        Report: "Attendance",
        Metric: "Attendance Rate",
        Value: `${data.attendance.attendanceRate}%`,
      },
      {
        Report: "Attendance",
        Metric: "Total Work Hours",
        Value: data.attendance.totalWorkHours,
      },
      {
        Report: "Attendance",
        Metric: "Estimated Overtime Hours",
        Value: data.attendance.estimatedOvertimeHours,
      },
      { Report: "Leave", Metric: "Requests", Value: data.leave.total },
      { Report: "Leave", Metric: "Leave Days", Value: data.leave.totalDays },
      { Report: "Payroll", Metric: "Gross", Value: data.payroll.totalGross },
      {
        Report: "Payroll",
        Metric: "Deductions",
        Value: data.payroll.totalDeductions,
      },
      { Report: "Payroll", Metric: "Net Pay", Value: data.payroll.totalNet },
      {
        Report: "Performance",
        Metric: "Average Rating",
        Value: data.performance.averageRating,
      },
      { Report: "Tickets", Metric: "Total", Value: data.tickets.total },
      {
        Report: "Tickets",
        Metric: "Average Resolution Hours",
        Value: data.tickets.averageResolutionHours,
      },
      { Report: "Documents", Metric: "Total", Value: data.documents.total },
      ...(data.recruitment
        ? [
            {
              Report: "Recruitment",
              Metric: "Applications",
              Value: data.recruitment.applications,
            },
            {
              Report: "Recruitment",
              Metric: "Offers Sent",
              Value: data.recruitment.offersSent,
            },
            {
              Report: "Recruitment",
              Metric: "Offers Accepted",
              Value: data.recruitment.offersAccepted,
            },
            {
              Report: "Recruitment",
              Metric: "Offer Acceptance Rate",
              Value: `${data.recruitment.offerAcceptanceRate}%`,
            },
            {
              Report: "Recruitment",
              Metric: "Hired",
              Value: data.recruitment.hired,
            },
          ]
        : []),
    ]);
  }

  if (hasSection(sections, "workforce")) {
    addSheet("Workforce", rowsFromBuckets(data.workforce.byDepartment));
    addSheet("Workforce Trend", data.workforce.headcountTrend ?? []);
  }

  if (hasSection(sections, "attendance")) {
    addSheet("Attendance Daily", data.attendance.daily ?? []);
    addSheet("Attendance Employees", data.attendance.employeeSummary ?? []);
  }

  if (hasSection(sections, "leave")) {
    addSheet("Leave Types", rowsFromBuckets(data.leave.byType));
    addSheet("Leave Monthly", data.leave.monthly ?? []);
  }

  if (hasSection(sections, "payroll")) {
    addSheet("Payroll Runs", data.payroll.byRun ?? []);
    addSheet("Payroll Departments", data.payroll.byDepartment ?? []);
  }

  if (hasSection(sections, "recruitment") && data.recruitment) {
    addSheet("Recruitment Funnel", data.recruitment.funnel ?? []);
    addSheet("Recruitment Sources", rowsFromBuckets(data.recruitment.bySource));
  }

  if (hasSection(sections, "performance")) {
    addSheet(
      "Performance Ratings",
      rowsFromBuckets(data.performance.ratingDistribution),
    );
    addSheet(
      "Performance Outcomes",
      rowsFromBuckets(data.performance.outcomes),
    );
  }

  if (hasSection(sections, "tickets")) {
    addSheet("Tickets", rowsFromBuckets(data.tickets.byCategory));
  }

  if (hasSection(sections, "documents")) {
    addSheet("Documents", [
      {
        Metric: "Total Documents",
        Value: data.documents.total,
      },
      {
        Metric: "Verified",
        Value: data.documents.verified,
      },
      {
        Metric: "Pending",
        Value: data.documents.pending,
      },
      {
        Metric: "Assigned Assets",
        Value: data.documents.assignedAssets,
      },
    ]);
  }

  if (hasSection(sections, "audit") && data.audit?.recent?.length) {
    addSheet("Audit Activity", data.audit.recent);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildPdfReport(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const title = "AadhyaRaj Technologies — HRMS Report";
    doc.fontSize(18).text(title);
    doc.moveDown(0.4);
    doc
      .fontSize(10)
      .text(
        `Scope: ${data.scope}    From: ${data.filters.from ?? "All"}    To: ${data.filters.to ?? "All"}`,
      );
    doc.moveDown();

    const section = (name: string) => {
      doc.moveDown(0.5);
      doc.fontSize(13).text(name);
      doc.moveDown(0.2);
      doc.fontSize(9);
    };

    const metric = (label: string, value: unknown) => {
      doc.text(`${label}: ${String(value ?? "—")}`);
    };

    const sections = selectedSections(data);

    if (hasSection(sections, "workforce")) {
      section("Workforce");
      metric("Total Employees", data.workforce.total);
      metric("Active Employees", data.workforce.active);
      metric("New Hires", data.workforce.recentHires);
      metric("Exits", data.workforce.exits);
      metric(
        "Workforce Trend Points",
        (data.workforce.headcountTrend ?? []).length,
      );
    }

    if (hasSection(sections, "attendance")) {
      section("Attendance");
      metric("Attendance Rate", `${data.attendance.attendanceRate}%`);
      metric("Total Work Hours", data.attendance.totalWorkHours);
      metric("Average Work Hours", data.attendance.averageWorkHours);
      metric(
        "Estimated Overtime Hours (>8h/day)",
        data.attendance.estimatedOvertimeHours,
      );
      metric("Regularized Records", data.attendance.regularized);
    }

    if (hasSection(sections, "leave")) {
      section("Leave");
      metric("Requests", data.leave.total);
      metric("Leave Days", data.leave.totalDays);
    }

    if (hasSection(sections, "payroll")) {
      section("Payroll");
      metric("Payroll Runs", data.payroll.runs);
      metric("Gross", data.payroll.totalGross);
      metric("Deductions", data.payroll.totalDeductions);
      metric("Net Pay", data.payroll.totalNet);
      metric("LOP", data.payroll.totalLop);
    }

    if (hasSection(sections, "recruitment") && data.recruitment) {
      section("Recruitment");
      metric("Applications", data.recruitment.applications);
      metric("Offers Sent", data.recruitment.offersSent);
      metric("Offers Accepted", data.recruitment.offersAccepted);
      metric(
        "Offer Acceptance Rate",
        `${data.recruitment.offerAcceptanceRate}%`,
      );
      metric("Hired", data.recruitment.hired);
    }

    if (hasSection(sections, "performance")) {
      section("Performance");
      metric("Reviews", data.performance.reviews);
      metric("Average Rating", `${data.performance.averageRating}/5`);
    }

    if (hasSection(sections, "tickets")) {
      section("Tickets");
      metric("Total Tickets", data.tickets.total);
      metric("Resolved / Closed", data.tickets.resolved);
      metric(
        "Average Resolution",
        `${data.tickets.averageResolutionHours} hours`,
      );
    }

    if (hasSection(sections, "documents")) {
      section("Documents");
      metric("Total Documents", data.documents.total);
      metric("Verified", data.documents.verified);
      metric("Pending", data.documents.pending);
      metric("Assigned Assets", data.documents.assignedAssets);
    }

    if (hasSection(sections, "audit") && data.audit) {
      section("Audit & Compliance");
      metric("Audit Events", data.audit.total);
    }

    if (data.exportSection === undefined || data.exportSection === "overview") {
      doc.moveDown();
      doc
        .fontSize(8)
        .text(
          "Note: estimated overtime is calculated from attendance records above 8 hours per day. Comp-off is not included because the current HRMS attendance data model does not store comp-off credits.",
        );
    }

    doc.end();
  });
}
