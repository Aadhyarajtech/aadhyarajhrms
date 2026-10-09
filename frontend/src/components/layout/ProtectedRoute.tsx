import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({
  children,
  roles,
  permissions,
  managerOnly = false,
}: {
  children: React.ReactNode;
  roles?: Role[];
  permissions?: string[];
  managerOnly?: boolean;
}) {
  const { user, isLoading, hasPermission } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <Loader2 className="animate-spin text-brand-500" size={28} />
      </div>
    );
  }

 if (!user) return <Navigate to="/login" replace />;

// Force temporary-password reset before entering the application
if (user.mustResetPwd) {
  return <Navigate to="/change-temporary-password" replace />;
}

// Normalize role values because some accounts may receive aliases such as
// "employee", "employees", "superadmin", or "super admin" from auth data.
const normalizeRole = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\\s-]+/g, "_");

const roleAliases: Record<string, string> = {
  EMPLOYEES: "EMPLOYEE",
  SUPERADMIN: "SUPER_ADMIN",
  "SUPER ADMIN": "SUPER_ADMIN",
};

const normalizedUserRole = normalizeRole(user.role);
const canonicalUserRole =
  roleAliases[normalizedUserRole] ?? normalizedUserRole;

const normalizedAllowedRoles = (roles ?? []).map((role) => {
  const normalizedRole = normalizeRole(role);
  return roleAliases[normalizedRole] ?? normalizedRole;
});

const roleAllowed =
  !roles || normalizedAllowedRoles.includes(canonicalUserRole);
  const managerAllowed =
    !managerOnly ||
    user.employee?.isManager === true ||
    canonicalUserRole === "SUPER_ADMIN" ||
    canonicalUserRole === "HR_ADMIN";
  const permissionAllowed =
    !permissions?.length || permissions.some(hasPermission);
  if (!managerAllowed)
    return <Navigate to="/app/dashboard" replace />;

  if (roles && permissions) {
    if (!roleAllowed && !permissionAllowed)
      return <Navigate to="/app/dashboard" replace />;
  } else if (roles && !roleAllowed) {
    return <Navigate to="/app/dashboard" replace />;
  } else if (permissions && !permissionAllowed) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <>{children}</>;
}

