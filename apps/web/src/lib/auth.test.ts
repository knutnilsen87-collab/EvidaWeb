import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, authService, EVIDA_TENANT_HEADER, User } from "./auth";

const user: User = {
  id: "u1",
  email: "jurist@firma.no",
  name: "Advokat Hansen",
  tenantId: "firma_a",
  roles: ["USER"]
};

describe("authService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("adds bearer token and tenant header to API calls", () => {
    sessionStorage.setItem("jwt", "token-123");

    expect(authService.getHeaders(user.tenantId)).toEqual({
      Authorization: "Bearer token-123",
      [EVIDA_TENANT_HEADER]: "firma_a"
    });
  });

  it("uses the authenticated tenant context for apiRequest", async () => {
    sessionStorage.setItem("jwt", "token-123");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/v1/cases", user);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/cases",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
          [EVIDA_TENANT_HEADER]: "firma_a"
        })
      })
    );
  });

  it("returns null when backend rejects the session", async () => {
    sessionStorage.setItem("jwt", "expired");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 401,
        ok: false
      })
    );

    await expect(authService.checkAuth()).resolves.toBeNull();
  });
});
