import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  Megaphone,
  Plus,
  Pin,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Pencil,
  Trash2,
  ChevronDown,
  X,
} from "lucide-react";

import { AnnouncementsApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { TextField, TextareaField } from "@/components/ui/Field";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";

import type { Announcement as BaseAnnouncement } from "@/types";

/* Backend announcement fields used by this page.
   Keep these optional so this page remains compatible with the existing
   shared frontend Announcement type while the backend exposes the newer fields. */
type Announcement = BaseAnnouncement & {
  status?: "DRAFT" | "SCHEDULED" | "PUBLISHED" | string;
  channels?: string[];
  showBanner?: boolean;
  requiresAcknowledgement?: boolean;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  departments?: string[];
  locations?: string[];
  targetRoles?: string[];
  calendarEnabled?: boolean;
  eventStartAt?: string;
  eventEndAt?: string;
  eventLocation?: string;
};

import { formatDate, timeAgo } from "@/lib/format";

/* =========================================================
   ADMIN ROLES
========================================================= */

const ADMIN_ROLES = ["SUPER_ADMIN", "HR_ADMIN"] as const;

/* =========================================================
   ANNOUNCEMENT TYPES
========================================================= */

const ANNOUNCEMENT_TYPE_OPTIONS = [
  {
    value: "HOLIDAY_NOTICE",
    label: "Holiday Notice",
  },
  {
    value: "COMPANY_EVENT",
    label: "Company Event",
  },
  {
    value: "POLICY_UPDATE",
    label: "Policy Update",
  },
  {
    value: "EMPLOYEE_RECOGNITION",
    label: "Employee Recognition",
  },
  {
    value: "MEETING_NOTICE",
    label: "Meeting Notice",
  },
  {
    value: "BENEFITS_UPDATE",
    label: "Benefits Update",
  },
  {
    value: "TRAINING_LD",
    label: "Training & L&D",
  },
  {
    value: "GENERAL_NOTICE",
    label: "General Notice",
  },
] as const;

/* =========================================================
   AUDIENCE
========================================================= */

const AUDIENCE_OPTIONS = [
  {
    value: "ALL",
    label: "All Employees",
  },
  {
    value: "HR_ADMIN",
    label: "HR",
  },
  {
    value: "FINANCE",
    label: "Finance / Payroll",
  },
  {
    value: "MANAGER",
    label: "Managers",
  },
  {
    value: "RECRUITER",
    label: "Recruitment",
  },
  {
    value: "IT_SUPPORT",
    label: "IT Support",
  },
  {
    value: "EMPLOYEE",
    label: "Employees",
  },
] as const;

/* =========================================================
   FORM
========================================================= */

interface AnnouncementStatusEntryLocal {
  id?: string;
  employeeId?: string;
  employeeName?: string;
  employeeEmail?: string;
  employeeFullName?: string;
  departmentName?: string;
  department?: string;
  role?: string;
  employeeRole?: string;
  isRead?: boolean;
  read?: boolean;
  hasRead?: boolean;
  readAt?: string | null;
}

interface AnnouncementForm {
  title: string;
  body: string;
  type: string;
  audience: string;
  departments: string;
  locations: string;
  targetRoles: string;
  pinned: boolean;
  notificationMethods: string[];
  publishMode: "NOW" | "SCHEDULED";
  scheduledDate: string;
  scheduledTime: string;
  requiresAcknowledgement: boolean;
  calendarEnabled: boolean;
  eventStartAt: string;
  eventEndAt: string;
  eventLocation: string;
  attachment?: FileList;
}

/* =========================================================
   HELPERS
========================================================= */

function getAudienceLabel(audience: string) {
  const found = AUDIENCE_OPTIONS.find((option) => option.value === audience);

  return found?.label || audience;
}

function getTypeLabel(type?: string) {
  const found = ANNOUNCEMENT_TYPE_OPTIONS.find(
    (option) => option.value === type,
  );

  return found?.label || type || "General Notice";
}

function getAttachmentUrl(attachment?: string) {
  if (!attachment) {
    return "";
  }

  if (attachment.startsWith("http://") || attachment.startsWith("https://")) {
    return attachment;
  }

  if (attachment.startsWith("/")) {
    return attachment;
  }

  return `/${attachment.replace(/^\/+/, "")}`;
}

function isImageAttachment(attachment?: string) {
  if (!attachment) {
    return false;
  }

  return /\.(png|jpe?g|webp)$/i.test(attachment);
}

/* =========================================================
   TARGETING OPTIONS
========================================================= */

const DEPARTMENT_OPTIONS = [
  "Engineering",
  "Sales",
  "Product",
  "Design",
  "Marketing",
  "Customer Success",
  "IT & Security",
  "Finance",
  "Human Resources",
  "Operations",
];

const LOCATION_OPTIONS = [
  "Hyderabad",
  "Bengaluru",
  "Chennai",
  "Mumbai",
  "Pune",
  "Delhi",
  "Kolkata",
  "Ahmedabad",
  "Noida",
];

const ROLE_OPTIONS = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "FINANCE",
  "MANAGER",
  "RECRUITER",
  "IT_SUPPORT",
  "EMPLOYEE",
];

const ANNOUNCEMENT_CHANNELS = [
  "IN_APP",
  "EMAIL",
  "BANNER",
  "CALENDAR",
] as const;

function normalizeChannels(values?: string[]) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => String(value).trim().toUpperCase())
        .filter((value): value is (typeof ANNOUNCEMENT_CHANNELS)[number] =>
          ANNOUNCEMENT_CHANNELS.includes(
            value as (typeof ANNOUNCEMENT_CHANNELS)[number],
          ),
        ),
    ),
  );
}

