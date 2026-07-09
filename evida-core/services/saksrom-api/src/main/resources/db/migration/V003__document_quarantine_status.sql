ALTER TABLE documents
    ADD COLUMN status TEXT NOT NULL DEFAULT 'QUARANTINE',
    ADD COLUMN file_hash TEXT,
    ADD COLUMN storage_path TEXT,
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE documents
SET
    file_hash = sha256,
    storage_path = 'legacy://' || CAST(id AS VARCHAR)
WHERE file_hash IS NULL OR storage_path IS NULL;

ALTER TABLE documents
    ALTER COLUMN file_hash SET NOT NULL,
    ALTER COLUMN storage_path SET NOT NULL;

CREATE INDEX idx_documents_tenant ON documents(tenant_id);
CREATE INDEX idx_documents_tenant_status ON documents(tenant_id, status);
