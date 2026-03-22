package auth

import "context"

type userCtxKey struct{}

// WithUser returns a context that carries the authenticated user.
func WithUser(ctx context.Context, u *User) context.Context {
	return context.WithValue(ctx, userCtxKey{}, u)
}

// GetUserFromContext extracts the user from context (typed key).
func GetUserFromContext(ctx context.Context) (*User, bool) {
	u, ok := ctx.Value(userCtxKey{}).(*User)
	return u, ok
}
