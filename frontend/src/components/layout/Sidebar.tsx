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
  BarChart3,
  X,
  ChevronRight,
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
  permission?: string;
  section?: "workspace" | "people" | "management" | "system";
}

/* =========================================================
   SIDEBAR NAVIGATION
========================================================= */

const NAV_ITEMS: NavItem[] = [
  /* =======================================================
     WORKSPACE
  ======================================================= */

  {
    to: "/app/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    section: "workspace",
  },

  {
    to: "/app/my-tickets",
    label: "My Tickets",
    icon: Receipt,
    section: "workspace",
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
    section: "workspace",
  },

  {
    to: "/app/attendance",
    label: "Attendance",
    icon: Clock,
    permission: "attendance.view",
    section: "workspace",
  },

  {
    to: "/app/leave",
    label: "Leave",
    icon: CalendarDays,
    permission: "leave.view",
    section: "workspace",
  },

  {
    to: "/app/calendar",
    label: "Calendar",
    icon: CalendarDays,
    section: "workspace",
  },

  {
    to: "/app/performance",
    label: "Performance",
    icon: Target,
    permission: "performance.view",
    section: "workspace",
  },

  {
    to: "/app/payroll",
    label: "Payroll",
    icon: Wallet,
    permission: "payroll.view",
    section: "workspace",
  },

  {
    to: "/app/documents",
    label: "Documents",
    icon: Briefcase,
    permission: "documents.view",
    section: "workspace",
  },

  {
    to: "/app/employees/",
    label: "My Profile",
    icon: UserCircle2,
    section: "workspace",
  },

  /* =======================================================
     PEOPLE
  ======================================================= */

  {
    to: "/app/my-team",
    label: "My Team",
    icon: Users,
    roles: ["MANAGER"],
    section: "people",
  },

  {
    to: "/app/employees",
    label: "Employees",
    icon: Users,
    roles: ["SUPER_ADMIN", "HR_ADMIN"],
    section: "people",
  },

  {
    to: "/app/org-chart",
    label: "Org Chart",
    icon: Network,
    roles: ["SUPER_ADMIN", "HR_ADMIN"],
    section: "people",
  },

  /* =======================================================
     MANAGEMENT
  ======================================================= */

  {
    to: "/app/reports",
    label: "Reports & Analytics",
    icon: BarChart3,
    permission: "reports.view",
    roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"],
    section: "management",
  },

  {
    to: "/app/recruitment",
    label: "Recruitment",
    icon: Briefcase,
    permission: "recruitment.view",
    section: "management",
  },

  {
    to: "/app/announcements",
    label: "Announcements",
    icon: Megaphone,
    permission: "announcements.view",
    section: "management",
  },

  /* =======================================================
     SYSTEM
  ======================================================= */

  {
    to: "/app/settings",
    label: "Settings",
    icon: Settings,
    section: "system",
  },
];

/* =========================================================
   SECTION LABELS
========================================================= */

const SECTION_LABELS: Record<
  NonNullable<NavItem["section"]>,
  string
