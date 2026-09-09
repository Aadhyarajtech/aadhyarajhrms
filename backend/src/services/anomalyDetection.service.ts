/**
 * Trend & Anomaly Detection Engine (Outage & Spike Detector)
 * Clusters incoming tickets by category, intent, and timestamp to identify
 * systemic operational issues (e.g., biometric check-in failure, payroll processing delays).
 */

export interface AnomalyAlert {
  id: string;
  category: string;
  intent: string;
  ticketCount: number;
  severity: "WARNING" | "CRITICAL";
  title: string;
  summary: string;
  affectedTicketIds: string[];
  suggestedAction: string;
  detectedAt: string;
  timeWindowHours: number;
}

interface ClusterGroup {
  category: string;
  intent: string;
  tickets: Array<{
    _id: string;
    ticketId: string;
    subject: string;
    createdAt: string;
    category: string;
    aiIntent?: string | null;
  }>;
}

/**
 * Canonicalizes intent and category so slight spelling/casing variations
 * (e.g., "VPN connectivity issue" vs "VPN Connectivity Failure") map to the exact same incident.
 */
export function canonicalizeIncident(
  category: string,
  rawIntent: string,
  subject: string,
): { canonicalCategory: string; canonicalIntent: string } {
  const combined = `${rawIntent || ""} ${subject || ""}`.toLowerCase();
  let normCategory = (category || "General").trim();

  let canonicalIntent = "";

  if (combined.includes("vpn") || combined.includes("tunnel") || combined.includes("gateway")) {
    normCategory = "IT Support";
    canonicalIntent = "VPN Connectivity Issue";
  } else if (
    combined.includes("biometric") ||
    combined.includes("punch") ||
    combined.includes("fingerprint") ||
    combined.includes("scanner")
  ) {
    normCategory = "Attendance";
    canonicalIntent = "Biometric Attendance Failure";
  } else if (
    combined.includes("salary") ||
    combined.includes("payslip") ||
    combined.includes("uncredited") ||
    combined.includes("deduction")
  ) {
    normCategory = "Payroll";
    canonicalIntent = "Salary & Payout Issue";
  } else if (combined.includes("wifi") || combined.includes("network") || combined.includes("internet")) {
    normCategory = "IT Support";
    canonicalIntent = "Network & Connectivity Issue";
  } else if (
    combined.includes("password") ||
    combined.includes("login") ||
    combined.includes("sign in") ||
    combined.includes("locked")
  ) {
    normCategory = "IT Support";
    canonicalIntent = "Authentication & Login Issue";
  } else if (combined.includes("leave") || combined.includes("balance") || combined.includes("quota")) {
    canonicalIntent = "Leave Policy / Balance Request";
  } else if (
    combined.includes("harassment") ||
    combined.includes("posh") ||
    combined.includes("grievance")
  ) {
    canonicalIntent = "Workplace Grievance";
  } else if (combined.includes("bank") || combined.includes("account update")) {
    canonicalIntent = "Bank Details Update";
  } else if (rawIntent && rawIntent.trim().length > 2) {
    canonicalIntent = rawIntent
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } else {
    canonicalIntent = "General Inquiries";
  }

  return {
    canonicalCategory: normCategory,
    canonicalIntent,
  };
}

export function detectTicketAnomalies(
  tickets: Array<{
    _id: string;
    ticketId: string;
    subject: string;
    category: string;
    status: string;
    createdAt: string;
    aiIntent?: string | null;
  }>,
  windowHours = 24,
  now: Date = new Date(),
): AnomalyAlert[] {
  if (!tickets || tickets.length === 0) return [];

  const cutoffMs = now.getTime() - windowHours * 3600 * 1000;

  // Filter to tickets within the inspection window (or active open tickets)
  const windowTickets = tickets.filter((t) => {
    const createdMs = new Date(t.createdAt).getTime();
    if (Number.isNaN(createdMs)) return false;
    return createdMs >= cutoffMs || t.status === "OPEN" || t.status === "IN_PROGRESS";
  });

  // Group by (canonicalCategory + canonicalIntent)
  const clusters: Record<string, ClusterGroup> = {};
  const seenTicketIds = new Set<string>();

  for (const t of windowTickets) {
    const tid = String(t._id || t.ticketId);
    if (seenTicketIds.has(tid)) continue;
    seenTicketIds.add(tid);

    const { canonicalCategory, canonicalIntent } = canonicalizeIncident(
      t.category,
      t.aiIntent || "",
      t.subject || "",
    );

    const key = `${canonicalCategory.toLowerCase()}:::${canonicalIntent.toLowerCase()}`;
    if (!clusters[key]) {
      clusters[key] = {
        category: canonicalCategory,
        intent: canonicalIntent,
        tickets: [],
      };
    }
    clusters[key].tickets.push(t);
  }

  const alerts: AnomalyAlert[] = [];

  // Anomaly thresholds:
  // - Critical: >= 4 tickets in the cluster
  // - Warning: >= 2 tickets in high-impact categories (Attendance, IT Support, Payroll) or >= 3 in others
  for (const [key, cluster] of Object.entries(clusters)) {
    const count = cluster.tickets.length;
    const isSensitiveCategory = ["Attendance", "IT Support", "Payroll", "Complaint"].includes(cluster.category);
    const threshold = isSensitiveCategory ? 2 : 3;

    if (count >= threshold) {
      const severity = count >= 4 || (isSensitiveCategory && count >= 3) ? "CRITICAL" : "WARNING";

      // Formulate actionable advice
      let suggestedAction = `Review ${cluster.category} tickets in this cluster to determine common root cause.`;
      if (cluster.category === "Attendance") {
        suggestedAction =
          "Check biometric server status, device connectivity, and sync logs. Consider broadcasting an attendance announcement to prevent employee anxiety.";
      } else if (cluster.category === "IT Support") {
        suggestedAction =
          "Check gateway VPN and authentication servers. Notify IT infrastructure team for immediate health audit.";
      } else if (cluster.category === "Payroll") {
        suggestedAction =
          "Verify banking payout status and payroll batch run logs with Finance.";
      }

      const clusterSlug = `${cluster.category.toLowerCase().replace(/[^a-z0-9]/g, "_")}-${cluster.intent.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

      alerts.push({
        id: `anom-${clusterSlug}`,
        category: cluster.category,
        intent: cluster.intent,
        ticketCount: count,
        severity,
        title: `${severity === "CRITICAL" ? "🚨 Incident Outage Detected" : "⚠️ Volume Spike Alert"}: ${cluster.category} — ${cluster.intent}`,
        summary: `Detected a cluster of ${count} recent tickets related to "${cluster.intent}" under ${cluster.category}. This exceeds typical baseline volume.`,
        affectedTicketIds: cluster.tickets.map((t) => String(t._id)),
        suggestedAction,
        detectedAt: now.toISOString(),
        timeWindowHours: windowHours,
      });
    }
  }

  // Sort critical first, then highest count
  alerts.sort((a, b) => {
    if (a.severity === "CRITICAL" && b.severity !== "CRITICAL") return -1;
    if (b.severity === "CRITICAL" && a.severity !== "CRITICAL") return 1;
    return b.ticketCount - a.ticketCount;
  });

  return alerts;
}
