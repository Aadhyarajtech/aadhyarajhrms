import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  Send,
  Loader2,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { PayrollApi } from "@/lib/endpoints";
import { formatCurrencyINR } from "@/lib/format";

interface Props {
  payslipId: string;
}

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: Date;
  source?: string;
}

export function PayslipAiExplainer({ payslipId }: Props) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const {
    data: explanation,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["payslip-explanation", payslipId],
    queryFn: () => PayrollApi.explainPayslip(payslipId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const askMutation = useMutation({
    mutationFn: (q: string) => PayrollApi.askPayslipQuestion(payslipId, q),
    onSuccess: (data, variables) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-user`,
          sender: "user",
          text: variables,
          timestamp: new Date(),
        },
        {
          id: `${Date.now()}-ai`,
          sender: "ai",
          text: data.answer,
          timestamp: new Date(),
          source: data.source,
        },
      ]);
      setQuestion("");
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-user`,
          sender: "user",
          text: question,
          timestamp: new Date(),
        },
        {
          id: `${Date.now()}-ai`,
          sender: "ai",
          text: "I'm having trouble analyzing this payslip question right now. Please verify your internet connection or check the breakdown below.",
          timestamp: new Date(),
        },
      ]);
      setQuestion("");
    },
  });

  const handleAsk = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || askMutation.isPending) return;
    askMutation.mutate(trimmed);
  };

  const handleQuickAsk = (qText: string) => {
    if (askMutation.isPending) return;

    // If pre-computed answer exists, return immediately without network roundtrip
    if (explanation?.faqAnswers?.[qText]) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-user`,
          sender: "user",
          text: qText,
          timestamp: new Date(),
        },
        {
          id: `${Date.now()}-ai`,
          sender: "ai",
          text: explanation.faqAnswers[qText],
          timestamp: new Date(),
          source: "cached_faq",
        },
      ]);
      return;
    }

    askMutation.mutate(qText);
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white p-5 text-center print:hidden">
        <div className="inline-flex items-center gap-2 text-indigo-700 text-sm font-semibold">
          <Loader2 className="animate-spin" size={16} />
          Analyzing payslip variances & statutory drivers...
        </div>
        <p className="text-xs text-ink-muted mt-1">
          Comparing against previous pay cycles and calculating deltas
        </p>
      </div>
    );
  }

  if (isError || !explanation) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 text-xs text-rose-800 flex items-center justify-between print:hidden">
        <span>Could not generate AI explanation for this payslip.</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-lg bg-rose-600 px-2.5 py-1 text-white font-medium hover:bg-rose-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  const { deltas } = explanation;

  return (
    <div className="space-y-4 rounded-3xl border border-indigo-100/90 bg-gradient-to-b from-indigo-50/30 via-white to-indigo-50/20 p-4.5 shadow-sm print:hidden">
      {/* Header Banner */}
      <div className="flex items-start justify-between gap-3 border-b border-indigo-100/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
            <Sparkles size={14} />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-950">
              AI Salary Breakdown & Insights
            </h4>
            <p className="text-[11px] text-indigo-900/80 mt-0.5">
              Natural language explanation of your compensation drivers
            </p>
          </div>
        </div>
      </div>

      {/* Summary Box */}
      <div className="rounded-2xl border border-indigo-100/80 bg-white/90 p-3.5 shadow-xs">
        <p className="text-xs leading-relaxed text-ink font-normal">
          {explanation.summary}
        </p>
      </div>

      {/* MoM Delta Highlights Chips */}
      {deltas.hasPriorMonth ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {/* Net Pay Delta */}
          <div className="rounded-xl border border-gray-100 bg-white p-2.5 shadow-2xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted block">
              Take-Home Net
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              {deltas.netDelta > 0 ? (
                <TrendingUp size={14} className="text-emerald-600" />
              ) : deltas.netDelta < 0 ? (
                <TrendingDown size={14} className="text-rose-600" />
              ) : (
                <Minus size={14} className="text-gray-400" />
              )}
              <span
                className={`text-xs font-bold ${
                  deltas.netDelta > 0
                    ? "text-emerald-600"
                    : deltas.netDelta < 0
                      ? "text-rose-600"
                      : "text-ink"
                }`}
              >
                {deltas.netDelta > 0 ? "+" : ""}
                {formatCurrencyINR(deltas.netDelta)}
              </span>
            </div>
          </div>

          {/* Gross Delta */}
          <div className="rounded-xl border border-gray-100 bg-white p-2.5 shadow-2xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted block">
              Gross Earnings
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              {deltas.grossDelta > 0 ? (
                <TrendingUp size={14} className="text-emerald-600" />
              ) : deltas.grossDelta < 0 ? (
                <TrendingDown size={14} className="text-rose-600" />
              ) : (
                <Minus size={14} className="text-gray-400" />
              )}
              <span
                className={`text-xs font-bold ${
                  deltas.grossDelta > 0
                    ? "text-emerald-600"
                    : deltas.grossDelta < 0
                      ? "text-rose-600"
                      : "text-ink"
                }`}
              >
                {deltas.grossDelta > 0 ? "+" : ""}
                {formatCurrencyINR(deltas.grossDelta)}
              </span>
            </div>
          </div>

          {/* Deductions Delta */}
          <div className="rounded-xl border border-gray-100 bg-white p-2.5 shadow-2xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted block">
              Total Deductions
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              {deltas.deductionsDelta > 0 ? (
                <TrendingUp size={14} className="text-amber-600" />
              ) : deltas.deductionsDelta < 0 ? (
                <TrendingDown size={14} className="text-emerald-600" />
              ) : (
                <Minus size={14} className="text-gray-400" />
              )}
              <span
                className={`text-xs font-bold ${
                  deltas.deductionsDelta > 0
                    ? "text-amber-600"
                    : deltas.deductionsDelta < 0
                      ? "text-emerald-600"
                      : "text-ink"
                }`}
              >
                {deltas.deductionsDelta > 0 ? "+" : ""}
                {formatCurrencyINR(deltas.deductionsDelta)}
              </span>
            </div>
          </div>

          {/* LOP Delta */}
          <div className="rounded-xl border border-gray-100 bg-white p-2.5 shadow-2xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted block">
              LOP Impact
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              {deltas.lopDelta > 0 ? (
                <TrendingDown size={14} className="text-rose-600" />
              ) : deltas.lopDelta < 0 ? (
                <TrendingUp size={14} className="text-emerald-600" />
              ) : (
                <CheckCircle2 size={14} className="text-emerald-600" />
              )}
              <span
                className={`text-xs font-bold ${
                  deltas.lopDelta > 0
                    ? "text-rose-600"
                    : deltas.lopDelta < 0
                      ? "text-emerald-600"
                      : "text-ink"
                }`}
              >
                {deltas.lopDelta !== 0 ? formatCurrencyINR(deltas.lopDelta) : "₹0 LOP"}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-line/60 bg-white px-3.5 py-2 text-[11px] text-ink-muted flex items-center gap-2">
          <Info size={14} className="text-brand-500 shrink-0" />
          <span>Initial payslip on record for this cycle. Comparative month-over-month deltas will display next month.</span>
        </div>
      )}

      {/* Key Highlights */}
      {explanation.keyHighlights?.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-950/80 block">
            Key Highlights
          </span>
          <div className="space-y-1">
            {explanation.keyHighlights.map((hl, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-xl bg-indigo-50/50 px-3 py-1.5 text-xs text-indigo-900"
              >
                <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
                <span className="leading-snug">{hl}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accordion: Component Breakdown Details */}
      <div className="border-t border-indigo-100/60 pt-2">
        <button
          type="button"
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-50/50 transition"
        >
          <span>Detailed Component Breakdown & Rules</span>
          {showBreakdown ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {showBreakdown && (
          <div className="mt-2 space-y-1.5">
            {explanation.componentBreakdown.map((item, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-gray-100 bg-white p-2.5 text-xs shadow-2xs"
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-ink">{item.component}</span>
                  <span
                    className={
                      item.category === "EARNING"
                        ? "text-ink"
                        : item.category === "ATTENDANCE" && item.amount > 0
                          ? "text-rose-600 font-bold"
                          : "text-ink-faint"
                    }
                  >
                    {item.category === "EARNING" ? "" : "– "}
                    {formatCurrencyINR(item.amount)}
                  </span>
                </div>
                <p className="text-[11px] text-ink-muted mt-1 leading-relaxed">
                  {item.explanation}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive AI Q&A Section */}
      <div className="border-t border-indigo-100/60 pt-3 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-950">
          <HelpCircle size={14} className="text-indigo-600" />
          <span>Ask Payslip Assistant</span>
        </div>

        {/* Quick FAQs */}
        <div className="flex flex-wrap gap-1.5">
          {[
            "Why is my salary different this month?",
            "How is my LOP deduction calculated?",
            "What is the tax breakdown?",
            "How is my take-home pay derived?",
          ].map((qText) => (
            <button
              key={qText}
              type="button"
              onClick={() => handleQuickAsk(qText)}
              disabled={askMutation.isPending}
              className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-medium text-indigo-900 shadow-2xs hover:bg-indigo-50 hover:border-indigo-300 transition disabled:opacity-50"
            >
              💬 {qText}
            </button>
          ))}
        </div>

        {/* Chat History */}
        {messages.length > 0 && (
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-indigo-100/70 bg-white p-3 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.sender === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 leading-relaxed ${
                    m.sender === "user"
                      ? "bg-indigo-600 text-white rounded-br-none shadow-xs"
                      : "bg-gray-50 border border-gray-100 text-ink rounded-bl-none"
                  }`}
                >
                  <p>{m.text}</p>
                  {m.source && (
                    <span className="mt-1 block text-[9px] text-ink-faint">
                      {m.source === "cached_faq"
                        ? "Instant Answer"
                        : m.source === "llm"
                          ? "AI Answer"
                          : "Calculated Answer"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Question Input */}
        <form onSubmit={handleAsk} className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your salary (e.g., Why was tax deducted?)"
            disabled={askMutation.isPending}
            className="flex-1 rounded-xl border border-line/80 bg-white px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
          />
          <button
            type="submit"
            disabled={!question.trim() || askMutation.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {askMutation.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
            <span>Ask</span>
          </button>
        </form>
      </div>
    </div>
  );
}
