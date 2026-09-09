import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  Layers,
  Megaphone,
  RefreshCw,
  Repeat,
  TrendingUp,
  Users,
} from "lucide-react";
import BroadcastClusterModal from "./BroadcastClusterModal";

export interface RecurringIssueGroup {
  groupId: string;
  issueTitle: string;
  category: string;
  ticketCount: number;
  confidence: number;
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

interface HelpdeskAnalyticsData {
  overview: {
    totalTickets: number;
    openTickets: number;
    inProgressTickets: number;
    waitingTickets: number;
    resolvedTickets: number;
    closedTickets: number;
    resolutionRate: number;
  };
  slaHealth: {
    complianceRate: number;
    compliantCount: number;
    breachedCount: number;
    activeAtRiskCount: number;
    activeCriticalCount: number;
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
    healthScore: number;
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
  activeAnomalies: Array<{
    id: string;
    category: string;
    intent: string;
    ticketCount: number;
    severity: "WARNING" | "CRITICAL";
    title: string;
    summary: string;
    suggestedAction: string;
    detectedAt: string;
  }>;
}

interface Props {
  data?: HelpdeskAnalyticsData;
  isLoading: boolean;
  onRefresh?: () => void;
  onFilterAnomalyTickets?: (category: string) => void;
}

export default function ExecutiveHelpdeskAnalytics({
  data,
  isLoading,
  onRefresh,
  onFilterAnomalyTickets,
}: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Fetch Recurring Issue Groups (Phase 5 Similar Ticket Detection)
  const {
    data: recurringGroups = [],
    isLoading: isRecurringLoading,
    refetch: refetchRecurring,
  } = useQuery<RecurringIssueGroup[]>({
    queryKey: ["ticket-recurring-issues"],
    queryFn: async () => {
      const res = await api.get("/tickets/recurring-issues");
      return res.data.groups || [];
    },
    refetchInterval: 30000,
  });

  const [broadcastTarget, setBroadcastTarget] = useState<RecurringIssueGroup | null>(null);

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    refetchRecurring();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin mb-3" />
        <p className="text-sm font-medium text-gray-700">Synthesizing Executive AI Helpdesk Analytics...</p>
        <p className="text-xs text-gray-400 mt-1">Aggregating SLA compliance, sentiment signals, and anomaly patterns</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-gray-200">
        <p className="text-sm text-gray-500">No analytics data available at this time.</p>
      </div>
    );
  }

  const {
    overview,
    priorityDistribution,
    sentimentDistribution,
    categoryDistribution,
    topIntents,
  } = data;

  const totalSentiment =
    (sentimentDistribution.POSITIVE || 0) +
    (sentimentDistribution.NEUTRAL || 0) +
    (sentimentDistribution.FRUSTRATED || 0) +
    (sentimentDistribution.CRITICAL || 0) || 1;

