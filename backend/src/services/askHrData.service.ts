// path: src/services/askHrData.service.ts
//
// Natural Language "Ask HR Data" Service
// Parses plain English questions about workforce, attendance, payroll,
// tickets, leave, performance, and recruitment into live database aggregations,
// returning structured answers, KPIs, charts, and tables.

import { env } from "../config/env";
import {
  Attendance,
  Department,
  Employee,
  LeaveRequest,
  PayrollRun,
  Payslip,
  PerformanceReview,
  Ticket,
} from "@/db/models";
import type { ReportFilters } from "../modules/reports/reports.repository";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const LLM_TIMEOUT_MS = 8000;

export type HrDomain =
  | "ATTENDANCE"
  | "WORKFORCE"
  | "PAYROLL"
  | "TICKETS"
  | "LEAVE"
  | "RECRUITMENT"
  | "PERFORMANCE"
  | "GENERAL";

export interface AskHrResult {
  question: string;
  answerText: string;
  keyMetric?: {
    label: string;
    value: string | number;
    subtext?: string;
  };
  domain: HrDomain;
  table?: {
    columns: string[];
    rows: (string | number)[][];
  };
  chartData?: {
    label: string;
    value: number;
  }[];
  actionLink?: {
    label: string;
    url: string;
    description?: string;
  };
  suggestedFollowUps: string[];
  source: "llm" | "rule";
}

function formatCurrencyINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Scope employees if role is MANAGER
async function resolveScope(
  role: string,
  employeeId: string | null,
  departmentId?: string,
): Promise<string[] | undefined> {
  if (role === "MANAGER" && employeeId) {
    const query: Record<string, any> = { managerId: employeeId };
    if (departmentId) query.departmentId = departmentId;
    const emps = await Employee.find(query).select("_id").lean();
    return emps.map((e) => e._id);
  }
  if (departmentId) {
    const emps = await Employee.find({ departmentId }).select("_id").lean();
    return emps.map((e) => e._id);
  }
  return undefined;
}

// Helper: build date query
function buildDateQuery(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  };
}

// ============================================================================
// DOMAIN QUERY EXECUTORS
// ============================================================================

