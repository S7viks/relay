package database

import (
	"context"
	"encoding/json"
	"fmt"
)

// GetTenantInfo fetches tenant information from the database for a user.
// It calls the get_tenant_context RPC if available, otherwise queries user_profiles directly.
// Returns TenantContext with TenantID (defaulting to userID if empty), UserID, OrgID.
func (c *Client) GetTenantInfo(ctx context.Context, userID string) (*TenantContext, error) {
	if c == nil || c.Client == nil {
		return &TenantContext{TenantID: userID, UserID: userID, OrgID: ""}, nil
	}

	// Try RPC first (migration 001 defines get_tenant_context(user_uuid))
	rpcParams := map[string]interface{}{"user_uuid": userID}
	resp := c.Rpc("get_tenant_context", "", rpcParams)
	if resp != "" && resp != "null" && resp != "[]" {
		var rows []struct {
			UserID         string  `json:"user_id"`
			TenantID       *string `json:"tenant_id"`
			OrganizationID *string `json:"organization_id"`
		}
		if err := json.Unmarshal([]byte(resp), &rows); err == nil && len(rows) > 0 {
			tc := &TenantContext{UserID: userID, OrgID: ""}
			if rows[0].TenantID != nil && *rows[0].TenantID != "" {
				tc.TenantID = *rows[0].TenantID
			} else {
				tc.TenantID = userID
			}
			if rows[0].OrganizationID != nil {
				tc.OrgID = *rows[0].OrganizationID
			}
			if rows[0].UserID != "" {
				tc.UserID = rows[0].UserID
			} else {
				tc.UserID = userID
			}
			return tc, nil
		}
	}

	// Fallback: query user_profiles directly
	var rows []struct {
		ID             string  `json:"id"`
		TenantID       *string `json:"tenant_id"`
		OrganizationID *string `json:"organization_id"`
	}
	_, err := c.From("user_profiles").
		Select("id,tenant_id,organization_id", "", false).
		Filter("id", "eq", userID).
		ExecuteTo(&rows)
	if err != nil {
		// On DB error, return default so auth still works (e.g. profile not yet created by trigger)
		return &TenantContext{TenantID: userID, UserID: userID, OrgID: ""}, nil
	}
	if len(rows) == 0 {
		return &TenantContext{TenantID: userID, UserID: userID, OrgID: ""}, nil
	}

	tc := &TenantContext{UserID: rows[0].ID, OrgID: ""}
	if rows[0].TenantID != nil && *rows[0].TenantID != "" {
		tc.TenantID = *rows[0].TenantID
	} else {
		tc.TenantID = userID
	}
	if rows[0].OrganizationID != nil {
		tc.OrgID = *rows[0].OrganizationID
	}
	return tc, nil
}

// EnsureTenantInfo ensures tenant information exists; uses GetTenantInfo and defaults empty tenant_id to userID.
func (c *Client) EnsureTenantInfo(ctx context.Context, userID string) (*TenantContext, error) {
	tenant, err := c.GetTenantInfo(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get tenant info: %w", err)
	}
	if tenant.TenantID == "" {
		tenant.TenantID = userID
	}
	return tenant, nil
}
