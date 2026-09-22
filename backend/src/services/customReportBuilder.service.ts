// path: src/services/customReportBuilder.service.ts
//
// AI-Powered Custom Report Builder & Dataset Studio Service
// Aggregates real records across Workforce, Attendance, Payroll, Leave, and Tickets.
// Supports dynamic column definitions, grouping/aggregation, Recharts data,
// and AI prompt auto-configuration with resilient deterministic synthesis.

import { env } from "../config/env";
import {
  Attendance,
  Department,
  Designation,
  Employee,
  LeaveRequest,
  Payslip,
  Ticket,
} from "../db/models";
import { getReports, type ReportFilters } from "../modules/reports/reports.repository";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const LLM_TIMEOUT_MS = 9000;

export type DatasetType =
  | "WORKFORCE"
  | "ATTENDANCE"
  | "PAYROLL"
  | "LEAVE"
  | "TICKETS";

export interface DatasetColumnDef {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "date" | "badge";
  defaultSelected: boolean;
}

export interface AiCustomReportKpi {
  id: string;
  label: string;
  value: string | number;
  subtext?: string;
  status?: "neutral" | "good" | "warning" | "danger";
}

export interface GroupedSummaryItem {
  groupKey: string;
  groupLabel: string;
  count: number;
  metrics: Record<string, string | number>;
}

export interface AiCustomReportResult {
  reportId: string;
  dataset: DatasetType;
  title: string;
  subtitle: string;
  theme: string;
  executiveSummary: string;
  keyFindings: string[];
  kpiCards: AiCustomReportKpi[];
  columns: DatasetColumnDef[];
  selectedColumns: string[];
  rows: Record<string, any>[];
  totalRecords: number;
  availableGroupings: { key: string; label: string }[];
  activeGroupBy?: string;
  groupedSummary?: GroupedSummaryItem[];
  chart?: {
    title: string;
    type: "bar" | "line";
    dataKey: string;
    data: { label: string; value: number }[];
  };
  recommendations: {
    priority: "HIGH" | "MEDIUM" | "LOW";
    action: string;
    impact: string;
  }[];
  generatedAt: string;
  source: "llm" | "deterministic";
}

export interface BuildCustomReportInput {
  dataset?: DatasetType;
  selectedColumns?: string[];
  groupBy?: string;
  chartType?: "bar" | "line" | "none";
  prompt?: string;
  templateId?: string;
  dateFrom?: string;
  dateTo?: string;
  departmentId?: string;
}

function formatCurrencyINR(amount: number): string {
  const num = Number(amount);
  const safe = isNaN(num) ? 0 : num;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safe);
}

// ----------------------------------------------------------------------------
// DATASET COLUMN DEFINITIONS
// ----------------------------------------------------------------------------

