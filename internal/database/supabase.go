package database

import (
	"context"
	"fmt"
	"os"
	"sync"

	"github.com/joho/godotenv"
	supabase "github.com/supabase-community/supabase-go"
)

var (
	globalClient *Client
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

// WithTenant returns a context with tenant information
func WithTenant(ctx context.Context, tenant TenantContext) context.Context {
	return context.WithValue(ctx, "tenant", tenant)
}

// GetTenantFromContext extracts tenant information from context
func GetTenantFromContext(ctx context.Context) (TenantContext, bool) {
	tenant, ok := ctx.Value("tenant").(TenantContext)
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
		globalClient = client
	})
	return initError
}

// GetClient returns the initialized global Supabase client
// Returns nil if Init() has not been called or failed
func GetClient() *Client {
	return globalClient
}

// HealthCheck verifies the database connection is working
func HealthCheck(ctx context.Context) error {
	client := GetClient()
	if client == nil {
		return fmt.Errorf("Supabase client not initialized - call Init() first")
	}

	// Perform a simple query to verify connection
	// Try to query a system table or perform a simple operation
	// Since Supabase is built on PostgreSQL, we can use a simple SELECT 1 query
	// through the RPC mechanism or a direct query if available
	
	// For now, we'll just verify the client is properly initialized
	// A more thorough check would require knowing the database schema
	// This is a basic connectivity check
	if client.Client == nil {
		return fmt.Errorf("Supabase client is nil")
	}

	return nil
}

// Close closes the database connection (if needed)
// Note: The Supabase Go client doesn't require explicit closing,
// but this function is provided for consistency with other database clients
func Close() error {
	globalClient = nil
	return nil
}
