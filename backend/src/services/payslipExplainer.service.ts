// path: src/services/payslipExplainer.service.ts
//
// Feature 3: AI Payslip Explainer & Salary Assistant
// Provides plain-English breakdown, month-over-month variances, and interactive Q&A.

import { env } from "../config/env";
import { PayrollRun, Payslip } from "../db/models";
import { getPayslip } from "../modules/payroll/payroll.repository";
import { AppError } from "../utils/errors";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const LLM_TIMEOUT_MS = 8000;

export interface PayslipExplanation {
  payslipId: string;
  employeeName: string;
  month: number;
  year: number;
  summary: string;
  primaryChangeReason: string;
  keyHighlights: string[];
  deltas: {
    hasPriorMonth: boolean;
    priorMonth?: number;
    priorYear?: number;
    grossDelta: number;
    netDelta: number;
    deductionsDelta: number;
    lopDelta: number;
  };
  componentBreakdown: Array<{
    component: string;
    category: "EARNING" | "DEDUCTION" | "TAX" | "ATTENDANCE";
    amount: number;
    explanation: string;
  }>;
  faqAnswers: Record<string, string>;
  source: "llm" | "deterministic";
}

export interface PayslipQAAnswer {
  question: string;
  answer: string;
  source: "llm" | "deterministic" | "cached_faq";
}

function formatINR(val: number): string {
  const num = Number(val);
  const safe = isNaN(num) ? 0 : num;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safe);
}

/**
 * Builds deterministic fallback explanation if LLM is unavailable or times out
 */
function buildDeterministicExplanation(
  current: any,
  prior: any | null,
  employeeName: string
): Omit<PayslipExplanation, "payslipId"> {
  const gross = current.grossEarnings || 0;
  const net = current.netPay || 0;
  const deductions = current.totalDeductions || 0;
  const lop = current.lop || 0;

  const priorGross = prior ? prior.grossEarnings || 0 : gross;
  const priorNet = prior ? prior.netPay || 0 : net;
  const priorDeductions = prior ? prior.totalDeductions || 0 : deductions;
  const priorLop = prior ? prior.lop || 0 : lop;

  const grossDelta = gross - priorGross;
  const netDelta = net - priorNet;
  const deductionsDelta = deductions - priorDeductions;
  const lopDelta = lop - priorLop;

  const highlights: string[] = [];
  if (!prior) {
    highlights.push("This is your initial payslip on record for the current cycle.");
  } else {
    if (netDelta > 0) {
      highlights.push(`Net take-home pay increased by ${formatINR(netDelta)} compared to last month.`);
    } else if (netDelta < 0) {
      highlights.push(`Net take-home pay decreased by ${formatINR(Math.abs(netDelta))} compared to last month.`);
    } else {
      highlights.push("Net take-home pay remained identical to last month.");
    }

    if (lopDelta > 0) {
      highlights.push(`Loss of Pay (LOP) deduction increased by ${formatINR(lopDelta)} due to unpaid leaves or absence.`);
    } else if (lopDelta < 0) {
      highlights.push(`LOP deduction reduced by ${formatINR(Math.abs(lopDelta))}, improving your take-home pay.`);
    }

    if (deductionsDelta !== 0 && lopDelta === 0) {
      highlights.push(`Statutory/tax deductions shifted by ${formatINR(deductionsDelta)}.`);
    }
  }

  let primaryReason = "Routine monthly compensation processed with standard statutory deductions.";
  if (lopDelta > 0) {
    primaryReason = `Unpaid leave deduction of ${formatINR(lop)} impacted your net payout.`;
  } else if (netDelta !== 0) {
    primaryReason = `Variance in variable allowances and statutory deductions caused a ${netDelta > 0 ? "+" : ""}${formatINR(netDelta)} net difference.`;
  }

  const breakdown: PayslipExplanation["componentBreakdown"] = [
    {
      component: "Basic Salary",
      category: "EARNING",
      amount: current.basic || 0,
      explanation: "Fixed core compensation forming the base for PF and gratuity calculations.",
    },
    {
      component: "House Rent Allowance (HRA)",
      category: "EARNING",
      amount: current.hra || 0,
      explanation: "Allowance for accommodation expenses, eligible for tax exemption under Old Tax Regime.",
    },
    {
      component: "Special & Other Allowances",
      category: "EARNING",
      amount: (current.specialAllowance || 0) + (current.conveyance || 0) + (current.medical || 0),
      explanation: "Supplementary allowances including conveyance, medical, and special performance allowances.",
    },
    {
      component: "Provident Fund (Employee)",
      category: "DEDUCTION",
      amount: current.pf || 0,
      explanation: "Mandatory retirement savings (12% of eligible basic wage).",
    },
    {
      component: "Income Tax (TDS)",
      category: "TAX",
      amount: current.incomeTax || 0,
      explanation: `Estimated monthly TDS withheld under the ${current.taxRegime === "OLD" ? "Old" : "New"} Tax Regime.`,
    },
    {
      component: "Loss of Pay (LOP)",
      category: "ATTENDANCE",
      amount: current.lop || 0,
      explanation: lop > 0 ? `Deduction for ${current.lopDays || "recorded"} days of unpaid leave or unapproved absence.` : "No attendance deductions applied this month.",
    },
  ];

  const faqAnswers: Record<string, string> = {
    "Why is my salary different this month?": prior
      ? `Your net take-home changed by ${netDelta >= 0 ? "+" : ""}${formatINR(netDelta)}. ${primaryReason}`
      : "This is your first payslip on record, so there is no previous month comparison.",
    "How is my LOP deduction calculated?":
      lop > 0
        ? `LOP is calculated as (Gross Earnings / Total Working Days) × Unpaid Days. Total LOP deducted: ${formatINR(lop)}.`
        : "You had zero Loss of Pay (LOP) deductions for this pay period.",
    "What is the tax breakdown?": `Your monthly income tax (TDS) deduction is ${formatINR(current.incomeTax || 0)} under the ${current.taxRegime === "OLD" ? "Old" : "New"} Regime.`,
    "How is my take-home pay derived?": `Gross Earnings (${formatINR(gross)}) minus Total Deductions (${formatINR(deductions)}) equals Net Take-Home Pay (${formatINR(net)}).`,
  };

  const summary = `Your net take-home pay for ${current.month || ""}/${current.year || ""} is ${formatINR(net)}, derived from ${formatINR(gross)} gross earnings less ${formatINR(deductions)} in statutory and tax deductions. ${primaryReason}`;

  return {
    employeeName,
    month: current.month || 0,
    year: current.year || 0,
    summary,
    primaryChangeReason: primaryReason,
    keyHighlights: highlights,
    deltas: {
      hasPriorMonth: !!prior,
      priorMonth: prior?.month,
      priorYear: prior?.year,
      grossDelta,
      netDelta,
      deductionsDelta,
      lopDelta,
    },
    componentBreakdown: breakdown,
    faqAnswers,
    source: "deterministic",
  };
}

