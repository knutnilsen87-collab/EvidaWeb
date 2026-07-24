import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewCaseModal } from "./NewCaseModal";

describe("NewCaseModal", () => {
  it("creates a case after the user names it", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewCaseModal isOpen onClose={vi.fn()} onCreate={onCreate} />);

    expect(screen.getByRole("dialog", { name: "Ny sak" })).toHaveClass("modal-container");
    expect(screen.getByText("Støtter PDF og TXT")).toBeInTheDocument();
    expect(screen.queryByText(/ZIP/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opprett uten dokumenter" })).toBeDisabled();

    await user.type(screen.getByLabelText("Navn på saken"), "Holands Hage");
    await user.click(screen.getByRole("button", { name: "Opprett uten dokumenter" }));

    expect(onCreate).toHaveBeenCalledWith("Holands Hage", [], expect.any(Function));
  });

  it("creates and initializes a case directly from selected files", async () => {
    const onCreate = vi.fn();
    const file = new File(["notat"], "Morten_sak.txt", { type: "text/plain" });
    render(<NewCaseModal isOpen onClose={vi.fn()} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText("Velg filer"), { target: { files: [file] } });

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Morten_sak", [file], expect.any(Function)));
  });

  it("accepts dropped files and derives a fallback case name", async () => {
    const onCreate = vi.fn();
    const file = new File(["notat"], "Prosesskriv.txt", { type: "text/plain" });
    render(<NewCaseModal isOpen onClose={vi.fn()} onCreate={onCreate} />);

    fireEvent.drop(screen.getByText("Slipp dokumenter her for å opprette sak og starte dokumentinntak").closest("div") as HTMLElement, {
      dataTransfer: { files: [file], items: [] }
    });

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Prosesskriv", [file], expect.any(Function)));
  });

  it("shows retry when backend case creation fails", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(new Error("Backend er utilgjengelig"));
    render(<NewCaseModal isOpen onClose={vi.fn()} onCreate={onCreate} />);
    await user.type(screen.getByLabelText("Navn på saken"), "Retry-sak");
    await user.click(screen.getByRole("button", { name: "Opprett uten dokumenter" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Backend er utilgjengelig");
    expect(screen.getByRole("button", { name: "Prøv igjen" })).toBeInTheDocument();
  });

  it("closes without creating when cancelled or escaped", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreate = vi.fn();
    const { rerender } = render(<NewCaseModal isOpen onClose={onClose} onCreate={onCreate} />);

    await user.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();

    onClose.mockClear();
    rerender(<NewCaseModal isOpen onClose={onClose} onCreate={onCreate} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
