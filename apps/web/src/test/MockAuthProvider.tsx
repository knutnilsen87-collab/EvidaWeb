import type { ReactNode } from "react";
import { AuthContext, type AuthContextValue } from "../context/AuthContext";
import type { User } from "../lib/auth";

export const mockAuthenticatedUser: User = {
  id: "00000000-0000-0000-0000-000000000102",
  email: "jurist@firma.no",
  name: "Advokat Hansen",
  tenantId: "00000000-0000-0000-0000-000000000101",
  roles: ["USER"]
};

export function MockAuthProvider({
  children,
  user = mockAuthenticatedUser,
  loading = false
}: {
  children: ReactNode;
  user?: User | null;
  loading?: boolean;
}) {
  const value: AuthContextValue = {
    user,
    loading,
    login: () => undefined,
    logout: () => undefined
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
