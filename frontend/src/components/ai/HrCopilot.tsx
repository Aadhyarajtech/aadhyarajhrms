import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Clock3,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import { HrCopilotApi, type HrCopilotSource } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: HrCopilotSource[];
}

function getPageContext(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const route = parts[1] ?? "dashboard";

  const titles: Record<string, string> = {
    dashboard: "Dashboard",
    tickets: "Tickets",
    attendance: "Attendance",
    leave: "Leave",
    calendar: "Calendar",
    performance: "Performance",
    payroll: "Payroll",
    documents: "Documents",
    employees: "Employees",
    "my-profile": "My Profile",
    "my-team": "My Team",
    "org-chart": "Organization Chart",
    recruitment: "Recruitment",
    reports: "Reports & Analytics",
    announcements: "Announcements",
    settings: "Settings",
  };

  let entityId: string | undefined;
  const employeeMatch = pathname.match(/\/app\/(?:employees|employee)\/([^/?#]+)/i);
  if (employeeMatch?.[1]) {
    entityId = employeeMatch[1];
  }

  return {
    pathname,
    pageTitle: titles[route] ?? "HRMS",
    module: route,
    entityId,
  };
}

const QUICK_PROMPTS = [
  "Give me an overall summary of my work status",
  "How is my attendance this month?",
  "Show my current leave balance",
  "Summarize my performance and goals",
];

export function HrCopilot() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pageContext = useMemo(
    () => getPageContext(location.pathname),
    [location.pathname],
  );

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  if (isLoading || !user) return null;

  const sendMessage = async (value?: string) => {
    const message = (value ?? input).trim();
    if (!message || sending) return;

    setError(null);
    setInput("");

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };

    const previousConversation = messages.slice(-10).map((item) => ({
      role: item.role,
      content: item.content,
    }));

    setMessages((current) => [...current, userMessage]);
    setSending(true);

    try {
      const response = await HrCopilotApi.chat({
        message,
        conversation: previousConversation,
        pageContext,
      });

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: response.answer,
          sources: response.sources,
        },
      ]);
    } catch (err) {
      const messageText = getErrorMessage(
        err,
        "I couldn't reach the HR Copilot right now. Please try again.",
      );
      setError(messageText);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    setExpandedSources(null);
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[55] bg-ink/10 lg:bg-transparent"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {open ? (
        <section
          className="fixed bottom-4 right-4 z-[60] flex h-[min(720px,calc(100vh-32px))] w-[min(440px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
          aria-label="AI HR Copilot"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-white to-slate-50 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-white shadow-sm">
                <Sparkles size={19} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-ink">
                    AI HR Copilot
                  </h2>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    READ-ONLY
                  </span>
                </div>
                <p className="truncate text-[11px] text-ink-faint">
                  Ask about any HRMS module
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearChat}
                className="rounded-lg px-2 py-1.5 text-[11px] font-medium text-ink-faint transition hover:bg-slate-100 hover:text-ink"
              >
                Clear
              </button>
              <button
                type="button"
                aria-label="Close AI HR Copilot"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-ink-faint transition hover:bg-slate-100 hover:text-ink"
              >
                <X size={17} />
              </button>
            </div>
          </header>

          <div className="border-b border-line/70 bg-slate-50/70 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-ink-faint">
              <Clock3 size={13} />
              <span className="truncate">
                Current context: {pageContext.pageTitle}
              </span>
              <span className="ml-auto shrink-0">Global access</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
            {messages.length === 0 ? (
              <div className="flex min-h-full flex-col justify-center">
                <div className="mx-auto w-full max-w-sm text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-ink">
                    <Bot size={26} />
                  </div>
                  <h3 className="text-base font-semibold text-ink">
                    How can I help?
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-ink-faint">
                    I can answer questions using the HRMS information you are
                    authorized to access.
                  </p>

                  <div className="mt-5 grid gap-2 text-left">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="rounded-xl border border-line bg-white px-3 py-2.5 text-left text-xs text-ink-soft transition hover:border-ink/20 hover:bg-slate-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => {
                  const sourceKey = message.id;
                  const showSources = expandedSources === sourceKey;

                  return (
                    <div
                      key={message.id}
                      className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                    >
                      <div
                        className={
                          message.role === "user"
                            ? "max-w-[88%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-sm leading-6 text-white"
                            : "max-w-[94%] rounded-2xl rounded-bl-md border border-line bg-slate-50 px-3.5 py-3 text-sm leading-6 text-ink"
                        }
                      >
                        <div className="whitespace-pre-wrap break-words">
                          {message.content}
                        </div>

                        {message.role === "assistant" &&
                          message.sources?.length ? (
                            <div className="mt-2 border-t border-line/70 pt-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSources(
                                    showSources ? null : sourceKey,
                                  )
                                }
                                className="flex items-center gap-1 text-[10px] font-medium text-ink-faint hover:text-ink"
                              >
                                {showSources ? (
                                  <ChevronUp size={12} />
                                ) : (
                                  <ChevronDown size={12} />
                                )}
                                {message.sources.length} data source
                                {message.sources.length === 1 ? "" : "s"}
                              </button>

                              {showSources && (
                                <div className="mt-2 space-y-1.5">
                                  {message.sources.map((item) => (
                                    <div
                                      key={`${item.module}-${item.description}`}
                                      className="rounded-lg bg-white px-2.5 py-2 text-[10px] text-ink-faint"
                                    >
                                      <span className="font-semibold text-ink-soft">
                                        {item.module}
                                      </span>{" "}
                                      — {item.description}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}
                      </div>
                    </div>
                  );
                })}

                {sending && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-md border border-line bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-ink-faint">
                        <span className="flex gap-1">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" />
                        </span>
                        Checking your authorized HRMS data…
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">
                    {error}
                  </div>
                )}

                <div ref={endRef} />
              </div>
            )}
          </div>

          <div className="border-t border-line bg-white p-3">
            <div className="rounded-2xl border border-line bg-slate-50 p-2 focus-within:border-ink/30 focus-within:bg-white">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value.slice(0, 4000))}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your HRMS…"
                rows={2}
                disabled={sending}
                className="max-h-32 min-h-[48px] w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
              />
              <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-[10px] text-ink-faint">
                  Enter to send · Shift+Enter for a new line
                </span>
                <button
                  type="button"
                  disabled={!input.trim() || sending}
                  onClick={() => void sendMessage()}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send message"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl"
          aria-label="Open AI HR Copilot"
        >
          <MessageCircle size={18} />
          <span className="hidden sm:inline">AI HR Copilot</span>
          <Sparkles size={14} className="text-white/70" />
        </button>
      )}
    </>
  );
}
