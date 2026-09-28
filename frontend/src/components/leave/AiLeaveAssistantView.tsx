import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Wallet,
  Palmtree,
  FileText,
  Users,
  Copy,
  Check,
  RefreshCw,
  ArrowRight,
  ChevronRight,
  Flame,
  Plane,
} from "lucide-react";
import {
  LeaveApi,
  type AskLeaveAIResult,
  type HolidayBridge,
  type LeaveBalanceSummary,
} from "@/lib/endpoints";
import { FormattedMarkdown } from "@/components/common/FormattedMarkdown";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { cx, formatDate } from "@/lib/format";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  suggestedLeave?: AskLeaveAIResult["suggestedLeave"];
  holidayBridges?: HolidayBridge[];
  balances?: LeaveBalanceSummary[];
  quickActions?: string[];
  isLoading?: boolean;
}

export interface AiLeaveAssistantViewProps {
  onApplyWithDates?: (payload: {
    startDate?: string;
    endDate?: string;
    reason?: string;
    leaveTypeId?: string;
  }) => void;
}

const PRESET_CAPABILITIES = [
  {
    icon: Palmtree,
    title: "Holiday Bridge Vacations",
    desc: "Maximize long weekends with upcoming public holidays",
    prompt: "Find upcoming holiday bridge opportunities to maximize my vacation time.",
    color: "from-amber-500/10 to-orange-500/10 text-amber-700 border-amber-200/80 hover:border-amber-300",
    iconBg: "bg-amber-100 text-amber-700",
  },
  {
    icon: Wallet,
    title: "Balance & Entitlements",
    desc: "Detailed breakdown of casual, sick, earned & comp-off leaves",
    prompt: "What are my current available leave balances and pending requests?",
    color: "from-emerald-500/10 to-teal-500/10 text-emerald-700 border-emerald-200/80 hover:border-emerald-300",
    iconBg: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: FileText,
    title: "Draft Leave Request",
    desc: "Generate a polished, professional reason for your application",
    prompt: "Help me draft a formal 3-day leave request for a personal family event.",
    color: "from-indigo-500/10 to-brand-500/10 text-indigo-700 border-indigo-200/80 hover:border-indigo-300",
    iconBg: "bg-indigo-100 text-indigo-700",
  },
  {
    icon: Users,
    title: "Team Absence Check",
    desc: "Check overlapping team leaves and coverage next week",
    prompt: "Who in my team is scheduled to be on leave during the next 14 days?",
    color: "from-violet-500/10 to-purple-500/10 text-violet-700 border-violet-200/80 hover:border-violet-300",
    iconBg: "bg-violet-100 text-violet-700",
  },
];

