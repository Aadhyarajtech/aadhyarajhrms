// path: src/services/executiveBriefing.service.ts
//
// AI Executive HR Briefing & Management Insights Service
// Converts cross-module HR metrics into an executive-ready briefing with
// health scores, critical concerns, trend analysis, and strategic recommendations.

import { env } from "../config/env";
import { getReports, type ReportFilters } from "../modules/reports/reports.repository";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const LLM_TIMEOUT_MS = 9000;

export interface BriefingConcern {
  area: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  metric?: string;
  department?: string;
}

export interface BriefingRecommendation {
  priority: "HIGH" | "MEDIUM" | "LOW";
  category: "TALENT" | "ATTENDANCE" | "OPERATIONS" | "COST" | "COMPLIANCE";
  action: string;
  expectedImpact: string;
}

export interface DepartmentPulse {
  department: string;
  headcount: number;
  health: "HEALTHY" | "WATCH" | "AT_RISK" | "STABLE";
  keyIndicator: string;
}

export interface ExecutiveBriefingResult {
  headline: string;
  healthScore: number;
  periodLabel: string;
  executiveSummary: string;
  keyHighlights: string[];
  criticalConcerns: BriefingConcern[];
  strategicRecommendations: BriefingRecommendation[];
  departmentPulse: DepartmentPulse[];
  metricSnapshots: {
    totalHeadcount: number;
    attritionRatePercent: number;
    attendanceRatePercent: number;
    openTicketsCount: number;
    monthlyPayrollCost: number;
    avgReviewRating: number;
  };
  source: "llm" | "deterministic";
  generatedAt: string;
}

function formatCurrency(val: number): string {
  const num = Number(val);
  const safe = isNaN(num) ? 0 : num;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safe);
}

/**
 * Calculates a composite organizational health score (0 to 100)
 */
function calculateHealthScore(metrics: {
  attendanceRate: number;
  attritionRate: number;
  openTicketsRate: number;
  avgRating: number;
}): number {
  let score = 100;

  // Attendance rate (ideal is >92%)
  if (metrics.attendanceRate < 80) score -= 20;
  else if (metrics.attendanceRate < 90) score -= 10;
  else if (metrics.attendanceRate < 95) score -= 4;

  // Attrition (ideal is <8%)
  if (metrics.attritionRate > 15) score -= 20;
  else if (metrics.attritionRate > 8) score -= 10;
  else if (metrics.attritionRate > 4) score -= 4;

  // Open tickets backlog (rate of open tickets relative to total)
  if (metrics.openTicketsRate > 40) score -= 14;
  else if (metrics.openTicketsRate > 20) score -= 7;

  // Performance average (scale 1 to 5)
  if (metrics.avgRating < 3.0 && metrics.avgRating > 0) score -= 12;
  else if (metrics.avgRating < 3.5 && metrics.avgRating > 0) score -= 6;

  return Math.max(25, Math.min(99, Math.round(score)));
}

/**
 * Deterministic fallback generator that builds structured insights
 * without requiring an external LLM call.
 */
