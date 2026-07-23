import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Menu, Bell, LogOut, Settings, UserCircle2, Clock, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { NotificationsApi, AttendanceApi } from "@/lib/endpoints";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { timeAgo, cx } from "@/lib/format";
import { getErrorMessage } from "@/lib/api";

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: notifData } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => NotificationsApi.list(),
    refetchInterval: 30000,
  });

  const { data: todayAttendance } = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: () => AttendanceApi.today(),
    enabled: !!user?.employee,
  });

  const checkInMutation = useMutation({
    mutationFn: AttendanceApi.checkIn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
      showToast("Checked in. Have a great day!");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });
  const checkOutMutation = useMutation({
    mutationFn: AttendanceApi.checkOut,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
      showToast("Checked out. See you tomorrow!");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const markAllRead = async () => {
    await NotificationsApi.markAllRead();
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const handleNotifClick = async (id: string, link: string | null) => {
    await NotificationsApi.markRead(id);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    setNotifOpen(false);
    if (link) navigate(link);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line/70 bg-white/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <button onClick={onOpenMobileNav} className="rounded-lg p-1.5 text-ink-soft hover:bg-black/5 md:hidden">
          <Menu size={20} />
        </button>
        <div className="hidden sm:block">
          <p className="text-[13px] text-ink-faint">
            Welcome back, <span className="font-medium text-ink">{user?.employee?.firstName ?? user?.email}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {user?.employee && (
          <div className="hidden items-center gap-2 sm:flex">
            {todayAttendance?.checkIn && !todayAttendance?.checkOut ? (
              <Button size="sm" variant="outline" leftIcon={<Clock size={14} />} onClick={() => checkOutMutation.mutate()} isLoading={checkOutMutation.isPending}>
                Check out
              </Button>
            ) : todayAttendance?.checkOut ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-success-50 px-3 py-2 text-[13px] font-medium text-success-700">
                <Check size={14} /> Day complete
              </span>
            ) : (
              <Button size="sm" leftIcon={<Clock size={14} />} onClick={() => checkInMutation.mutate()} isLoading={checkInMutation.isPending}>
                Check in
              </Button>
            )}
          </div>
        )}

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative rounded-xl p-2 text-ink-soft transition hover:bg-black/5"
          >
            <Bell size={19} />
            {!!notifData?.unreadCount && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white">
                {notifData.unreadCount > 9 ? "9+" : notifData.unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-12 z-40 w-80 rounded-2xl border border-line/70 bg-white p-2 shadow-lifted animate-fade-up sm:w-96">
              <div className="flex items-center justify-between px-3 py-2">
                <p className="font-display text-[14px] font-medium text-ink">Notifications</p>
                {!!notifData?.unreadCount && (
                  <button onClick={markAllRead} className="text-[12px] font-medium text-brand-600 hover:text-brand-700">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {!notifData?.notifications.length ? (
                  <p className="px-3 py-6 text-center text-[13px] text-ink-faint">You're all caught up.</p>
                ) : (
                  notifData.notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotifClick(n.id, n.link)}
                      className={cx(
                        "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition hover:bg-black/[0.03]",
                        !n.isRead && "bg-brand-50/60"
                      )}
                    >
                      <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                        {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
                        {n.title}
                      </span>
                      <span className="text-[12px] text-ink-faint">{n.message}</span>
                      <span className="text-[11px] text-ink-faint/80">{timeAgo(n.createdAt)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={userRef}>
          <button onClick={() => setUserMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-xl p-1 transition hover:bg-black/5">
            <Avatar firstName={user?.employee?.firstName ?? user?.email ?? "U"} lastName={user?.employee?.lastName ?? ""} src={user?.employee?.avatarUrl} size="sm" />
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-12 z-40 w-56 rounded-2xl border border-line/70 bg-white p-1.5 shadow-lifted animate-fade-up">
              <div className="px-3 py-2.5">
                <p className="truncate text-[13px] font-medium text-ink">{user?.employee?.fullName ?? user?.email}</p>
                <p className="truncate text-[12px] text-ink-faint">{user?.email}</p>
              </div>
              <div className="my-1 h-px bg-line/70" />
              {user?.employee && (
                <button
                  onClick={() => { setUserMenuOpen(false); navigate(`/app/employees/${user.employee!.id}`); }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-ink-soft hover:bg-black/5"
                >
                  <UserCircle2 size={16} /> My profile
                </button>
              )}
              <button
                onClick={() => { setUserMenuOpen(false); navigate("/app/settings/account"); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-ink-soft hover:bg-black/5"
              >
                <Settings size={16} /> Account settings
              </button>
              <button
                onClick={() => { logout(); navigate("/login"); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-danger-500 hover:bg-danger-50"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
