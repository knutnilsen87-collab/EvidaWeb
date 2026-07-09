import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  it("opens with Ctrl+K and runs a selected action", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    render(
      <CommandPalette
        actions={[
          {
            id: "open-quarantine",
            label: "Åpne karantene-sluse",
            description: "Kontroller dokumenter",
            onRun
          }
        ]}
      />
    );

    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("dialog", { name: "Command Palette" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("filters commands by query", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        actions={[
          {
            id: "quarantine",
            label: "Åpne karantene-sluse",
            description: "Kontroller dokumenter",
            onRun: vi.fn()
          },
          {
            id: "analysis",
            label: "Åpne analyse-rom",
            description: "Forbered analyse",
            onRun: vi.fn()
          }
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: /Åpne kommandoer/i }));
    await user.type(screen.getByLabelText("Søk i kommandoer"), "analyse");

    expect(screen.getByText("Åpne analyse-rom")).toBeInTheDocument();
    expect(screen.queryByText("Åpne karantene-sluse")).not.toBeInTheDocument();
  });
});
