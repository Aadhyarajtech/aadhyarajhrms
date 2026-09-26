/**
 * Similar Ticket & Recurring Issue Detection Service
 * Identifies when multiple employees are reporting the same or highly similar underlying problem.
 * Computes semantic token overlap, category alignment, and intent correlation to cluster
 * related tickets into actionable incident groups.
 */

import { Ticket, Employee } from "@/db/models";
import TicketMessage from "@/db/TicketMessage";

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
  attendance: 2,
  checkin: 2.5,
  checkout: 2.5,
  salary: 2,
  payslip: 3,
  tds: 2.5,
  reimbursement: 2.5,
  payroll: 1.5,
  wifi: 3,
  vpn: 3,
  network: 2.5,
  internet: 2,
  macbook: 2.5,
  laptop: 2,
  hardware: 2,
  screen: 2,
  leave: 2,
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
  // Normalize category comparison (e.g. "Payroll" vs "Payroll Issue", "IT" vs "IT Support")
  const cat1 = (t1.category || "").toLowerCase().replace(/[\s_-]+/g, "");
  const cat2 = (t2.category || "").toLowerCase().replace(/[\s_-]+/g, "");
  const catMatch =
    cat1 === cat2 ||
    (cat1.length >= 3 && cat2.length >= 3 && (cat1.includes(cat2) || cat2.includes(cat1)));
  if (!catMatch) {
    // Different categories are usually not the same operational issue
    return 0;
  }

  // 1. AI Intent Analysis:
  // If both tickets have AI-extracted intents, verify alignment
  if (t1.aiIntent && t2.aiIntent) {
    const i1 = t1.aiIntent.trim().toLowerCase();
    const i2 = t2.aiIntent.trim().toLowerCase();
    if (i1 !== i2) {
      // Conflicting intents indicate completely different operational topics (e.g. "Salary not credited" vs "Bank account update")
      return 0;
    }
  }

  const k1 = extractKeywords(`${t1.subject} ${t1.description || ""}`);
  const k2 = extractKeywords(`${t2.subject} ${t2.description || ""}`);

  if (k1.size === 0 || k2.size === 0) return 0;

  // Check subject overlap
  const s1 = extractKeywords(t1.subject);
  const s2 = extractKeywords(t2.subject);
  let hasSubjectOverlap = false;
  for (const [w] of s1) {
    if (s2.has(w)) {
      hasSubjectOverlap = true;
      break;
    }
  }

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

  // If subjects share zero keywords and neither has a confirmed matching AI intent, penalize heavily
  if (!hasSubjectOverlap && (!t1.aiIntent || !t2.aiIntent)) {
    score = score * 0.4;
  }

  return score;
}

/**
 * Finds all tickets similar to a specific ticket.
 * Constrained strictly to tickets created on that particular day (24 hours)
 * and in an active unresolved state (OPEN, IN_PROGRESS, WAITING_FOR_EMPLOYEE).
 * Also filters out tickets that have already received a broadcast message
 * so duplicate broadcast messages are never sent twice.
 */
