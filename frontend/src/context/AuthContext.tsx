import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthApi, GovernanceApi } from "@/lib/endpoints";
import { registerUnauthorizedHandler } from "@/lib/api";
import type { AuthUser } from "@/types";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "aadhyaraj_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [permissions, setPermissions] = useState<string[]>([]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    queryClient.clear();
    setUser(null);
    setPermissions([]);
  }, [queryClient]);

  useEffect(() => {
    registerUnauthorizedHandler(logout);
  }, [logout]);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }
    AuthApi.me()
      .then(async (freshUser) => {
        setUser(freshUser);
        const access = await GovernanceApi.me();
        setPermissions(access.permissions);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      queryClient.clear();
      const { token, user: loggedInUser } = await AuthApi.login(
        email,
        password,
      );
      localStorage.setItem(TOKEN_KEY, token);
      setUser(loggedInUser);
      const access = await GovernanceApi.me();
      setPermissions(access.permissions);
    },
    [queryClient],
  );

  const refreshUser = useCallback(async () => {
    const fresh = await AuthApi.me();
    setUser(fresh);
    const access = await GovernanceApi.me();
    setPermissions(access.permissions);
  }, []);

  const hasPermission = useCallback(
    (permission: string) => {
      if (user?.role === "SUPER_ADMIN") return true;
      if (permissions.includes(permission)) return true;
      if (permission.endsWith(".view")) {
        return permissions.includes(`${permission.slice(0, -5)}.manage`);
      }
      return false;
    },
    [permissions, user?.role],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        refreshUser,
        permissions,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
