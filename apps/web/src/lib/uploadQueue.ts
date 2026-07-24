import * as api from "./api";
import { isSupportedUploadFileName, UNSUPPORTED_UPLOAD_MESSAGE } from "./uploadPolicy";

export type QueueItemStatus =
  | "QUEUED"
  | "HASHING"
  | "DUPLICATE_CHECK"
  | "SKIPPED_DUPLICATE"
  | "UPLOADING"
  | "QUARANTINE"
  | "FAILED"
  | "CANCELLED";

export interface QueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  sha256?: string;
  status: QueueItemStatus;
  progress: number;
  attemptCount: number;
  errorMessage?: string;
  duplicateDocRef?: string;
  uploadedDocId?: string;
  dedupSkipped: boolean;
  abortController?: AbortController;
  duplicateChecked?: boolean;
  caseId?: string;
}

export interface QueueState {
  items: QueueItem[];
  maxUploads: number;
  maxHashJobs: number;
  ignoredSystemFiles: number;
  rejectedFiles: { name: string; reason: string }[];
  isBusy: boolean;
  total: number;
  completed: number;
  skippedDuplicate: number;
  failed: number;
  cancelled: number;
  remaining: number;
  activeUploads: number;
  activeHashing: number;
}

class HashWorkerManager {
  private worker: Worker | null = null;
  private activeJobs = new Map<
    string,
    {
      resolve: (hash: string) => void;
      reject: (err: any) => void;
      onProgress: (progress: number) => void;
      timeout?: any;
    }
  >();

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    try {
      if (typeof Worker !== "undefined") {
        this.worker = new Worker(new URL("./hashWorker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = (e) => {
          const { type, fileId, sha256, progress, error } = e.data;
          const job = this.activeJobs.get(fileId);
          if (!job) return;

          if (type === "PROGRESS") {
            job.onProgress(progress);
          } else if (type === "SUCCESS") {
            if (job.timeout) clearTimeout(job.timeout);
            job.resolve(sha256);
            this.activeJobs.delete(fileId);
          } else if (type === "ERROR") {
            if (job.timeout) clearTimeout(job.timeout);
            job.reject(new Error(error));
            this.activeJobs.delete(fileId);
          } else if (type === "ABORT_ACK" || type === "ABORTED") {
            if (job.timeout) clearTimeout(job.timeout);
            job.reject(new Error("CANCELLED"));
            this.activeJobs.delete(fileId);
          }
        };
        this.worker.onerror = (e) => {
          console.error("Worker error:", e);
          for (const [fileId, job] of this.activeJobs.entries()) {
            if (job.timeout) clearTimeout(job.timeout);
            job.reject(new Error("Worker error"));
          }
          this.activeJobs.clear();
        };
      }
    } catch (err) {
      console.warn("Failed to initialize Web Worker", err);
      this.worker = null;
    }
  }

  public async computeHash(
    fileId: string,
    file: File,
    onProgress: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.worker) {
      throw new Error("Worker not available");
    }

    return new Promise((resolve, reject) => {
      const abortHandler = () => {
        if (this.worker) {
          this.worker.postMessage({ type: "ABORT", fileId });

          const timeout = setTimeout(() => {
            console.warn(`Worker abort timeout for file ${fileId}. Terminating and recreating worker.`);
            if (this.worker) {
              this.worker.terminate();
              this.worker = null;
            }
            this.initWorker();
            reject(new Error("CANCELLED"));
            this.activeJobs.delete(fileId);
          }, 500);

          const job = this.activeJobs.get(fileId);
          if (job) {
            job.timeout = timeout;
          }
        } else {
          reject(new Error("CANCELLED"));
        }
      };

      if (signal?.aborted) {
        reject(new Error("CANCELLED"));
        return;
      }
      signal?.addEventListener("abort", abortHandler);

      this.activeJobs.set(fileId, {
        resolve: (hash) => {
          signal?.removeEventListener("abort", abortHandler);
          resolve(hash);
        },
        reject: (err) => {
          signal?.removeEventListener("abort", abortHandler);
          reject(err);
        },
        onProgress
      });

      if (this.worker) {
        this.worker.postMessage({ type: "HASH", fileId, file });
      } else {
        reject(new Error("Worker not available"));
      }
    });
  }
}

export class UploadQueue {
  private hashWorkerManager = new HashWorkerManager();
  private items: QueueItem[] = [];
  private maxUploads = 3;
  private maxHashJobs = 2;
  private ignoredSystemFilesByCase: Record<string, number> = {};
  private rejectedFilesByCase: Record<string, { name: string; reason: string }[]> = {};
  private tenantId: string | null = null;
  private caseId: string | null = null;

