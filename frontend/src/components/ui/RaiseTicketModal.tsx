import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface AIClassification {
  classified: boolean;
  category?: string;
  intent?: string;
  confidence?: number;
  reason?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  priorityReason?: string;
  sentiment?: "POSITIVE" | "NEUTRAL" | "FRUSTRATED" | "CRITICAL";
  message?: string;
}

export default function RaiseTicketModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [category, setCategory] = useState("HR");
  const [priority, setPriority] = useState("MEDIUM");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  // AI classification state
  const [aiResult, setAiResult] = useState<AIClassification | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userChangedPriorityRef = useRef(false);

  // Debounced AI classification call
  useEffect(() => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Need minimum content to classify
    if (subject.trim().length < 3 || description.trim().length < 10) {
      setAiResult(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setAiLoading(true);
      try {
        const { data } = await api.post<AIClassification>(
          "/tickets/classify",
          {
            subject: subject.trim(),
            description: description.trim(),
            category,
          },
        );
        setAiResult(data);
        // Automatically sync priority with AI's recommendation unless the employee manually selected a priority
        if (!userChangedPriorityRef.current && data?.priority) {
          setPriority(data.priority);
        }
      } catch {
        // AI classification failure is non-critical — silently ignore
        setAiResult(null);
      } finally {
        setAiLoading(false);
      }
    }, 800);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [subject, description, category]);

  useEffect(() => {
    if (!open) {
      userChangedPriorityRef.current = false;
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleAcceptAiSuggestion() {
    let updated = false;
    if (aiResult?.category) {
      setCategory(aiResult.category);
      updated = true;
    }
    if (aiResult?.priority && aiResult.priority !== priority) {
      setPriority(aiResult.priority);
      updated = true;
    }
    if (updated) {
      showToast(
        `Applied AI suggestions: ${aiResult?.category || category} • ${aiResult?.priority || priority} Priority`
      );
    }
  }

  async function handleSubmit() {
    if (!subject.trim()) {
      showToast("Please enter a subject.", "error");
      return;
    }

    if (!description.trim()) {
      showToast("Please enter a description.", "error");
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();

      formData.append("category", category);
      formData.append("priority", priority);
      formData.append("subject", subject.trim());
      formData.append("description", description.trim());

      if (attachment) {
        formData.append("attachment", attachment);
      }

      await api.post("/tickets", formData);

      showToast("Ticket submitted successfully.");

      // Invalidate both employee and admin ticket lists so UI updates immediately
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });

      setCategory("HR");
      setPriority("MEDIUM");
      userChangedPriorityRef.current = false;
      setSubject("");
      setDescription("");
      setAttachment(null);
      setAiResult(null);

      onClose();
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  }

  // Determine if AI disagrees with employee's selection
  const aiDisagrees =
    aiResult?.classified &&
    aiResult.category &&
    aiResult.category !== category;

  const aiAgrees =
    aiResult?.classified &&
    aiResult.category &&
    aiResult.category === category;

  const highConfidence = (aiResult?.confidence ?? 0) >= 0.85;
  const mediumConfidence =
    (aiResult?.confidence ?? 0) >= 0.6 && (aiResult?.confidence ?? 0) < 0.85;
  const isLowConfidence =
    Boolean(aiResult?.classified) && (aiResult?.confidence ?? 0) < 0.6;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex h-[100dvh] w-screen items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="raise-ticket-title"
    >
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex w-full max-w-2xl max-h-[calc(100dvh-32px)] sm:max-h-[calc(100dvh-48px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-fade-in"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4.5">
          <div>
            <h2 id="raise-ticket-title" className="text-xl font-semibold text-gray-900">
              Raise Ticket
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Submit a support query or request with AI-assisted classification.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Category */}
          <div>
            <label className="mb-2 block text-sm font-medium">Category</label>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2"
            >
              <option>HR</option>
              <option>Payroll</option>
              <option>Leave</option>
              <option>Attendance</option>
              <option>Recruitment</option>
              <option>Employee Referral</option>
              <option>IT Support</option>
              <option>Complaint</option>
            </select>

            {/* AI Classification Suggestion */}
            {aiLoading && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                AI is analyzing your ticket...
              </div>
            )}

            {!aiLoading && aiAgrees && highConfidence && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                <div className="flex items-center gap-2">
                  <span>✅</span>
                  <span>
                    AI confirms: <strong>{aiResult.category}</strong>
                    {aiResult.intent && (
                      <span className="text-green-600">
                        {" "}
                        — {aiResult.intent}
                      </span>
                    )}
                  </span>
                </div>
                {aiResult.priority && aiResult.priority !== priority && (
                  <button
                    type="button"
                    onClick={() => {
                      if (aiResult.priority) {
                        setPriority(aiResult.priority);
                        showToast(`Priority set to ${aiResult.priority}`);
                      }
                    }}
                    className="whitespace-nowrap rounded-md bg-green-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-800"
                  >
                    Set Priority to {aiResult.priority}
                  </button>
                )}
              </div>
            )}

            {!aiLoading && aiDisagrees && highConfidence && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-amber-800">
                    <span className="mr-1">💡</span>
                    AI suggests this might be a{" "}
                    <strong>{aiResult.category}</strong> issue
                    {aiResult.intent && (
                      <span>
                        {" "}
                        — <em>{aiResult.intent}</em>
                      </span>
                    )}
                    {aiResult.priority && (
                      <span className="ml-1 text-xs font-semibold text-amber-900 bg-amber-200/80 px-1.5 py-0.5 rounded">
                        ⚡ {aiResult.priority} Priority
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleAcceptAiSuggestion}
                    className="whitespace-nowrap rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
                  >
                    Accept Suggestion
                  </button>
                </div>
                {aiResult.reason && (
                  <p className="mt-1 text-xs text-amber-600">
                    {aiResult.reason}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-amber-200">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all"
                      style={{
                        width: `${(aiResult.confidence ?? 0) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-amber-600">
                    {Math.round((aiResult.confidence ?? 0) * 100)}% confidence
                  </span>
                </div>
              </div>
            )}

            {!aiLoading && aiDisagrees && mediumConfidence && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                <span>🤔</span>
                <span>
                  AI thinks this could also be{" "}
                  <strong>{aiResult.category}</strong>
                  {aiResult.intent && <span> ({aiResult.intent})</span>}
                </span>
              </div>
            )}

            {!aiLoading && isLowConfidence && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span>ℹ️</span>
                <span>
                  AI is unsure of the category for this query. It will be routed to <strong>General HR</strong> by default, or you can pick the best-matching category above.
                </span>
              </div>
            )}

            {/* Sentiment / Frustration Escalation Reassurance */}
            {!aiLoading && aiResult?.sentiment && (aiResult.sentiment === "FRUSTRATED" || aiResult.sentiment === "CRITICAL") && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-800">
                <span>🚨</span>
                <span>
                  <strong>High Urgency Detected:</strong> Our HR desk prioritizes blocker queries for fast response.
                </span>
              </div>
            )}
          </div>

          {/* Priority */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium">Priority</label>
              {aiResult?.priority && (
                <span className="text-xs">
                  {priority === aiResult.priority ? (
                    <span className="font-medium text-emerald-600">⚡ AI set to {priority}</span>
                  ) : (
                    <span className="text-gray-500">
                      AI Recommends: <strong className="text-indigo-600">{aiResult.priority}</strong>
                    </span>
                  )}
                </span>
              )}
            </div>

            <select
              value={priority}
              onChange={(e) => {
                userChangedPriorityRef.current = true;
                setPriority(e.target.value);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>

            {/* Suggested priority mismatch helper */}
            {!aiLoading && aiResult?.priority && aiResult.priority !== priority && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-xs text-indigo-900">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-indigo-700">⚡ AI Recommends: {aiResult.priority}</span>
                  {aiResult.priorityReason && (
                    <span className="text-indigo-600 hidden sm:inline">— {aiResult.priorityReason}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (aiResult.priority) {
                      setPriority(aiResult.priority);
                      showToast(`Priority set to ${aiResult.priority}`);
                    }
                  }}
                  className="whitespace-nowrap rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  Set {aiResult.priority}
                </button>
              </div>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="mb-2 block text-sm font-medium">Subject</label>

            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter subject"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Description
            </label>

            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your issue..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          {/* Attachment */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Attachment{" "}
              <span className="font-normal text-gray-500">(Optional)</span>
            </label>

            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;

                if (!file) {
                  setAttachment(null);
                  return;
                }

                if (file.size > 8 * 1024 * 1024) {
                  showToast("File size must be less than 8 MB.", "error");
                  e.target.value = "";
                  setAttachment(null);
                  return;
                }

                setAttachment(file);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />

            {attachment && (
              <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <p className="font-medium text-gray-700">Selected file:</p>

                <p className="break-all text-gray-500">{attachment.name}</p>
              </div>
            )}

            <p className="mt-1 text-xs text-gray-500">
              PDF, Word, JPG, PNG or WebP. Maximum 8 MB.
            </p>
          </div>
        </div>

        {/* Buttons / Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-xs hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {loading ? "Submitting..." : "Submit Ticket"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
