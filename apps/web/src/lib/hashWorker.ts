import { createSHA256 } from "hash-wasm";

const abortedFileIds = new Set<string>();

self.onmessage = async (e: MessageEvent) => {
  const { type, fileId, file, chunkSize = 4 * 1024 * 1024 } = e.data;

  if (type === "ABORT") {
    abortedFileIds.add(fileId);
    self.postMessage({ type: "ABORT_ACK", fileId });
    return;
  }

  if (type === "HASH") {
    abortedFileIds.delete(fileId);
    try {
      let hasher: any;
      try {
        hasher = await createSHA256();
        hasher.init();
      } catch (wasmError) {
        console.warn("hash-wasm failed to initialize in worker, attempting Web Crypto fallback", wasmError);
        // Worker fallback for files <= 50 MB
        if (file.size <= 50 * 1024 * 1024) {
          const buffer = await file.arrayBuffer();
          if (abortedFileIds.has(fileId)) {
            self.postMessage({ type: "ABORTED", fileId });
            return;
          }
          const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const sha256 = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
          self.postMessage({ type: "SUCCESS", fileId, sha256 });
          return;
        } else {
          throw new Error("WASM hashing unavailable and file size exceeds fallback limit (50 MB)");
        }
      }

      const size = file.size;
      let offset = 0;

      while (offset < size) {
        if (abortedFileIds.has(fileId)) {
          self.postMessage({ type: "ABORTED", fileId });
          return;
        }

        const chunk = file.slice(offset, offset + chunkSize);
        const buffer = await chunk.arrayBuffer();
        hasher.update(new Uint8Array(buffer));

        offset += chunkSize;
        const progress = Math.min(100, Math.round((offset / size) * 100));
        self.postMessage({ type: "PROGRESS", fileId, progress });

        // Yield execution to process incoming messages (such as ABORT)
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      const sha256 = hasher.digest();
      self.postMessage({ type: "SUCCESS", fileId, sha256 });
    } catch (err: any) {
      self.postMessage({ type: "ERROR", fileId, error: err?.message || String(err) });
    }
  }
};
