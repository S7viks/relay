-- Migration 010: Tenant isolation backfill
-- Adds org_id + RLS to tables that were missing tenant isolation.
-- This migration is idempotent: safe to run multiple times.

-- Enable pgcrypto for gen_random_uuid() if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure tenant helper exists for RLS policies
-- Existing schema uses user_profiles.tenant_id for tenant isolation.
CREATE OR REPLACE FUNCTION public.current_tenant()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()),
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$;

-- ============================================================
-- TABLE: documents
-- ============================================================
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation_documents" ON documents
    FOR ALL USING (org_id = public.current_tenant());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_org_id ON documents(org_id);

-- ============================================================
-- TABLE: model_performance
-- ============================================================
ALTER TABLE model_performance
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE model_performance ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation_model_performance" ON model_performance
    FOR ALL USING (org_id = public.current_tenant());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_model_performance_org_id ON model_performance(org_id);

-- Also update the aggregate view to include org_id in grouping
DROP VIEW IF EXISTS model_performance_agg;
CREATE OR REPLACE VIEW model_performance_agg AS
  SELECT
    org_id,
    model_id,
    task_type,
    AVG(quality_score) AS avg_quality,
    AVG(latency_ms)    AS avg_latency,
    COUNT(*)           AS sample_count
  FROM model_performance
  GROUP BY org_id, model_id, task_type;

-- ============================================================
-- TABLE: world_model_facts
-- ============================================================
ALTER TABLE world_model_facts
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE world_model_facts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation_world_model_facts" ON world_model_facts
    FOR ALL USING (org_id = public.current_tenant());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_world_model_facts_org_id ON world_model_facts(org_id);

-- ============================================================
-- VALIDATE: check current_tenant() function exists
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'current_tenant'
  ) THEN
    RAISE EXCEPTION 'current_tenant() function not found.';
  END IF;
END $$;

-- Done. Apply with: supabase db push or psql -f migrations/010_tenant_isolation_patch.sql
