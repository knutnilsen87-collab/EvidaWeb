import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StickyChatBar } from "./StickyChatBar";

describe("StickyChatBar", () => {
  it("keeps mode choices behind the trigger menu", () => {
    render(<StickyChatBar activeCaseName="Holands Hage" onNavigate={vi.fn()} />);

    expect(screen.getByLabelText("Saksassistent kommando")).toHaveAttribute("placeholder", "Spør om saken...");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Velg analysemodus" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Argumentere" }));

    expect(screen.getByLabelText("Saksassistent kommando")).toHaveAttribute(
      "placeholder",
      "Stresstest en anførsel..."
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens Saksrom when a command is submitted", () => {
    const onNavigate = vi.fn();
    render(<StickyChatBar activeCaseName="Holands Hage" onNavigate={onNavigate} />);

    fireEvent.change(screen.getByLabelText("Saksassistent kommando"), {
      target: { value: "Vis mulig motstrid" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onNavigate).toHaveBeenCalledWith("saksrom");
  });
});
