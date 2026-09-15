import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Link } from "react-router-dom";

import {
  AlertTriangle,
  MessageCircle,
  Sparkles,
  X,
  Search,
  Paperclip,
  BarChart3,
  LayoutDashboard,
  Clock,
} from "lucide-react";

import { api, getErrorMessage, resolveAssetUrl } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import ExecutiveHelpdeskAnalytics from "@/components/tickets/ExecutiveHelpdeskAnalytics";

const ALL_CATEGORIES = [
  { value: "ALL", label: "All Categories" },
  { value: "HR", label: "HR" },
  { value: "Payroll", label: "Payroll" },
  { value: "Leave", label: "Leave" },
  { value: "Attendance", label: "Attendance" },
  { value: "Recruitment", label: "Recruitment" },
  { value: "Employee Referral", label: "Employee Referral" },
  { value: "IT Support", label: "IT Support" },
  { value: "Complaint", label: "Complaint / Grievance" },
];

function getCategoryOptions(role?: string) {
  if (role === "IT_SUPPORT") {
    return [
      { value: "ALL", label: "All IT Support Tickets" },
      { value: "IT Support", label: "IT Support" },
    ];
  }
  if (role === "FINANCE") {
    return [
      { value: "ALL", label: "All Payroll Tickets" },
      { value: "Payroll", label: "Payroll" },
    ];
  }
  if (role === "MANAGER") {
    return [
      { value: "ALL", label: "All Team Grievances" },
      { value: "Complaint", label: "Complaint / Grievance" },
    ];
  }
  return ALL_CATEGORIES;
}

const STATUS_OPTIONS = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_EMPLOYEE",
  "RESOLVED",
  "CLOSED",
] as const;

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function formatSlaStatus(status?: string) {
  return (status ?? "ON_TRACK").replaceAll("_", " ");
}

