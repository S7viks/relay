# GAIOL - Go AI Orchestration Layer

GAIOL is a comprehensive AI service orchestration platform built in Go, designed to provide unified access to various AI models and services through a standardized UAIP (Universal AI Protocol) interface.

## Project Structure

```
gaiol/
├── cmd/                   # Main applications
│   ├── uaip-service/      # Unified AI Platform service (standalone)
│   ├── web-server/        # Web server with REST API and UI
│   ├── test-openrouter/   # OpenRouter adapter test
│   ├── test-gemini/       # Gemini adapter test
│   ├── test-huggingface/  # HuggingFace adapter test
│   ├── test-multi-model/  # Multi-model comparison test
│   ├── test-multi-adapter/# Multi-adapter test
│   ├── test-router/       # Router functionality test
│   ├── test-registry/     # Registry functionality test
│   └── debug-openrouter/  # OpenRouter debugging tool
├── internal/              # Private application code
│   ├── uaip/             # UAIP protocol definitions
│   │   ├── message.go    # Request/Response structures
│   │   └── constants.go  # Protocol constants
│   └── models/           # Model interfaces and implementations
│       ├── interface.go  # ModelAdapter interface
│       ├── registry.go   # Model registry
│       ├── router.go     # Intelligent routing
│       └── adapters/     # AI model adapters
│           ├── openrouter.go    # OpenRouter adapter
│           ├── gemini.go        # Google Gemini adapter
│           ├── huggingface.go   # HuggingFace adapter
│           └── response_cleaner.go # Response cleaning utilities
└── web/                  # Web frontend
    └── index.html        # Single-page web UI for model comparison
```

## Getting Started

### Prerequisites

- Go 1.21 or later
- API keys for at least one provider:
  - `OPENROUTER_API_KEY` (required for most models)
  - `GEMINI_API_KEY` (optional, for Google Gemini)
  - `HUGGINGFACE_API_KEY` (optional, for HuggingFace models)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd GAIOL
```

2. Install dependencies:
```bash
go mod download
```

3. Set up environment variables:
```bash
export OPENROUTER_API_KEY="your-key-here"
export GEMINI_API_KEY="your-key-here"  # Optional
export HUGGINGFACE_API_KEY="your-key-here"  # Optional
```

### Running the Web Server

Start the web server with UI:
```bash
go run cmd/web-server/main.go
```

Then open http://localhost:8080 in your browser.

### Running Tests

Test individual adapters:
```bash
go run cmd/test-openrouter/main.go
go run cmd/test-gemini/main.go
go run cmd/test-huggingface/main.go
```

Test the router:
```bash
go run cmd/test-router/main.go
```

Test the registry:
```bash
go run cmd/test-registry/main.go
```

### API Endpoints

- `POST /api/query` - Multi-model comparison (legacy)
- `POST /api/query/smart` - Smart routing (recommended)
- `POST /api/query/model` - Query specific model by ID
- `GET /api/models` - List all models
- `GET /api/models/free` - List free models
- `GET /api/models/:provider` - List models by provider
- `GET /health` - Health check

## Development

- Use `make build` to build all services
- Use `make test` to run tests (if tests exist)
- Use `make lint` to run linters (requires golangci-lint)

## License

MIT License
