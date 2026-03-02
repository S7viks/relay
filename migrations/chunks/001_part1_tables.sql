-- 001 Part 1: Extension and tables only
-- Run this first in Supabase SQL Editor. If timeout, you can run each CREATE separately.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    tenant_id UUID,
    role TEXT DEFAULT 'user',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
