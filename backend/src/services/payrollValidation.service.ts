import { env } from "../config/env";
import {
  Employee,
  SalaryStructure,
  PayrollRun,
  Attendance,
  LeaveRequest,
} from "@/db/models";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const LLM_TIMEOUT_MS = 8000;

export interface AffectedEmployeeItem {
  id: string;
  name: string;
  code?: string;
}

export interface PayrollReadinessItem {
  id: string;
  category: "STRUCTURE" | "BANKING" | "ATTENDANCE" | "LEAVE";
  severity: "BLOCKER" | "WARNING" | "INFO";
  title: string;
  description: string;
  count?: number;
  affectedEmployees?: AffectedEmployeeItem[];
  employeeName?: string;
  employeeCode?: string;
}

export interface PayrollReadinessResult {
  month: number;
  year: number;
  score: number;
  status: "READY" | "ATTENTION" | "BLOCKED";
  totalEmployees: number;
  readyEmployees: number;
  blockersCount: number;
  warningsCount: number;
  aiSummary: string;
  recommendations: string[];
  items: PayrollReadinessItem[];
}

function monthName(month: number): string {
  const date = new Date(2000, month - 1, 1);
  return date.toLocaleString("en-US", { month: "long" });
}

export async function validatePayrollReadiness(
  month: number,
  year: number,
): Promise<PayrollReadinessResult> {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  // 1. Fetch active employees
  const activeEmployees = await Employee.find({
    status: { $in: ["ACTIVE", "NOTICE_PERIOD"] },
    isArchived: { $ne: true },
  })
    .select(
      "_id firstName lastName employeeCode bankAccountNumber bankIfscCode employeePan departmentId",
    )
    .lean();

  const totalEmployees = activeEmployees.length;
  const activeEmployeeIds = activeEmployees.map((e) => e._id);
  const employeeMap = new Map(activeEmployees.map((e) => [String(e._id), e]));

  // 2. Fetch salary structures for active employees
  const structures = await SalaryStructure.find({
    employeeId: { $in: activeEmployeeIds },
  }).lean();
  const structureMap = new Map(structures.map((s) => [String(s.employeeId), s]));

  // 3. Fetch current payroll run for the month if any
  const existingRun = await PayrollRun.findOne({ month, year }).lean();

  // 4. Fetch attendance records for the month
  const attendanceRows = await Attendance.find({
    employeeId: { $in: activeEmployeeIds },
    date: { $regex: `^${prefix}-` },
  })
    .select("employeeId date checkIn checkOut status isRegularized")
    .lean();

  // 5. Fetch pending leave requests that overlap with this month
  const pendingLeaves = await LeaveRequest.find({
    employeeId: { $in: activeEmployeeIds },
    status: "PENDING",
    $or: [
      { startDate: { $regex: `^${prefix}` } },
      { endDate: { $regex: `^${prefix}` } },
    ],
  })
    .select("employeeId startDate endDate totalDays reason")
    .lean();

  const items: PayrollReadinessItem[] = [];

  // --- CHECK 1: Salary Structure Coverage (CRITICAL BLOCKERS) ---
  const employeesMissingStructure: typeof activeEmployees = [];
  const employeesZeroBase: typeof activeEmployees = [];

  for (const emp of activeEmployees) {
    const structure = structureMap.get(String(emp._id));
    if (!structure) {
      employeesMissingStructure.push(emp);
    } else if (structure.basic <= 0) {
      employeesZeroBase.push(emp);
    }
  }

  if (employeesMissingStructure.length > 0) {
    items.push({
      id: "struct-missing",
      category: "STRUCTURE",
      severity: "BLOCKER",
      title: "Missing Salary Structure",
      description: `${employeesMissingStructure.length} active employee(s) have no salary structure configured and will be skipped by the payroll engine.`,
      count: employeesMissingStructure.length,
      affectedEmployees: employeesMissingStructure.map((e) => ({
        id: String(e._id),
        name: `${e.firstName} ${e.lastName}`,
        code: e.employeeCode,
      })),
    });
  }

  if (employeesZeroBase.length > 0) {
    items.push({
      id: "struct-zero",
      category: "STRUCTURE",
      severity: "WARNING",
      title: "Zero Base Salary Configured",
      description: `${employeesZeroBase.length} employee(s) have configured basic salary set to ₹0.`,
      count: employeesZeroBase.length,
      affectedEmployees: employeesZeroBase.map((e) => ({
        id: String(e._id),
        name: `${e.firstName} ${e.lastName}`,
        code: e.employeeCode,
      })),
    });
  }

  // --- CHECK 2: Existing Run Finalized Check ---
  let isRunFinalized = false;
  if (existingRun && (existingRun.status === "PAID" || existingRun.status === "APPROVED")) {
    isRunFinalized = true;
    items.push({
      id: `run-finalized-${existingRun._id}`,
      category: "STRUCTURE",
      severity: "BLOCKER",
      title: `Payroll Run Already ${existingRun.status}`,
      description: `Payroll for ${monthName(month)} ${year} is already marked as ${existingRun.status}. Reprocessing requires prior approval.`,
    });
  }

  // --- CHECK 3: Banking Details & PAN Compliance (GROUPED WARNINGS) ---
  const employeesMissingBank: typeof activeEmployees = [];
  const employeesMissingPan: typeof activeEmployees = [];

  for (const emp of activeEmployees) {
    const hasAccount =
      emp.bankAccountNumber &&
      emp.bankAccountNumber.trim() !== "" &&
      emp.bankAccountNumber !== "0000000000";
    const hasIfsc =
      emp.bankIfscCode &&
      emp.bankIfscCode.trim() !== "" &&
      emp.bankIfscCode.length >= 8;

    if (!hasAccount || !hasIfsc) {
      employeesMissingBank.push(emp);
    }

    if (!emp.employeePan || emp.employeePan.trim() === "") {
      employeesMissingPan.push(emp);
    }
  }

  if (employeesMissingBank.length > 0) {
    items.push({
      id: "bank-missing",
      category: "BANKING",
      severity: "WARNING",
      title: "Incomplete Bank Account Details",
      description: `${employeesMissingBank.length} employee(s) lack a valid bank account number or IFSC code for direct disbursement.`,
      count: employeesMissingBank.length,
      affectedEmployees: employeesMissingBank.map((e) => ({
        id: String(e._id),
        name: `${e.firstName} ${e.lastName}`,
        code: e.employeeCode,
      })),
    });
  }

  if (employeesMissingPan.length > 0) {
    items.push({
      id: "pan-missing",
      category: "BANKING",
      severity: "WARNING",
      title: "Missing Permanent Account Number (PAN)",
      description: `${employeesMissingPan.length} employee(s) have no PAN recorded (statutory 20% TDS withholding risk under Section 206AA).`,
      count: employeesMissingPan.length,
      affectedEmployees: employeesMissingPan.map((e) => ({
        id: String(e._id),
        name: `${e.firstName} ${e.lastName}`,
        code: e.employeeCode,
      })),
    });
  }

  // --- CHECK 4: Attendance Status & Unregularized Logs ---
  if (!existingRun || existingRun.status === "DRAFT") {
    items.push({
      id: "att-not-locked",
      category: "ATTENDANCE",
      severity: "WARNING",
      title: "Attendance Not Yet Locked",
      description: `Attendance for ${monthName(month)} ${year} has not been locked. The payroll engine will automatically lock attendance upon processing.`,
    });
  }

  // Missing checkouts
  const missingCheckoutCount = attendanceRows.filter(
    (a) => a.checkIn && !a.checkOut,
  ).length;

  if (missingCheckoutCount > 0) {
    items.push({
      id: "att-missing-checkout",
      category: "ATTENDANCE",
      severity: "WARNING",
      title: "Unresolved Missing Punches",
      description: `${missingCheckoutCount} attendance record(s) have check-in times without recorded check-outs for ${monthName(month)}.`,
      count: missingCheckoutCount,
    });
  }

  // --- CHECK 5: Pending Leave Requests (AFFECTS LOP) ---
  if (pendingLeaves.length > 0) {
    items.push({
      id: "leave-pending",
      category: "LEAVE",
      severity: "WARNING",
      title: "Pending Leave Requests",
      description: `${pendingLeaves.length} leave request(s) are awaiting approval and may impact Loss of Pay (LOP) calculations.`,
      count: pendingLeaves.length,
      affectedEmployees: pendingLeaves.map((leave) => {
        const emp = employeeMap.get(String(leave.employeeId));
        return {
          id: String(leave._id),
          name: emp ? `${emp.firstName} ${emp.lastName}` : "Employee",
          code: emp?.employeeCode,
        };
      }),
    });
  }

  // --- COMPUTE REALISTIC & PROPORTIONAL READINESS SCORE ---
  const blockersCount =
    employeesMissingStructure.length + (isRunFinalized ? 1 : 0);

  const warningsCount =
    employeesMissingBank.length +
    employeesMissingPan.length +
    employeesZeroBase.length +
    (missingCheckoutCount > 0 ? 1 : 0) +
    (!existingRun || existingRun.status === "DRAFT" ? 1 : 0) +
    pendingLeaves.length;

  // Blocker penalties
  let blockerPenalty = 0;
  if (employeesMissingStructure.length > 0) {
    blockerPenalty += 20 + Math.min(25, employeesMissingStructure.length * 3);
  }
  if (isRunFinalized) {
    blockerPenalty += 30;
  }

  // Warning penalties (proportional & capped at 25 points maximum)
  const bankPenalty = Math.round(
    (employeesMissingBank.length / Math.max(1, totalEmployees)) * 10,
  );
  const panPenalty = Math.round(
    (employeesMissingPan.length / Math.max(1, totalEmployees)) * 8,
  );
  const attPenalty =
    (!existingRun || existingRun.status === "DRAFT" ? 2 : 0) +
    (missingCheckoutCount > 0 ? Math.min(4, Math.ceil(missingCheckoutCount * 0.5)) : 0);
  const leavePenalty = Math.min(5, pendingLeaves.length * 2);

  const totalWarningPenalty = Math.min(
    25,
    bankPenalty + panPenalty + attPenalty + leavePenalty,
  );

  let score = 100;
  let status: "READY" | "ATTENTION" | "BLOCKED" = "READY";

  if (blockersCount > 0) {
    score = Math.max(15, Math.min(60, 100 - blockerPenalty - totalWarningPenalty));
    status = "BLOCKED";
  } else {
    score = Math.max(70, Math.min(100, 100 - totalWarningPenalty));
    status = score >= 85 ? "READY" : "ATTENTION";
  }

  const readyEmployees = Math.max(
    0,
    totalEmployees - employeesMissingStructure.length,
  );

  // --- AI SYNTHESIS (GROQ LLM with DETERMINISTIC FALLBACK) ---
  const { aiSummary, recommendations } = await generateReadinessInsights({
    month,
    year,
    score,
    status,
    totalEmployees,
    readyEmployees,
    blockersCount,
    warningsCount,
    items,
  });

  return {
    month,
    year,
    score,
    status,
    totalEmployees,
    readyEmployees,
    blockersCount,
    warningsCount,
    aiSummary,
    recommendations,
    items,
  };
}

