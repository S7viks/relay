-- GAIOL Multitenant Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table (for multi-tenant support)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (extends Supabase auth.users)
-- Note: Supabase auth.users is managed by Supabase Auth
-- This table stores additional user metadata
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    tenant_id UUID, -- Can be same as organization_id or user-specific
    role TEXT DEFAULT 'user', -- user, admin, owner
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Queries table (for tracking usage per tenant)
CREATE TABLE IF NOT EXISTS api_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    tenant_id UUID NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    model_id TEXT NOT NULL,
    prompt TEXT,
    response TEXT,
    tokens_used INTEGER,
    cost DECIMAL(10, 6),
    processing_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_id ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_org_id ON user_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_queries_tenant_id ON api_queries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_queries_user_id ON api_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_api_queries_created_at ON api_queries(created_at);

-- Row Level Security (RLS) Policies
-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_queries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can view own profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id);

-- Policy: Users can view their organization
CREATE POLICY "Users can view own organization"
    ON organizations FOR SELECT
    USING (
        id IN (
            SELECT organization_id FROM user_profiles WHERE id = auth.uid()
        )
    );

-- Policy: Users can view queries from their tenant
CREATE POLICY "Users can view own tenant queries"
    ON api_queries FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
        )
    );

-- Policy: Users can insert queries for their tenant
CREATE POLICY "Users can insert own tenant queries"
    ON api_queries FOR INSERT
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
        )
    );

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, tenant_id)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.id -- Default: user ID as tenant ID (single-tenant mode)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to get or create tenant context
CREATE OR REPLACE FUNCTION public.get_tenant_context(user_uuid UUID)
RETURNS TABLE (
    user_id UUID,
    tenant_id UUID,
    organization_id UUID,
    role TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.id,
        COALESCE(up.tenant_id, up.id) as tenant_id,
        up.organization_id,
        up.role
    FROM user_profiles up
    WHERE up.id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
