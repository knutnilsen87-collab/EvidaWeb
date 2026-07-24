import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { DocumentImport } from "./DocumentImport";
import { uploadQueue } from "../lib/uploadQueue";
import * as api from "../lib/api";
import { authService } from "../lib/auth";

// Stub Worker globally in JSDOM context inside vi.hoisted so it runs before imports
const MockWorker = vi.hoisted(() => {
  class MockWorker {
    onmessage: any = null;
    onerror: any = null;
    static instances: MockWorker[] = [];

    constructor() {
      MockWorker.instances.push(this);
    }

    postMessage(data: any) {}
    terminate(data: any) {}
  }

  // Stub globally immediately inside hoisted block
  globalThis.Worker = MockWorker as any;
  if (typeof window !== "undefined") {
    (window as any).Worker = MockWorker as any;
  }

  return MockWorker;
});

const tenantId = "00000000-0000-0000-0000-000000000101";
const backendCaseId = "11111111-2222-4333-8444-555555555555";

function mockDoc(id = "doc_1", filename = "bevis_a.pdf", status = "quarantine", message = "Ok") {
  return {
    id,
    tenantId,
    createdBy: "user_1",
    filename,
    originalFilename: filename,
    size: 1024,
    contentType: "application/pdf",
    sha256: `hash_${id}`,
    status: status === "quarantine" ? "QUARANTINE" : status.toUpperCase(),
    message,
    ingestionError: status === "ingestion_failed" || status === "partial_source_ready" ? message : null,
    pageCount: 10
  };
}

function mockJob(documentId = "doc_1", status = "PENDING", pagesProcessed = 0, pagesTotal = 10) {
  return {
    id: `job_${documentId}`,
    tenantId,
    caseId: backendCaseId,
    documentId,
    status,
    pagesProcessed,
    pagesTotal,
    errorMessage: status === "FAILED"
      ? "OCR error on page 3"
      : status === "COMPLETED_WITH_WARNINGS"
      ? "PARTIAL_OCR_RUNTIME_MISSING pages=1-5 text_below_threshold=75 parsed_pages=72/78"
      : null,
    attemptCount: 1,
    createdAt: "2026-07-06T12:00:00Z",
    updatedAt: "2026-07-06T12:00:00Z"
  };
}

let fetchMock: any;

function renderImport(initialFiles: File[] = [], onInitialFilesAccepted?: () => void) {
  return render(
    <AuthProvider>
      <DocumentImport
        caseId={backendCaseId}
        initialFiles={initialFiles}
        onInitialFilesAccepted={onInitialFilesAccepted}
        pollIntervalMs={10}
      />
    </AuthProvider>
  );
}

function renderImportWithContinue(onContinueToSaksrom: () => void) {
  return render(
    <AuthProvider>
      <DocumentImport caseId={backendCaseId} onContinueToSaksrom={onContinueToSaksrom} pollIntervalMs={10} />
    </AuthProvider>
  );
}

