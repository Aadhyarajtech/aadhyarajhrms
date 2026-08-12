import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  Link,
} from "react-router-dom";

import {
  MessageCircle,
} from "lucide-react";

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

export default function Tickets() {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
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
      status: string;
    }) => {
      const res = await api.patch(
        `/tickets/${id}`,
        { status },
      );

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

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-sm text-gray-500">
          Loading tickets...
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-600">
          Failed to load tickets.
        </p>
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
          Manage employee support tickets, update status,
          and communicate with employees.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[1150px]">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="p-3 text-left text-sm font-semibold">
                Ticket ID
              </th>

              <th className="p-3 text-left text-sm font-semibold">
                Category
              </th>

              <th className="p-3 text-left text-sm font-semibold">
                Priority
              </th>

              <th className="p-3 text-left text-sm font-semibold">
                Subject
              </th>

              <th className="p-3 text-left text-sm font-semibold">
                Assigned To
              </th>

              <th className="p-3 text-left text-sm font-semibold">
                Attachment
              </th>

              <th className="p-3 text-left text-sm font-semibold">
                Status
              </th>

              <th className="p-3 text-left text-sm font-semibold">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {data?.length ? (
              data.map((ticket: any) => (
                <tr
                  key={ticket._id}
                  className="border-b last:border-b-0 hover:bg-gray-50"
                >
                  <td className="p-3 text-sm font-medium">
                    {ticket.ticketId}
                  </td>

                  <td className="p-3 text-sm text-gray-700">
                    {ticket.category}
                  </td>

                  <td className="p-3 text-sm text-gray-700">
                    {ticket.priority}
                  </td>

                  <td className="p-3 text-sm text-gray-700">
                    {ticket.subject}
                  </td>

                  <td className="p-3 text-sm text-gray-700">
                    {ticket.assignedTo ||
                      "Not Assigned"}
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
                      <span className="text-gray-400">
                        No attachment
                      </span>
                    )}
                  </td>

                  <td className="p-3">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                      {formatStatus(
                        ticket.status,
                      )}
                    </span>
                  </td>

                  {/* CHAT REPLACES VIEW */}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={ticket.status}
                        disabled={
                          updateStatus.isPending
                        }
                        onChange={(e) => {
                          updateStatus.mutate({
                            id: ticket._id,
                            status:
                              e.target.value,
                          });
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      >
                        {STATUS_OPTIONS.map(
                          (status) => (
                            <option
                              key={status}
                              value={status}
                            >
                              {formatStatus(
                                status,
                              )}
                            </option>
                          ),
                        )}
                      </select>

                      <Link
                        to={`/app/tickets/${ticket._id}`}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Chat
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={8}
                  className="p-8 text-center text-sm text-gray-500"
                >
                  No tickets found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}