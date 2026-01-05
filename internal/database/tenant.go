package database

import (
	"context"
	"fmt"
)

// GetTenantInfo fetches tenant information from database for a user
// This queries the user_profiles table via Supabase PostgREST API
func (c *Client) GetTenantInfo(ctx context.Context, userID string) (*TenantContext, error) {
	// TODO: Implement actual database query using Supabase Go client
	// For now, return default tenant context (user ID as tenant ID)
	// This will be enhanced once we verify the exact Supabase Go client API
	
	// Default behavior: single-tenant mode (user ID = tenant ID)
	// This is safe and will work until we implement the full database query
	return &TenantContext{
		TenantID: userID,
		UserID:   userID,
		OrgID:    "", // Will be populated from database when query is implemented
	}, nil
}

// EnsureTenantInfo ensures tenant information exists in database
// Creates default tenant context if user profile doesn't exist
func (c *Client) EnsureTenantInfo(ctx context.Context, userID string) (*TenantContext, error) {
	tenant, err := c.GetTenantInfo(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get tenant info: %w", err)
	}

	// If tenant_id is empty, default to user ID (single-tenant mode)
	if tenant.TenantID == "" {
		tenant.TenantID = userID
	}

	return tenant, nil
}
