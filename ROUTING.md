# Routing Configuration

This document describes the routing setup for the GAIOL web server.

## Route Registration Order

Routes are registered in the following order (important for Go's http package):

1. **Root and System Routes** (public)
   - `GET /` - File server (serves web UI)
   - `GET /health` - Health check

2. **Model Routes** (public, specific first)
   - `GET /api/models/free` - List free models (registered first to avoid conflict)
   - `GET /api/models` - List all models
   - `GET /api/models/` - List by provider (catch-all, registered last)

3. **Authentication Routes** (public, only if database available)
   - `POST /api/auth/signup` - Create new account
   - `POST /api/auth/signin` - Sign in
   - `POST /api/auth/signout` - Sign out
   - `GET /api/auth/session` - Get current session
   - `POST /api/auth/refresh` - Refresh access token
   - `GET /api/auth/user` - Get current user

4. **Protected Query Routes** (auth required, only if database available)
   - `POST /api/query` - Multi-model comparison
   - `POST /api/query/smart` - Smart routing
   - `POST /api/query/model` - Query specific model

## Route Matching Rules

### Go http Package Behavior

- Routes with trailing slashes (`/api/models/`) match any path that starts with that prefix
- More specific routes must be registered before less specific ones
- Example: `/api/models/free` must be registered before `/api/models/` to work correctly

### Public vs Protected Routes

**Public Routes** (no authentication required):
- All routes under `/api/models*`
- All routes under `/api/auth/*`
- `/health`
- `/` (file server)

**Protected Routes** (authentication required):
- `/api/query`
- `/api/query/smart`
- `/api/query/model`

## Authentication Middleware

The `AuthMiddleware` automatically:
- Skips authentication for public routes:
  - `/health`
  - `/` (root)
  - `/web/*` (static files)
  - `/api/models/*` (model listing)
  - `/api/auth/*` (authentication endpoints)
- Validates JWT tokens for protected routes
- Extracts user and tenant information
- Adds user/tenant context to request

## Fallback Behavior

If database connection fails:
- Authentication routes are not registered
- Protected routes become public (no auth required)
- Warning message is logged

## Route Conflicts

### Potential Issues

1. **`/api/models/` vs `/api/models/free`**
   - **Solution**: Register `/api/models/free` before `/api/models/`
   - **Status**: ✅ Fixed

2. **File server vs API routes**
   - **Solution**: File server only serves from `./web` directory, API routes have `/api/` prefix
   - **Status**: ✅ No conflict

3. **Auth middleware skipping**
   - **Solution**: Middleware explicitly skips public routes
   - **Status**: ✅ Fixed

## Testing Routes

### Public Routes (no auth)
```bash
# Health check
curl http://localhost:8080/health

# List models
curl http://localhost:8080/api/models

# List free models
curl http://localhost:8080/api/models/free

# List by provider
curl http://localhost:8080/api/models/openrouter
```

### Authentication Routes
```bash
# Sign up
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Sign in
curl -X POST http://localhost:8080/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Protected Routes (require auth)
```bash
# Query (requires Authorization header)
curl -X POST http://localhost:8080/api/query/smart \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"prompt":"Hello world"}'
```

## Route Registration Code

```go
// Public routes (no auth required)
http.HandleFunc("/", noCacheFileServer)
http.HandleFunc("/health", handleHealth)

// Model routes - specific first
http.HandleFunc("/api/models/free", corsMiddleware(handleListFreeModels))
http.HandleFunc("/api/models", corsMiddleware(handleListModels))
http.HandleFunc("/api/models/", corsMiddleware(handleModelsByProvider))

// Authentication routes (public)
if dbClient != nil {
    authAPI := auth.NewAuthAPI(dbClient)
    http.HandleFunc("/api/auth/signup", corsMiddleware(handleSignUp(authAPI)))
    // ... other auth routes
}

// Protected routes (auth required)
if dbClient != nil {
    authMiddleware := auth.AuthMiddleware(dbClient)
    http.Handle("/api/query", authMiddleware(http.HandlerFunc(corsMiddleware(handleQuery))))
    // ... other protected routes
}
```

## CORS Configuration

All API routes use `corsMiddleware` which:
- Allows all origins (`*`)
- Allows `POST`, `GET`, `OPTIONS` methods
- Allows `Content-Type` and `Authorization` headers
- Handles preflight OPTIONS requests

## Notes

- Route order matters in Go's `http` package
- Trailing slashes create prefix matches
- More specific routes must be registered first
- Middleware chain: CORS → Auth (if protected) → Handler
