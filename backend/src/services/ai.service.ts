// path: src/services/ai.service.ts
//
// AI Ticket Classification Service
//
// Uses Groq API (OpenAI-compatible) to classify HR tickets.
// Returns category + intent + confidence + reason.
// Gracefully returns null on any failure — never blocks ticket creation.

import { z } from "zod";
import { env } from "@/config/env";

// =========================================================
// VALID CATEGORIES (must match the ticket schema exactly)
// =========================================================

const VALID_CATEGORIES = [
  "HR",
  "Payroll",
  "Leave",
  "Attendance",
  "Recruitment",
  "Employee Referral",
  "IT Support",
  "Complaint",
] as const;

type TicketCategory = (typeof VALID_CATEGORIES)[number];

export const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type TicketPriority = (typeof VALID_PRIORITIES)[number];

export const VALID_SENTIMENTS = [
  "POSITIVE",
  "NEUTRAL",
  "FRUSTRATED",
  "CRITICAL",
] as const;
export type TicketSentiment = (typeof VALID_SENTIMENTS)[number];

// =========================================================
// AI CLASSIFICATION RESULT
// =========================================================

export interface AIClassificationResult {
  category: TicketCategory;
  intent: string;
  confidence: number;
  reason: string;
  priority: TicketPriority;
  priorityReason: string;
  sentiment: TicketSentiment;
}

// =========================================================
// RESPONSE VALIDATION (Zod)
// =========================================================

const aiResponseSchema = z.object({
  category: z.enum(VALID_CATEGORIES),
  intent: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
  priority: z.enum(VALID_PRIORITIES).default("MEDIUM"),
  priorityReason: z.string().min(1).max(500).default("Standard operational priority"),
  sentiment: z.enum(VALID_SENTIMENTS).default("NEUTRAL"),
});

// =========================================================
// CLASSIFICATION PROMPT
// =========================================================

const SYSTEM_PROMPT = `You are an AI ticket classifier and intake analyzer for an HR Management System (HRMS).

Your job is to:
1. Classify employee support tickets into the correct category and identify the specific intent.
2. Recommend the appropriate ticket Priority (LOW, MEDIUM, HIGH) based on urgency, business impact, financial deadlines, and blockers.
3. Detect the employee's Sentiment/Tone (POSITIVE, NEUTRAL, FRUSTRATED, CRITICAL).

## Valid Categories

1. **HR** — General HR inquiries: policy questions, document requests (experience letter, offer letter), personal info updates, onboarding issues, exit/resignation, benefits inquiries, general HR questions.

2. **Payroll** — Salary and compensation issues: salary not credited, payslip requests, salary deductions, tax queries, reimbursements, bank account updates, bonus/incentive questions.

3. **Leave** — Leave-related issues: leave balance inquiries, leave application help, leave rejection issues, leave cancellation, maternity/paternity leave, leave policy questions, comp-off requests.

4. **Attendance** — Attendance-related issues: missing attendance, attendance corrections, late mark disputes, work from home requests, overtime queries, biometric issues, shift changes.

5. **Recruitment** — Hiring and recruitment: job opening inquiries, interview scheduling, hiring status, offer letter issues for new hires.

6. **Employee Referral** — Employee referral program: referral submissions, referral status checks, referral bonus queries, referral policy questions.

7. **IT Support** — Technology and systems: laptop/hardware issues, password resets, VPN issues, software installation, email issues, network problems, access permissions, printer issues.

8. **Complaint** — Formal grievances: workplace harassment, discrimination, manager issues, policy violations, workplace environment complaints, formal complaints.

## Priority Assignment Guidelines
- **HIGH**:
  1. Financial blockers: ANY delayed or unpaid salary, salary deduction issue, bank account update blocking salary, tax penalty, rent due, or bouncing EMI.
  2. Critical work blockers: Hardware failure (laptop crash, blue screen, dead, won't turn on), critical VPN/access lockout on deadline, production outage, or inability to work.
  3. Formal grievances & safety: ANY Complaint category, workplace harassment, abuse, POSH, discrimination, safety violation, or toxic manager issues.
  4. Explicit urgency keywords: "urgent", "immediately", "asap", "critical", "emergency", "blocked", "showstopper".
- **LOW**:
  Non-urgent informational inquiries: Employee referral program questions, general policy/handbook questions, routine brochure requests.
- **MEDIUM**:
  Standard operational requests (routine leave requests/approvals, attendance punch regularizations, standard software installation, routine shift changes).

## Sentiment Guidelines
- **CRITICAL**: Harassment, abuse, toxic behavior, threats of legal action or immediate resignation.
- **FRUSTRATED**: Expresses repeated follow-ups ("asked multiple times", "no one responding"), exasperation, anger, or strong dissatisfaction.
- **POSITIVE**: Expresses gratitude, polite compliments, or appreciative tone.
- **NEUTRAL**: Professional, factual, standard inquiry.

## Rules

- Classify into EXACTLY ONE category from the 8 valid categories.
- Identify a specific intent (sub-type) within the category.
- Estimate your confidence from 0.0 to 1.0. If the ticket is vague, gibberish, or has insufficient information, classify under "HR" with confidence below 0.5.
- Tickets may be in English, Hindi, or mixed Hinglish. Handle all languages.
- Output clean JSON matching the requested schema.

## Output Format

Respond with a JSON object:
{
  "category": "one of the 8 valid categories",
  "intent": "specific intent/sub-type",
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation",
  "priority": "LOW" | "MEDIUM" | "HIGH",
  "priorityReason": "brief explanation of urgency and priority recommendation",
  "sentiment": "POSITIVE" | "NEUTRAL" | "FRUSTRATED" | "CRITICAL"
}`;

// =========================================================
// GROQ API CALL
// =========================================================

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 5000;

// =========================================================
// ROBUST WEIGHTED NLP CLASSIFIER (Hybrid Fallback)
// Multi-factor scoring with whole-word boundary matching
// =========================================================

interface CategoryPattern {
  category: TicketCategory;
  rules: Array<{ regex: RegExp; weight: number }>;
  intentRules: Array<{ regex: RegExp; intent: string }>;
  defaultIntent: string;
  defaultReason: string;
}

