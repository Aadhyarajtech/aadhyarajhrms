import { useState, useEffect } from "react";
import { Send, Sparkles, AlertCircle, CheckCircle2, Clock, Layers, Loader2, Users, CheckSquare, Square } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { api, getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useQueryClient } from "@tanstack/react-query";

export interface BroadcastRecipientTicket {
  _id: string;
  ticketId: string;
  subject: string;
  employeeName?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clusterTitle: string;
  category?: string;
  tickets?: BroadcastRecipientTicket[];
  ticketIds?: string[];
  suggestedAction?: string;
  onSuccess?: () => void;
}

export default function BroadcastClusterModal({
  open,
  onClose,
  clusterTitle,
  category,
  tickets = [],
  ticketIds = [],
  suggestedAction,
  onSuccess,
}: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Combine tickets or fallback to ticketIds
  const resolvedTickets: BroadcastRecipientTicket[] =
    tickets.length > 0
      ? tickets
      : ticketIds.map((id) => ({
          _id: id,
          ticketId: id,
          subject: "Ticket " + id,
        }));

  const allIds = resolvedTickets.map((t) => t._id);
  const [selectedIds, setSelectedIds] = useState<string[]>(allIds);
  const [message, setMessage] = useState("");
  const [updateStatus, setUpdateStatus] = useState<string>("IN_PROGRESS");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync selectedIds whenever modal opens or tickets change
  useEffect(() => {
    if (open) {
      setSelectedIds(resolvedTickets.map((t) => t._id));
      setError(null);
    }
  }, [open, tickets, ticketIds]);

  const toggleSelectAll = () => {
    if (selectedIds.length === resolvedTickets.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(resolvedTickets.map((t) => t._id));
    }
  };

  const toggleSelectTicket = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const presets = [
    {
      id: "investigating",
      label: "🔍 Investigating",
      text: `Hello, we have identified a widespread incident affecting "${clusterTitle}". Our technical team is actively investigating the root cause. We will provide updates here as soon as we make progress.`,
      status: "IN_PROGRESS",
    },
    {
      id: "fix_in_progress",
      label: "🛠️ Fix In Progress",
      text: `Update on "${clusterTitle}": A remediation is currently underway. We anticipate restoring full service shortly. Thank you for your patience.`,
      status: "IN_PROGRESS",
    },
    {
      id: "resolved",
      label: "✅ Resolved",
      text: `The incident regarding "${clusterTitle}" has now been resolved. Please verify if your issue is resolved. If you still encounter problems, feel free to reply to this ticket.`,
      status: "RESOLVED",
    },
  ];

  const handleApplyPreset = (presetText: string, suggestedStatus: string) => {
    setMessage(presetText);
    setUpdateStatus(suggestedStatus);
  };

  const handleSend = async () => {
    if (selectedIds.length === 0) {
      setError("Please select at least one ticket to broadcast to.");
      return;
    }
    if (!message.trim() || message.trim().length < 3) {
      setError("Please write a message with at least 3 characters.");
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const payload: {
        ticketIds: string[];
        message: string;
        updateStatus?: string;
      } = {
        ticketIds: selectedIds,
        message: message.trim(),
      };

      if (updateStatus && updateStatus !== "NO_CHANGE") {
        payload.updateStatus = updateStatus;
      }

      const res = await api.post("/tickets/broadcast-batch", payload);

      const count = res.data?.sentCount || selectedIds.length;
      showToast(
        `Broadcast sent successfully to ${count} affected tickets!`,
        "success",
      );

      // Invalidate queries so lists, cards, and analytics update immediately
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-recurring-issues"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-messages"] });

      setMessage("");
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to broadcast message to cluster"));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !isSending && onClose()}
      title="Broadcast Update to Ticket Cluster"
      subtitle={`Send a unified update to ${selectedIds.length} of ${resolvedTickets.length} tickets in this cluster`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending || selectedIds.length === 0 || !message.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-sm shadow-brand-500/20 transition disabled:opacity-50 cursor-pointer"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Broadcasting to {selectedIds.length} Tickets...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Send Broadcast ({selectedIds.length} Selected)</span>
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        {/* Incident Summary Card */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-bold flex items-center gap-1.5 text-amber-900">
              <Layers className="h-4 w-4 text-amber-600" />
              {clusterTitle}
            </span>
            <span className="bg-amber-600 text-white font-bold px-2 py-0.5 rounded-full text-[10px]">
              {resolvedTickets.length} Recent Tickets
            </span>
          </div>
          {category && (
            <p className="text-amber-800 text-[11px]">
              Category: <strong className="font-semibold">{category}</strong>
            </p>
          )}
          {suggestedAction && (
            <p className="mt-1 text-[11px] text-amber-700 font-medium">
              💡 Recommended action: {suggestedAction}
            </p>
          )}
        </div>

        {/* Recipient Ticket Selector */}
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-brand-600" />
              Recipients ({selectedIds.length} of {resolvedTickets.length} selected)
            </span>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-[11px] font-semibold text-brand-600 hover:text-brand-800 cursor-pointer"
            >
              {selectedIds.length === resolvedTickets.length ? "Deselect All" : "Select All"}
            </button>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
            {resolvedTickets.map((t) => {
              const isChecked = selectedIds.includes(t._id);
              return (
                <label
                  key={t._id}
                  onClick={() => toggleSelectTicket(t._id)}
                  className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                    isChecked
                      ? "bg-white border-brand-300 shadow-2xs"
                      : "bg-gray-100/70 border-gray-200 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-brand-600 shrink-0">
                      {isChecked ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4 text-gray-400" />
                      )}
                    </span>
                    <span className="font-mono font-semibold text-gray-900 shrink-0">
                      {t.ticketId}
                    </span>
                    <span className="text-gray-700 truncate">
                      {t.subject}
                    </span>
                  </div>
                  {t.employeeName && (
                    <span className="text-[10px] text-gray-500 font-medium shrink-0 ml-2">
                      {t.employeeName}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Quick Presets */}
        <div>
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-1.5">
            <Sparkles className="h-3.5 w-3.5 text-brand-600" />
            Quick Presets (Click to insert):
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleApplyPreset(p.text, p.status)}
                className="text-left p-2.5 rounded-xl border border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50/40 text-xs text-gray-800 transition shadow-2xs group cursor-pointer"
              >
                <div className="font-semibold text-gray-900 group-hover:text-brand-700">
                  {p.label}
                </div>
                <div className="text-[10px] text-gray-500 line-clamp-2 mt-0.5">
                  {p.text}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Message Input */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Broadcast Message <span className="text-red-500">*</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Type the message to send to all selected employees..."
            className="w-full rounded-xl border border-gray-300 p-3 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 resize-y outline-none"
          />
          <p className="text-[11px] text-gray-500 mt-0.5">
            This message will be appended directly into each ticket's chat thread and each employee will receive an in-app notification.
          </p>
        </div>

        {/* Status Update Option */}
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
          <label className="block text-xs font-semibold text-gray-800 mb-1.5">
            Update status of selected tickets:
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { value: "NO_CHANGE", label: "Do not change status" },
              { value: "IN_PROGRESS", label: "Set to In Progress" },
              { value: "RESOLVED", label: "Set to Resolved" },
            ].map((opt) => (
              <label
                key={opt.value}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition ${
                  updateStatus === opt.value
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="updateStatus"
                  value={opt.value}
                  checked={updateStatus === opt.value}
                  onChange={(e) => setUpdateStatus(e.target.value)}
                  className="sr-only"
                />
                {updateStatus === opt.value ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                )}
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