/**
 * Explains a payslip using Groq LLM with automatic deterministic fallback
 */
export async function explainPayslip(payslipId: string): Promise<PayslipExplanation> {
  const payslip = (await getPayslip(payslipId)) as any;
  if (!payslip) {
    throw AppError.notFound("Payslip not found");
  }

  const employeeName = payslip.firstName
    ? `${payslip.firstName} ${payslip.lastName || ""}`.trim()
    : "Employee";

  const month = payslip.month || new Date().getMonth() + 1;
  const year = payslip.year || new Date().getFullYear();

  // Look for previous month payslip
  const priorMonth = month === 1 ? 12 : month - 1;
  const priorYear = month === 1 ? year - 1 : year;

  let priorPayslip: any = null;
  const priorRun = await PayrollRun.findOne({ month: priorMonth, year: priorYear }).lean();
  if (priorRun) {
    const slip = await Payslip.findOne({
      payrollRunId: priorRun._id,
      employeeId: payslip.employeeId,
    }).lean();
    if (slip) {
      priorPayslip = {
        ...slip,
        month: priorMonth,
        year: priorYear,
      };
    }
  }

  const fallback = buildDeterministicExplanation(payslip, priorPayslip, employeeName);

  if (!env.groqApiKey) {
    return {
      payslipId,
      ...fallback,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    const promptPayload = {
      employee: {
        name: employeeName,
        department: payslip.department?.name || "General",
        designation: payslip.designation?.name || "Staff",
      },
      currentPayslip: {
        month: payslip.month,
        year: payslip.year,
        basic: payslip.basic,
        hra: payslip.hra,
        conveyance: payslip.conveyance,
        medical: payslip.medical,
        specialAllowance: payslip.specialAllowance,
        grossEarnings: payslip.grossEarnings,
        pf: payslip.pf,
        professionalTax: payslip.professionalTax,
        incomeTax: payslip.incomeTax,
        taxRegime: payslip.taxRegime,
        lop: payslip.lop,
        totalDeductions: payslip.totalDeductions,
        netPay: payslip.netPay,
      },
      priorPayslip: priorPayslip
        ? {
            month: priorPayslip.month,
            year: priorPayslip.year,
            grossEarnings: priorPayslip.grossEarnings,
            totalDeductions: priorPayslip.totalDeductions,
            netPay: priorPayslip.netPay,
            lop: priorPayslip.lop,
          }
        : null,
      calculatedDeltas: fallback.deltas,
    };

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
            content: `You are an expert HR & Payroll AI Assistant in India.
Analyze the employee's current payslip and compare it with the prior month (if available).
Provide a clear, reassuring, and transparent explanation in plain English.
Explain exactly why take-home pay is what it is, how LOP/tax affected it, and what changed month-over-month.

You MUST respond strictly with a valid JSON object with this exact structure:
{
  "summary": "2-3 sentence overview of take-home pay and main reason for any change",
  "primaryChangeReason": "Short single sentence explaining the main variance driver or routine status",
  "keyHighlights": ["Highlight 1", "Highlight 2", "Highlight 3"],
  "faqAnswers": {
    "Why is my salary different this month?": "...",
    "How is my LOP deduction calculated?": "...",
    "What is the tax breakdown?": "...",
    "How is my take-home pay derived?": "..."
  }
}`,
          },
          {
            role: "user",
            content: JSON.stringify(promptPayload),
          },
        ],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("Groq LLM call returned non-OK status, using deterministic fallback:", response.status);
      return { payslipId, ...fallback };
    }

    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return { payslipId, ...fallback };
    }

    const parsed = JSON.parse(content);
    return {
      payslipId,
      employeeName,
      month: payslip.month,
      year: payslip.year,
      summary: parsed.summary || fallback.summary,
      primaryChangeReason: parsed.primaryChangeReason || fallback.primaryChangeReason,
      keyHighlights: Array.isArray(parsed.keyHighlights) && parsed.keyHighlights.length > 0
        ? parsed.keyHighlights
        : fallback.keyHighlights,
      deltas: fallback.deltas,
      componentBreakdown: fallback.componentBreakdown,
      faqAnswers: { ...fallback.faqAnswers, ...(parsed.faqAnswers || {}) },
      source: "llm",
    };
  } catch (err) {
    console.warn("Error calling Groq for payslip explanation, using deterministic fallback:", err);
    return {
      payslipId,
      ...fallback,
    };
  }
}