export const DATASET_COLUMNS: Record<DatasetType, DatasetColumnDef[]> = {
  WORKFORCE: [
    { key: "employeeCode", label: "Employee Code", type: "text", defaultSelected: true },
    { key: "fullName", label: "Employee Name", type: "text", defaultSelected: true },
    { key: "department", label: "Department", type: "text", defaultSelected: true },
    { key: "designation", label: "Designation", type: "text", defaultSelected: true },
    { key: "employmentType", label: "Employment Type", type: "badge", defaultSelected: true },
    { key: "status", label: "Status", type: "badge", defaultSelected: true },
    { key: "dateOfJoining", label: "Date of Joining", type: "date", defaultSelected: true },
    { key: "workLocation", label: "Location", type: "text", defaultSelected: false },
    { key: "personalEmail", label: "Email", type: "text", defaultSelected: false },
    { key: "phone", label: "Phone", type: "text", defaultSelected: false },
  ],
  ATTENDANCE: [
    { key: "date", label: "Date", type: "date", defaultSelected: true },
    { key: "employeeName", label: "Employee", type: "text", defaultSelected: true },
    { key: "department", label: "Department", type: "text", defaultSelected: true },
    { key: "status", label: "Status", type: "badge", defaultSelected: true },
    { key: "clockIn", label: "Clock In", type: "text", defaultSelected: true },
    { key: "clockOut", label: "Clock Out", type: "text", defaultSelected: true },
    { key: "workHours", label: "Work Hours", type: "number", defaultSelected: true },
    { key: "overtimeHours", label: "Overtime (hrs)", type: "number", defaultSelected: true },
    { key: "isLate", label: "Late Arrival", type: "badge", defaultSelected: false },
  ],
  PAYROLL: [
    { key: "period", label: "Payroll Period", type: "text", defaultSelected: true },
    { key: "employeeName", label: "Employee", type: "text", defaultSelected: true },
    { key: "department", label: "Department", type: "text", defaultSelected: true },
    { key: "basicSalary", label: "Basic Pay", type: "currency", defaultSelected: true },
    { key: "grossSalary", label: "Gross Salary", type: "currency", defaultSelected: true },
    { key: "totalDeductions", label: "Deductions", type: "currency", defaultSelected: true },
    { key: "netSalary", label: "Net Payout", type: "currency", defaultSelected: true },
    { key: "status", label: "Status", type: "badge", defaultSelected: true },
  ],
  LEAVE: [
    { key: "employeeName", label: "Employee", type: "text", defaultSelected: true },
    { key: "department", label: "Department", type: "text", defaultSelected: true },
    { key: "leaveType", label: "Leave Type", type: "badge", defaultSelected: true },
    { key: "startDate", label: "Start Date", type: "date", defaultSelected: true },
    { key: "endDate", label: "End Date", type: "date", defaultSelected: true },
    { key: "daysCount", label: "Days", type: "number", defaultSelected: true },
    { key: "status", label: "Status", type: "badge", defaultSelected: true },
    { key: "reason", label: "Reason", type: "text", defaultSelected: false },
  ],
  TICKETS: [
    { key: "ticketId", label: "Ticket ID", type: "text", defaultSelected: true },
    { key: "subject", label: "Subject", type: "text", defaultSelected: true },
    { key: "category", label: "Category", type: "badge", defaultSelected: true },
    { key: "priority", label: "Priority", type: "badge", defaultSelected: true },
    { key: "status", label: "Status", type: "badge", defaultSelected: true },
    { key: "slaStatus", label: "SLA Status", type: "badge", defaultSelected: true },
    { key: "assignedTo", label: "Assigned To", type: "text", defaultSelected: true },
    { key: "createdAt", label: "Created Date", type: "date", defaultSelected: false },
  ],
};

export const DATASET_GROUPINGS: Record<DatasetType, { key: string; label: string }[]> = {
  WORKFORCE: [
    { key: "none", label: "None (Raw Records)" },
    { key: "department", label: "Group by Department" },
    { key: "employmentType", label: "Group by Employment Type" },
    { key: "status", label: "Group by Status" },
  ],
  ATTENDANCE: [
    { key: "none", label: "None (Raw Records)" },
    { key: "department", label: "Group by Department" },
    { key: "status", label: "Group by Status" },
    { key: "isLate", label: "Group by Late Status" },
  ],
  PAYROLL: [
    { key: "none", label: "None (Raw Records)" },
    { key: "department", label: "Group by Department" },
    { key: "status", label: "Group by Status" },
    { key: "period", label: "Group by Period" },
  ],
  LEAVE: [
    { key: "none", label: "None (Raw Records)" },
    { key: "department", label: "Group by Department" },
    { key: "leaveType", label: "Group by Leave Type" },
    { key: "status", label: "Group by Status" },
  ],
  TICKETS: [
    { key: "none", label: "None (Raw Records)" },
    { key: "category", label: "Group by Category" },
    { key: "priority", label: "Group by Priority" },
    { key: "status", label: "Group by Status" },
    { key: "slaStatus", label: "Group by SLA Status" },
  ],
};

/**
 * Deterministic fallback: infer dataset from prompt keywords
 */
