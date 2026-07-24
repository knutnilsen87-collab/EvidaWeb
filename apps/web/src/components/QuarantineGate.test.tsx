import type { ComponentProps } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EVIDA_TENANT_HEADER } from "../lib/auth";
import { AuthProvider } from "../context/AuthContext";
import { QuarantineGate } from "./QuarantineGate";
import { uploadQueue } from "../lib/uploadQueue";

const tenantId = "00000000-0000-0000-0000-000000000101";

function backendDocument(filename = "Skannet_Vedlegg_B.png", status = "QUARANTINE") {
  return {
    id: "doc_backend_1",
    tenantId,
    createdBy: "00000000-0000-0000-0000-000000000102",
    filename,
    originalFilename: filename,
    size: 4,
    contentType: "image/png",
    sha256: "hash",
    status,
    message: "Dokument ligger i karantene.",
    pageCount: 1
  };
}

function renderGate(props: Partial<ComponentProps<typeof QuarantineGate>> = {}) {
  return render(
    <AuthProvider>
      <QuarantineGate caseId="case_web_demo" {...props} />
    </AuthProvider>
  );
}

describe("QuarantineGate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    uploadQueue.clearQueue();
  });

  it("loads documents from backend and shows quarantine state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [backendDocument()]
      })
    );

    renderGate();

    expect(screen.getByText(/Henter dokumenter/i)).toBeInTheDocument();
    expect(await screen.findByText("Skannet_Vedlegg_B.png")).toBeInTheDocument();
    expect(screen.getByText("Dokumentlisten er lastet fra backend.")).toBeInTheDocument();
    expect(screen.getByText("I karantene")).toBeInTheDocument();
  });

  it("approves a quarantined document as source", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [backendDocument()]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...backendDocument(), status: "APPROVED_FOR_INGESTION" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });
    vi.stubGlobal("fetch", fetchMock);
    renderGate();

    await screen.findByText("Skannet_Vedlegg_B.png");
    await user.click(screen.getByRole("button", { name: "Godkjenn Skannet_Vedlegg_B.png for ingestion" }));

    await waitFor(() => {
      expect(screen.queryByText("Skannet_Vedlegg_B.png")).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/doc_backend_1/approve-ingestion",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("opens an accessible preview and runs the same approve action from the modal", async () => {
    const user = userEvent.setup();
    const submitting = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [backendDocument()]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...backendDocument(), status: "APPROVED_FOR_INGESTION" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });
    vi.stubGlobal("fetch", fetchMock);
    renderGate({ onControlActionSubmitting: submitting });

    await screen.findByText("Skannet_Vedlegg_B.png");
    await user.click(screen.getByRole("button", { name: "Åpne kontrollpreview for Skannet_Vedlegg_B.png" }));

    const dialog = screen.getByRole("dialog", { name: "Skannet_Vedlegg_B.png" });
    expect(within(dialog).getByText(/Hva skjer ved handling/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Forhåndsvisning åpnet/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Godkjenn for ingestion" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/documents/doc_backend_1/approve-ingestion",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(submitting).toHaveBeenCalledWith(true);
    expect(submitting).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("replaces an active document with a new quarantined version", async () => {
    const user = userEvent.setup();
    const activeDocument = {
      ...backendDocument("Prosesskriv.pdf", "SOURCE_READY"),
      versionNumber: 1,
      activeVersion: true
    };
    const replacement = {
      ...backendDocument("Prosesskriv-oppdatert.pdf", "QUARANTINE"),
      id: "doc_backend_2",
      versionNumber: 2,
      supersedesDocumentId: activeDocument.id,
      activeVersion: true
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [activeDocument] })
      .mockResolvedValueOnce({ ok: true, json: async () => replacement })
      .mockResolvedValueOnce({ ok: true, json: async () => [replacement] });
    vi.stubGlobal("fetch", fetchMock);
    renderGate();

    await screen.findByText("Prosesskriv.pdf");
    await user.click(screen.getByRole("button", { name: /kontrollpreview for Prosesskriv\.pdf/i }));
    await user.upload(
      screen.getByLabelText("Erstatt Prosesskriv.pdf med ny versjon"),
      new File(["oppdatert"], "Prosesskriv-oppdatert.pdf", { type: "application/pdf" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/documents/doc_backend_1/replace",
        expect.objectContaining({ method: "POST", body: expect.any(FormData) })
      );
    });
    expect(await screen.findByText(/Ny versjon 2 er lagt i karantene/i)).toBeInTheDocument();
  });

  it("shows a Saksrom CTA, not archive, for partial source ready documents", async () => {
    const user = userEvent.setup();
    const openSaksrom = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [backendDocument("Masterdoc_001.pdf", "PARTIAL_SOURCE_READY")]
      })
    );

    renderGate({ onOpenSaksrom: openSaksrom });

    await screen.findByText("Masterdoc_001.pdf");
    expect(screen.getByRole("button", { name: "Åpne Saksrom for Masterdoc_001.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arkiver Masterdoc_001.pdf" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Åpne Saksrom for Masterdoc_001.pdf" }));
    expect(openSaksrom).toHaveBeenCalledTimes(1);
  });

  it("uploads a document, refreshes backend list and shows success state", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/me")) {
        return {
          ok: true,
          json: async () => ({
            id: "00000000-0000-0000-0000-000000000102",
            email: "jurist@firma.no",
            name: "Advokat Hansen",
            tenantId: "00000000-0000-0000-0000-000000000101",
            roles: ["USER"]
          })
        };
      }
      if (urlStr.includes("/api/documents/check-duplicates")) {
        return {
          ok: true,
          json: async () => [{ sha256: "hash", exists: false, documentId: "", status: "" }]
        };
      }
      if (urlStr.includes("/api/documents/upload")) {
        return {
          ok: true,
          json: async () => ({
            ...backendDocument("nytt_bevis.pdf"),
            id: "doc_uploaded",
            status: "QUARANTINE"
          })
        };
      }
      if (urlStr.includes("/api/documents")) {
        // Initial call returns empty list, subsequent calls return uploaded document
        if (fetchMock.mock.calls.filter(c => String(c[0]).includes("/api/documents") && !String(c[0]).includes("check-duplicates") && !String(c[0]).includes("upload")).length <= 1) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => [backendDocument("nytt_bevis.pdf")] };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderGate();

    await screen.findByText("Backend har ingen karantene-dokumenter for aktiv tenant.");
    await user.upload(
      screen.getByLabelText("Last opp dokument"),
      new File(["test"], "nytt_bevis.pdf", { type: "application/pdf" })
    );

    // Wait for the document to show up in the grid
    expect(await screen.findByText("nytt_bevis.pdf")).toBeInTheDocument();
    expect(screen.getByLabelText("Last opp dokument")).toHaveAttribute("multiple");
  });

  it("shows backend upload errors", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/me")) {
        return {
          ok: true,
          json: async () => ({
            id: "00000000-0000-0000-0000-000000000102",
            email: "jurist@firma.no",
            name: "Advokat Hansen",
            tenantId: "00000000-0000-0000-0000-000000000101",
            roles: ["USER"]
          })
        };
      }
      if (urlStr.includes("/api/documents/check-duplicates")) {
        return {
          ok: true,
          json: async () => [{ sha256: "hash", exists: false, documentId: "", status: "" }]
        };
      }
      if (urlStr.includes("/api/documents/upload")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ message: "UPLOAD_REJECTED_EMPTY_FILE" })
        };
      }
      if (urlStr.includes("/api/documents")) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderGate();

    await screen.findByText("Backend har ingen karantene-dokumenter for aktiv tenant.");
    await user.upload(
      screen.getByLabelText("Last opp dokument"),
      new File(["bad file content"], "tom.pdf", { type: "application/pdf" })
    );

    // Wait for queue state changes
    await waitFor(() => {
      // In the new queue, failed uploads are logged inside the queue items list or error triggers
      // Wait for it to fail
      expect(uploadQueue.getState().items[0]?.status).toBe("FAILED");
      expect(uploadQueue.getState().items[0]?.errorMessage).toBe("UPLOAD_REJECTED_EMPTY_FILE");
    });
  });
});