// 1. ATTENDANCE & ABSENTEEISM
async function executeAttendanceQuery(
  question: string,
  filters: ReportFilters,
  scopedIds?: string[],
): Promise<Omit<AskHrResult, "question" | "suggestedFollowUps" | "source">> {
  const dateFilter = buildDateQuery(filters.from, filters.to);
  const matchQuery: Record<string, any> = {
    ...(scopedIds?.length ? { employeeId: { $in: scopedIds } } : {}),
    ...(dateFilter ? { date: dateFilter } : {}),
  };

  const departments = await Department.find().select("_id name").lean();
  const deptNameMap = new Map(departments.map((d) => [d._id, d.name]));

  // Check if question asks about department absenteeism
  const q = question.toLowerCase();
  const isDeptAbsenteeism =
    q.includes("department") ||
    q.includes("dept") ||
    q.includes("highest") ||
    q.includes("absenteeism") ||
    q.includes("absent");

  if (isDeptAbsenteeism) {
    const employees = await Employee.find(
      scopedIds?.length ? { _id: { $in: scopedIds } } : {},
    )
      .select("_id departmentId")
      .lean();

    const empDeptMap = new Map(
      employees.map((e) => [e._id, deptNameMap.get(e.departmentId) || "General"]),
    );

    const logs = await Attendance.find(matchQuery).select("employeeId status").lean();

    const statsByDept = new Map<string, { total: number; absent: number; present: number }>();

    for (const log of logs) {
      const deptName = empDeptMap.get(log.employeeId) || "General";
      if (!statsByDept.has(deptName)) {
        statsByDept.set(deptName, { total: 0, absent: 0, present: 0 });
      }
      const s = statsByDept.get(deptName)!;
      s.total += 1;
      if (log.status === "ABSENT") {
        s.absent += 1;
      } else if (log.status === "PRESENT" || log.status === "WORK_FROM_HOME") {
        s.present += 1;
      }
    }

    const tableRows: (string | number)[][] = [];
    const chartData: { label: string; value: number }[] = [];

    const sortedDepts = Array.from(statsByDept.entries())
      .map(([name, stat]) => {
        const rate = stat.total > 0 ? (stat.absent / stat.total) * 100 : 0;
        return {
          name,
          absentRate: Math.round(rate * 10) / 10,
          absentCount: stat.absent,
          totalDays: stat.total,
        };
      })
      .sort((a, b) => b.absentRate - a.absentRate);

    for (const d of sortedDepts) {
      tableRows.push([d.name, `${d.absentRate}%`, d.absentCount, d.totalDays]);
      chartData.push({ label: d.name, value: d.absentRate });
    }

    const highest = sortedDepts[0];

    return {
      domain: "ATTENDANCE",
      answerText: highest
        ? `${highest.name} has the highest absenteeism rate at ${highest.absentRate}% (${highest.absentCount} absence days across ${highest.totalDays} tracked shifts).`
        : "No attendance absence data recorded for the selected time period.",
      keyMetric: highest
        ? {
            label: "Highest Absenteeism",
            value: `${highest.name} (${highest.absentRate}%)`,
            subtext: `${highest.absentCount} absences recorded`,
          }
        : undefined,
      actionLink: {
        label: "View Attendance Records",
        url: "/app/attendance",
        description: "Relocate to Attendance management",
      },
      table: {
        columns: ["Department", "Absenteeism Rate", "Absent Days", "Total Shifts"],
        rows: tableRows.slice(0, 10),
      },
      chartData: chartData.slice(0, 8),
    };
  }

  // General Attendance Overview
  const [totalRecords, presentRecords, absentRecords, lateRecords] = await Promise.all([
    Attendance.countDocuments(matchQuery),
    Attendance.countDocuments({ ...matchQuery, status: { $in: ["PRESENT", "WORK_FROM_HOME"] } }),
    Attendance.countDocuments({ ...matchQuery, status: "ABSENT" }),
    Attendance.countDocuments({ ...matchQuery, isLate: true }),
  ]);

  const attRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 1000) / 10 : 0;

  return {
    domain: "ATTENDANCE",
    answerText: `Overall attendance consistency is ${attRate}% with ${presentRecords} present shifts, ${absentRecords} absences, and ${lateRecords} late arrivals recorded.`,
    keyMetric: {
      label: "Attendance Rate",
      value: `${attRate}%`,
      subtext: `${presentRecords} of ${totalRecords} shifts`,
    },
    actionLink: {
      label: "View Attendance Records",
      url: "/app/attendance",
      description: "Relocate to Attendance management",
    },
    table: {
      columns: ["Status Metric", "Count", "Percentage"],
      rows: [
        ["Present / WFH", presentRecords, `${attRate}%`],
        ["Absent", absentRecords, totalRecords > 0 ? `${Math.round((absentRecords / totalRecords) * 100)}%` : "0%"],
        ["Late Records", lateRecords, totalRecords > 0 ? `${Math.round((lateRecords / totalRecords) * 100)}%` : "0%"],
      ],
    },
    chartData: [
      { label: "Present", value: presentRecords },
      { label: "Absent", value: absentRecords },
      { label: "Late", value: lateRecords },
    ],
  };
}

