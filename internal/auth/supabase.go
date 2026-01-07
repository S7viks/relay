package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

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

// AuthMiddleware validates Supabase JWT tokens and extracts user information
func AuthMiddleware(db *database.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
				// Try to get from cookie (Supabase sets auth cookies)
				cookie, err := r.Cookie("sb-access-token")
				if err != nil {
					http.Error(w, "Authorization required", http.StatusUnauthorized)
					return
				}
				authHeader = "Bearer " + cookie.Value
			}

			// Parse Bearer token
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
				return
			}

			tokenString := parts[1]

			// Verify and parse JWT token
			user, err := VerifyToken(tokenString, db.APIKey)
			if err != nil {
				http.Error(w, "Invalid or expired token: "+err.Error(), http.StatusUnauthorized)
				return
			}

			// Create tenant context
			tenantCtx := database.TenantContext{
				TenantID: user.TenantID,
				UserID:   user.ID,
				OrgID:    user.OrgID,
			}

			// Add user and tenant to request context
			ctx := context.WithValue(r.Context(), "user", user)
			ctx = database.WithTenant(ctx, tenantCtx)

			// Continue with authenticated request
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// VerifyToken verifies a Supabase JWT token and returns user information
// Note: For production, you should verify against SUPABASE_JWT_SECRET instead of anon key
func VerifyToken(tokenString, apiKey string) (*User, error) {
	// Parse and verify token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method (Supabase uses HS256)
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		// For client-side verification, we use the anon key
		// For server-side verification in production, use SUPABASE_JWT_SECRET
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

	// Extract user information from claims
	user := &User{
		Claims: claims,
	}

	// Supabase JWT structure: sub is user ID, email is email
	if sub, ok := claims["sub"].(string); ok {
		user.ID = sub
	}

	if email, ok := claims["email"].(string); ok {
		user.Email = email
	}

	// Extract tenant/org from custom claims or user_metadata
	if userMetadata, ok := claims["user_metadata"].(map[string]interface{}); ok {
		if tenantID, ok := userMetadata["tenant_id"].(string); ok {
			user.TenantID = tenantID
		}
		if orgID, ok := userMetadata["org_id"].(string); ok {
			user.OrgID = orgID
		}
	}

	// If tenant_id not in metadata, use user ID as tenant ID (single-tenant mode)
	if user.TenantID == "" {
		user.TenantID = user.ID
	}

	return user, nil
}

// GetUserFromContext extracts user from request context
func GetUserFromContext(ctx context.Context) (*User, bool) {
	user, ok := ctx.Value("user").(*User)
	return user, ok
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