const CATEGORY_DEFINITIONS: CategoryPattern[] = [
  // 1. IT SUPPORT
  {
    category: "IT Support",
    defaultIntent: "Laptop/Hardware Issue",
    defaultReason: "Detected hardware, network, VPN, credentials or software query",
    rules: [
      { regex: /\b(laptop|macbook|thinkpad|workstation|desktop|pc)\b/i, weight: 4 },
      { regex: /\b(vpn|openvpn|cisco|gateway|tunnel)\b/i, weight: 4 },
      { regex: /\b(blue\s*screen|bsod|crash|memory\s*management|kernel)\b/i, weight: 4 },
      { regex: /\b(wifi|wi-fi|internet|ethernet|network|ip\s*address|dns)\b/i, weight: 3 },
      { regex: /\b(password|reset\s*password|login\s*issue|locked\s*account|active\s*directory)\b/i, weight: 3 },
      { regex: /\b(monitor|hdmi|display|screen|printer|keyboard|mouse|charger)\b/i, weight: 3 },
      { regex: /\b(software|install|installation|license|docker|vscode|visual\s*studio)\b/i, weight: 3 },
      { regex: /\b(outlook|teams|email\s*access|mailbox|exchange)\b/i, weight: 3 },
      { regex: /\b(server|staging|production|aws|kubernetes|cluster|access\s*permission)\b/i, weight: 3 },
    ],
    intentRules: [
      { regex: /\b(vpn|tunnel|gateway)\b/i, intent: "VPN Issue" },
      { regex: /\b(password|credential|locked|login)\b/i, intent: "Password Reset" },
      { regex: /\b(software|install|docker|license)\b/i, intent: "Software Installation" },
      { regex: /\b(printer|paper\s*jam)\b/i, intent: "Printer Issue" },
      { regex: /\b(access|permission|iam|aws|kube)\b/i, intent: "Access Permission" },
      { regex: /\b(wifi|network|internet)\b/i, intent: "Network Issue" },
      { regex: /\b(laptop|monitor|screen|hardware|crash|bsod)\b/i, intent: "Laptop/Hardware Issue" },
    ],
  },

  // 2. PAYROLL
  {
    category: "Payroll",
    defaultIntent: "Salary Inquiry",
    defaultReason: "Detected payroll indicators relating to salary disbursement, payslip or compensation",
    rules: [
      { regex: /\b(salary|paycheck|monthly\s*pay|net\s*pay|gross\s*pay|compensation)\b/i, weight: 4 },
      { regex: /\b(not\s*credited|credit\s*nahi|nahi\s*aayi|uncredited|missing\s*salary)\b/i, weight: 4 },
      { regex: /\b(payslip|pay\s*slip|salary\s*slip)\b/i, weight: 4 },
      { regex: /\b(deduction|deducted|tax\s*deduction|unexplained\s*deduction)\b/i, weight: 3 },
      { regex: /\b(tds|form\s*16|tax\s*query|income\s*tax|investment\s*declaration)\b/i, weight: 3 },
      { regex: /\b(reimbursement|claim|travel\s*bills|food\s*bills|expense)\b/i, weight: 3 },
      { regex: /\b(bonus|incentive|appraisal\s*bonus|performance\s*bonus)\b/i, weight: 3 },
      { regex: /\b(bank\s*account|sbi|hdfc|icici|ifsc|account\s*number)\b/i, weight: 3 },
      { regex: /\b(provident\s*fund|pf\s*account|epf|gratuity)\b/i, weight: 3 },
    ],
    intentRules: [
      { regex: /\b(not\s*credited|credit\s*nahi|nahi\s*aayi|uncredited|missing\s*salary)\b/i, intent: "Salary Not Credited" },
      { regex: /\b(payslip|pay\s*slip|salary\s*slip)\b/i, intent: "Payslip Request" },
      { regex: /\b(deduction|deducted)\b/i, intent: "Salary Deduction Query" },
      { regex: /\b(tds|form\s*16|tax)\b/i, intent: "Tax Query" },
      { regex: /\b(reimbursement|claim|expense)\b/i, intent: "Reimbursement Issue" },
      { regex: /\b(bank\s*account|update\s*bank|ifsc)\b/i, intent: "Bank Account Update" },
      { regex: /\b(bonus|incentive)\b/i, intent: "Bonus/Incentive Query" },
    ],
  },

  // 3. ATTENDANCE
  {
    category: "Attendance",
    defaultIntent: "Missing Attendance",
    defaultReason: "Detected attendance regularization, biometric device or shift record keywords",
    rules: [
      { regex: /\b(biometric|thumbprint|fingerprint|scanner|sensor)\b/i, weight: 4 },
      { regex: /\b(punch|swipe|check-in|check\s*in|checkout|check\s*out)\b/i, weight: 3 },
      { regex: /\b(attendance|timesheet|regularize|regularization|marked\s*absent)\b/i, weight: 4 },
      { regex: /\b(wfh|work\s*from\s*home|working\s*remotely)\b/i, weight: 3 },
      { regex: /\b(late\s*mark|late\s*arrival|grace\s*period)\b/i, weight: 3 },
      { regex: /\b(overtime|extra\s*hours|ot\s*hours)\b/i, weight: 3 },
      { regex: /\b(shift\s*timing|night\s*shift|shift\s*change)\b/i, weight: 3 },
    ],
    intentRules: [
      { regex: /\b(biometric|fingerprint|thumbprint|scanner)\b/i, intent: "Biometric Issue" },
      { regex: /\b(punch|swipe|missed|regularize|absent)\b/i, intent: "Missing Attendance" },
      { regex: /\b(wfh|work\s*from\s*home)\b/i, intent: "Work From Home" },
      { regex: /\b(late\s*mark|late\s*arrival)\b/i, intent: "Late Mark Issue" },
      { regex: /\b(overtime|extra\s*hours)\b/i, intent: "Overtime Query" },
      { regex: /\b(shift\s*timing|shift\s*change)\b/i, intent: "Shift Change" },
    ],
  },

  // 4. LEAVE
  {
    category: "Leave",
    defaultIntent: "Leave Application Help",
    defaultReason: "Detected leave balance or time-off request terminology",
    rules: [
      { regex: /\b(leave|leaves|chutti)\b/i, weight: 3 },
      { regex: /\b(casual\s*leave|sick\s*leave|earned\s*leave|annual\s*leave)\b/i, weight: 4 },
      { regex: /\b(maternity|paternity|parental\s*leave)\b/i, weight: 4 },
      { regex: /\b(comp-off|comp\s*off|compensatory\s*off)\b/i, weight: 4 },
      { regex: /\b(vacation|time\s*off|pto|leave\s*balance|leave\s*quota)\b/i, weight: 3 },
      { regex: /\b(carry\s*forward|lapse|leave\s*cancellation)\b/i, weight: 3 },
    ],
    intentRules: [
      { regex: /\b(balance|quota|remaining)\b/i, intent: "Leave Balance Inquiry" },
      { regex: /\b(cancel|cancellation|revoke)\b/i, intent: "Leave Cancellation" },
      { regex: /\b(maternity|paternity)\b/i, intent: "Maternity/Paternity Leave" },
      { regex: /\b(comp-off|comp\s*off)\b/i, intent: "Comp-Off Request" },
      { regex: /\b(carry\s*forward|policy|rules)\b/i, intent: "Leave Policy Question" },
      { regex: /\b(apply|application|unable\s*to\s*apply)\b/i, intent: "Leave Application Help" },
    ],
  },

  // 5. COMPLAINT / GRIEVANCE
  {
    category: "Complaint",
    defaultIntent: "Manager Issue",
    defaultReason: "Detected formal grievance, harassment or workplace conduct complaint indicators",
    rules: [
      { regex: /\b(harassment|sexual\s*harassment|posh)\b/i, weight: 5 },
      { regex: /\b(discrimination|gender\s*bias|caste|racial)\b/i, weight: 5 },
      { regex: /\b(derogatory|abusive|toxic|hostile|threat|retaliation)\b/i, weight: 4 },
      { regex: /\b(unfair|biased\s*rating|appraisal\s*dispute|dispute\s*rating)\b/i, weight: 3 },
      { regex: /\b(complaint|grievance|formal\s*complaint|safety\s*violation)\b/i, weight: 4 },
      { regex: /\b(cafeteria|ventilation|cooling|suffocating|workplace\s*environment)\b/i, weight: 3 },
    ],
    intentRules: [
      { regex: /\b(harassment|sexual|posh)\b/i, intent: "Workplace Harassment" },
      { regex: /\b(discrimination|bias|gender)\b/i, intent: "Discrimination" },
      { regex: /\b(environment|cafeteria|safety|cooling)\b/i, intent: "Workplace Environment" },
      { regex: /\b(policy\s*violation|violation|code\s*of\s*conduct)\b/i, intent: "Policy Violation" },
      { regex: /\b(unfair|manager|team\s*lead|appraisal)\b/i, intent: "Manager Issue" },
    ],
  },

  // 6. EMPLOYEE REFERRAL
  {
    category: "Employee Referral",
    defaultIntent: "Referral Status",
    defaultReason: "Detected employee referral policy or candidate referral submission",
    rules: [
      { regex: /\b(referral|referred|refer\s*a\s*friend|employee\s*referral)\b/i, weight: 4 },
      { regex: /\b(referral\s*bonus|referral\s*reward|referral\s*payout)\b/i, weight: 4 },
      { regex: /\b(referral\s*status|referred\s*candidate|referral\s*portal)\b/i, weight: 4 },
    ],
    intentRules: [
      { regex: /\b(bonus|reward|payout)\b/i, intent: "Referral Bonus" },
      { regex: /\b(status|update|progress)\b/i, intent: "Referral Status" },
      { regex: /\b(submit|submission|portal|upload)\b/i, intent: "Referral Submission" },
      { regex: /\b(policy|tier|criteria)\b/i, intent: "Referral Policy" },
    ],
  },

  // 7. RECRUITMENT
  {
    category: "Recruitment",
    defaultIntent: "Job Opening Inquiry",
    defaultReason: "Detected talent acquisition or interview scheduling terms",
    rules: [
      { regex: /\b(interview|reschedule\s*interview|interview\s*scorecard)\b/i, weight: 4 },
      { regex: /\b(job\s*opening|open\s*requisition|vacancies|job\s*posting)\b/i, weight: 4 },
      { regex: /\b(candidate|candidate\s*offer|offer\s*rollout|hiring\s*drive)\b/i, weight: 3 },
      { regex: /\b(campus\s*drive|campus\s*hiring|internship\s*intake)\b/i, weight: 3 },
    ],
    intentRules: [
      { regex: /\b(interview|reschedule|scorecard)\b/i, intent: "Interview Schedule" },
      { regex: /\b(offer\s*rollout|offer\s*letter|dispatched)\b/i, intent: "Offer Letter Issue" },
      { regex: /\b(job\s*opening|requisition|vacancies|campus)\b/i, intent: "Job Opening Inquiry" },
    ],
  },

  // 8. HR (General)
  {
    category: "HR",
    defaultIntent: "General Inquiry",
    defaultReason: "Detected general HR inquiries, policy or documentation requests",
    rules: [
      { regex: /\b(experience\s*letter|relieving\s*letter|employment\s*verification|visa\s*letter)\b/i, weight: 4 },
      { regex: /\b(personal\s*info|address\s*update|emergency\s*contact)\b/i, weight: 3 },
      { regex: /\b(health\s*insurance|mediclaim|dependent\s*addition|insurance\s*policy)\b/i, weight: 3 },
      { regex: /\b(id\s*card|rfid\s*badge|access\s*card|security\s*desk)\b/i, weight: 3 },
      { regex: /\b(resignation|notice\s*period|exit\s*process|buyout)\b/i, weight: 3 },
      { regex: /\b(holiday\s*calendar|restricted\s*holiday|optional\s*holiday)\b/i, weight: 3 },
      { regex: /\b(hr\s*policy|handbook|company\s*policy)\b/i, weight: 2 },
    ],
    intentRules: [
      { regex: /\b(letter|visa|relieving|experience)\b/i, intent: "Document Request" },
      { regex: /\b(address|contact|profile|personal)\b/i, intent: "Personal Info Update" },
      { regex: /\b(insurance|mediclaim|dependent)\b/i, intent: "Benefits Inquiry" },
      { regex: /\b(id\s*card|rfid|badge|onboarding)\b/i, intent: "Onboarding Issue" },
      { regex: /\b(resignation|notice\s*period|exit|buyout)\b/i, intent: "Exit/Resignation" },
      { regex: /\b(holiday|calendar|policy)\b/i, intent: "Policy Inquiry" },
    ],
  },
];

