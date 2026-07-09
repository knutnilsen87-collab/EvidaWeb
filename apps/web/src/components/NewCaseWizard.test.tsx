import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewCaseWizard } from "./NewCaseWizard";

describe("NewCaseWizard", () => {
  it("creates a case through the recommended workflow", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewCaseWizard isOpen onClose={vi.fn()} onCreate={onCreate} />);

    expect(screen.getByRole("dialog", { name: "Hva gjelder saken?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kontrakt & avtale" }));
    expect(screen.getByRole("heading", { name: "Anbefalt arbeidsflyt" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start anbefalt løp" }));
    await user.type(screen.getByLabelText("Navn på saken"), "Hansen vs. Bygg AS");
    await user.click(screen.getByRole("button", { name: "Opprett arbeidsområde" }));

    expect(onCreate).toHaveBeenCalledWith("Hansen vs. Bygg AS");
  });

  it("offers a criminal law workflow with evidence burden controls", async () => {
    const user = userEvent.setup();
    render(<NewCaseWizard isOpen onClose={vi.fn()} onCreate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Strafferett" }));

    expect(screen.getByText(/politidokumenter og saksdokumenter/i)).toBeInTheDocument();
    expect(screen.getByText(/utover enhver rimelig tvil/i)).toBeInTheDocument();
    expect(screen.getAllByText(/skyldkrav/i).length).toBeGreaterThan(0);
  });
});
