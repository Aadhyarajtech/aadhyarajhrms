import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, Network, Clock, CalendarDays, Briefcase, Target, Wallet,
  Megaphone, Settings, X,
} from "lucide-react";
import { BrandWordmark } from "./BrandMark";
import { useAuth } from "@/context/AuthContext";
import { cx } from "@/lib/format";
import type { Role } from "@/types";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/employees", label: "Employees", icon: Users },
  { to: "/app/org-chart", label: "Org Chart", icon: Network },
  { to: "/app/attendance", label: "Attendance", icon: Clock },
  { to: "/app/leave", label: "Leave", icon: CalendarDays },
  { to: "/app/recruitment", label: "Recruitment", icon: Briefcase, roles: ["SUPER_ADMIN", "HR_ADMIN", "RECRUITER", "MANAGER"] },
  { to: "/app/performance", label: "Performance", icon: Target },
  { to: "/app/payroll", label: "Payroll", icon: Wallet },
  { to: "/app/announcements", label: "Announcements", icon: Megaphone },
  { to: "/app/settings", label: "Settings", icon: Settings, roles: ["SUPER_ADMIN", "HR_ADMIN"] },
];

export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const { user } = useAuth();
  const role = user?.role;

  const items = NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role)));

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-6 pb-5">
        <BrandWordmark />
        <button onClick={onCloseMobile} className="rounded-lg p-1 text-ink-faint hover:bg-black/5 md:hidden">
          <X size={18} />
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onCloseMobile}
            className={({ isActive }) =>
              cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors",
                isActive ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-black/[0.04] hover:text-ink"
              )
            }
          >
            <item.icon size={18} strokeWidth={2} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line/70 p-4">
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-gold-50 p-4">
          <p className="font-display text-[13px] font-medium text-ink">Need help?</p>
          <p className="mt-1 text-[12px] text-ink-faint">Reach IT & Security for access or technical issues.</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-line/70 md:bg-white">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-lifted animate-fade-up">{content}</aside>
        </div>
      )}
    </>
  );
}
