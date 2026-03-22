package database

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"
	supabase "github.com/supabase-community/supabase-go"
)

var (
	globalClient *Client
	globalMu     sync.RWMutex
	clientOnce   sync.Once
	initError    error
)

// Client wraps Supabase client with multitenant support
type Client struct {
	*supabase.Client
	URL    string
	APIKey string
}

// TenantContext holds tenant information for multitenant operations
type TenantContext struct {
	TenantID string
	UserID   string
	OrgID    string
	Role     string // user_profiles.role: user, admin, owner (admin/owner can manage keys)
}

// NewClient creates a new Supabase database client
func NewClient() (*Client, error) {
	// Load .env file if it exists
	_ = godotenv.Load()

	url := os.Getenv("NEXT_PUBLIC_SUPABASE_URL")
	if url == "" {
		url = os.Getenv("SUPABASE_URL")
	}
	if url == "" {
		return nil, fmt.Errorf("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable is required")
	}

	apiKey := os.Getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("SUPABASE_ANON_KEY")
	}
	if apiKey == "" {
		return nil, fmt.Errorf("SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY environment variable is required")
	}

	client, err := supabase.NewClient(url, apiKey, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create Supabase client: %w", err)
	}

	return &Client{
		Client: client,
		URL:    url,
		APIKey: apiKey,
	}, nil
}

type tenantCtxKey struct{}

// WithTenant returns a context with tenant information
func WithTenant(ctx context.Context, tenant TenantContext) context.Context {
	return context.WithValue(ctx, tenantCtxKey{}, tenant)
}

// GetTenantFromContext extracts tenant information from context
func GetTenantFromContext(ctx context.Context) (TenantContext, bool) {
	tenant, ok := ctx.Value(tenantCtxKey{}).(TenantContext)
	return tenant, ok
}

// EnsureTenantContext ensures a context has tenant information, returns error if missing
func EnsureTenantContext(ctx context.Context) (TenantContext, error) {
	tenant, ok := GetTenantFromContext(ctx)
	if !ok {
		return TenantContext{}, fmt.Errorf("tenant context is required but not found")
	}
	if tenant.TenantID == "" && tenant.UserID == "" {
		return TenantContext{}, fmt.Errorf("tenant_id or user_id is required in context")
	}
	return tenant, nil
}

// Init initializes the global Supabase client connection
// This is a convenience function for simple initialization patterns
func Init() error {
	clientOnce.Do(func() {
		client, err := NewClient()
		if err != nil {
			initError = err
			return
		}
		SetGlobalClient(client)
	})
	return initError
}

// SetGlobalClient registers the client returned by GetClient for packages that cannot
// receive dbClient through main (monitoring, reasoning engine RAG, memory).
// Pass nil to clear (e.g. auth-disabled mode).
func SetGlobalClient(c *Client) {
	globalMu.Lock()
	defer globalMu.Unlock()
	globalClient = c
}

// GetClient returns the initialized global Supabase client
// Returns nil if Init() has not been called or failed
func GetClient() *Client {
	globalMu.RLock()
	defer globalMu.RUnlock()
	return globalClient
}

// PingREST checks that the Supabase PostgREST endpoint responds (TLS + API key).
// It does not run SQL; RLS may still block table reads when using the anon key.
func (c *Client) PingREST(ctx context.Context) error {
	if c == nil || c.URL == "" {
		return fmt.Errorf("database client not configured")
	}
	base := strings.TrimSuffix(strings.TrimSpace(c.URL), "/")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/rest/v1/", nil)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.APIKey)
	req.Header.Set("Authorization", "Bearer "+c.APIKey)

	httpClient := &http.Client{Timeout: 5 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 500 {
		return fmt.Errorf("postgrest status %d", resp.StatusCode)
	}
	return nil
}

// HealthCheck verifies the database client exists and PostgREST is reachable.
func HealthCheck(ctx context.Context) error {
	client := GetClient()
	if client == nil {
		return fmt.Errorf("Supabase client not initialized - call Init() or SetGlobalClient first")
	}
	if client.Client == nil {
		return fmt.Errorf("Supabase client is nil")
	}
	return client.PingREST(ctx)
}

// Close closes the database connection (if needed)
// Note: The Supabase Go client doesn't require explicit closing,
// but this function is provided for consistency with other database clients
func Close() error {
	SetGlobalClient(nil)
	return nil
}
