import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EVIDA_TENANT_HEADER } from "../lib/auth";
import { AuthProvider } from "../context/AuthContext";
import { QuarantineGate } from "./QuarantineGate";
import { uploadQueue } from "../lib/uploadQueue";

const tenantId = "00000000-0000-0000-0000-000000000101";

function backendDocument(filename = "Skannet_Vedlegg_B.png") {
  return {
    id: "doc_backend_1",
    tenantId,
    createdBy: "00000000-0000-0000-0000-000000000102",
    filename,
    originalFilename: filename,
    size: 4,
    contentType: "image/png",
    sha256: "hash",
    status: "QUARANTINE",
    message: "Dokument ligger i karantene.",
    pageCount: 1
  };
}

function renderGate() {
  return render(
    <AuthProvider>
      <QuarantineGate caseId="case_web_demo" />
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
