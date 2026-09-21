// path: src/services/retentionRadar.service.ts
//
// Predictive Retention & Flight-Risk Radar Service
// Correlates cross-module signals across Payroll, Attendance, Leaves,
// Tickets, and Performance Reviews to calculate employee Flight Risk (0-100%),
// identify department vulnerabilities, and generate AI-powered manager stay-interview playbooks.

import { env } from "../config/env";
import {
  Attendance,
  Department,
  Designation,
  Employee,
  LeaveRequest,
  Payslip,
  PerformanceReview,
  Ticket,
} from "../db/models";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const LLM_TIMEOUT_MS = 9000;

export type RiskLevel = "CRITICAL" | "ELEVATED" | "MODERATE" | "STABLE";

export interface RiskDimensionBreakdown {
  score: number; // 0 to 100
  level: RiskLevel;
  primarySignal: string;
}

export interface EmployeeRiskProfile {
  employeeId: string;
  employeeCode: string;
  name: string;
  email: string;
  departmentId: string;
  departmentName: string;
  designation: string;
  tenureMonths: number;
  flightRiskScore: number; // 0 to 100
  riskLevel: RiskLevel;
  estimatedReplacementCostINR: number;
  dimensions: {
    compensation: RiskDimensionBreakdown;
    burnout: RiskDimensionBreakdown;
    leaveDisengagement: RiskDimensionBreakdown;
    grievanceSentiment: RiskDimensionBreakdown;
  };
  dominantFactors: string[];
  suggestedAction: string;
}

export interface DepartmentVulnerability {
  departmentId: string;
  departmentName: string;
  headcount: number;
  avgRiskScore: number;
  vulnerabilityLevel: RiskLevel;
  criticalCount: number;
  elevatedCount: number;
  topRiskDriver: string;
}

export interface RetentionPlaybook {
  priority: "HIGH" | "MEDIUM" | "LOW";
  targetScope: string;
  diagnosis: string;
  recommendedAction: string;
  stayInterviewQuestions: string[];
  expectedImpact: string;
}

export interface RetentionRadarResult {
  orgRiskIndex: number; // 0 to 100
  orgRiskLevel: RiskLevel;
  totalAuditedEmployees: number;
  criticalRiskCount: number;
  elevatedRiskCount: number;
  moderateRiskCount: number;
  stableCount: number;
  totalReplacementExposureINR: number;
  dominantOrgRiskDriver: string;
  executiveSummary: string;
  keyVulnerabilityFindings: string[];
  departmentVulnerabilities: DepartmentVulnerability[];
  employeeRoster: EmployeeRiskProfile[];
  managerPlaybooks: RetentionPlaybook[];
  source: "llm" | "deterministic";
  generatedAt: string;
}

export interface RetentionRadarFilters {
  departmentId?: string;
  minRiskLevel?: RiskLevel;
  dateFrom?: string;
  dateTo?: string;
}