/**
 * Interactive Q&A for an individual payslip
 */
export async function askPayslipQuestion(payslipId: string, question: string): Promise<PayslipQAAnswer> {
  const trimmed = question.trim();
  if (!trimmed) {
    throw AppError.badRequest("Question cannot be empty");
  }

  const explanation = await explainPayslip(payslipId);

  // Check pre-computed FAQ cache first for instant response
  const lowerQ = trimmed.toLowerCase();
  for (const [faqKey, faqVal] of Object.entries(explanation.faqAnswers)) {
    if (lowerQ.includes("different") || lowerQ.includes("changed") || lowerQ.includes("variance") || lowerQ.includes("less") || lowerQ.includes("more")) {
      if (faqKey.includes("different")) return { question: trimmed, answer: faqVal, source: "cached_faq" };
    }
    if (lowerQ.includes("lop") || lowerQ.includes("loss of pay") || lowerQ.includes("absent") || lowerQ.includes("unpaid")) {
      if (faqKey.includes("LOP")) return { question: trimmed, answer: faqVal, source: "cached_faq" };
    }
    if (lowerQ.includes("tax") || lowerQ.includes("tds") || lowerQ.includes("regime")) {
      if (faqKey.includes("tax")) return { question: trimmed, answer: faqVal, source: "cached_faq" };
    }
    if (lowerQ.includes("take home") || lowerQ.includes("take-home") || lowerQ.includes("net") || lowerQ.includes("derived") || lowerQ.includes("calculate")) {
      if (faqKey.includes("take-home")) return { question: trimmed, answer: faqVal, source: "cached_faq" };
    }
  }

  if (!env.groqApiKey) {
    return {
      question: trimmed,
      answer: explanation.summary,
      source: "deterministic",
    };
  }

  try {
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
            content: `You are an HR salary assistant explaining a payslip to an employee.
Answer the employee's question directly, clearly, and empathetically using the payslip details provided.
Keep your response concise (2-4 sentences max). Be accurate with figures in INR (₹).`,
          },
          {
            role: "user",
            content: `Payslip context:
Employee: ${explanation.employeeName}
Month/Year: ${explanation.month}/${explanation.year}
Summary: ${explanation.summary}
Primary variance reason: ${explanation.primaryChangeReason}
Highlights: ${explanation.keyHighlights.join("; ")}
Breakdown: ${JSON.stringify(explanation.componentBreakdown)}
Deltas vs Prior Month: ${JSON.stringify(explanation.deltas)}

Question: "${trimmed}"`,
          },
        ],
        temperature: 0.2,
        max_tokens: 350,
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        question: trimmed,
        answer: explanation.summary,
        source: "deterministic",
      };
    }

    const data: any = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim();

    return {
      question: trimmed,
      answer: answer || explanation.summary,
      source: "llm",
    };
  } catch (err) {
    console.warn("Error calling Groq for payslip Q&A:", err);
    return {
      question: trimmed,
      answer: explanation.summary,
      source: "deterministic",
    };
  }
}
