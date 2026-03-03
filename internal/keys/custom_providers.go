package keys

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"relay/internal/database"
)

var providerKeyRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

var reservedProviderKeys = map[string]struct{}{
	"openrouter":  {},
	"huggingface": {},
	"google":      {},
	"gemini":      {},
	"ollama":      {},
}

type CustomProviderRow struct {
	ID           string    `json:"id"`
	ProviderKey  string    `json:"provider_key"`
	ProviderType string    `json:"provider_type"`
	BaseURL      string    `json:"base_url"`
	AuthHeader   string    `json:"auth_header"`
	AuthScheme   string    `json:"auth_scheme"`
	KeyHint      string    `json:"key_hint"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type CustomProviderConfig struct {
	ProviderKey  string
	ProviderType string
	BaseURL      string
	AuthHeader   string
	AuthScheme   string
	APIKey       string
}

func normalizeProviderKey(k string) (string, error) {
	k = strings.TrimSpace(strings.ToLower(k))
	if k == "" {
		return "", errors.New("provider_key is required")
	}
	if !providerKeyRe.MatchString(k) {
		return "", errors.New("provider_key must match ^[a-z0-9][a-z0-9_-]{0,63}$")
	}
	if _, reserved := reservedProviderKeys[k]; reserved {
		return "", fmt.Errorf("provider_key %q is reserved (use a different name)", k)
	}
	return k, nil
}

func normalizeBaseURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", errors.New("base_url must be a valid URL (e.g. https://api.openai.com)")
	}
	// Keep as-is; adapters will normalize trailing slashes.
	return strings.TrimRight(raw, "/"), nil
}

// StoreCustomProvider stores an arbitrary provider endpoint + encrypted auth key.
// Currently supported provider_type: "openai_compatible".
func StoreCustomProvider(
	ctx context.Context,
	db *database.Client,
	tenantID string,
	providerKey string,
	providerType string,
	baseURL string,
	apiKey string,
	authHeader string,
	authScheme string,
) (keyHint string, err error) {
	if db == nil || db.Client == nil {
		return "", errors.New("database client is required")
	}
	pk, err := normalizeProviderKey(providerKey)
	if err != nil {
		return "", err
	}
	pt := strings.TrimSpace(strings.ToLower(providerType))
	if pt == "" {
		// Sensible defaults for common providers
		switch pk {
		case "anthropic":
			pt = "anthropic_messages"
		case "deepseek":
			pt = "openai_compatible"
		default:
			pt = "openai_compatible"
		}
	}
	if pt != "openai_compatible" && pt != "anthropic_messages" {
		return "", fmt.Errorf("unsupported provider_type %q", providerType)
	}
	u, err := normalizeBaseURL(baseURL)
	if err != nil {
		return "", err
	}
	// Default base URLs when omitted
	if u == "" {
		switch pt {
		case "anthropic_messages":
			u = "https://api.anthropic.com"
		case "openai_compatible":
			switch pk {
			case "deepseek":
				u = "https://api.deepseek.com"
			case "openai":
				u = "https://api.openai.com"
			case "xai":
				u = "https://api.x.ai/v1"
			case "groq":
				u = "https://api.groq.com/openai/v1"
			case "together":
				u = "https://api.together.xyz/v1"
			case "fireworks":
				u = "https://api.fireworks.ai/inference/v1"
			case "mistral":
				u = "https://api.mistral.ai/v1"
			case "perplexity":
				u = "https://api.perplexity.ai"
			default:
				return "", errors.New("base_url is required")
			}
		}
	}
	if strings.TrimSpace(apiKey) == "" {
		return "", errors.New("api_key is required")
	}
	if strings.TrimSpace(authHeader) == "" {
		if pt == "anthropic_messages" {
			authHeader = "x-api-key"
		} else {
			authHeader = "Authorization"
		}
	}
	authScheme = strings.TrimSpace(authScheme)
	if authScheme == "" {
		if pt == "anthropic_messages" {
			authScheme = "" // x-api-key uses raw token
		} else {
			authScheme = "Bearer"
		}
	}

	encrypted, err := Encrypt([]byte(strings.TrimSpace(apiKey)))
	if err != nil {
		return "", fmt.Errorf("encrypt key: %w", err)
	}
	hint := keyHintFromKey(apiKey)

	row := map[string]interface{}{
		"tenant_id":      tenantID,
		"provider_key":   pk,
		"provider_type":  pt,
		"base_url":       u,
		"auth_header":    authHeader,
		"auth_scheme":    authScheme,
		"encrypted_key":  encrypted,
		"key_hint":       hint,
		"is_active":      true,
		"updated_at":     time.Now().UTC().Format(time.RFC3339),
	}
	_, _, err = db.From("tenant_providers").Insert(row, true, "tenant_id,provider_key", "", "").Execute()
	if err != nil {
		return "", fmt.Errorf("upsert tenant provider: %w", err)
	}
	return hint, nil
}

func ListCustomProviders(ctx context.Context, db *database.Client, tenantID string) ([]CustomProviderRow, error) {
	if db == nil || db.Client == nil {
		return nil, errors.New("database client is required")
	}
	var rows []CustomProviderRow
	_, err := db.From("tenant_providers").
		Select("id,provider_key,provider_type,base_url,auth_header,auth_scheme,key_hint,is_active,created_at,updated_at", "", false).
		Filter("tenant_id", "eq", tenantID).
		ExecuteTo(&rows)
	if err != nil {
		return nil, fmt.Errorf("list tenant providers: %w", err)
	}
	return rows, nil
}

func DeleteCustomProvider(ctx context.Context, db *database.Client, tenantID string, providerKey string) error {
	if db == nil || db.Client == nil {
		return errors.New("database client is required")
	}
	pk, err := normalizeProviderKey(providerKey)
	if err != nil {
		return err
	}
	_, _, err = db.From("tenant_providers").
		Delete("", "").
		Filter("tenant_id", "eq", tenantID).
		Filter("provider_key", "eq", pk).
		Execute()
	if err != nil {
		return fmt.Errorf("delete tenant provider: %w", err)
	}
	return nil
}

// LoadCustomProvidersForTenant returns decrypted provider configs keyed by provider_key.
func LoadCustomProvidersForTenant(ctx context.Context, db *database.Client, tenantID string) (map[string]CustomProviderConfig, error) {
	if db == nil || db.Client == nil {
		return nil, nil
	}
	var rows []struct {
		ProviderKey  string `json:"provider_key"`
		ProviderType string `json:"provider_type"`
		BaseURL      string `json:"base_url"`
		AuthHeader   string `json:"auth_header"`
		AuthScheme   string `json:"auth_scheme"`
		EncryptedKey string `json:"encrypted_key"`
	}
	_, err := db.From("tenant_providers").
		Select("provider_key,provider_type,base_url,auth_header,auth_scheme,encrypted_key", "", false).
		Filter("tenant_id", "eq", tenantID).
		Filter("is_active", "eq", "true").
		ExecuteTo(&rows)
	if err != nil {
		return nil, fmt.Errorf("load tenant providers: %w", err)
	}
	out := make(map[string]CustomProviderConfig)
	for _, r := range rows {
		pk := strings.TrimSpace(strings.ToLower(r.ProviderKey))
		if pk == "" {
			continue
		}
		plain, err := Decrypt(r.EncryptedKey)
		if err != nil {
			continue
		}
		out[pk] = CustomProviderConfig{
			ProviderKey:  pk,
			ProviderType: strings.TrimSpace(strings.ToLower(r.ProviderType)),
			BaseURL:      strings.TrimRight(strings.TrimSpace(r.BaseURL), "/"),
			AuthHeader:   strings.TrimSpace(r.AuthHeader),
			AuthScheme:   strings.TrimSpace(r.AuthScheme),
			APIKey:       string(plain),
		}
	}
	return out, nil
}