function localHeuristicClassifier(
  subject: string,
  description: string,
  employeeCategory?: string,
): AIClassificationResult {
  const combinedText = `${subject} ${description}`;

  let bestMatch: CategoryPattern = CATEGORY_DEFINITIONS[0]; // fallback
  let highestScore = 0;

  for (const def of CATEGORY_DEFINITIONS) {
    let score = 0;
    for (const rule of def.rules) {
      if (rule.regex.test(combinedText)) {
        score += rule.weight;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = def;
    }
  }

  // If no strong pattern matched at all (score == 0), default to employee's category or HR with calibrated low confidence
  if (highestScore === 0) {
    const validCat = VALID_CATEGORIES.includes(employeeCategory as any)
      ? (employeeCategory as TicketCategory)
      : "HR";
    const prioInfo = detectUrgencyAndPriority(validCat, "General Inquiry", combinedText);
    return {
      category: validCat,
      intent: "General Inquiry",
      confidence: 0.45,
      reason: "Query does not strongly match specific department keywords; routed to General HR triage",
      priority: prioInfo.priority,
      priorityReason: prioInfo.priorityReason,
      sentiment: detectSentiment(combinedText),
    };
  }

  // Find the most specific sub-intent within the winning category
  let detectedIntent = bestMatch.defaultIntent;
  for (const intentRule of bestMatch.intentRules) {
    if (intentRule.regex.test(combinedText)) {
      detectedIntent = intentRule.intent;
      break;
    }
  }

  // Scale confidence based on evidence score (between 0.85 and 0.96)
  const confidence = Math.min(0.96, Math.max(0.85, 0.85 + highestScore * 0.01));
  const priorityInfo = detectUrgencyAndPriority(bestMatch.category, detectedIntent, combinedText);

  return {
    category: bestMatch.category,
    intent: detectedIntent,
    confidence: Number(confidence.toFixed(2)),
    reason: bestMatch.defaultReason,
    priority: priorityInfo.priority,
    priorityReason: priorityInfo.priorityReason,
    sentiment: detectSentiment(combinedText),
  };
}

/**
 * Robust heuristic priority & urgency detection
 * Consistently detects HIGH, MEDIUM, and LOW priority across English and Hinglish.
 */
function detectUrgencyAndPriority(
  category: TicketCategory,
  intent: string,
  text: string,
): { priority: TicketPriority; priorityReason: string } {
  // 1. High urgency: Financial blockers (unpaid salary, missing pay, deduction, bouncing EMI, rent due)
  const isFinancialBlocker =
    /\b(salary|paycheck|stipend|wages?|pay|bonus)\b.*?\b(not\s*(credited|received|paid|transferred|come)|pending|delayed?|missing|unpaid|nahi\s*(aayi|aaya|mila)|late|hold|deduct(ed|ion)?|discrepancy)\b/i.test(text) ||
    /\b(salary\s*not\s*(credited|received)|unpaid\s*salary|missing\s*salary|salary\s*deduction)\b/i.test(text) ||
    /\b(salary\s*(nahi\s*aayi|nahi\s*aaya|pending|delay|late|cut\s*gaya|kat\s*gaya))\b/i.test(text) ||
    /\b(rent\s*(due|pending)|emi\s*(due|bounc(e|ing)|pending)|penalty|financial\s*loss|eviction)\b/i.test(text) ||
    /\b(tax\s*penalty|it\s*notice|scrutiny\s*notice)\b/i.test(text);

  if (isFinancialBlocker) {
    return {
      priority: "HIGH",
      priorityReason: "Urgent financial blocker (salary/payroll delay, deduction, or financial penalty)",
    };
  }

  // 2. High urgency: Critical work blockers / Hardware failures
  const isWorkBlocker =
    /\b(laptop|system|machine|pc|macbook|computer)\b.*?\b(blue\s*screen|bsod|crash(ed)?|dead|broken|not\s*working|not\s*starting|won'?t\s*(start|turn\s*on|boot)|boot\s*loop|power\s*(off|failure)|black\s*screen|damaged)\b/i.test(text) ||
    /\b(laptop\s*start\s*nahi\s*ho\s*raha|laptop\s*kharab\s*hai|laptop\s*dead)\b/i.test(text) ||
    /\b(unable\s*to\s*work|cannot\s*work|blocked\s*from\s*working|work\s*is\s*blocked|production\s*(down|outage|blocker|incident)|showstopper|client\s*(demo|presentation|meeting|escalation)|deadline\s*(today|in\s*\d+\s*(hours?|hrs?)))\b/i.test(text) ||
    (/\b(locked\s*out|access\s*(revoked|blocked|denied)|account\s*locked)\b/i.test(text) && /\b(urgent|critical|immediately|asap|deadline)\b/i.test(text));

  if (isWorkBlocker) {
    return {
      priority: "HIGH",
      priorityReason: "Critical work blocker or hardware failure impacting active deliverables",
    };
  }

  // 3. High urgency: Grievances, Harassment, POSH, Workplace Safety
  const isGrievanceOrSafety =
    category === "Complaint" ||
    /\b(harass(ment)?|posh|discrimination|toxic|abuse|threat(en|ened)?|assault|misconduct|hostile|unprofessional)\b/i.test(text) ||
    /\b(harass(ment)?|posh|discrimination|toxic|abuse)\b/i.test(intent);

  if (isGrievanceOrSafety) {
    return {
      priority: "HIGH",
      priorityReason: "High urgency due to workplace grievance, safety violation, or POSH compliance",
    };
  }

  // 4. High urgency: Explicit urgency keywords & Hinglish urgency
  const hasExplicitUrgency =
    /\b(urgent|urgently|immediate|immediately|asap|critical|emergency|showstopper)\b/i.test(text) ||
    /\b(bahut\s*urgent|jaldi\s*(karo|kijiye)|turant|kaam\s*ruka|urgent\s*hai|emergency\s*hai)\b/i.test(text);

  if (hasExplicitUrgency) {
    return {
      priority: "HIGH",
      priorityReason: "Employee indicated urgent/immediate turnaround required",
    };
  }

  // 5. Low urgency checks
  if (
    category === "Employee Referral" ||
    /\b(referral policy|general query|brochure|information|just asking|suggestion|clarification)\b/i.test(text) ||
    intent.includes("Policy Questions") ||
    intent.includes("Document Requests")
  ) {
    return {
      priority: "LOW",
      priorityReason: "Informational or non-urgent request without immediate deadline",
    };
  }

  return {
    priority: "MEDIUM",
    priorityReason: "Standard operational priority for routine resolution",
  };
}

/**
 * Heuristic sentiment and tone analysis
 */
function detectSentiment(text: string): TicketSentiment {
  if (/\b(harass(ment)?|posh|discrimination|abuse|assault|illegal|lawyer|police|resigning|quitting)\b/i.test(text)) {
    return "CRITICAL";
  }
  if (
    /\b(frustrated|unacceptable|pathetic|worst|fed up|disappointed|angry|ridiculous)\b/i.test(text) ||
    /\b(no (one|body) (helped|replied|responded)|waiting for (days|weeks)|multiple times|repeatedly|still pending|ignored)\b/i.test(text)
  ) {
    return "FRUSTRATED";
  }
  if (/\b(thank you|thanks a lot|great job|kudos|appreciate|wonderful|pleased)\b/i.test(text)) {
    return "POSITIVE";
  }
  return "NEUTRAL";
}

/**
 * Classify a ticket using Groq LLM API, with local heuristic NLP fallback.
 */
export async function classifyTicket(
  subject: string,
  description: string,
  employeeSelectedCategory?: string,
): Promise<AIClassificationResult | null> {
  // If no API key configured, use local heuristic NLP classifier fallback
  if (!env.groqApiKey) {
    return localHeuristicClassifier(
      subject,
      description,
      employeeSelectedCategory,
    );
  }

  try {
    const userMessage = buildUserMessage(
      subject,
      description,
      employeeSelectedCategory,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.groqApiKey}`,
      },
      body: JSON.stringify({
        model: env.groqModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 512,
        response_format: {
          type: "json_object",
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(
        `[AI] Groq API returned ${response.status}: falling back to local NLP classifier`,
      );
      return localHeuristicClassifier(
        subject,
        description,
        employeeSelectedCategory,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return localHeuristicClassifier(
        subject,
        description,
        employeeSelectedCategory,
      );
    }

    // Parse and validate the JSON response
    const parsed = JSON.parse(content);
    const validated = aiResponseSchema.safeParse(parsed);

    if (!validated.success) {
      return localHeuristicClassifier(
        subject,
        description,
        employeeSelectedCategory,
      );
    }

    return validated.data;
  } catch (err) {
    return localHeuristicClassifier(
      subject,
      description,
      employeeSelectedCategory,
    );
  }
}

// =========================================================
// USER MESSAGE BUILDER
// =========================================================

function buildUserMessage(
  subject: string,
  description: string,
  employeeSelectedCategory?: string,
): string {
  let message = `Classify this HR ticket:\n\nSubject: ${subject}\nDescription: ${description}`;

  if (employeeSelectedCategory) {
    message += `\n\nNote: The employee selected category "${employeeSelectedCategory}". Your classification may differ if you believe a different category is more appropriate.`;
  }

  return message;
}

// =========================================================
// PHASE 3: HR AGENT COPILOT
// Thread Summarization & Suggested Reply Generation
// =========================================================

export interface TicketSummary {
  issue: string;
  currentStatus: string;
  pendingAction: string;
}

export type ReplyTone = "empathetic" | "formal" | "concise";

export interface SuggestedReply {
  reply: string;
  tone: ReplyTone;
}

export interface TicketContext {
  ticketId: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  employeeName?: string;
  employeeDepartment?: string;
  employeeDesignation?: string;
  agentName?: string;
  agentRole?: string;
}

interface MessageContext {
  senderName: string;
  senderRole: string;
  message: string;
  createdAt: string;
}

// =========================================================
// SUMMARIZATION
// =========================================================

const SUMMARIZE_SYSTEM_PROMPT = `You are an HR ticket summarization assistant for an enterprise HRMS system.

Given a ticket's metadata and its full conversation thread, generate a concise 3-bullet executive summary covering the ENTIRE conversation progression from start to finish.

## Output Format
Respond with a JSON object with exactly these 3 fields:
{
  "issue": "What the employee initially reported — the core problem in 1-2 sentences.",
  "currentStatus": "What has been investigated, attempted, or communicated across the ENTIRE thread so far — 2-3 sentences synthesizing the whole conversation progression chronologically.",
  "pendingAction": "What is still pending or waiting from HR, IT, Finance, or the employee — 1-2 sentences."
}

## Rules
- Synthesize all messages across the entire conversation thread chronologically, not just the latest message.
- Be concise, factual, and informative. No filler phrases.
- Reference specific details from the conversation (dates, amounts, error codes, systems, employee names) when available.
- If no messages exist beyond the initial ticket, say so in currentStatus.
- If the ticket is already resolved/closed, reflect that in pendingAction.
- Handle English, Hindi, and Hinglish content.`;

const summaryResponseSchema = z.object({
  issue: z.string().min(1).max(1000),
  currentStatus: z.string().min(1).max(1000),
  pendingAction: z.string().min(1).max(1000),
});

function buildSummarizationUserMessage(
  ticket: TicketContext,
  messages: MessageContext[],
): string {
  let text = `Summarize this HR ticket thread:\n\n`;
  text += `Ticket ID: ${ticket.ticketId}\n`;
  text += `Subject: ${ticket.subject}\n`;
  text += `Category: ${ticket.category}\n`;
  text += `Priority: ${ticket.priority}\n`;
  text += `Status: ${ticket.status}\n`;
  if (ticket.employeeName) {
    text += `Employee: ${ticket.employeeName}\n`;
  }
  text += `Initial Description: ${ticket.description}\n\n`;

  if (messages.length === 0) {
    text += `Conversation Thread: No follow-up messages yet — only the initial ticket description above.`;
  } else {
    text += `Full Conversation Thread (${messages.length} messages in chronological order):\n`;
    messages.forEach((msg, idx) => {
      const role = msg.senderRole === "EMPLOYEE" ? "Employee" : "Support Staff";
      text += `\n[Message ${idx + 1} of ${messages.length}] [${role} — ${msg.senderName}] (${msg.createdAt}):\n${msg.message}\n`;
    });
  }

  return text;
}

function localFallbackSummarize(
  ticket: TicketContext,
  messages: MessageContext[],
): TicketSummary {
  // Extract the core issue from the ticket description
  const issue =
    ticket.description.length > 200
      ? ticket.description.substring(0, 197) + "..."
      : ticket.description || ticket.subject;

  // Determine current status across the whole thread
  let currentStatus: string;
  if (messages.length === 0) {
    currentStatus =
      "No responses have been received yet. The ticket is awaiting initial review by the support team.";
  } else if (messages.length === 1) {
    const m = messages[0];
    const role = m.senderRole === "EMPLOYEE" ? "Employee" : "Support Staff";
    const snippet =
      m.message.length > 140 ? m.message.substring(0, 137) + "..." : m.message;
    currentStatus = `1 message in thread: ${role} (${m.senderName}) noted: "${snippet}".`;
  } else {
    const employeeMsgs = messages.filter((m) => m.senderRole === "EMPLOYEE");
    const staffMsgs = messages.filter((m) => m.senderRole !== "EMPLOYEE");
    const lastMsg = messages[messages.length - 1];
    const firstMsg = messages[0];

    const staffNames = Array.from(
      new Set(staffMsgs.map((m) => m.senderName).filter(Boolean)),
    );
    const staffLabel = staffNames.length ? staffNames.join(", ") : "support staff";

    const firstSnippet =
      firstMsg.message.length > 90
        ? firstMsg.message.substring(0, 87) + "..."
        : firstMsg.message;
    const lastSnippet =
      lastMsg.message.length > 90
        ? lastMsg.message.substring(0, 87) + "..."
        : lastMsg.message;

    const lastRole = lastMsg.senderRole === "EMPLOYEE" ? "Employee" : "Staff";

    currentStatus = `${messages.length} messages exchanged across thread (${employeeMsgs.length} from employee, ${staffMsgs.length} from ${staffLabel}). Started with: "${firstSnippet}". Latest update from ${lastRole} (${lastMsg.senderName}): "${lastSnippet}".`;
  }

  // Determine pending action based on ticket status and conversation state
  let pendingAction: string;
  const statusUpper = ticket.status.toUpperCase();
  if (statusUpper === "RESOLVED" || statusUpper === "CLOSED") {
    pendingAction =
      "This ticket has been resolved and closed. No further action is required.";
  } else if (statusUpper === "WAITING_FOR_EMPLOYEE") {
    pendingAction =
      "Waiting for the employee to respond with additional information or confirmation.";
  } else if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.senderRole === "EMPLOYEE") {
      pendingAction = `The employee's latest message (${lastMsg.senderName}) is awaiting a response from the support team.`;
    } else {
      pendingAction = `The support team has responded (${lastMsg.senderName}). Awaiting employee's follow-up or confirmation.`;
    }
  } else {
    pendingAction =
      "This ticket needs initial review and response from the assigned support team.";
  }

  return { issue, currentStatus, pendingAction };
}

/**
 * Summarize a ticket's conversation thread into a 3-bullet executive summary.
 */
export async function summarizeTicketThread(
  ticket: TicketContext,
  messages: MessageContext[],
): Promise<TicketSummary> {
  // If no API key, use local fallback
  if (!env.groqApiKey) {
    return localFallbackSummarize(ticket, messages);
  }

  try {
    const userMessage = buildSummarizationUserMessage(ticket, messages);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.groqApiKey}`,
      },
      body: JSON.stringify({
        model: env.groqModel,
        messages: [
          { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(
        `[AI] Groq API returned ${response.status} for summarization: using local fallback`,
      );
      return localFallbackSummarize(ticket, messages);
    }

    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return localFallbackSummarize(ticket, messages);
    }

    const parsed = JSON.parse(content);
    const validated = summaryResponseSchema.safeParse(parsed);

    if (!validated.success) {
      return localFallbackSummarize(ticket, messages);
    }

    return validated.data;
  } catch (err) {
    console.warn("[AI] Summarization failed, using local fallback:", err);
    return localFallbackSummarize(ticket, messages);
  }
}

// =========================================================
// SUGGESTED REPLY GENERATION
// =========================================================

const REPLY_SYSTEM_PROMPT = `You are a Senior HR Operations & IT Workplace Specialist at Aadhyaraj Technologies, a modern software engineering and technology enterprise.

Your job is to generate a realistic, high-quality, and context-specific draft reply for a human support agent to send to an employee.

## Core Quality Guidelines for an IT Enterprise HRMS:
1. NO GENERIC ROBOTIC FLUFF:
   - STRICTLY AVOID generic clichés like: "We care deeply about your satisfaction", "Rest assured we take this seriously", "We are actively reviewing your case and will revert soon", "Your feedback is valuable to our organization".
   - Sound like a knowledgeable, helpful colleague (HR Business Partner, IT Ops Admin, or Payroll Specialist) who understands corporate tech workflows.

2. SPECIFIC DOMAIN KNOWLEDGE (tailored to ticket category):
   - **Payroll**: Reference salary cycles, payslips, TDS calculations, Form 16, tax exemption proof verification (80C / 80D / HRA rent receipts), reimbursements (internet/travel), or EPF/UAN. Mention what the accounts/finance desk is verifying and what document or transaction ID might be needed.
   - **IT Support**: Understand developer tooling: MacBooks/ThinkPads, monitors/cables, VPN credentials, Okta/SSO, GitHub/GitLab permissions, local Docker/env issues, battery degradation. Request asset tag/serial number or crash log if missing.
   - **Leave & Attendance**: Reference leave policies (Earned Leave, Casual/Sick, Comp-off, Maternity/Paternity), biometric punch-in regularizations, shift allowances, or manager approvals on the portal.
   - **Complaints & Grievances**: Objective, discreet, respectful, and reassuring. Emphasize strict confidentiality and propose a private 1-on-1 discussion if appropriate.
   - **Employee Referral / Recruitment**: Provide clear status updates on candidate pipelines, technical interview stages, or referral bonus payouts (typically following the 90-day probation mark).

3. CONVERSATION & CONTEXT AWARENESS:
   - Weave in the exact specifics the employee mentioned (e.g. monetary amounts like ₹4,500, specific dates, error messages, or attachments).
   - If previous messages exist in the conversation, respond directly to the employee's MOST RECENT message and do not repeat previous statements.
   - Always state an actionable next step: what the agent is actively doing right now, what the employee should check/provide, or the next checkpoint.

4. TONE GUIDELINES:
   - **empathetic**: Validating and warm without being melodramatic. Ideal when an employee is stressed, blocked by laptop issues, or worried about salary deductions. Acknowledges the disruption and reassures with clear next steps.
   - **formal**: Polished, structured, executive, and compliance-accurate. Uses standard corporate business etiquette.
   - **concise**: Crisp tech-company style (like a helpful Slack / Teams message). 2 to 4 sentences maximum. Gets straight to the point and action item.

5. GREETING & SIGN-OFF:
   - Greet using the employee's first name (e.g., "Hi Priya,").
   - Sign off naturally with the agent's name/team (e.g., "Best regards,\\nRahul Verma | HR Team" or "Regards,\\nIT Support Desk").

6. OUTPUT FORMAT:
Respond with a JSON object:
{
  "reply": "The complete draft reply text ready to send.",
  "tone": "the tone that was used"
}`;

const replyResponseSchema = z.object({
  reply: z.string().min(1).max(2000),
  tone: z.string().min(1).max(20),
});

function buildReplyUserMessage(
  ticket: TicketContext,
  messages: MessageContext[],
  tone: ReplyTone,
  instruction?: string,
): string {
  let text = `Generate a ${tone.toUpperCase()} reply for this IT enterprise HRMS ticket:\n\n`;
  text += `--- TICKET DETAILS ---\n`;
  text += `Ticket ID: ${ticket.ticketId}\n`;
  text += `Subject: ${ticket.subject}\n`;
  text += `Category: ${ticket.category}\n`;
  text += `Priority: ${ticket.priority}\n`;
  text += `Status: ${ticket.status}\n`;
  if (ticket.employeeName) {
    text += `Employee: ${ticket.employeeName}${ticket.employeeDesignation ? ` (${ticket.employeeDesignation})` : ""}${ticket.employeeDepartment ? ` - ${ticket.employeeDepartment}` : ""}\n`;
  }
  if (ticket.agentName) {
    text += `Agent Name: ${ticket.agentName} (${ticket.agentRole || "Staff"})\n`;
  }
  text += `Description: ${ticket.description}\n\n`;

  text += `--- CONVERSATION HISTORY ---\n`;
  if (messages.length === 0) {
    text += `No previous messages. This will be the agent's first reply to the employee's initial report.\n`;
  } else {
    text += `Chronological thread (most recent messages at the bottom):\n`;
    for (const msg of messages) {
      const role = msg.senderRole === "EMPLOYEE" ? "Employee" : "Staff";
      text += `[${role} — ${msg.senderName}]: ${msg.message}\n`;
    }
  }

  if (instruction && instruction.trim()) {
    text += `\n--- HR AGENT'S INTENDED REPLY IDEA / INSTRUCTION ---\n`;
    text += `The agent wants the reply to convey the following idea, notes, or directive:\n`;
    text += `"${instruction.trim()}"\n`;
    text += `CRITICAL REQUIREMENT: You MUST build the draft reply around this specific directive. Express the agent's exact idea/points accurately, professionally, and in the specified ${tone.toUpperCase()} tone while addressing the ticket context.\n`;
  }

  text += `\n--- INSTRUCTIONS ---\n`;
  text += `Tone: ${tone}\n`;
  text += `Draft a high-quality, specific reply that directly addresses the issue with concrete next steps. Output JSON.`;

  return text;
}

