ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_tenant_status_created
    ON documents(tenant_id, status, created_at DESC);
