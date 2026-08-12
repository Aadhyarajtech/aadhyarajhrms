import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Send,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api, getErrorMessage, resolveAssetUrl } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

interface Ticket {
  _id: string;
  ticketId: string;
  category: string;
  priority: string;
  subject: string;
  description: string;
  employeeId?: string;
  assignedTo?: string;
  status: string;
  attachment?: string;
  createdAt: string;
  updatedAt?: string;
}

interface TicketMessage {
  _id: string;
  ticketId: string;
  employeeId: string;
  senderName: string;
  senderRole: string;
  message: string;
  createdAt: string;
  updatedAt?: string;
}

interface CurrentUser {
  userId?: string;
  employeeId?: string | null;
  name?: string;
  fullName?: string;
  role?: string;
  email?: string;
}

/* =========================================================
   INDIA DATE / TIME
========================================================= */

const INDIA_TIME_ZONE = "Asia/Kolkata";

function parseDate(value?: string): Date | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDateTime(value?: string) {
  const date = parseDate(value);

  if (!date) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatTime(value?: string) {
  const date = parseDate(value);

  if (!date) return "";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function getIndiaDateKey(value?: string | Date) {
  if (!value) return "";

  const date =
    value instanceof Date
      ? value
      : parseDate(value);

  if (!date) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find(
    (part) => part.type === "year",
  )?.value;

  const month = parts.find(
    (part) => part.type === "month",
  )?.value;

  const day = parts.find(
    (part) => part.type === "day",
  )?.value;

  return `${year}-${month}-${day}`;
}

function getDateLabel(value?: string) {
  const date = parseDate(value);

  if (!date) {
    return "Unknown Date";
  }

  const todayKey = getIndiaDateKey(new Date());

  if (getIndiaDateKey(date) === todayKey) {
    return "Today";
  }

  /*
   * Use 24 hours before the current moment.
   * This avoids browser-local timezone problems.
   */
  const yesterdayDate = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  );

  const yesterdayKey =
    getIndiaDateKey(yesterdayDate);

  if (getIndiaDateKey(date) === yesterdayKey) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/* =========================================================
   STATUS
========================================================= */

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

/* =========================================================
   ATTACHMENT
========================================================= */

function getAttachmentUrl(attachment?: string) {
  if (!attachment) {
    return null;
  }

  if (attachment.startsWith("http")) {
    return attachment;
  }

  return resolveAssetUrl(attachment);
}

/* =========================================================
   CURRENT USER
========================================================= */

function getCurrentUser(): CurrentUser | null {
  const possibleKeys = [
    "user",
    "authUser",
    "currentUser",
    "auth",
  ];

  for (const key of possibleKeys) {
    const raw = localStorage.getItem(key);

    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);

      const user =
        parsed?.user ||
        parsed?.data?.user ||
        parsed?.data ||
        parsed;

      if (
        user?.employeeId ||
        user?.userId ||
        user?.role
      ) {
        return {
          userId: user.userId,
          employeeId: user.employeeId,
          name: user.name,
          fullName: user.fullName,
          role: user.role,
          email: user.email,
        };
      }
    } catch {
      // Ignore invalid JSON.
    }
  }

  const employeeId =
    localStorage.getItem("employeeId") ||
    localStorage.getItem("employee_id");

  if (employeeId) {
    return {
      employeeId,
    };
  }

  return null;
}

/* =========================================================
   ROLE HELPERS
========================================================= */

function normalizeRole(role?: string) {
  return (role || "")
    .trim()
    .toUpperCase();
}

function getRoleLabel(role?: string) {
  const normalized = normalizeRole(role);

  switch (normalized) {
    case "SUPER_ADMIN":
      return "Super Admin";

    case "HR_ADMIN":
      return "HR Admin";

    case "IT_SUPPORT":
      return "IT Support";

    case "EMPLOYEE":
      return "Employee";

    case "MANAGER":
      return "Manager";

    case "FINANCE":
      return "Finance";

    case "RECRUITER":
      return "Recruiter";

    default:
      return role || "User";
  }
}

/* =========================================================
   MESSAGE COLOR / STYLE
========================================================= */

