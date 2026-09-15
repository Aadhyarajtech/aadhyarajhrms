/**
 * Predictive SLA Breach Warning Engine
 * Evaluates the probability of an impending SLA breach based on elapsed time,
 * priority thresholds, employee sentiment urgency, and department backlog pressure.
 */

export interface SlaRiskEvaluation {
  riskScore: number; // 0 to 100
  riskLevel: "NORMAL" | "ELEVATED" | "CRITICAL";
  hoursRemaining: number;
  projectedBreachAt: string;
  isBreached: boolean;
  factors: string[];
  attentionBadge: "HIGH_ATTENTION" | "ATTENTION_REQUIRED" | "ON_TRACK" | "BREACHED" | "RESOLVED";
  attentionReason?: string;
}

export function getPrioritySlaHours(priority?: string | null): number {
  switch (priority?.toUpperCase()) {
    case "HIGH":
      return 24;
    case "LOW":
      return 72;
    case "MEDIUM":
    default:
      return 48;
  }
}

export function calculatePredictiveSlaRisk(
  ticket: {
    createdAt: string;
    priority: string;
    status: string;
    aiPriority?: string | null;
    aiSentiment?: string | null;
    assignedTo?: string | null;
    slaDueAt?: string | null;
  },
  departmentBacklogCount = 0,
  referenceNow: Date = new Date(),
): SlaRiskEvaluation {
  const isFinished = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

  // Compute SLA target
  const slaHours = getPrioritySlaHours(ticket.priority);
  const createdDate = new Date(ticket.createdAt);
  const validCreated = !Number.isNaN(createdDate.getTime());
  const effectiveCreated = validCreated ? createdDate : referenceNow;

  const dueAtMs = ticket.slaDueAt
    ? new Date(ticket.slaDueAt).getTime()
    : effectiveCreated.getTime() + slaHours * 3600 * 1000;

  const dueAtDate = new Date(dueAtMs);
  const projectedBreachAt = dueAtDate.toISOString();

  const nowMs = referenceNow.getTime();
  const elapsedMs = Math.max(0, nowMs - effectiveCreated.getTime());
  const elapsedHours = elapsedMs / (3600 * 1000);
  const remainingHours = Math.max(0, (dueAtMs - nowMs) / (3600 * 1000));
  const isBreached = nowMs >= dueAtMs;

  if (isFinished) {
    return {
      riskScore: 0,
      riskLevel: "NORMAL",
      hoursRemaining: 0,
      projectedBreachAt,
      isBreached: false,
      attentionBadge: "RESOLVED",
      attentionReason: "Ticket resolved or closed",
      factors: ["Ticket is resolved or closed."],
    };
  }

  if (isBreached) {
    return {
      riskScore: 100,
      riskLevel: "CRITICAL",
      hoursRemaining: 0,
      projectedBreachAt,
      isBreached: true,
      attentionBadge: "BREACHED",
      attentionReason: "SLA target deadline has passed",
      factors: ["SLA target deadline has passed."],
    };
  }

  const factors: string[] = [];
  const elapsedRatio = Math.min(1, elapsedHours / slaHours);

  // 1. Time Decay Base Score (0 to 70 points)
  let score = Math.round(Math.pow(elapsedRatio, 1.3) * 70);

  if (elapsedRatio >= 0.75) {
    factors.push(`Over 75% of SLA resolution window (${remainingHours.toFixed(1)}h left) has elapsed.`);
  } else if (elapsedRatio >= 0.5) {
    factors.push(`Halfway through SLA resolution window (${remainingHours.toFixed(1)}h left).`);
  }

  // 2. High Priority Base Penalty (+12 points)
  const isHighPriority = ticket.priority === "HIGH" || ticket.aiPriority === "HIGH";
  const isMediumPriority = ticket.priority === "MEDIUM" || ticket.aiPriority === "MEDIUM";
  const isNegativeSentiment = ticket.aiSentiment === "CRITICAL" || ticket.aiSentiment === "FRUSTRATED";

  if (isHighPriority) {
    score += 12;
    factors.push("High priority SLA policy (24h turnaround target).");
  }

  // 3. Employee Sentiment Sensitivity (+12 to +20 points)
  if (ticket.aiSentiment === "CRITICAL") {
    score += 20;
    factors.push("Critical employee sentiment detected; immediate resolution advised.");
  } else if (ticket.aiSentiment === "FRUSTRATED") {
    score += 12;
    factors.push("Frustrated tone increases escalation vulnerability.");
  }

  // 4. Ticket Status Stagnation Penalty (+10 points if still in OPEN)
  if (ticket.status === "OPEN") {
    score += 10;
    factors.push("Ticket remains in OPEN state without active investigation.");
  }

  // 5. Department Backlog Load
  if (departmentBacklogCount > 10) {
    score += 10;
    factors.push(`High department backlog (${departmentBacklogCount} open tickets) creating queue delay.`);
  } else if (departmentBacklogCount > 5) {
    score += 5;
    factors.push(`Moderate department queue backlog (${departmentBacklogCount} open tickets).`);
  }

  // =========================================================
  // AI TICKET ATTENTION & STAGNATION RULES
  // Direct detection of unanswered, unattended tickets
  // =========================================================
  let attentionBadge: "HIGH_ATTENTION" | "ATTENTION_REQUIRED" | "ON_TRACK" | "BREACHED" | "RESOLVED" = "ON_TRACK";
  let attentionReason: string | undefined = undefined;

  const hoursOpen = Math.floor(elapsedHours);

  if (ticket.status === "OPEN") {
    // Rule A: HIGH-priority open >= 4 hours without staff response
    if (isHighPriority && elapsedHours >= 4) {
      attentionBadge = "HIGH_ATTENTION";
      attentionReason = `HIGH-priority ticket open for ${hoursOpen}h with no staff response`;
      factors.unshift(`🔴 High Attention Required: HIGH-priority ticket has been open for ${hoursOpen}h with no staff response.`);
      score = Math.max(score, 85);
    }
    // Rule B: Frustrated / Critical sentiment open >= 2 hours
    else if (isNegativeSentiment && elapsedHours >= 2) {
      attentionBadge = "HIGH_ATTENTION";
      attentionReason = `Negative sentiment ticket open for ${hoursOpen}h with no staff response`;
      factors.unshift(`🔴 High Attention Required: Employee tone is ${ticket.aiSentiment} and ticket has been unattended for ${hoursOpen}h.`);
      score = Math.max(score, 80);
    }
    // Rule C: Any ticket open >= 24 hours without triage
    else if (elapsedHours >= 24) {
      attentionBadge = "HIGH_ATTENTION";
      attentionReason = `Ticket has remained in OPEN state for ${hoursOpen}h without triage`;
      factors.unshift(`🔴 High Attention Required: Ticket has remained unassigned in OPEN status for ${hoursOpen}h.`);
      score = Math.max(score, 80);
    }
    // Rule D: MEDIUM-priority open >= 12 hours
    else if (isMediumPriority && elapsedHours >= 12) {
      attentionBadge = "ATTENTION_REQUIRED";
      attentionReason = `MEDIUM-priority ticket open for ${hoursOpen}h with no staff response`;
      factors.unshift(`🟡 Attention Required: MEDIUM-priority ticket has been open for ${hoursOpen}h with no staff response.`);
      score = Math.max(score, 60);
    }
  }

  // Clamp score between 5 and 99 for active unbreached tickets
  const finalScore = Math.max(5, Math.min(99, score));

  let riskLevel: "NORMAL" | "ELEVATED" | "CRITICAL" = "NORMAL";
  if (finalScore >= 75) {
    riskLevel = "CRITICAL";
    if (attentionBadge === "ON_TRACK") {
      attentionBadge = "HIGH_ATTENTION";
      attentionReason = "Impending SLA deadline breach";
    }
  } else if (finalScore >= 50) {
    riskLevel = "ELEVATED";
    if (attentionBadge === "ON_TRACK") {
      attentionBadge = "ATTENTION_REQUIRED";
      attentionReason = "Approaching SLA deadline threshold";
    }
  }

  return {
    riskScore: finalScore,
    riskLevel,
    hoursRemaining: Number(remainingHours.toFixed(1)),
    projectedBreachAt,
    isBreached: false,
    attentionBadge,
    attentionReason,
    factors: factors.length > 0 ? factors : ["Ticket is progressing within normal parameters."],
  };
}

/**
 * Batch enrichment helper for lists of tickets
 */
export function enrichTicketsWithSlaRisk<T extends Record<string, any>>(
  tickets: T[],
  backlogCountsByDept?: Record<string, number>,
): Array<T & SlaRiskEvaluation> {
  const now = new Date();
  return tickets.map((t) => {
    const dept = t.assignedTo || "HR_ADMIN";
    const backlog = backlogCountsByDept ? backlogCountsByDept[dept] || 0 : 0;
    const evalResult = calculatePredictiveSlaRisk(t as any, backlog, now);
    return {
      ...t,
      ...evalResult,
      slaRiskScore: evalResult.riskScore,
      slaRiskLevel: evalResult.riskLevel,
    };
  });
}