function scoreToLevel(score: number): RiskLevel {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "ELEVATED";
  if (score >= 25) return "MODERATE";
  return "STABLE";
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

/**
 * Calculates predictive flight risk and retention intelligence
 */
export async function getRetentionRadar(
  filters: RetentionRadarFilters = {},
  userRole: string = "SUPER_ADMIN",
  userEmployeeId: string | null = null,
): Promise<RetentionRadarResult> {
  // 1. Fetch Reference Metadata
  const [departments, designations, employees] = await Promise.all([
    Department.find({}, { name: 1 }).lean().exec(),
    Designation.find({}, { title: 1 }).lean().exec(),
    Employee.find({ isArchived: { $ne: true } })
      .select("_id employeeCode firstName lastName personalEmail departmentId designationId dateOfJoining status grade managerId")
      .lean()
      .exec(),
  ]);

  const deptMap = new Map<string, string>(departments.map((d: any) => [String(d._id), d.name]));
  const desigMap = new Map<string, string>(designations.map((d: any) => [String(d._id), d.title]));

  // Filter employees if department or manager scope applies
  let scopedEmployees = employees;
  if (filters.departmentId) {
    scopedEmployees = scopedEmployees.filter((e) => String(e.departmentId) === filters.departmentId);
  }

  // 2. Fetch Cross-Module Signal Records
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [attendances, payslips, leaveRequests, tickets, reviews] = await Promise.all([
    Attendance.find({
      date: { $gte: ninetyDaysAgo },
      employeeId: { $in: scopedEmployees.map((e) => e._id) },
    })
      .select("employeeId date status workHours overtimeHours isLate shiftId")
      .lean()
      .exec(),

    Payslip.find({
      employeeId: { $in: scopedEmployees.map((e) => e._id) },
    })
      .sort({ year: -1, month: -1 })
      .select("employeeId grossEarnings netPay totalDeductions lop basic basicSalary grossSalary netSalary year month status")
      .lean()
      .exec(),

    LeaveRequest.find({
      appliedAt: { $gte: ninetyDaysAgo },
      employeeId: { $in: scopedEmployees.map((e) => e._id) },
    })
      .select("employeeId leaveType daysCount status appliedAt startDate endDate reason")
      .lean()
      .exec(),

    Ticket.find({
      employeeId: { $in: scopedEmployees.map((e) => e._id) },
    })
      .select("employeeId category priority status isEscalated createdAt subject aiSentiment")
      .lean()
      .exec(),

    PerformanceReview.find({
      employeeId: { $in: scopedEmployees.map((e) => e._id) },
    })
      .select("employeeId rating managerRating overallScore reviewCycleId createdAt")
      .lean()
      .exec(),
  ]);

  // Index telemetry by employee ID
  const attendanceByEmp = new Map<string, any[]>();
  attendances.forEach((a: any) => {
    const key = String(a.employeeId);
    if (!attendanceByEmp.has(key)) attendanceByEmp.set(key, []);
    attendanceByEmp.get(key)!.push(a);
  });

  const payslipsByEmp = new Map<string, any[]>();
  payslips.forEach((p: any) => {
    const key = String(p.employeeId);
    if (!payslipsByEmp.has(key)) payslipsByEmp.set(key, []);
    payslipsByEmp.get(key)!.push(p);
  });

  const leavesByEmp = new Map<string, any[]>();
  leaveRequests.forEach((l: any) => {
    const key = String(l.employeeId);
    if (!leavesByEmp.has(key)) leavesByEmp.set(key, []);
    leavesByEmp.get(key)!.push(l);
  });

  const ticketsByEmp = new Map<string, any[]>();
  tickets.forEach((t: any) => {
    const key = String(t.employeeId);
    if (!ticketsByEmp.has(key)) ticketsByEmp.set(key, []);
    ticketsByEmp.get(key)!.push(t);
  });

  const reviewsByEmp = new Map<string, any[]>();
  reviews.forEach((r: any) => {
    const key = String(r.employeeId);
    if (!reviewsByEmp.has(key)) reviewsByEmp.set(key, []);
    reviewsByEmp.get(key)!.push(r);
  });

  // Calculate median monthly pay by designation for parity comparison
  const payByDesignation = new Map<string, number[]>();
  scopedEmployees.forEach((e: any) => {
    const empPays = payslipsByEmp.get(String(e._id));
    const latestPay = empPays && empPays.length > 0 ? empPays[0] : null;
    const gross = Number(latestPay?.grossEarnings ?? latestPay?.grossSalary ?? 45000);
    const dId = String(e.designationId || "general");
    if (!payByDesignation.has(dId)) payByDesignation.set(dId, []);
    payByDesignation.get(dId)!.push(gross);
  });

  const medianPayByDesignation = new Map<string, number>();
  payByDesignation.forEach((salaries, dId) => {
    const sorted = [...salaries].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    medianPayByDesignation.set(dId, median);
  });

  // 3. Compute 4-Dimensional Risk Score for Every Employee
  const employeeRoster: EmployeeRiskProfile[] = [];

  for (const emp of scopedEmployees) {
    const empIdStr = String(emp._id);
    const empAttendances = attendanceByEmp.get(empIdStr) || [];
    const empPays = payslipsByEmp.get(empIdStr) || [];
    const empLeaves = leavesByEmp.get(empIdStr) || [];
    const empTickets = ticketsByEmp.get(empIdStr) || [];
    const empReviews = reviewsByEmp.get(empIdStr) || [];

    // Calculate Tenure
    let tenureMonths = 12;
    if (emp.dateOfJoining) {
      const joinDate = new Date(emp.dateOfJoining);
      if (!isNaN(joinDate.getTime())) {
        tenureMonths = Math.max(1, Math.round((now.getTime() - joinDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
      }
    }

    // --- Dimension A: Compensation & Parity (Weight 30%) ---
    let compScore = 20; // baseline
    let compSignal = "Salary is within standard peer band";
    const latestPay = empPays.length > 0 ? empPays[0] : null;
    const grossPay = Number(latestPay?.grossEarnings ?? latestPay?.grossSalary ?? 45000);
    const medianPay = medianPayByDesignation.get(String(emp.designationId || "general")) || 45000;
    const deductions = Number(latestPay?.totalDeductions ?? 0);
    const deductionRatio = grossPay > 0 ? deductions / grossPay : 0;

    if (grossPay < medianPay * 0.8) {
      compScore += 50;
      compSignal = `Compensated 20%+ below designation median (${formatCurrencyINR(grossPay)} vs ${formatCurrencyINR(medianPay)})`;
    } else if (grossPay < medianPay * 0.9) {
      compScore += 30;
      compSignal = `Compensation slightly below peer benchmark (${formatCurrencyINR(grossPay)})`;
    }

    if (deductionRatio > 0.35) {
      compScore += 20;
      compSignal += "; High statutory/LOP deduction burden";
    }

    if (tenureMonths > 18 && empPays.length > 6) {
      // Check if gross was stagnant over last 6 payslips
      const oldestSample = empPays[Math.min(5, empPays.length - 1)];
      const oldGross = Number(oldestSample?.grossEarnings ?? oldestSample?.grossSalary ?? grossPay);
      if (grossPay <= oldGross * 1.02) {
        compScore += 15;
        compSignal += "; No compensation increment in 18+ months";
      }
    }
    compScore = Math.min(100, Math.max(10, compScore));

    // --- Dimension B: Burnout & Shift Fatigue (Weight 25%) ---
    let burnoutScore = 15; // baseline
    let burnoutSignal = "Normal attendance & standard work shift hours";
    const totalOtHours = empAttendances.reduce((acc, a) => acc + Number(a.overtimeHours || 0), 0);
    const lateArrivals = empAttendances.filter((a) => a.isLate === "Yes" || a.isLate === true).length;
    const absentDays = empAttendances.filter((a) => a.status === "ABSENT").length;

    if (totalOtHours > 35) {
      burnoutScore += 65;
      burnoutSignal = `Extreme overtime logged (${Math.round(totalOtHours)} hrs in 90 days); Severe burnout risk`;
    } else if (totalOtHours > 18) {
      burnoutScore += 40;
      burnoutSignal = `Elevated overtime (${Math.round(totalOtHours)} hrs in 90 days)`;
    }

    if (lateArrivals >= 6) {
      burnoutScore += 20;
      burnoutSignal += `; ${lateArrivals} late check-ins recorded (shift fatigue indicator)`;
    }
    burnoutScore = Math.min(100, Math.max(10, burnoutScore));

    // --- Dimension C: Leave Friction & Disengagement (Weight 25%) ---
    let leaveScore = 15; // baseline
    let leaveSignal = "Standard planned leave schedule";
    const totalLeaveDays = empLeaves.reduce((acc, l) => acc + Number(l.daysCount || 1), 0);
    
    // Check for short casual leave clustering (e.g. single day leave on Friday or Monday)
    let monFriLeaves = 0;
    empLeaves.forEach((l) => {
      if (l.startDate) {
        const day = new Date(l.startDate).getDay();
        if (day === 1 || day === 5) monFriLeaves += 1;
      }
    });

    if (monFriLeaves >= 3) {
      leaveScore += 45;
      leaveSignal = `Clustered Friday/Monday casual leaves (${monFriLeaves} instances) — interview signal`;
    } else if (totalLeaveDays > 10) {
      leaveScore += 30;
      leaveSignal = `Rapid leave quota consumption (${totalLeaveDays} days taken recently)`;
    }

    if (absentDays >= 4) {
      leaveScore += 25;
      leaveSignal += `; ${absentDays} unregularized absences`;
    }
    leaveScore = Math.min(100, Math.max(10, leaveScore));

    // --- Dimension D: Grievance & Review Trends (Weight 20%) ---
    let grievanceScore = 15; // baseline
    let grievanceSignal = "No unresolved complaints or negative performance flags";
    const openTickets = empTickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
    const escalatedTickets = empTickets.filter((t) => t.isEscalated || t.category === "Complaint");

    if (escalatedTickets.length > 0) {
      grievanceScore += 55;
      grievanceSignal = `Active escalated grievance/complaint record on file`;
    } else if (openTickets.length >= 2) {
      grievanceScore += 35;
      grievanceSignal = `${openTickets.length} pending helpdesk queries awaiting resolution`;
    }

    if (empReviews.length > 0) {
      const latestReview = empReviews[0];
      const rating = Number(latestReview.rating ?? latestReview.managerRating ?? 3.5);
      if (rating < 2.5 && rating > 0) {
        grievanceScore += 30;
        grievanceSignal += `; Below expectation review rating (${rating}/5)`;
      }
    }
    grievanceScore = Math.min(100, Math.max(10, grievanceScore));

    // Composite Weighted Score
    const compositeScore = Math.round(
      compScore * 0.30 +
      burnoutScore * 0.25 +
      leaveScore * 0.25 +
      grievanceScore * 0.20
    );

    const riskLevel = scoreToLevel(compositeScore);

    // Collect Dominant Factor Tags
    const dominantFactors: string[] = [];
    if (compScore >= 60) dominantFactors.push("Compensation Friction");
    if (burnoutScore >= 60) dominantFactors.push("Overtime Burnout");
    if (leaveScore >= 60) dominantFactors.push("Unplanned Absence Cluster");
    if (grievanceScore >= 60) dominantFactors.push("Escalated Grievance");
    if (dominantFactors.length === 0) {
      if (compScore >= 45) dominantFactors.push("Below Peer Pay");
      else if (burnoutScore >= 45) dominantFactors.push("Elevated Shift Hours");
      else dominantFactors.push("Stable Retention Profile");
    }

    // Suggested Immediate Action
    let suggestedAction = "Conduct standard quarterly retention touchpoint.";
    if (riskLevel === "CRITICAL") {
      suggestedAction = burnoutScore > compScore
        ? "Urgent: Schedule 1-on-1 workload balancing review with Team Lead."
        : "Urgent: Initiate compensation parity review before upcoming appraisal cycle.";
    } else if (riskLevel === "ELEVATED") {
      suggestedAction = "Manager check-in on project engagement and career pathway.";
    }

    // Replacement cost estimation (~30% of annual CTC)
    const annualCtcEstimate = grossPay * 12;
    const replacementCost = Math.round(annualCtcEstimate * 0.30);

    const empName = `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || `Employee ${emp.employeeCode}`;

    employeeRoster.push({
      employeeId: empIdStr,
      employeeCode: emp.employeeCode || empIdStr.slice(-5).toUpperCase(),
      name: empName,
      email: emp.personalEmail || "—",
      departmentId: String(emp.departmentId || "unassigned"),
      departmentName: deptMap.get(String(emp.departmentId)) || "General",
      designation: desigMap.get(String(emp.designationId)) || "Staff",
      tenureMonths,
      flightRiskScore: compositeScore,
      riskLevel,
      estimatedReplacementCostINR: replacementCost,
      dimensions: {
        compensation: { score: compScore, level: scoreToLevel(compScore), primarySignal: compSignal },
        burnout: { score: burnoutScore, level: scoreToLevel(burnoutScore), primarySignal: burnoutSignal },
        leaveDisengagement: { score: leaveScore, level: scoreToLevel(leaveScore), primarySignal: leaveSignal },
        grievanceSentiment: { score: grievanceScore, level: scoreToLevel(grievanceScore), primarySignal: grievanceSignal },
      },
      dominantFactors,
      suggestedAction,
    });
  }

  // Sort roster: highest risk first
  employeeRoster.sort((a, b) => b.flightRiskScore - a.flightRiskScore);

  // Apply minRiskLevel filter if specified
  const filteredRoster = filters.minRiskLevel
    ? employeeRoster.filter((e) => {
        if (filters.minRiskLevel === "CRITICAL") return e.riskLevel === "CRITICAL";
        if (filters.minRiskLevel === "ELEVATED") return e.riskLevel === "CRITICAL" || e.riskLevel === "ELEVATED";
        if (filters.minRiskLevel === "MODERATE") return e.riskLevel !== "STABLE";
        return true;
      })
    : employeeRoster;

  // 4. Department Vulnerability Index
  const deptGroupMap = new Map<string, EmployeeRiskProfile[]>();
  employeeRoster.forEach((emp) => {
    if (!deptGroupMap.has(emp.departmentId)) deptGroupMap.set(emp.departmentId, []);
    deptGroupMap.get(emp.departmentId)!.push(emp);
  });

  const departmentVulnerabilities: DepartmentVulnerability[] = [];
  deptGroupMap.forEach((deptEmps, dId) => {
    const totalScore = deptEmps.reduce((acc, e) => acc + e.flightRiskScore, 0);
    const avgScore = Math.round(totalScore / (deptEmps.length || 1));
    const criticals = deptEmps.filter((e) => e.riskLevel === "CRITICAL").length;
    const elevateds = deptEmps.filter((e) => e.riskLevel === "ELEVATED").length;

    // Determine top risk driver across department
    const driverCount: Record<string, number> = {};
    deptEmps.forEach((e) => {
      e.dominantFactors.forEach((f) => {
        driverCount[f] = (driverCount[f] || 0) + 1;
      });
    });
    const topDriver = Object.entries(driverCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "General Workload";

    departmentVulnerabilities.push({
      departmentId: dId,
      departmentName: deptEmps[0]?.departmentName || "General",
      headcount: deptEmps.length,
      avgRiskScore: avgScore,
      vulnerabilityLevel: scoreToLevel(avgScore),
      criticalCount: criticals,
      elevatedCount: elevateds,
      topRiskDriver: topDriver,
    });
  });

  departmentVulnerabilities.sort((a, b) => b.avgRiskScore - a.avgRiskScore);

  // 5. Macro Aggregates
  const totalAudited = employeeRoster.length;
  const criticalCount = employeeRoster.filter((e) => e.riskLevel === "CRITICAL").length;
  const elevatedCount = employeeRoster.filter((e) => e.riskLevel === "ELEVATED").length;
  const moderateCount = employeeRoster.filter((e) => e.riskLevel === "MODERATE").length;
  const stableCount = employeeRoster.filter((e) => e.riskLevel === "STABLE").length;

  const orgRiskIndex = totalAudited > 0
    ? Math.round(employeeRoster.reduce((acc, e) => acc + e.flightRiskScore, 0) / totalAudited)
    : 20;

  // Exposure = sum of replacement cost for CRITICAL and ELEVATED risk employees
  const highRiskEmployees = employeeRoster.filter((e) => e.riskLevel === "CRITICAL" || e.riskLevel === "ELEVATED");
  const totalReplacementExposureINR = highRiskEmployees.reduce((acc, e) => acc + e.estimatedReplacementCostINR, 0);

  // Dominant Org Driver
  const orgDriverCounts: Record<string, number> = {};
  highRiskEmployees.forEach((e) => {
    e.dominantFactors.forEach((f) => {
      orgDriverCounts[f] = (orgDriverCounts[f] || 0) + 1;
    });
  });
  const dominantOrgRiskDriver = Object.entries(orgDriverCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Compensation & Workload Parity";

  // 6. AI Strategic Synthesis (Groq LLM)
  let executiveSummary = `Analyzed ${totalAudited} employees across ${departmentVulnerabilities.length} departments. Overall Flight Risk Index stands at ${orgRiskIndex}% (${scoreToLevel(orgRiskIndex)}). Identified ${criticalCount} employees in the Critical Flight Risk zone with an estimated replacement exposure of ${formatCurrencyINR(totalReplacementExposureINR)}. Primary vulnerability driver: ${dominantOrgRiskDriver}.`;
  
  let keyVulnerabilityFindings = [
    `${criticalCount} staff members (${Math.round((criticalCount / (totalAudited || 1)) * 100)}%) require immediate retention intervention to mitigate impending resignation risk.`,
    `Highest department vulnerability: ${departmentVulnerabilities[0]?.departmentName || "Engineering"} with an average risk score of ${departmentVulnerabilities[0]?.avgRiskScore || 0}% driven by ${departmentVulnerabilities[0]?.topRiskDriver || "burnout"}.`,
    `Total attrition replacement exposure estimated at ${formatCurrencyINR(totalReplacementExposureINR)} based on role compensation bands.`,
  ];

  let managerPlaybooks: RetentionPlaybook[] = [
    {
      priority: "HIGH",
      targetScope: departmentVulnerabilities[0]?.departmentName || "Engineering",
      diagnosis: `Team experiencing ${departmentVulnerabilities[0]?.topRiskDriver || "elevated workload pressure"}.`,
      recommendedAction: "Mandate immediate 1-on-1 stay interviews and audit overtime shift allocations.",
      stayInterviewQuestions: [
        "What aspects of your current project workload are creating the most friction?",
        "Do you feel your day-to-day contributions are recognized and aligned with your career trajectory?",
        "If you could change one operational bottleneck tomorrow, what would it be?",
      ],
      expectedImpact: "Lowers immediate resignation probability by 35% within 30 days.",
    },
    {
      priority: "MEDIUM",
      targetScope: "Compensation & Appraisals",
      diagnosis: "Identified peer compensation lag among staff with >18 months tenure.",
      recommendedAction: "Pre-emptively benchmark compensation bands ahead of the next appraisal cycle.",
      stayInterviewQuestions: [
        "How do you view your total compensation growth relative to your scope of responsibility?",
        "Are there specific benefits or flexibility adjustments that would improve your satisfaction?",
      ],
      expectedImpact: "Mitigates talent poaching by market competitors.",
    },
  ];

  let source: "llm" | "deterministic" = "deterministic";

  if (env.groqApiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

      const promptContext = {
        totalAudited,
        orgRiskIndex,
        criticalCount,
        elevatedCount,
        totalReplacementExposureINR: formatCurrencyINR(totalReplacementExposureINR),
        dominantOrgRiskDriver,
        topVulnerableDepartments: departmentVulnerabilities.slice(0, 3).map((d) => ({
          department: d.departmentName,
          avgRisk: `${d.avgRiskScore}%`,
          criticalStaff: d.criticalCount,
          primaryDriver: d.topRiskDriver,
        })),
        criticalEmployeeSamples: employeeRoster.slice(0, 4).map((e) => ({
          designation: e.designation,
          department: e.departmentName,
          riskScore: `${e.flightRiskScore}%`,
          dominantFactors: e.dominantFactors,
        })),
      };

      const systemPrompt = `You are a Chief People Officer & AI Talent Retention Strategist for AadhyaRaj HRMS.
Analyze the employee flight-risk telemetry and provide strategic retention diagnosis and manager stay-interview playbooks.

Telemetry Data:
${JSON.stringify(promptContext, null, 2)}

Respond with strictly valid JSON:
{
  "executiveSummary": "2-3 sentence executive briefing highlighting macro risk index, headcount exposure, and strategic takeaway",
  "keyVulnerabilityFindings": ["Finding 1 with specific numbers", "Finding 2", "Finding 3"],
  "managerPlaybooks": [
    {
      "priority": "HIGH|MEDIUM|LOW",
      "targetScope": "Department or Theme",
      "diagnosis": "Root cause explanation",
      "recommendedAction": "Concrete managerial intervention",
      "stayInterviewQuestions": [
        "Stay-interview question 1 for manager to ask employee",
        "Stay-interview question 2",
        "Stay-interview question 3"
      ],
      "expectedImpact": "Expected business retention impact"
    }
  ]
}

Rules:
- Monetary figures in INR (₹ or Lakhs/Crores), NEVER USD
- Stay-interview questions must be high-EQ, professional, and practical for engineering/operations managers
- Maximum 3 playbooks`;

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
          temperature: 0.25,
          max_tokens: 650,
          response_format: { type: "json_object" },
        }),
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data: any = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (typeof parsed.executiveSummary === "string" && parsed.executiveSummary.length > 20) {
            executiveSummary = parsed.executiveSummary;
          }
          if (Array.isArray(parsed.keyVulnerabilityFindings) && parsed.keyVulnerabilityFindings.length > 0) {
            keyVulnerabilityFindings = parsed.keyVulnerabilityFindings.slice(0, 4);
          }
          if (Array.isArray(parsed.managerPlaybooks) && parsed.managerPlaybooks.length > 0) {
            managerPlaybooks = parsed.managerPlaybooks.slice(0, 3).map((pb: any) => ({
              priority: ["HIGH", "MEDIUM", "LOW"].includes(pb.priority) ? pb.priority : "MEDIUM",
              targetScope: pb.targetScope || "Departmental Retention",
              diagnosis: pb.diagnosis || "Workforce friction.",
              recommendedAction: pb.recommendedAction || "Conduct manager check-in.",
              stayInterviewQuestions: Array.isArray(pb.stayInterviewQuestions) && pb.stayInterviewQuestions.length > 0
                ? pb.stayInterviewQuestions.slice(0, 4)
                : ["What can we do to better support your day-to-day engagement?"],
              expectedImpact: pb.expectedImpact || "Reduces turnover risk.",
            }));
          }
          source = "llm";
        }
      }
    } catch {
      // Deterministic fallback preserved
    }
  }

  return {
    orgRiskIndex,
    orgRiskLevel: scoreToLevel(orgRiskIndex),
    totalAuditedEmployees: totalAudited,
    criticalRiskCount: criticalCount,
    elevatedRiskCount: elevatedCount,
    moderateRiskCount: moderateCount,
    stableCount,
    totalReplacementExposureINR,
    dominantOrgRiskDriver,
    executiveSummary,
    keyVulnerabilityFindings,
    departmentVulnerabilities,
    employeeRoster: filteredRoster,
    managerPlaybooks,
    source,
    generatedAt: new Date().toISOString(),
  };
}