function csvToArray(value?: string) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToCsv(value?: string[]) {
  return (value ?? []).join(", ");
}

function todayLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function localTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(11, 16);
}

function scheduledTimeMin(dateValue?: string) {
  if (!dateValue || dateValue !== todayLocalDate()) {
    return undefined;
  }

  return localTimeValue();
}

function formatEventRange(start?: string, end?: string) {
  if (!start) return "";

  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return "";

  const endDate = end ? new Date(end) : null;
  const dateOptions: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };

  const startDateText = startDate.toLocaleDateString(undefined, dateOptions);
  const startTimeText = startDate.toLocaleTimeString(undefined, timeOptions);

  if (!endDate || Number.isNaN(endDate.getTime())) {
    return `${startDateText} · ${startTimeText}`;
  }

  const endDateText = endDate.toLocaleDateString(undefined, dateOptions);
  const endTimeText = endDate.toLocaleTimeString(undefined, timeOptions);

  if (startDateText === endDateText) {
    return `${startDateText} · ${startTimeText} – ${endTimeText}`;
  }

  return `${startDateText} ${startTimeText} – ${endDateText} ${endTimeText}`;
}

function MultiSelectCategory({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: string[];
  value: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((item) => item !== option));
    } else {
      onChange([...value, option]);
    }
    // Close after every selection so the form stays compact.
    setOpen(false);
  };

  const clear = () => {
    onChange([]);
    setOpen(false);
  };

  const selectAll = () => {
    onChange(Array.from(new Set(options)));
    setOpen(false);
  };

  return (
    <div className="relative">
      <label className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
        <span className="ml-1 text-xs font-normal text-ink-faint">
          (optional)
        </span>
      </label>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-10 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm text-ink outline-none transition hover:border-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        aria-expanded={open}
      >
        <span className={value.length ? "text-ink" : "text-ink-faint"}>
          {value.length
            ? value.length === 1
              ? value[0]
              : `${value.length} selected`
            : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {value.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {value.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700"
            >
              {item}
              <button
                type="button"
                onClick={() => toggle(item)}
                className="rounded-full hover:bg-brand-100"
                aria-label={`Remove ${item}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-[min(18rem,45vh)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lifted">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={selectAll}
              className="text-brand-600 hover:text-brand-700"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={clear}
              className="text-red-500 hover:text-red-600"
            >
              Clear All
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto p-1.5">
            {options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-ink-soft hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={value.includes(option)}
                  onChange={() => toggle(option)}
                  className="rounded accent-brand-500"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>

          <div className="border-t border-gray-100 px-3 py-2 text-[11px] text-ink-faint">
            {value.length} selected
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function Announcements() {
  const { user } = useAuth();

  const isAdmin =
    !!user && ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number]);

  const [createOpen, setCreateOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);

  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<Announcement | null>(null);

  const [statusOpen, setStatusOpen] = useState(false);
  const [statusAnnouncement, setStatusAnnouncement] =
    useState<Announcement | null>(null);

  const queryClient = useQueryClient();

  const { data: announcementStatus, isLoading: isStatusLoading } = useQuery<
    AnnouncementStatusEntryLocal[],
    Error
  >({
    queryKey: ["announcement-status", statusAnnouncement?.id],
    queryFn: () => AnnouncementsApi.status(statusAnnouncement!.id),
    enabled: isAdmin && statusOpen && !!statusAnnouncement,
  });

  /* =======================================================
     MARK READ
  ======================================================= */

  const markReadMutation = useMutation({
    mutationFn: AnnouncementsApi.markRead,

    onSuccess: (_data, announcementId) => {
      queryClient.setQueryData<Announcement[]>(["announcements"], (current) => {
        if (!current) {
          return current;
        }

        return current.map((announcement) => {
          if (announcement.id !== announcementId) {
            return announcement;
          }

          return {
            ...announcement,
            receipt: {
              isRead: true,
              readAt: new Date().toISOString(),
              isAcknowledged: announcement.receipt?.isAcknowledged ?? false,
              acknowledgedAt: announcement.receipt?.acknowledgedAt ?? null,
            },
          };
        });
      });

      void queryClient.invalidateQueries({
        queryKey: ["announcements"],
      });
    },
  });
  /* =======================================================
     ACKNOWLEDGE
  ======================================================= */

  const acknowledgeMutation = useMutation({
    mutationFn: AnnouncementsApi.acknowledge,

    onSuccess: () => {
      void queryClient.refetchQueries({
        queryKey: ["announcements"],
        type: "active",
      });
    },
  });

  /* =======================================================
     UPDATE
  ======================================================= */

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormData }) =>
      AnnouncementsApi.update(id, data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["announcements"],
      });

      setEditOpen(false);
      setSelectedAnnouncement(null);

      window.dispatchEvent(
        new CustomEvent("announcement-toast", {
          detail: "Announcement updated successfully.",
        }),
      );
    },
  });

  /* =======================================================
     DELETE
  ======================================================= */

  const deleteMutation = useMutation({
    mutationFn: AnnouncementsApi.delete,

    onSuccess: () => {
      void queryClient.refetchQueries({
        queryKey: ["announcements"],
        type: "active",
      });
    },
  });

  /* =======================================================
     GET ANNOUNCEMENTS
  ======================================================= */

  const { data, isLoading, isError } = useQuery<Announcement[], Error>({
    queryKey: ["announcements"],

    queryFn: () => AnnouncementsApi.list(),
  });

  /* =======================================================
     ACTIONS
  ======================================================= */

  const handleMarkRead = (id: string) => {
    markReadMutation.mutate(id);
  };

  const handleAcknowledge = (id: string) => {
    acknowledgeMutation.mutate(id);
  };

  const handleViewStatus = (announcement: Announcement) => {
    setStatusAnnouncement(announcement);
    setStatusOpen(true);
  };

  const handleEdit = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setEditOpen(true);
  };

  const handleDelete = (announcement: Announcement) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${announcement.title}"?`,
    );

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(announcement.id);
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Announcements"
        subtitle="Company-wide news and updates."
        action={
          isAdmin ? (
            <Button
              leftIcon={<Plus size={16} />}
              onClick={() => setCreateOpen(true)}
            >
              New announcement
            </Button>
          ) : undefined
        }
      />

      {/* ===================================================
          LOADING
      =================================================== */}

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-3xl" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <div className="p-6 text-sm text-red-600">
            Failed to load announcements.
          </div>
        </Card>
      ) : !data?.length ? (
        <EmptyState icon={Megaphone} title="No announcements yet" />
      ) : (
        <div className="space-y-4">
          {data.map((announcement) => (
            <Card
              key={announcement.id}
              className={
                announcement.pinned ? "border-gold-300 bg-gold-50/40" : ""
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {/* ICON */}

                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Megaphone size={18} />
                  </div>

                  {/* CONTENT */}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-[15px] font-medium text-ink">
                        {announcement.title}
                      </h3>

                      {announcement.pinned && (
                        <Badge tone="gold">
                          <Pin size={11} />
                          Pinned
                        </Badge>
                      )}

                      <Badge>{getTypeLabel(announcement.type)}</Badge>

                      <Badge>{getAudienceLabel(announcement.audience)}</Badge>
                    </div>

                    <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft">
                      {announcement.body}
                    </p>

                    {announcement.eventStartAt && (
                      <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2.5">
                        <p className="text-[12px] font-medium text-brand-700">
                          Calendar event
                        </p>
                        <p className="mt-0.5 text-[12px] text-ink-soft">
                          {formatEventRange(
                            announcement.eventStartAt,
                            announcement.eventEndAt,
                          )}
                        </p>
                        {announcement.eventLocation && (
                          <p className="mt-0.5 text-[12px] text-ink-faint">
                            {announcement.eventLocation}
                          </p>
                        )}
                      </div>
                    )}

                    {announcement.status === "SCHEDULED" &&
                      announcement.scheduledAt && (
                        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
                          <p className="text-[12px] font-medium text-amber-700">
                            Scheduled publish
                          </p>
                          <p className="mt-0.5 text-[12px] text-ink-soft">
                            {formatEventRange(announcement.scheduledAt)}
                          </p>
                        </div>
                      )}

                    {/* ATTACHMENT */}

                    {announcement.attachment && (
                      <div className="mt-4">
                        <a
                          href={getAttachmentUrl(announcement.attachment)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-50"
                        >
                          {isImageAttachment(announcement.attachment) ? (
                            <ImageIcon size={16} />
                          ) : (
                            <FileText size={16} />
                          )}
                          View Attachment
                        </a>
                      </div>
                    )}

                    {/* STATUS */}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge>
                        {announcement.receipt?.isRead ? "Read" : "Unread"}
                      </Badge>

                      {announcement.type === "POLICY_UPDATE" && (
                        <Badge>
                          {announcement.receipt?.isAcknowledged
                            ? "Acknowledged"
                            : "Requires acknowledgement"}
                        </Badge>
                      )}
                    </div>

                    {/* READ TIME */}

                    {announcement.receipt?.readAt && (
                      <p className="mt-2 text-[12px] text-ink-faint">
                        Read {timeAgo(announcement.receipt.readAt)}
                      </p>
                    )}

                    {/* ACKNOWLEDGED TIME */}

                    {announcement.receipt?.acknowledgedAt && (
                      <p className="mt-1 text-[12px] text-ink-faint">
                        Acknowledged{" "}
                        {timeAgo(announcement.receipt.acknowledgedAt)}
                      </p>
                    )}

                    {/* ACTIONS */}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {!announcement.receipt?.isRead && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkRead(announcement.id)}
                          isLoading={markReadMutation.isPending}
                        >
                          Mark as read
                        </Button>
                      )}

                      {announcement.type === "POLICY_UPDATE" &&
                        !announcement.receipt?.isAcknowledged && (
                          <Button
                            onClick={() => handleAcknowledge(announcement.id)}
                            isLoading={acknowledgeMutation.isPending}
                          >
                            Acknowledge
                          </Button>
                        )}

                      {/* ADMIN ACTIONS */}

                      {isAdmin && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewStatus(announcement)}
                          >
                            View read receipts
                          </Button>

                          {announcement.type === "POLICY_UPDATE" &&
                            Boolean(
                              (
                                announcement as unknown as Record<
                                  string,
                                  unknown
                                >
                              ).requiresAcknowledgement,
                            ) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewStatus(announcement)}
                              >
                                View acknowledgements
                              </Button>
                            )}

                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Pencil size={14} />}
                            onClick={() => handleEdit(announcement)}
                          >
                            Edit
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Trash2 size={14} />}
                            onClick={() => handleDelete(announcement)}
                            isLoading={deleteMutation.isPending}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>

                    {/* DATE */}

                    <p className="mt-3 text-[12px] text-ink-faint">
                      {formatDate(announcement.createdAt)} ·{" "}
                      {timeAgo(announcement.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ===================================================
          CREATE MODAL
      =================================================== */}

      {isAdmin && (
        <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      )}

      {/* ===================================================
          READ RECEIPTS MODAL
      =================================================== */}

      {isAdmin && statusAnnouncement && (
        <ReadReceiptsModal
          open={statusOpen}
          announcement={statusAnnouncement}
          status={announcementStatus ?? []}
          isLoading={isStatusLoading}
          onClose={() => {
            setStatusOpen(false);
            setStatusAnnouncement(null);
          }}
        />
      )}

      {/* ===================================================
          EDIT MODAL
      =================================================== */}

      {isAdmin && selectedAnnouncement && (
        <EditModal
          open={editOpen}
          announcement={selectedAnnouncement}
          isLoading={updateMutation.isPending}
          onClose={() => {
            if (!updateMutation.isPending) {
              setEditOpen(false);
              setSelectedAnnouncement(null);
            }
          }}
          onSubmit={(formData: FormData) => {
            updateMutation.mutate({
              id: selectedAnnouncement.id,
              data: formData,
            });
          }}
        />
      )}
    </div>
  );
}

/* =========================================================
   CREATE MODAL
========================================================= */

function CreateModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();

  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AnnouncementForm>({
    defaultValues: {
      title: "",
      body: "",
      type: "GENERAL_NOTICE",
      audience: "ALL",
      departments: "",
      locations: "",
      targetRoles: "",
      pinned: false,
      notificationMethods: ["IN_APP", "EMAIL"],
      publishMode: "NOW",
      scheduledDate: "",
      scheduledTime: "",
      requiresAcknowledgement: false,
      calendarEnabled: false,
      eventStartAt: "",
      eventEndAt: "",
      eventLocation: "",
    },
  });

  const mutation = useMutation({
    mutationFn: AnnouncementsApi.create,

    onSuccess: () => {
      void queryClient.refetchQueries({
        queryKey: ["announcements"],
        type: "active",
      });

      showToast("Announcement published successfully.");

      reset();
      onClose();
    },

    onError: (error) => {
      showToast(getErrorMessage(error), "error");
    },
  });

  const onSubmit = (values: AnnouncementForm) => {
    const title = values.title.trim();
    const body = values.body.trim();

    if (title.length < 3) {
      showToast("Title must contain at least 3 characters.", "error");
      return;
    }

    if (body.length < 5) {
      showToast("Message must contain at least 5 characters.", "error");
      return;
    }

    const formData = new FormData();

    formData.append("title", title);
    formData.append("body", body);
    formData.append("type", values.type);
    formData.append("audience", values.audience);

    const departments = values.departments
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const locations = values.locations
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const targetRoles = values.targetRoles
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    formData.append("departments", JSON.stringify(departments));
    formData.append("locations", JSON.stringify(locations));
    formData.append("targetRoles", JSON.stringify(targetRoles));

    formData.append("pinned", String(values.pinned));

    const channels = normalizeChannels(values.notificationMethods);

    if (!channels.length) {
      showToast("Please select at least one notification method.", "error");
      return;
    }

    formData.append("notificationMethods", JSON.stringify(channels));

    formData.append("channels", JSON.stringify(channels));

    // These are derived by the backend from channels as well.
    // Sending them keeps compatibility with the current API.
    formData.append("showBanner", String(channels.includes("BANNER")));

    formData.append("calendarEnabled", String(channels.includes("CALENDAR")));

    if (channels.includes("CALENDAR")) {
      if (!values.eventStartAt) {
        showToast(
          "Please provide a calendar event start date and time.",
          "error",
        );
        return;
      }

      if (!values.eventEndAt) {
        showToast(
          "Please provide a calendar event end date and time.",
          "error",
        );
        return;
      }

      const eventStart = new Date(values.eventStartAt);
      const eventEnd = new Date(values.eventEndAt);

      if (Number.isNaN(eventStart.getTime())) {
        showToast(
          "Please enter a valid calendar event start date and time.",
          "error",
        );
        return;
      }

      if (Number.isNaN(eventEnd.getTime())) {
        showToast(
          "Please enter a valid calendar event end date and time.",
          "error",
        );
        return;
      }

      if (eventStart.getTime() < Date.now()) {
        showToast(
          "Calendar event start must be today or a future date/time.",
          "error",
        );
        return;
      }

      if (eventEnd.getTime() < eventStart.getTime()) {
        showToast(
          "Calendar event end time must be after the start time.",
          "error",
        );
        return;
      }

      formData.append("eventStartAt", eventStart.toISOString());

      formData.append("eventEndAt", eventEnd.toISOString());

      if (values.eventLocation.trim()) {
        formData.append("eventLocation", values.eventLocation.trim());
      }
    }

    formData.append("publishMode", values.publishMode);

    formData.append(
      "requiresAcknowledgement",
      String(
        values.type === "POLICY_UPDATE"
          ? values.requiresAcknowledgement
          : false,
      ),
    );

    if (values.publishMode === "SCHEDULED") {
      if (!values.scheduledDate || !values.scheduledTime) {
        showToast("Please select a publish date and time.", "error");
        return;
      }

      const scheduledAt = new Date(
        `${values.scheduledDate}T${values.scheduledTime}`,
      );

      if (Number.isNaN(scheduledAt.getTime())) {
        showToast("Please enter a valid scheduled date and time.", "error");
        return;
      }

      if (scheduledAt.getTime() <= Date.now()) {
        showToast("Scheduled publish time must be in the future.", "error");
        return;
      }

      formData.append("scheduledAt", scheduledAt.toISOString());
    }

    const file = values.attachment?.[0];

    if (file) {
      const maxSize = 8 * 1024 * 1024;

      if (file.size > maxSize) {
        showToast("Attachment must be smaller than 8MB.", "error");
        return;
      }

      formData.append("attachment", file);
    }

    mutation.mutate(formData as any);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!mutation.isPending) {
          reset();
          onClose();
        }
      }}
      title="New announcement"
      subtitle="Broadcast company updates to employees."
      size="lg"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>

          <Button
            onClick={handleSubmit(onSubmit)}
            isLoading={mutation.isPending}
          >
            Publish
          </Button>
        </>
      }
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="max-h-[calc(100vh-220px)] space-y-5 overflow-y-auto pr-1 sm:pr-2"
      >
        <TextField
          label="Title"
          required
          placeholder="Enter announcement title"
          error={errors.title?.message}
          {...register("title", {
            required: "Title is required",
            minLength: {
              value: 3,
              message: "Title must contain at least 3 characters",
            },
            maxLength: {
              value: 200,
              message: "Title cannot exceed 200 characters",
            },
          })}
        />

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Announcement Type
            <span className="ml-1 text-red-500">*</span>
          </label>

          <select
            {...register("type", {
              required: "Announcement type is required",
            })}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            {ANNOUNCEMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <TextareaField
          label="Message"
          required
          placeholder="Write the announcement message..."
          error={errors.body?.message}
          {...register("body", {
            required: "Message is required",
            minLength: {
              value: 5,
              message: "Message must contain at least 5 characters",
            },
            maxLength: {
              value: 10000,
              message: "Message cannot exceed 10000 characters",
            },
          })}
        />

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Audience
            <span className="ml-1 text-red-500">*</span>
          </label>

          <select
            {...register("audience", {
              required: "Audience is required",
            })}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            {AUDIENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <p className="mt-1 text-xs text-ink-faint">
            Choose who should receive this announcement.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <div>
            <p className="text-[13px] font-medium text-ink">Targeting</p>
            <p className="mt-0.5 text-xs text-ink-faint">
              Optionally target specific departments, locations, or roles. Leave
              blank to use the selected audience.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MultiSelectCategory
              label="Departments"
              placeholder="Select departments"
              options={DEPARTMENT_OPTIONS}
              value={csvToArray(watch("departments"))}
              onChange={(values) =>
                setValue("departments", arrayToCsv(values), {
                  shouldDirty: true,
                })
              }
            />

            <MultiSelectCategory
              label="Locations"
              placeholder="Select locations"
              options={LOCATION_OPTIONS}
              value={csvToArray(watch("locations"))}
              onChange={(values) =>
                setValue("locations", arrayToCsv(values), {
                  shouldDirty: true,
                })
              }
            />

            <MultiSelectCategory
              label="Target Roles"
              placeholder="Select roles"
              options={ROLE_OPTIONS}
              value={csvToArray(watch("targetRoles"))}
              onChange={(values) =>
                setValue("targetRoles", arrayToCsv(values), {
                  shouldDirty: true,
                })
              }
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Notification Method
          </label>

          <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
            {[
              [
                "IN_APP",
                "In-App Notification",
                "Instant alert inside the HRMS.",
              ],
              [
                "EMAIL",
                "Email Broadcast",
                "Send to employee registered email.",
              ],
              [
                "BANNER",
                "Dashboard Banner",
                "Show prominently on the employee dashboard.",
              ],
              [
                "CALENDAR",
                "Calendar",
                "Add meeting/event details to the employee calendar.",
              ],
            ].map(([value, label, description]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-3 text-[13px] text-ink-soft"
              >
                <input
                  type="checkbox"
                  value={value}
                  {...register("notificationMethods")}
                  className="rounded accent-brand-500"
                />

                <span>
                  <span className="font-medium text-ink">{label}</span>

                  <span className="ml-1 text-ink-faint">{description}</span>
                </span>
              </label>
            ))}
          </div>

          <p className="mt-1 text-xs text-ink-faint">
            Select one or more notification channels.
          </p>
        </div>

        {watch("notificationMethods")?.includes("CALENDAR") && (
          <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div>
              <p className="text-[13px] font-medium text-ink">Calendar event</p>
              <p className="mt-0.5 text-xs text-ink-faint">
                Add meeting or company-event details to the employee calendar.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Event Start"
                type="datetime-local"
                min={localDateTimeValue()}
                {...register("eventStartAt")}
              />

              <TextField
                label="Event End"
                type="datetime-local"
                min={watch("eventStartAt") || localDateTimeValue()}
                {...register("eventEndAt")}
              />
            </div>

            <TextField
              label="Event Location"
              placeholder="Conference room, office, or meeting link"
              {...register("eventLocation")}
            />
          </div>
        )}

        {watch("type") === "POLICY_UPDATE" && (
          <div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
              <input
                type="checkbox"
                {...register("requiresAcknowledgement")}
                className="mt-0.5 rounded accent-brand-500"
              />

              <span>
                <span className="block text-[13px] font-medium text-ink">
                  Require employee acknowledgement
                </span>

                <span className="mt-0.5 block text-xs text-ink-faint">
                  Employees must acknowledge this policy update.
                </span>
              </span>
            </label>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Publishing
          </label>

          <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
            <label className="flex cursor-pointer items-center gap-3 text-[13px] text-ink-soft">
              <input
                type="radio"
                value="NOW"
                {...register("publishMode")}
                className="accent-brand-500"
              />

              <span>
                <span className="font-medium text-ink">Publish Now</span>

                <span className="ml-1 text-ink-faint">
                  Publish the announcement immediately.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-center gap-3 text-[13px] text-ink-soft">
              <input
                type="radio"
                value="SCHEDULED"
                {...register("publishMode")}
                className="accent-brand-500"
              />

              <span>
                <span className="font-medium text-ink">Schedule for Later</span>

                <span className="ml-1 text-ink-faint">
                  Publish automatically at the selected time.
                </span>
              </span>
            </label>
          </div>
        </div>

        {watch("publishMode") === "SCHEDULED" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 sm:grid-cols-2">
            <TextField
              label="Publish Date"
              type="date"
              min={todayLocalDate()}
              {...register("scheduledDate")}
            />

            <TextField
              label="Publish Time"
              type="time"
              min={scheduledTimeMin(watch("scheduledDate"))}
              {...register("scheduledTime")}
            />

            <p className="sm:col-span-2 text-xs text-ink-faint">
              Past dates are disabled. Scheduled publishing must be in the
              future.
            </p>
          </div>
        )}

        <AttachmentField register={register} />

        <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-[13px] text-ink-soft">
          <input
            type="checkbox"
            {...register("pinned")}
            className="rounded accent-brand-500"
          />

          <span>
            <span className="font-medium text-ink">Pin to top</span>

            <span className="ml-1 text-ink-faint">
              Keep this announcement highlighted.
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}

/* =========================================================
   READ RECEIPTS MODAL
========================================================= */

function ReadReceiptsModal({
  open,
  announcement,
  status,
  isLoading,
  onClose,
}: {
  open: boolean;
  announcement: Announcement;
  status: AnnouncementStatusEntryLocal[];
  isLoading: boolean;
  onClose: () => void;
}) {
  const getValue = (entry: AnnouncementStatusEntryLocal, keys: string[]) => {
    const record = entry as unknown as Record<string, unknown>;

    for (const key of keys) {
      const value = record[key];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }

    return undefined;
  };

  const readCount = status.filter((entry) => {
    const value = getValue(entry, ["isRead", "read", "hasRead"]);

    return value === true || value === "true";
  }).length;

  const totalCount = status.length;
  const readPercentage =
    totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

  const acknowledgementCount = status.filter((entry) => {
    const record = entry as unknown as Record<string, unknown>;
    const value =
      record["acknowledged"] ??
      record["isAcknowledged"] ??
      record["hasAcknowledged"];

    return value === true || value === "true";
  }).length;

  const requiresAcknowledgement = Boolean(
    (announcement as unknown as Record<string, unknown>)
      .requiresAcknowledgement,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Read receipts"
      subtitle={`Track who has read "${announcement.title}".`}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {isLoading ? (
        <div className="py-8 text-center text-sm text-ink-faint">
          Loading read receipts...
        </div>
      ) : (
        <div className="space-y-5">
          <div
            className={
              requiresAcknowledgement
                ? "grid grid-cols-2 gap-3 sm:grid-cols-4"
                : "grid grid-cols-3 gap-3"
            }
          >
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-ink-faint">Total recipients</p>
              <p className="mt-1 text-xl font-semibold text-ink">
                {totalCount}
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-ink-faint">Read</p>
              <p className="mt-1 text-xl font-semibold text-ink">{readCount}</p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-ink-faint">Read rate</p>
              <p className="mt-1 text-xl font-semibold text-ink">
                {readPercentage}%
              </p>
            </div>

            {requiresAcknowledgement && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs text-ink-faint">Acknowledged</p>
                <p className="mt-1 text-xl font-semibold text-ink">
                  {acknowledgementCount}
                </p>
              </div>
            )}
          </div>

          {!status.length ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-ink-faint">
              No read receipt records are available yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-gray-50 text-xs text-ink-faint">
                  <tr>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Read At</th>
                    {requiresAcknowledgement && (
                      <th className="px-4 py-3 font-medium">Acknowledgement</th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {status.map((entry, index) => {
                    const name = getValue(entry, [
                      "employeeName",
                      "name",
                      "employeeFullName",
                    ]);

                    const email = getValue(entry, ["employeeEmail", "email"]);

                    const department = getValue(entry, [
                      "departmentName",
                      "department",
                    ]);

                    const role = getValue(entry, ["role", "employeeRole"]);

                    const isReadValue = getValue(entry, [
                      "isRead",
                      "read",
                      "hasRead",
                    ]);

                    const isRead =
                      isReadValue === true || isReadValue === "true";

                    const readAt = getValue(entry, ["readAt", "read_at"]);

                    const acknowledgementValue = getValue(entry, [
                      "acknowledged",
                      "isAcknowledged",
                      "hasAcknowledged",
                    ]);

                    const isAcknowledged =
                      acknowledgementValue === true ||
                      acknowledgementValue === "true";

                    return (
                      <tr key={`${String(name ?? email ?? "entry")}-${index}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">
                            {String(name ?? "Employee")}
                          </div>

                          {email && (
                            <div className="mt-0.5 text-xs text-ink-faint">
                              {String(email)}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-ink-soft">
                          {String(department ?? "—")}
                        </td>

                        <td className="px-4 py-3 text-ink-soft">
                          {String(role ?? "—")}
                        </td>

                        <td className="px-4 py-3">
                          <Badge
                            className={
                              isRead ? "text-emerald-600" : "text-ink-faint"
                            }
                          >
                            {isRead ? "Read" : "Unread"}
                          </Badge>
                        </td>

                        <td className="px-4 py-3 text-ink-faint">
                          {readAt ? formatDate(String(readAt)) : "—"}
                        </td>

                        {requiresAcknowledgement && (
                          <td className="px-4 py-3">
                            <Badge
                              className={
                                isAcknowledged
                                  ? "text-emerald-600"
                                  : "text-ink-faint"
                              }
                            >
                              {isAcknowledged ? "Acknowledged" : "Pending"}
                            </Badge>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* =========================================================
   EDIT MODAL
========================================================= */
function EditModal({
  open,
  announcement,
  isLoading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  announcement: Announcement;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AnnouncementForm>();

  useEffect(() => {
    if (!open || !announcement) {
      return;
    }

    reset({
      title: announcement.title ?? "",
      body: announcement.body ?? "",
      type: announcement.type ?? "GENERAL_NOTICE",
      audience: announcement.audience ?? "ALL",
      departments: announcement.departments?.join(", ") ?? "",
      locations: announcement.locations?.join(", ") ?? "",
      targetRoles: announcement.targetRoles?.join(", ") ?? "",
      pinned: Boolean(announcement.pinned),
      notificationMethods: normalizeChannels(announcement.channels).length
        ? normalizeChannels(announcement.channels)
        : ["IN_APP"],
      publishMode: announcement.status === "SCHEDULED" ? "SCHEDULED" : "NOW",
      scheduledDate: announcement.scheduledAt
        ? new Date(announcement.scheduledAt).toISOString().slice(0, 10)
        : "",
      scheduledTime: announcement.scheduledAt
        ? new Date(announcement.scheduledAt).toISOString().slice(11, 16)
        : "",
      requiresAcknowledgement: Boolean(announcement.requiresAcknowledgement),
      calendarEnabled: Boolean(announcement.calendarEnabled),
      eventStartAt: announcement.eventStartAt
        ? new Date(announcement.eventStartAt).toISOString().slice(0, 16)
        : "",
      eventEndAt: announcement.eventEndAt
        ? new Date(announcement.eventEndAt).toISOString().slice(0, 16)
        : "",
      eventLocation: announcement.eventLocation ?? "",
      attachment: undefined,
    });
  }, [open, announcement, reset]);

  const submit = (data: AnnouncementForm) => {
    const formData = new FormData();

    formData.append("title", data.title.trim());
    formData.append("body", data.body.trim());
    formData.append("type", data.type);
    formData.append("audience", data.audience);

    const departments = data.departments
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const locations = data.locations
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const targetRoles = data.targetRoles
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    formData.append("departments", JSON.stringify(departments));
    formData.append("locations", JSON.stringify(locations));
    formData.append("targetRoles", JSON.stringify(targetRoles));
    formData.append("pinned", String(data.pinned ?? false));

    const channels = normalizeChannels(data.notificationMethods);

    if (!channels.length) {
      throw new Error("Please select at least one notification method.");
    }

    formData.append("notificationMethods", JSON.stringify(channels));
    formData.append("channels", JSON.stringify(channels));
    formData.append("showBanner", String(channels.includes("BANNER")));
    formData.append("calendarEnabled", String(channels.includes("CALENDAR")));

    formData.append(
      "requiresAcknowledgement",
      String(
        data.type === "POLICY_UPDATE"
          ? Boolean(data.requiresAcknowledgement)
          : false,
      ),
    );

    if (data.publishMode === "SCHEDULED") {
      if (!data.scheduledDate || !data.scheduledTime) {
        throw new Error("Please select a publish date and time.");
      }

      const scheduledAt = new Date(
        `${data.scheduledDate}T${data.scheduledTime}`,
      );

      if (
        Number.isNaN(scheduledAt.getTime()) ||
        scheduledAt.getTime() <= Date.now()
      ) {
        throw new Error("Scheduled publish time must be in the future.");
      }

      formData.append("scheduledAt", scheduledAt.toISOString());
      formData.append("publishMode", "SCHEDULED");
    } else {
      formData.append("publishMode", "NOW");
    }

    if (channels.includes("CALENDAR")) {
      if (!data.eventStartAt) {
        throw new Error("Please provide a calendar event start date and time.");
      }

      if (!data.eventEndAt) {
        throw new Error("Please provide a calendar event end date and time.");
      }

      const eventStart = new Date(data.eventStartAt);
      const eventEnd = new Date(data.eventEndAt);

      if (Number.isNaN(eventStart.getTime())) {
        throw new Error(
          "Please enter a valid calendar event start date and time.",
        );
      }

      if (Number.isNaN(eventEnd.getTime())) {
        throw new Error(
          "Please enter a valid calendar event end date and time.",
        );
      }

      if (eventStart.getTime() < Date.now()) {
        throw new Error(
          "Calendar event start must be today or a future date/time.",
        );
      }

      if (eventEnd.getTime() < eventStart.getTime()) {
        throw new Error(
          "Calendar event end time must be after the start time.",
        );
      }

      formData.append("eventStartAt", eventStart.toISOString());

      formData.append("eventEndAt", eventEnd.toISOString());

      if (data.eventLocation?.trim()) {
        formData.append("eventLocation", data.eventLocation.trim());
      }
    }

    const files = data.attachment as FileList | undefined;

    if (files && files.length > 0) {
      formData.append("attachment", files[0]);
    }

    onSubmit(formData);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit announcement"
      subtitle="Update the announcement details."
      size="lg"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            isLoading={isLoading}
            form="edit-announcement-form"
          >
            Save changes
          </Button>
        </>
      }
    >
      <form
        id="edit-announcement-form"
        className="max-h-[calc(100vh-220px)] space-y-5 overflow-y-auto pr-1 sm:pr-2"
        onSubmit={handleSubmit(submit)}
      >
        <TextField
          label="Title"
          required
          placeholder="Enter announcement title"
          error={errors.title?.message}
          {...register("title", {
            required: "Title is required",
            minLength: {
              value: 3,
              message: "Title must contain at least 3 characters",
            },
            maxLength: {
              value: 200,
              message: "Title cannot exceed 200 characters",
            },
          })}
        />

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Announcement Type
            <span className="ml-1 text-red-500">*</span>
          </label>

          <select
            {...register("type", {
              required: "Announcement type is required",
            })}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            {ANNOUNCEMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {errors.type?.message && (
            <p className="mt-1 text-xs text-red-500">{errors.type.message}</p>
          )}
        </div>

        <TextareaField
          label="Message"
          required
          placeholder="Write the announcement message..."
          error={errors.body?.message}
          {...register("body", {
            required: "Message is required",
            minLength: {
              value: 5,
              message: "Message must contain at least 5 characters",
            },
            maxLength: {
              value: 10000,
              message: "Message cannot exceed 10000 characters",
            },
          })}
        />

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Audience
            <span className="ml-1 text-red-500">*</span>
          </label>

          <select
            {...register("audience", {
              required: "Audience is required",
            })}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            {AUDIENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {errors.audience?.message && (
            <p className="mt-1 text-xs text-red-500">
              {errors.audience.message}
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <div>
            <p className="text-[13px] font-medium text-ink">Targeting</p>
            <p className="mt-0.5 text-xs text-ink-faint">
              Select optional categories to restrict recipients. Leave all three
              blank to use the selected audience only.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MultiSelectCategory
              label="Departments"
              placeholder="Select departments"
              options={DEPARTMENT_OPTIONS}
              value={csvToArray(watch("departments"))}
              onChange={(values) =>
                setValue("departments", arrayToCsv(values), {
                  shouldDirty: true,
                })
              }
            />

            <MultiSelectCategory
              label="Locations"
              placeholder="Select locations"
              options={LOCATION_OPTIONS}
              value={csvToArray(watch("locations"))}
              onChange={(values) =>
                setValue("locations", arrayToCsv(values), {
                  shouldDirty: true,
                })
              }
            />

            <MultiSelectCategory
              label="Target Roles"
              placeholder="Select roles"
              options={ROLE_OPTIONS}
              value={csvToArray(watch("targetRoles"))}
              onChange={(values) =>
                setValue("targetRoles", arrayToCsv(values), {
                  shouldDirty: true,
                })
              }
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Notification Method
          </label>
          <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
            {[
              [
                "IN_APP",
                "In-App Notification",
                "Instant alert inside the HRMS.",
              ],
              [
                "EMAIL",
                "Email Broadcast",
                "Send to employee registered email.",
              ],
              [
                "BANNER",
                "Dashboard Banner",
                "Show prominently on the employee dashboard.",
              ],
              [
                "CALENDAR",
                "Calendar",
                "Add meeting/event details to the employee calendar.",
              ],
            ].map(([value, label, description]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-3 text-[13px] text-ink-soft"
              >
                <input
                  type="checkbox"
                  value={value}
                  {...register("notificationMethods")}
                  className="rounded accent-brand-500"
                />
                <span>
                  <span className="font-medium text-ink">{label}</span>
                  <span className="ml-1 text-ink-faint">{description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {watch("notificationMethods")?.includes("CALENDAR") && (
          <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div>
              <p className="text-[13px] font-medium text-ink">Calendar event</p>
              <p className="mt-0.5 text-xs text-ink-faint">
                Event date and time will be shown on the announcement.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Event Start"
                type="datetime-local"
                min={localDateTimeValue()}
                {...register("eventStartAt")}
              />
              <TextField
                label="Event End"
                type="datetime-local"
                min={watch("eventStartAt") || localDateTimeValue()}
                {...register("eventEndAt")}
              />
            </div>
            <TextField
              label="Event Location"
              placeholder="Conference room, office, or meeting link"
              {...register("eventLocation")}
            />
          </div>
        )}

        {watch("publishMode") === "SCHEDULED" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 sm:grid-cols-2">
            <TextField
              label="Publish Date"
              type="date"
              min={todayLocalDate()}
              {...register("scheduledDate")}
            />
            <TextField
              label="Publish Time"
              type="time"
              min={scheduledTimeMin(watch("scheduledDate"))}
              {...register("scheduledTime")}
            />
          </div>
        )}

        <AttachmentField register={register} />

        {announcement.attachment && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-ink-faint">Current attachment</p>

            <a
              href={getAttachmentUrl(announcement.attachment)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline"
            >
              {isImageAttachment(announcement.attachment) ? (
                <ImageIcon size={15} />
              ) : (
                <FileText size={15} />
              )}
              View current attachment
            </a>
          </div>
        )}

        <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-[13px] text-ink-soft">
          <input
            type="checkbox"
            {...register("pinned")}
            className="rounded accent-brand-500"
          />

          <span>
            <span className="font-medium text-ink">Pin to top</span>

            <span className="ml-1 text-ink-faint">
              Keep this announcement highlighted.
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}

/* =========================================================
   ATTACHMENT FIELD
========================================================= */

function AttachmentField({
  register,
}: {
  register: ReturnType<typeof useForm<AnnouncementForm>>["register"];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-ink">
        Attachment{" "}
        <span className="font-normal text-ink-faint">(Optional)</span>
      </label>

      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-ink-soft transition hover:border-brand-400 hover:bg-brand-50">
        <Paperclip size={16} />

        <span>Choose PDF, Word document, or image</span>

        <input
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
          {...register("attachment")}
          className="hidden"
        />
      </label>

      <p className="mt-1 text-xs text-ink-faint">
        Optional · Maximum file size: 8MB
      </p>
    </div>
  );
}