// 2. WORKFORCE & HEADCOUNT
async function executeWorkforceQuery(
  question: string,
  filters: ReportFilters,
  scopedIds?: string[],
): Promise<Omit<AskHrResult, "question" | "suggestedFollowUps" | "source">> {
  const query: Record<string, any> = {
    ...(scopedIds?.length ? { _id: { $in: scopedIds } } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
  };

  const departments = await Department.find().select("_id name").lean();
  const deptNameMap = new Map(departments.map((d) => [d._id, d.name]));

  const q = question.toLowerCase();

  // Check recent hires
  if (q.includes("recent") || q.includes("hire") || q.includes("join") || q.includes("new")) {
    const recentEmployees = await Employee.find(query)
      .sort({ dateOfJoining: -1 })
      .limit(10)
      .select("employeeCode firstName lastName departmentId dateOfJoining employmentType status")
      .lean();

    const rows = recentEmployees.map((e) => [
      e.employeeCode,
      `${e.firstName} ${e.lastName}`,
      deptNameMap.get(e.departmentId) || "General",
      e.dateOfJoining || "—",
      e.employmentType || "FULL_TIME",
      e.status,
    ]);

    const deptCountMap = new Map<string, number>();
    recentEmployees.forEach((e) => {
      const dName = deptNameMap.get(e.departmentId) || "General";
      deptCountMap.set(dName, (deptCountMap.get(dName) || 0) + 1);
    });
    const recentDeptChart = Array.from(deptCountMap.entries()).map(([label, value]) => ({ label, value }));

    return {
      domain: "WORKFORCE",
      answerText: `Found ${recentEmployees.length} recently onboarded employees. Latest joined on ${recentEmployees[0]?.dateOfJoining || "record"}.`,
      keyMetric: {
        label: "Recent Onboardings",
        value: `${recentEmployees.length} employees`,
        subtext: "Sorted by date of joining",
      },
      table: {
        columns: ["Emp Code", "Full Name", "Department", "Joining Date", "Type", "Status"],
        rows,
      },
      chartData: recentDeptChart.length > 0 ? recentDeptChart : undefined,
    };
  }

  // Department Headcount breakdown
  const [totalCount, activeCount, deptBreakdown] = await Promise.all([
    Employee.countDocuments(query),
    Employee.countDocuments({ ...query, status: "ACTIVE" }),
    Employee.aggregate([
      { $match: query },
      { $group: { _id: "$departmentId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const tableRows = deptBreakdown.map((d) => {
    const name = deptNameMap.get(d._id) || "General";
    return [name, d.count, totalCount > 0 ? `${Math.round((d.count / totalCount) * 100)}%` : "0%"];
  });

  const chartData = deptBreakdown.map((d) => ({
    label: deptNameMap.get(d._id) || "General",
    value: d.count,
  }));

  const largest = tableRows[0];

  return {
    domain: "WORKFORCE",
    answerText: `Total workforce is ${totalCount} personnel (${activeCount} currently active). ${largest ? `The largest department is ${largest[0]} with ${largest[1]} employees.` : ""}`,
    keyMetric: {
      label: "Total Headcount",
      value: `${totalCount}`,
      subtext: `${activeCount} active personnel`,
    },
    actionLink: {
      label: "View Employee Directory",
      url: "/app/employees",
      description: "Relocate to Employee Directory",
    },
    table: {
      columns: ["Department", "Staff Count", "Share"],
      rows: tableRows,
    },
    chartData: chartData.slice(0, 8),
  };
}

// 3. PAYROLL & COMPENSATION
async function executePayrollQuery(
  question: string,
  filters: ReportFilters,
  scopedIds?: string[],
): Promise<Omit<AskHrResult, "question" | "suggestedFollowUps" | "source">> {
  const matchQuery: Record<string, any> = {
    ...(scopedIds?.length ? { employeeId: { $in: scopedIds } } : {}),
  };

  const [payslips, runs] = await Promise.all([
    Payslip.find(matchQuery).select("grossEarnings netPay totalDeductions lop status").lean(),
    PayrollRun.find().sort({ year: -1, month: -1 }).limit(6).lean(),
  ]);

  let totalGross = 0;
  let totalNet = 0;
  let totalDeductions = 0;
  let totalLop = 0;

  payslips.forEach((p) => {
    totalGross += Number(p.grossEarnings || 0);
    totalNet += Number(p.netPay || 0);
    totalDeductions += Number(p.totalDeductions || 0);
    totalLop += Number(p.lop || 0);
  });

  const q = question.toLowerCase();
  const isTrendQuery = q.includes("trend") || q.includes("month") || q.includes("history");
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let chartData: { label: string; value: number }[] | undefined;

  if (isTrendQuery && runs.length > 0) {
    const monthly = runs
      .map((r: any) => {
        const m = Number(r.month);
        const mLabel = m >= 1 && m <= 12 ? MONTH_NAMES[m - 1] : `M${r.month}`;
        const net = Math.round(Number(r.totalNet || r.totalGross || 0));
        return {
          label: `${mLabel} ${r.year || ""}`.trim(),
          value: net,
        };
      })
      .reverse()
      .filter((item) => item.value > 0);

    if (monthly.length > 0) {
      chartData = monthly;
    }
  }

  // Fallback to component breakdown if not a trend query or no monthly data
  if (!chartData || chartData.length === 0) {
    const breakdown = [
      { label: "Net Pay", value: Math.round(totalNet) },
      { label: "Deductions", value: Math.round(totalDeductions) },
      { label: "Loss of Pay", value: Math.round(totalLop) },
    ].filter((b) => b.value > 0);

    if (breakdown.length > 0) {
      chartData = breakdown;
    }
  }

  return {
    domain: "PAYROLL",
    answerText: `Total disbursed payroll stands at ${formatCurrencyINR(totalNet)} net (${formatCurrencyINR(totalGross)} gross), with ${formatCurrencyINR(totalDeductions)} in total deductions and ${formatCurrencyINR(totalLop)} in Loss of Pay penalties across ${payslips.length} payslips.`,
    keyMetric: {
      label: "Net Payroll Expense",
      value: formatCurrencyINR(totalNet),
      subtext: `${formatCurrencyINR(totalGross)} gross total`,
    },
    actionLink: {
      label: "View Payroll Module",
      url: "/app/payroll",
      description: "Relocate to Payroll Management",
    },
    table: {
      columns: ["Payroll Metric", "Amount (INR)", "Share of Gross"],
      rows: [
        ["Total Net Pay", formatCurrencyINR(totalNet), totalGross > 0 ? `${Math.round((totalNet / totalGross) * 100)}%` : "—"],
        ["Total Deductions", formatCurrencyINR(totalDeductions), totalGross > 0 ? `${Math.round((totalDeductions / totalGross) * 100)}%` : "—"],
        ["Loss of Pay (LOP)", formatCurrencyINR(totalLop), totalGross > 0 ? `${Math.round((totalLop / totalGross) * 100)}%` : "—"],
        ["Total Gross", formatCurrencyINR(totalGross), "100%"],
      ],
    },
    chartData,
  };
}

// 4. TICKETS & HELPDESK
async function executeTicketsQuery(
  question: string,
  filters: ReportFilters,
  scopedIds?: string[],
): Promise<Omit<AskHrResult, "question" | "suggestedFollowUps" | "source">> {
  const matchQuery: Record<string, any> = {
    ...(scopedIds?.length ? { employeeId: { $in: scopedIds } } : {}),
  };

  const [totalTickets, openTickets, highPriorityTickets, byCategory] = await Promise.all([
    Ticket.countDocuments(matchQuery),
    Ticket.countDocuments({ ...matchQuery, status: { $in: ["OPEN", "IN_PROGRESS"] } }),
    Ticket.countDocuments({ ...matchQuery, priority: "HIGH", status: { $in: ["OPEN", "IN_PROGRESS"] } }),
    Ticket.aggregate([
      { $match: matchQuery },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const chartData = byCategory.map((c) => ({
    label: String(c._id || "Other"),
    value: c.count,
  }));

  const tableRows = byCategory.map((c) => [
    String(c._id || "Other"),
    c.count,
    totalTickets > 0 ? `${Math.round((c.count / totalTickets) * 100)}%` : "0%",
  ]);

  return {
    domain: "TICKETS",
    answerText: `There are currently ${openTickets} unresolved support ticket(s) out of ${totalTickets} total queries. Notably, ${highPriorityTickets} open ticket(s) are flagged as HIGH priority requiring immediate intervention.`,
    keyMetric: {
      label: "Open Tickets",
      value: `${openTickets}`,
      subtext: `${highPriorityTickets} high priority`,
    },
    actionLink: {
      label:
        highPriorityTickets > 0 && question.toLowerCase().includes("high")
          ? `View ${highPriorityTickets} High-Priority Tickets`
          : `View ${openTickets} Open Tickets`,
      url:
        highPriorityTickets > 0 && question.toLowerCase().includes("high")
          ? "/app/tickets?status=OPEN&priority=HIGH"
          : "/app/tickets?status=OPEN",
      description: "Relocate directly to Helpdesk ticket queue",
    },
    table: {
      columns: ["Category", "Total Queries", "Share"],
      rows: tableRows,
    },
    chartData,
  };
}

// 5. LEAVE REQUESTS
async function executeLeaveQuery(
  question: string,
  filters: ReportFilters,
  scopedIds?: string[],
): Promise<Omit<AskHrResult, "question" | "suggestedFollowUps" | "source">> {
  const matchQuery: Record<string, any> = {
    ...(scopedIds?.length ? { employeeId: { $in: scopedIds } } : {}),
  };

  const [totalLeaves, pendingLeaves, byType] = await Promise.all([
    LeaveRequest.countDocuments(matchQuery),
    LeaveRequest.countDocuments({ ...matchQuery, status: "PENDING" }),
    LeaveRequest.aggregate([
      { $match: matchQuery },
      { $group: { _id: "$leaveType", totalDays: { $sum: "$days" }, count: { $sum: 1 } } },
      { $sort: { totalDays: -1 } },
    ]),
  ]);

  const chartData = byType.map((t) => ({
    label: String(t._id || "Other"),
    value: t.totalDays,
  }));

  const tableRows = byType.map((t) => [
    String(t._id || "Other"),
    t.totalDays,
    t.count,
  ]);

  return {
    domain: "LEAVE",
    answerText: `A total of ${totalLeaves} leave requests have been logged with ${pendingLeaves} awaiting manager approval. The highest leave category taken is ${tableRows[0]?.[0] || "Casual Leave"} (${tableRows[0]?.[1] || 0} days).`,
    keyMetric: {
      label: "Pending Leave Approvals",
      value: `${pendingLeaves}`,
      subtext: `${totalLeaves} total requests logged`,
    },
    actionLink: {
      label: pendingLeaves > 0 ? `Review ${pendingLeaves} Pending Leaves` : "View Leave Requests",
      url: "/app/leave",
      description: "Relocate to Leave Management",
    },
    table: {
      columns: ["Leave Type", "Total Days Taken", "Number of Requests"],
      rows: tableRows,
    },
    chartData,
  };
}

// 6. PERFORMANCE
async function executePerformanceQuery(
  question: string,
  filters: ReportFilters,
  scopedIds?: string[],
): Promise<Omit<AskHrResult, "question" | "suggestedFollowUps" | "source">> {
  const matchQuery: Record<string, any> = {
    ...(scopedIds?.length ? { employeeId: { $in: scopedIds } } : {}),
  };

  const reviews = await PerformanceReview.find(matchQuery).select("overallRating rating finalRating status").lean();

  let ratingSum = 0;
  let count = 0;

  const ratingBands: Record<string, number> = {
    "Outstanding (4.5-5.0)": 0,
    "Exceeds (3.5-4.4)": 0,
    "Meets (2.5-3.4)": 0,
    "Needs Work (< 2.5)": 0,
  };

  reviews.forEach((r: any) => {
    const score = Number(r.finalRating || r.overallRating || r.rating || 0);
    if (score > 0) {
      ratingSum += score;
      count += 1;
      if (score >= 4.5) ratingBands["Outstanding (4.5-5.0)"] += 1;
      else if (score >= 3.5) ratingBands["Exceeds (3.5-4.4)"] += 1;
      else if (score >= 2.5) ratingBands["Meets (2.5-3.4)"] += 1;
      else ratingBands["Needs Work (< 2.5)"] += 1;
    }
  });

  const avgRating = count > 0 ? Math.round((ratingSum / count) * 100) / 100 : 0;

  const chartData = Object.entries(ratingBands)
    .filter(([_, val]) => val > 0)
    .map(([label, value]) => ({ label, value }));

  return {
    domain: "PERFORMANCE",
    answerText: `Across ${reviews.length} employee review cycles recorded, the organization-wide average performance rating is ${avgRating} out of 5.0.`,
    keyMetric: {
      label: "Average Performance Rating",
      value: `${avgRating} / 5.0`,
      subtext: `Based on ${count} evaluated reviews`,
    },
    actionLink: {
      label: "View Performance Reviews",
      url: "/app/performance",
      description: "Relocate to Performance Appraisals",
    },
    table: {
      columns: ["Metric", "Value"],
      rows: [
        ["Total Reviews Completed", count],
        ["Average Rating", `${avgRating} / 5.0`],
        ["Review Completion Status", count === reviews.length ? "100%" : `${count} of ${reviews.length}`],
      ],
    },
    chartData: chartData.length > 0 ? chartData : undefined,
  };
}

// ============================================================================
// INTENT ROUTER & AI ORCHESTRATOR
// ============================================================================

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export async function askHrData(
  question: string,
  filters: ReportFilters = {},
  userRole: string = "SUPER_ADMIN",
  userEmployeeId: string | null = null,
  history: ChatHistoryMessage[] = [],
): Promise<AskHrResult> {
  const cleanQ = question.trim();
  const scopedIds = await resolveScope(userRole, userEmployeeId, filters.departmentId);

  // Determine domain via keywords
  const qLower = cleanQ.toLowerCase();
  let detectedDomain: HrDomain = "GENERAL";

  if (
    qLower.includes("absent") ||
    qLower.includes("attendance") ||
    qLower.includes("late") ||
    qLower.includes("check in") ||
    qLower.includes("clock in") ||
    qLower.includes("punctual") ||
    qLower.includes("shift")
  ) {
    detectedDomain = "ATTENDANCE";
  } else if (
    qLower.includes("headcount") ||
    qLower.includes("employee") ||
    qLower.includes("staff") ||
    qLower.includes("hire") ||
    qLower.includes("joined") ||
    qLower.includes("workforce") ||
    qLower.includes("department") && !qLower.includes("absent")
  ) {
    detectedDomain = "WORKFORCE";
  } else if (
    qLower.includes("payroll") ||
    qLower.includes("salary") ||
    qLower.includes("net pay") ||
    qLower.includes("gross") ||
    qLower.includes("compensation") ||
    qLower.includes("deduction") ||
    qLower.includes("lop")
  ) {
    detectedDomain = "PAYROLL";
  } else if (
    qLower.includes("ticket") ||
    qLower.includes("helpdesk") ||
    qLower.includes("support") ||
    qLower.includes("issue") ||
    qLower.includes("sla")
  ) {
    detectedDomain = "TICKETS";
  } else if (
    qLower.includes("leave") ||
    qLower.includes("sick leave") ||
    qLower.includes("vacation") ||
    qLower.includes("casual leave")
  ) {
    detectedDomain = "LEAVE";
  } else if (
    qLower.includes("performance") ||
    qLower.includes("rating") ||
    qLower.includes("review") ||
    qLower.includes("appraisal")
  ) {
    detectedDomain = "PERFORMANCE";
  } else {
    detectedDomain = "WORKFORCE";
  }

  // Execute database aggregation for the domain
  let rawResult: Omit<AskHrResult, "question" | "suggestedFollowUps" | "source">;

  switch (detectedDomain) {
    case "ATTENDANCE":
      rawResult = await executeAttendanceQuery(cleanQ, filters, scopedIds);
      break;
    case "PAYROLL":
      rawResult = await executePayrollQuery(cleanQ, filters, scopedIds);
      break;
    case "TICKETS":
      rawResult = await executeTicketsQuery(cleanQ, filters, scopedIds);
      break;
    case "LEAVE":
      rawResult = await executeLeaveQuery(cleanQ, filters, scopedIds);
      break;
    case "PERFORMANCE":
      rawResult = await executePerformanceQuery(cleanQ, filters, scopedIds);
      break;
    case "WORKFORCE":
    default:
      rawResult = await executeWorkforceQuery(cleanQ, filters, scopedIds);
      break;
  }

  // Contextual follow-up suggestions
  const followUpsMap: Record<HrDomain, string[]> = {
    ATTENDANCE: [
      "Show me chronic late clock-ins by department",
      "Which employees have the highest absence records?",
      "What is our weekly overtime distribution?",
    ],
    WORKFORCE: [
      "Who are the recent hires joined this quarter?",
      "What is the department breakdown by employment type?",
      "Show me active vs onboarding employee ratios",
    ],
    PAYROLL: [
      "What were our total salary deductions last month?",
      "How much Loss of Pay (LOP) was deducted this cycle?",
      "Show me monthly net payroll trend for the last 6 runs",
    ],
    TICKETS: [
      "Show me open high-priority support tickets",
      "Which helpdesk category has the longest resolution SLA?",
      "How many tickets were resolved this month?",
    ],
    LEAVE: [
      "Which employees have taken the most leave days?",
      "How many pending leave requests require approval?",
      "What is the breakdown between Sick and Casual leave?",
    ],
    PERFORMANCE: [
      "Which department has the highest average performance rating?",
      "How many review cycles are currently incomplete?",
      "What is the distribution of 4+ star performance ratings?",
    ],
    RECRUITMENT: [
      "What is our offer acceptance rate across tech roles?",
      "How many open vacancies are actively recruiting?",
      "Show me the application-to-interview conversion rate",
    ],
    GENERAL: [
      "Which department has the highest absenteeism?",
      "What was our total payroll expense?",
      "Show me open support tickets",
    ],
  };

  const defaultFollowUps = followUpsMap[detectedDomain] || followUpsMap.GENERAL;

  // Try LLM enhancement if Groq API key is available
  if (env.groqApiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

      const historyContext =
        Array.isArray(history) && history.length > 0
          ? `Conversation history:\n${history
              .slice(-4)
              .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`)
              .join("\n")}\n\n`
          : "";

      const prompt = `You are an executive HR intelligence assistant for Aadhyaraj HRMS.
${historyContext}Current user question: "${cleanQ}"
Based on our verified database records:
Summary data: ${rawResult.answerText}
Key Metric: ${JSON.stringify(rawResult.keyMetric || {})}
Data table preview: ${JSON.stringify(rawResult.table?.rows?.slice(0, 5) || [])}

Provide a concise, highly polished executive response answering the user's specific question directly within the context of this conversation.
Rules:
1. Maximum 2 clear sentences. Direct and authoritative.
2. If monetary values are mentioned, use INR (₹ or Lakhs/Crores), NEVER USD ($).
3. Output strictly valid JSON:
{
  "refinedAnswer": "Your concise direct answer text here",
  "suggestedFollowUps": ["Question 1", "Question 2", "Question 3"]
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
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 300,
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
            ...rawResult,
            question: cleanQ,
            answerText: parsed.refinedAnswer || rawResult.answerText,
            suggestedFollowUps:
              Array.isArray(parsed.suggestedFollowUps) && parsed.suggestedFollowUps.length > 0
                ? parsed.suggestedFollowUps
                : defaultFollowUps,
            source: "llm",
          };
        }
      }
    } catch (err) {
      // Fallback silently to rule-based result
    }
  }

  return {
    ...rawResult,
    question: cleanQ,
    suggestedFollowUps: defaultFollowUps,
    source: "rule",
  };
}
