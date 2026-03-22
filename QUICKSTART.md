# GAIOL Quick Start Guide

Get up and running with GAIOL in 5 minutes.

---

## Prerequisites

- **Go 1.21+** installed ([Download](https://golang.org/dl/))
- **Supabase project** (for auth and database) — see [docs/database-setup.md](docs/database-setup.md)
- **Terminal/Command Prompt**

---

## Step 1: Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd GAIOL

# Install dependencies
go mod download
```

---

## Step 2: Configure Environment

Create a `.env` file in the project root (copy from `.env.example`):

```env
# Required: Supabase (from Dashboard > Settings > API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key

# Required for storing provider keys: generate with: openssl rand -hex 32
GAIOL_ENCRYPTION_KEY=your-32-byte-hex-key
```

Run the database migrations (see [docs/database-setup.md](docs/database-setup.md)) so auth and key tables exist.

### Two server modes

| Mode | When | Database | `/health` | Models in registry |
|------|------|----------|-----------|-------------------|
| **Auth + Supabase** (default) | No `GAIOL_DISABLE_AUTH`; valid `SUPABASE_*` in `.env` | Yes | `auth_disabled: false`, `database.connected: true`, `database.reachable` from live PostgREST ping | Often `0` until tenant loads keys; tenant queries still work |
| **Local no-auth** | `GAIOL_DISABLE_AUTH=1` (or `GAIOL_AUTH_DISABLED` / `DISABLE_AUTH`) | Skipped | `auth_disabled: true`, `database.connected: false` | From env only: set `OPENROUTER_API_KEY` / `GEMINI_API_KEY` / Ollama so model count is non-zero |

`/api/monitoring/stats` uses the same Supabase client as the app; with the anon key, **RLS** may limit rows unless policies allow the server role to read aggregates.

---

## Step 3: Start the Server

**Option A: Using Go (Recommended)**
```bash
go run cmd/web-server/main.go
```

**Option B: Using Make**
```bash
make run
```

**Option C: Using Scripts**
- **Windows**: Double-click `start.bat` or run `.\start.bat`
- **Linux/Mac**: `./start.sh`
- **PowerShell**: `.\start.ps1`

You should see the server starting on http://localhost:8080.

---

## Step 4: Use the app (GAIOL key flow)

1. **Sign up** — Open http://localhost:8080/signup and create an account.
2. **Add provider keys** — Go to Dashboard > Models. Add at least one provider key (OpenRouter, Google, or HuggingFace). Keys are stored encrypted; the app never uses provider keys from the server environment.
3. **Create a GAIOL key** — Go to Dashboard > API keys. Click "Create key", copy the key once (it is not shown again).
4. **Call the inference API** — Use your GAIOL key with `POST /v1/chat`:

```bash
curl -X POST http://localhost:8080/v1/chat \
  -H "Authorization: Bearer YOUR_GAIOL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello, say hi in one sentence."}'
```

See [API.md](API.md) for the full Unified Inference (POST /v1/chat) reference and rate limits (60 req/min per key).

**Note:** Provider keys in `.env` (OPENROUTER_API_KEY, etc.) are for CLI/benchmark only; the app server does not use them for tenant requests.

---

## Step 5: Open the Web Interface

Open your browser and navigate to:

```
http://localhost:8080
```

You should see the GAIOL chat interface!

---

## Step 6: Test It Out

### Try a Simple Query

1. Type in the chat: "Explain quantum computing in simple terms"
2. Click "Send" or press Enter
3. Watch the reasoning engine work its magic!

### Browse Models

1. Click "Models" in the sidebar
2. Browse available models
3. Filter by provider, cost, or tags
4. Click a model to query it directly

### Try Voice Input

1. Click the microphone icon in the chat input
2. Speak your query
3. It will be transcribed automatically

### Upload a File

1. Click the attach icon
2. Select a text file (.txt, .md, .json, .csv)
3. The file content will be added to your prompt

---

## Next Steps

### Enable Authentication (Optional)

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Add to `.env`:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   ```
3. Run migrations (see [docs/database-setup.md](docs/database-setup.md))
4. Restart the server

### Configure Reasoning Engine

Edit `internal/reasoning/engine.go` to customize:
- Beam search width
- Consensus strategy
- Auto-selected models

### Explore the API

```bash
# Health check
curl http://localhost:8080/health

# List models
curl http://localhost:8080/api/models

# Query with smart routing
curl -X POST http://localhost:8080/api/query/smart \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, world!"}'
```

---

## Troubleshooting

### Server Won't Start

**Error: "OPENROUTER_API_KEY is required"**
- Make sure `.env` file exists in project root
- Check that `OPENROUTER_API_KEY` is set correctly
- Restart the server

**Error: "Port already in use"**
- Change port in `.env`: `PORT=8081`
- Or kill the process using port 8080

### Models Not Loading

- Check your OpenRouter API key is valid
- Verify internet connection
- Check OpenRouter service status

### Database Connection Issues

- Authentication is optional - system works without database
- If you want auth, verify Supabase credentials
- Check network connectivity to Supabase

---

## Common Commands

```bash
# Run server
go run cmd/web-server/main.go

# Build binary
go build -o gaiol ./cmd/web-server

# Run tests
go test ./...

# Check health
curl http://localhost:8080/health

# List models
curl http://localhost:8080/api/models/free
```

---

## What's Next?

- **Read the [README.md](README.md)** for comprehensive documentation
- **Check [API.md](API.md)** for API reference
- **See [ARCHITECTURE.md](ARCHITECTURE.md)** for system design
- **Review [FEATURES_IMPLEMENTED.md](FEATURES_IMPLEMENTED.md)** for feature list

---

## Getting Help

- **Documentation**: Check the `.md` files in the repository
- **Issues**: Open an issue on GitHub
- **Questions**: Review existing documentation

---

**Happy querying! 🚀**
