# GAIOL API Documentation

Complete API reference for the GAIOL platform.

---

## Table of Contents

- [Base URL](#base-url)
- [Authentication](#authentication)
- [Unified Inference (POST /v1/chat)](#unified-inference-post-v1chat)
- [Model Discovery](#model-discovery)
- [Query Endpoints](#query-endpoints)
- [Reasoning Engine](#reasoning-engine)
- [Authentication API](#authentication-api)
- [Monitoring](#monitoring)
- [Error Handling](#error-handling)
- [WebSocket Events](#websocket-events)

---

## Base URL

```
http://localhost:8080
```

All endpoints are prefixed with `/api` except system endpoints.

---

## Authentication

Most endpoints support optional authentication. When authentication is enabled:

- Include `Authorization: Bearer <token>` header
- Tokens are obtained via `/api/auth/signin`
- Tokens expire after 1 hour (default)
- Use `/api/auth/refresh` to get new tokens

**Note**: Authentication is optional. The system works without a database, but some features require authentication.

### Unified Inference API (GAIOL key)

For programmatic access without a browser session, use a **GAIOL API key** (created in Dashboard > API keys):

- **Header:** `Authorization: Bearer <your_gaiol_key>`
- **Endpoint:** `POST /v1/chat` (see [Unified Inference](#unified-inference-post-v1chat) below)
- **Rate limit:** 60 requests per minute per key. Response `429 Too Many Requests` with `Retry-After: 60` when exceeded.

---

## Unified Inference (POST /v1/chat)

Single endpoint for inference using your **GAIOL API key** (no JWT). Add provider keys in the dashboard first; then create a GAIOL key and use it here.

**Request:**
```http
POST /v1/chat
Authorization: Bearer <gaiol_api_key>
Content-Type: application/json
```
```json
{
  "prompt": "Your question or task",
  "strategy": "balanced",
  "task": "generate",
  "max_tokens": 500,
  "temperature": 0.7
}
```

**Response (200):**
```json
{
  "result": "Model output text...",
  "cost": 0.0012,
  "session_id": "uuid"
}
```

**Errors:**
- `401` — Missing or invalid API key
- `400` — No provider keys configured for this tenant; add keys in Dashboard > Models
- `429` — Rate limit exceeded (60 requests/minute per key); retry after `Retry-After` seconds

**Quickstart:** Sign up → Dashboard > Models (add OpenRouter/Google/HuggingFace key) → Dashboard > API keys (create key, copy once) → `curl -X POST http://localhost:8080/v1/chat -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" -d '{"prompt":"Hello"}'`

---

## Model Discovery

### List All Models

```http
GET /api/models
```

**Response:**
```json
{
  "models": [
    {
      "id": "openrouter:google/gemini-2.0-flash-exp:free",
      "provider": "openrouter",
      "model_name": "google/gemini-2.0-flash-exp:free",
      "display_name": "Google Gemini 2.0 Flash (Experimental)",
      "cost_per_token": 0.0,
      "capabilities": {
        "text_generation": true,
        "code_generation": true
      },
      "quality_score": 0.85,
      "context_window": 1000000,
      "max_tokens": 8192,
      "tags": ["free", "fast", "multimodal"]
    }
  ],
  "count": 150
}
```

### List Free Models

```http
GET /api/models/free
```

Returns only models with `cost_per_token: 0.0`.

### List Models by Provider

```http
GET /api/models/:provider
```

**Example:**
```http
GET /api/models/openrouter
```

**Response:**
```json
{
  "provider": "openrouter",
  "models": [...],
  "count": 120
}
```

---

## Query Endpoints

### Smart Query (Recommended)

```http
POST /api/query/smart
```

**Request:**
```json
{
  "prompt": "Explain quantum computing in simple terms",
  "strategy": "balanced",
  "task": "explanation",
  "max_tokens": 500,
  "temperature": 0.7
}
```

**Parameters:**
- `prompt` (string, required): The user's query
- `strategy` (string, optional): `free_only`, `lowest_cost`, `highest_quality`, `balanced` (default)
- `task` (string, optional): Task type hint
- `max_tokens` (number, optional): Maximum tokens in response (default: 300)
- `temperature` (number, optional): Sampling temperature 0.0-2.0 (default: 0.7)

**Response:**
```json
{
  "uaip": true,
  "status": {
    "success": true
  },
  "result": {
    "data": "Quantum computing is a type of computation...",
    "tokens_used": 245,
    "model_used": "ReasoningEngine",
    "processing_ms": 1234,
    "quality": 0.92
  },
  "metadata": {
    "cost_info": {
      "total_cost": 0.0
    },
    "session_id": "uuid-here",
    "steps_executed": 3
  },
  "model_id": "reasoning-engine",
  "model_name": "GAIOL Reasoning Engine",
  "response": "Quantum computing is a type of computation...",
  "tokens_used": 245,
  "cost": 0.0,
  "latency_ms": 1234,
  "quality": 0.92,
  "strategy": "reasoning"
}
```

**TypeScript orchestrator path** (when `GAIOL_TS_ORCHESTRATOR_URL` is set and `GAIOL_USE_TS_ORCHESTRATOR=1`, and strategy is not `go_reasoning`): the same endpoint returns additional fields for observability:

- `metadata.trace_id` — orchestration trace id (same as `metadata.session_id` in the TS delegate path today).
- `metadata.engine` — `"typescript_orchestrator"`.
- `orchestration` — `{ schema_version, trace_id, trust_updates_count, consensus_mode, explore_paths, beam_width }`.
- `orchestration_trace` — full v1 trace object.
- `orchestration_trust_updates` — ABTC trust delta list.
- `orchestration_metrics` — server-side summary (latency, cost, trust movement) aligned with trace metrics.

### Orchestration (proxied via Go)

These require the TS orchestrator URL on the Go server. Without it, responses are `503` with `ts_orchestrator_disabled`.

```http
GET /api/orchestration/traces/{trace_id}
```

Returns the TS bundle: `trace`, `timeline_rebuilt`, `metrics_summary`.

```http
GET /api/orchestration/trust?domain=
```

Optional `domain` filters trust rows. Response: `{ "records": [...], "count": n, "domain": "general" | null }` (TrustRecord: `modelId`, `domain`, `distribution` { alpha, beta }, `updatedAt`).

```http
GET /api/orchestration/trace-ids?limit=50
```

Returns `{ "trace_ids": [...], "count": n }` (recent ids from in-memory TS store).

```http
POST /api/orchestration/eval/contains
Content-Type: application/json
```

Body:

```json
{
  "examples": [{ "objective": "Say hello", "expectedContains": ["hello"] }],
  "answerText": "Hello there"
}
```

Response: `{ "pass": true, "results": [...], "eval_id": "..." }`.

### Query Specific Model

```http
POST /api/query/model
```

**Request:**
```json
{
  "prompt": "Write a Python function to calculate fibonacci",
  "model_id": "openrouter:google/gemini-2.0-flash-exp:free",
  "max_tokens": 500,
  "temperature": 0.7
}
```

**Response:**
```json
{
  "model_id": "openrouter:google/gemini-2.0-flash-exp:free",
  "model_name": "Google Gemini 2.0 Flash",
  "response": "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)",
  "tokens_used": 156,
  "cost": 0.0,
  "latency_ms": 890,
  "quality": 0.88
}
```

### Multi-Model Comparison (Legacy)

```http
POST /api/query
```

**Request:**
```json
{
  "prompt": "Compare Python and JavaScript",
  "models": [
    "openrouter:google/gemini-2.0-flash-exp:free",
    "openrouter:meta-llama/llama-3.2-3b-instruct:free"
  ],
  "max_tokens": 500,
  "temperature": 0.7
}
```

**Response:**
```json
{
  "results": [
    {
      "model_id": "openrouter:google/gemini-2.0-flash-exp:free",
      "response": "...",
      "tokens_used": 234,
      "cost": 0.0,
      "latency_ms": 1200,
      "quality": 0.90
    },
    {
      "model_id": "openrouter:meta-llama/llama-3.2-3b-instruct:free",
      "response": "...",
      "tokens_used": 198,
      "cost": 0.0,
      "latency_ms": 1500,
      "quality": 0.85
    }
  ],
  "count": 2
}
```

---

## Reasoning Engine

### Start Reasoning Session

```http
POST /api/reasoning/start
```

**Request:**
```json
{
  "prompt": "Design a REST API for a todo application",
  "models": [],
  "beam": {
    "enabled": true,
    "beam_width": 3
  }
}
```

**Parameters:**
- `prompt` (string, required): Complex query to reason about
- `models` (array, optional): Model IDs to use (empty = auto-select 4 free models)
- `beam` (object, optional): Beam search configuration
  - `enabled` (boolean): Enable beam search (default: true)
  - `beam_width` (number): Number of paths to explore (default: 3)

**Response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Get Session Status

```http
GET /api/reasoning/status/:session_id
```

**Response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "steps": [
    {
      "step_id": 1,
      "title": "Intent Analysis",
      "status": "completed",
      "outputs": [...]
    }
  ],
  "selected_path": [...],
  "final_output": "Design for REST API...",
  "total_cost": 0.0,
  "total_time_ms": 5432
}
```

**Status Values:**
- `pending`: Session created but not started
- `running`: Currently executing
- `completed`: Finished successfully
- `failed`: Error occurred
- `cancelled`: User cancelled

### WebSocket Connection

```http
WS /api/reasoning/ws?session_id=:session_id
```

Real-time updates for reasoning sessions.

**Events:**
- `decompose_start` - Decomposition begins
- `decompose_end` - Steps created
- `step_start` - Step processing begins
- `model_response` - Model output received
- `beam_update` - Beam search path update
- `consensus` - Consensus reached
- `step_end` - Step completed
- `reasoning_end` - Final output ready

**Example Event:**
```json
{
  "event": "step_start",
  "data": {
    "step_id": 1,
    "title": "Intent Analysis",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

---

## Authentication API

### Sign Up

```http
POST /api/auth/signup
```

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

### Sign In

```http
POST /api/auth/signin
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** Same as signup response.

### Sign Out

```http
POST /api/auth/signout
```

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

### Get Session

```http
GET /api/auth/session
```

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
    "tenant_id": "tenant-uuid",
    "org_id": "org-uuid"
  }
}
```

### Refresh Token

```http
POST /api/auth/refresh
```

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
  "token_type": "bearer"
}
```

### Get User

```http
GET /api/auth/user
```

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:** Same as `/api/auth/session`.

---

## Monitoring

### Get Statistics

```http
GET /api/monitoring/stats
```

**Response** (shape from `internal/monitoring/metrics.go` — values depend on DB refresh; many fields stay at zero until aggregates are fully wired):

```json
{
  "total_requests": 0,
  "total_cost": 0,
  "avg_latency_ms": 0,
  "success_rate": 0,
  "model_performance": {},
  "provider_health": {},
  "updated_at": "2025-01-01T12:00:00Z"
}
```

Use live output from `GET /api/monitoring/stats` as needed. To capture JSON locally, save the response body (for example with `curl -o monitoring-stats.json` against your running instance).

---

## System Endpoints

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "models": 150,
  "version": "1.0.0",
  "time": "2024-01-01T12:00:00Z",
  "auth_disabled": false,
  "database": {
    "connected": true,
    "reachable": true
  }
}
```

- `database.connected`: Supabase client was initialized at startup (auth + DB mode).
- `database.reachable`: PostgREST at your project URL responded (live ping). If `false`, see `database.ping_error`.
- With `GAIOL_DISABLE_AUTH=1`, `auth_disabled` is true, `database.connected` is false, and the app skips DB init.

---

## Error Handling

### Error Response Format

```json
{
  "error": "Error message here",
  "success": false,
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `BAD_REQUEST` | Invalid request format |
| 401 | `UNAUTHORIZED` | Authentication required |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 500 | `INTERNAL_ERROR` | Server error |
| 503 | `SERVICE_UNAVAILABLE` | Service temporarily unavailable |

### Example Error Response

```json
{
  "error": "Model not found: openrouter:invalid-model",
  "success": false,
  "code": "NOT_FOUND"
}
```

---

## WebSocket Events

### Connection

```javascript
const ws = new WebSocket('ws://localhost:8080/api/reasoning/ws?session_id=xxx');
```

### Event Types

#### `decompose_start`
```json
{
  "event": "decompose_start",
  "data": {
    "session_id": "uuid",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

#### `decompose_end`
```json
{
  "event": "decompose_end",
  "data": {
    "session_id": "uuid",
    "steps": [
      {
        "step_id": 1,
        "title": "Intent Analysis",
        "objective": "Analyze requirements",
        "task_type": "analyze"
      }
    ],
    "timestamp": "2024-01-01T12:00:01Z"
  }
}
```

#### `step_start`
```json
{
  "event": "step_start",
  "data": {
    "session_id": "uuid",
    "step_id": 1,
    "title": "Intent Analysis",
    "timestamp": "2024-01-01T12:00:02Z"
  }
}
```

#### `model_response`
```json
{
  "event": "model_response",
  "data": {
    "session_id": "uuid",
    "step_id": 1,
    "model_id": "openrouter:google/gemini-2.0-flash-exp:free",
    "response": "Model output here...",
    "score": 0.85,
    "timestamp": "2024-01-01T12:00:03Z"
  }
}
```

#### `beam_update`
```json
{
  "event": "beam_update",
  "data": {
    "session_id": "uuid",
    "step_id": 1,
    "paths": [
      {
        "path_id": 1,
        "score": 0.92,
        "outputs": [...]
      }
    ],
    "timestamp": "2024-01-01T12:00:04Z"
  }
}
```

#### `consensus`
```json
{
  "event": "consensus",
  "data": {
    "session_id": "uuid",
    "step_id": 1,
    "strategy": "meta_agent",
    "final_output": "Consensus output...",
    "timestamp": "2024-01-01T12:00:05Z"
  }
}
```

#### `step_end`
```json
{
  "event": "step_end",
  "data": {
    "session_id": "uuid",
    "step_id": 1,
    "final_output": "Step output...",
    "timestamp": "2024-01-01T12:00:06Z"
  }
}
```

#### `reasoning_end`
```json
{
  "event": "reasoning_end",
  "data": {
    "session_id": "uuid",
    "final_output": "Complete reasoning result...",
    "total_cost": 0.0,
    "total_time_ms": 5432,
    "timestamp": "2024-01-01T12:00:10Z"
  }
}
```

---

## Rate Limiting

Currently, rate limiting is not enforced but may be added in future versions. For production deployments, consider implementing rate limiting at the reverse proxy level.

---

## CORS

All API endpoints support CORS with the following configuration:

- **Allowed Origins**: `*` (all origins)
- **Allowed Methods**: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`
- **Allowed Headers**: `Content-Type`, `Authorization`
- **Max Age**: 3600 seconds

---

## Examples

### Complete Query Flow

```bash
# 1. Check health
curl http://localhost:8080/health

# 2. List available models
curl http://localhost:8080/api/models/free

# 3. Query with smart routing
curl -X POST http://localhost:8080/api/query/smart \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain machine learning",
    "strategy": "balanced",
    "max_tokens": 500
  }'

# 4. Start reasoning session
curl -X POST http://localhost:8080/api/reasoning/start \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Design a microservices architecture",
    "models": []
  }'

# 5. Check session status
curl http://localhost:8080/api/reasoning/status/{session_id}
```

### Authentication Flow

```bash
# 1. Sign up
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# 2. Sign in (if already registered)
curl -X POST http://localhost:8080/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# 3. Use token for authenticated requests
curl -X POST http://localhost:8080/api/query/smart \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {access_token}" \
  -d '{
    "prompt": "Private query"
  }'
```

---

For more information, see the main [README.md](README.md).
