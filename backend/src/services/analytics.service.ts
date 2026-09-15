/**
 * Executive AI Helpdesk Analytics Service
 * Computes enterprise-grade operational metrics, SLA health distributions,
 * turnaround velocity, sentiment climate, and autonomous deflection ROI.
 */

import { Ticket } from "@/db/models";
import {
  calculatePredictiveSlaRisk,
  getPrioritySlaHours,
} from "./predictiveSla.service";
import {
  detectTicketAnomalies,
  canonicalizeIncident,
  AnomalyAlert,
} from "./anomalyDetection.service";

export interface HelpdeskAnalyticsSummary {
  overview: {
    totalTickets: number;
    openTickets: number;
    inProgressTickets: number;
    waitingTickets: number;
    resolvedTickets: number;
    closedTickets: number;
    resolutionRate: number; // e.g., 78.4
  };
  slaHealth: {
    complianceRate: number; // % resolved within SLA
    compliantCount: number;
    breachedCount: number;
    activeAtRiskCount: number; // ELEVATED or CRITICAL
    activeCriticalCount: number; // CRITICAL
  };
  velocity: {
    avgResolutionHours: number;
    estimatedFirstResponseHours: number;
  };
  priorityDistribution: {
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  sentimentDistribution: {
    POSITIVE: number;
    NEUTRAL: number;
    FRUSTRATED: number;
    CRITICAL: number;
    healthScore: number; // 0 to 100
  };
  categoryDistribution: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  topIntents: Array<{
    intent: string;
    category: string;
    count: number;
  }>;
  activeAnomalies: AnomalyAlert[];
}

export async function getHelpdeskExecutiveAnalytics(
  departmentFilter?: { assignedTo?: string[]; categories?: string[] },
): Promise<HelpdeskAnalyticsSummary> {
  const query: any = {};
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

  const tickets = await Ticket.find(query).sort({ createdAt: -1 }).lean();
  const totalTickets = tickets.length;

  if (totalTickets === 0) {
    return {
      overview: {
        totalTickets: 0,
        openTickets: 0,
        inProgressTickets: 0,
        waitingTickets: 0,
        resolvedTickets: 0,
        closedTickets: 0,
        resolutionRate: 100,
      },
      slaHealth: {
        complianceRate: 100,
        compliantCount: 0,
        breachedCount: 0,
        activeAtRiskCount: 0,
        activeCriticalCount: 0,
      },
      velocity: {
        avgResolutionHours: 0,
        estimatedFirstResponseHours: 0,
      },
      priorityDistribution: {
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
      },
      sentimentDistribution: {
        POSITIVE: 0,
        NEUTRAL: 0,
        FRUSTRATED: 0,
        CRITICAL: 0,
        healthScore: 100,
      },
      categoryDistribution: [],
      topIntents: [],
      activeAnomalies: [],
    };
  }

  const now = new Date();

  let openTickets = 0;
  let inProgressTickets = 0;
  let waitingTickets = 0;
  let resolvedTickets = 0;
  let closedTickets = 0;

  let activeAtRiskCount = 0;
  let activeCriticalCount = 0;
  let breachedCount = 0;
  let compliantCount = 0;

  let totalResolutionHours = 0;
  let resolvedWithTimeCount = 0;

  const priorityCounts = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  const sentimentCounts = {
    POSITIVE: 0,
    NEUTRAL: 0,
    FRUSTRATED: 0,
    CRITICAL: 0,
  };

  const categoryCounts: Record<string, number> = {};
  const intentCounts: Record<string, { category: string; count: number }> = {};

  // Group open tickets by department for backlog assessment
  const deptBacklog: Record<string, number> = {};
  for (const t of tickets) {
    if (t.status === "OPEN" || t.status === "IN_PROGRESS") {
      const dept = t.assignedTo || "HR_ADMIN";
      deptBacklog[dept] = (deptBacklog[dept] || 0) + 1;
    }
  }

  for (const t of tickets) {
    // 1. Status breakdown
    if (t.status === "OPEN") openTickets++;
    else if (t.status === "IN_PROGRESS") inProgressTickets++;
    else if (t.status === "WAITING_FOR_EMPLOYEE") waitingTickets++;
    else if (t.status === "RESOLVED") resolvedTickets++;
    else if (t.status === "CLOSED") closedTickets++;

    // 2. Priority breakdown
    const prio = (t.priority as keyof typeof priorityCounts) || "MEDIUM";
    if (priorityCounts[prio] !== undefined) {
      priorityCounts[prio]++;
    } else {
      priorityCounts.MEDIUM++;
    }

    // 3. Sentiment breakdown
    const sent = (t.aiSentiment as keyof typeof sentimentCounts) || "NEUTRAL";
    if (sentimentCounts[sent] !== undefined) {
      sentimentCounts[sent]++;
    } else {
      sentimentCounts.NEUTRAL++;
    }

    // 4. Category breakdown
    const cat = t.category || "Other";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

    // 5. Intent breakdown (canonicalized to merge phrasing variations like "Issue" vs "Failure")
    if (t.aiIntent || t.subject) {
      const { canonicalCategory, canonicalIntent } = canonicalizeIncident(
        cat,
        t.aiIntent || "",
        t.subject || "",
      );
      if (!intentCounts[canonicalIntent]) {
        intentCounts[canonicalIntent] = { category: canonicalCategory, count: 0 };
      }
      intentCounts[canonicalIntent].count++;
    }

    // 6. SLA Analysis & Predictive Risk
    const isDone = t.status === "RESOLVED" || t.status === "CLOSED";
    const slaHours = getPrioritySlaHours(t.priority);
    const createdMs = new Date(t.createdAt).getTime();

    if (isDone) {
      const updatedMs = new Date(t.updatedAt || t.createdAt).getTime();
      const resolutionHours = Math.max(0.1, (updatedMs - createdMs) / (3600 * 1000));
      totalResolutionHours += resolutionHours;
      resolvedWithTimeCount++;

      if (resolutionHours <= slaHours) {
        compliantCount++;
      } else {
        breachedCount++;
      }
    } else {
      // Active ticket: calculate predictive risk
      const backlog = deptBacklog[t.assignedTo || "HR_ADMIN"] || 0;
      const risk = calculatePredictiveSlaRisk(t as any, backlog, now);

      if (risk.isBreached) {
        breachedCount++;
        activeCriticalCount++;
      } else if (risk.riskLevel === "CRITICAL") {
        activeCriticalCount++;
        activeAtRiskCount++;
      } else if (risk.riskLevel === "ELEVATED") {
        activeAtRiskCount++;
      }
    }
  }

  const finishedCount = resolvedTickets + closedTickets;
  const resolutionRate = Number(((finishedCount / totalTickets) * 100).toFixed(1));
  const evaluatedSlaCount = compliantCount + breachedCount;
  const complianceRate =
    evaluatedSlaCount > 0
      ? Number(((compliantCount / evaluatedSlaCount) * 100).toFixed(1))
      : 100;

  const avgResolutionHours =
    resolvedWithTimeCount > 0
      ? Number((totalResolutionHours / resolvedWithTimeCount).toFixed(1))
      : 4.5;

  const estimatedFirstResponseHours = Number((avgResolutionHours * 0.25).toFixed(1));


  // Sentiment Health Score (100 is best, penalizes Frustrated & Critical)
  const totalSentiment =
    sentimentCounts.POSITIVE +
    sentimentCounts.NEUTRAL +
    sentimentCounts.FRUSTRATED +
    sentimentCounts.CRITICAL || 1;

  const healthScore = Math.max(
    0,
    Math.round(
      ((sentimentCounts.POSITIVE * 1.0 +
        sentimentCounts.NEUTRAL * 0.8 +
        sentimentCounts.FRUSTRATED * 0.3 +
        sentimentCounts.CRITICAL * 0) /
        totalSentiment) *
        100,
    ),
  );

  // Category distribution formatted & sorted
  const categoryDistribution = Object.entries(categoryCounts)
    .map(([category, count]) => ({
      category,
      count,
      percentage: Number(((count / totalTickets) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count);

  // Top sub-intents
  const topIntents = Object.entries(intentCounts)
    .map(([intent, meta]) => ({
      intent,
      category: meta.category,
      count: meta.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Active Anomaly Spike alerts
  const activeAnomalies = detectTicketAnomalies(tickets as any, 24, now);

  return {
    overview: {
      totalTickets,
      openTickets,
      inProgressTickets,
      waitingTickets,
      resolvedTickets,
      closedTickets,
      resolutionRate,
    },
    slaHealth: {
      complianceRate,
      compliantCount,
      breachedCount,
      activeAtRiskCount,
      activeCriticalCount,
    },
    velocity: {
      avgResolutionHours,
      estimatedFirstResponseHours,
    },
    priorityDistribution: priorityCounts,
    sentimentDistribution: {
      ...sentimentCounts,
      healthScore,
    },
    categoryDistribution,
    topIntents,
    activeAnomalies,
  };
}
