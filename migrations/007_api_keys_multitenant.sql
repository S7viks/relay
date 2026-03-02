-- GAIOL API Keys (unified key + provider keys per tenant)
-- Run after 001_initial_schema.sql. Requires auth.users and user_profiles.

-- Provider API keys: tenant stores OpenRouter, Gemini, HuggingFace etc.
CREATE TABLE IF NOT EXISTS provider_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    provider TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    key_hint TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, provider)
);

-- GAIOL-issued API keys: one key per tenant (or multiple named keys)
CREATE TABLE IF NOT EXISTS gaiol_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT DEFAULT 'default',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_api_keys_tenant ON provider_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gaiol_api_keys_tenant ON gaiol_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gaiol_api_keys_key_hash ON gaiol_api_keys(key_hash);

ALTER TABLE provider_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaiol_api_keys ENABLE ROW LEVEL SECURITY;

-- Tenant can only manage own provider keys
CREATE POLICY "Tenant manage own provider keys"
    ON provider_api_keys FOR ALL
    USING (
        tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    )
    WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    );

-- Tenant can only manage own GAIOL keys
CREATE POLICY "Tenant manage own gaiol keys"
    ON gaiol_api_keys FOR ALL
    USING (
        tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    )
    WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    );

-- Optional: service role can read by key_hash for gateway validation (if not using app-level lookup)
-- CREATE POLICY "Service read gaiol keys by hash" ON gaiol_api_keys FOR SELECT USING (true);
