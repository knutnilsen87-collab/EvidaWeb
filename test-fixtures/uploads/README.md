# Synthetic upload fixtures

These files contain no client data. `scripts/pilot/test-evida-real-data-gate.ts`
may read files only from this directory and only in `local-dev` or `test` mode.

The smoke test uses the normal multipart upload API and does not write directly to
the database or bypass quarantine, malware scanning, OCR, ingestion or source-ready
rules. Never place real or confidential material here.
