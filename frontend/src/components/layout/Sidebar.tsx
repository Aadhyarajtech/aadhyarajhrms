import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Network,
  Clock,
  CalendarDays,
  Briefcase,
  Target,
  Wallet,
  Megaphone,
  Settings,
  UserCircle2,
  Receipt,
  ClipboardList,
  X,
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

/* =========================================================
   SIDEBAR NAVIGATION
========================================================= */

const NAV_ITEMS: NavItem[] = [
  /* -------------------------------------------------------
     DASHBOARD
  ------------------------------------------------------- */

  {
    to: "/app/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },

  /* -------------------------------------------------------
     TICKETS
  ------------------------------------------------------- */

  {
    to: "/app/my-tickets",
    label: "My Tickets",
    icon: Receipt,
  },

  {
    to: "/app/tickets",
    label: "Tickets",
    icon: ClipboardList,
    roles: [
      "SUPER_ADMIN",
      "HR_ADMIN",
      "MANAGER",
      "FINANCE",
      "IT_SUPPORT",
    ],
  },

  /* -------------------------------------------------------
     ATTENDANCE
  ------------------------------------------------------- */

  {
    to: "/app/attendance",
    label: "Attendance",
    icon: Clock,
  },

  /* -------------------------------------------------------
     LEAVE
  ------------------------------------------------------- */

  {
    to: "/app/leave",
    label: "Leave",
    icon: CalendarDays,
  },

  /* -------------------------------------------------------
     CALENDAR
  ------------------------------------------------------- */

  {
    to: "/app/calendar",
    label: "Calendar",
    icon: CalendarDays,
  },

  /* -------------------------------------------------------
     PERFORMANCE
  ------------------------------------------------------- */

  {
    to: "/app/performance",
    label: "Performance",
    icon: Target,
  },

  /* -------------------------------------------------------
     PAYROLL
  ------------------------------------------------------- */

  {
    to: "/app/payroll",
    label: "Payroll",
    icon: Wallet,
  },

  /* -------------------------------------------------------
     DOCUMENTS
  ------------------------------------------------------- */

  {
    to: "/app/documents",
    label: "Documents",
    icon: Briefcase,
  },

  /* -------------------------------------------------------
     MY PROFILE
  ------------------------------------------------------- */

  {
    to: "/app/employees/",
    label: "My Profile",
    icon: UserCircle2,
  },

  /* -------------------------------------------------------
     MY TEAM
  ------------------------------------------------------- */

  {
    to: "/app/my-team",
    label: "My Team",
    icon: Users,
    roles: ["MANAGER"],
  },

  /* -------------------------------------------------------
     SETTINGS
  ------------------------------------------------------- */

  {
    to: "/app/settings",
    label: "Settings",
    icon: Settings,
  },

  /* -------------------------------------------------------
     EMPLOYEES
  ------------------------------------------------------- */

  {
    to: "/app/employees",
    label: "Employees",
    icon: Users,
    roles: [
      "SUPER_ADMIN",
      "HR_ADMIN",
    ],
  },

  /* -------------------------------------------------------
     ORG CHART
  ------------------------------------------------------- */

  {
    to: "/app/org-chart",
    label: "Org Chart",
    icon: Network,
    roles: [
      "SUPER_ADMIN",
      "HR_ADMIN",
      "MANAGER",
    ],
  },

  /* -------------------------------------------------------
     RECRUITMENT
  ------------------------------------------------------- */

  {
    to: "/app/recruitment",
    label: "Recruitment",
    icon: Briefcase,
    roles: [
      "SUPER_ADMIN",
      "HR_ADMIN",
      "RECRUITER",
      "MANAGER",
    ],
  },

  /* -------------------------------------------------------
     ANNOUNCEMENTS
  ------------------------------------------------------- */

  {
    to: "/app/announcements",
    label: "Announcements",
    icon: Megaphone,
  },
];

/* =========================================================
   SIDEBAR
========================================================= */

export function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { user } = useAuth();

  const role = user?.role;

  /* -------------------------------------------------------
     FILTER NAVIGATION BY ROLE
  ------------------------------------------------------- */

  const items = NAV_ITEMS.filter(
    (item) =>
      !item.roles ||
      (role && item.roles.includes(role)),
  );

  /* -------------------------------------------------------
     PROFILE PATH
  ------------------------------------------------------- */

  const profilePath = user?.employee?.id
    ? `/app/employees/${user.employee.id}`
    : "/app/settings/account";

  /* -------------------------------------------------------
     SETTINGS PATH
  ------------------------------------------------------- */

  const settingsPath =
    role === "EMPLOYEE"
      ? "/app/settings/account"
      : "/app/settings";

  /* -------------------------------------------------------
     NAVIGATION CONTENT
  ------------------------------------------------------- */

  const content = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ===================================================
          BRAND HEADER
      =================================================== */}

      <div className="mb-6 flex items-center justify-between">
        <BrandWordmark />

        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-lg p-2 text-ink-soft hover:bg-black/[0.04] lg:hidden"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      </div>

      {/* ===================================================
          NAVIGATION
      =================================================== */}

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {items.map((item) => {
          /* -------------------------------------------------
             RESOLVE DYNAMIC PATHS
          ------------------------------------------------- */

          const resolvedTo =
            item.to === "/app/employees/"
              ? profilePath
              : item.to === "/app/settings"
                ? settingsPath
                : item.to;

          return (
            <NavLink
              key={item.to}
              to={resolvedTo}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors",

                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-soft hover:bg-black/[0.04] hover:text-ink",
                )
              }
            >
              <item.icon
                size={18}
                strokeWidth={2}
              />

              <span>
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </nav>

      {/* ===================================================
          HELP
      =================================================== */}

      <div className="mt-auto pt-6">
        <div className="rounded-xl bg-black/[0.03] p-3">
          <p className="text-xs font-medium text-ink">
            Need help?
          </p>

          <p className="mt-1 text-xs text-ink-faint">
            Reach IT & Security for access or technical issues.
          </p>
        </div>
      </div>
    </div>
  );

  /* =========================================================
     DESKTOP + MOBILE SIDEBAR
  ========================================================= */

  return (
    <>
      {/* =====================================================
          DESKTOP
      ===================================================== */}

      <aside className="hidden h-screen w-64 shrink-0 overflow-hidden border-r border-line bg-white p-5 lg:block">
        {content}
      </aside>

      {/* =====================================================
          MOBILE
      ===================================================== */}

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* BACKDROP */}

          <div
            className="absolute inset-0 bg-black/30"
            onClick={onCloseMobile}
          />

          {/* SIDEBAR */}

          <aside className="relative h-full w-72 bg-white p-5 shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}