  const posPct = Math.round(((sentimentDistribution.POSITIVE || 0) / totalSentiment) * 100);
  const neuPct = Math.round(((sentimentDistribution.NEUTRAL || 0) / totalSentiment) * 100);
  const fruPct = Math.round(((sentimentDistribution.FRUSTRATED || 0) / totalSentiment) * 100);
  const criPct = Math.round(((sentimentDistribution.CRITICAL || 0) / totalSentiment) * 100);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-5 rounded-2xl shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full text-xs font-semibold border border-indigo-400/30">
              <Cpu className="h-3 w-3" /> Enterprise Intelligence
            </span>
            <span className="text-xs text-indigo-200 font-mono">Phase 5 Predictive Analytics</span>
          </div>
          <h2 className="text-xl font-bold mt-1 text-white tracking-tight">
            Executive AI Helpdesk & Operations Dashboard
          </h2>
          <p className="text-xs text-indigo-200 mt-1 max-w-2xl leading-relaxed">
            Real-time telemetry on priority distribution, employee sentiment climate, and systemic incident spike clustering.
          </p>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold backdrop-blur-sm transition border border-white/15 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Telemetry
          </button>
        )}
      </div>

      {/* Primary KPI Grid (Urgency & Employee Sentiment) */}
      {/* Primary KPI: High Urgency Load */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">High Urgency Load</span>
          <div className={`p-2 rounded-lg ${priorityDistribution.HIGH > 0 ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-600"}`}>
            <AlertTriangle className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-red-700">{priorityDistribution.HIGH}</span>
          <span className="text-xs font-medium text-gray-500">High Priority Tickets Requiring Immediate Action</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-2">
          <span>Medium Priority: <strong className="text-gray-700 font-semibold">{priorityDistribution.MEDIUM}</strong></span>
          <span>Low Priority: <strong className="text-gray-700 font-semibold">{priorityDistribution.LOW}</strong></span>
        </div>
      </div>

      {/* Middle Row: Sentiment Bar & Category Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment Climate Bar */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-brand-600" />
                Employee Sentiment Climate
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Real-time emotional tone extracted across all ticket descriptions</p>
            </div>
            <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
              {totalSentiment} Analyzed
            </span>
          </div>

          {/* Multi-segment bar */}
          <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex shadow-inner">
            <div style={{ width: `${posPct}%` }} className="bg-emerald-500 transition-all duration-500" title={`Positive: ${posPct}%`} />
            <div style={{ width: `${neuPct}%` }} className="bg-sky-400 transition-all duration-500" title={`Neutral: ${neuPct}%`} />
            <div style={{ width: `${fruPct}%` }} className="bg-amber-400 transition-all duration-500" title={`Frustrated: ${fruPct}%`} />
            <div style={{ width: `${criPct}%` }} className="bg-red-500 transition-all duration-500" title={`Critical: ${criPct}%`} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <p className="text-[11px] text-gray-500">Positive</p>
                <p className="text-xs font-bold text-gray-900">{sentimentDistribution.POSITIVE} ({posPct}%)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-sky-400 shrink-0" />
              <div>
                <p className="text-[11px] text-gray-500">Neutral</p>
                <p className="text-xs font-bold text-gray-900">{sentimentDistribution.NEUTRAL} ({neuPct}%)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-400 shrink-0" />
              <div>
                <p className="text-[11px] text-gray-500">Frustrated</p>
                <p className="text-xs font-bold text-amber-700">{sentimentDistribution.FRUSTRATED} ({fruPct}%)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500 shrink-0" />
              <div>
                <p className="text-[11px] text-gray-500">Critical</p>
                <p className="text-xs font-bold text-red-700">{sentimentDistribution.CRITICAL} ({criPct}%)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-600" />
                Department & Category Distribution
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Volume share by organizational support vertical</p>
            </div>
            <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
              {overview.totalTickets} Total
            </span>
          </div>

          <div className="space-y-2.5">
            {categoryDistribution.slice(0, 5).map((cat) => (
              <div key={cat.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">{cat.category}</span>
                  <span className="font-semibold text-gray-900">{cat.count} ({cat.percentage}%)</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${cat.percentage}%` }}
                    className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Systemic Incident Groups: Similar Ticket / Recurring Issue Detection (Phase 5) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-amber-500/10 text-amber-600">
                <Repeat className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-bold text-gray-900">
                Similar Ticket / Recurring Issue Detection
              </h3>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  recurringGroups.length > 0
                    ? "bg-amber-100 text-amber-900 border border-amber-300"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {recurringGroups.length} Incident {recurringGroups.length === 1 ? "Cluster" : "Clusters"}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Identifies when multiple employees report the same or highly similar underlying problem and groups them into a single incident.
            </p>
          </div>
        </div>

        {isRecurringLoading ? (
          <div className="py-8 text-center text-xs text-gray-400">
            Scanning active ticket corpus for semantic similarities...
          </div>
        ) : recurringGroups.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
            <CheckCircle2 className="h-7 w-7 text-emerald-500 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-gray-800">No Recurring Problem Clusters Found</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              All active tickets represent isolated, non-recurring requests across departments.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {recurringGroups.map((group) => {
              const isExpanded = !!expandedGroups[group.groupId];
              return (
                <div
                  key={group.groupId}
                  className="rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/40 via-white to-amber-50/20 p-4 shadow-xs hover:border-amber-300 transition"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 border border-red-200 text-[11px] font-bold px-2 py-0.5 rounded-md">
                          🚨 Recurring Issue Detected
                        </span>
                        <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-bold px-2 py-0.5 rounded-md">
                          Affected Tickets: {group.ticketCount}
                        </span>
                        <span className="bg-slate-100 text-slate-800 text-[11px] font-semibold px-2 py-0.5 rounded-md">
                          Category: {group.category}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {group.confidence}% Match Confidence
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-gray-950 mt-1">
                        Issue: {group.issueTitle}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setBroadcastTarget(group)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-xs hover:shadow-sm transition cursor-pointer"
                      >
                        <Megaphone className="h-3 w-3" />
                        <span>Broadcast to All ({group.ticketCount})</span>
                      </button>
                      {onFilterAnomalyTickets && (
                        <button
                          type="button"
                          onClick={() => onFilterAnomalyTickets(group.category)}
                          className="text-[11px] font-semibold text-brand-600 hover:text-brand-800 hover:underline px-2 py-1 rounded bg-white border border-brand-200 cursor-pointer"
                        >
                          Filter {group.category} Queue &rarr;
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleGroupExpand(group.groupId)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg transition cursor-pointer"
                      >
                        <Users className="h-3 w-3" />
                        <span>{isExpanded ? "Hide Tickets" : `View ${group.ticketCount} Tickets`}</span>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Suggested Action Box */}
                  <div className="mt-3 p-3 bg-white/95 rounded-lg border border-amber-200/80 text-xs text-gray-800">
                    <span className="font-bold text-amber-900">Suggested Action:</span>{" "}
                    <span className="text-gray-700">{group.suggestedAction}</span>
                  </div>

                  {/* Expanded Ticket Breakdown */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-amber-200/70 animate-fadeIn space-y-2">
                      <div className="text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                        Affected Tickets In This Incident:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {group.affectedTickets.map((t) => (
                          <Link
                            key={t._id}
                            to={`/app/tickets/${t._id}`}
                            className="group p-2.5 rounded-lg border border-gray-200 bg-white hover:border-brand-400 hover:shadow-xs transition flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-brand-600 group-hover:underline flex items-center gap-1">
                                  {t.ticketId}
                                  <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition" />
                                </span>
                                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                                  {t.status}
                                </span>
                              </div>
                              <p className="text-xs font-medium text-gray-900 line-clamp-2 mt-1" title={t.subject}>
                                {t.subject}
                              </p>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-gray-500 mt-2 pt-1 border-t border-gray-100">
                              <span className="truncate max-w-[130px] font-medium">{t.employeeName || "Employee"}</span>
                              <span className="text-gray-400">
                                {new Date(t.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Section: Top Recurring Pain Points */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand-600" />
              Top Recurring Employee Pain Points
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Most frequent sub-intents extracted from ticket threads</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {topIntents.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center col-span-2">No intent patterns aggregated yet.</p>
          ) : (
            topIntents.map((item, idx) => (
              <div
                key={item.intent}
                className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 bg-gray-50/60 hover:bg-gray-100 transition"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-gray-900">{item.intent}</p>
                    <span className="text-[10px] text-gray-500 font-medium">{item.category}</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-gray-700 bg-white px-2 py-0.5 rounded-md border border-gray-200">
                  {item.count} tickets
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {broadcastTarget && (
        <BroadcastClusterModal
          open={Boolean(broadcastTarget)}
          onClose={() => setBroadcastTarget(null)}
          clusterTitle={`${broadcastTarget.category} — ${broadcastTarget.issueTitle}`}
          category={broadcastTarget.category}
          tickets={broadcastTarget.affectedTickets}
          ticketIds={broadcastTarget.affectedTickets.map((t) => t._id)}
          suggestedAction={broadcastTarget.suggestedAction}
          onSuccess={() => refetchRecurring()}
        />
      )}
    </div>
  );
}