function localFallbackReply(
  ticket: TicketContext,
  messages: MessageContext[],
  tone: ReplyTone,
  instruction?: string,
): SuggestedReply {
  // Extract employee first name
  let firstName = "there";
  if (ticket.employeeName) {
    firstName = ticket.employeeName.trim().split(" ")[0];
  } else {
    for (const msg of messages) {
      if (msg.senderRole === "EMPLOYEE" && msg.senderName) {
        firstName = msg.senderName.trim().split(" ")[0];
        break;
      }
    }
  }

  const agentSignOff = ticket.agentName
    ? `\n\nRegards,\n${ticket.agentName} | ${ticket.category} Desk`
    : `\n\nRegards,\n${ticket.category} Support Team`;

  const category = ticket.category;
  const subject = ticket.subject;

  if (instruction && instruction.trim()) {
    const customReply = tone === "formal"
      ? `Dear ${firstName},\n\nRegarding your ticket "${subject}":\n\n${instruction.trim()}\n\nPlease feel free to reach out if you have any further questions.${agentSignOff}`
      : tone === "concise"
      ? `Hi ${firstName}, regarding "${subject}": ${instruction.trim()}.${agentSignOff}`
      : `Hi ${firstName},\n\nThank you for following up on "${subject}". ${instruction.trim()}\n\nPlease let us know if you need any additional assistance or clarification.${agentSignOff}`;
    return { reply: customReply, tone };
  }

  let reply: string;

  if (category === "Payroll") {
    if (tone === "empathetic") {
      reply = `Hi ${firstName},\n\nThank you for reaching out regarding "${subject}". I understand how stressful unexpected payroll or deduction discrepancies can be, and we want to get this resolved for you right away.\n\nI am pulling up your latest payslip and cross-checking the computation sheet with our Accounts desk. If you have any relevant proof (such as an investment declaration acknowledgment or bank statement excerpt), please feel free to attach it here so we can expedite the adjustment in the upcoming payout cycle.${agentSignOff}`;
    } else if (tone === "formal") {
      reply = `Dear ${firstName},\n\nWe acknowledge receipt of your payroll inquiry regarding "${subject}".\n\nYour query has been logged with the Finance & Payroll team. We are currently auditing your payroll ledger and tax declaration records against this request. We will provide an official update once the verification is completed.${agentSignOff}`;
    } else {
      reply = `Hi ${firstName}, I'm reviewing your payroll query regarding "${subject}" with the accounts desk now. We'll cross-check your records and update you shortly.${agentSignOff}`;
    }
  } else if (category === "IT Support") {
    if (tone === "empathetic") {
      reply = `Hi ${firstName},\n\nI'm sorry to hear that you're running into this issue with "${subject}". Having your workstation or tools disrupted is frustrating, so we're treating this with priority.\n\nCould you please share your machine asset tag (or serial number) and let us know if you have tried a quick restart or if any error code appeared? In the meantime, our IT team is looking into this to get you back up and running as quickly as possible.${agentSignOff}`;
    } else if (tone === "formal") {
      reply = `Dear ${firstName},\n\nThis is to acknowledge your IT support request regarding "${subject}".\n\nAn IT technician has been assigned to diagnose the reported issue. Please ensure your machine's asset tag number and any relevant error logs or screenshots are shared in this thread for faster resolution.${agentSignOff}`;
    } else {
      reply = `Hi ${firstName}, our IT team has received your ticket about "${subject}". Please share your laptop asset tag and any error screenshot so we can assist you right away.${agentSignOff}`;
    }
  } else if (category === "Leave" || category === "Attendance") {
    if (tone === "empathetic") {
      reply = `Hi ${firstName},\n\nThank you for following up on "${subject}". I know keeping leave and attendance records accurate is important, especially around payroll cutoff dates.\n\nI've opened your attendance and leave profile to verify the dates and sync with your reporting manager's approval queue. We'll ensure the necessary adjustments are reflected on your portal shortly.${agentSignOff}`;
    } else if (tone === "formal") {
      reply = `Dear ${firstName},\n\nYour request regarding "${subject}" has been received by HR Operations.\n\nWe are reviewing your attendance logs and leave balances on the HRMS portal. We will confirm once the record has been updated and synchronized.${agentSignOff}`;
    } else {
      reply = `Hi ${firstName}, I'm checking your attendance/leave record for "${subject}" now and will confirm once the adjustment is updated on the portal.${agentSignOff}`;
    }
  } else if (category === "Complaint") {
    if (tone === "empathetic") {
      reply = `Hi ${firstName},\n\nThank you for bringing this matter regarding "${subject}" to our attention. Please be assured that your concern is being treated with the utmost seriousness, discretion, and confidentiality.\n\nWe are initiating an objective review in accordance with our workplace policy. If you would prefer a private 1-on-1 discussion at your convenience, please let me know when you are available.${agentSignOff}`;
    } else if (tone === "formal") {
      reply = `Dear ${firstName},\n\nWe acknowledge receipt of your communication regarding "${subject}".\n\nThis matter has been escalated to HR Leadership and will be handled under strict confidentiality protocols. You will be contacted directly regarding the next steps and review process.${agentSignOff}`;
    } else {
      reply = `Hi ${firstName}, your concern regarding "${subject}" has been received and is under confidential review by HR Leadership. We will connect with you shortly.${agentSignOff}`;
    }
  } else {
    // General HR / Recruitment / Referral
    if (tone === "empathetic") {
      reply = `Hi ${firstName},\n\nThank you for reaching out about "${subject}". I'm looking into this for you and will make sure you have all the information and support you need.\n\nOur team is reviewing the details now, and I will share an update here as soon as we have completed the check.${agentSignOff}`;
    } else if (tone === "formal") {
      reply = `Dear ${firstName},\n\nThis is to acknowledge receipt of your query regarding "${subject}".\n\nYour request is being reviewed by the HR Operations department in accordance with company policy. We will provide further details shortly.${agentSignOff}`;
    } else {
      reply = `Hi ${firstName}, we've received your request about "${subject}" and are reviewing it now. We'll update you here shortly.${agentSignOff}`;
    }
  }

  return { reply, tone };
}