async function generateReadinessInsights(params: {
  month: number;
  year: number;
  score: number;
  status: "READY" | "ATTENTION" | "BLOCKED";
  totalEmployees: number;
  readyEmployees: number;
  blockersCount: number;
  warningsCount: number;
  items: PayrollReadinessItem[];
}): Promise<{ aiSummary: string; recommendations: string[] }> {
  const mName = monthName(params.month);

  // Fallback defaults
  const fallbackSummary =
    params.status === "BLOCKED"
      ? `Payroll readiness for ${mName} ${params.year} is currently blocked (${params.score}% score). Critical blockers must be resolved before payroll can be safely executed.`
      : params.status === "ATTENTION"
        ? `Payroll readiness for ${mName} ${params.year} is at ${params.score}% (Attention Required). All active employees have salary structures, but advisory warnings in banking or statutory PAN compliance should be reviewed.`
        : `All systems go for ${mName} ${params.year} (${params.score}% score). Employee coverage, salary structures, banking, and leaves are verified and ready for payroll processing.`;

  const fallbackRecommendations: string[] = [];
  if (params.items.some((i) => i.category === "STRUCTURE" && i.severity === "BLOCKER")) {
    fallbackRecommendations.push(
      "Assign salary structures to all active employees to prevent them from being skipped by the payroll engine.",
    );
  }
  if (params.items.some((i) => i.category === "LEAVE")) {
    fallbackRecommendations.push(
      "Approve or reject pending leave requests so Loss of Pay (LOP) days are correctly calculated.",
    );
  }
  if (params.items.some((i) => i.category === "BANKING")) {
    fallbackRecommendations.push(
      "Update missing employee bank account numbers and IFSC codes to ensure salary disbursement success.",
    );
  }
  if (fallbackRecommendations.length === 0) {
    fallbackRecommendations.push(
      "Review overtime and bonus components, then proceed to process payroll.",
    );
  }

  if (!env.groqApiKey || env.groqApiKey.trim() === "" || env.groqApiKey === "your-groq-api-key") {
    return {
      aiSummary: fallbackSummary,
      recommendations: fallbackRecommendations,
    };
  }

  try {
    const prompt = `You are an expert HRMS Payroll Auditor AI. Analyze the following pre-run validation metrics for ${mName} ${params.year}:
- Total Active Employees: ${params.totalEmployees}
- Ready with Salary Structure: ${params.readyEmployees}
- Overall Readiness Score: ${params.score}%
- Status: ${params.status}
- Critical Blockers Count: ${params.blockersCount}
- Advisory Warnings Count: ${params.warningsCount}
- Top Discovered Issues:
${params.items
  .slice(0, 6)
  .map((i) => `  * [${i.severity}] ${i.category}: ${i.title} (${i.description})`)
  .join("\n")}

Respond ONLY with valid JSON matching this schema:
{
  "aiSummary": "A concise, professional 2-3 sentence executive summary for the Finance & HR Admin team assessing whether it is safe to process payroll, matching the ${params.status} status and ${params.score}% score.",
  "recommendations": ["2 to 4 bullet points of prioritized, clear action items"]
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

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
          {
            role: "system",
            content:
              "You are an enterprise HRMS payroll auditor. Respond only with strict JSON without markdown code fences.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 400,
      }),
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = (await response.json()) as any;
      const raw = data.choices?.[0]?.message?.content?.trim() || "";
      const clean = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
      const parsed = JSON.parse(clean);

      if (
        typeof parsed.aiSummary === "string" &&
        Array.isArray(parsed.recommendations) &&
        parsed.recommendations.length > 0
      ) {
        return {
          aiSummary: parsed.aiSummary,
          recommendations: parsed.recommendations.map(String),
        };
      }
    }
  } catch {
    // Fall back gracefully
  }

  return {
    aiSummary: fallbackSummary,
    recommendations: fallbackRecommendations,
  };
}
