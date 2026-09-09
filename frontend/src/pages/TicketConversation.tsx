import { useEffect, useRef, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Paperclip,
  Send,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Zap,
  PenLine,
  Megaphone,
} from "lucide-react";

import { api, resolveAssetUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import BroadcastClusterModal from "@/components/tickets/BroadcastClusterModal";

const STAFF_ROLES = ["HR_ADMIN", "FINANCE", "IT_SUPPORT", "SUPER_ADMIN", "MANAGER"];

type ReplyTone = "empathetic" | "formal" | "concise";

interface TicketSummaryData {
  issue: string;
  currentStatus: string;
  pendingAction: string;
}

interface Ticket {
  _id: string;
  ticketId: string;
  category: string;
  priority: string;
  subject: string;
  description?: string;
  status: string;
  assignedTo?: string;
  employeeId?: string;
  attachment?: string;
  createdAt?: string;
  aiCategory?: string | null;
  aiIntent?: string | null;
  aiConfidence?: number | null;
  aiReason?: string | null;
  aiPriority?: string | null;
  aiPriorityReason?: string | null;
  aiSentiment?: string | null;
  // Phase 5: Predictive SLA Warning
  slaRiskScore?: number;
  slaRiskLevel?: "NORMAL" | "ELEVATED" | "CRITICAL";
  hoursRemaining?: number;
  factors?: string[];
}

interface TicketMessage {
  id: string;
  ticketId: string;
  employeeId: string;
  senderName: string;
  senderRole: string;
  message: string;
    createdAt: string;
    attachment?: string;
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TicketConversation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isUserAtBottom = useRef(true);
  const { user } = useAuth();
  const currentEmployeeId = user?.employee?.id;

  // Phase 3: Staff-only AI Copilot state
  const isStaff = STAFF_ROLES.includes(user?.role || "");
  const [summary, setSummary] = useState<TicketSummaryData | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [draftTone, setDraftTone] = useState<ReplyTone>("empathetic");
  const [draftLoading, setDraftLoading] = useState(false);
  const [showDraftToolbar, setShowDraftToolbar] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [classificationOpen, setClassificationOpen] = useState(false);
  const [similarOpen, setSimilarOpen] = useState(false);
  const [isBroadcastClusterOpen, setIsBroadcastClusterOpen] = useState(false);

  /*
   * =========================================================
   * GET TICKET
   * =========================================================
   */

  const {
    data: ticket,
    isLoading: ticketLoading,
    isError: ticketError,
  } = useQuery<Ticket>({
    queryKey: ["ticket", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get(`/tickets/${id}`);
      return res.data.ticket;
    },
  });

  // Phase 5: Similar Ticket / Recurring Issue Detection Query
  const { data: similarData } = useQuery({
    queryKey: ["ticket-similar", id],
    enabled: Boolean(id) && isStaff,
    queryFn: async () => {
      const res = await api.get(`/tickets/${id}/similar`);
      return res.data;
    },
  });

  const similarTickets = (similarData?.similarTickets || []) as Array<{
    _id: string;
    ticketId: string;
    subject: string;
    category: string;
    priority: string;
    status: string;
    createdAt: string;
    employeeName?: string;
    similarityScore: number;
    commonIntent?: string | null;
  }>;

  /*
   * =========================================================
   * GET MESSAGES
   * =========================================================
   */

  const {
    data: messages = [],
    isLoading: messagesLoading,
    isError: messagesError,
  } = useQuery<TicketMessage[]>({
    queryKey: ["ticket-messages", id],
    enabled: Boolean(id),
    refetchInterval: 3000,
    queryFn: async () => {
      const res = await api.get(`/tickets/${id}/messages`);

      return (
        res.data.messages ||
        res.data.ticketMessages ||
        []
      );
    },
  });

  // Ensure messages are sorted oldest -> newest using full timestamp (memoized)
  const sortedMessages = useMemo(() => {
    return (messages || []).slice().sort((a, b) => {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [messages]);

  /*
   * =========================================================
   * SEND MESSAGE
   * =========================================================
   */

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Ticket ID is missing");

      const text = message.trim();

      if (!text && !selectedFile) {
        throw new Error("Message cannot be empty");
      }

      const form = new FormData();
      form.append("message", text);
      if (selectedFile) {
        form.append("attachment", selectedFile);
      }

      const res = await api.post(`/tickets/${id}/messages`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      return res.data.message;
    },

    onSuccess: () => {
      setMessage("");
      setSelectedFile(null);
      isUserAtBottom.current = true;
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);

      queryClient.invalidateQueries({ queryKey: ["ticket-messages", id] });
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
    },
  });

  /*
   * =========================================================
   * AUTO SCROLL
   * =========================================================
   */

  const prevMessageCountRef = useRef(0);
  const initialScrollDoneRef = useRef(false);

  // Reset scroll refs when switching tickets
  useEffect(() => {
    initialScrollDoneRef.current = false;
    prevMessageCountRef.current = 0;
  }, [id]);

  // Track user's scroll position to avoid forcing scroll when reading history
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onScroll() {
      const current = containerRef.current;
      if (!current) return;
      const threshold = 120; // px from bottom to consider "at bottom"
      const atBottom =
        current.scrollHeight - current.scrollTop - current.clientHeight <= threshold;
      isUserAtBottom.current = atBottom;
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Only scroll when message count actually increases (initial load or newly received message)
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const messageCount = messages.length;
    const isFirstLoad = !initialScrollDoneRef.current;
    const hasNewMessage = messageCount > prevMessageCountRef.current;

    if (isFirstLoad) {
      initialScrollDoneRef.current = true;
      prevMessageCountRef.current = messageCount;
      // Scroll to bottom immediately on first open
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      return;
    }

    if (hasNewMessage) {
      prevMessageCountRef.current = messageCount;
      // Only auto-scroll down if user is already watching the bottom
      if (isUserAtBottom.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages]);

  async function handleGenerateReply() {
    if (draftLoading) return;
    setDraftLoading(true);
    try {
      const res = await api.post(`/tickets/${id}/suggest-reply`, {
        tone: draftTone,
        instruction: draftPrompt.trim() || undefined,
      });
      if (res.data?.reply) {
        setMessage(res.data.reply);
        showToast(
          draftPrompt.trim()
            ? `Draft generated with your notes (${draftTone})!`
            : `${draftTone.charAt(0).toUpperCase() + draftTone.slice(1)} draft inserted — review and send`
        );
        setShowDraftToolbar(false);
        setDraftPrompt("");
      }
    } catch {
      showToast("Failed to generate draft reply", "error");
    } finally {
      setDraftLoading(false);
    }
  }

  /*
   * =========================================================
   * SEND MESSAGE
   * =========================================================
   */

  function handleSendMessage() {
    if (sendMessage.isPending) return;
    if (!message.trim() && !selectedFile) return;

    sendMessage.mutate();
  }


  /*
   * =========================================================
   * ATTACHMENT
   *
   * This selects the file and displays its name.
   * The existing message API you supplied only accepts
   * text messages, so the file is not sent to the server yet.
   * =========================================================
   */

  function handleAttachmentChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const maxSize = 8 * 1024 * 1024;

    if (file.size > maxSize) {
      showToast("File size must be 8MB or less.", "error");

      event.target.value = "";
      setSelectedFile(null);

      return;
    }

    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedTypes.includes(file.type)) {
      showToast(
        "Unsupported file type. Please upload a PDF, Word document, or image.",
        "error",
      );

      event.target.value = "";
      setSelectedFile(null);

      return;
    }

    setSelectedFile(file);
  }

  function removeAttachment() {
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  /*
   * =========================================================
   * LOADING
   * =========================================================
   */

  if (ticketLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading ticket...
        </div>
      </div>
    );
  }

  /*
   * =========================================================
   * ERROR
   * =========================================================
   */

  if (ticketError || !ticket) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate(isStaff ? "/app/tickets" : "/app/my-tickets")}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {isStaff ? "Back to Tickets" : "Back to My Tickets"}
        </button>

        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm text-red-600">
            Failed to load this ticket.
          </p>
        </div>
      </div>
    );
  }

  /*
   * =========================================================
   * PAGE
   * =========================================================
   */

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[600px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="flex items-center gap-4 border-b border-gray-200 px-5 py-4">
        <button
          type="button"
          onClick={() => navigate(isStaff ? "/app/tickets" : "/app/my-tickets")}
          className="rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
          title="Back to tickets"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-600">
          {ticket.category?.slice(0, 2).toUpperCase() || "HR"}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold text-gray-900">
              {ticket.ticketId}
            </h1>

            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
              {formatStatus(ticket.status)}
            </span>

            {isStaff && ticket.status === "OPEN" && (ticket.slaRiskLevel === "CRITICAL" || (ticket as any).attentionBadge === "HIGH_ATTENTION") ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800 border border-red-300 animate-pulse shadow-2xs"
                title={(ticket as any).attentionReason || ticket.factors?.join(" • ") || "Critical attention required"}
              >
                🔴 High Attention Required: {(ticket as any).attentionReason || `${ticket.slaRiskScore}% Risk`}
              </span>
            ) : isStaff && ticket.status === "OPEN" && (ticket.slaRiskLevel === "ELEVATED" || (ticket as any).attentionBadge === "ATTENTION_REQUIRED") ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-300 shadow-2xs"
                title={(ticket as any).attentionReason || ticket.factors?.join(" • ") || "Attention required"}
              >
                🟡 Needs Attention: {(ticket as any).attentionReason || `${ticket.slaRiskScore}% Risk`}
              </span>
            ) : null}
          </div>

          <p className="mt-0.5 truncate text-xs font-medium text-gray-800" title={ticket.subject}>
            {ticket.subject}
          </p>

          <p className="text-[11px] text-gray-500">
            {ticket.category} · {ticket.priority} Priority
            {ticket.assignedTo ? ` · Assigned to ${ticket.assignedTo}` : ""}
          </p>
        </div>

        {/* Staff AI Header Quick Actions — Always visible without scrolling */}
        {isStaff && (
          <div className="flex items-center gap-2 shrink-0">
            {ticket.aiCategory && (
              <button
                type="button"
                onClick={() => setClassificationOpen(!classificationOpen)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition shadow-2xs ${
                  classificationOpen
                    ? "border-indigo-300 bg-indigo-100 text-indigo-900"
                    : "border-indigo-200 bg-indigo-50/80 text-indigo-800 hover:bg-indigo-100"
                }`}
                title="Toggle AI Classification Insights"
              >
                <span>🤖</span>
                <span className="hidden sm:inline">AI Insights:</span>
                <span className="font-bold">{ticket.aiCategory}</span>
                {classificationOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-indigo-600" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-indigo-600" />
                )}
              </button>
            )}

            <button
              type="button"
              disabled={summaryLoading}
              onClick={async () => {
                if (summary) {
                  setSummaryOpen(!summaryOpen);
                  return;
                }
                setSummaryLoading(true);
                try {
                  const res = await api.post(`/tickets/${id}/summarize`);
                  if (res.data?.summary) {
                    setSummary(res.data.summary);
                    setSummaryOpen(true);
                  }
                } catch {
                  showToast("Failed to generate summary", "error");
                } finally {
                  setSummaryLoading(false);
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition shadow-2xs ${
                summary && summaryOpen
                  ? "border-violet-300 bg-violet-100 text-violet-900 shadow-xs"
                  : "border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 text-violet-700 hover:from-violet-100 hover:to-purple-100"
              } disabled:opacity-50`}
              title="Generate or view AI executive thread summary"
            >
              {summaryLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-violet-600" />
              )}
              <span>
                {summaryLoading
                  ? "Summarizing..."
                  : summary
                  ? summaryOpen
                    ? "Hide Summary ▴"
                    : "View Summary ▾"
                  : "✨ AI Summary"}
              </span>
            </button>

            {similarTickets.length > 0 && (
              <button
                type="button"
                onClick={() => setSimilarOpen(!similarOpen)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition shadow-2xs ${
                  similarOpen
                    ? "border-amber-400 bg-amber-100 text-amber-950 shadow-xs"
                    : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                }`}
                title="View other tickets reporting this exact problem"
              >
                <span>🔗</span>
                <span className="hidden sm:inline">Recurring:</span>
                <span className="font-bold">{similarTickets.length} Similar</span>
                {similarOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-amber-600" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-amber-600" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* =====================================================
          STICKY TOP AI PANELS (Pinned above chat - no scrolling needed)
          ===================================================== */}

      {/* AI Classification Insights Panel */}
      {isStaff && ticket.aiCategory && classificationOpen && (
        <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-purple-50/80 px-5 py-3 text-xs shadow-2xs">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-indigo-100/70">
            <div className="flex items-center gap-2 font-semibold text-indigo-900">
              <span>🤖 AI Classification & Triage Insights</span>
              {ticket.aiConfidence !== null && ticket.aiConfidence !== undefined && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                  {Math.round(ticket.aiConfidence * 100)}% Match
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setClassificationOpen(false)}
              className="text-gray-400 hover:text-gray-600 text-xs"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1.5 text-gray-700">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <strong className="text-gray-500">Predicted Category:</strong> {ticket.aiCategory}
              </span>
              {ticket.aiIntent && (
                <span>
                  <strong className="text-gray-500">Detected Intent:</strong> {ticket.aiIntent}
                </span>
              )}
              {ticket.aiSentiment && ticket.aiSentiment !== "NEUTRAL" && (
                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                  Sentiment: {ticket.aiSentiment}
                </span>
              )}
            </div>
            {ticket.aiReason && (
              <p className="text-[11px] text-gray-600 leading-snug">
                {ticket.aiReason}
              </p>
            )}
            {ticket.aiPriorityReason && (
              <p className="text-[11px] text-indigo-700 font-medium">
                ⚡ {ticket.aiPriorityReason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* AI Executive Summary Panel */}
      {isStaff && summary && summaryOpen && (
        <div className="border-b border-violet-200 bg-gradient-to-r from-violet-50/95 via-purple-50/90 to-indigo-50/90 px-5 py-3 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-violet-200/70">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-900">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" />
              <span>AI Executive Thread Summary</span>
              <span className="rounded-full bg-violet-200/80 px-2 py-0.5 text-[10px] font-medium text-violet-800">
                {sortedMessages.length} message(s) analyzed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={summaryLoading}
                onClick={async () => {
                  setSummaryLoading(true);
                  try {
                    const res = await api.post(`/tickets/${id}/summarize`);
                    if (res.data?.summary) {
                      setSummary(res.data.summary);
                    }
                  } catch {
                    showToast("Failed to regenerate summary", "error");
                  } finally {
                    setSummaryLoading(false);
                  }
                }}
                className="text-[11px] font-medium text-violet-600 hover:text-violet-800 hover:underline disabled:opacity-50"
              >
                {summaryLoading ? "Regenerating..." : "Regenerate"}
              </button>
              <button
                type="button"
                onClick={() => setSummaryOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
                title="Collapse summary"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-800">
            <div className="rounded-lg bg-white/80 p-2.5 border border-violet-100 shadow-2xs">
              <div className="flex items-center gap-1.5 font-semibold text-red-700 mb-1">
                <span>🔴</span> Issue Reported
              </div>
              <p className="text-gray-700 leading-snug">{summary.issue}</p>
            </div>

            <div className="rounded-lg bg-white/80 p-2.5 border border-violet-100 shadow-2xs">
              <div className="flex items-center gap-1.5 font-semibold text-amber-700 mb-1">
                <span>🟡</span> Thread Progression
              </div>
              <p className="text-gray-700 leading-snug">{summary.currentStatus}</p>
            </div>

            <div className="rounded-lg bg-white/80 p-2.5 border border-violet-100 shadow-2xs">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-700 mb-1">
                <span>🟢</span> Pending Action
              </div>
              <p className="text-gray-700 leading-snug">{summary.pendingAction}</p>
            </div>
          </div>
        </div>
      )}

      {/* Similar Tickets & Recurring Issue Panel (Phase 5) */}
      {isStaff && similarOpen && similarTickets.length > 0 && (
        <div className="border-b border-amber-200 bg-gradient-to-r from-amber-50/95 via-yellow-50/90 to-amber-50/95 px-5 py-3.5 shadow-xs animate-fadeIn">
          <div className="flex items-center justify-between pb-2 border-b border-amber-200/70">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
              <span className="text-sm">🚨</span>
              <span>Recurring Issue Detected</span>
              <span className="rounded-full bg-amber-200/90 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                {similarTickets.length} other ticket(s) reporting identical problem
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsBroadcastClusterOpen(true)}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-xs hover:shadow-sm transition cursor-pointer"
              >
                <Megaphone className="h-3 w-3" />
                <span>Broadcast to All ({similarTickets.length + 1} Tickets)</span>
              </button>
              <button
                type="button"
                onClick={() => setSimilarOpen(false)}
                className="text-amber-700 hover:text-amber-950 p-1 rounded-lg hover:bg-amber-100 text-xs transition cursor-pointer"
                title="Close similar tickets view"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <p className="mt-1.5 text-[11px] text-amber-800 leading-snug">
            Multiple employees have reported matching symptoms in <strong>{ticket.category}</strong>. This indicates a common operational incident rather than an isolated request.
          </p>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {similarTickets.map((sim) => (
              <div
                key={sim._id}
                onClick={() => navigate(`/app/tickets/${sim._id}`)}
                className="cursor-pointer rounded-xl border border-amber-200 bg-white/95 p-3 hover:border-amber-400 hover:shadow-xs transition"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-brand-700">{sim.ticketId}</span>
                  <span className="font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[10px]">
                    {sim.similarityScore}% Match
                  </span>
                </div>
                <p className="text-xs font-medium text-gray-900 truncate mt-1" title={sim.subject}>
                  {sim.subject}
                </p>
                <div className="flex items-center justify-between text-[10px] text-gray-500 mt-2 pt-1.5 border-t border-gray-100">
                  <span className="truncate max-w-[130px] font-medium">{sim.employeeName || "Employee"}</span>
                  <span className="font-semibold uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                    {sim.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================
          CHAT AREA
          ===================================================== */}

      <div ref={containerRef} className="relative flex-1 overflow-y-auto bg-[#f7f3ea] px-5 py-6">
        {ticket.description && (
          <div className="mb-6 flex justify-center">
            <div className="max-w-xl w-full rounded-lg bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
              <p className="mb-1 text-xs font-semibold text-gray-500">
                Ticket Description
              </p>

              <p>{ticket.description}</p>
            </div>
          </div>
        )}

        {messagesLoading && (
          <div className="flex justify-center py-6">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading messages...
            </div>
          </div>
        )}

        {messagesError && (
          <div className="flex justify-center py-6">
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              Failed to load messages.
            </div>
          </div>
        )}

        {!messagesLoading &&
          !messagesError &&
          messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <div className="rounded-xl bg-white px-6 py-5 text-center shadow-sm">
                <p className="text-sm font-medium text-gray-700">
                  No messages yet
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Start the conversation below.
                </p>
              </div>
            </div>
          )}

        <div className="space-y-3">
          {sortedMessages.map((item) => {
            const senderIsMe = Boolean(
              (currentEmployeeId && item.employeeId === currentEmployeeId) ||
              (user?.id && item.employeeId === user.id)
            );

            return (
              <div key={item.id} className={`flex ${senderIsMe ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                    senderIsMe ? "rounded-br-md bg-green-100 text-gray-800" : "rounded-bl-md bg-white text-gray-800"
                  }`}
                >
                  <p className="mb-1 text-xs font-medium text-gray-500">
                    {senderIsMe ? "You" : item.senderName || "Support"}
                  </p>

                  <p className="whitespace-pre-wrap break-words text-sm">
                    {item.message}
                    {item.attachment && (
                      <div className="mt-2">
                        <a
                          href={resolveAssetUrl(item.attachment) ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700"
                        >
                          <Paperclip className="h-3 w-3" />
                          {item.attachment.split("/").pop()}
                        </a>
                      </div>
                    )}
                  </p>

                  <div className={`mt-1 text-[10px] ${senderIsMe ? "text-gray-500" : "text-gray-400"}`}>
                    {formatTime(item.createdAt)}
                    {senderIsMe && " ✓✓"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* =====================================================
          ATTACHMENT PREVIEW
          ===================================================== */}

      {selectedFile && (
        <div className="border-t border-gray-200 bg-white px-4 py-2">
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Paperclip className="h-4 w-4 shrink-0 text-gray-500" />

              <span className="truncate text-sm text-gray-700">
                {selectedFile.name}
              </span>
            </div>

            <button
              type="button"
              onClick={removeAttachment}
              className="ml-3 text-xs font-medium text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          MESSAGE INPUT
          ===================================================== */}

      {/* Phase 3: AI Draft Reply Toolbar — Staff Only */}
      {isStaff && (
        <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-2">
          {!showDraftToolbar ? (
            <button
              type="button"
              onClick={() => setShowDraftToolbar(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:from-emerald-600 hover:to-teal-600"
            >
              <Zap className="h-3.5 w-3.5" />
              AI Draft Reply
            </button>
          ) : (
            <div className="space-y-2 py-0.5">
              {/* Row 1: Tone selection & cancel */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-600">Tone:</span>
                  {(["empathetic", "formal", "concise"] as ReplyTone[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDraftTone(t)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                        draftTone === t
                          ? "bg-emerald-600 text-white shadow-2xs"
                          : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowDraftToolbar(false);
                    setDraftPrompt("");
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  Cancel
                </button>
              </div>

              {/* Row 2: Gmail-style 'Describe your message' input */}
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center text-emerald-600">
                  <PenLine className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={draftPrompt}
                  onChange={(e) => setDraftPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleGenerateReply();
                    }
                  }}
                  placeholder="Describe your message (e.g. approve leave after handover, or salary credited by 4 PM)..."
                  className="w-full rounded-full border border-gray-300 bg-white py-2 pl-10 pr-32 text-xs text-gray-800 placeholder-gray-400 shadow-xs focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
                />
                <button
                  type="button"
                  disabled={draftLoading}
                  onClick={handleGenerateReply}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1 text-xs font-medium text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {draftLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span>{draftLoading ? "Generating..." : "Generate"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-gray-200 bg-white p-3">
        <div className="flex items-center gap-3">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
            className="hidden"
            onChange={handleAttachmentChange}
          />

          {/* Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            title="Attach file"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          {/* Message input */}
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type a message..."
            disabled={sendMessage.isPending}
            rows={message.length > 120 ? 3 : 1}
            className="flex-1 resize-none rounded-2xl border border-violet-300 bg-white px-5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50"
          />

          {/* Send button */}
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={
              sendMessage.isPending ||
              (!message.trim() && !selectedFile)
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
            title="Send message"
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>

        {sendMessage.isError && (
          <p className="mt-2 px-12 text-xs text-red-500">
            Failed to send message. Please try again.
          </p>
        )}

        {selectedFile && (
          <div className="mt-2 flex items-center gap-2 px-12 text-xs text-violet-700">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 px-2.5 py-1 font-medium border border-violet-200">
              <Paperclip className="h-3.5 w-3.5" />
              <span className="truncate max-w-[200px]">{selectedFile.name}</span>
              <span className="text-[10px] text-violet-500">
                ({(selectedFile.size / 1024).toFixed(0)} KB)
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="ml-1 text-violet-400 hover:text-violet-800 font-bold"
                title="Remove attachment"
              >
                ✕
              </button>
            </span>
          </div>
        )}
      </div>

      {ticket && (
        <BroadcastClusterModal
          open={isBroadcastClusterOpen}
          onClose={() => setIsBroadcastClusterOpen(false)}
          clusterTitle={`${ticket.category} — ${ticket.aiIntent || ticket.subject}`}
          category={ticket.category}
          tickets={[
            {
              _id: String(ticket._id),
              ticketId: ticket.ticketId,
              subject: ticket.subject,
              employeeName: (ticket as any).employeeName || "Current Ticket",
            },
            ...similarTickets.map((s) => ({
              _id: s._id,
              ticketId: s.ticketId,
              subject: s.subject,
              employeeName: s.employeeName,
            })),
          ]}
          ticketIds={[String(ticket._id), ...similarTickets.map((s) => s._id)]}
          suggestedAction="Broadcast unified investigation update to this ticket and all similar matching tickets."
        />
      )}
    </div>
  );
}