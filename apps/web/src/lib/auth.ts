export interface User {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  roles: string[];
}

export const EVIDA_TENANT_HEADER = "X-Evida-Tenant-ID";

const mockUser: User = {
  id: "00000000-0000-0000-0000-000000000102",
  email: "jurist@firma.no",
  name: "Advokat Hansen",
  tenantId: "00000000-0000-0000-0000-000000000101",
  roles: ["USER"]
};

type AuthResponse = Partial<User> & {
  id: string;
  email: string;
  tenantId: string;
  roles: string[];
};

function authBaseUrl() {
  return import.meta.env.VITE_EVIDA_API_BASE_URL ?? "";
}

function jwt() {
  return sessionStorage.getItem("jwt");
}

export const authService = {
  async checkAuth(): Promise<User | null> {
    const token = jwt();
    if (!token && !import.meta.env.DEV) {
      return null;
    }

    if (!token && import.meta.env.DEV) {
      return mockUser;
    }

    const response = await fetch(`${authBaseUrl()}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401 || response.status === 403) {
      return null;
    }

    if (!response.ok) {
      throw new Error("Kunne ikke validere EVIDA-sesjonen");
    }

    return normalizeUser((await response.json()) as AuthResponse);
  },

  getHeaders(tenantId: string): HeadersInit {
    const token = jwt();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      [EVIDA_TENANT_HEADER]: tenantId
    };
  }
};

function normalizeUser(response: AuthResponse): User {
  return {
    id: response.id,
    email: response.email,
    name: response.name ?? response.email,
    tenantId: response.tenantId,
    roles: response.roles
  };
}

export async function apiRequest<T>(
  path: string,
  user: User,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${authBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...authService.getHeaders(user.tenantId),
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(`EVIDA API-feil ${response.status}`);
  }

  return (await response.json()) as T;
}
