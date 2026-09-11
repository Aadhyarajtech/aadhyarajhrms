import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({
  children,
  roles,
  permissions,
}: {
  children: React.ReactNode;
  roles?: Role[];
  permissions?: string[];
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
  const roleAllowed = !roles || roles.includes(user.role);
  const permissionAllowed =
    !permissions?.length || permissions.some(hasPermission);
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
