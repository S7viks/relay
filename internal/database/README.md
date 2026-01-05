# Database Package

This package provides Supabase database connection and multitenant support for GAIOL.

## Setup

1. **Set Environment Variables:**
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
   ```

2. **Run Database Migrations:**
   - Open your Supabase dashboard
   - Go to SQL Editor
   - Run the SQL from `migrations/001_initial_schema.sql`

3. **Configure Authentication:**
   - In Supabase dashboard, go to Authentication > Settings
   - Enable email authentication
   - Configure JWT settings as needed

## Multitenancy

The system supports multitenancy through:

- **Tenant ID**: Each user has a `tenant_id` (defaults to user ID for single-tenant)
- **Organization ID**: Users can belong to organizations for multi-tenant scenarios
- **Row Level Security (RLS)**: Automatically filters data by tenant

## Usage

```go
// Initialize client
dbClient, err := database.NewClient()

// Get tenant context from request
tenant, err := database.EnsureTenantContext(ctx)

// Use tenant context in queries
// All queries automatically filter by tenant_id via RLS policies
```

## Authentication

Authentication is handled by the `internal/auth` package, which:
- Validates Supabase JWT tokens
- Extracts user and tenant information
- Adds tenant context to requests

## Database Schema

- `organizations`: Multi-tenant organizations
- `user_profiles`: Extended user metadata with tenant info
- `api_queries`: Query history and usage tracking (tenant-scoped)
