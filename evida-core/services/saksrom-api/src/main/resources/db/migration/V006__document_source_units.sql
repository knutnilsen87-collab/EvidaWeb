ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS ingestion_error TEXT;

CREATE TABLE IF NOT EXISTS document_source_units (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    case_id UUID REFERENCES cases(id),
    document_id UUID NOT NULL REFERENCES documents(id),
    source_unit_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    unit_type TEXT NOT NULL,
    text_content TEXT NOT NULL,
    char_start INTEGER,
    char_end INTEGER,
    bbox_json TEXT,
    extraction_confidence DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_units_tenant_document
    ON document_source_units(tenant_id, document_id);

CREATE INDEX IF NOT EXISTS idx_source_units_document_page
    ON document_source_units(document_id, page_number);

CREATE UNIQUE INDEX IF NOT EXISTS uq_source_units_document_unit
    ON document_source_units(document_id, source_unit_id);
