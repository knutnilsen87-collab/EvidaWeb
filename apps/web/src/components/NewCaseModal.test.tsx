import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewCaseModal } from "./NewCaseModal";

describe("NewCaseModal", () => {
  it("creates a case after the user names it", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewCaseModal isOpen onClose={vi.fn()} onCreate={onCreate} />);

    expect(screen.getByRole("dialog", { name: "Opprett ny sak" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Opprett ny sak" })).toHaveClass("modal-container");
    expect(screen.getByRole("button", { name: "Opprett arbeidsområde" })).toBeDisabled();

    await user.type(screen.getByLabelText("Navn på saken"), "Holands Hage");
    await user.click(screen.getByRole("button", { name: "Opprett arbeidsområde" }));

    expect(onCreate).toHaveBeenCalledWith("Holands Hage");
  });
});
