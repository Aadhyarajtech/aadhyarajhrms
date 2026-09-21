// path: src/components/reports/AskHrDataView.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  Search,
  ArrowUpRight,
  Clock,
  Check,
  Copy,
  Users,
  CalendarDays,
  IndianRupee,
  MessageSquare,
  Target,
  RefreshCw,
  AlertCircle,
  X,
  Send,
  Trash2,
  Download,
  BarChart2,
  Table as TableIcon,
  User as UserIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { ReportsApi } from "@/lib/endpoints";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import type { AskHrResult, HrDomain } from "@/types";

export interface AskHrDataViewProps {
  filters?: {
    from?: string;
    to?: string;
    departmentId?: string;
  };
  initialQuery?: string;
  isDrawer?: boolean;
  onClose?: () => void;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  result?: AskHrResult;
  loading?: boolean;
  error?: string;
}

const CURATED_QUESTIONS = [
  {
    icon: Clock,
    domain: "ATTENDANCE" as HrDomain,
    color: "from-amber-500/10 to-orange-500/10 text-amber-700 border-amber-200",
    text: "Which department has the highest absenteeism?",
  },
  {
    icon: IndianRupee,
    domain: "PAYROLL" as HrDomain,
    color: "from-emerald-500/10 to-teal-500/10 text-emerald-700 border-emerald-200",
    text: "What is our total payroll disbursement and deductions?",
  },
  {
    icon: Users,
    domain: "WORKFORCE" as HrDomain,
    color: "from-blue-500/10 to-cyan-500/10 text-blue-700 border-blue-200",
    text: "What is the headcount distribution by department?",
  },
  {
    icon: MessageSquare,
    domain: "TICKETS" as HrDomain,
    color: "from-rose-500/10 to-pink-500/10 text-rose-700 border-rose-200",
    text: "Show unresolved high-priority support tickets",
  },
  {
    icon: CalendarDays,
    domain: "LEAVE" as HrDomain,
    color: "from-violet-500/10 to-purple-500/10 text-violet-700 border-violet-200",
    text: "What are the pending leave requests and approvals?",
  },
  {
    icon: Target,
    domain: "PERFORMANCE" as HrDomain,
    color: "from-indigo-500/10 to-blue-500/10 text-indigo-700 border-indigo-200",
    text: "What are our average performance review ratings?",
  },
  {
    icon: Users,
    domain: "WORKFORCE" as HrDomain,
    color: "from-emerald-500/10 to-green-500/10 text-emerald-700 border-emerald-200",
    text: "Who are our recent hires and new onboardings?",
  },
];

const DOMAIN_CONFIG: Record<
  HrDomain,
  { label: string; badgeColor: string; icon: any }
> = {
  ATTENDANCE: {
    label: "Attendance & Absenteeism",
    badgeColor: "bg-amber-100 text-amber-800 border-amber-200",
    icon: Clock,
  },
  WORKFORCE: {
    label: "Workforce & Headcount",
    badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
    icon: Users,
  },
  PAYROLL: {
    label: "Payroll & Compensation",
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: IndianRupee,
  },
  TICKETS: {
    label: "Helpdesk & Tickets",
    badgeColor: "bg-rose-100 text-rose-800 border-rose-200",
    icon: MessageSquare,
  },
  LEAVE: {
    label: "Leave & Time-Off",
    badgeColor: "bg-violet-100 text-violet-800 border-violet-200",
    icon: CalendarDays,
  },
  PERFORMANCE: {
    label: "Performance Reviews",
    badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-200",
    icon: Target,
  },
  RECRUITMENT: {
    label: "Recruitment & Talent",
    badgeColor: "bg-cyan-100 text-cyan-800 border-cyan-200",
    icon: Users,
  },
  GENERAL: {
    label: "HR Insights",
    badgeColor: "bg-slate-100 text-slate-800 border-slate-200",
    icon: Sparkles,
  },
};

