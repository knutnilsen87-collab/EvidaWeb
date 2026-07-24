import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopBar } from "./TopBar";

describe("TopBar", () => {
  it("shows the pilot data policy boundary", () => {
    render(
      <TopBar
        actions={[]}
        activeCaseName={null}
        identity={{
          authenticated: true,
          loading: false,
          name: "Advokat Hansen",
          tenantId: "00000000-0000-0000-0000-000000000101"
        }}
        lastAction=""
        onLogin={() => undefined}
      />
    );

    expect(screen.getByLabelText("Pilotstatus")).toHaveTextContent("Pilot");
    expect(screen.getByLabelText("Pilotstatus")).toHaveTextContent("Testdata only");
    expect(screen.getByText("Opprett sak for å starte")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Søk i sak, dokumenter, bevis (Cmd+K)...")).toBeInTheDocument();
  });
});
