ALTER TABLE documents
    ALTER COLUMN case_id DROP NOT NULL;

ALTER TABLE documents
    ADD COLUMN file_size BIGINT;

UPDATE documents
SET file_size = 0
WHERE file_size IS NULL;

ALTER TABLE documents
    ALTER COLUMN file_size SET NOT NULL;

CREATE INDEX idx_documents_tenant_case_created ON documents(tenant_id, case_id, created_at DESC);
