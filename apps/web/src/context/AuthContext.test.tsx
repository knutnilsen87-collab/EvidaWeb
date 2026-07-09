import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

function AuthProbe() {
  const { user, loading, login, logout } = useAuth();

  return (
    <section>
      <p>{loading ? "Laster" : "Klar"}</p>
      <p>{user ? `${user.name} / ${user.tenantId}` : "Ingen bruker"}</p>
      <button onClick={() => login("tenant_demo_b")} type="button">
        Logg inn tenant B
      </button>
      <button onClick={logout} type="button">
        Logg ut
      </button>
    </section>
  );
}

describe("AuthProvider", () => {
  it("loads dev identity and allows tenant switching in development mode", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    expect(await screen.findByText(/Advokat Hansen/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Logg inn tenant B" }));

    expect(screen.getByText(/tenant_demo_b/)).toBeInTheDocument();
  });

  it("can clear the active identity", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    expect(await screen.findByText(/Advokat Hansen/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Logg ut" }));

    expect(screen.getByText("Ingen bruker")).toBeInTheDocument();
  });
});
