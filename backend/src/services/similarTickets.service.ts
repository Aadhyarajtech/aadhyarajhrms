/**
 * Similar Ticket & Recurring Issue Detection Service
 * Identifies when multiple employees are reporting the same or highly similar underlying problem.
 * Computes semantic token overlap, category alignment, and intent correlation to cluster
 * related tickets into actionable incident groups.
 */

import { Ticket, Employee } from "@/db/models";

export interface SimilarTicketMatch {
  _id: string;
  ticketId: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  employeeName?: string;
  similarityScore: number; // 0 to 100
  commonIntent?: string | null;
}

export interface RecurringIssueGroup {
  groupId: string;
  issueTitle: string;
  category: string;
  ticketCount: number;
  confidence: number; // 0 to 100
  suggestedAction: string;
  firstReportedAt: string;
  lastReportedAt: string;
  affectedTickets: Array<{
    _id: string;
    ticketId: string;
    subject: string;
    status: string;
    priority: string;
    createdAt: string;
    employeeName?: string;
  }>;
}

const STOP_WORDS = new Set([
  "the", "is", "at", "which", "on", "a", "an", "and", "or", "to", "in", "for",
  "with", "of", "by", "from", "my", "i", "me", "we", "our", "you", "your",
  "please", "help", "issue", "problem", "ticket", "request", "support", "not",
  "unable", "can", "cannot", "facing", "having", "error", "hi", "hello", "dear",
]);

const DOMAIN_KEYWORDS: Record<string, number> = {
  biometric: 3,
  punch: 3,
  scanner: 3,
  attendance: 2.5,
  checkin: 2.5,
  checkout: 2.5,
  salary: 3,
  payslip: 3,
  tds: 2.5,
  reimbursement: 2.5,
  payroll: 2,
  wifi: 3,
  vpn: 3,
  network: 2.5,
  internet: 2,
  macbook: 2.5,
  laptop: 2,
  hardware: 2,
  screen: 2,
  leave: 2.5,
  casual: 2,
  sick: 2,
  approval: 2,
  bonus: 2.5,
};

function extractKeywords(text: string): Map<string, number> {
  const words = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    const weight = DOMAIN_KEYWORDS[w] || 1;
    freq.set(w, (freq.get(w) || 0) + weight);
  }
  return freq;
}

/**
 * Calculates weighted cosine/Jaccard similarity between two tickets (0.0 to 1.0)
 */
export function calculateTicketSimilarity(
  t1: { subject: string; description?: string; category: string; aiIntent?: string | null },
  t2: { subject: string; description?: string; category: string; aiIntent?: string | null },
): number {
  if (t1.category !== t2.category) {
    // Different categories are usually not the same operational issue
    return 0;
  }

  const k1 = extractKeywords(`${t1.subject} ${t1.description || ""}`);
  const k2 = extractKeywords(`${t2.subject} ${t2.description || ""}`);

  if (k1.size === 0 || k2.size === 0) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (const [word, weight] of k1) {
    norm1 += weight * weight;
    if (k2.has(word)) {
      dotProduct += weight * (k2.get(word) || 1);
    }
  }

  for (const [, weight] of k2) {
    norm2 += weight * weight;
  }

  const cosine = norm1 > 0 && norm2 > 0 ? dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2)) : 0;

  let score = cosine;

  // Bonus if both share exact same extracted sub-intent
  if (t1.aiIntent && t2.aiIntent && t1.aiIntent.trim().toLowerCase() === t2.aiIntent.trim().toLowerCase()) {
    score = Math.min(1, score + 0.25);
  }

  return score;
}

/**
 * Finds all tickets similar to a specific ticket
 */
export async function findSimilarTickets(
  ticketId: string,
  minSimilarity = 0.45,
  limit = 6,
): Promise<{ targetTicket: any; similarTickets: SimilarTicketMatch[] }> {
  const targetTicket = await Ticket.findById(ticketId).lean();
  if (!targetTicket) {
    throw new Error("Ticket not found");
  }

  // Fetch potential candidate tickets (same category or recent)
  const candidates = await Ticket.find({
    _id: { $ne: targetTicket._id },
    category: targetTicket.category,
  })
    .sort({ createdAt: -1 })
    .limit(80)
    .lean();

  const employeeIds = Array.from(
    new Set(candidates.map((c: any) => c.employeeId).filter(Boolean)),
  );
  const employees = await Employee.find({ _id: { $in: employeeIds } }).lean();
  const empMap = new Map<string, string>(
    employees.map((e: any) => [String(e._id), `${e.firstName} ${e.lastName}`.trim()]),
  );

  const matches: SimilarTicketMatch[] = [];

  for (const cand of candidates as any[]) {
    const sim = calculateTicketSimilarity(targetTicket as any, cand as any);
    const scorePct = Math.round(sim * 100);

    if (scorePct >= Math.round(minSimilarity * 100)) {
      matches.push({
        _id: String(cand._id),
        ticketId: cand.ticketId,
        subject: cand.subject,
        category: cand.category,
        priority: cand.priority,
        status: cand.status,
        createdAt: cand.createdAt,
        employeeName: empMap.get(String(cand.employeeId)) || cand.employeeId,
        similarityScore: scorePct,
        commonIntent: cand.aiIntent || targetTicket.aiIntent,
      });
    }
  }

  matches.sort((a, b) => b.similarityScore - a.similarityScore);

  return {
    targetTicket,
    similarTickets: matches.slice(0, limit),
  };
}

