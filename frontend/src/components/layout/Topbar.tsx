import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  useQuery,
  useQueryClient,
  useMutation,
} from "@tanstack/react-query";
import {
  Menu,
  Bell,
  LogOut,
  Settings,
  UserCircle2,
  Clock,
  Check,
  TicketPlus,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import {
  NotificationsApi,
  AttendanceApi,
} from "@/lib/endpoints";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextareaField } from "@/components/ui/Field";
import { timeAgo, cx } from "@/lib/format";
import { getErrorMessage } from "@/lib/api";
export function Topbar({
  onOpenMobileNav,
  onRaiseTicket,
}: {
  onOpenMobileNav: () => void;
  onRaiseTicket: () => void;
}) {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const isMyTicketsPage = location.pathname === "/app/my-tickets";
  const queryClient = useQueryClient();

  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [lateCheckInOpen, setLateCheckInOpen] = useState(false);
  const [earlyDepartureOpen, setEarlyDepartureOpen] =
    useState(false);

  const [lateCheckInReason, setLateCheckInReason] = useState("");
  const [earlyDepartureReason, setEarlyDepartureReason] =
    useState("");
  const getCurrentLocation = () =>
    new Promise<{
      latitude: number;
      longitude: number;
      accuracy?: number;
    }>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(
          new Error(
            "Geolocation is not supported by this browser.",
          ),
        );
        return;
      }

      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          resolve({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: Number.isFinite(coords.accuracy)
              ? coords.accuracy
              : undefined,
          }),
        () =>
          reject(
            new Error(
              "Unable to get your location. Please allow location access and try again.",
            ),
          ),
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        },
      );
    });

  /*
   * Notification read state is user-specific and role-neutral.
   * Support common backend field names so every role gets the
   * same Read / Mark as read behavior.
   */
  const isNotificationRead = (notification: any) =>
    Boolean(
      notification?.isRead ??
      notification?.read ??
      notification?.readAt,
    );

  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  /* =========================================================
     CLOSE DROPDOWNS WHEN CLICKING OUTSIDE
  ========================================================= */

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;

      if (
        notifRef.current &&
        !notifRef.current.contains(target)
      ) {
        setNotifOpen(false);
      }

      if (
        userRef.current &&
        !userRef.current.contains(target)
      ) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleClick,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClick,
      );
    };
  }, []);

  /* =========================================================
     NOTIFICATIONS

     IMPORTANT:
     - Refresh every 5 seconds
     - Refetch immediately when tab/window becomes active
     - Refetch when notification dropdown opens
     - Do not wait 30/60 seconds
  ========================================================= */

  const {
    data: notifData,
    isFetching: isNotificationsFetching,
  } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => NotificationsApi.list(),

    /*
     * New announcements should appear quickly.
     */
    refetchInterval: 5000,

    /*
     * Always consider notification data refreshable.
     */
    staleTime: 0,

    /*
     * Immediately refresh when user returns to the browser.
     */
    refetchOnWindowFocus: true,

    /*
     * Refresh when network connection comes back.
     */
    refetchOnReconnect: true,

    /*
     * Keep polling even when the dropdown is closed.
     */
    refetchIntervalInBackground: true,
  });

  /*
   * If the notification dropdown is opened, immediately
   * request the latest notification list instead of waiting
   * for the 5-second polling interval.
   */
  useEffect(() => {
    if (!notifOpen) {
      return;
    }

    queryClient.refetchQueries({
      queryKey: ["notifications"],
      type: "active",
    });
  }, [notifOpen, queryClient]);

  /* =========================================================
     ATTENDANCE
  ========================================================= */

  const attendanceUserId = user?.employee?.id ?? user?.id ?? "anonymous";

  const { data: todayAttendance } = useQuery({
    queryKey: ["attendance", "today", attendanceUserId],
    queryFn: () => AttendanceApi.today(),
    enabled: !!user?.employee,
  });

  /* =========================================================
     CHECK IN
  ========================================================= */
  const checkInMutation = useMutation({
    mutationFn: async (reason?: string) => {
      const location = await getCurrentLocation();
      return AttendanceApi.checkInWithLocation({
        ...location,
        ...(reason?.trim() ? { lateCheckInReason: reason.trim() } : {}),
      });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["attendance", "today", attendanceUserId],
      });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setLateCheckInOpen(false);
      setLateCheckInReason("");

      showToast(
        "Checked in. Have a great day!",
      );
    },

    onError: (err) => {
      const message = getErrorMessage(err);

      if (message === "A reason is required for late check-in.") {
        setLateCheckInReason("");
        setLateCheckInOpen(true);
        showToast(message, "error");
        return;
      }

      showToast(message, "error");
    },
  });

  /* =========================================================
   CHECK OUT
========================================================= */

  const checkOutMutation = useMutation({
    mutationFn: async (reason?: string) => {
      const location = await getCurrentLocation();

      return AttendanceApi.checkOutWithOptions({
        ...location,
        ...(reason?.trim()
          ? { earlyDepartureReason: reason.trim() }
          : {}),
      });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["attendance", "today", attendanceUserId],
      });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });

      setEarlyDepartureOpen(false);
      setEarlyDepartureReason("");

      showToast("Checked out. See you tomorrow!");
    },

    onError: (error) => {
      const message = getErrorMessage(error);

      if (
        message ===
        "A reason is required for early departure."
      ) {
        showToast(message, "error");
        setEarlyDepartureReason("");
        setEarlyDepartureOpen(true);
        return;
      }

      showToast(message, "error");
    },
  });

  /* =========================================================
     MARK ALL NOTIFICATIONS READ
  ========================================================= */

  const markAllRead = async () => {
    try {
      queryClient.setQueryData(
        ["notifications"],
        (current: any) => {
          if (!current) {
            return current;
          }

          const notifications =
            current.notifications?.map(
              (notification: any) => ({
                ...notification,
                isRead: true,
                read: true,
              }),
            ) ?? [];

          return {
            ...current,
            notifications,
            unreadCount: 0,
          };
        },
      );

      await NotificationsApi.markAllRead();

      await queryClient.refetchQueries({
        queryKey: ["notifications"],
        type: "active",
      });
    } catch (error) {
      await queryClient.refetchQueries({
        queryKey: ["notifications"],
        type: "active",
      });

      showToast(
        getErrorMessage(error),
        "error",
      );
    }
  };


  /* =========================================================
     MARK SINGLE NOTIFICATION READ
  ========================================================= */

  const markNotificationRead = async (id: string) => {
    try {
      await NotificationsApi.markRead(id);

      // Always confirm the persisted server state before updating the UI.
      await queryClient.refetchQueries({
        queryKey: ["notifications"],
        type: "active",
      });
    } catch (error) {
      // Keep the UI aligned with the server if the write fails.
      await queryClient.refetchQueries({
        queryKey: ["notifications"],
        type: "active",
      });

      showToast(
        getErrorMessage(error),
        "error",
      );
    }
  };

  /* =========================================================
     RESOLVE NOTIFICATION DESTINATION

     Notification producers normally store the exact route in `link`.
     These fallbacks make older notifications with a missing link useful
     as well, while preserving any existing dynamic route/query string.
  ========================================================= */

  const resolveNotificationLink = (notification: any) => {
    const storedLink = String(notification?.link ?? "").trim();

    if (storedLink) {
      return storedLink;
    }

    switch (notification?.type) {
      case "TICKET_MESSAGE":
        return "/tickets";
      case "LEAVE_REQUEST":
      case "LEAVE_DECISION":
        return "/leave";
      case "ATTENDANCE_LATE":
      case "ATTENDANCE_EARLY_DEPARTURE":
      case "ATTENDANCE_REGULARIZATION":
      case "ATTENDANCE_OVERTIME":
      case "ATTENDANCE_COMP_OFF":
        return "/attendance";
      case "PAYROLL":
        return "/payroll";
      case "PERFORMANCE":
        return "/performance";
      case "RECRUITMENT":
        return "/recruitment";
      case "DOCUMENT_REQUESTED":
      case "DOCUMENT_UPLOADED":
      case "DOCUMENT_READY":
      case "DOCUMENT_EXPIRY":
        return "/documents";
      case "ANNOUNCEMENT":
        return "/announcements";
      case "EMPLOYEE_LIFECYCLE":
      case "SYSTEM":
        return "/dashboard";
      default:
        return "/dashboard";
    }
  };


  const handleNotifClick = async (notification: any) => {
    const id = String(
      notification?.id ??
      notification?._id ??
      notification?.notificationId ??
      "",
    ).trim();
    const link = resolveNotificationLink(notification);
    /*
     * Reading and opening are independent actions.
     * A read-status failure must never prevent navigation.
     */
    try {
      if (id) {
        await markNotificationRead(id);
      } else {
        console.warn(
          "[Notification] Missing notification id; opening destination without marking read.",
          notification,
        );
      }
    } catch (error) {
      console.error(
        "[Notification] Failed to mark as read:",
        error,
      );
    }

    setNotifOpen(false);

    /*
     * No destination configured.
     */
    if (!link || !link.trim()) {
      return;
    }

    let normalized = link.trim();

    /*
     * External links open in a new tab.
     */
    if (/^https?:\/\//i.test(normalized)) {
      try {
        window.open(
          normalized,
          "_blank",
          "noopener,noreferrer",
        );
      } catch (error) {
        console.error(
          "[Notification] Failed to open external link:",
          error,
        );
      }

      return;
    }

    /*
     * Normalize internal/legacy links.
     *
     * Examples:
     *   attendance
     *   /attendance
     *   /attendance?tab=exceptions
     *   /app/attendance
     *   /app/attendance?tab=exceptions
     *
     * Query parameters are preserved.
     */
    if (!normalized.startsWith("/")) {
      normalized = `/${normalized}`;
    }

    if (!normalized.startsWith("/app/")) {
      normalized = `/app${normalized}`;
    }

    /*
     * Protect against an accidentally duplicated /app prefix.
     */
    normalized = normalized.replace(
      /^\/app\/app\//,
      "/app/",
    );

    console.log(
      "[Notification] Navigating to:",
      normalized,
    );

    navigate(normalized);
  };


  /* =========================================================
     SAFE NOTIFICATION DATA
  ========================================================= */

  const notifications =
    notifData?.notifications ?? [];

  const unreadCount =
    typeof notifData?.unreadCount === "number"
      ? notifData.unreadCount
      : notifications.filter(
        (notification: any) =>
          !isNotificationRead(notification),
      ).length;

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line/70 bg-white/85 px-4 backdrop-blur-md sm:px-6">
        {/* =====================================================
          LEFT SIDE
      ===================================================== */}

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobileNav}
            className="rounded-lg p-1.5 text-ink-soft hover:bg-black/5 md:hidden"
            type="button"
          >
            <Menu size={20} />
          </button>

          <div className="hidden sm:block">
            <p className="text-[13px] text-ink-faint">
              Welcome back,{" "}
              <span className="font-medium text-ink">
                {user?.employee?.firstName ??
                  user?.email}
              </span>
            </p>
          </div>
        </div>

        {/* =====================================================
          RIGHT SIDE
      ===================================================== */}

        <div className="flex items-center gap-2 sm:gap-3">
          {/* ===================================================
            EMPLOYEE ACTIONS
        =================================================== */}

          {user?.employee && (
            <div className="hidden items-center gap-2 sm:flex">
              {!isMyTicketsPage && (
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={
                    <TicketPlus size={14} />
                  }
                  onClick={onRaiseTicket}
                >
                  Raise Ticket
                </Button>
              )}

              {todayAttendance?.checkIn &&
                !todayAttendance?.checkOut ? (
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={
                    <Clock size={14} />
                  }
                  onClick={() => checkOutMutation.mutate(undefined)}
                  isLoading={checkOutMutation.isPending}
                >
                  Check out
                </Button>
              ) : todayAttendance?.checkOut ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-success-50 px-3 py-2 text-[13px] font-medium text-success-700">
                  <Check size={14} />
                  Day complete
                </span>
              ) : (
                <Button
                  size="sm"
                  leftIcon={
                    <Clock size={14} />
                  }
                  onClick={() =>
                    checkInMutation.mutate(undefined)
                  }
                  isLoading={
                    checkInMutation.isPending
                  }
                >
                  Check in
                </Button>
              )}
            </div>
          )}

          {/* ===================================================
            NOTIFICATIONS
        =================================================== */}

          <div
            className="relative"
            ref={notifRef}
          >
            <button
              type="button"
              onClick={() =>
                setNotifOpen((value) => !value)
              }
              className="relative rounded-xl p-2 text-ink-soft transition hover:bg-black/5"
              aria-label="Notifications"
              aria-expanded={notifOpen}
            >
              <Bell size={19} />

              {!!unreadCount && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white">
                  {unreadCount > 9
                    ? "9+"
                    : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-12 z-40 w-80 rounded-2xl border border-line/70 bg-white p-2 shadow-lifted animate-fade-up sm:w-96">
                {/* =============================================
                  NOTIFICATION HEADER
              ============================================= */}

                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-[14px] font-medium text-ink">
                      Notifications
                    </p>

                    {isNotificationsFetching && (
                      <span className="text-[10px] text-ink-faint">
                        Updating...
                      </span>
                    )}
                  </div>

                  {!!unreadCount && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-[12px] font-medium text-brand-600 hover:text-brand-700"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* =============================================
                  NOTIFICATION LIST
              ============================================= */}

                <div className="max-h-96 overflow-y-auto">
                  {!notifications.length ? (
                    <p className="px-3 py-6 text-center text-[13px] text-ink-faint">
                      You're all caught up.
                    </p>
                  ) : (
                    notifications.map(
                      (notification: any) => {
                        const isRead =
                          isNotificationRead(notification);

                        return (
                          <div
                            key={notification.id}
                            className={cx(
                              "rounded-xl px-3 py-2.5 transition hover:bg-black/[0.03]",
                              !isRead &&
                              "bg-brand-50/60",
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleNotifClick(notification)
                                }
                                className="min-w-0 flex-1 text-left"
                                aria-label={
                                  isRead
                                    ? `Open ${notification.title}`
                                    : `Open and mark ${notification.title} as read`
                                }
                              >
                                <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                                  {!isRead && (
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                                  )}

                                  <span className="truncate">
                                    {notification.title}
                                  </span>
                                </span>

                                <span className="mt-0.5 block text-[12px] text-ink-faint">
                                  {notification.message}
                                </span>

                                <span className="mt-0.5 block text-[11px] text-ink-faint/80">
                                  {timeAgo(
                                    notification.createdAt,
                                  )}
                                </span>

                                {notification.expiresAt && (
                                  <span className="mt-0.5 block text-[10px] text-amber-700">
                                    Expires: {new Intl.DateTimeFormat("en-IN", {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                      timeZone: "Asia/Kolkata",
                                    }).format(new Date(notification.expiresAt))}
                                  </span>
                                )}
                              </button>

                              <div className="shrink-0 pt-0.5">
                                {isRead ? (
                                  <span className="inline-flex items-center rounded-full bg-success-50 px-2 py-1 text-[10px] font-medium text-success-700">
                                    Read
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={async (event) => {
                                      event.stopPropagation();
                                      await markNotificationRead(
                                        notification.id,
                                      );
                                    }}
                                    className="whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-medium text-brand-600 transition hover:bg-brand-100 hover:text-brand-700"
                                    aria-label={`Mark ${notification.title} as read`}
                                  >
                                    Mark as read
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      },
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ===================================================
            USER MENU
        =================================================== */}

          <div
            className="relative"
            ref={userRef}
          >
            <button
              type="button"
              onClick={() =>
                setUserMenuOpen((value) => !value)
              }
              className="flex items-center gap-2 rounded-xl p-1 transition hover:bg-black/5"
              aria-label="User menu"
              aria-expanded={userMenuOpen}
            >
              <Avatar
                firstName={
                  user?.employee?.firstName ??
                  user?.email ??
                  "U"
                }
                lastName={
                  user?.employee?.lastName ?? ""
                }
                src={user?.employee?.avatarUrl}
                size="sm"
              />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-12 z-40 w-56 rounded-2xl border border-line/70 bg-white p-1.5 shadow-lifted animate-fade-up">
                {/* =============================================
                  USER DETAILS
              ============================================= */}

                <div className="px-3 py-2.5">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {user?.employee?.fullName ??
                      user?.email}
                  </p>

                  <p className="truncate text-[12px] text-ink-faint">
                    {user?.email}
                  </p>
                </div>

                <div className="my-1 h-px bg-line/70" />

                {/* =============================================
                  MY PROFILE
              ============================================= */}

                {user?.employee && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);

                      navigate(
                        `/app/employees/${user.employee!.id}`,
                      );
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-ink-soft hover:bg-black/5"
                  >
                    <UserCircle2 size={16} />
                    My profile
                  </button>
                )}

                {/* =============================================
                  ACCOUNT SETTINGS
              ============================================= */}

                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate(
                      "/app/settings/account",
                    );
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-ink-soft hover:bg-black/5"
                >
                  <Settings size={16} />
                  Account settings
                </button>

                {/* =============================================
                  SIGN OUT
              ============================================= */}

                <button
                  type="button"
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-danger-500 hover:bg-danger-50"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <Modal
        open={lateCheckInOpen}
        onClose={() => {
          if (!checkInMutation.isPending) {
            setLateCheckInOpen(false);
            setLateCheckInReason("");
          }
        }}
        title="Late check-in reason"
        subtitle="You checked in later than the office start time. Please provide a reason to complete attendance."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setLateCheckInOpen(false);
                setLateCheckInReason("");
              }}
              disabled={checkInMutation.isPending}
            >
              Cancel
            </Button>

            <Button
              onClick={() => {
                const reason = lateCheckInReason.trim();

                if (reason.length < 3) {
                  showToast(
                    "Please provide a reason for late check-in.",
                    "error",
                  );
                  return;
                }

                checkInMutation.mutate(reason);
              }}
              isLoading={checkInMutation.isPending}
            >
              Confirm check-in
            </Button>
          </>
        }
      >
        <TextareaField
          label="Reason"
          required
          placeholder="E.g. Traffic delay, medical issue, or personal emergency."
          maxLength={1000}
          value={lateCheckInReason}
          onChange={(e) =>
            setLateCheckInReason(e.target.value)
          }
        />
      </Modal>

      <Modal
        open={earlyDepartureOpen}
        onClose={() => {
          if (!checkOutMutation.isPending) {
            setEarlyDepartureOpen(false);
            setEarlyDepartureReason("");
          }
        }}
        title="Early departure reason"
        subtitle="You are checking out before the scheduled shift end time. Please provide a reason to complete checkout."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEarlyDepartureOpen(false);
                setEarlyDepartureReason("");
              }}
              disabled={checkOutMutation.isPending}
            >
              Cancel
            </Button>

            <Button
              onClick={() => {
                const reason = earlyDepartureReason.trim();

                if (reason.length < 3) {
                  showToast(
                    "Please provide a reason for early departure.",
                    "error",
                  );
                  return;
                }

                checkOutMutation.mutate(reason);
              }}
              isLoading={checkOutMutation.isPending}
            >
              Confirm checkout
            </Button>
          </>
        }
      >
        <TextareaField
          label="Reason"
          required
          placeholder="E.g. Personal emergency, medical appointment, or approved early departure."
          maxLength={1000}
          value={earlyDepartureReason}
          onChange={(e) =>
            setEarlyDepartureReason(e.target.value)
          }
        />
      </Modal>
    </>
  );
}