import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { auditClientEvent } from "../lib/api";
import { authService, User } from "../lib/auth";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (tenantId: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    authService
      .checkAuth()
      .then((authenticatedUser) => {
        if (active) {
          setUser(authenticatedUser);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: (tenantId: string) => {
        setUser({
          id: "00000000-0000-0000-0000-000000000102",
          email: "jurist@firma.no",
          name: "Advokat Hansen",
          tenantId,
          roles: ["USER"]
        });
      },
      logout: () => {
        if (user) {
          void auditClientEvent(user.tenantId, {
            eventType: "USER_LOGOUT",
            entityType: "USER",
            metadataJson: JSON.stringify({ userId: user.id })
          }).catch(() => undefined);
        }
        sessionStorage.removeItem("jwt");
        setUser(null);
      }
    }),
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}
