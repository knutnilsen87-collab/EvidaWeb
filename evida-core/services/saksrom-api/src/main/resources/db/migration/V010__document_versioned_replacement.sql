ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS version_root_id UUID,
    ADD COLUMN IF NOT EXISTS supersedes_document_id UUID,
    ADD COLUMN IF NOT EXISTS superseded_by_document_id UUID,
    ADD COLUMN IF NOT EXISTS active_version BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE documents
SET version_root_id = id
WHERE version_root_id IS NULL;

ALTER TABLE documents
    ALTER COLUMN version_root_id SET NOT NULL;

ALTER TABLE documents
    ADD CONSTRAINT fk_documents_version_root
        FOREIGN KEY (version_root_id) REFERENCES documents(id),
    ADD CONSTRAINT fk_documents_supersedes
        FOREIGN KEY (supersedes_document_id) REFERENCES documents(id),
    ADD CONSTRAINT fk_documents_superseded_by
        FOREIGN KEY (superseded_by_document_id) REFERENCES documents(id),
    ADD CONSTRAINT ck_documents_version_number
        CHECK (version_number >= 1);

CREATE INDEX IF NOT EXISTS idx_documents_active_case_versions
    ON documents(tenant_id, case_id, active_version, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_one_active_version
    ON documents(tenant_id, version_root_id)
    WHERE active_version = TRUE AND status <> 'DELETED';