function slaBadgeClass(status?: string) {
  switch (status) {
    case "BREACHED":
      return "bg-red-50 text-red-700";
    case "DUE_SOON":
      return "bg-amber-50 text-amber-700";
    case "PAUSED":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-emerald-50 text-emerald-700";
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString();
}

export default function Tickets() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuth();
  const categoryOptions = getCategoryOptions(user?.role);
  const [activeTab, setActiveTab] = useState<"management" | "analytics">("management");
  const [escalationTicket, setEscalationTicket] = useState<any | null>(null);
  const [escalationTarget, setEscalationTarget] = useState<
    "HR_ADMIN" | "SUPER_ADMIN"
  >("HR_ADMIN");
  const [escalationReason, setEscalationReason] = useState("");
  const [historyTicket, setHistoryTicket] = useState<any | null>(null);
  const [analyzingTicketId, setAnalyzingTicketId] = useState<string | null>(null);

  const analyzeTicketAi = useMutation({
    mutationFn: async (ticketId: string) => {
      setAnalyzingTicketId(ticketId);
      const res = await api.post(`/tickets/${ticketId}/analyze-ai`);
      return res.data;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      showToast(`AI classified as ${res?.ai?.category || "completed"}!`);
    },
    onError: (err) => {
      showToast(getErrorMessage(err), "error");
    },
    onSettled: () => {
      setAnalyzingTicketId(null);
    },
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tickets", user?.id, user?.role],
    queryFn: async () => {
      const res = await api.get("/tickets");

      return res.data.tickets;
    },
  });

  // Executive AI Analytics (Phase 5)
  const {
    data: analytics,
    isLoading: isAnalyticsLoading,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ["ticket-analytics", user?.id, user?.role],
    queryFn: async () => {
      const res = await api.get("/tickets/analytics");
      return res.data.analytics;
    },
    enabled: activeTab === "analytics",
    refetchInterval: 45000,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // Strict department isolation on the frontend
  const departmentScopedTickets = (data || []).filter((ticket: any) => {
    if (user?.role === "IT_SUPPORT") {
      return (
        ticket.category === "IT Support" || ticket.assignedTo === "IT_SUPPORT"
      );
    }
    if (user?.role === "FINANCE") {
      return ticket.category === "Payroll" || ticket.assignedTo === "FINANCE";
    }
    if (user?.role === "MANAGER") {
      return ticket.category === "Complaint";
    }
    return true;
  });

  const totalCount = departmentScopedTickets.length;
  const openCount = departmentScopedTickets.filter((t: any) => t.status === "OPEN").length;
  const inProgressCount = departmentScopedTickets.filter((t: any) => t.status === "IN_PROGRESS").length;
  const resolvedCount = departmentScopedTickets.filter((t: any) => t.status === "RESOLVED").length;
  const atRiskCount = departmentScopedTickets.filter(
    (t: any) =>
      t.status === "OPEN" &&
      (t.slaRiskLevel === "ELEVATED" ||
        t.slaRiskLevel === "CRITICAL" ||
        t.attentionBadge === "HIGH_ATTENTION" ||
        t.attentionBadge === "ATTENTION_REQUIRED" ||
        t.isBreached),
  ).length;

  const filteredTickets = departmentScopedTickets.filter((ticket: any) => {
    if (statusFilter === "NEEDS_ATTENTION") {
      const isNeedsAttention =
        ticket.status === "OPEN" &&
        (ticket.slaRiskLevel === "ELEVATED" ||
          ticket.slaRiskLevel === "CRITICAL" ||
          ticket.attentionBadge === "HIGH_ATTENTION" ||
          ticket.attentionBadge === "ATTENTION_REQUIRED" ||
          ticket.isBreached);
      if (!isNeedsAttention) {
        return false;
      }
    } else if (statusFilter !== "ALL" && ticket.status !== statusFilter) {
      return false;
    }
    if (categoryFilter !== "ALL" && ticket.category !== categoryFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchId = ticket.ticketId?.toLowerCase().includes(q);
      const matchSubject = ticket.subject?.toLowerCase().includes(q);
      const matchCategory = ticket.category?.toLowerCase().includes(q);
      const matchIntent = ticket.aiIntent?.toLowerCase().includes(q);
      const matchAssigned = (ticket.assignedTo || ticket.assignedManagerId)?.toLowerCase().includes(q);
      return matchId || matchSubject || matchCategory || matchIntent || matchAssigned;
    }
    return true;
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: (typeof STATUS_OPTIONS)[number];
    }) => {
      const res = await api.patch(`/tickets/${id}`, { status });

      return res.data.ticket;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tickets"],
      });

      queryClient.invalidateQueries({
        queryKey: ["my-tickets"],
      });
    },
  });

  const {
    data: escalationHistory = [],
    isLoading: isHistoryLoading,
    isError: isHistoryError,
  } = useQuery({
    queryKey: ["ticket-escalation-history", historyTicket?._id],
    enabled: Boolean(historyTicket?._id),
    queryFn: async () => {
      const res = await api.get(
        `/tickets/${historyTicket._id}/escalation-history`,
      );

      return res.data.history ?? [];
    },
  });

  const escalateTicket = useMutation({
    mutationFn: async ({
      id,
      escalatedTo,
      reason,
    }: {
      id: string;
      escalatedTo: "HR_ADMIN" | "SUPER_ADMIN";
      reason: string;
    }) => {
      const res = await api.post(`/tickets/${id}/escalate`, {
        escalatedTo,
        reason,
      });

      return res.data.ticket;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tickets"],
      });

      queryClient.invalidateQueries({
        queryKey: ["my-tickets"],
      });

      setEscalationTicket(null);
      setEscalationReason("");
      setEscalationTarget("HR_ADMIN");
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-sm text-gray-500">Loading tickets...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-600">Failed to load tickets.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Ticket Management
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage employee support tickets, monitor predictive SLA risk, and review helpdesk analytics.
          </p>
        </div>

        {/* Phase 5: View Mode Tabs */}
        <div className="inline-flex items-center p-1 rounded-xl bg-gray-100 border border-gray-200 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("management")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "management"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5 text-brand-600" />
            <span>Ticket Queue</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "analytics"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Executive Analytics</span>
          </button>
        </div>
      </div>



      {activeTab === "analytics" ? (
        <ExecutiveHelpdeskAnalytics
          data={analytics}
          isLoading={isAnalyticsLoading}
          onRefresh={() => refetchAnalytics()}
          onFilterAnomalyTickets={(cat) => {
            setActiveTab("management");
            setCategoryFilter(cat);
          }}
        />
      ) : (
        <>
          {updateStatus.isError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Failed to update the ticket status. Please try again.
            </div>
          )}

          {/* Search and Filters Toolbar */}
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            {/* Status & SLA Risk Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "ALL", label: `All (${totalCount})` },
                { id: "OPEN", label: `Open (${openCount})` },
                { id: "IN_PROGRESS", label: `In Progress (${inProgressCount})` },
                { id: "RESOLVED", label: `Resolved (${resolvedCount})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    statusFilter === tab.id
                      ? "bg-brand-600 text-white shadow-xs"
                      : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}

              {/* Needs Attention / At-Risk Quick Filter Tab */}
              <button
                type="button"
                onClick={() => {
                  if (statusFilter === "NEEDS_ATTENTION") {
                    setStatusFilter("ALL");
                  } else {
                    setStatusFilter("NEEDS_ATTENTION");
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  statusFilter === "NEEDS_ATTENTION"
                    ? "bg-red-600 text-white shadow-xs"
                    : atRiskCount > 0
                    ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                    : "bg-gray-50 text-gray-500 border border-gray-200"
                }`}
                title="Filter open tickets requiring immediate attention or triage"
              >
                <AlertTriangle className="h-3 w-3" />
                <span>Needs Attention ({atRiskCount})</span>
              </button>
            </div>

        {/* Search & Category Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, subject, keyword..."
              className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-7 text-xs text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:border-brand-500 focus:outline-none"
          >
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <span className="text-[11px] font-medium text-gray-400">
            Showing {filteredTickets.length} of {totalCount}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-gray-50/90 text-gray-700 font-semibold">
              <th className="py-2.5 px-3 text-left whitespace-nowrap">Ticket ID</th>
              <th className="py-2.5 px-2 text-left whitespace-nowrap">Category</th>
              <th className="py-2.5 px-2 text-left whitespace-nowrap">AI Insights</th>
              <th className="py-2.5 px-2 text-left whitespace-nowrap">Priority</th>
              <th className="py-2.5 px-2 text-left">Subject</th>
              <th className="py-2.5 px-2 text-left whitespace-nowrap">Assigned</th>
              <th className="py-2.5 px-2 text-center whitespace-nowrap" title="Attachment">File</th>
              <th className="py-2.5 px-2 text-left whitespace-nowrap">Status</th>
              <th className="py-2.5 px-2 text-left whitespace-nowrap">Attention / SLA Risk</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {filteredTickets?.length ? (
              filteredTickets.map((ticket: any) => (
                <tr
                  key={ticket._id}
                  className="hover:bg-gray-50/80 transition-colors"
                >
                  {/* Ticket ID */}
                  <td className="py-2.5 px-3 font-semibold whitespace-nowrap">
                    <Link
                      to={`/app/tickets/${ticket._id}`}
                      className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-800 hover:underline"
                      title="Click to open conversation"
                    >
                      <MessageCircle className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      <span>{ticket.ticketId}</span>
                    </Link>
                  </td>

                  {/* Category */}
                  <td className="py-2.5 px-2 text-gray-700 whitespace-nowrap">
                    {ticket.category === "Complaint" ? (
                      <span className="font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 text-[11px]">
                        Grievance
                      </span>
                    ) : (
                      <span className="font-medium text-gray-800">{ticket.category}</span>
                    )}
                  </td>

                  {/* AI Insights */}
                  <td className="py-2.5 px-2">
                    {ticket.aiCategory ? (
                      <div className="flex flex-col items-start gap-1">
                        <div className="flex items-center gap-1">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${
                              ticket.aiCategory !== ticket.category
                                ? "bg-amber-50 text-amber-900 border border-amber-200"
                                : "bg-emerald-50 text-emerald-900 border border-emerald-200"
                            }`}
                            title={ticket.aiReason || ""}
                          >
                            <span>{ticket.aiCategory !== ticket.category ? "⚠️ Rec:" : "✅"}</span>
                            <span>{ticket.aiCategory}</span>
                          </span>
                          {ticket.aiConfidence !== null && ticket.aiConfidence !== undefined && (
                            <span className="text-[10px] font-medium text-gray-400">
                              {Math.round(ticket.aiConfidence * 100)}%
                            </span>
                          )}
                        </div>

                        {ticket.aiSentiment && ticket.aiSentiment !== "NEUTRAL" && (
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                              ticket.aiSentiment === "CRITICAL"
                                ? "bg-red-100 text-red-800 animate-pulse"
                                : ticket.aiSentiment === "FRUSTRATED"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {ticket.aiSentiment === "CRITICAL" ? "🚨 Critical" : ticket.aiSentiment === "FRUSTRATED" ? "🔥 Frustrated" : "✨ Positive"}
                          </span>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => analyzeTicketAi.mutate(ticket._id)}
                        disabled={analyzingTicketId === ticket._id}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 transition"
                      >
                        {analyzingTicketId === ticket._id ? (
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                        ) : (
                          <Sparkles className="h-2.5 w-2.5 text-indigo-600" />
                        )}
                        <span>{analyzingTicketId === ticket._id ? "..." : "AI"}</span>
                      </button>
                    )}
                  </td>

                  {/* Priority */}
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        ticket.priority === "HIGH"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : ticket.priority === "MEDIUM"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-slate-50 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {ticket.priority}
                    </span>
                  </td>

                  {/* Subject */}
                  <td className="py-2.5 px-2 max-w-[170px]">
                    <Link
                      to={`/app/tickets/${ticket._id}`}
                      className="block truncate font-medium text-gray-900 hover:text-brand-600 hover:underline"
                      title={ticket.subject}
                    >
                      {ticket.subject}
                    </Link>
                  </td>

                  {/* Assigned To */}
                  <td className="py-2.5 px-2 text-gray-600 max-w-[110px] truncate" title={ticket.category === "Complaint" ? ticket.assignedManagerId || "Not Assigned" : ticket.assignedTo || "Not Assigned"}>
                    {ticket.category === "Complaint"
                      ? ticket.assignedManagerId || "—"
                      : ticket.assignedTo || "—"}
                  </td>

                  {/* Attachment */}
                  <td className="py-2.5 px-2 text-center whitespace-nowrap">
                    {ticket.attachment ? (
                      <a
                        href={resolveAssetUrl(ticket.attachment) ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center p-1 rounded-md text-brand-600 hover:bg-brand-50 hover:text-brand-800 transition"
                        title="View Attachment"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* Status Dropdown */}
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <select
                      value={ticket.status}
                      disabled={updateStatus.isPending}
                      onChange={(e) => {
                        const nextStatus = e.target.value as (typeof STATUS_OPTIONS)[number];
                        if (!STATUS_OPTIONS.includes(nextStatus)) return;
                        updateStatus.mutate({
                          id: ticket._id,
                          status: nextStatus,
                        });
                      }}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 focus:border-brand-500 focus:outline-none"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {formatStatus(status)}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* SLA & Predictive Risk */}
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${slaBadgeClass(
                          ticket.slaStatus,
                        )}`}
                        title={`Due: ${formatDateTime(ticket.slaDueAt)}`}
                      >
                        {formatSlaStatus(ticket.slaStatus)}
                      </span>

                      {/* AI Ticket Attention & Stagnation Risk */}
                      {ticket.status === "OPEN" &&
                      (ticket.slaRiskLevel === "CRITICAL" ||
                        ticket.attentionBadge === "HIGH_ATTENTION" ||
                        ticket.isBreached) ? (
                        <span
                          className="inline-flex items-center gap-1 rounded bg-red-100 text-red-800 px-2 py-0.5 text-[10px] font-bold border border-red-300 shadow-2xs animate-pulse cursor-help"
                          title={ticket.attentionReason || ticket.factors?.join(" • ") || "High attention required"}
                        >
                          <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-red-700" />
                          <span>🔴 High Attention</span>
                        </span>
                      ) : ticket.status === "OPEN" &&
                        (ticket.slaRiskLevel === "ELEVATED" ||
                          ticket.attentionBadge === "ATTENTION_REQUIRED") ? (
                        <span
                          className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-900 px-2 py-0.5 text-[10px] font-semibold border border-amber-300 shadow-2xs cursor-help"
                          title={ticket.attentionReason || ticket.factors?.join(" • ") || "Attention required"}
                        >
                          <Clock className="h-2.5 w-2.5 shrink-0 text-amber-700" />
                          <span>🟡 Needs Attention</span>
                        </span>
                      ) : ticket.status === "IN_PROGRESS" ? (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 text-[10px] font-medium border border-blue-200">
                          <span>In Progress</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium border border-emerald-200">
                          🟢 On Track
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <Link
                        to={`/app/tickets/${ticket._id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-700 shadow-2xs transition"
                        title="Open conversation"
                      >
                        <MessageCircle className="h-3 w-3" />
                        <span>Chat</span>
                      </Link>

                      {ticket.category === "Complaint" && !ticket.isEscalated && (
                        <button
                          type="button"
                          onClick={() => {
                            setEscalationTicket(ticket);
                            setEscalationReason("");
                            setEscalationTarget("HR_ADMIN");
                          }}
                          disabled={escalateTicket.isPending}
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 transition"
                          title="Escalate grievance"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          <span>Escalate</span>
                        </button>
                      )}

                      {ticket.category === "Complaint" && ticket.isEscalated && (
                        <>
                          <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                            Escalated
                          </span>
                          <button
                            type="button"
                            onClick={() => setHistoryTicket(ticket)}
                            className="inline-flex items-center rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50 transition"
                          >
                            History
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={10}
                  className="p-8 text-center text-sm text-gray-500"
                >
                  {searchQuery || statusFilter !== "ALL" || categoryFilter !== "ALL"
                    ? "No tickets match your filter criteria."
                    : "No assigned tickets found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )}

      {historyTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Escalation History
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {historyTicket.ticketId} — {historyTicket.subject}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setHistoryTicket(null)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Close escalation history"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-5">
              {isHistoryLoading ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  Loading escalation history...
                </p>
              ) : isHistoryError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Failed to load escalation history.
                </div>
              ) : escalationHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No escalation history found.
                </p>
              ) : (
                <div className="space-y-3">
                  {escalationHistory.map((item: any) => (
                    <div
                      key={item._id ?? item.id}
                      className="rounded-xl border border-gray-200 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {item.escalatedFrom} → {item.escalatedTo}
                          </span>
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">
                            {formatStatus(item.reason)}
                          </span>
                        </div>

                        <span className="text-xs text-gray-500">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </div>

                      {item.note && (
                        <p className="mt-2 text-sm text-gray-600">
                          {item.note}
                        </p>
                      )}

                      <p className="mt-2 text-[11px] text-gray-400">
                        Escalated by: {item.escalatedById ?? "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {escalationTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Escalate Grievance
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {escalationTicket.ticketId} — {escalationTicket.subject}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEscalationTicket(null)}
                disabled={escalateTicket.isPending}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                aria-label="Close escalation dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Escalate To
                </label>
                <select
                  value={escalationTarget}
                  onChange={(e) =>
                    setEscalationTarget(
                      e.target.value as "HR_ADMIN" | "SUPER_ADMIN",
                    )
                  }
                  disabled={escalateTicket.isPending}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="HR_ADMIN">HR Administrator</option>
                  <option value="SUPER_ADMIN">Senior Leadership</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Escalation Reason
                </label>
                <textarea
                  value={escalationReason}
                  onChange={(e) => setEscalationReason(e.target.value)}
                  disabled={escalateTicket.isPending}
                  maxLength={1000}
                  rows={5}
                  placeholder="Explain why this grievance requires escalation..."
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
                <p className="mt-1 text-right text-xs text-gray-400">
                  {escalationReason.length}/1000
                </p>
              </div>

              {escalateTicket.isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  Failed to escalate the grievance. Please check the reason and
                  try again.
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEscalationTicket(null)}
                  disabled={escalateTicket.isPending}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const reason = escalationReason.trim();

                    if (reason.length < 3) {
                      return;
                    }

                    escalateTicket.mutate({
                      id: escalationTicket._id,
                      escalatedTo: escalationTarget,
                      reason,
                    });
                  }}
                  disabled={
                    escalateTicket.isPending ||
                    escalationReason.trim().length < 3
                  }
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {escalateTicket.isPending
                    ? "Escalating..."
                    : "Escalate Grievance"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
