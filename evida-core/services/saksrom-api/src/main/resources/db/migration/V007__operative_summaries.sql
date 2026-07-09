CREATE TABLE IF NOT EXISTS operative_summaries (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    case_id TEXT NOT NULL,
    analysis_status TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_operative_summaries_tenant_case UNIQUE (tenant_id, case_id)
);

CREATE INDEX IF NOT EXISTS idx_operative_summaries_tenant_case
    ON operative_summaries(tenant_id, case_id);
