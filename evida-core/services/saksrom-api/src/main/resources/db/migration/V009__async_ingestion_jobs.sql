ALTER TABLE document_source_units
    ADD COLUMN IF NOT EXISTS parser_version TEXT NOT NULL DEFAULT 'v1';

CREATE UNIQUE INDEX IF NOT EXISTS uq_source_units_document_page_parser
    ON document_source_units(document_id, page_number, parser_version);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    case_id UUID REFERENCES cases(id),
    document_id UUID NOT NULL REFERENCES documents(id),
    status TEXT NOT NULL,
    pages_processed INTEGER NOT NULL DEFAULT 0,
    pages_total INTEGER,
    error_message TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    locked_by VARCHAR(255),
    locked_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    parser_version VARCHAR(64) NOT NULL DEFAULT 'v1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_tenant_status_created
    ON ingestion_jobs(tenant_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_document_created
    ON ingestion_jobs(document_id, created_at DESC);
