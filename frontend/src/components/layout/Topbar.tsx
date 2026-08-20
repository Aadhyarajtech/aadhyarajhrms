import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  const queryClient = useQueryClient();

  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

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

  const { data: todayAttendance } = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: () => AttendanceApi.today(),
    enabled: !!user?.employee,
  });

  /* =========================================================
     CHECK IN
  ========================================================= */

  const checkInMutation = useMutation({
    mutationFn: AttendanceApi.checkIn,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["attendance", "today"],
      });

      showToast(
        "Checked in. Have a great day!",
      );
    },

    onError: (err) => {
      showToast(
        getErrorMessage(err),
        "error",
      );
    },
  });

  /* =========================================================
     CHECK OUT
  ========================================================= */

  const checkOutMutation = useMutation({
    mutationFn: AttendanceApi.checkOut,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["attendance", "today"],
      });

      showToast(
        "Checked out. See you tomorrow!",
      );
    },

    onError: (err) => {
      showToast(
        getErrorMessage(err),
        "error",
      );
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
    /*
     * Do not depend on the logged-in role here. The backend endpoint
     * identifies the authenticated user and marks only that user's
     * notification as read.
     */
    queryClient.setQueryData(
      ["notifications"],
      (data: any) => {
        if (!data) {
          return data;
        }

        const notifications =
          data.notifications?.map(
            (notification: any) =>
              notification.id === id
                ? {
                    ...notification,
                    isRead: true,
                    read: true,
                  }
                : notification,
          ) ?? [];

        const unreadCount =
          notifications.filter(
            (notification: any) =>
              !isNotificationRead(notification),
          ).length;

        return {
          ...data,
          notifications,
          unreadCount,
        };
      },
    );

    try {
      await NotificationsApi.markRead(id);

      /* Confirm server state immediately; do not wait for polling. */
      await queryClient.refetchQueries({
        queryKey: ["notifications"],
        type: "active",
      });
    } catch (error) {
      /* Restore actual server state if the write failed. */
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

  const handleNotifClick = async (
    id: string,
    link: string | null,
  ) => {
    await markNotificationRead(id);

    setNotifOpen(false);

    if (!link) {
      return;
    }

    /* Normalize legacy backend links. */
    try {
      if (/^https?:\/\//.test(link)) {
        window.open(
          link,
          "_blank",
          "noopener,noreferrer",
        );

        return;
      }
    } catch {
      // Ignore invalid external links.
    }

    let normalized = link;

    if (
      normalized.startsWith("/") &&
      !normalized.startsWith("/app/")
    ) {
      normalized = "/app" + normalized;
    }

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
            <Button
              size="sm"
              variant="secondary"
              leftIcon={
                <TicketPlus size={14} />
              }
              onClick={onRaiseTicket}
            >
              Raise Ticket
            </Button>

            {todayAttendance?.checkIn &&
            !todayAttendance?.checkOut ? (
              <Button
                size="sm"
                variant="outline"
                leftIcon={
                  <Clock size={14} />
                }
                onClick={() =>
                  checkOutMutation.mutate()
                }
                isLoading={
                  checkOutMutation.isPending
                }
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
                  checkInMutation.mutate()
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
                                handleNotifClick(
                                  notification.id,
                                  notification.link,
                                )
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
  );
}