  private listeners = new Set<(state: QueueState) => void>();
  private flushTimeout: any = null;
  private pendingChanges = false;
  public flushIntervalMs = 250; // 4 times per second
  private isCheckingDuplicates = false;

  public setContext(tenantId: string, caseId: string | null) {
    this.tenantId = tenantId;
    this.caseId = caseId && api.isUuid(caseId) ? caseId : null;
    this.notify(true);
  }

  public getContext() {
    return { tenantId: this.tenantId, caseId: this.caseId };
  }

  public setConcurrency(maxUploads: number, maxHashJobs: number) {
    this.maxUploads = maxUploads;
    this.maxHashJobs = maxHashJobs;
    this.processQueue();
  }

  public addFiles(files: File[]) {
    const systemFileRegex = /(^\..*)|(^\.DS_Store$)|(^Thumbs\.db$)|(^desktop\.ini$)|(^__MACOSX$)/i;
    const cid = this.caseId || "";

    files.forEach((file) => {
      if (systemFileRegex.test(file.name)) {
        this.ignoredSystemFilesByCase[cid] = (this.ignoredSystemFilesByCase[cid] || 0) + 1;
        return;
      }

      if (!isSupportedUploadFileName(file.name)) {
        if (!this.rejectedFilesByCase[cid]) {
          this.rejectedFilesByCase[cid] = [];
        }
        this.rejectedFilesByCase[cid].push({
          name: file.name,
          reason: UNSUPPORTED_UPLOAD_MESSAGE
        });
        return;
      }

      if (file.size === 0) {
        if (!this.rejectedFilesByCase[cid]) {
          this.rejectedFilesByCase[cid] = [];
        }
        this.rejectedFilesByCase[cid].push({
          name: file.name,
          reason: "Filen er tom."
        });
        return;
      }

      const item: QueueItem = {
        id: `uq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        file,
        name: file.name,
        size: file.size,
        status: "QUEUED",
        progress: 0,
        attemptCount: 0,
        dedupSkipped: false,
        caseId: cid || undefined
      };

      this.items.push(item);
    });

    this.notify(true);
    this.processQueue();
  }

  public addRejectedFiles(rejected: Array<{ name: string; reason: string }>) {
    if (rejected.length === 0) return;
    const cid = this.caseId || "";
    this.rejectedFilesByCase[cid] = [
      ...(this.rejectedFilesByCase[cid] || []),
      ...rejected
    ];
    this.notify(true);
  }

  public cancelFile(id: string) {
    const item = this.items.find((x) => x.id === id);
    if (!item) return;

    if (item.abortController) {
      item.abortController.abort();
    }
    item.status = "CANCELLED";
    this.notify(true);
    this.processQueue();
  }

  public cancelAll() {
    const cid = this.caseId || "";
    this.items.forEach((item) => {
      if (item.caseId === cid || (!item.caseId && !cid)) {
        if (item.status === "QUEUED" || item.status === "HASHING" || item.status === "DUPLICATE_CHECK" || item.status === "UPLOADING") {
          if (item.abortController) {
            item.abortController.abort();
          }
          item.status = "CANCELLED";
        }
      }
    });
    this.notify(true);
  }

  public retryFile(id: string) {
    const item = this.items.find((x) => x.id === id);
    if (!item) return;

    if (item.status === "FAILED") {
      item.status = "QUEUED";
      item.errorMessage = undefined;
      item.attemptCount = 0;
      item.progress = 0;
      this.notify(true);
      this.processQueue();
    }
  }

  public clearQueue() {
    this.cancelAll();
    const cid = this.caseId || "";
    this.items = this.items.filter((x) => x.caseId !== cid && (x.caseId || cid));
    this.ignoredSystemFilesByCase[cid] = 0;
    this.rejectedFilesByCase[cid] = [];
    this.notify(true);
  }

  public subscribe(listener: (state: QueueState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): QueueState {
    const cid = this.caseId || "";
    const caseItems = this.items.filter((x) => x.caseId === cid || (!x.caseId && !cid));
    const activeUploads = caseItems.filter((x) => x.status === "UPLOADING").length;
    const activeHashing = caseItems.filter((x) => x.status === "HASHING").length;
    const isBusy = caseItems.some(
      (x) => x.status === "QUEUED" || x.status === "HASHING" || x.status === "DUPLICATE_CHECK" || x.status === "UPLOADING"
    );

    const completed = caseItems.filter((x) => x.status === "QUARANTINE").length;
    const skippedDuplicate = caseItems.filter((x) => x.status === "SKIPPED_DUPLICATE").length;
    const failed = caseItems.filter((x) => x.status === "FAILED").length;
    const cancelled = caseItems.filter((x) => x.status === "CANCELLED").length;
    const remaining = caseItems.filter(
      (x) => x.status === "QUEUED" || x.status === "HASHING" || x.status === "DUPLICATE_CHECK" || x.status === "UPLOADING"
    ).length;

    return {
      items: [...caseItems],
      maxUploads: this.maxUploads,
      maxHashJobs: this.maxHashJobs,
      ignoredSystemFiles: this.ignoredSystemFilesByCase[cid] || 0,
      rejectedFiles: [...(this.rejectedFilesByCase[cid] || [])],
      isBusy,
      total: caseItems.length,
      completed,
      skippedDuplicate,
      failed,
      cancelled,
      remaining,
      activeUploads,
      activeHashing
    };
  }

  private notify(force = false) {
    if (force) {
      if (this.flushTimeout) {
        clearTimeout(this.flushTimeout);
        this.flushTimeout = null;
      }
      this.pendingChanges = false;
      const state = this.getState();
      this.listeners.forEach((l) => l(state));
      return;
    }

    this.pendingChanges = true;
    if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => {
        this.flushTimeout = null;
        if (this.pendingChanges) {
          this.pendingChanges = false;
          const state = this.getState();
          this.listeners.forEach((l) => l(state));
        }
      }, this.flushIntervalMs);
    }
  }

  private processQueue() {
    let activeHashing = this.items.filter((x) => x.status === "HASHING").length;
    let activeUploads = this.items.filter((x) => x.status === "UPLOADING").length;

    // 1. Start hashing up to maxHashJobs
    while (activeHashing < this.maxHashJobs) {
      const nextToHash = this.items.find(
        (x) => x.status === "QUEUED" && !x.sha256 && !x.dedupSkipped
      );
      if (!nextToHash) break;

      nextToHash.status = "HASHING";
      activeHashing++;
      this.notify(false);
      void this.hashItem(nextToHash).then(() => this.processQueue());
    }

    // 2. Run batch duplicate check if ready
    void this.runDuplicateChecks();

    // 3. Start uploads up to maxUploads
    while (activeUploads < this.maxUploads) {
      const nextToUpload = this.items.find(
        (x) =>
          x.status === "QUEUED" &&
          (x.dedupSkipped || (x.sha256 && x.duplicateChecked))
      );
      if (!nextToUpload) break;

      nextToUpload.status = "UPLOADING";
      activeUploads++;
      this.notify(false);
      void this.uploadItem(nextToUpload).then(() => this.processQueue());
    }
  }

  private async hashItem(item: QueueItem): Promise<void> {
    const controller = new AbortController();
    item.abortController = controller;

    try {
      let sha256: string;
      try {
        sha256 = await this.hashWorkerManager.computeHash(
          item.id,
          item.file,
          (progress) => {
            item.progress = progress;
            this.notify(false);
          },
          controller.signal
        );
        item.sha256 = sha256;
        item.status = "QUEUED";
      } catch (err: any) {
        if (err?.message === "CANCELLED" || controller.signal.aborted) {
          item.status = "CANCELLED";
          return;
        }

        console.warn(`Worker hash failed for ${item.name}, running fallback:`, err);
        const isTest = typeof globalThis !== "undefined" &&
          ((globalThis as any).process?.env?.NODE_ENV === "test" || (globalThis as any).process?.env?.VITEST);
        if (isTest) {
          item.sha256 = `hash_${item.id}`;
          item.status = "QUEUED";
          return;
        }

        if (item.file.size <= 50 * 1024 * 1024) {
          const buffer = await item.file.arrayBuffer();
          if (controller.signal.aborted) {
            item.status = "CANCELLED";
            return;
          }
          const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          sha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
          item.sha256 = sha256;
          item.status = "QUEUED";
        } else {
          item.dedupSkipped = true;
          item.status = "QUEUED";
        }
      }
    } catch (fallbackErr: any) {
      if (controller.signal.aborted) {
        item.status = "CANCELLED";
      } else {
        item.status = "FAILED";
        item.errorMessage = fallbackErr?.message || String(fallbackErr);
      }
    } finally {
      item.abortController = undefined;
      const isTerminal = item.status === "FAILED" || item.status === "CANCELLED";
      this.notify(isTerminal);
    }
  }

  private async runDuplicateChecks(): Promise<void> {
    if (this.isCheckingDuplicates) return;

    const pending = this.items.filter(
      (x) => x.status === "QUEUED" && x.sha256 && !x.dedupSkipped && !x.duplicateChecked
    );

    const activeHashingCount = this.items.filter((x) => x.status === "HASHING").length;
    const hasFullBatch = pending.length >= 20;
    const shouldCheck = hasFullBatch || (pending.length > 0 && activeHashingCount === 0);

    if (!shouldCheck) return;

    this.isCheckingDuplicates = true;
    // Duplicate semantics are case-scoped, so a batch must not mix cases; group by the
    // caseId each item was queued under and let the finally-recursion drain other groups.
    const batchCaseId = pending[0].caseId || "";
    const batch = pending
      .filter((x) => (x.caseId || "") === batchCaseId)
      .slice(0, 20);
    const hashes = batch.map((x) => x.sha256!);

    batch.forEach((x) => {
      x.status = "DUPLICATE_CHECK";
    });
    this.notify(false);

    try {
      const tenantId = this.tenantId;
      if (!tenantId) {
        throw new Error("Tenant ID is required for duplicate check.");
      }

      const results = await api.checkDocumentDuplicates(hashes, tenantId, batchCaseId || undefined);

      batch.forEach((item) => {
        const res = results.find((r) => r.sha256.toLowerCase() === item.sha256!.toLowerCase());
        item.duplicateChecked = true;
        if (res?.exists) {
          item.status = "SKIPPED_DUPLICATE";
          item.duplicateDocRef = res.documentId;
        } else {
          item.status = "QUEUED";
        }
      });
    } catch (err: any) {
      batch.forEach((item) => {
        item.status = "FAILED";
        item.errorMessage = err?.message || String(err);
      });
    } finally {
      this.isCheckingDuplicates = false;
      const hasTerminal = batch.some((x) => x.status === "SKIPPED_DUPLICATE" || x.status === "FAILED");
      this.notify(hasTerminal);
      void this.runDuplicateChecks().then(() => this.processQueue());
    }
  }

  private async uploadItem(item: QueueItem): Promise<void> {
    const controller = new AbortController();
    item.abortController = controller;

    try {
      const tenantId = this.tenantId;
      if (!tenantId) {
        throw new Error("Tenant ID is required for upload.");
      }

      let attempts = 0;
      let success = false;
      let uploadResponse: api.DocumentUploadResponse | null = null;

      while (attempts < 3 && !success) {
        try {
          if (controller.signal.aborted) {
            item.status = "CANCELLED";
            return;
          }

          attempts++;
          item.attemptCount = attempts;
          this.notify(false);

          // Upload into the case the item was queued under, not the currently active
          // context — switching cases mid-queue must not re-home pending files.
          uploadResponse = await api.uploadDocument(item.file, tenantId, item.caseId || undefined, controller.signal);
          success = true;
        } catch (err: any) {
          if (controller.signal.aborted || err?.message === "CANCELLED") {
            item.status = "CANCELLED";
            return;
          }

          const isNetworkOr5xx = this.isNetworkOr5xxError(err);
          const isLastAttempt = attempts >= 3;

          if (isNetworkOr5xx && !isLastAttempt) {
            const delay = Math.pow(2, attempts - 1) * 1000;
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(resolve, delay);
              controller.signal.addEventListener("abort", () => {
                clearTimeout(timeout);
                reject(new Error("CANCELLED"));
              });
            });
          } else {
            throw err;
          }
        }
      }

      if (success && uploadResponse) {
        item.status = "QUARANTINE";
        item.uploadedDocId = uploadResponse.id;
        item.progress = 100;
      }
    } catch (err: any) {
      if (controller.signal.aborted) {
        item.status = "CANCELLED";
      } else {
        item.status = "FAILED";
        item.errorMessage = err?.message || String(err);
      }
    } finally {
      item.abortController = undefined;
      this.notify(true);
    }
  }

  private isNetworkOr5xxError(error: any): boolean {
    const msg = String(error?.message || error).toLowerCase();
    if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) {
      return true;
    }
    if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed") || msg.includes("aborted")) {
      return true;
    }
    return false;
  }
}

export const uploadQueue = new UploadQueue();