/**
 * Generate a suggested reply for HR support agents.
 */
export async function generateSuggestedReply(
  ticket: TicketContext,
  messages: MessageContext[],
  tone: ReplyTone = "empathetic",
  instruction?: string,
): Promise<SuggestedReply> {
  // If no API key, use local fallback
  if (!env.groqApiKey) {
    return localFallbackReply(ticket, messages, tone, instruction);
  }

  try {
    const userMessage = buildReplyUserMessage(ticket, messages, tone, instruction);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.groqApiKey}`,
      },
      body: JSON.stringify({
        model: env.groqModel,
        messages: [
          { role: "system", content: REPLY_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.4,
        max_tokens: 512,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(
        `[AI] Groq API returned ${response.status} for reply generation: using local fallback`,
      );
      return localFallbackReply(ticket, messages, tone);
    }

    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return localFallbackReply(ticket, messages, tone);
    }

    const parsed = JSON.parse(content);
    const validated = replyResponseSchema.safeParse(parsed);

    if (!validated.success) {
      return localFallbackReply(ticket, messages, tone);
    }

    return { reply: validated.data.reply, tone };
  } catch (err) {
    console.warn("[AI] Reply generation failed, using local fallback:", err);
    return localFallbackReply(ticket, messages, tone);
  }
}