const CHART_COLORS = [
  "#6366f1",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

const CHAT_STORAGE_KEY = "aadhyaraj_hr_chat_messages";

export function AskHrDataView({
  filters,
  initialQuery,
  isDrawer = false,
  onClose,
}: AskHrDataViewProps) {
  const navigate = useNavigate();

  // Mode: "chat" (default conversational interface) vs "dashboard" (single-query dashboard)
  const [viewMode, setViewMode] = useState<"chat" | "dashboard">("chat");

  // Input states
  const [inputQuestion, setInputQuestion] = useState(initialQuery || "");
  const [loading, setLoading] = useState(false);

  // Chat message history
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return [
      {
        id: "welcome-msg",
        sender: "assistant",
        text: "👋 Hello! I am your AI HR Intelligence Assistant. You can chat with me in plain English to query live records across Attendance, Headcount, Payroll, Leave Requests, Performance, and Helpdesk Tickets.",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ];
  });

  // State for single-query dashboard view
  const [dashboardResult, setDashboardResult] = useState<AskHrResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Expandable sections inside assistant message bubbles (messageId -> boolean)
  const [expandedCharts, setExpandedCharts] = useState<Record<string, boolean>>({});
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist messages to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages]);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (viewMode === "chat") {
      scrollToBottom();
    }
  }, [messages, viewMode]);

  // Execute question in Chat Mode
  const handleSendChat = async (queryText?: string) => {
    const target = (queryText !== undefined ? queryText : inputQuestion).trim();
    if (!target || loading) return;

    const timeStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: target,
      timestamp: timeStr,
    };

    const pendingAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      sender: "assistant",
      text: "",
      timestamp: timeStr,
      loading: true,
    };

    // Update messages with user message and pending assistant message
    const updatedMessages = [...messages, userMsg, pendingAssistantMsg];
    setMessages(updatedMessages);
    setInputQuestion("");
    setLoading(true);

    try {
      // Map previous messages to history
      const history = messages
        .filter((m) => !m.loading && !m.error)
        .slice(-6)
        .map((m) => ({
          role: m.sender,
          content: m.text,
        }));

      const data = await ReportsApi.askHr(target, filters, history);

      setDashboardResult(data);

      // By default, open charts if available
      if (data.chartData && data.chartData.length > 0) {
        setExpandedCharts((prev) => ({ ...prev, [assistantMsgId]: true }));
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                loading: false,
                text: data.answerText,
                result: data,
              }
            : m
        )
      );
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to query HR records. Please try asking with different keywords.";

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                loading: false,
                text: "I encountered an error querying the database for this question.",
                error: errMsg,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Clear conversation history
  const handleClearChat = () => {
    const welcome: ChatMessage = {
      id: `welcome-${Date.now()}`,
      sender: "assistant",
      text: "👋 Chat reset. You can ask a fresh natural language question about your HR records!",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setMessages([welcome]);
    sessionStorage.removeItem(CHAT_STORAGE_KEY);
    setDashboardResult(null);
  };

  // Export conversation as text file
  const handleExportChat = () => {
    const lines: string[] = [];
    lines.push("========================================");
    lines.push("Aadhyaraj HRMS — Natural Language AI Chat");
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push("========================================\n");

    messages.forEach((m) => {
      const senderName = m.sender === "user" ? "User" : "HR AI Assistant";
      lines.push(`[${m.timestamp}] ${senderName}:`);
      lines.push(`${m.text}\n`);
      if (m.result?.keyMetric) {
        lines.push(
          `  Key Metric: ${m.result.keyMetric.label} = ${m.result.keyMetric.value} (${m.result.keyMetric.subtext || ""})\n`
        );
      }
      if (m.result?.table?.rows) {
        lines.push(`  Table Preview (${m.result.table.rows.length} records)`);
        lines.push(`  Columns: ${m.result.table.columns.join(" | ")}`);
        m.result.table.rows.slice(0, 10).forEach((r) => {
          lines.push(`  - ${r.join(" | ")}`);
        });
        lines.push("");
      }
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hr-ai-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyText = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Handle initial query if provided
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      handleSendChat(initialQuery.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const formatTooltipValue = (val: any): string => {
    if (typeof val === "number") {
      if (val >= 100000) {
        return new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 0,
        }).format(val);
      }
      return val.toLocaleString();
    }
    return String(val);
  };

  const formatYAxisTick = (val: number): string => {
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
    return `${val}`;
  };

  return (
    <div className={`space-y-4 ${isDrawer ? "h-full flex flex-col" : ""}`}>
      {/* 1. Header Toolbar & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200/80 bg-gradient-to-r from-indigo-50/70 via-white to-purple-50/60 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-sm">
            <Sparkles size={18} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[16px] font-bold text-ink">
                HR AI Chat & Natural Language Query
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                Live AI
              </span>
            </div>
            <p className="text-[12px] text-ink-soft">
              Query attendance, headcount, payroll, leaves, or tickets conversationally in plain English.
            </p>
          </div>
        </div>

        {/* Action Controls & View Switcher */}
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/80 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("chat")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === "chat"
                  ? "bg-white text-brand-700 shadow-xs"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              <MessageSquare size={13} />
              <span>💬 Chat View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("dashboard")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === "dashboard"
                  ? "bg-white text-brand-700 shadow-xs"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              <BarChart2 size={13} />
              <span>📊 Dashboard View</span>
            </button>
          </div>

          {viewMode === "chat" && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleExportChat}
                title="Download conversation transcript"
                className="text-ink-soft hover:text-ink text-xs h-8 px-2.5"
                leftIcon={<Download size={13} />}
              >
                Export
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleClearChat}
                title="Clear chat history"
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs h-8 px-2.5"
                leftIcon={<Trash2 size={13} />}
              >
                Clear
              </Button>
            </>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-ink-soft hover:bg-slate-200/60 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* 2. CHAT CONVERSATIONAL VIEW */}
      {viewMode === "chat" && (
        <div
          className={`flex flex-col rounded-2xl border border-line bg-white shadow-sm overflow-hidden ${
            isDrawer ? "flex-1 min-h-0" : "h-[680px]"
          }`}
        >
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/40">
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              const result = msg.result;
              const domainMeta = result ? DOMAIN_CONFIG[result.domain] : null;
              const hasChart = Boolean(
                result?.chartData &&
                  result.chartData.length > 0 &&
                  result.chartData.some((d) => Number(d.value) > 0)
              );
              const isChartExpanded = expandedCharts[msg.id] ?? true;
              const isTableExpanded = expandedTables[msg.id] ?? false;

              const effectiveActionLink =
                result?.actionLink ||
                (result?.domain === "TICKETS"
                  ? { label: "View in Tickets", url: "/app/tickets?status=OPEN" }
                  : result?.domain === "LEAVE"
                  ? { label: "View Leaves", url: "/app/leave" }
                  : result?.domain === "ATTENDANCE"
                  ? { label: "View Attendance", url: "/app/attendance" }
                  : result?.domain === "WORKFORCE"
                  ? { label: "View Directory", url: "/app/employees" }
                  : result?.domain === "PAYROLL"
                  ? { label: "View Payroll", url: "/app/payroll" }
                  : null);

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  {/* Assistant Avatar */}
                  {!isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-xs mt-1">
                      <Sparkles size={14} />
                    </div>
                  )}

                  {/* Message Bubble Body */}
                  <div
                    className={`max-w-2xl space-y-2.5 rounded-2xl p-4 transition-all ${
                      isUser
                        ? "bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-sm rounded-tr-xs"
                        : "bg-white text-ink border border-slate-200/90 shadow-xs rounded-tl-xs"
                    }`}
                  >
                    {/* Header Info */}
                    <div className="flex items-center justify-between gap-3 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-semibold ${
                            isUser ? "text-white/90" : "text-ink"
                          }`}
                        >
                          {isUser ? "You" : "HR Intelligence AI"}
                        </span>
                        {!isUser && domainMeta && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.2 text-[10px] font-medium border ${domainMeta.badgeColor}`}
                          >
                            <domainMeta.icon size={10} />
                            {domainMeta.label}
                          </span>
                        )}
                      </div>
                      <span className={isUser ? "text-white/70" : "text-ink-faint"}>
                        {msg.timestamp}
                      </span>
                    </div>

                    {/* Loading State Animation */}
                    {msg.loading && (
                      <div className="flex items-center gap-2 py-2 text-ink-soft">
                        <RefreshCw size={14} className="animate-spin text-brand-600" />
                        <span className="text-xs">
                          Querying live HR database and synthesizing response…
                        </span>
                      </div>
                    )}

                    {/* Error State */}
                    {msg.error && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-rose-800 text-xs">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <AlertCircle size={14} className="text-rose-600" />
                          <span>Query Error</span>
                        </div>
                        <p className="mt-1 text-rose-700">{msg.error}</p>
                      </div>
                    )}

                    {/* Primary Text Message */}
                    {msg.text && (
                      <div
                        className={`text-[13.5px] leading-relaxed whitespace-pre-line ${
                          isUser ? "text-white font-normal" : "text-ink"
                        }`}
                      >
                        {msg.text}
                      </div>
                    )}

                    {/* Rich Assistant Content (Key Metric, Chart, Table, Action Link) */}
                    {!isUser && result && !msg.loading && (
                      <div className="space-y-3 pt-2">
                        {/* Key Metric Highlight Card */}
                        {result.keyMetric && (
                          <div
                            onClick={() => {
                              if (effectiveActionLink) {
                                navigate(effectiveActionLink.url);
                              }
                            }}
                            className={`flex flex-wrap items-baseline gap-2 rounded-xl border border-brand-200 bg-gradient-to-r from-brand-50/60 to-indigo-50/60 px-4 py-2.5 shadow-xs ${
                              effectiveActionLink
                                ? "cursor-pointer hover:border-brand-400 hover:shadow-xs transition-all"
                                : ""
                            }`}
                          >
                            <span className="text-xs font-semibold text-brand-900">
                              {result.keyMetric.label}:
                            </span>
                            <span className="font-display text-[18px] font-bold text-brand-700">
                              {result.keyMetric.value}
                            </span>
                            {result.keyMetric.subtext && (
                              <span className="text-[11px] text-ink-soft">
                                ({result.keyMetric.subtext})
                              </span>
                            )}
                            {effectiveActionLink && (
                              <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline">
                                <span>{effectiveActionLink.label}</span>
                                <ArrowUpRight size={11} />
                              </span>
                            )}
                          </div>
                        )}

                        {/* Interactive Bar Chart */}
                        {hasChart && (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                              <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                                <BarChart2 size={13} className="text-brand-600" />
                                Metric Distribution Breakdown
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedCharts((prev) => ({
                                    ...prev,
                                    [msg.id]: !isChartExpanded,
                                  }))
                                }
                                className="text-xs text-ink-soft hover:text-ink flex items-center gap-1"
                              >
                                {isChartExpanded ? (
                                  <>
                                    <span>Collapse</span>
                                    <ChevronUp size={12} />
                                  </>
                                ) : (
                                  <>
                                    <span>Expand</span>
                                    <ChevronDown size={12} />
                                  </>
                                )}
                              </button>
                            </div>

                            {isChartExpanded && (
                              <div className="h-52 w-full pt-3">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart
                                    data={result.chartData}
                                    margin={{ top: 10, right: 10, left: -10, bottom: 25 }}
                                  >
                                    <CartesianGrid
                                      strokeDasharray="3 3"
                                      vertical={false}
                                      stroke="#f1f5f9"
                                    />
                                    <XAxis
                                      dataKey="label"
                                      tick={{ fontSize: 10, fill: "#64748b" }}
                                      interval={0}
                                      angle={-20}
                                      textAnchor="end"
                                      height={35}
                                    />
                                    <YAxis
                                      tick={{ fontSize: 10, fill: "#64748b" }}
                                      tickFormatter={formatYAxisTick}
                                    />
                                    <Tooltip
                                      formatter={(val) => [
                                        formatTooltipValue(val),
                                        "Value",
                                      ]}
                                      contentStyle={{
                                        borderRadius: 8,
                                        fontSize: 12,
                                        border: "1px solid #e2e8f0",
                                      }}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                      {result.chartData!.map((_, i) => (
                                        <Cell
                                          key={`cell-${i}`}
                                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                                        />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Collapsible Data Table Preview */}
                        {result.table && result.table.rows.length > 0 && (
                          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                            <div className="flex items-center justify-between p-3 bg-slate-50 border-b border-slate-200">
                              <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                                <TableIcon size={13} className="text-brand-600" />
                                Database Records ({result.table.rows.length} rows)
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedTables((prev) => ({
                                    ...prev,
                                    [msg.id]: !isTableExpanded,
                                  }))
                                }
                                className="text-xs text-brand-700 font-semibold hover:underline flex items-center gap-1"
                              >
                                {isTableExpanded ? "Show Less" : "View Full Table"}
                                {isTableExpanded ? (
                                  <ChevronUp size={12} />
                                ) : (
                                  <ChevronDown size={12} />
                                )}
                              </button>
                            </div>

                            <div className="overflow-x-auto max-h-56">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-100/80 text-ink-soft border-b border-slate-200">
                                    {result.table.columns.map((col, idx) => (
                                      <th
                                        key={idx}
                                        className="py-2 px-3 font-semibold text-[11px]"
                                      >
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(isTableExpanded
                                    ? result.table.rows
                                    : result.table.rows.slice(0, 4)
                                  ).map((row, rIdx) => (
                                    <tr
                                      key={rIdx}
                                      className="border-b border-slate-100 hover:bg-slate-50/60"
                                    >
                                      {row.map((cell, cIdx) => (
                                        <td
                                          key={cIdx}
                                          className="py-1.5 px-3 text-ink text-[11.5px]"
                                        >
                                          {String(cell)}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Copy button & suggested follow-ups */}
                        <div className="flex items-center justify-between pt-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleCopyText(msg.id, msg.text)}
                            className="text-ink-soft hover:text-ink flex items-center gap-1"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check size={12} className="text-emerald-600" />
                                <span className="text-emerald-600 font-semibold">
                                  Copied
                                </span>
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Clickable Suggested Follow-Ups */}
                        {result.suggestedFollowUps &&
                          result.suggestedFollowUps.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider">
                                Suggested Follow-ups:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {result.suggestedFollowUps.map((fu, fIdx) => (
                                  <button
                                    key={fIdx}
                                    type="button"
                                    onClick={() => handleSendChat(fu)}
                                    disabled={loading}
                                    className="rounded-lg border border-brand-200 bg-brand-50/70 px-2.5 py-1 text-[11px] font-medium text-brand-800 hover:bg-brand-100 hover:border-brand-300 transition-all text-left"
                                  >
                                    ✦ {fu}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    )}
                  </div>

                  {/* User Avatar */}
                  {isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-ink shadow-xs mt-1">
                      <UserIcon size={14} />
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>

          {/* Prompt Starters & Input Bar Container */}
          <div className="border-t border-line bg-white p-3 sm:p-4 space-y-3">
            {/* Quick Suggestions Horizontal Scroll */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <span className="text-[11px] font-semibold text-ink-faint shrink-0 flex items-center gap-1">
                <Sparkles size={11} className="text-brand-600" />
                Try Asking:
              </span>
              {CURATED_QUESTIONS.slice(0, 4).map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendChat(q.text)}
                  disabled={loading}
                  className="shrink-0 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-[11px] text-ink-soft hover:bg-brand-50 hover:text-brand-800 hover:border-brand-200 transition-colors"
                >
                  {q.text}
                </button>
              ))}
            </div>

            {/* Main Chat Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputQuestion}
                  onChange={(e) => setInputQuestion(e.target.value)}
                  placeholder="Ask any natural language question about workforce, attendance, payroll..."
                  disabled={loading}
                  className="w-full rounded-xl border border-line bg-slate-50/60 pl-4 pr-10 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
                />
                {inputQuestion && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputQuestion("");
                      inputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading || !inputQuestion.trim()}
                className="shrink-0 bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 hover:from-brand-700 text-white shadow-sm border-0 px-4 py-2.5 font-semibold text-xs rounded-xl"
                leftIcon={
                  loading ? (
                    <RefreshCw size={14} className="animate-spin text-white" />
                  ) : (
                    <Send size={14} className="text-white" />
                  )
                }
              >
                {loading ? "Analyzing…" : "Send"}
              </Button>
            </form>
            <div className="flex items-center justify-between text-[10px] text-ink-faint px-1">
              <span>Press Enter to send message</span>
              <span>Queries live MongoDB records with Groq AI fallback</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. CLASSIC DASHBOARD VIEW (Single Query Overview) */}
      {viewMode === "dashboard" && (
        <div className="space-y-6">
          {/* Search Hero */}
          <Card className="p-6 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/50 border border-brand-200/90 shadow-sm">
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-[18px] font-bold text-ink">
                  HR Single Query & Analysis Dashboard
                </h3>
                <p className="text-xs text-ink-soft">
                  Type a question below to analyze a specific business metric in full-screen dashboard mode.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChat();
                }}
                className="flex flex-col sm:flex-row items-center gap-2"
              >
                <div className="relative w-full">
                  <Search
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
                  />
                  <input
                    type="text"
                    value={inputQuestion}
                    onChange={(e) => setInputQuestion(e.target.value)}
                    placeholder="e.g. Which department has the highest absenteeism?"
                    className="w-full rounded-xl border border-line bg-white pl-10 pr-10 py-3 text-[14px] text-ink shadow-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    disabled={loading}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading || !inputQuestion.trim()}
                  className="w-full sm:w-auto shrink-0 bg-brand-600 text-white font-semibold text-xs px-6 py-3"
                  leftIcon={
                    loading ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )
                  }
                >
                  {loading ? "Analyzing…" : "Query Database"}
                </Button>
              </form>

              {/* Quick Prompt Starters */}
              <div className="flex flex-wrap gap-2 pt-2">
                {CURATED_QUESTIONS.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendChat(item.text)}
                      disabled={loading}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium bg-gradient-to-r ${item.color} transition-all hover:scale-[1.01]`}
                    >
                      <Icon size={12} className="shrink-0" />
                      <span>{item.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Results in Dashboard View */}
          {dashboardResult && (
            <div className="space-y-6">
              {/* Answer Card */}
              <Card className="p-6 border border-line bg-white shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                  <span className="text-xs font-bold text-ink uppercase tracking-wider">
                    Query: "{dashboardResult.question}"
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                    {dashboardResult.source === "llm"
                      ? "✦ LLM Synthesized"
                      : "⚙ Live Aggregation"}
                  </span>
                </div>

                <div className="rounded-xl bg-slate-50/80 p-4 border border-slate-200/70">
                  <p className="text-[14px] text-ink leading-relaxed">
                    {dashboardResult.answerText}
                  </p>
                </div>

                {dashboardResult.keyMetric && (
                  <div className="inline-flex items-baseline gap-2 rounded-2xl border border-brand-200 bg-brand-50/60 px-5 py-3 shadow-xs">
                    <span className="text-xs font-medium text-brand-800">
                      {dashboardResult.keyMetric.label}:
                    </span>
                    <span className="font-display text-[22px] font-bold text-brand-700">
                      {dashboardResult.keyMetric.value}
                    </span>
                    {dashboardResult.keyMetric.subtext && (
                      <span className="text-xs text-ink-soft">
                        ({dashboardResult.keyMetric.subtext})
                      </span>
                    )}
                  </div>
                )}
              </Card>

              {/* Chart & Table Grid */}
              <div className="grid gap-6 lg:grid-cols-2">
                {dashboardResult.chartData && dashboardResult.chartData.length > 0 && (
                  <Card className="p-5 border border-line bg-white shadow-sm">
                    <CardHeader
                      title="Distribution Chart"
                      subtitle={`${dashboardResult.chartData.length} records`}
                    />
                    <div className="h-64 w-full mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={dashboardResult.chartData}
                          margin={{ top: 10, right: 10, left: -10, bottom: 25 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10 }}
                            angle={-20}
                            textAnchor="end"
                          />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={formatYAxisTick} />
                          <Tooltip formatter={(val) => [formatTooltipValue(val), "Value"]} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {dashboardResult.chartData.map((_, i) => (
                              <Cell
                                key={i}
                                fill={CHART_COLORS[i % CHART_COLORS.length]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                )}

                {dashboardResult.table && dashboardResult.table.rows.length > 0 && (
                  <Card className="p-5 border border-line bg-white shadow-sm">
                    <CardHeader
                      title="Detailed Records"
                      subtitle={`${dashboardResult.table.rows.length} total rows`}
                    />
                    <div className="overflow-x-auto max-h-64 mt-4">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200">
                            {dashboardResult.table.columns.map((c, i) => (
                              <th key={i} className="p-2 font-semibold text-ink-soft">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardResult.table.rows.map((row, rI) => (
                            <tr
                              key={rI}
                              className="border-b border-slate-100 hover:bg-slate-50"
                            >
                              {row.map((cell, cI) => (
                                <td key={cI} className="p-2 text-ink">
                                  {String(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
