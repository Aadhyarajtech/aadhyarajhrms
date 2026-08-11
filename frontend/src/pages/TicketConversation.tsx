import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Paperclip,
  Send,
  Loader2,
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

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

  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isUserAtBottom = useRef(true);
  const { user } = useAuth();
  const currentEmployeeId = user?.employee?.id;

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
    queryFn: async () => {
      const res = await api.get(`/tickets/${id}/messages`);

      return (
        res.data.messages ||
        res.data.ticketMessages ||
        []
      );
    },
  });

  // Ensure messages are sorted oldest -> newest using full timestamp
  const sortedMessages = (messages || []).slice().sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

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

      queryClient.invalidateQueries({ queryKey: ["ticket-messages", id] });
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
    },
  });

  /*
   * =========================================================
   * AUTO SCROLL
   * =========================================================
   */

  // Track user's scroll position to avoid forcing scroll when reading history
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onScroll() {
      const current = containerRef.current;
      if (!current) return;
      const threshold = 150; // px from bottom to consider "at bottom"
      const atBottom = current.scrollHeight - current.scrollTop - current.clientHeight <= threshold;
      isUserAtBottom.current = atBottom;
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    // initialize
    onScroll();

    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll to bottom when appropriate: on initial load or when user is at bottom
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const last = sortedMessages[sortedMessages.length - 1];
    const lastIsFromMe = last && last.employeeId && currentEmployeeId && last.employeeId === currentEmployeeId;

    if (isUserAtBottom.current || lastIsFromMe) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [sortedMessages, currentEmployeeId]);

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
   * ENTER TO SEND
   * =========================================================
   */

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSendMessage();
    }
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
      alert("File size must be 8MB or less.");

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
      alert(
        "Unsupported file type. Please upload a PDF, Word document, or image.",
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
          onClick={() => navigate("/app/my-tickets")}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to My Tickets
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
          onClick={() => navigate("/app/my-tickets")}
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
          </div>

          <p className="mt-0.5 text-xs text-gray-500">
            {ticket.category} · {ticket.priority}
            {ticket.assignedTo
              ? ` · ${ticket.assignedTo}`
              : ""}
          </p>
        </div>
      </div>

      {/* =====================================================
          CHAT AREA
          ===================================================== */}

      <div className="relative flex-1 overflow-y-auto bg-[#f7f3ea] px-5 py-6">
        {ticket.description && (
          <div className="mb-6 flex justify-center">
            <div className="max-w-xl rounded-lg bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
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
            const senderIsMe = item.employeeId && currentEmployeeId ? item.employeeId === currentEmployeeId : false;

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
                          href={`http://localhost:4000${item.attachment}`}
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
          <input
            type="text"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={sendMessage.isPending}
            className="h-11 flex-1 rounded-full border border-violet-300 bg-white px-5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50"
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
          <p className="mt-2 px-12 text-xs text-gray-400">
            Attachment selected. File upload requires the
            message upload endpoint on the backend.
          </p>
        )}
      </div>
    </div>
  );
}