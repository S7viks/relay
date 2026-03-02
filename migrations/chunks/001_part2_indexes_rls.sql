-- 001 Part 2: Indexes and RLS
-- Run after 001_part1_tables.sql

CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_id ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_org_id ON user_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_queries_tenant_id ON api_queries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_queries_user_id ON api_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_api_queries_created_at ON api_queries(created_at);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_queries ENABLE ROW LEVEL SECURITY;
