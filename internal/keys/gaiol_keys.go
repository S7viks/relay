package keys

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"gaiol/internal/database"
)

const keyPrefix = "gaiol_"
const keySecretBytes = 32

// GAIOLKeyRow is a row from gaiol_api_keys (list response: no key material).
type GAIOLKeyRow struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

// CreateGAIOLKey generates a new key (gaiol_ + 32 bytes hex), stores SHA-256 hash, returns raw key once.
func CreateGAIOLKey(ctx context.Context, db *database.Client, tenantID string, name string) (rawKey string, err error) {
	if db == nil || db.Client == nil {
		return "", errors.New("database client is required")
	}
	if name == "" {
		name = "default"
	}
	secret := make([]byte, keySecretBytes)
	if _, err := rand.Read(secret); err != nil {
		return "", fmt.Errorf("generate secret: %w", err)
	}
	rawKey = keyPrefix + hex.EncodeToString(secret)
	hash := sha256.Sum256([]byte(rawKey))
	keyHash := hex.EncodeToString(hash[:])

	row := map[string]interface{}{
		"tenant_id": tenantID,
		"key_hash":  keyHash,
		"name":      name,
	}
	_, _, err = db.From("gaiol_api_keys").Insert(row, false, "", "", "").Execute()
	if err != nil {
		return "", fmt.Errorf("insert gaiol key: %w", err)
	}
	return rawKey, nil
}

// ListGAIOLKeys returns GAIOL keys for the tenant (id, name, last_used_at, created_at). No key material.
func ListGAIOLKeys(ctx context.Context, db *database.Client, tenantID string) ([]GAIOLKeyRow, error) {
	if db == nil || db.Client == nil {
		return nil, errors.New("database client is required")
	}
	var rows []struct {
		ID         string     `json:"id"`
		Name       string     `json:"name"`
		LastUsedAt *time.Time `json:"last_used_at"`
		CreatedAt  time.Time  `json:"created_at"`
	}
	_, err := db.From("gaiol_api_keys").
		Select("id,name,last_used_at,created_at", "", false).
		Filter("tenant_id", "eq", tenantID).
		ExecuteTo(&rows)
	if err != nil {
		return nil, fmt.Errorf("list gaiol keys: %w", err)
	}
	out := make([]GAIOLKeyRow, len(rows))
	for i := range rows {
		out[i] = GAIOLKeyRow{
			ID:         rows[i].ID,
			Name:       rows[i].Name,
			LastUsedAt: rows[i].LastUsedAt,
			CreatedAt:  rows[i].CreatedAt,
		}
	}
	return out, nil
}

// RevokeGAIOLKey deletes the key by id if it belongs to the tenant.
func RevokeGAIOLKey(ctx context.Context, db *database.Client, tenantID string, keyID string) error {
	if db == nil || db.Client == nil {
		return errors.New("database client is required")
	}
	if keyID == "" {
		return errors.New("key id is required")
	}
	_, _, err := db.From("gaiol_api_keys").
		Delete("", "").
		Filter("id", "eq", keyID).
		Filter("tenant_id", "eq", tenantID).
		Execute()
	if err != nil {
		return fmt.Errorf("revoke gaiol key: %w", err)
	}
	return nil
}

// ValidateGAIOLKey hashes the bearer token, looks up in gaiol_api_keys, returns tenant_id and updates last_used_at.
// Returns empty tenantID and error if not found or invalid.
func ValidateGAIOLKey(ctx context.Context, db *database.Client, rawToken string) (tenantID string, err error) {
	if db == nil || db.Client == nil {
		return "", errors.New("database client is required")
	}
	if rawToken == "" {
		return "", errors.New("token is required")
	}
	hash := sha256.Sum256([]byte(rawToken))
	keyHash := hex.EncodeToString(hash[:])

	var rows []struct {
		TenantID string `json:"tenant_id"`
		ID       string `json:"id"`
	}
	_, err = db.From("gaiol_api_keys").
		Select("id,tenant_id", "", false).
		Filter("key_hash", "eq", keyHash).
		ExecuteTo(&rows)
	if err != nil || len(rows) == 0 {
		return "", errors.New("invalid or expired key")
	}
	tenantID = rows[0].TenantID
	keyID := rows[0].ID

	// Update last_used_at (best-effort)
	now := time.Now().UTC().Format(time.RFC3339)
	_, _, _ = db.From("gaiol_api_keys").
		Update(map[string]interface{}{"last_used_at": now}, "", "").
		Filter("id", "eq", keyID).
		Execute()

	return tenantID, nil
}