function buildDeterministicBriefing(
  reportData: Awaited<ReturnType<typeof getReports>>,
  periodLabel: string,
): ExecutiveBriefingResult {
  const wf = reportData.workforce;
  const att = reportData.attendance;
  const tkt = reportData.tickets;
  const pay = reportData.payroll;
  const perf = reportData.performance;
  const deptList = wf.byDepartment || [];

  const totalHeadcount = Number(wf.total) || 0;
  const exitsCount = Number(wf.exits) || 0;
  const recentHires = Number(wf.recentHires) || 0;

  // Rates
  const attritionRate =
    totalHeadcount > 0 ? (exitsCount / totalHeadcount) * 100 : 0;
  const attendanceRate = Number(att.attendanceRate) || 92;
  const totalTickets = Number(tkt.total) || 0;
  const resolvedTickets = Number(tkt.resolved) || 0;
  const openTickets = Math.max(0, totalTickets - resolvedTickets);
  const openTicketsRate = totalTickets > 0 ? (openTickets / totalTickets) * 100 : 0;
  const avgRating = Number(perf.averageRating) || 3.8;
  const monthlyCost = Number(pay.totalNet) || Number(pay.totalGross) || 0;

  const healthScore = calculateHealthScore({
    attendanceRate,
    attritionRate,
    openTicketsRate,
    avgRating,
  });

  // Highlights
  const keyHighlights: string[] = [];
  if (totalHeadcount > 0) {
    keyHighlights.push(
      `Workforce stands at ${totalHeadcount} employees with ${wf.active || totalHeadcount} actively deployed.`,
    );
  }
  if (recentHires > 0) {
    keyHighlights.push(
      `Successfully onboarded ${recentHires} new hire${recentHires > 1 ? "s" : ""} during this period.`,
    );
  }
  if (attendanceRate >= 88) {
    keyHighlights.push(
      `Punctuality remains robust with a ${attendanceRate.toFixed(1)}% attendance consistency rate.`,
    );
  }
  if (totalTickets > 0 && openTickets === 0) {
    keyHighlights.push(
      `100% resolution rate across all employee support and IT helpdesk requests.`,
    );
  } else if (totalTickets > 0) {
    keyHighlights.push(
      `${resolvedTickets} of ${totalTickets} employee support tickets resolved with average turnaround of ${Number(tkt.averageResolutionHours || 24).toFixed(0)}h.`,
    );
  }

  // Critical Concerns
  const criticalConcerns: BriefingConcern[] = [];
  if (attritionRate > 8) {
    criticalConcerns.push({
      area: "Retention",
      severity: attritionRate > 15 ? "HIGH" : "MEDIUM",
      title: "Elevated Turnover Rate",
      description: `Turnover rate is currently at ${attritionRate.toFixed(1)}% (${exitsCount} exits). Review exit interview feedback to address retention drivers.`,
      metric: `${attritionRate.toFixed(1)}% attrition`,
    });
  }
  if (openTicketsRate > 25 && openTickets > 2) {
    criticalConcerns.push({
      area: "Helpdesk & Operations",
      severity: openTicketsRate > 40 ? "HIGH" : "MEDIUM",
      title: "Open Support Ticket Backlog",
      description: `${openTickets} ticket(s) are currently pending resolution (${openTicketsRate.toFixed(0)}% of total queries). Support bottlenecks impact employee morale.`,
      metric: `${openTickets} open tickets`,
    });
  }
  if (criticalConcerns.length === 0) {
    criticalConcerns.push({
      area: "Operations",
      severity: "LOW",
      title: "Stable Operational Metrics",
      description:
        "No critical anomalies detected across workforce retention, attendance, or SLA thresholds.",
      metric: "Nominal",
    });
  }

  // Strategic Recommendations
  const strategicRecommendations: BriefingRecommendation[] = [
    {
      priority: attritionRate > 8 ? "HIGH" : "MEDIUM",
      category: "TALENT",
      action:
        "Conduct targeted stay-interviews across key performers and review compensation competitiveness.",
      expectedImpact:
        "Reduces voluntary attrition risk by up to 35% in critical technical and revenue roles.",
    },
    {
      priority: openTicketsRate > 25 ? "HIGH" : "LOW",
      category: "OPERATIONS",
      action:
        "Implement automated ticket triaging and assign auto-escalation rules for overdue IT & HR queries.",
      expectedImpact:
        "Restores SLA resolution turnaround and shortens average query wait times.",
    },
    {
      priority: "MEDIUM",
      category: "ATTENDANCE",
      action:
        "Review hybrid attendance patterns and enforce regularization approvals within 48 hours.",
      expectedImpact:
        "Eliminates end-of-month payroll cutoff delays caused by unapproved attendance regularizations.",
    },
  ];

  // Department Pulse
  const departmentPulse: DepartmentPulse[] = deptList.slice(0, 5).map((d: any) => {
    const count = Number(d.value || d.count) || 0;
    const isBig = count > (totalHeadcount / (deptList.length || 1));
    return {
      department: String(d.label || d._id || "General"),
      headcount: count,
      health: isBig ? "HEALTHY" : "STABLE",
      keyIndicator: `${count} team member(s) active`,
    };
  });

  const headline =
    healthScore >= 85
      ? `Strong organizational momentum with ${totalHeadcount} active personnel and high operational stability.`
      : healthScore >= 70
        ? `Moderate operational health (${healthScore}/100) — attendance is steady, but retention and ticket speed require leadership attention.`
        : `Critical operational attention needed (${healthScore}/100): attrition and support bottlenecks require immediate leadership intervention.`;

  const executiveSummary = `Workforce engagement remains steady with ${attendanceRate.toFixed(1)}% attendance across ${totalHeadcount} personnel and a solid ${avgRating.toFixed(1)}/5 performance average. Operational focus should prioritize ${openTickets > 0 ? `clearing ${openTickets} pending support queries` : "sustaining process execution"} to maintain leadership velocity.`;

  return {
    headline,
    healthScore,
    periodLabel,
    executiveSummary,
    keyHighlights,
    criticalConcerns,
    strategicRecommendations,
    departmentPulse,
    metricSnapshots: {
      totalHeadcount,
      attritionRatePercent: Math.round(attritionRate * 10) / 10,
      attendanceRatePercent: Math.round(attendanceRate * 10) / 10,
      openTicketsCount: openTickets,
      monthlyPayrollCost: monthlyCost,
      avgReviewRating: Math.round(avgRating * 10) / 10,
    },
    source: "deterministic",
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generates an executive HR briefing using Groq LLM with automatic deterministic fallback
 */
export async function generateExecutiveBriefing(
  filters: ReportFilters,
  role: string,
  employeeId: string | null,
): Promise<ExecutiveBriefingResult> {
  const reportData = await getReports(filters, role, employeeId);

  const fromDate = filters.from || `${new Date().getFullYear()}-01-01`;
  const toDate = filters.to || new Date().toISOString().slice(0, 10);
  const periodLabel = `${fromDate} to ${toDate}`;

  const fallback = buildDeterministicBriefing(reportData, periodLabel);

  if (!env.groqApiKey) {
    return fallback;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    const promptContext = {
      period: periodLabel,
      scope: reportData.scope,
      metrics: {
        workforce: {
          totalHeadcount: reportData.workforce?.total || 0,
          active: reportData.workforce?.active || 0,
          recentHires: reportData.workforce?.recentHires || 0,
          exits: reportData.workforce?.exits || 0,
          byDepartment: reportData.workforce?.byDepartment?.slice(0, 6) || [],
          byEmploymentType: reportData.workforce?.byEmploymentType || [],
        },
        attendance: {
          attendanceRate: reportData.attendance?.attendanceRate || 0,
          total: reportData.attendance?.total || 0,
          present: reportData.attendance?.present || 0,
          lateRecords: reportData.attendance?.lateRecords || 0,
          averageWorkHours: reportData.attendance?.averageWorkHours || 0,
        },
        payroll: {
          totalNet: reportData.payroll?.totalNet || 0,
          totalGross: reportData.payroll?.totalGross || 0,
          payslipCount: reportData.payroll?.payslipCount || 0,
        },
        helpdesk: {
          totalTickets: reportData.tickets?.total || 0,
          resolvedTickets: reportData.tickets?.resolved || 0,
          averageResolutionHours: reportData.tickets?.averageResolutionHours || 0,
          byPriority: reportData.tickets?.byPriority || [],
        },
        performance: {
          reviewsCount: reportData.performance?.reviews || 0,
          averageRating: reportData.performance?.averageRating || 0,
        },
        recruitment: reportData.recruitment
          ? {
              openRoles: reportData.recruitment.openRoles || 0,
              applications: reportData.recruitment.applications || 0,
              offersSent: reportData.recruitment.offersSent || 0,
              offersAccepted: reportData.recruitment.offersAccepted || 0,
              offerAcceptanceRate: reportData.recruitment.offerAcceptanceRate || 0,
            }
          : null,
      },
      precomputedHealthScore: fallback.healthScore,
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
            content: `You are an executive HR Strategy Advisor & Chief People Officer Analyst.
Your role is to convert complex cross-departmental HRMS metrics into an authoritative, punchy, C-level executive briefing.
Analyze the provided organizational data objectively. Highlight real business risks, positive momentum, and provide pragmatic leadership recommendations.

CRITICAL CONSTRAINTS:
1. "executiveSummary" MUST be strictly 2 to 3 short, punchy sentences (maximum 60 words total). Do NOT output a wall of text or multiple paragraphs. Be direct, clear, and high-impact.
2. If monetary figures are mentioned, use INR (₹ or Lakhs/Crores), NEVER USD ($).

You MUST respond strictly with a valid JSON object with this exact structure:
{
  "headline": "A sharp, 1-2 sentence executive headline capturing organizational health, workforce momentum, and key focus areas",
  "healthScore": 85,
  "executiveSummary": "Strictly 2-3 short, impactful sentences (under 60 words total) synthesizing the organizational state for leadership.",
  "keyHighlights": [
    "Highlight 1 (bullet point with numbers)",
    "Highlight 2",
    "Highlight 3"
  ],
  "criticalConcerns": [
    {
      "area": "Retention / Attendance / Helpdesk / Payroll",
      "severity": "HIGH",
      "title": "Concern title",
      "description": "2 sentence clear explanation of the issue and why it matters to the business",
      "metric": "e.g. 14.2% attrition or 5 pending tickets",
      "department": "e.g. Engineering or All Departments"
    }
  ],
  "strategicRecommendations": [
    {
      "priority": "HIGH",
      "category": "TALENT",
      "action": "Concrete, high-leverage action item for HR or leadership",
      "expectedImpact": "Quantifiable or qualitative business impact"
    }
  ],
  "departmentPulse": [
    {
      "department": "Engineering",
      "headcount": 24,
      "health": "HEALTHY",
      "keyIndicator": "Brief note on department stability"
    }
  ]
}`,
          },
          {
            role: "user",
            content: `Generate an executive HR briefing for leadership based on this data snapshot:\n${JSON.stringify(promptContext, null, 2)}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1400,
        response_format: { type: "json_object" },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(
        `[ExecutiveBriefing] Groq API returned status ${response.status}. Using deterministic fallback.`,
      );
      return fallback;
    }

    const data: any = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      return fallback;
    }

    const parsed = JSON.parse(rawContent);

    return {
      headline: parsed.headline || fallback.headline,
      healthScore:
        typeof parsed.healthScore === "number"
          ? Math.max(10, Math.min(99, parsed.healthScore))
          : fallback.healthScore,
      periodLabel,
      executiveSummary: parsed.executiveSummary || fallback.executiveSummary,
      keyHighlights:
        Array.isArray(parsed.keyHighlights) && parsed.keyHighlights.length > 0
          ? parsed.keyHighlights
          : fallback.keyHighlights,
      criticalConcerns:
        Array.isArray(parsed.criticalConcerns) && parsed.criticalConcerns.length > 0
          ? parsed.criticalConcerns
          : fallback.criticalConcerns,
      strategicRecommendations:
        Array.isArray(parsed.strategicRecommendations) &&
        parsed.strategicRecommendations.length > 0
          ? parsed.strategicRecommendations
          : fallback.strategicRecommendations,
      departmentPulse:
        Array.isArray(parsed.departmentPulse) && parsed.departmentPulse.length > 0
          ? parsed.departmentPulse
          : fallback.departmentPulse,
      metricSnapshots: fallback.metricSnapshots,
      source: "llm",
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(
      "[ExecutiveBriefing] Error generating LLM briefing, using deterministic fallback:",
      err instanceof Error ? err.message : err,
    );
    return fallback;
  }
}
