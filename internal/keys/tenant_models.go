package keys

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"relay/internal/database"
)

type TenantModelRow struct {
	ID            string    `json:"id"`
	ProviderKey   string    `json:"provider_key"`
	ModelID       string    `json:"model_id"`
	DisplayName   string    `json:"display_name"`
	QualityScore  float64   `json:"quality_score"`
	CostPerToken  float64   `json:"cost_per_token"`
	ContextWindow int       `json:"context_window"`
	MaxTokens     int       `json:"max_tokens"`
	Tags          []string  `json:"tags"`
	IsActive      bool      `json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func normalizeNonReservedProviderKey(providerKey string) (string, error) {
	pk, err := normalizeProviderKey(providerKey)
	if err == nil {
		return pk, nil
	}
	// Allow legacy reserved provider keys for models table as well, since those providers exist.
	// The registry builder will merge tenant_models with built-in providers by provider_key.
	k := strings.TrimSpace(strings.ToLower(providerKey))
	if k == "" {
		return "", errors.New("provider_key is required")
	}
	if !providerKeyRe.MatchString(k) {
		return "", errors.New("provider_key must match ^[a-z0-9][a-z0-9_-]{0,63}$")
	}
	return k, nil
}

func normalizeModelID(modelID string) (string, error) {
	modelID = strings.TrimSpace(modelID)
	if modelID == "" {
		return "", errors.New("model_id is required")
	}
	// Keep model IDs flexible; just prevent absurd length.
	if len(modelID) > 200 {
		return "", errors.New("model_id is too long")
	}
	return modelID, nil
}

// UpsertTenantModel registers a model for routing under provider_key.
func UpsertTenantModel(
	ctx context.Context,
	db *database.Client,
	tenantID string,
	providerKey string,
	modelID string,
	displayName string,
	qualityScore *float64,
	costPerToken *float64,
	contextWindow *int,
	maxTokens *int,
	tags []string,
) error {
	if db == nil || db.Client == nil {
		return errors.New("database client is required")
	}
	pk, err := normalizeNonReservedProviderKey(providerKey)
	if err != nil {
		return err
	}
	mid, err := normalizeModelID(modelID)
	if err != nil {
		return err
	}
	row := map[string]interface{}{
		"tenant_id":     tenantID,
		"provider_key":  pk,
		"model_id":      mid,
		"display_name":  nullIfEmpty(displayName),
		"is_active":     true,
		"updated_at":    time.Now().UTC().Format(time.RFC3339),
	}
	if qualityScore != nil {
		row["quality_score"] = *qualityScore
	}
	if costPerToken != nil {
		row["cost_per_token"] = *costPerToken
	}
	if contextWindow != nil {
		row["context_window"] = *contextWindow
	}
	if maxTokens != nil {
		row["max_tokens"] = *maxTokens
	}
	if tags != nil {
		// Supabase PostgREST supports text[] via JSON array
		row["tags"] = tags
	}
	_, _, err = db.From("tenant_models").Insert(row, true, "tenant_id,provider_key,model_id", "", "").Execute()
	if err != nil {
		return fmt.Errorf("upsert tenant model: %w", err)
	}
	return nil
}

func ListTenantModels(ctx context.Context, db *database.Client, tenantID string) ([]TenantModelRow, error) {
	if db == nil || db.Client == nil {
		return nil, errors.New("database client is required")
	}
	var rows []TenantModelRow
	_, err := db.From("tenant_models").
		Select("id,provider_key,model_id,display_name,quality_score,cost_per_token,context_window,max_tokens,tags,is_active,created_at,updated_at", "", false).
		Filter("tenant_id", "eq", tenantID).
		ExecuteTo(&rows)
	if err != nil {
		return nil, fmt.Errorf("list tenant models: %w", err)
	}
	return rows, nil
}

func DeleteTenantModel(ctx context.Context, db *database.Client, tenantID string, providerKey string, modelID string) error {
	if db == nil || db.Client == nil {
		return errors.New("database client is required")
	}
	pk, err := normalizeNonReservedProviderKey(providerKey)
	if err != nil {
		return err
	}
	mid, err := normalizeModelID(modelID)
	if err != nil {
		return err
	}
	_, _, err = db.From("tenant_models").
		Delete("", "").
		Filter("tenant_id", "eq", tenantID).
		Filter("provider_key", "eq", pk).
		Filter("model_id", "eq", mid).
		Execute()
	if err != nil {
		return fmt.Errorf("delete tenant model: %w", err)
	}
	return nil
}

// LoadTenantModelsForTenant returns active models for routing.
func LoadTenantModelsForTenant(ctx context.Context, db *database.Client, tenantID string) ([]TenantModelRow, error) {
	if db == nil || db.Client == nil {
		return nil, nil
	}
	var rows []TenantModelRow
	_, err := db.From("tenant_models").
		Select("id,provider_key,model_id,display_name,quality_score,cost_per_token,context_window,max_tokens,tags,is_active,created_at,updated_at", "", false).
		Filter("tenant_id", "eq", tenantID).
		Filter("is_active", "eq", "true").
		ExecuteTo(&rows)
	if err != nil {
		return nil, fmt.Errorf("load tenant models: %w", err)
	}
	return rows, nil
}

func nullIfEmpty(s string) interface{} {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