export function AiLeaveAssistantView({ onApplyWithDates }: AiLeaveAssistantViewProps) {
  const { user } = useAuth();
  const [inputQuery, setInputQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0) {
      const displayName = user?.employee?.firstName || user?.email.split("@")[0] || "there";
      setMessages([
        {
          id: "welcome_1",
          sender: "assistant",
          text: `Hello **${displayName}**! I am your **AI Leave Assistant**.\n\nI can help you review your leave balances, discover holiday bridge opportunities for long weekends, check team availability, and draft formal leave requests. Ask me anything or select a prompt below!`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          quickActions: [
            "Find upcoming holiday bridge opportunities",
            "What is my remaining leave balance?",
            "Who is on leave in my team next week?",
            "Draft a 2-day medical leave application",
          ],
        },
      ]);
    }
  }, [user]);

  const handleSend = async (queryToSend?: string) => {
    const text = (queryToSend ?? inputQuery).trim();
    if (!text || isTyping) return;

    const userMessageId = `user_${Date.now()}`;
    const assistantMessageId = `assistant_${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const userMsg: ChatMessage = {
      id: userMessageId,
      sender: "user",
      text,
      timestamp,
    };

    const loadingMsg: ChatMessage = {
      id: assistantMessageId,
      sender: "assistant",
      text: "Analyzing your leave balances and holiday calendar...",
      timestamp,
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInputQuery("");
    setIsTyping(true);

    try {
      const response = await LeaveApi.aiAssistant({ question: text });

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                text: response.answer,
                suggestedLeave: response.suggestedLeave,
                holidayBridges: response.holidayBridges,
                balances: response.balances,
                quickActions: response.quickActions,
                isLoading: false,
              }
            : msg,
        ),
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                text:
                  "I encountered a temporary issue connecting to the leave engine. Please check your connection or try asking again.",
                isLoading: false,
              }
            : msg,
        ),
      );
    } finally {
      setIsTyping(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-200/70 bg-gradient-to-br from-brand-500/10 via-purple-500/5 to-indigo-500/10 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-md shadow-brand-500/25">
              <Sparkles size={22} className="text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-ink">
                  AI Leave Assistant
                </h2>
                <span className="rounded-full bg-gradient-to-r from-amber-500/20 to-brand-500/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-brand-700 border border-brand-300/60">
                  ✦ Intelligent Copilot
                </span>
              </div>
              <p className="text-xs text-ink-soft mt-0.5">
                Plan long weekends, optimize your balance, prevent team conflicts, and draft requests effortlessly.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setMessages([
                  {
                    id: `welcome_${Date.now()}`,
                    sender: "assistant",
                    text: `Chat reset. How can I help you plan your time off today?`,
                    timestamp: new Date().toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                    quickActions: [
                      "Find upcoming holiday bridge opportunities",
                      "What is my remaining leave balance?",
                      "Who is on leave in my team next week?",
                    ],
                  },
                ])
              }
              leftIcon={<RefreshCw size={13} />}
            >
              Reset Chat
            </Button>
          </div>
        </div>

        {/* 4 Capability Cards */}
        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {PRESET_CAPABILITIES.map((cap, i) => {
            const Icon = cap.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleSend(cap.prompt)}
                className={cx(
                  "flex flex-col items-start rounded-xl border p-3.5 text-left transition-all duration-200 shadow-sm hover:shadow",
                  cap.color,
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div className={cx("rounded-lg p-1.5", cap.iconBg)}>
                    <Icon size={16} />
                  </div>
                  <ChevronRight size={14} className="opacity-40" />
                </div>
                <h4 className="mt-2 text-xs font-bold text-ink">{cap.title}</h4>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
                  {cap.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat Messages Container */}
      <Card className="flex flex-col overflow-hidden border-line/70 shadow-sm">
        <div className="h-[480px] overflow-y-auto p-4 sm:p-5 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.sender === "user";
            return (
              <div
                key={msg.id}
                className={cx(
                  "flex w-full gap-3",
                  isUser ? "justify-end" : "justify-start",
                )}
              >
                {!isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-sm mt-0.5">
                    <Sparkles size={14} className="text-amber-300" />
                  </div>
                )}

                <div
                  className={cx(
                    "max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs leading-relaxed space-y-3",
                    isUser
                      ? "bg-brand-600 text-white rounded-br-none shadow-sm"
                      : "bg-surface-ground/70 border border-line/70 text-ink rounded-bl-none shadow-sm",
                  )}
                >
                  {/* Message Header */}
                  <div className="flex items-center justify-between gap-3 text-[10px] opacity-70">
                    <span className="font-semibold">
                      {isUser ? "You" : "Leave Assistant AI"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span>{msg.timestamp}</span>
                      {!isUser && !msg.isLoading && (
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.text, msg.id)}
                          className="hover:text-ink transition-colors"
                          title="Copy message"
                        >
                          {copiedId === msg.id ? (
                            <Check size={11} className="text-emerald-500" />
                          ) : (
                            <Copy size={11} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Body Text */}
                  {msg.isLoading ? (
                    <div className="flex items-center gap-2 text-ink-soft py-1">
                      <div className="h-2 w-2 rounded-full bg-brand-500 animate-bounce" />
                      <div
                        className="h-2 w-2 rounded-full bg-brand-500 animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      />
                      <div
                        className="h-2 w-2 rounded-full bg-brand-500 animate-bounce"
                        style={{ animationDelay: "0.4s" }}
                      />
                      <span className="ml-1 text-[11px] italic">
                        {msg.text}
                      </span>
                    </div>
                  ) : (
                    <FormattedMarkdown content={msg.text} />
                  )}

                  {/* Embedded Suggested Leave Box */}
                  {msg.suggestedLeave && onApplyWithDates && (
                    <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 text-ink space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-brand-800">
                          <Plane size={13} className="text-brand-600" />
                          Suggested Leave Application
                        </span>
                        <span className="text-[10px] text-ink-faint">
                          {formatDate(msg.suggestedLeave.startDate || "")} →{" "}
                          {formatDate(msg.suggestedLeave.endDate || "")}
                        </span>
                      </div>
                      {msg.suggestedLeave.reason && (
                        <p className="text-[11px] italic text-ink-soft bg-surface/80 p-2 rounded-lg border border-line/40">
                          "{msg.suggestedLeave.reason}"
                        </p>
                      )}
                      <Button
                        size="sm"
                        className="w-full bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
                        rightIcon={<ArrowRight size={13} />}
                        onClick={() =>
                          onApplyWithDates({
                            startDate: msg.suggestedLeave?.startDate,
                            endDate: msg.suggestedLeave?.endDate,
                            reason: msg.suggestedLeave?.reason,
                            leaveTypeId: msg.suggestedLeave?.leaveTypeId,
                          })
                        }
                      >
                        Apply for this Leave
                      </Button>
                    </div>
                  )}

                  {/* Discovered Holiday Bridges Carousel / Cards */}
                  {msg.holidayBridges && msg.holidayBridges.length > 0 && (
                    <div className="pt-2 border-t border-line/40 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1">
                        <Flame size={12} className="text-amber-500" />
                        Discovered Long-Weekend Opportunities:
                      </span>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {msg.holidayBridges.slice(0, 2).map((hb, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl border border-amber-200/90 bg-amber-50/50 p-3 text-ink space-y-2 shadow-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-xs text-amber-950 truncate">
                                🎉 {hb.holidayName}
                              </span>
                              <span className="rounded-full bg-amber-200/90 px-2 py-0.5 text-[9px] font-bold text-amber-900">
                                {hb.totalConsecutiveDaysOff} Days Off
                              </span>
                            </div>

                            <div className="space-y-1 text-[11px] text-slate-700 bg-white/70 rounded-lg p-2 border border-amber-200/60">
                              <p className="flex items-center justify-between">
                                <span className="text-slate-500 font-medium">Holiday:</span>
                                <span className="font-semibold text-slate-800">
                                  {formatDate(hb.holidayDate)} ({hb.dayOfWeek})
                                </span>
                              </p>
                              <p className="flex items-center justify-between">
                                <span className="text-slate-500 font-medium">Apply leave on:</span>
                                <span className="font-semibold text-brand-700">
                                  {hb.suggestedLeaveDates.map((d) => formatDate(d)).join(", ")}
                                </span>
                              </p>
                            </div>

                            {onApplyWithDates && (
                              <button
                                type="button"
                                onClick={() =>
                                  onApplyWithDates({
                                    startDate: hb.suggestedLeaveDates[0],
                                    endDate:
                                      hb.suggestedLeaveDates[
                                        hb.suggestedLeaveDates.length - 1
                                      ],
                                    reason: `Vacation bridge planned around ${hb.holidayName} (${formatDate(hb.holidayDate)})`,
                                  })
                                }
                                className="w-full text-center text-[11px] font-bold text-brand-700 hover:text-brand-800 hover:underline pt-0.5 block"
                              >
                                Plan This Vacation →
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-up Quick Action Chips */}
                  {msg.quickActions && msg.quickActions.length > 0 && (
                    <div className="pt-2 border-t border-line/40 flex flex-wrap gap-1.5">
                      {msg.quickActions.map((action, actionIdx) => (
                        <button
                          key={actionIdx}
                          type="button"
                          onClick={() => handleSend(action)}
                          className="rounded-full border border-line/80 bg-surface px-2.5 py-1 text-[10px] font-medium text-ink-soft hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700 transition-colors"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 font-bold text-xs shadow-sm mt-0.5">
                    {user?.employee?.firstName?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="border-t border-line/60 bg-surface-ground/30 p-3.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Ask anything about leave rules, holiday bridges, balances, or application drafting..."
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none shadow-sm pr-10"
                disabled={isTyping}
              />
              <Sparkles
                size={14}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-400 pointer-events-none"
              />
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={!inputQuery.trim() || isTyping}
              className="bg-brand-600 hover:bg-brand-700 text-white shadow-sm shrink-0 px-4 h-9"
              rightIcon={<Send size={13} />}
            >
              Ask
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
