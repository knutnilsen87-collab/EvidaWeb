import { beforeEach, describe, expect, it, vi } from "vitest";

// Prompt 5 frontend stress gate (verification only, no production code changes).
// Scenario manifest: all expected numbers live here, not spread through assertions.
const SCENARIO = {
  queueSize: 500,
  expectedDuplicates: 480,
  expectedUniques: 20,
  expectedFailed: 1,
  expectedCompleted: 19,
  maxUploadConcurrency: 3,
  maxHashConcurrency: 2,
  duplicateBatchSize: 20
};

// Same hoisted Worker stub pattern as uploadQueue.test.ts so hashing resolves synchronously.
const MockWorker = vi.hoisted(() => {
  class MockWorker {
    onmessage: any = null;
    onerror: any = null;
    static instances: MockWorker[] = [];

    constructor() {
      MockWorker.instances.push(this);
    }

    postMessage(data: any) {
      if (data.type === "HASH" && this.onmessage) {
        this.onmessage({
          data: { type: "SUCCESS", fileId: data.fileId, sha256: `hash_${data.fileId}` }
        });
      }
    }
    terminate() {}
  }
  globalThis.Worker = MockWorker as any;
  if (typeof window !== "undefined") {
    (window as any).Worker = MockWorker as any;
  }
  return MockWorker;
});

import { UploadQueue } from "./uploadQueue";

describe("UploadQueue stress gate (Prompt 5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWorker.instances = [];
  });

  it("survives a 500-file duplicate storm without collapsing, losing terminal states or exceeding concurrency", async () => {
    const uniqueGranted = new Set<string>();
    const duplicateBatchSizes: number[] = [];
    let activeUploads = 0;
    let maxObservedUploadConcurrency = 0;
    let uploadCalls = 0;
    let failInjected = false;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: any, options?: any) => {
        const urlStr = String(url);

        if (urlStr.includes("/api/documents/check-duplicates")) {
          const body = JSON.parse(options?.body || "{}");
          const hashes: string[] = body.hashes || [];
          duplicateBatchSizes.push(hashes.length);
          return {
            ok: true,
            json: async () =>
              hashes.map((h) => {
                if (uniqueGranted.has(h)) {
                  return { sha256: h, exists: false, documentId: "", status: "" };
                }
                if (uniqueGranted.size < SCENARIO.expectedUniques) {
                  uniqueGranted.add(h);
                  return { sha256: h, exists: false, documentId: "", status: "" };
                }
                return { sha256: h, exists: true, documentId: `existing_${h.slice(0, 12)}`, status: "QUARANTINE" };
              })
          };
        }

        if (urlStr.includes("/api/documents/upload")) {
          uploadCalls++;
          if (!failInjected) {
            failInjected = true;
            return {
              ok: false,
              status: 400,
              json: async () => ({ message: "VALIDATION_REJECTED_BY_GATE" }),
              text: async () => "VALIDATION_REJECTED_BY_GATE"
            };
          }
          activeUploads++;
          maxObservedUploadConcurrency = Math.max(maxObservedUploadConcurrency, activeUploads);
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
          activeUploads--;
          return {
            ok: true,
            json: async () => ({
              id: `doc_${uploadCalls}`,
              tenantId: "tenant_stress",
              filename: "stress.pdf",
              size: 1,
              sha256: `sha_${uploadCalls}`,
              status: "QUARANTINE",
              message: "uploaded"
            })
          };
        }

        throw new Error(`Unexpected fetch in stress test: ${urlStr}`);
      })
    );

    const queue = new UploadQueue();
    queue.setContext("00000000-0000-0000-0000-000000000101", null);
    queue.setConcurrency(SCENARIO.maxUploadConcurrency, SCENARIO.maxHashConcurrency);

    const files: File[] = [];
    for (let i = 1; i <= SCENARIO.queueSize; i++) {
      files.push(new File(["evida stress innhold"], `stress_${String(i).padStart(3, "0")}.pdf`, { type: "application/pdf" }));
    }
    queue.addFiles(files);

    let state = queue.getState();
    for (let spin = 0; spin < 4000 && state.isBusy; spin++) {
      await vi.advanceTimersByTimeAsync(25);
      state = queue.getState();
    }

    // Queue must fully drain: no items stuck in non-terminal states.
    expect(state.isBusy).toBe(false);
    expect(state.remaining).toBe(0);
    expect(state.total).toBe(SCENARIO.queueSize);

    // Terminal accounting: throttled notifications must not drop terminal states.
    expect(state.skippedDuplicate).toBe(SCENARIO.expectedDuplicates);
    expect(state.failed).toBe(SCENARIO.expectedFailed);
    expect(state.completed).toBe(SCENARIO.expectedCompleted);
    expect(state.completed + state.skippedDuplicate + state.failed + state.cancelled).toBe(SCENARIO.queueSize);

    // Every duplicate item must carry a traceable reference to the existing document.
    const skipped = state.items.filter((x) => x.status === "SKIPPED_DUPLICATE");
    expect(skipped.length).toBe(SCENARIO.expectedDuplicates);
    expect(skipped.every((x) => Boolean(x.duplicateDocRef))).toBe(true);

    // Concurrency contract: max 3 simultaneous uploads observed, config limits reported in state.
    expect(maxObservedUploadConcurrency).toBeLessThanOrEqual(SCENARIO.maxUploadConcurrency);
    expect(maxObservedUploadConcurrency).toBeGreaterThan(0);
    expect(state.maxUploads).toBe(SCENARIO.maxUploadConcurrency);
    expect(state.maxHashJobs).toBe(SCENARIO.maxHashConcurrency);

    // Duplicate checks must stay batched at max 20 hashes per request.
    expect(duplicateBatchSizes.length).toBeGreaterThan(0);
    expect(Math.max(...duplicateBatchSizes)).toBeLessThanOrEqual(SCENARIO.duplicateBatchSize);

    // The single failed file must not stop the queue: everything else reached terminal state.
    const failedItems = state.items.filter((x) => x.status === "FAILED");
    expect(failedItems.length).toBe(SCENARIO.expectedFailed);
    expect(failedItems[0].errorMessage).toBeTruthy();
  });
});
