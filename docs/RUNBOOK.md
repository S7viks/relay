# GAIOL Runbook / Operations Guide

Operations procedures for deploying and running the GAIOL web server.

---

## Deployment

### Build (binary)

```bash
go build -o gaiol-web ./cmd/web-server/
```

### Run (binary)

```bash
./gaiol-web
# or
go run cmd/web-server/main.go
```

Optional: set `PORT` (default 8080). The server listens on all interfaces.

### Build and run (Docker)

From the repo root:

```bash
docker build -t gaiol .
docker run --env-file .env -p 8080:8080 gaiol
```

Or pass env vars explicitly:

```bash
docker run -e NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  -e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key \
  -e GAIOL_ENCRYPTION_KEY=your-32-byte-hex \
  -p 8080:8080 gaiol
```

The image includes the `web/` static files and runs as non-root. No `.env` file is baked into the image; set env at runtime.

### Environment variables (required)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` or `SUPABASE_ANON_KEY` | Supabase anon key |
| `GAIOL_ENCRYPTION_KEY` | 32-byte hex key for encrypting provider keys (generate with `openssl rand -hex 32`) |

### Environment variables (optional)

| Variable | Description |
|----------|-------------|
| `PORT` | Listen port (default 8080). |
| `ALLOWED_ORIGINS` | Comma-separated list of CORS origins (e.g. `https://app.example.com,https://www.example.com`). If unset, `*` is used (allow all). Set in production to restrict browser access. |
| `LOG_LEVEL` | `debug`, `info`, `warn`, or `error` (default `info`). At `info`, only 4xx/5xx requests are logged (except health); at `debug`, every request is logged. |

See `.env.example` for a full template. Provider API keys (OpenRouter, etc.) are **not** set in the app environment; tenants add them in the dashboard.

---

## Database migrations

Migrations are run manually in the Supabase SQL Editor (Dashboard > SQL Editor).

1. Run in order: `001_initial_schema.sql`, then `007_api_keys_multitenant.sql`, then `008_audit_usage_prefs.sql` (if present).
2. If you hit connection timeouts, run the schema in chunks as described in [database-setup.md](database-setup.md): use the files under `migrations/chunks/` and then the numbered migrations in `migrations/`.

After adding new migrations, run them in the same way (copy/paste and Run in SQL Editor).

---

## Revoking a GAIOL API key

1. **From the dashboard:** User signs in, goes to Dashboard > API keys, and clicks "Revoke" on the key.
2. **From the database:** If the user lost access, an admin can revoke via Supabase:
   - Table: `gaiol_api_keys`
   - Delete the row for the key (or set `expires_at` to a past time if you add expiry checks). The key is identified by `key_hash` (SHA-256 of the raw key); you will not have the raw key, so identify by `tenant_id` and `name` or `id` if the user can tell you which key).

Keys cannot be "unrevoked"; the user must create a new key.

---

## Disabling a tenant (effective)

There is no dedicated "disable tenant" flag. To effectively stop a tenant from using the API:

1. **Revoke all GAIOL keys** for that tenant (Dashboard > API keys, or delete from `gaiol_api_keys` in SQL by `tenant_id`).
2. Optionally remove or disable their **provider keys** (Dashboard > Models, or delete from `provider_api_keys` by `tenant_id`) so they cannot add new inference keys.

Sign-in and dashboard access still work until auth is changed; revoking keys stops programmatic API use.

---

## Health and readiness

- **GET /health** — Returns JSON with `status: "healthy"`, `database.connected`, `models` count, `version`, `time`. Use for load balancer health checks.
- **GET /api/models** — Public model list; can be used to confirm the server is up (no auth).

---

## Logs

The server logs to stdout/stderr. Capture this stream in your deployment (e.g. Docker logs, systemd journal, or a log aggregator).

**Request log lines** (when `LOG_LEVEL=debug`, or for 4xx/5xx at `info`):

- `request method=GET path=/health status=200 duration_ms=0 size=...` — One line per request; parseable for aggregators.

**Other lines:**

- `v1/chat tenant_id=... latency_ms=... success=true|false` — Per-request inference log.
- `Failed to log usage to api_queries` — Non-fatal; usage logging failed.
- Auth and startup errors are also written to the same stream.

Set `LOG_LEVEL=debug` for full request logging; use `info` (default) in production to reduce noise.

---

## Backups

- **Database:** Use Supabase’s built-in backups and point-in-time recovery (Dashboard > Database > Backups).
- **Application:** No persistent local state; redeploy from repo and set env vars.

---

## Security checklist

- Keep `GAIOL_ENCRYPTION_KEY` secret and rotate if compromised (existing encrypted provider keys would need re-entry by tenants).
- Use HTTPS in production; the app does not enforce TLS.
- Set `ALLOWED_ORIGINS` in production to your frontend origin(s); otherwise CORS allows any origin (`*`).
- Supabase anon key is safe for client-side use; for server-only admin operations use a service role key only in a secure backend (not in the open-source app by default).