function getMessageStyle(
  role?: string,
  isSent?: boolean,
) {
  const normalized = normalizeRole(role);

  /*
   * Employee's own message
   * BLUE + RIGHT
   */
  if (isSent || normalized === "EMPLOYEE") {
    return {
      bubble:
        "bg-blue-500 text-white rounded-2xl rounded-br-md",
      sender: "text-blue-700",
      time: "text-blue-100",
      role: "text-blue-600",
      tick: "text-blue-100",
    };
  }

  /*
   * SUPER ADMIN
   * YELLOW
   */
  if (normalized === "SUPER_ADMIN") {
    return {
      bubble:
        "bg-amber-100 text-gray-900 rounded-2xl rounded-bl-md border border-amber-200",
      sender: "text-amber-800",
      time: "text-amber-700",
      role: "text-amber-700",
      tick: "text-amber-700",
    };
  }

  /*
   * HR / MANAGER / FINANCE / IT / RECRUITER
   * GREEN
   */
  return {
    bubble:
      "bg-emerald-100 text-gray-900 rounded-2xl rounded-bl-md border border-emerald-200",
    sender: "text-emerald-800",
    time: "text-emerald-700",
    role: "text-emerald-700",
    tick: "text-emerald-700",
  };
}

/* =========================================================
   PAGE
========================================================= */

