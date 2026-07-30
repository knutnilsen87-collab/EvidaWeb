CREATE TABLE provider_policies (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
    external_provider_approved BOOLEAN NOT NULL DEFAULT false,
    change_ticket TEXT NOT NULL,
    updated_by UUID NOT NULL REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_provider_policies_updated_at
    ON provider_policies(updated_at);
