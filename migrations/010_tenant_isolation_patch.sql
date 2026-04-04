-- Migration 010: Tenant isolation security backfill
-- This backfills org_id + RLS protections for tables that previously lacked tenant isolation.

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE model_performance
ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE world_model_facts
ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_model_facts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    CREATE POLICY "tenant_isolation_documents" ON documents
        FOR ALL
        USING (org_id = current_tenant());
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "tenant_isolation_model_performance" ON model_performance
        FOR ALL
        USING (org_id = current_tenant());
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "tenant_isolation_world_model_facts" ON world_model_facts
        FOR ALL
        USING (org_id = current_tenant());
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_org_id ON documents(org_id);
CREATE INDEX IF NOT EXISTS idx_model_performance_org_id ON model_performance(org_id);
CREATE INDEX IF NOT EXISTS idx_world_model_facts_org_id ON world_model_facts(org_id);
