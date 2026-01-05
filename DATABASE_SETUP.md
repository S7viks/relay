# Supabase Database Setup Guide

This guide explains how to set up Supabase database connection with multitenancy and authentication for GAIOL.

## Prerequisites

1. A Supabase project (create one at https://supabase.com)
2. Your Supabase project URL and anon key

## Step 1: Environment Variables

Create a `.env` file in the project root with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tftegavokjubehogcnhj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_8bM3gAhZKcYP6uL7inwVdA_1pxtO475

# Optional: Alternative variable names
SUPABASE_URL=https://tftegavokjubehogcnhj.supabase.co
SUPABASE_ANON_KEY=sb_publishable_8bM3gAhZKcYP6uL7inwVdA_1pxtO475
```

## Step 2: Database Schema Setup

1. Open your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `migrations/001_initial_schema.sql`
4. Click **Run** to execute the migration

This will create:
- `organizations` table for multi-tenant organizations
- `user_profiles` table for extended user metadata
- `api_queries` table for tracking API usage per tenant
- Row Level Security (RLS) policies for data isolation
- Automatic user profile creation on signup

## Step 3: Authentication Configuration

1. In Supabase Dashboard, go to **Authentication > Settings**
2. Enable **Email** authentication
3. Configure email templates if needed
4. Set up any additional auth providers (optional)

## Step 4: Test the Connection

Start the web server:

```bash
go run cmd/web-server/main.go
```

Check the health endpoint:

```bash
curl http://localhost:8080/health
```

You should see database connection status in the response.

## Architecture

### Multitenancy

The system supports multitenancy through:

- **Tenant ID**: Each user has a `tenant_id` (defaults to user ID for single-tenant mode)
- **Organization ID**: Users can belong to organizations for true multi-tenant scenarios
- **Row Level Security (RLS)**: Automatically filters all queries by tenant_id

### Authentication Flow

1. User authenticates with Supabase Auth (email/password, OAuth, etc.)
2. Supabase returns a JWT token containing user information
3. Client sends requests with `Authorization: Bearer <token>` header
4. Server validates token and extracts user/tenant information
5. All database queries are automatically scoped to the user's tenant via RLS

### Protected Endpoints

The following endpoints require authentication:
- `POST /api/query` - Multi-model comparison
- `POST /api/query/smart` - Smart routing
- `POST /api/query/model` - Query specific model

Public endpoints (no auth required):
- `GET /api/models` - List all models
- `GET /api/models/free` - List free models
- `GET /api/models/:provider` - List by provider
- `GET /health` - Health check

## Usage in Code

### Getting Tenant Context

```go
import "gaiol/internal/database"

// In a request handler
tenant, err := database.EnsureTenantContext(r.Context())
if err != nil {
    // Handle error
}

// Use tenant.TenantID, tenant.UserID, tenant.OrgID
```

### Getting User Information

```go
import "gaiol/internal/auth"

// In a request handler
user, err := auth.RequireAuth(r.Context())
if err != nil {
    // Handle error - user not authenticated
}

// Use user.ID, user.Email, user.TenantID, user.OrgID
```

## Database Tables

### organizations
Stores multi-tenant organization information.

### user_profiles
Extends Supabase `auth.users` with tenant and organization information.
- Automatically created when a user signs up (via database trigger)
- Links users to organizations
- Stores tenant_id for data isolation

### api_queries
Tracks all API queries for analytics and billing:
- Tenant-scoped (users can only see their tenant's queries)
- Stores model, prompt, response, tokens, cost, timing
- Useful for usage analytics and cost tracking

## Security

- **Row Level Security (RLS)**: All tables have RLS enabled
- **JWT Validation**: All protected endpoints validate Supabase JWT tokens
- **Tenant Isolation**: Users can only access data from their tenant
- **Automatic Filtering**: Database queries are automatically filtered by tenant_id

## Troubleshooting

### Database Connection Fails

1. Verify environment variables are set correctly
2. Check Supabase project is active
3. Verify network connectivity to Supabase

### Authentication Fails

1. Check JWT token is valid and not expired
2. Verify token is signed with correct secret
3. Check user exists in `auth.users` table
4. Verify user profile was created (check `user_profiles` table)

### RLS Policies Blocking Queries

1. Verify user is authenticated (has valid JWT)
2. Check `user_profiles` table has correct `tenant_id`
3. Review RLS policies in Supabase dashboard
4. Test queries directly in Supabase SQL Editor

## Next Steps

- Implement usage tracking in `api_queries` table
- Add organization management endpoints
- Implement tenant-level rate limiting
- Add billing/usage analytics
