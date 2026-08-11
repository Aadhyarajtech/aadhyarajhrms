import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";

import { api } from "@/lib/api";

interface Ticket {
  _id: string;
  ticketId: string;
  category: string;
  priority: string;
  subject: string;
  status: string;
  createdAt: string;
  attachment?: string;
}

export default function MyTickets() {
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: async () => {
      const res = await api.get("/tickets/my");

      return res.data.tickets as Ticket[];
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Loading tickets...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-500">
        Failed to load tickets.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          My Tickets
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          View and track the support tickets you have submitted.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[1050px]">
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
                Status
              </th>

              <th className="p-3 text-left text-sm font-semibold">
                Attachment
              </th>

              <th className="p-3 text-left text-sm font-semibold">
                Created
              </th>

              <th className="p-3 text-left text-sm font-semibold">
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {data?.map((ticket) => (
              <tr
                key={ticket._id}
                className="border-b last:border-b-0 hover:bg-gray-50"
              >
                <td className="p-3 text-sm font-medium text-gray-900">
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

                <td className="p-3">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                    {ticket.status.replaceAll(
                      "_",
                      " ",
                    )}
                  </span>
                </td>

                <td className="p-3">
                  {ticket.attachment ? (
                    <a
                      href={`http://localhost:4000${ticket.attachment}`}
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

                <td className="p-3 text-sm text-gray-700">
                  {new Date(
                    ticket.createdAt,
                  ).toLocaleDateString()}
                </td>

                <td className="p-3">
                  <Link
                    to={`/app/tickets/${ticket._id}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Chat
                  </Link>
                </td>
              </tr>
            ))}

            {!data?.length && (
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