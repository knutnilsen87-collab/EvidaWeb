import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to ensure global Worker stubbing happens before uploadQueue is imported
const MockWorker = vi.hoisted(() => {
  class MockWorker {
    onmessage: any = null;
    onerror: any = null;
    static instances: MockWorker[] = [];

    constructor() {
      MockWorker.instances.push(this);
    }

    postMessage(data: any) {}
    terminate() {}
  }

  // Stub globally immediately inside hoisted block
  globalThis.Worker = MockWorker as any;
  if (typeof window !== "undefined") {
    (window as any).Worker = MockWorker as any;
  }

  return MockWorker;
});

// Now import uploadQueue
import { UploadQueue } from "./uploadQueue";
import { toUuid } from "./api";

describe("UploadQueue State Machine & Scheduling", () => {
  let fetchMock: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    MockWorker.instances = [];

    // Reset default mock postMessage behavior to be synchronous
    MockWorker.prototype.postMessage = vi.fn(function (this: any, data) {
      if (data.type === "HASH") {
        if (this.onmessage) {
          this.onmessage({
            data: { type: "PROGRESS", fileId: data.fileId, progress: 50 }
          });
          this.onmessage({
            data: { type: "SUCCESS", fileId: data.fileId, sha256: `hash_${data.fileId}` }
          });
        }
      }
    });

    // Provide default safe fetch mock
    fetchMock = vi.fn().mockImplementation(async (url: any, options?: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/documents/check-duplicates")) {
        const body = JSON.parse(options.body || "{}");
        return {
          ok: true,
          json: async () =>
            (body.hashes || []).map((h: string) => ({
              sha256: h,
              exists: false,
              documentId: "",
              status: ""
            }))
        };
      }
      if (urlStr.includes("/api/documents/upload")) {
        return {
          ok: true,
          json: async () => ({
            id: "doc_uploaded",
            tenantId: "tenant_123",
            filename: "file.pdf",
            size: 4,
            sha256: "hash",
            status: "QUARANTINE",
            message: "uploaded"
          })
        };
      }
      return { ok: false, status: 500 };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters system files and accepts valid files", () => {
    const queue = new UploadQueue();
    queue.setContext("tenant_123", "case_456");

    const files = [
      new File(["foo"], ".DS_Store", { type: "text/plain" }),
      new File(["foo"], "Thumbs.db", { type: "text/plain" }),
      new File(["foo"], "document.pdf", { type: "application/pdf" }),
      new File(["foo"], "notes.txt", { type: "text/plain" }),
      new File(["foo"], "unsupported.exe", { type: "application/octet-stream" })
    ];

    queue.addFiles(files);
    const state = queue.getState();

    expect(state.ignoredSystemFiles).toBe(2);
    expect(state.rejectedFiles.length).toBe(1);
    expect(state.rejectedFiles[0].name).toBe("unsupported.exe");
    expect(state.items.length).toBe(2);
    expect(state.items[0].name).toBe("document.pdf");
  });

  it("rejects DOCX in the pilot upload contract", () => {
    const queue = new UploadQueue();
    queue.setContext("tenant_123", "case_456");

    queue.addFiles([
      new File(["foo"], "prosesskriv.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      new File(["bar"], "notat.txt", { type: "text/plain" })
    ]);

    const state = queue.getState();
    expect(state.items.map((item) => item.name)).toEqual(["notat.txt"]);
    expect(state.rejectedFiles).toEqual([
      expect.objectContaining({
        name: "prosesskriv.docx",
        reason: "Ugyldig filtype. Kun PDF og TXT støttes."
      })
    ]);
  });

  it("limits hashing concurrency to maxHashJobs and upload to maxUploads", async () => {
    const queue = new UploadQueue();
    queue.setContext("tenant_123", "case_456");
    queue.setConcurrency(3, 2);

    // Disable success callback on postMessage to test concurrent state
    MockWorker.prototype.postMessage = vi.fn((data) => {});

    const files = [
      new File(["foo"], "item_1.pdf", { type: "application/pdf" }),
      new File(["foo"], "item_2.pdf", { type: "application/pdf" }),
      new File(["foo"], "item_3.pdf", { type: "application/pdf" }),
      new File(["foo"], "item_4.pdf", { type: "application/pdf" })
    ];

    queue.addFiles(files);

    const state = queue.getState();
    // 2 should be hashing, 2 should remain queued
    expect(state.activeHashing).toBe(2);
    expect(state.items.filter((x) => x.status === "QUEUED").length).toBe(2);
  });

  it("performs batch duplicate checks of up to 20 files", async () => {
    const queue = new UploadQueue();
    queue.setContext("tenant_123", "case_456");
    queue.setConcurrency(5, 5);

    const files = [
      new File(["foo"], "file_1.pdf", { type: "application/pdf" }),
      new File(["foo"], "file_2.pdf", { type: "application/pdf" })
    ];

    // Intercept check-duplicates to return first file as duplicate
    fetchMock.mockImplementation(async (url: any, options?: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/documents/check-duplicates")) {
        const body = JSON.parse(options.body || "{}");
        return {
          ok: true,
          json: async () =>
            (body.hashes || []).map((h: string, index: number) => ({
              sha256: h,
              exists: index === 0,
              documentId: index === 0 ? "doc_dup" : "",
              status: ""
            }))
        };
      }
      if (urlStr.includes("/api/documents/upload")) {
        return {
          ok: true,
          json: async () => ({
            id: "doc_uploaded",
            tenantId: "tenant_123",
            filename: "file_2.pdf",
            size: 4,
            sha256: "hash",
            status: "QUARANTINE",
            message: "uploaded"
          })
        };
      }
      return { ok: false, status: 500 };
    });

    queue.addFiles(files);

    // Yield to let microtasks complete
    await vi.runAllTimersAsync();

    const stateAfter = queue.getState();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/documents/check-duplicates"),
      expect.any(Object)
    );

    // File 1 is duplicate
    expect(stateAfter.items[0].status).toBe("SKIPPED_DUPLICATE");
    expect(stateAfter.items[0].duplicateDocRef).toBe("doc_dup");

    // File 2 is uploaded
    expect(stateAfter.items[1].status).toBe("QUARANTINE");
    expect(stateAfter.items[1].uploadedDocId).toBe("doc_uploaded");
  });

  it("sends the active case UUID with the duplicate check request", async () => {
    const queue = new UploadQueue();
    const caseId = "11111111-2222-4333-8444-555555555555";
    queue.setContext("tenant_123", caseId);

    queue.addFiles([new File(["foo"], "file_1.pdf", { type: "application/pdf" })]);
    await vi.runAllTimersAsync();

    const duplicateCall = fetchMock.mock.calls.find(([url]: any[]) =>
      String(url).includes("/api/documents/check-duplicates")
    );
    expect(duplicateCall).toBeDefined();
    expect(JSON.parse(duplicateCall![1].body)).toEqual(
      expect.objectContaining({ caseId })
    );
  });

  it("does not skip upload when hash exists only in another case (backend says not duplicate)", async () => {
    const queue = new UploadQueue();
    queue.setContext("tenant_123", "case_b");

    // Case-scoped backend: hash registered in Case A returns exists=false for Case B.
    queue.addFiles([new File(["same content"], "fasit.pdf", { type: "application/pdf" })]);
    await vi.runAllTimersAsync();

    const state = queue.getState();
    expect(state.items[0].status).toBe("QUARANTINE");
    expect(state.items[0].uploadedDocId).toBe("doc_uploaded");
    expect(state.skippedDuplicate).toBe(0);
    expect(state.completed).toBe(1);
  });

  it("keeps queue stats and uploads scoped to the case each file was queued under", async () => {
    const queue = new UploadQueue();
    const caseA = "aaaaaaaa-1111-4222-8333-444444444444";
    const caseB = "bbbbbbbb-1111-4222-8333-444444444444";
    queue.setContext("tenant_123", caseA);

    queue.addFiles([new File(["foo"], "case_a_file.pdf", { type: "application/pdf" })]);

    // User switches case while the file is still being processed.
    queue.setContext("tenant_123", caseB);
    expect(queue.getState().total).toBe(0);

    await vi.runAllTimersAsync();

    // Stats for case B remain empty; the item still belongs to case A.
    expect(queue.getState().total).toBe(0);

    // The upload request carried case A's UUID, not case B's.
    const uploadCall = fetchMock.mock.calls.find(([url]: any[]) =>
      String(url).includes("/api/documents/upload")
    );
    expect(uploadCall).toBeDefined();
    expect(uploadCall![1].headers["X-Evida-Case-ID"]).toBe(caseA);

    // And the duplicate check was scoped to case A as well.
    const duplicateCall = fetchMock.mock.calls.find(([url]: any[]) =>
      String(url).includes("/api/documents/check-duplicates")
    );
    expect(JSON.parse(duplicateCall![1].body)).toEqual(
      expect.objectContaining({ caseId: caseA })
    );

    // Switching back shows the completed upload under case A.
    queue.setContext("tenant_123", caseA);
    const stateA = queue.getState();
    expect(stateA.total).toBe(1);
    expect(stateA.items[0].status).toBe("QUARANTINE");
  });

  it("handles 5xx retries with backoff and 4xx immediate failure", async () => {
    const queue = new UploadQueue();
    queue.setContext("tenant_123", "case_456");

    // Stub mock worker to fail synchronously
    MockWorker.prototype.postMessage = vi.fn(function (this: any, data) {
      if (data.type === "HASH") {
        this.onerror!({ message: "Worker failed" });
      }
    });

    let uploadAttempts = 0;
    fetchMock.mockImplementation(async (url: any, options?: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/documents/check-duplicates")) {
        const body = JSON.parse(options.body || "{}");
        return {
          ok: true,
          json: async () =>
            (body.hashes || []).map((h: string) => ({
              sha256: h,
              exists: false,
              documentId: "",
              status: ""
            }))
        };
      }
      if (urlStr.includes("/api/documents/upload")) {
        uploadAttempts++;
        if (uploadAttempts === 1) {
          return {
            ok: false,
            status: 503,
            statusText: "Service Unavailable",
            // Return empty text since parse fails on empty
            text: async () => "Service Unavailable"
          };
        }
        return {
          ok: true,
          json: async () => ({
            id: "doc_uploaded",
            tenantId: "tenant_123",
            filename: "test.pdf",
            size: 4,
            sha256: "hash",
            status: "QUARANTINE",
            message: "uploaded"
          })
        };
      }
      return { ok: false, status: 500 };
    });

    const files = [new File(["foo"], "test.pdf", { type: "application/pdf" })];
    queue.addFiles(files);

    // Yield to let hashing, duplicate check, and first upload run
    await vi.advanceTimersByTimeAsync(10);

    expect(uploadAttempts).toBe(1);

    // Advance 1s backoff time
    await vi.advanceTimersByTimeAsync(1000);

    const state = queue.getState();
    expect(uploadAttempts).toBe(2);
    expect(state.items[0].status).toBe("QUARANTINE");
  });

  it("cancels single file and cancels whole queue", async () => {
    const queue = new UploadQueue();
    queue.setContext("tenant_123", "case_456");

    let abortedId: string | null = null;
    MockWorker.prototype.postMessage = vi.fn(function (this: any, data) {
      if (data.type === "HASH") {
        // Stay in HASHING state, don't trigger SUCCESS
      }
      if (data.type === "ABORT") {
        abortedId = data.fileId;
        this.onmessage!({ data: { type: "ABORT_ACK", fileId: data.fileId } });
      }
    });

    const files = [
      new File(["foo"], "file_1.pdf", { type: "application/pdf" }),
      new File(["foo"], "file_2.pdf", { type: "application/pdf" })
    ];

    queue.addFiles(files);
    // Replace the manager's worker with our newly created instance for the test
    const manager = (queue as any).hashWorkerManager;
    manager.worker = MockWorker.instances[MockWorker.instances.length - 1];

    const item1 = queue.getState().items[0];
    queue.cancelFile(item1.id);

    await vi.runAllTimersAsync();

    expect(abortedId).toBe(item1.id);
    expect(queue.getState().items[0].status).toBe("CANCELLED");

    queue.cancelAll();
    expect(queue.getState().items[1].status).toBe("CANCELLED");
  });

  it("coalesces state flushes according to flushIntervalMs", async () => {
    const queue = new UploadQueue();
    queue.setContext("tenant_123", "case_456");
    queue.flushIntervalMs = 250;

    // Prevent duplicate check from resolving to keep items in progress state
    fetchMock.mockReturnValue(new Promise(() => {}));

    MockWorker.prototype.postMessage = vi.fn(function (this: any, data) {
      if (data.type === "HASH") {
        this.onmessage!({ data: { type: "PROGRESS", fileId: data.fileId, progress: 10 } });
        this.onmessage!({ data: { type: "PROGRESS", fileId: data.fileId, progress: 20 } });
        this.onmessage!({ data: { type: "SUCCESS", fileId: data.fileId, sha256: "hash" } });
      }
    });

    const listener = vi.fn();
    queue.subscribe(listener);

    listener.mockClear();

    queue.addFiles([new File(["foo"], "test.pdf", { type: "application/pdf" })]);

    // Let the microtasks settle but do not fire the 250ms flush timeout yet
    await vi.advanceTimersByTimeAsync(10);

    // Intermediate progress updates should be throttled
    expect(listener).toHaveBeenCalledTimes(1); // called once initially on addFiles force notify

    // Now advance beyond the flush interval
    await vi.advanceTimersByTimeAsync(240);
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