> = {
  workspace: "Workspace",
  people: "People",
  management: "Management",
  system: "System",
};

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
  const { user, hasPermission } = useAuth();

  const role = user?.role;

  /* -------------------------------------------------------
     FILTER NAVIGATION BY ROLE / PERMISSION
  ------------------------------------------------------- */

  const items = NAV_ITEMS.filter((item) => {
    const roleAllowed =
      !item.roles || (role && item.roles.includes(role));

    const permissionAllowed =
      !item.permission || hasPermission(item.permission);

    return roleAllowed && permissionAllowed;
  });

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
    <div className="flex h-full min-h-0 flex-col">
      {/* ===================================================
          BRAND HEADER
      =================================================== */}

      <div className="shrink-0">
        <div className="flex items-center justify-between">
          <BrandWordmark />

          <button
            type="button"
            onClick={onCloseMobile}
            className={cx(
              "group rounded-xl p-2",
              "text-slate-400 transition-all duration-200",
              "hover:bg-slate-100 hover:text-slate-700",
              "lg:hidden",
            )}
            aria-label="Close navigation"
          >
            <X
              size={18}
              strokeWidth={2}
              className="transition-transform duration-200 group-hover:rotate-90"
            />
          </button>
        </div>
      </div>

      {/* ===================================================
          NAVIGATION
      =================================================== */}

      <nav
        key={`${mobileOpen}-${role ?? "guest"}`}
        className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin"
      >
        {(
          [
            "workspace",
            "people",
            "management",
            "system",
          ] as const
        ).map((section) => {
          const sectionItems = items.filter(
            (item) => item.section === section,
          );

          if (sectionItems.length === 0) {
            return null;
          }

          return (
            <div
              key={section}
              className="mb-5 last:mb-0"
            >
              {/* -------------------------------------------------
                  SECTION LABEL
              ------------------------------------------------- */}

              <div className="mb-2 px-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  {SECTION_LABELS[section]}
                </span>
              </div>

              {/* -------------------------------------------------
                  SECTION ITEMS
              ------------------------------------------------- */}

              <div className="space-y-1">
                {sectionItems.map((item) => {
                  /* ---------------------------------------------
                     RESOLVE DYNAMIC PATHS
                  --------------------------------------------- */

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
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5",
                          "text-[13px] font-semibold",
                          "transition-all duration-200 ease-out",

                          isActive
                            ? [
                                "bg-gradient-to-r from-[#F0EDFF] via-[#F5F3FF] to-[#FAF9FF]",
                                "text-brand-700",
                                "shadow-[0_5px_15px_rgba(91,79,229,0.07)]",
                              ].join(" ")
                            : [
                                "text-slate-600",
                                "hover:bg-slate-50",
                                "hover:text-slate-900",
                              ].join(" "),
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* -------------------------------------
                              ACTIVE LEFT INDICATOR
                          ------------------------------------- */}

                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[#5B4FE5] to-[#7B61FF]" />
                          )}

                          {/* -------------------------------------
                              ICON
                          ------------------------------------- */}

                          <span
                            className={cx(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                              "transition-all duration-200",

                              isActive
                                ? "bg-white text-brand-600 shadow-[0_4px_10px_rgba(91,79,229,0.13)]"
                                : "bg-slate-50 text-slate-500 group-hover:bg-white group-hover:text-slate-700",
                            )}
                          >
                            <item.icon
                              size={16}
                              strokeWidth={isActive ? 2.25 : 2}
                            />
                          </span>

                          {/* -------------------------------------
                              LABEL
                          ------------------------------------- */}

                          <span className="min-w-0 flex-1 truncate">
                            {item.label}
                          </span>

                          {/* -------------------------------------
                              ACTIVE ARROW
                          ------------------------------------- */}

                          <ChevronRight
                            size={14}
                            strokeWidth={2}
                            className={cx(
                              "shrink-0 transition-all duration-200",
                              isActive
                                ? "translate-x-0 text-brand-500 opacity-100"
                                : "-translate-x-1 text-slate-300 opacity-0 group-hover:translate-x-0 group-hover:opacity-100",
                            )}
                          />
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
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

      <aside
        className={cx(
          "hidden h-screen w-[272px] shrink-0 overflow-hidden",
          "border-r border-slate-200/70",
          "bg-white",
          "lg:block",
        )}
      >
        <div className="h-full bg-gradient-to-b from-white via-white to-[#FBFAFF] p-5">
          {content}
        </div>
      </aside>

      {/* =====================================================
          MOBILE
      ===================================================== */}

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* BACKDROP */}

          <div
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
            onClick={onCloseMobile}
          />

          {/* SIDEBAR */}

          <aside
            className={cx(
              "relative h-full w-[290px] overflow-hidden",
              "border-r border-slate-200/70",
              "bg-white shadow-[12px_0_40px_rgba(15,23,42,0.14)]",
            )}
          >
            <div className="h-full bg-gradient-to-b from-white via-white to-[#FBFAFF] p-5">
              {content}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}