describe("DocumentImport UI & Ingestion Polling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    uploadQueue.clearQueue();
    uploadQueue.flushIntervalMs = 0; // immediate updates for tests

    // Reset default mock postMessage behavior to be synchronous
    MockWorker.prototype.postMessage = vi.fn(function (this: any, data) {
      if (data.type === "HASH") {
        if (this.onmessage) {
          this.onmessage({
            data: { type: "SUCCESS", fileId: data.fileId, sha256: `hash_${data.fileId}` }
          });
        }
      }
    });

    // Provide default safe API mocks
    vi.spyOn(authService, "checkAuth").mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000102",
      email: "jurist@firma.no",
      name: "Advokat Hansen",
      tenantId,
      roles: ["USER"]
    });
    vi.spyOn(api, "checkDocumentDuplicates").mockResolvedValue([]);
    vi.spyOn(api, "uploadDocument").mockResolvedValue({
      id: "doc_default",
      tenantId: "tenant_123",
      filename: "default.pdf",
      size: 100,
      sha256: "hash",
      status: "QUARANTINE",
      message: "ok",
      createdBy: "user_default"
    });

    fetchMock = vi.fn().mockImplementation(async (url: any, options?: any) => {
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
      return { ok: true, json: async () => [] };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders uploader dropzone, actions and table instead of Mock API card", async () => {
    renderImport();

    expect(await screen.findByText("Last opp dokumentene som skal brukes i saken.")).toBeInTheDocument();
    expect(screen.getByLabelText("Dokumentflyt")).toHaveTextContent("Lastet opp");
    expect(screen.getByLabelText("Dokumentflyt")).toHaveTextContent("Kontrolleres");
    expect(screen.getByLabelText("Dokumentflyt")).toHaveTextContent("Kilder klare");
    expect(screen.queryByText(/karantene-slusen/i)).not.toBeInTheDocument();
    expect(await screen.findByText("Slipp filer eller mapper her")).toBeInTheDocument();
    expect(screen.getByText("Støtter PDF og TXT")).toBeInTheDocument();
    expect(screen.queryByText(/DOCX/i)).not.toBeInTheDocument();
    expect(screen.getByText("Velg filer")).toBeInTheDocument();
    expect(screen.getByText("Velg mappe")).toBeInTheDocument();
    expect(screen.getByLabelText("Velg filer")).not.toHaveAttribute("accept", expect.stringContaining(".zip"));
    expect(screen.queryByText("Mock API")).not.toBeInTheDocument();
  });

  it("enqueues files selected through input controls", async () => {
    // Keep uploads pending so files remain visible in progress list
    const uploadSpy = vi.spyOn(api, "uploadDocument").mockReturnValue(new Promise(() => {}));

    renderImport();

    const fileInput = await screen.findByLabelText("Velg filer");
    const file = new File(["test"], "my_contract.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText(/my_contract.pdf/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Laster opp dokumentet/i).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledWith(file, tenantId, backendCaseId, expect.any(AbortSignal));
    });
  });

  it("enqueues modal-provided files as soon as the backend case is ready", async () => {
    const file = new File(["kilde"], "direkte_fra_modal.txt", { type: "text/plain" });
    const onAccepted = vi.fn();

    renderImport([file], onAccepted);

    await waitFor(() => {
      expect(api.uploadDocument).toHaveBeenCalledWith(file, tenantId, backendCaseId, expect.any(AbortSignal));
      expect(onAccepted).toHaveBeenCalledTimes(1);
    });
  });

  it("auto-starts safe document control after a successful upload", async () => {
    const file = new File(["test"], "auto_process.pdf", { type: "application/pdf" });
    vi.spyOn(api, "uploadDocument").mockResolvedValue({
      id: "doc_uploaded",
      tenantId,
      filename: "auto_process.pdf",
      size: 100,
      sha256: "hash_doc_uploaded",
      status: "QUARANTINE",
      message: "ok",
      createdBy: "user_default"
    });

    fetchMock.mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/me")) {
        return {
          ok: true,
          json: async () => ({
            id: "00000000-0000-0000-0000-000000000102",
            email: "jurist@firma.no",
            name: "Advokat Hansen",
            tenantId,
            roles: ["USER"]
          })
        };
      }
      if (urlStr.includes("/api/documents/doc_uploaded/approve-ingestion")) {
        return {
          ok: true,
          json: async () => ({
            ...mockDoc("doc_uploaded", "auto_process.pdf", "approved_for_ingestion"),
            ingestionJobId: "job_doc_uploaded",
            ingestionJobStatus: "PENDING"
          })
        };
      }
      if (urlStr.includes("/api/ingestion-jobs")) {
        return { ok: true, json: async () => [mockJob("doc_uploaded", "PENDING", 0, 10)] };
      }
      if (urlStr.includes("/api/documents")) {
        return { ok: true, json: async () => [mockDoc("doc_uploaded", "auto_process.pdf", "approved_for_ingestion")] };
      }
      return { ok: true, json: async () => [] };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderImport();

    const fileInput = await screen.findByLabelText("Velg filer");
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/documents/doc_uploaded/approve-ingestion"),
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(screen.queryByRole("button", { name: "Start behandling" })).not.toBeInTheDocument();
  });

  it("displays ignored system files counts and rejected files reasons", async () => {
    renderImport();

    await screen.findByText("Slipp filer eller mapper her");

    // Directly add files to uploadQueue to trigger state in DocumentImport
    uploadQueue.addFiles([
      new File(["foo"], ".DS_Store", { type: "text/plain" }),
      new File(["foo"], "readme.exe", { type: "application/octet-stream" })
    ]);

    expect(await screen.findByText(/1 systemfil ignorert/i)).toBeInTheDocument();
    expect(screen.getByText(/1 fil avvist/i)).toBeInTheDocument();
    expect(screen.getByText(/readme.exe: Ugyldig filtype/i)).toBeInTheDocument();
  });

  it("polls active ingestion jobs and updates status on completion", async () => {
    let docStatus = "ingesting";
    let jobStatus = "RUNNING";
    let pagesProcessed = 3;

    fetchMock.mockImplementation(async (url: any) => {
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
      if (urlStr.includes("/api/documents")) {
        return {
          ok: true,
          json: async () => [mockDoc("doc_1", "bevis_a.pdf", docStatus)]
        };
      }
      if (urlStr.includes("/api/ingestion-jobs")) {
        return {
          ok: true,
          json: async () => [mockJob("doc_1", jobStatus, pagesProcessed, 10)]
        };
      }
      return { ok: false, status: 500 };
    });

    renderImport();

    await waitFor(() => {
      expect(screen.getByText("bevis_a.pdf")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Side 3 av 10")).toBeInTheDocument();
    });

    // Manually transition mock state to complete
    docStatus = "source_ready";
    jobStatus = "COMPLETED";
    pagesProcessed = 10;

    await waitFor(() => {
      expect(screen.getAllByText("Kildegrunnlaget er klart").length).toBeGreaterThan(0);
    });
  });

  it("shows partial source-ready page coverage for mixed PDFs", async () => {
    const warning = "PARTIAL_OCR_RUNTIME_MISSING pages=1-5 text_below_threshold=75 parsed_pages=72/78";

    fetchMock.mockImplementation(async (url: any) => {
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
      if (urlStr.includes("/api/documents")) {
        return {
          ok: true,
          json: async () => [mockDoc("doc_1", "masterdoc.pdf", "partial_source_ready", warning)]
        };
      }
      if (urlStr.includes("/api/ingestion-jobs")) {
        return {
          ok: true,
          json: async () => [mockJob("doc_1", "COMPLETED_WITH_WARNINGS", 72, 78)]
        };
      }
      return { ok: false };
    });

    renderImport();

    expect(await screen.findByText("Delvis klart")).toBeInTheDocument();
    expect(screen.getAllByText(/72 av 78 sider kan brukes/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/5 sider krever OCR/i)).toBeInTheDocument();
    expect(screen.getByText(/1 side krever kontroll/i)).toBeInTheDocument();
  });

  it("pauses polling when visibility state is hidden, and resumes when visible", async () => {
    fetchMock.mockImplementation(async (url: any) => {
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
      if (urlStr.includes("/api/documents")) {
        return { ok: true, json: async () => [mockDoc("doc_1", "bevis_a.pdf", "ingesting")] };
      }
      if (urlStr.includes("/api/ingestion-jobs")) {
        return { ok: true, json: async () => [mockJob("doc_1", "RUNNING", 4, 10)] };
      }
      return { ok: false };
    });

    renderImport();

    await waitFor(() => {
      expect(screen.getByText("bevis_a.pdf")).toBeInTheDocument();
    });

    fetchMock.mockClear();

    // Stub document.visibilityState to hidden
    const visibilitySpy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));

    // Wait a brief moment
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetchMock).not.toHaveBeenCalled();

    // Restore visibility to visible
    visibilitySpy.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));

    // Wait for the poll to trigger
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  it("allows retrying failed ingestion jobs", async () => {
    const user = userEvent.setup({ delay: null });
    let docStatus = "ingestion_failed";
    let jobStatus = "FAILED";
    let pagesProcessed = 2;

    fetchMock.mockImplementation(async (url: any, options?: any) => {
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
      if (urlStr.includes("/api/documents")) {
        return { ok: true, json: async () => [mockDoc("doc_1", "failed_file.pdf", docStatus, "OCR error on page 3")] };
      }
      if (urlStr.includes("/api/ingestion-jobs/job_doc_1/retry")) {
        jobStatus = "PENDING";
        pagesProcessed = 0;
        return { ok: true, json: async () => mockJob("doc_1", "PENDING", 0, 10) };
      }
      if (urlStr.includes("/api/ingestion-jobs")) {
        return { ok: true, json: async () => [mockJob("doc_1", jobStatus, pagesProcessed, 10)] };
      }
      return { ok: false };
    });

    renderImport();

    expect(await screen.findByText("failed_file.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("Dokumentet kunne ikke klargjøres. Se detaljer eller prøv igjen.").length).toBeGreaterThan(0);

    const retryBtn = await screen.findByRole("button", { name: "Prøv igjen" });
    await user.click(retryBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/ingestion-jobs/job_doc_1/retry"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("manual fallback controls the document and never calls the retired synchronous /ingest endpoint", async () => {
    const user = userEvent.setup();
    let approved = false;
    fetchMock = vi.fn().mockImplementation(async (url: any, options?: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/documents/doc_1/approve-ingestion")) {
        approved = true;
        return {
          ok: true,
          json: async () => ({ ...mockDoc("doc_1", "bevis_a.pdf", "approved_pending_ingestion"), ingestionJobId: "job_doc_1", ingestionJobStatus: "PENDING" })
        };
      }
      if (urlStr.match(/\/api\/documents\/doc_1\/ingest$/)) {
        throw new Error("legacy synchronous /ingest endpoint must not be called (410 Gone)");
      }
      if (urlStr.includes("/api/ingestion-jobs")) {
        return { ok: true, json: async () => (approved ? [mockJob("doc_1", "PENDING", 0, 10)] : []) };
      }
      if (urlStr.includes("/api/documents")) {
        return { ok: true, json: async () => [mockDoc("doc_1", "bevis_a.pdf", approved ? "approved_pending_ingestion" : "quarantine")] };
      }
      return { ok: false };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderImport();
    const startBtn = await screen.findByRole("button", { name: "Kontroller dokumentet" });
    await user.click(startBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/documents/doc_1/approve-ingestion"),
        expect.objectContaining({ method: "POST" })
      );
    });
    const ingestCalls = fetchMock.mock.calls.filter(([u]: [any]) => String(u).match(/\/api\/documents\/doc_1\/ingest$/));
    expect(ingestCalls).toHaveLength(0);
    expect(await screen.findByText(/Dokumentet er satt i behandlingskø/i)).toBeTruthy();
  });

  it("shows one best next action for eligible and ready documents", async () => {
    fetchMock = vi.fn().mockImplementation(async (url: any) => {
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
      if (urlStr.includes("/api/documents")) {
        return { ok: true, json: async () => [
          mockDoc("doc_1", "doc1.pdf", "quarantine"),
          mockDoc("doc_2", "doc2.pdf", "quarantine")
        ] };
      }
      if (urlStr.includes("/api/ingestion-jobs")) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderImport();
    expect(await screen.findByRole("button", { name: "Kontroller dokumentet" })).toBeInTheDocument();

    // Re-mock with 0 quarantine
    fetchMock = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/documents")) {
        return { ok: true, json: async () => [
          mockDoc("doc_3", "doc3.pdf", "source_ready")
        ] };
      }
      if (urlStr.includes("/api/ingestion-jobs")) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderImport();
    expect(await screen.findByRole("button", { name: "Åpne Saksrom" })).toBeInTheDocument();
  });

  it("keeps a preliminary Saksrom continuation action visible when no documents are eligible for bulk start", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    fetchMock = vi.fn().mockImplementation(async (url: any) => {
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
      if (urlStr.includes("/api/documents")) {
        return { ok: true, json: async () => [
          mockDoc("doc_ready", "klar.pdf", "source_ready"),
          mockDoc("doc_wait", "venter.pdf", "ingesting"),
          mockDoc("doc_failed", "feilet.pdf", "ingestion_failed", "PDF_PARSE_FAILED")
        ] };
      }
      if (urlStr.includes("/api/ingestion-jobs")) {
        return { ok: true, json: async () => [
          mockJob("doc_wait", "RUNNING", 2, 10),
          mockJob("doc_failed", "FAILED", 1, 10)
        ] };
      }
      return { ok: false };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderImportWithContinue(onContinue);

    const continueButton = await screen.findByRole("button", {
      name: "Fortsett til Saksrom med foreløpig kildegrunnlag"
    });
    expect(continueButton).toBeInTheDocument();
    expect(screen.getByText("Kildedekning: 33%")).toBeInTheDocument();

    await user.click(continueButton);
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Vis problem" })).toBeInTheDocument();
  });

  it("shows Vis problem action for failed docs and translates errors with expandable technical code", async () => {
    const user = userEvent.setup();
    fetchMock = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/documents")) {
        return { ok: true, json: async () => [
          {
            ...mockDoc("doc_1", "bad.pdf", "ingestion_failed"),
            ingestionError: "PDF_PARSE_FAILED"
          }
        ] };
      }
      if (urlStr.includes("/api/ingestion-jobs")) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderImport();
    expect(await screen.findByText("Kunne ikke klargjøres")).toBeInTheDocument();
    
    const showProblemBtn = await screen.findByRole("button", { name: "Vis problem" });
    await user.click(showProblemBtn);

    expect(screen.getAllByText("PDF-en kunne ikke leses").length).toBeGreaterThan(0);
    expect(screen.getByText(/Dette dokumentet kunne ikke leses som PDF/)).toBeInTheDocument();
    expect(screen.queryByText("PDF_PARSE_FAILED")).not.toBeInTheDocument();

    const techDetailsBtn = screen.getByRole("button", { name: "Vis tekniske detaljer" });
    await user.click(techDetailsBtn);
    expect(screen.getByText("PDF_PARSE_FAILED")).toBeInTheDocument();
  });

  it("shows Åpne dokument for quarantined docs and opens the fetched blob URL on click", async () => {
    const user = userEvent.setup();
    fetchMock = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/documents")) {
        return { ok: true, json: async () => [mockDoc("doc_1", "kontrakt.pdf", "quarantine")] };
      }
      if (urlStr.includes("/api/ingestion-jobs")) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false };
    });
    vi.stubGlobal("fetch", fetchMock);

    const downloadSpy = vi
      .spyOn(api, "downloadDocumentUrl")
      .mockResolvedValue("blob:http://localhost/mock-document");
    const windowOpenSpy = vi.spyOn(window, "open").mockReturnValue(null);

    renderImport();

    const openBtn = await screen.findByRole("button", { name: "Åpne dokument" });
    await user.click(openBtn);

    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith("doc_1", tenantId);
      expect(windowOpenSpy).toHaveBeenCalledWith("blob:http://localhost/mock-document", "_blank");
    });
  });

  it("shows an error notice when Åpne dokument fails, without changing document status", async () => {
    const user = userEvent.setup();
    fetchMock = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/documents")) {
        return { ok: true, json: async () => [mockDoc("doc_1", "kontrakt.pdf", "quarantine")] };
      }
      if (urlStr.includes("/api/ingestion-jobs")) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false };
    });
    vi.stubGlobal("fetch", fetchMock);

    vi.spyOn(api, "downloadDocumentUrl").mockRejectedValue(new Error("EVIDA API-feil 404"));
    const windowOpenSpy = vi.spyOn(window, "open").mockReturnValue(null);

    renderImport();

    const openBtn = await screen.findByRole("button", { name: "Åpne dokument" });
    await user.click(openBtn);

    expect(await screen.findByText("EVIDA API-feil 404")).toBeInTheDocument();
    expect(windowOpenSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Mottatt")).toBeInTheDocument();
  });
});
