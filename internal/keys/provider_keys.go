package keys

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"relay/internal/database"
)

// ProviderKeyRow is a row from provider_api_keys (list response: no raw key).
type ProviderKeyRow struct {
	ID         string    `json:"id"`
	Provider   string    `json:"provider"`
	KeyHint    string    `json:"key_hint"`
	IsActive   bool      `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// StoreProviderKey encrypts the API key and upserts into provider_api_keys for the tenant.
// Provider should be "openrouter", "google", or "huggingface". Returns key_hint (e.g. last 4 chars).
func StoreProviderKey(ctx context.Context, db *database.Client, tenantID string, provider string, apiKey string) (keyHint string, err error) {
	if db == nil || db.Client == nil {
		return "", errors.New("database client is required")
	}
	provider = normalizeProvider(provider)
	if provider == "" {
		return "", errors.New("invalid provider")
	}
	if apiKey == "" {
		return "", errors.New("api_key is required")
	}
	encrypted, err := Encrypt([]byte(apiKey))
	if err != nil {
		return "", fmt.Errorf("encrypt key: %w", err)
	}
	hint := keyHintFromKey(apiKey)

	row := map[string]interface{}{
		"tenant_id":     tenantID,
		"provider":      provider,
		"encrypted_key": encrypted,
		"key_hint":      hint,
		"is_active":    true,
		"updated_at":   time.Now().UTC().Format(time.RFC3339),
	}
	// Upsert: on conflict (tenant_id, provider) update
	_, _, err = db.From("provider_api_keys").Insert(row, true, "tenant_id,provider", "", "").Execute()
	if err != nil {
		return "", fmt.Errorf("upsert provider key: %w", err)
	}
	return hint, nil
}

// ListProviderKeys returns provider keys for the tenant (id, provider, key_hint, is_active, created_at, updated_at). No raw keys.
func ListProviderKeys(ctx context.Context, db *database.Client, tenantID string) ([]ProviderKeyRow, error) {
	if db == nil || db.Client == nil {
		return nil, errors.New("database client is required")
	}
	var rows []struct {
		ID        string    `json:"id"`
		Provider  string    `json:"provider"`
		KeyHint   string    `json:"key_hint"`
		IsActive  bool      `json:"is_active"`
		CreatedAt time.Time `json:"created_at"`
		UpdatedAt time.Time `json:"updated_at"`
	}
	_, err := db.From("provider_api_keys").
		Select("id,provider,key_hint,is_active,created_at,updated_at", "", false).
		Filter("tenant_id", "eq", tenantID).
		ExecuteTo(&rows)
	if err != nil {
		return nil, fmt.Errorf("list provider keys: %w", err)
	}
	out := make([]ProviderKeyRow, len(rows))
	for i := range rows {
		out[i] = ProviderKeyRow{
			ID:        rows[i].ID,
			Provider:  rows[i].Provider,
			KeyHint:   rows[i].KeyHint,
			IsActive:  rows[i].IsActive,
			CreatedAt:  rows[i].CreatedAt,
			UpdatedAt:  rows[i].UpdatedAt,
		}
	}
	return out, nil
}

// DeleteProviderKey removes or soft-deletes the key for tenant and provider.
func DeleteProviderKey(ctx context.Context, db *database.Client, tenantID string, provider string) error {
	if db == nil || db.Client == nil {
		return errors.New("database client is required")
	}
	provider = normalizeProvider(provider)
	if provider == "" {
		return errors.New("invalid provider")
	}
	_, _, err := db.From("provider_api_keys").
		Delete("", "").
		Filter("tenant_id", "eq", tenantID).
		Filter("provider", "eq", provider).
		Execute()
	if err != nil {
		return fmt.Errorf("delete provider key: %w", err)
	}
	return nil
}

// LoadProviderKeysForTenant returns decrypted API keys for the tenant as map[provider]apiKey.
// Used to build the model registry for inference. Optional short TTL cache can be added later.
func LoadProviderKeysForTenant(ctx context.Context, db *database.Client, tenantID string) (map[string]string, error) {
	if db == nil || db.Client == nil {
		return nil, nil
	}
	var rows []struct {
		Provider     string `json:"provider"`
		EncryptedKey string `json:"encrypted_key"`
	}
	_, err := db.From("provider_api_keys").
		Select("provider,encrypted_key", "", false).
		Filter("tenant_id", "eq", tenantID).
		Filter("is_active", "eq", "true").
		ExecuteTo(&rows)
	if err != nil {
		return nil, fmt.Errorf("load provider keys: %w", err)
	}
	out := make(map[string]string)
	for _, r := range rows {
		plain, err := Decrypt(r.EncryptedKey)
		if err != nil {
			continue // skip broken keys
		}
		out[normalizeProvider(r.Provider)] = string(plain)
	}
	return out, nil
}

func normalizeProvider(p string) string {
	p = strings.TrimSpace(strings.ToLower(p))
	switch p {
	case "openrouter", "huggingface":
		return p
	case "google", "gemini":
		return "google"
	}
	return ""
}

func keyHintFromKey(apiKey string) string {
	apiKey = strings.TrimSpace(apiKey)
	if len(apiKey) <= 4 {
		return "****"
	}
	return "..." + apiKey[len(apiKey)-4:]
}

