package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"gaiol/internal/database"

	"github.com/golang-jwt/jwt/v5"
)

// User represents an authenticated user
type User struct {
	ID       string
	Email    string
	TenantID string
	OrgID    string
	Claims   jwt.MapClaims
}

// tokenCacheEntry caches a verified user for a short period to avoid
// hitting the Supabase API on every single request.
type tokenCacheEntry struct {
	user      *User
	expiresAt time.Time
}

var (
	tokenCache   = make(map[string]tokenCacheEntry)
	tokenCacheMu sync.RWMutex
)

const tokenCacheTTL = 60 * time.Second

func getCachedUser(token string) *User {
	tokenCacheMu.RLock()
	defer tokenCacheMu.RUnlock()
	entry, ok := tokenCache[token]
	if !ok || time.Now().After(entry.expiresAt) {
		return nil
	}
	return entry.user
}

func setCachedUser(token string, user *User) {
	tokenCacheMu.Lock()
	defer tokenCacheMu.Unlock()
	tokenCache[token] = tokenCacheEntry{user: user, expiresAt: time.Now().Add(tokenCacheTTL)}
	// Lazy eviction: remove expired entries when cache grows
	if len(tokenCache) > 500 {
		now := time.Now()
		for k, v := range tokenCache {
			if now.After(v.expiresAt) {
				delete(tokenCache, k)
			}
		}
	}
}

// AuthMiddleware validates Supabase JWT tokens and extracts user information.
// It validates tokens by calling Supabase's /auth/v1/user endpoint, which
// eliminates the need for a local JWT secret.
func AuthMiddleware(db *database.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// CORS middleware is inner; browser preflight sends OPTIONS without Authorization.
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			// Skip auth for public routes
			if r.URL.Path == "/health" ||
				r.URL.Path == "/" ||
				strings.HasPrefix(r.URL.Path, "/web/") ||
				strings.HasPrefix(r.URL.Path, "/api/models") {
				next.ServeHTTP(w, r)
				return
			}

			// Extract token from Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				cookie, err := r.Cookie("sb-access-token")
				if err != nil {
					http.Error(w, "Authorization required", http.StatusUnauthorized)
					return
				}
				authHeader = "Bearer " + cookie.Value
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
				return
			}

			tokenString := strings.TrimSpace(parts[1])
			if tokenString == "" {
				http.Error(w, "Authorization required", http.StatusUnauthorized)
				return
			}

			if db == nil {
				http.Error(w, "Authentication service unavailable", http.StatusServiceUnavailable)
				return
			}

			// Validate token: check cache first, then call Supabase API
			user := getCachedUser(tokenString)
			if user == nil {
				var err error
				user, err = verifyTokenViaSupabase(db.URL, db.APIKey, tokenString)
				if err != nil {
					http.Error(w, "Invalid or expired token: "+err.Error(), http.StatusUnauthorized)
					return
				}
				setCachedUser(tokenString, user)
			}

			// Resolve tenant from DB
			var tenantCtx database.TenantContext
			tc, err := db.GetTenantInfo(r.Context(), user.ID)
			if err != nil || tc == nil {
				tenantCtx = database.TenantContext{TenantID: user.ID, UserID: user.ID, OrgID: user.OrgID}
			} else {
				tenantCtx = *tc
				if tenantCtx.TenantID == "" {
					tenantCtx.TenantID = user.ID
				}
			}

			ctx := WithUser(r.Context(), user)
			ctx = database.WithTenant(ctx, tenantCtx)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// verifyTokenViaSupabase validates an access token by calling Supabase's
// /auth/v1/user endpoint. This is the authoritative way to verify a token
// and does not require the JWT secret.
func verifyTokenViaSupabase(supabaseURL, apiKey, accessToken string) (*User, error) {
	url := fmt.Sprintf("%s/auth/v1/user", supabaseURL)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("apikey", apiKey)
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach auth service: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token rejected by auth service (HTTP %d)", resp.StatusCode)
	}

	var supaUser struct {
		ID           string                 `json:"id"`
		Email        string                 `json:"email"`
		UserMetadata map[string]interface{} `json:"user_metadata"`
	}
	if err := json.Unmarshal(body, &supaUser); err != nil {
		return nil, fmt.Errorf("failed to parse auth response: %w", err)
	}

	if supaUser.ID == "" {
		return nil, errors.New("auth service returned empty user ID")
	}

	user := &User{
		ID:    supaUser.ID,
		Email: supaUser.Email,
	}

	if supaUser.UserMetadata != nil {
		if tenantID, ok := supaUser.UserMetadata["tenant_id"].(string); ok {
			user.TenantID = tenantID
		}
		if orgID, ok := supaUser.UserMetadata["org_id"].(string); ok {
			user.OrgID = orgID
		}
	}

	if user.TenantID == "" {
		user.TenantID = user.ID
	}

	return user, nil
}

// VerifyToken verifies a Supabase JWT token locally (kept for backward compatibility).
// Prefer verifyTokenViaSupabase for reliable verification without needing the JWT secret.
func VerifyToken(tokenString, apiKey string) (*User, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(apiKey), nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	if !token.Valid {
		return nil, errors.New("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid token claims")
	}

	user := &User{Claims: claims}

	if sub, ok := claims["sub"].(string); ok {
		user.ID = sub
	}
	if email, ok := claims["email"].(string); ok {
		user.Email = email
	}
	if userMetadata, ok := claims["user_metadata"].(map[string]interface{}); ok {
		if tenantID, ok := userMetadata["tenant_id"].(string); ok {
			user.TenantID = tenantID
		}
		if orgID, ok := userMetadata["org_id"].(string); ok {
			user.OrgID = orgID
		}
	}
	if user.TenantID == "" {
		user.TenantID = user.ID
	}

	return user, nil
}

// RequireAuth ensures a request has authenticated user, returns error if missing
func RequireAuth(ctx context.Context) (*User, error) {
	user, ok := GetUserFromContext(ctx)
	if !ok {
		return nil, errors.New("authentication required")
	}
	return user, nil
}

// OptionalAuth returns user if present, nil if not (doesn't error)
func OptionalAuth(ctx context.Context) *User {
	user, _ := GetUserFromContext(ctx)
	return user
}