/**
 * Clusters active/recent tickets into distinct Recurring Issue Groups
 * Only groups active/unresolved tickets (OPEN, IN_PROGRESS, WAITING_FOR_EMPLOYEE)
 * within the recent time window (defaults to 48 hours / 1-2 days) to prevent
 * pinging historical or already-resolved ticket owners.
 */
export async function detectRecurringIssueGroups(
  minClusterSize = 2,
  windowHours = 48,
  departmentFilter?: { assignedTo?: string[]; categories?: string[] },
): Promise<RecurringIssueGroup[]> {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const query: any = {
    status: { $in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE"] },
    createdAt: { $gte: cutoff },
  };

  if (departmentFilter) {
    const conditions: any[] = [];
    if (departmentFilter.assignedTo && departmentFilter.assignedTo.length > 0) {
      conditions.push({ assignedTo: { $in: departmentFilter.assignedTo } });
    }
    if (departmentFilter.categories && departmentFilter.categories.length > 0) {
      conditions.push({ category: { $in: departmentFilter.categories } });
    }
    if (conditions.length > 0) {
      query.$or = conditions;
    }
  }

  const tickets = await Ticket.find(query)
    .sort({ createdAt: -1 })
    .limit(150)
    .lean();

  if (!tickets || tickets.length === 0) return [];

  const employeeIds = Array.from(
    new Set(tickets.map((c: any) => c.employeeId).filter(Boolean)),
  );
  const employees = await Employee.find({ _id: { $in: employeeIds } }).lean();
  const empMap = new Map<string, string>(
    employees.map((e: any) => [String(e._id), `${e.firstName} ${e.lastName}`.trim()]),
  );

  const visited = new Set<string>();
  const groups: RecurringIssueGroup[] = [];

  for (let i = 0; i < tickets.length; i++) {
    const base = tickets[i];
    const baseId = String(base._id);
    if (visited.has(baseId)) continue;

    const cluster: any[] = [base];
    visited.add(baseId);

    for (let j = i + 1; j < tickets.length; j++) {
      const cand = tickets[j];
      const candId = String(cand._id);
      if (visited.has(candId)) continue;

      const sim = calculateTicketSimilarity(base as any, cand as any);
      if (sim >= 0.5) {
        cluster.push(cand);
        visited.add(candId);
      }
    }

    if (cluster.length >= minClusterSize) {
      // Formulate issue title from base ticket subject / intent
      const category = base.category;
      let issueTitle = base.aiIntent || base.subject;
      if (issueTitle.length > 55) {
        issueTitle = issueTitle.slice(0, 52) + "...";
      }

      // Generate suggested operational recommendation
      let suggestedAction = `Review ${cluster.length} affected tickets. Investigate common system root cause.`;
      if (category === "Attendance") {
        suggestedAction =
          "Investigate biometric hardware & network synchronization. Consider broadcasting an attendance notice.";
      } else if (category === "Payroll") {
        suggestedAction =
          "Coordinate with Finance to confirm bank batch settlement or tax portal deduction status.";
      } else if (category === "IT Support") {
        suggestedAction =
          "Audit network gateway, VPN endpoints, or SSO server health for active disruptions.";
      }

      // Sort dates
      const dates = cluster
        .map((t) => new Date(t.createdAt).getTime())
        .filter((d) => !Number.isNaN(d))
        .sort((a, b) => a - b);

      const firstReportedAt = dates.length > 0 ? new Date(dates[0]).toISOString() : base.createdAt;
      const lastReportedAt =
        dates.length > 0 ? new Date(dates[dates.length - 1]).toISOString() : base.createdAt;

      groups.push({
        groupId: `grp-${category.toLowerCase().replace(/\s+/g, "_")}-${baseId.slice(-6)}`,
        issueTitle,
        category,
        ticketCount: cluster.length,
        confidence: Math.min(98, 70 + cluster.length * 5),
        suggestedAction,
        firstReportedAt,
        lastReportedAt,
        affectedTickets: cluster.map((t: any) => ({
          _id: String(t._id),
          ticketId: t.ticketId,
          subject: t.subject,
          status: t.status,
          priority: t.priority,
          createdAt: t.createdAt,
          employeeName: empMap.get(String(t.employeeId)) || t.employeeId,
        })),
      });
    }
  }

  // Sort groups by ticketCount descending
  groups.sort((a, b) => b.ticketCount - a.ticketCount);

  return groups;
}