export default function TicketDetails() {
  const { id } = useParams<{ id: string }>();

  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [messageText, setMessageText] =
    useState("");

  const messagesEndRef =
    useRef<HTMLDivElement | null>(null);

  const currentUser = getCurrentUser();

  const currentEmployeeId =
    currentUser?.employeeId || null;

  /* =========================================================
     GET TICKET
  ========================================================= */

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["ticket", id],

    queryFn: async () => {
      const res = await api.get(
        `/tickets/${id}`,
      );

      return res.data.ticket as Ticket;
    },

    enabled: !!id,
  });

  /* =========================================================
     GET MESSAGES
  ========================================================= */

  const {
    data: messages = [],
    isLoading: messagesLoading,
    isError: messagesError,
  } = useQuery({
    queryKey: ["ticket-messages", id],

    queryFn: async () => {
      const res = await api.get(
        `/tickets/${id}/messages`,
      );

      return res.data.messages as TicketMessage[];
    },

    enabled: !!id,

    /*
     * Automatically check for new messages.
     */
    refetchInterval: 5000,
  });

  /* =========================================================
     SORT + GROUP MESSAGES
  ========================================================= */

  const groupedMessages = useMemo(() => {
    const sortedMessages = [...messages].sort(
      (a, b) => {
        const timeA =
          parseDate(a.createdAt)?.getTime() ?? 0;

        const timeB =
          parseDate(b.createdAt)?.getTime() ?? 0;

        return timeA - timeB;
      },
    );

    const groups: Array<{
      dateKey: string;
      label: string;
      messages: TicketMessage[];
    }> = [];

    for (const message of sortedMessages) {
      const dateKey = getIndiaDateKey(
        message.createdAt,
      );

      let group = groups.find(
        (item) => item.dateKey === dateKey,
      );

      if (!group) {
        group = {
          dateKey,
          label: getDateLabel(
            message.createdAt,
          ),
          messages: [],
        };

        groups.push(group);
      }

      group.messages.push(message);
    }

    return groups;
  }, [messages]);

  /* =========================================================
     AUTO SCROLL
  ========================================================= */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [groupedMessages]);

  /* =========================================================
     SEND MESSAGE
  ========================================================= */

  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      if (!id) {
        throw new Error(
          "Ticket ID not found",
        );
      }

      const res = await api.post(
        `/tickets/${id}/messages`,
        {
          message,
        },
      );

      return res.data.message as TicketMessage;
    },

    onSuccess: () => {
      setMessageText("");

      queryClient.invalidateQueries({
        queryKey: [
          "ticket-messages",
          id,
        ],
      });

      queryClient.invalidateQueries({
        queryKey: ["ticket", id],
      });
    },

    onError: (error) => {
      showToast(getErrorMessage(error), "error");
    },
  });

  /* =========================================================
     SEND MESSAGE HANDLER
  ========================================================= */

  function handleSendMessage() {
    const trimmedMessage =
      messageText.trim();

    if (!trimmedMessage) {
      return;
    }

    if (trimmedMessage.length > 5000) {
      showToast("Message cannot exceed 5000 characters.", "error");
      return;
    }

    sendMessage.mutate(trimmedMessage);
  }

  /* =========================================================
     ENTER = SEND
     SHIFT + ENTER = NEW LINE
  ========================================================= */

  function handleMessageKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      handleSendMessage();
    }
  }

  /* =========================================================
     LOADING
  ========================================================= */

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Loading ticket...
      </div>
    );
  }

  /* =========================================================
     ERROR
  ========================================================= */

  if (isError || !data) {
    return (
      <div className="space-y-5 p-6">
        <Link
          to="/app/my-tickets"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={18} />

          Back to My Tickets
        </Link>

        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-600">
          Failed to load ticket details.
        </div>
      </div>
    );
  }

  const attachmentUrl =
    getAttachmentUrl(data.attachment);

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="space-y-6 p-6">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/app/my-tickets"
            className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={18} />

            Back to My Tickets
          </Link>

          <h1 className="text-2xl font-semibold text-gray-900">
            Ticket Details
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            View your support ticket information.
          </p>
        </div>

        <span className="inline-flex w-fit rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
          {formatStatus(data.status)}
        </span>
      </div>

      {/* =====================================================
          TICKET INFORMATION
      ===================================================== */}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">

        <div className="border-b border-gray-200 px-6 py-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Ticket ID
              </p>

              <h2 className="mt-1 text-lg font-semibold text-gray-900">
                {data.ticketId}
              </h2>
            </div>

            <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {data.priority}
            </span>

          </div>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3">

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Category
            </p>

            <p className="mt-1 text-sm font-medium text-gray-900">
              {data.category}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Priority
            </p>

            <p className="mt-1 text-sm font-medium text-gray-900">
              {data.priority}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Assigned To
            </p>

            <p className="mt-1 text-sm font-medium text-gray-900">
              {data.assignedTo ||
                "Not Assigned"}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Created
            </p>

            <p className="mt-1 text-sm text-gray-700">
              {formatDateTime(
                data.createdAt,
              )}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Last Updated
            </p>

            <p className="mt-1 text-sm text-gray-700">
              {formatDateTime(
                data.updatedAt,
              )}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Status
            </p>

            <p className="mt-1 text-sm font-medium text-gray-900">
              {formatStatus(data.status)}
            </p>
          </div>

        </div>
      </div>

      {/* =====================================================
          SUBJECT & DESCRIPTION
      ===================================================== */}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">

        <div className="border-b border-gray-200 px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Subject
          </p>

          <h2 className="mt-1 text-lg font-semibold text-gray-900">
            {data.subject}
          </h2>
        </div>

        <div className="p-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Description
          </p>

          <div className="whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">
            {data.description}
          </div>
        </div>

      </div>

      {/* =====================================================
          WHATSAPP STYLE CONVERSATION
      ===================================================== */}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">

        {/* CHAT HEADER */}

        <div className="border-b border-gray-200 bg-white px-6 py-5">

          <div className="flex items-center gap-3">

            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-lg">
              💬
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Ticket Conversation
              </h2>

              <p className="text-sm text-gray-500">
                {data.ticketId} ·{" "}
                {data.assignedTo ||
                  "Support Team"}
              </p>
            </div>

          </div>

          {/* COLOR LEGEND */}

          <div className="mt-4 flex flex-wrap gap-3 text-xs">

            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-blue-500" />
              <span className="text-gray-500">
                Employee
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-500" />
              <span className="text-gray-500">
                Support Team
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              <span className="text-gray-500">
                Super Admin
              </span>
            </div>

          </div>

        </div>

        {/* ===================================================
            CHAT AREA
        =================================================== */}

        <div className="max-h-[600px] min-h-[400px] overflow-y-auto bg-[#efeae2] px-3 py-5 sm:px-6">

          {messagesLoading ? (

            <div className="flex min-h-[300px] items-center justify-center">
              <p className="text-sm text-gray-500">
                Loading messages...
              </p>
            </div>

          ) : messagesError ? (

            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              Failed to load messages.
            </div>

          ) : messages.length === 0 ? (

            <div className="flex min-h-[300px] items-center justify-center">

              <div className="rounded-2xl bg-white px-8 py-6 text-center shadow-sm">

                <p className="text-sm font-medium text-gray-700">
                  No messages yet
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Send a message to start the
                  conversation.
                </p>

              </div>

            </div>

          ) : (

            <div className="space-y-6">

              {groupedMessages.map(
                (group) => (

                  <div
                    key={group.dateKey}
                    className="space-y-2"
                  >

                    {/* DATE SEPARATOR */}

                    <div className="flex justify-center py-2">

                      <span className="rounded-full bg-white/90 px-4 py-1.5 text-[11px] font-semibold text-gray-600 shadow-sm">
                        {group.label}
                      </span>

                    </div>

                    {/* MESSAGES */}

                    <div className="space-y-3">

                      {group.messages.map(
                        (item) => {

                          const isSent =
                            !!currentEmployeeId &&
                            item.employeeId ===
                              currentEmployeeId;

                          const styles =
                            getMessageStyle(
                              item.senderRole,
                              isSent,
                            );

                          /*
                           * If current user sent it,
                           * always display right side.
                           */
                          const alignment =
                            isSent
                              ? "justify-end"
                              : "justify-start";

                          /*
                           * Employee messages from
                           * another employee should
                           * also be blue but remain
                           * left side.
                           */
                          const isEmployee =
                            normalizeRole(
                              item.senderRole,
                            ) === "EMPLOYEE";

                          const bubbleClass =
                            isSent
                              ? styles.bubble
                              : isEmployee
                                ? "bg-blue-100 text-gray-900 rounded-2xl rounded-bl-md border border-blue-200"
                                : styles.bubble;

                          const senderColor =
                            isSent
                              ? "text-blue-700"
                              : styles.sender;

                          const timeColor =
                            isSent
                              ? "text-blue-100"
                              : styles.time;

                          const roleColor =
                            isSent
                              ? "text-blue-600"
                              : styles.role;

                          /*
                           * Prefer actual senderName.
                           * If old messages contain the
                           * employee ID as senderName,
                           * show it as fallback.
                           */
                          const displayName =
                            item.senderName ||
                            item.employeeId ||
                            "User";

                          return (

                            <div
                              key={item._id}
                              className={`flex w-full ${alignment}`}
                            >

                              <div
                                className={`flex max-w-[90%] flex-col sm:max-w-[70%] ${
                                  isSent
                                    ? "items-end"
                                    : "items-start"
                                }`}
                              >

                                {/* SENDER NAME */}

                                <div
                                  className={`mb-1 px-2 text-[11px] font-bold ${senderColor}`}
                                >
                                  {isSent
                                    ? "You"
                                    : displayName}
                                </div>

                                {/* MESSAGE BUBBLE */}

                                <div
                                  className={`relative px-4 py-2.5 text-sm shadow-sm ${bubbleClass}`}
                                >

                                  <div className="whitespace-pre-wrap break-words leading-6">
                                    {item.message}
                                  </div>

                                  {/* TIME */}

                                  <div className="mt-1 flex items-center justify-end gap-1">

                                    <span
                                      className={`text-[10px] ${timeColor}`}
                                    >
                                      {formatTime(
                                        item.createdAt,
                                      )}
                                    </span>

                                    {/* DOUBLE TICK FOR SENT */}

                                    {isSent && (
                                      <span
                                        className={`text-[11px] ${styles.tick}`}
                                      >
                                        ✓✓
                                      </span>
                                    )}

                                  </div>

                                </div>

                                {/* ROLE */}

                                <div
                                  className={`mt-1 px-2 text-[10px] font-medium ${roleColor}`}
                                >
                                  {getRoleLabel(
                                    item.senderRole,
                                  )}
                                </div>

                              </div>

                            </div>

                          );
                        },
                      )}

                    </div>

                  </div>

                ),
              )}

              <div ref={messagesEndRef} />

            </div>

          )}

        </div>

        {/* ===================================================
            MESSAGE INPUT
        =================================================== */}

        <div className="border-t border-gray-200 bg-white p-4 sm:p-5">

          <div className="flex items-end gap-3">

            <div className="flex-1">

              <textarea
                id="ticket-message"
                rows={2}
                value={messageText}
                onChange={(event) =>
                  setMessageText(
                    event.target.value,
                  )
                }
                onKeyDown={
                  handleMessageKeyDown
                }
                placeholder="Type a message..."
                maxLength={5000}
                disabled={
                  sendMessage.isPending
                }
                className="w-full resize-none rounded-2xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
              />

              <div className="mt-1 flex justify-between px-2">

                <p className="text-[11px] text-gray-400">
                  Enter to send · Shift + Enter
                  for new line
                </p>

                <p
                  className={`text-[11px] ${
                    messageText.length >= 4800
                      ? "font-semibold text-red-500"
                      : "text-gray-400"
                  }`}
                >
                  {messageText.length}/5000
                </p>

              </div>

            </div>

            <button
              type="button"
              onClick={handleSendMessage}
              disabled={
                sendMessage.isPending ||
                !messageText.trim()
              }
              title="Send Message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={18} />
            </button>

          </div>

        </div>

      </div>

      {/* =====================================================
          ATTACHMENT
      ===================================================== */}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">

        <div className="border-b border-gray-200 px-6 py-5">

          <h2 className="text-lg font-semibold text-gray-900">
            Attachment
          </h2>

        </div>

        <div className="p-6">

          {attachmentUrl ? (

            <a
              href={attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
            >
              <FileText size={20} />

              <span>
                View Attachment
              </span>

              <ExternalLink size={16} />
            </a>

          ) : (

            <p className="text-sm text-gray-500">
              No attachment uploaded.
            </p>

          )}

        </div>

      </div>

    </div>
  );
}