function inferConfigFromPromptFallback(prompt: string): {
  dataset: DatasetType;
  groupBy: string;
  selectedColumns?: string[];
} {
  const p = prompt.toLowerCase();

  if (p.includes("overtime") || p.includes("attendance") || p.includes("absenteeism") || p.includes("punctual")) {
    return { dataset: "ATTENDANCE", groupBy: "department" };
  }
  if (p.includes("payroll") || p.includes("salary") || p.includes("compensation") || p.includes("deduction") || p.includes("net pay")) {
    return { dataset: "PAYROLL", groupBy: "department" };
  }
  if (p.includes("ticket") || p.includes("helpdesk") || p.includes("sla") || p.includes("complaint") || p.includes("issue")) {
    return { dataset: "TICKETS", groupBy: "category" };
  }
  if (p.includes("leave") || p.includes("time off") || p.includes("vacation") || p.includes("sick")) {
    return { dataset: "LEAVE", groupBy: "leaveType" };
  }

  return { dataset: "WORKFORCE", groupBy: "department" };
}

/**
 * LLM-powered prompt parsing: uses Groq to intelligently determine dataset, groupBy, and columns
 */
async function inferConfigFromPromptWithAI(prompt: string): Promise<{
  dataset: DatasetType;
  groupBy: string;
  selectedColumns?: string[];
}> {
  if (!env.groqApiKey) {
    return inferConfigFromPromptFallback(prompt);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    const availableDatasets = Object.keys(DATASET_COLUMNS);
    const columnsByDataset: Record<string, string[]> = {};
    const groupingsByDataset: Record<string, string[]> = {};
    for (const ds of availableDatasets) {
      columnsByDataset[ds] = DATASET_COLUMNS[ds as DatasetType].map((c) => c.key);
      groupingsByDataset[ds] = DATASET_GROUPINGS[ds as DatasetType].map((g) => g.key);
    }

    const systemPrompt = `You are an AI report configuration assistant for an HRMS system.
Given a user's natural language report request, determine the best configuration.

Available datasets: ${availableDatasets.join(", ")}
Columns per dataset: ${JSON.stringify(columnsByDataset)}
Groupings per dataset: ${JSON.stringify(groupingsByDataset)}

Respond with strictly valid JSON:
{
  "dataset": "WORKFORCE|ATTENDANCE|PAYROLL|LEAVE|TICKETS",
  "groupBy": "column_key_or_none",
  "selectedColumns": ["col1", "col2"] // optional, omit to use defaults
}`;

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.groqApiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.groqModel || "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Build a report for: "${prompt}"` },
        ],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data: any = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        const validDatasets: DatasetType[] = ["WORKFORCE", "ATTENDANCE", "PAYROLL", "LEAVE", "TICKETS"];
        const dataset: DatasetType = validDatasets.includes(parsed.dataset) ? (parsed.dataset as DatasetType) : "WORKFORCE";
        const validGroupings = DATASET_GROUPINGS[dataset].map((g: { key: string; label: string }) => g.key);
        const groupBy = validGroupings.includes(parsed.groupBy) ? parsed.groupBy : "department";

        let selectedColumns: string[] | undefined;
        if (Array.isArray(parsed.selectedColumns) && parsed.selectedColumns.length > 0) {
          const validCols = DATASET_COLUMNS[dataset].map((c: DatasetColumnDef) => c.key);
          const filtered = parsed.selectedColumns.filter((c: string) => validCols.includes(c));
          if (filtered.length > 0) selectedColumns = filtered;
        }

        return { dataset, groupBy, selectedColumns };
      }
    }
  } catch {
    // Fallback silently
  }

  return inferConfigFromPromptFallback(prompt);
}

/**
 * LLM-powered AI synthesis: generates executive summary, key findings, and recommendations
 * from the actual report data.
 */
