CREATE TABLE case_canvases (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    case_id UUID NOT NULL REFERENCES cases(id),
    canvas_json TEXT NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_case_canvases_tenant_case UNIQUE (tenant_id, case_id)
);

CREATE INDEX idx_case_canvases_tenant_case ON case_canvases(tenant_id, case_id);
