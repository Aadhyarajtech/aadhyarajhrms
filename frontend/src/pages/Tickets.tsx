import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Link } from "react-router-dom";

import { AlertTriangle, MessageCircle, X } from "lucide-react";

import { api, resolveAssetUrl } from "@/lib/api";

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
  const [escalationTicket, setEscalationTicket] = useState<any | null>(null);
  const [escalationTarget, setEscalationTarget] = useState<
    "HR_ADMIN" | "SUPER_ADMIN"
  >("HR_ADMIN");
  const [escalationReason, setEscalationReason] = useState("");
  const [historyTicket, setHistoryTicket] = useState<any | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tickets"],
    queryFn: async () => {
      const res = await api.get("/tickets");

      return res.data.tickets;
    },
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
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Ticket Management
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Manage employee support tickets, update status, and communicate with
          employees.
        </p>
      </div>

      {updateStatus.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to update the ticket status. Please try again.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[1150px]">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="p-3 text-left text-sm font-semibold">Ticket ID</th>

              <th className="p-3 text-left text-sm font-semibold">Category</th>

              <th className="p-3 text-left text-sm font-semibold">Priority</th>

              <th className="p-3 text-left text-sm font-semibold">Subject</th>

              <th className="p-3 text-left text-sm font-semibold">
                Assigned To / Manager
              </th>

              <th className="p-3 text-left text-sm font-semibold">
                Attachment
              </th>

              <th className="p-3 text-left text-sm font-semibold">Status</th>

              <th className="p-3 text-left text-sm font-semibold">SLA</th>

              <th className="p-3 text-left text-sm font-semibold">Actions</th>
            </tr>
          </thead>

          <tbody>
            {data?.length ? (
              data.map((ticket: any) => (
                <tr
                  key={ticket._id}
                  className="border-b last:border-b-0 hover:bg-gray-50"
                >
                  <td className="p-3 text-sm font-medium">{ticket.ticketId}</td>

                  <td className="p-3 text-sm text-gray-700">
                    {ticket.category === "Complaint" ? (
                      <span className="font-medium text-red-700">
                        Grievance
                      </span>
                    ) : (
                      ticket.category
                    )}
                  </td>

                  <td className="p-3 text-sm text-gray-700">
                    {ticket.priority}
                  </td>

                  <td className="p-3 text-sm text-gray-700">
                    <div className="flex items-center gap-2">
                      {ticket.category === "Complaint" && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                          Grievance
                        </span>
                      )}
                      <span>{ticket.subject}</span>
                    </div>
                  </td>

                  <td className="p-3 text-sm text-gray-700">
                    {ticket.category === "Complaint"
                      ? ticket.assignedManagerId || "Not Assigned"
                      : ticket.assignedTo || "Not Assigned"}
                  </td>

                  <td className="p-3 text-sm">
                    {ticket.attachment ? (
                      <a
                        href={resolveAssetUrl(ticket.attachment) ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-600 hover:underline"
                      >
                        View Attachment
                      </a>
                    ) : (
                      <span className="text-gray-400">No attachment</span>
                    )}
                  </td>

                  <td className="p-3">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                      {formatStatus(ticket.status)}
                    </span>
                  </td>

                  <td className="p-3">
                    <div className="space-y-1">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${slaBadgeClass(
                          ticket.slaStatus,
                        )}`}
                      >
                        {formatSlaStatus(ticket.slaStatus)}
                      </span>
                      <p className="text-[11px] text-gray-500">
                        Due: {formatDateTime(ticket.slaDueAt)}
                      </p>
                    </div>
                  </td>

                  {/* CHAT REPLACES VIEW */}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={ticket.status}
                        disabled={updateStatus.isPending}
                        onChange={(e) => {
                          const nextStatus = e.target
                            .value as (typeof STATUS_OPTIONS)[number];

                          if (!STATUS_OPTIONS.includes(nextStatus)) {
                            return;
                          }

                          updateStatus.mutate({
                            id: ticket._id,
                            status: nextStatus,
                          });
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {formatStatus(status)}
                          </option>
                        ))}
                      </select>

                      <Link
                        to={`/app/tickets/${ticket._id}`}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Chat
                      </Link>

                      {ticket.category === "Complaint" &&
                        !ticket.isEscalated && (
                          <button
                            type="button"
                            onClick={() => {
                              setEscalationTicket(ticket);
                              setEscalationReason("");
                              setEscalationTarget("HR_ADMIN");
                            }}
                            disabled={escalateTicket.isPending}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <AlertTriangle className="h-4 w-4" />
                            Escalate
                          </button>
                        )}

                      {ticket.category === "Complaint" &&
                        ticket.isEscalated && (
                          <>
                            <span className="inline-flex items-center rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                              Escalated
                            </span>

                            <button
                              type="button"
                              onClick={() => setHistoryTicket(ticket)}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
                  colSpan={9}
                  className="p-8 text-center text-sm text-gray-500"
                >
                  No assigned tickets found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