async function generateAiSynthesis(
  dataset: DatasetType,
  kpiCards: AiCustomReportKpi[],
  totalRecords: number,
  groupedSummary: GroupedSummaryItem[] | undefined,
  chartData: { label: string; value: number }[],
  sampleRows: Record<string, any>[],
  prompt?: string,
): Promise<{
  executiveSummary: string;
  keyFindings: string[];
  recommendations: { priority: "HIGH" | "MEDIUM" | "LOW"; action: string; impact: string }[];
  source: "llm" | "deterministic";
}> {
  // Deterministic fallback
  const fallback = {
    executiveSummary: `Analyzed ${totalRecords} ${dataset.toLowerCase()} records. ${kpiCards.map((k) => `${k.label}: ${k.value}`).join(", ")}.`,
    keyFindings: [
      `${totalRecords} total records in the ${dataset.toLowerCase()} dataset.`,
      ...kpiCards.slice(0, 2).map((k) => `${k.label} is ${k.value}${k.subtext ? ` (${k.subtext})` : ""}.`),
    ],
    recommendations: [
      { priority: "MEDIUM" as const, action: "Review the data patterns and export for documentation.", impact: "Maintains audit trail for compliance." },
    ],
    source: "deterministic" as const,
  };

  if (!env.groqApiKey) return fallback;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    const dataContext = {
      dataset,
      totalRecords,
      kpis: kpiCards.map((k) => ({ label: k.label, value: k.value, status: k.status })),
      groups: groupedSummary?.slice(0, 10).map((g) => ({ name: g.groupLabel, count: g.count })) || [],
      chartDistribution: chartData.slice(0, 8),
      sampleRecords: sampleRows.slice(0, 5),
    };

    const systemPrompt = `You are an expert HR data analyst for Aadhyaraj HRMS. Analyze the report data and provide executive insights.
${prompt ? `User's report request: "${prompt}"` : `Dataset: ${dataset}`}

Report data summary:
${JSON.stringify(dataContext, null, 2)}

Respond with strictly valid JSON:
{
  "executiveSummary": "2-3 sentence executive summary of the data with specific numbers and actionable insight",
  "keyFindings": ["Finding 1 with specific data", "Finding 2", "Finding 3"],
  "recommendations": [
    { "priority": "HIGH|MEDIUM|LOW", "action": "Specific actionable recommendation", "impact": "Expected business impact" },
    { "priority": "HIGH|MEDIUM|LOW", "action": "Another recommendation", "impact": "Expected impact" }
  ]
}

Rules:
- Use actual numbers from the data, not generic statements
- If monetary values, use INR (₹ or Lakhs/Crores), NEVER USD
- Recommendations must be specific and actionable for HR managers
- Maximum 4 key findings and 3 recommendations`;

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.groqApiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.groqModel || "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: systemPrompt }],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data: any = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        return {
          executiveSummary: typeof parsed.executiveSummary === "string" ? parsed.executiveSummary : fallback.executiveSummary,
          keyFindings: Array.isArray(parsed.keyFindings) && parsed.keyFindings.length > 0 ? parsed.keyFindings.slice(0, 4) : fallback.keyFindings,
          recommendations: Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0
            ? parsed.recommendations.slice(0, 3).map((r: any) => ({
                priority: ["HIGH", "MEDIUM", "LOW"].includes(r.priority) ? r.priority : "MEDIUM",
                action: r.action || "Review data patterns.",
                impact: r.impact || "Improved operational efficiency.",
              }))
            : fallback.recommendations,
          source: "llm",
        };
      }
    }
  } catch {
    // Fallback silently
  }

  return fallback;
}

/**
 * Builds the customized report using real database queries + AI synthesis
 */
export async function buildCustomReport(
  input: BuildCustomReportInput,
  role: string = "SUPER_ADMIN",
  employeeId: string | null = null,
): Promise<AiCustomReportResult> {
  // 1. Resolve Dataset & Intent
  let targetDataset: DatasetType = input.dataset || "WORKFORCE";
  let targetGroupBy = input.groupBy || "none";
  let promptSelectedColumns: string[] | undefined;

  if (input.prompt && input.prompt.trim().length > 3 && !input.dataset) {
    const inferred = await inferConfigFromPromptWithAI(input.prompt);
    targetDataset = inferred.dataset;
    targetGroupBy = inferred.groupBy;
    promptSelectedColumns = inferred.selectedColumns;
  } else if (input.templateId) {
    if (input.templateId === "overtime-audit") {
      targetDataset = "ATTENDANCE";
      targetGroupBy = "department";
    } else if (input.templateId === "payroll-compensation" || input.templateId === "payroll-summary") {
      targetDataset = "PAYROLL";
      targetGroupBy = "department";
    } else if (input.templateId === "ticket-sla-risk") {
      targetDataset = "TICKETS";
      targetGroupBy = "category";
    } else if (input.templateId === "leave-utilization") {
      targetDataset = "LEAVE";
      targetGroupBy = "leaveType";
    } else if (input.templateId === "attendance-trend") {
      targetDataset = "ATTENDANCE";
      targetGroupBy = "status";
    } else if (input.templateId === "compliance-audit") {
      targetDataset = "WORKFORCE";
      targetGroupBy = "status";
    } else {
      targetDataset = "WORKFORCE";
      targetGroupBy = "department";
    }
  }

  const allColumns = DATASET_COLUMNS[targetDataset];
  const availableGroupings = DATASET_GROUPINGS[targetDataset];

  // Resolve selected columns (prompt AI > user selection > defaults)
  const selectedColumns =
    input.selectedColumns && input.selectedColumns.length > 0
      ? input.selectedColumns
      : promptSelectedColumns && promptSelectedColumns.length > 0
      ? promptSelectedColumns
      : allColumns.filter((c) => c.defaultSelected).map((c) => c.key);

  // 2. Fetch Supporting Reference Dictionaries (Departments, Designations, Employees)
  const [departments, designations, employees] = await Promise.all([
    Department.find({}, { name: 1 }).lean().exec(),
    Designation.find({}, { title: 1 }).lean().exec(),
    Employee.find({}, { firstName: 1, lastName: 1, departmentId: 1 }).lean().exec(),
  ]);

  const deptMap = new Map<string, string>(departments.map((d: any) => [String(d._id), d.name]));
  const desigMap = new Map<string, string>(designations.map((d: any) => [String(d._id), d.title]));
  const empMap = new Map<string, { name: string; deptId: string }>(
    employees.map((e: any) => [
      String(e._id),
      { name: `${e.firstName || ""} ${e.lastName || ""}`.trim() || "Employee", deptId: String(e.departmentId || "") },
    ])
  );

  // 3. Query Real Records for the Target Dataset
  let rawRows: Record<string, any>[] = [];
  let kpiCards: AiCustomReportKpi[] = [];
  let chartData: { label: string; value: number }[] = [];
  let chartTitle = "Metric Distribution";

  const dateFilterQuery: any = {};
  if (input.dateFrom && input.dateTo) {
    dateFilterQuery.$gte = input.dateFrom;
    dateFilterQuery.$lte = input.dateTo;
  }

  const deptFilter = input.departmentId ? { departmentId: input.departmentId } : {};

  // --- A. WORKFORCE DATASET ---
  if (targetDataset === "WORKFORCE") {
    const query: any = { ...deptFilter };
    const empDocs = await Employee.find(query).sort({ dateOfJoining: -1 }).limit(100).lean().exec();

    rawRows = empDocs.map((e: any) => ({
      employeeCode: e.employeeCode || e._id,
      fullName: `${e.firstName || ""} ${e.lastName || ""}`.trim() || "—",
      department: deptMap.get(String(e.departmentId)) || "General",
      designation: desigMap.get(String(e.designationId)) || "Staff",
      employmentType: e.employmentType || "FULL_TIME",
      status: e.status || "ACTIVE",
      dateOfJoining: e.dateOfJoining ? String(e.dateOfJoining).slice(0, 10) : "—",
      workLocation: e.workLocation || "Headquarters",
      personalEmail: e.personalEmail || "—",
      phone: e.phone || "—",
    }));

    const activeCount = rawRows.filter((r) => r.status === "ACTIVE").length;
    kpiCards = [
      { id: "wf-total", label: "Total Headcount", value: rawRows.length, subtext: "Queried workforce records", status: "neutral" },
      { id: "wf-active", label: "Active Staff", value: activeCount, subtext: `${Math.round((activeCount / (rawRows.length || 1)) * 100)}% deployed`, status: "good" },
      { id: "wf-depts", label: "Departments", value: new Set(rawRows.map((r) => r.department)).size, subtext: "Operational units", status: "neutral" },
      { id: "wf-fulltime", label: "Full Time Ratio", value: `${Math.round((rawRows.filter((r) => r.employmentType === "FULL_TIME").length / (rawRows.length || 1)) * 100)}%`, subtext: "Core workforce", status: "good" },
    ];

    const deptCounts: Record<string, number> = {};
    rawRows.forEach((r) => {
      deptCounts[r.department] = (deptCounts[r.department] || 0) + 1;
    });
    chartData = Object.entries(deptCounts).map(([label, value]) => ({ label, value }));
    chartTitle = "Headcount by Department";
  }

  // --- B. ATTENDANCE DATASET ---
  else if (targetDataset === "ATTENDANCE") {
    const query: any = {};
    if (Object.keys(dateFilterQuery).length > 0) query.date = dateFilterQuery;

    const attDocs = await Attendance.find(query).sort({ date: -1 }).limit(100).lean().exec();

    rawRows = attDocs.map((a: any) => {
      const emp = empMap.get(String(a.employeeId));
      const hours = typeof a.workDurationMinutes === "number" ? Math.round((a.workDurationMinutes / 60) * 10) / 10 : 8;
      const otHours = typeof a.overtimeMinutes === "number" ? Math.round((a.overtimeMinutes / 60) * 10) / 10 : 0;
      return {
        date: a.date ? String(a.date).slice(0, 10) : "—",
        employeeName: emp?.name || `Emp (${a.employeeId?.slice(-4) || "—"})`,
        department: deptMap.get(emp?.deptId || "") || "General",
        status: a.status || "PRESENT",
        clockIn: a.clockIn ? String(a.clockIn).slice(11, 16) : "—",
        clockOut: a.clockOut ? String(a.clockOut).slice(11, 16) : "—",
        workHours: hours,
        overtimeHours: otHours,
        isLate: a.isLate ? "Yes" : "No",
      };
    });

    const presentCount = rawRows.filter((r) => r.status === "PRESENT").length;
    const totalHours = rawRows.reduce((acc, r) => acc + Number(r.workHours || 0), 0);
    const totalOt = rawRows.reduce((acc, r) => acc + Number(r.overtimeHours || 0), 0);

    kpiCards = [
      { id: "att-turnout", label: "Attendance Turnout", value: `${Math.round((presentCount / (rawRows.length || 1)) * 100)}%`, subtext: `${presentCount} present records`, status: "good" },
      { id: "att-hours", label: "Total Logged Work", value: `${Math.round(totalHours)} hrs`, subtext: "Effective duration", status: "neutral" },
      { id: "att-ot", label: "Overtime Logged", value: `${Math.round(totalOt)} hrs`, subtext: "Extra shift hours", status: totalOt > 20 ? "warning" : "good" },
      { id: "att-late", label: "Late Arrivals", value: rawRows.filter((r) => r.isLate === "Yes").length, subtext: "Shift delays", status: "warning" },
    ];

    const statusCounts: Record<string, number> = {};
    rawRows.forEach((r) => {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });
    chartData = Object.entries(statusCounts).map(([label, value]) => ({ label, value }));
    chartTitle = "Attendance Status Distribution";
  }

  // --- C. PAYROLL DATASET ---
  else if (targetDataset === "PAYROLL") {
    const payDocs = await Payslip.find({}).sort({ createdAt: -1 }).limit(100).lean().exec();

    rawRows = payDocs.map((p: any) => {
      const emp = empMap.get(String(p.employeeId));
      const grossVal = Number(p.grossEarnings ?? p.grossSalary ?? 0);
      const netVal = Number(p.netPay ?? p.netSalary ?? 0);
      const dedVal = Number(p.totalDeductions ?? 0);
      const basicVal = Number(p.basic ?? p.basicSalary ?? 0);

      return {
        period: p.period || `${p.year || "2026"}-${String(p.month || "09").padStart(2, "0")}`,
        employeeName: emp?.name || `Emp (${String(p.employeeId || "").slice(-4)})`,
        department: deptMap.get(emp?.deptId || "") || "General",
        basicSalary: formatCurrencyINR(basicVal),
        grossSalary: formatCurrencyINR(grossVal),
        totalDeductions: formatCurrencyINR(dedVal),
        netSalary: formatCurrencyINR(netVal),
        rawNet: netVal,
        status: p.status || "PAID",
      };
    });

    const totalNet = rawRows.reduce((acc: number, r: any) => acc + Number(r.rawNet || 0), 0);
    const totalGross = payDocs.reduce((acc: number, p: any) => acc + Number(p.grossEarnings ?? p.grossSalary ?? 0), 0);
    const totalDeductions = payDocs.reduce((acc: number, p: any) => acc + Number(p.totalDeductions ?? 0), 0);

    kpiCards = [
      { id: "pay-net", label: "Net Disbursement", value: formatCurrencyINR(totalNet), subtext: "Total take-home", status: "good" },
      { id: "pay-gross", label: "Gross Commitment", value: formatCurrencyINR(totalGross), subtext: "Base + allowances", status: "neutral" },
      { id: "pay-deductions", label: "Total Deductions", value: formatCurrencyINR(totalDeductions), subtext: "Tax & statutory", status: "neutral" },
      { id: "pay-count", label: "Payslips Issued", value: rawRows.length, subtext: "Disbursed records", status: "good" },
    ];

    const deptNet: Record<string, number> = {};
    rawRows.forEach((r) => {
      deptNet[r.department] = (deptNet[r.department] || 0) + Number(r.rawNet || 0);
    });
    chartData = Object.entries(deptNet).map(([label, value]) => ({ label, value }));
    chartTitle = "Net Payroll by Department";
  }

  // --- D. LEAVE DATASET ---
  else if (targetDataset === "LEAVE") {
    const leaveDocs = await LeaveRequest.find({}).sort({ appliedAt: -1 }).limit(100).lean().exec();

    rawRows = leaveDocs.map((l: any) => {
      const emp = empMap.get(String(l.employeeId));
      return {
        employeeName: emp?.name || `Emp (${String(l.employeeId || "").slice(-4)})`,
        department: deptMap.get(emp?.deptId || "") || "General",
        leaveType: l.leaveType || "CASUAL",
        startDate: l.startDate ? String(l.startDate).slice(0, 10) : "—",
        endDate: l.endDate ? String(l.endDate).slice(0, 10) : "—",
        daysCount: Number(l.daysCount || 1),
        status: l.status || "APPROVED",
        reason: l.reason || "—",
      };
    });

    const approvedCount = rawRows.filter((r) => r.status === "APPROVED").length;
    const totalDays = rawRows.reduce((acc, r) => acc + Number(r.daysCount || 0), 0);

    kpiCards = [
      { id: "leave-reqs", label: "Total Requests", value: rawRows.length, subtext: "Leave applications", status: "neutral" },
      { id: "leave-days", label: "Total Leave Days", value: totalDays, subtext: "Cumulative days off", status: "neutral" },
      { id: "leave-approved", label: "Approved Leaves", value: approvedCount, subtext: `${Math.round((approvedCount / (rawRows.length || 1)) * 100)}% approved`, status: "good" },
      { id: "leave-types", label: "Leave Categories", value: new Set(rawRows.map((r) => r.leaveType)).size, subtext: "Active categories", status: "neutral" },
    ];

    const typeCounts: Record<string, number> = {};
    rawRows.forEach((r) => {
      typeCounts[r.leaveType] = (typeCounts[r.leaveType] || 0) + (r.daysCount || 1);
    });
    chartData = Object.entries(typeCounts).map(([label, value]) => ({ label, value }));
    chartTitle = "Leave Days by Type";
  }

  // --- E. TICKETS DATASET ---
  else {
    const tktDocs = await Ticket.find({}).sort({ createdAt: -1 }).limit(100).lean().exec();

    rawRows = tktDocs.map((t: any) => ({
      ticketId: t.ticketId || t._id,
      subject: t.subject || "No Subject",
      category: t.category || "General",
      priority: t.priority || "MEDIUM",
      status: t.status || "OPEN",
      slaStatus: t.slaStatus || "ON_TRACK",
      assignedTo: t.assignedTo || "Unassigned",
      createdAt: t.createdAt ? String(t.createdAt).slice(0, 10) : "—",
    }));

    const resolved = rawRows.filter((r) => r.status === "RESOLVED" || r.status === "CLOSED").length;
    const breached = rawRows.filter((r) => r.slaStatus === "BREACHED").length;

    kpiCards = [
      { id: "tkt-total", label: "Total Tickets", value: rawRows.length, subtext: "Support inquiries", status: "neutral" },
      { id: "tkt-resolved", label: "Resolved Rate", value: `${Math.round((resolved / (rawRows.length || 1)) * 100)}%`, subtext: `${resolved} queries closed`, status: "good" },
      { id: "tkt-open", label: "Open Backlog", value: rawRows.length - resolved, subtext: "Requiring attention", status: "warning" },
      { id: "tkt-breach", label: "SLA Breaches", value: breached, subtext: "Overdue queries", status: breached > 0 ? "danger" : "good" },
    ];

    const catCounts: Record<string, number> = {};
    rawRows.forEach((r) => {
      catCounts[r.category] = (catCounts[r.category] || 0) + 1;
    });
    chartData = Object.entries(catCounts).map(([label, value]) => ({ label, value }));
    chartTitle = "Tickets by Category";
  }

  // 4. Compute Grouped Summary (if grouping is requested)
  let groupedSummary: GroupedSummaryItem[] | undefined = undefined;
  if (targetGroupBy && targetGroupBy !== "none") {
    const groupMap = new Map<string, { count: number; sample: Record<string, any> }>();
    rawRows.forEach((row) => {
      const keyVal = String(row[targetGroupBy] || "Unassigned");
      const existing = groupMap.get(keyVal) || { count: 0, sample: row };
      existing.count += 1;
      groupMap.set(keyVal, existing);
    });

    groupedSummary = Array.from(groupMap.entries()).map(([key, data]) => ({
      groupKey: key,
      groupLabel: key,
      count: data.count,
      metrics: {
        "Record Share": `${Math.round((data.count / (rawRows.length || 1)) * 100)}%`,
      },
    }));
  }

  // 5. AI Synthesis — Generate executive summary, findings, and recommendations using LLM
  const aiSynthesis = await generateAiSynthesis(
    targetDataset,
    kpiCards,
    rawRows.length,
    groupedSummary,
    chartData,
    rawRows,
    input.prompt,
  );

  // 6. Assemble Result
  const title = input.prompt
    ? `Custom Report: ${input.prompt}`
    : `${targetDataset.charAt(0) + targetDataset.slice(1).toLowerCase()} Custom Report`;

  const dateScopeStr =
    input.dateFrom && input.dateTo
      ? `${input.dateFrom} to ${input.dateTo}`
      : "Full Active Scope";

  return {
    reportId: `REP-${Date.now()}`,
    dataset: targetDataset,
    title,
    subtitle: `Dataset: ${targetDataset} • Scope: ${dateScopeStr} • Columns: ${selectedColumns.length}`,
    theme: `${targetDataset} Analysis`,
    executiveSummary: aiSynthesis.executiveSummary,
    keyFindings: aiSynthesis.keyFindings,
    kpiCards,
    columns: allColumns,
    selectedColumns,
    rows: rawRows,
    totalRecords: rawRows.length,
    availableGroupings,
    activeGroupBy: targetGroupBy,
    groupedSummary,
    chart: input.chartType !== "none" && chartData.length > 0 ? {
      title: chartTitle,
      type: (input.chartType as any) || "bar",
      dataKey: "value",
      data: chartData,
    } : undefined,
    recommendations: aiSynthesis.recommendations,
    generatedAt: new Date().toISOString(),
    source: aiSynthesis.source,
  };
}