export async function findSimilarTickets(
  ticketId: string,
  minSimilarity = 0.70,
  limit = 6,
): Promise<{ targetTicket: any; similarTickets: SimilarTicketMatch[] }> {
  const targetTicket = await Ticket.findById(ticketId).lean();
  if (!targetTicket) {
    throw new Error("Ticket not found");
  }

  // 1. If target ticket itself already received a broadcast message, this recurring incident has already been handled
  const targetBroadcast = await TicketMessage.findOne({
    ticketId: String(targetTicket._id),
    senderName: { $regex: /broadcast/i },
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  }).lean();

  if (targetBroadcast) {
    return {
      targetTicket,
      similarTickets: [],
    };
  }

  // 2. Calculate that particular day's window (24 hours around target ticket)
  const targetCreated = new Date(targetTicket.createdAt);
  const dayStart = new Date(targetCreated);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetCreated);
  dayEnd.setHours(23, 59, 59, 999);

  const windowStart = new Date(
    Math.min(dayStart.getTime(), targetCreated.getTime() - 24 * 60 * 60 * 1000),
  ).toISOString();
  const windowEnd = new Date(
    Math.max(dayEnd.getTime(), targetCreated.getTime() + 24 * 60 * 60 * 1000),
  ).toISOString();

  // 3. Fetch candidates: same category, active only, same day only
  const catPrefix = (targetTicket.category || "").trim().split(/\s+/)[0];
  const candidates = await Ticket.find({
    _id: { $ne: targetTicket._id },
    category: { $regex: new RegExp(`^${catPrefix}`, "i") },
    status: { $in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE"] },
    createdAt: { $gte: windowStart, $lte: windowEnd },
  })
    .sort({ createdAt: -1 })
    .limit(80)
    .lean();

  if (candidates.length === 0) {
    return {
      targetTicket,
      similarTickets: [],
    };
  }

  // 4. Find if any candidate already received a broadcast message
  const candIds = candidates.map((c: any) => String(c._id));
  const existingBroadcasts = await TicketMessage.find({
    ticketId: { $in: candIds },
    senderName: { $regex: /broadcast/i },
  }).lean();
  const alreadyBroadcastSet = new Set(
    existingBroadcasts.map((m: any) => String(m.ticketId)),
  );

  const employeeIds = Array.from(
    new Set(candidates.map((c: any) => c.employeeId).filter(Boolean)),
  );
  const employees = await Employee.find({ _id: { $in: employeeIds } }).lean();
  const empMap = new Map<string, string>(
    employees.map((e: any) => [String(e._id), `${e.firstName} ${e.lastName}`.trim()]),
  );

  const matches: SimilarTicketMatch[] = [];

  for (const cand of candidates as any[]) {
    const candIdStr = String(cand._id);
    // If ticket already received a broadcast message, skip to prevent duplicate messaging
    if (alreadyBroadcastSet.has(candIdStr)) {
      continue;
    }

    const sim = calculateTicketSimilarity(targetTicket as any, cand as any);
    const scorePct = Math.round(sim * 100);

    if (scorePct >= Math.round(minSimilarity * 100)) {
      matches.push({
        _id: candIdStr,
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
 * Clusters active tickets from that particular day (defaults to 24 hours)
 * into distinct Recurring Issue Groups.
 * Only groups active/unresolved tickets (OPEN, IN_PROGRESS, WAITING_FOR_EMPLOYEE)
 * within the recent 24-hour time window to prevent pinging historical or already-resolved tickets.
 * Excludes tickets that have already received a broadcast message so that
 * when a broadcast is sent, the recurring incident is resolved/removed.
 */
export async function detectRecurringIssueGroups(
  minClusterSize = 2,
  windowHours = 24,
  departmentFilter?: { assignedTo?: string[]; categories?: string[] },
): Promise<RecurringIssueGroup[]> {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  // Find all ticket IDs that have already received a broadcast message in this window
  const broadcastMessages = await TicketMessage.find({
    senderName: { $regex: /broadcast/i },
    createdAt: { $gte: new Date(cutoff) },
  }).lean();
  const broadcastTicketIds = new Set(
    broadcastMessages.map((m: any) => String(m.ticketId)),
  );

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

  const rawTickets = await Ticket.find(query)
    .sort({ createdAt: -1 })
    .limit(150)
    .lean();

  if (!rawTickets || rawTickets.length === 0) return [];

  // Exclude tickets that have already received a broadcast message!
  // Once a broadcast message is sent to a ticket cluster, those tickets are addressed,
  // so the incident is removed from the active recurring incident queue.
  const tickets = rawTickets.filter(
    (t: any) =>
      !broadcastTicketIds.has(String(t._id)) &&
      !broadcastTicketIds.has(String(t.ticketId)),
  );

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
      if (sim >= 0.65) {
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
