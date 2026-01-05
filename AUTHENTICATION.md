# Authentication Guide

This document explains the authentication system implemented in GAIOL.

## Overview

GAIOL uses Supabase Auth for user authentication. The system provides:
- User signup and signin
- JWT token-based authentication
- Automatic token refresh
- Session management
- Multitenant user isolation

## Backend API Endpoints

### Authentication Endpoints

#### `POST /api/auth/signup`
Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "data": {
    "tenant_id": "optional-tenant-id",
    "org_id": "optional-org-id"
  }
}
```

**Response:**
```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "user_metadata": {},
    "created_at": "2024-01-01T00:00:00Z"
  },
  "session": {
    "access_token": "jwt-token",
    "refresh_token": "refresh-token",
    "expires_in": 3600,
    "token_type": "bearer"
  },
  "access_token": "jwt-token",
  "refresh_token": "refresh-token"
}
```

#### `POST /api/auth/signin`
Authenticate a user and get a session.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "session": {
    "access_token": "jwt-token",
    "refresh_token": "refresh-token",
    "expires_in": 3600,
    "token_type": "bearer",
    "user": { ... }
  },
  "user": { ... },
  "access_token": "jwt-token",
  "refresh_token": "refresh-token"
}
```

#### `POST /api/auth/signout`
Sign out the current user (invalidates session).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Signed out successfully"
}
```

#### `GET /api/auth/session`
Get current session information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    ...
  }
}
```

#### `GET /api/auth/user`
Get current user information (alias for `/api/auth/session`).

#### `POST /api/auth/refresh`
Refresh an access token using a refresh token.

**Request:**
```json
{
  "refresh_token": "refresh-token"
}
```

**Response:**
```json
{
  "access_token": "new-jwt-token",
  "refresh_token": "new-refresh-token",
  "expires_in": 3600,
  "token_type": "bearer",
  "user": { ... }
}
```

## Frontend Usage

### JavaScript API Functions

The frontend API client (`web/js/api.js`) provides the following authentication functions:

#### `signUp(email, password, metadata)`
Create a new user account.

```javascript
try {
    const result = await signUp('user@example.com', 'password123', {
        tenant_id: 'optional-tenant-id'
    });
    console.log('User created:', result.user);
} catch (error) {
    console.error('Signup failed:', error.message);
}
```

#### `signIn(email, password)`
Sign in a user.

```javascript
try {
    const result = await signIn('user@example.com', 'password123');
    console.log('Signed in:', result.user);
    // Tokens are automatically stored in localStorage
} catch (error) {
    console.error('Sign in failed:', error.message);
}
```

#### `signOut()`
Sign out the current user.

```javascript
try {
    await signOut();
    console.log('Signed out successfully');
    // Tokens are automatically cleared
} catch (error) {
    console.error('Sign out failed:', error.message);
}
```

#### `getSession()`
Get current session information.

```javascript
try {
    const session = await getSession();
    console.log('Current user:', session.user);
} catch (error) {
    console.error('Failed to get session:', error.message);
}
```

#### `getCurrentUser()`
Get current user information.

```javascript
try {
    const user = await getCurrentUser();
    console.log('User:', user);
} catch (error) {
    console.error('Failed to get user:', error.message);
}
```

#### `refreshAccessToken()`
Refresh the access token.

```javascript
try {
    const session = await refreshAccessToken();
    console.log('Token refreshed');
} catch (error) {
    console.error('Token refresh failed:', error.message);
    // User will need to sign in again
}
```

#### `isAuthenticated()`
Check if user is authenticated.

```javascript
if (isAuthenticated()) {
    console.log('User is authenticated');
} else {
    console.log('User is not authenticated');
}
```

### Automatic Token Management

The API client automatically:
- Includes access tokens in request headers for authenticated endpoints
- Refreshes expired tokens when needed
- Clears tokens on authentication errors
- Stores tokens in localStorage

### Protected Endpoints

The following endpoints require authentication:
- `POST /api/query` - Multi-model comparison
- `POST /api/query/smart` - Smart routing
- `POST /api/query/model` - Query specific model

These endpoints automatically include the access token in requests if available.

## Backend Implementation

### Authentication Middleware

The `AuthMiddleware` validates JWT tokens and extracts user information:

```go
authMiddleware := auth.AuthMiddleware(dbClient)
http.Handle("/api/query", authMiddleware(http.HandlerFunc(handleQuery)))
```

### Getting User Information in Handlers

```go
import "gaiol/internal/auth"

func handleQuery(w http.ResponseWriter, r *http.Request) {
    user, err := auth.RequireAuth(r.Context())
    if err != nil {
        http.Error(w, "Authentication required", http.StatusUnauthorized)
        return
    }
    
    // Use user.ID, user.Email, user.TenantID, user.OrgID
    fmt.Printf("User: %s, Tenant: %s\n", user.Email, user.TenantID)
}
```

### Getting Tenant Context

```go
import "gaiol/internal/database"

func handleQuery(w http.ResponseWriter, r *http.Request) {
    tenant, err := database.EnsureTenantContext(r.Context())
    if err != nil {
        http.Error(w, "Tenant context required", http.StatusUnauthorized)
        return
    }
    
    // Use tenant.TenantID, tenant.UserID, tenant.OrgID
    fmt.Printf("Tenant: %s\n", tenant.TenantID)
}
```

## Token Storage

### Frontend
- Access tokens stored in `localStorage` as `gaiol_access_token`
- Refresh tokens stored in `localStorage` as `gaiol_refresh_token`
- Cookies also set for browser-based authentication

### Backend
- Tokens validated on each request
- No server-side token storage (stateless)
- Tokens verified against Supabase JWT secret

## Security Considerations

1. **HTTPS Required**: In production, always use HTTPS to protect tokens in transit
2. **Token Expiration**: Access tokens expire after 1 hour (default)
3. **Refresh Tokens**: Use refresh tokens to get new access tokens without re-authentication
4. **Token Validation**: All tokens are validated against Supabase's JWT secret
5. **Row Level Security**: Database queries are automatically scoped to user's tenant

## Error Handling

### Common Errors

- **401 Unauthorized**: Invalid or expired token
  - Solution: Refresh token or sign in again

- **400 Bad Request**: Invalid request data
  - Solution: Check request format and required fields

- **403 Forbidden**: User doesn't have permission
  - Solution: Check user permissions and tenant access

## Testing Authentication

### Using cURL

```bash
# Sign up
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Sign in
curl -X POST http://localhost:8080/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Get session (use access_token from signin response)
curl -X GET http://localhost:8080/api/auth/session \
  -H "Authorization: Bearer <access_token>"

# Query models (requires auth)
curl -X POST http://localhost:8080/api/query/smart \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{"prompt":"Hello world"}'
```

## Next Steps

- Add password reset functionality
- Implement OAuth providers (Google, GitHub, etc.)
- Add email verification
- Implement role-based access control (RBAC)
- Add rate limiting per user/tenant
