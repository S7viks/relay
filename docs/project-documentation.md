# GAIOL Project Documentation

**Complete Directory Structure and File Reference Guide**

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Directory Structure](#directory-structure)
3. [Root Directory Files](#root-directory-files)
4. [Backend Components](#backend-components)
5. [Frontend Components](#frontend-components)
6. [Database Migrations](#database-migrations)
6. [Configuration Files](#configuration-files)
7. [Scripts and Utilities](#scripts-and-utilities)
8. [Documentation Files](#documentation-files)

---

## Project Overview

**GAIOL (Go AI Orchestration Layer)** is a comprehensive AI service orchestration platform that provides unified access to multiple AI models through intelligent routing and advanced reasoning capabilities.

### Key Technologies
- **Backend**: Go 1.21+
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth (JWT-based)
- **Protocol**: UAIP (Universal AI Protocol)

### Architecture Pattern
- **Monolithic Application** with modular internal structure
- **RESTful API** for HTTP requests
- **WebSocket** for real-time reasoning updates
- **Multi-tenant** architecture with row-level security

---

## Directory Structure

```
GAIOL/
├── cmd/                          # Application entry points
│   └── web-server/              # Main web server application
│       └── main.go              # Server entry point
├── internal/                     # Private application code
│   ├── auth/                    # Authentication system
│   ├── database/                # Database client and utilities
│   ├── models/                  # Model registry and routing
│   │   └── adapters/            # Provider-specific adapters
│   ├── monitoring/              # Metrics and monitoring
│   ├── reasoning/               # Reasoning engine
│   └── uaip/                    # UAIP protocol definitions
├── web/                         # Frontend static files
│   ├── css/                     # Stylesheets
│   ├── js/                      # JavaScript modules
│   └── *.html                   # HTML pages
├── migrations/                  # Database migration scripts
├── *.md                         # Documentation files
├── *.ps1                        # PowerShell scripts
├── *.bat                        # Windows batch scripts
├── *.sh                         # Shell scripts
├── go.mod                       # Go module definition
├── go.sum                       # Go dependency checksums
├── Makefile                     # Build automation
└── docker-compose.dev.yml       # Docker Compose configuration
```

---

## Root Directory Files

### Configuration Files

#### `go.mod`
- **Purpose**: Go module definition file
- **Description**: Defines the module name (`gaiol`) and Go version (1.21.1)
- **Dependencies**: 
  - `github.com/golang-jwt/jwt/v5` - JWT token handling
  - `github.com/google/uuid` - UUID generation
  - `github.com/gorilla/websocket` - WebSocket support
  - `github.com/joho/godotenv` - Environment variable loading
  - `github.com/supabase-community/supabase-go` - Supabase client

#### `go.sum`
- **Purpose**: Dependency checksums
- **Description**: Contains cryptographic checksums for all module dependencies to ensure reproducible builds

#### `Makefile`
- **Purpose**: Build automation and development tasks
- **Key Commands**:
  - `make build` - Build binaries for Unix and Windows
  - `make test` - Run all tests
  - `make lint` - Run linter
  - `make run` - Build and run the application
  - `make clean` - Remove build artifacts
  - `make coverage` - Generate test coverage report
- **Description**: Provides convenient commands for common development tasks

#### `docker-compose.dev.yml`
- **Purpose**: Docker Compose configuration for development
- **Description**: Defines services and configuration for running GAIOL in Docker containers during development

---

## Backend Components

### `cmd/web-server/`

#### `main.go`
- **Purpose**: Main entry point for the web server
- **Key Responsibilities**:
  1. **Initialization**:
     - Loads environment variables from `.env` file
     - Initializes model adapters (OpenRouter, HuggingFace, Ollama)
     - Creates model registry with all available models
     - Initializes database client (optional)
     - Sets up authentication API
     - Creates model router with performance tracker
     - Initializes reasoning engine
     - Sets up metrics service
  
  2. **Route Registration**:
     - Root route (`/`) - Serves static files
     - Health check (`/health`) - System status endpoint
     - Model routes (`/api/models/*`) - Model discovery endpoints
     - Authentication routes (`/api/auth/*`) - User authentication
     - Query routes (`/api/query/*`) - AI query endpoints
     - Reasoning routes (`/api/reasoning/*`) - Reasoning engine endpoints
     - Monitoring routes (`/api/monitoring/*`) - System metrics
  
  3. **Server Configuration**:
     - Configurable port (default: 8080)
     - Graceful shutdown handling
     - CORS middleware for cross-origin requests
     - Optional authentication middleware
  
  4. **Handler Functions**:
     - `handleHealth` - Returns system health status
     - `handleListModels` - Lists all available models
     - `handleListFreeModels` - Lists free models only
     - `handleModelsByProvider` - Lists models by provider
     - `handleQuery` - Multi-model comparison query
     - `handleQuerySmart` - Smart routing query (uses reasoning engine)
     - `handleQueryModel` - Query specific model by ID
     - `handleSignUp`, `handleSignIn`, `handleSignOut` - Authentication handlers
     - `handleGetSession`, `handleRefreshToken`, `handleGetUser` - Session management
     - `handleReasoningStart`, `handleReasoningStatus`, `handleReasoningWebSocket` - Reasoning handlers

---

### `internal/auth/`

#### `api.go`
- **Purpose**: Authentication API implementation
- **Description**: Provides high-level authentication functions:
  - `SignUp` - User registration
  - `SignIn` - User login
  - `SignOut` - User logout
  - `RefreshToken` - Token refresh
  - `GetUser` - Get user information
  - `ValidateToken` - JWT token validation

#### `supabase.go`
- **Purpose**: Supabase authentication client wrapper
- **Description**: 
  - Wraps Supabase Go client for authentication operations
  - Handles JWT token validation
  - Manages user sessions
  - Extracts user context from tokens

---

### `internal/database/`

#### `supabase.go`
- **Purpose**: Supabase database client initialization
- **Description**: 
  - Creates and manages Supabase client connection
  - Handles connection errors gracefully
  - Provides singleton access to database client

#### `tenant.go`
- **Purpose**: Multi-tenant context management
- **Description**:
  - Extracts tenant ID from user context
  - Provides tenant isolation helpers
  - **Note**: Currently returns default tenant context (TODO: Implement actual database query)

#### `vector.go`
- **Purpose**: Vector database operations for RAG
- **Description**:
  - Implements vector store interface for Supabase
  - Handles embedding storage and retrieval
  - Used by RAG (Retrieval-Augmented Generation) system

#### `README.md`
- **Purpose**: Database setup and usage documentation
- **Description**: Instructions for configuring and using the database layer

---

### `internal/models/`

#### `registry.go`
- **Purpose**: Centralized model catalog
- **Key Features**:
  - Registers all available AI models from multiple providers
  - Stores model metadata (cost, capabilities, quality scores)
  - Provides model lookup and filtering functions
  - Thread-safe operations with mutex locks
- **Key Functions**:
  - `NewRegistry` - Creates registry with adapters
  - `GetModel` - Retrieves model by ID
  - `ListModels` - Lists all models
  - `FindFreeModels` - Filters free models
  - `FindModelsByProvider` - Filters by provider
  - `Count` - Returns total model count

#### `router.go`
- **Purpose**: Intelligent model selection
- **Routing Strategies**:
  - `free_only` - Only free models
  - `lowest_cost` - Minimize cost per token
  - `highest_quality` - Maximize quality score
  - `balanced` - Balance cost, quality, and speed (default)
- **Key Functions**:
  - `SelectModels` - Selects models based on strategy
  - `Route` - Routes query to appropriate models
  - Uses performance tracker for historical data

#### `interface.go`
- **Purpose**: Model adapter interface definitions
- **Description**: Defines `ModelAdapter` interface that all providers must implement:
  - `Name()` - Adapter name
  - `Provider()` - Provider identifier
  - `SupportedTasks()` - List of supported task types
  - `RequiresAuth()` - Whether API key is required
  - `GetCapabilities()` - Model capabilities
  - `GetCost()` - Cost information
  - `HealthCheck()` - Health check
  - `GenerateText()` - Main text generation method

#### `performance_tracker.go`
- **Purpose**: Performance metrics tracking
- **Description**:
  - Tracks query performance (latency, cost, success rate)
  - Maintains cache of model performance data
  - Used by router for intelligent model selection
  - Stores data in database for analytics

#### `embeddings.go`
- **Purpose**: Embedding generation interface
- **Description**: Defines `EmbeddingProvider` interface for models that support embeddings (used by RAG)

---

### `internal/models/adapters/`

#### `openrouter.go`
- **Purpose**: OpenRouter API adapter
- **Description**:
  - Implements `ModelAdapter` interface for OpenRouter
  - Supports 100+ models through OpenRouter's unified API
  - Handles API authentication and rate limiting
  - Converts UAIP requests to OpenRouter format
  - Converts OpenRouter responses to UAIP format
  - Implements `EmbeddingProvider` for embedding models

#### `gemini.go`
- **Purpose**: Google Gemini API adapter
- **Description**:
  - Direct integration with Google Gemini API
  - Supports multimodal capabilities
  - Handles API authentication
  - Converts between UAIP and Gemini formats

#### `huggingface.go`
- **Purpose**: HuggingFace Inference API adapter
- **Description**:
  - Integrates with HuggingFace Inference API
  - Supports open-source models
  - Handles API authentication
  - Converts between UAIP and HuggingFace formats

#### `ollama.go`
- **Purpose**: Ollama local model adapter
- **Description**:
  - Connects to local Ollama instance (default: localhost:11434)
  - Supports local model execution
  - Used as fallback when external APIs are unavailable
  - No authentication required

#### `response_cleaner.go`
- **Purpose**: Response cleaning utilities
- **Description**: 
  - Cleans and normalizes responses from different providers
  - Removes provider-specific formatting
  - Ensures consistent output format

---

### `internal/reasoning/`

#### `engine.go`
- **Purpose**: Main reasoning engine coordinator
- **Key Components**:
  - `MemoryManager` - Session and path management
  - `Decomposer` - Breaks queries into steps
  - `Orchestrator` - Runs models in parallel
  - `Scorer` - Evaluates outputs
  - `Composer` - Assembles final output
  - `ConsensusAgent` - Optional consensus synthesis
  - `Cache` - Response caching
- **Key Functions**:
  - `InitSession` - Creates new reasoning session
  - `RunSession` - Executes reasoning with beam search
  - `emitEvent` - Sends events for real-time updates

#### `decomposer.go`
- **Purpose**: Query decomposition
- **Description**:
  - Analyzes complex queries
  - Breaks them into logical steps
  - Determines task type for each step
  - Creates step objectives

#### `orchestrator.go`
- **Purpose**: Parallel model execution
- **Description**:
  - Runs multiple models concurrently for each step
  - Manages model selection
  - Handles RAG integration (optional)
  - Collects outputs from all models

#### `scorer.go`
- **Purpose**: Output scoring and evaluation
- **Description**:
  - Scores model outputs based on quality metrics
  - Uses performance tracker for historical data
  - Calculates cumulative path scores
  - Determines best outputs

#### `selector.go`
- **Purpose**: Path selection (beam search)
- **Description**:
  - Implements beam search algorithm
  - Maintains top N paths (beam width)
  - Prunes low-scoring paths
  - Selects best path at the end

#### `consensus.go`
- **Purpose**: Consensus mechanisms
- **Description**:
  - Implements multiple consensus strategies:
    - `majority` - Simple vote counting
    - `weighted` - Votes weighted by scores
    - `meta_agent` - LLM synthesizes best answer (default)
  - Synthesizes final output from multiple model responses

#### `memory.go`
- **Purpose**: Session and path memory management
- **Description**:
  - Manages reasoning sessions
  - Tracks reasoning paths
  - Stores step outputs
  - Provides session retrieval

#### `composer.go`
- **Purpose**: Final output assembly
- **Description**:
  - Combines outputs from selected path
  - Formats multi-step reasoning results
  - Creates coherent final response

#### `handlers.go`
- **Purpose**: HTTP and WebSocket handlers
- **Description**:
  - `HandleStartReasoning` - Starts reasoning session
  - `HandleGetStatus` - Gets session status
  - `HandleWebSocket` - WebSocket for real-time updates
  - `HandleGetStats` - Returns reasoning statistics

#### `events.go`
- **Purpose**: Event type definitions
- **Description**: Defines all event types for real-time reasoning updates:
  - `EventTypeDecomposeStart` - Decomposition started
  - `EventTypeStepStart` - Step execution started
  - `EventTypeModelResponse` - Model response received
  - `EventTypeBeamUpdate` - Beam search update
  - `EventTypeConsensus` - Consensus applied
  - `EventTypeStepEnd` - Step completed
  - `EventTypeReasoningEnd` - Reasoning completed

#### `types.go`
- **Purpose**: Data structure definitions
- **Description**: Defines all types used by reasoning engine:
  - `ReasoningSession` - Session state
  - `ReasoningStep` - Step information
  - `ModelOutput` - Model response
  - `ReasoningPath` - Beam search path
  - `EventCallback` - Event handler function type

#### `prompts.go`
- **Purpose**: System prompts for reasoning
- **Description**:
  - Contains prompts for decomposition
  - Provides scoring prompts
  - Includes consensus synthesis prompts
  - Manages prompt templates

#### `query.go`
- **Purpose**: Query wrapper utilities
- **Description**: Helper functions for query processing

#### `rag.go`
- **Purpose**: RAG (Retrieval-Augmented Generation) integration
- **Description**:
  - Retrieves relevant context from vector database
  - Enhances prompts with retrieved information
  - Optional feature for context-aware responses

#### `cache.go`
- **Purpose**: Response caching
- **Description**:
  - Caches model responses to reduce API calls
  - Configurable TTL (default: 1 hour)
  - Improves performance and reduces costs

#### `testing.go`
- **Purpose**: Testing utilities
- **Description**: Helper functions for testing reasoning engine

#### `engine_test.go`
- **Purpose**: Reasoning engine tests
- **Description**: Unit tests for engine functionality

#### `orchestrator_test.go`
- **Purpose**: Orchestrator tests
- **Description**: Unit tests for orchestrator functionality

#### `test_output*.txt`
- **Purpose**: Test output files
- **Description**: Sample outputs from testing (UTF-8 and regular versions)

---

### `internal/uaip/`

#### `message.go`
- **Purpose**: UAIP protocol message definitions
- **Description**: Defines request and response structures:
  - `UAIPRequest` - Standardized request format
  - `UAIPResponse` - Standardized response format
  - `UAIPHeader` - Protocol header
  - `Payload` - Request payload
  - `Result` - Response result
  - `Metadata` - Response metadata

#### `constants.go`
- **Purpose**: UAIP protocol constants
- **Description**: Defines protocol version and constants

#### `rag.go`
- **Purpose**: RAG-specific UAIP extensions
- **Description**: Extends UAIP protocol for RAG operations

---

### `internal/monitoring/`

#### `metrics.go`
- **Purpose**: Metrics collection service
- **Description**:
  - Tracks system metrics (requests, latency, errors)
  - Provides metrics endpoint
  - Used for monitoring and observability

---

## Frontend Components

### `web/` Directory

#### HTML Pages

##### `index.html`
- **Purpose**: Main chat interface
- **Features**:
  - Welcome section with action cards
  - Chat message display area
  - Input field with voice and file attachment buttons
  - Model selector dropdown
  - Settings access
  - Responsive design
- **JavaScript Modules Used**:
  - `main.js` - Main application logic
  - `api.js` - API communication
  - `state.js` - State management
  - `ui.js` - UI utilities
  - `features.js` - Voice, file, search features
  - `navigation.js` - Page navigation
  - `layout.js` - Layout management

##### `reasoning.html`
- **Purpose**: Reasoning engine visualization page
- **Features**:
  - Real-time reasoning step visualization
  - Beam search path display
  - Model output comparison
  - Consensus visualization
  - WebSocket connection for live updates
- **JavaScript Modules Used**:
  - `reasoning-engine.js` - Reasoning API client
  - `reasoning-component.js` - UI component
  - `reasoning-viz.js` - Visualization logic

##### `history.html`
- **Purpose**: Query history page
- **Features**:
  - Lists previous queries
  - Filter and search functionality
  - Replay queries
  - Export history
- **JavaScript Modules Used**:
  - `history.js` - History management

##### `settings.html`
- **Purpose**: User settings page
- **Features**:
  - Default strategy selection
  - Token limits configuration
  - Temperature settings
  - Model preferences
  - Save functionality
- **JavaScript Modules Used**:
  - `navigation.js` - Settings save handler

##### `profile.html`
- **Purpose**: User profile page
- **Features**:
  - User information display
  - Account management
  - Usage statistics
- **JavaScript Modules Used**:
  - `auth.js` - Authentication utilities

##### `login.html`
- **Purpose**: User login page
- **Features**:
  - Email/password login form
  - Terminal-style command prompt UI (`auth-terminal`)
  - Password recovery ("Forgot password?") → `/api/auth/recover` → `/reset-password`
  - Sign up link
  - Error handling
- **JavaScript Modules Used**:
  - `auth.js` - Authentication logic

##### `signup.html`
- **Purpose**: User registration page
- **Features**:
  - Registration form
  - Terminal-style command prompt UI (`auth-terminal`)
  - Email validation
  - Password requirements
  - Login link
- **JavaScript Modules Used**:
  - `auth.js` - Registration logic

##### `reset-password.html`
- **Purpose**: Password recovery completion page
- **Features**:
  - Set new password from Supabase recovery link (`#access_token=...`)
  - Terminal-style command prompt UI (`auth-terminal`)
  - Calls `POST /api/auth/update-password`

---

### `web/css/` Directory

#### `styles.css`
- **Purpose**: Main stylesheet
- **Description**:
  - Global styles and CSS variables
  - Component styles (buttons, cards, inputs)
  - Layout styles (grid, flexbox)
  - Responsive design (mobile, tablet, desktop)
  - Dark/light theme support
  - Animation and transitions

#### `reasoning.css`
- **Purpose**: Reasoning visualization styles
- **Description**:
  - Styles for reasoning step visualization
  - Beam search path display styles
  - Model output comparison styles
  - Animation for real-time updates

---

### `web/js/` Directory

#### `main.js`
- **Purpose**: Main application entry point
- **Description**:
  - Initializes application on page load
  - Sets up event listeners
  - Coordinates between modules
  - Handles page-specific initialization

#### `api.js`
- **Purpose**: API communication layer
- **Key Functions**:
  - `querySmart` - Smart routing query
  - `queryModel` - Query specific model
  - `listModels` - Get available models
  - `getHealth` - Health check
  - Handles HTTP errors and retries
  - Manages authentication headers

#### `state.js`
- **Purpose**: Application state management
- **Description**:
  - Manages global application state
  - User session state
  - Query history state
  - Settings state
  - Provides state update functions

#### `auth.js`
- **Purpose**: Authentication utilities
- **Key Functions**:
  - `signIn` - User login
  - `signUp` - User registration
  - `signOut` - User logout
  - `getSession` - Get current session
  - `refreshToken` - Refresh access token
  - Token storage and management

#### `navigation.js`
- **Purpose**: Page navigation and routing
- **Description**:
  - Handles page transitions
  - Manages navigation state
  - Implements settings save functionality
  - Updates URL hash for navigation

#### `ui.js`
- **Purpose**: UI utility functions
- **Description**:
  - DOM manipulation helpers
  - Message rendering
  - Loading indicators
  - Error display
  - Toast notifications

#### `features.js`
- **Purpose**: Feature implementations
- **Key Features**:
  - Voice input (Web Speech API)
  - File attachment handling
  - Global search (⌘K / Ctrl+K)
  - Prompt library (UI exists, backend pending)
  - Keyboard shortcuts

#### `reasoning-engine.js`
- **Purpose**: Reasoning API client
- **Description**:
  - Connects to reasoning WebSocket
  - Sends reasoning start requests
  - Handles reasoning events
  - Manages reasoning session state

#### `reasoning-component.js`
- **Purpose**: Reasoning UI component
- **Description**:
  - Renders reasoning visualization
  - Updates UI based on events
  - Displays steps, paths, and outputs
  - Handles user interactions

#### `reasoning-viz.js`
- **Purpose**: Reasoning visualization logic
- **Description**:
  - Creates visual representation of reasoning paths
  - Renders beam search tree
  - Displays model outputs
  - Animates updates

#### `history.js`
- **Purpose**: Query history management
- **Description**:
  - Loads query history from API
  - Filters and searches history
  - Replays queries
  - Exports history data

#### `models.js`
- **Purpose**: Model browser functionality
- **Description**:
  - Displays available models
  - Filters models by provider, cost, etc.
  - Shows model details
  - Handles model selection

#### `model-selector-dropdown.js`
- **Purpose**: Model selector dropdown component
- **Description**:
  - Renders model selection dropdown
  - Handles model selection
  - Filters and searches models
  - Updates UI based on selection

#### `sidebar-features.js`
- **Purpose**: Sidebar feature implementations
- **Description**:
  - Manages sidebar state
  - Handles sidebar interactions
  - Implements sidebar features

#### `layout.js`
- **Purpose**: Layout management
- **Description**:
  - Manages page layout
  - Handles responsive layout changes
  - Manages sidebar visibility
  - Coordinates layout components

#### `design-enhancements.js`
- **Purpose**: Design enhancement utilities
- **Description**:
  - UI polish and enhancements
  - Animation helpers
  - Visual effects
  - Design system utilities

#### `utils.js`
- **Purpose**: General utility functions
- **Description**:
  - Common helper functions
  - String manipulation
  - Date formatting
  - Data transformation
  - Validation utilities

---

### `web/favicon.ico`
- **Purpose**: Website favicon
- **Description**: Icon displayed in browser tabs

---

## Database Migrations

### `migrations/` Directory

#### `001_initial_schema.sql`
- **Purpose**: Initial database schema
- **Tables Created**:
  - `organizations` - Multi-tenant organizations
  - `user_profiles` - User profile extensions
  - `api_queries` - Query history and analytics
- **Features**:
  - UUID extension enabled
  - Indexes for performance
  - Foreign key constraints
  - Timestamps

#### `002_reasoning_tables.sql`
- **Purpose**: Reasoning engine tables
- **Tables Created**:
  - `reasoning_sessions` - Reasoning session records
  - `reasoning_steps` - Individual step records
  - `reasoning_paths` - Beam search path tracking
- **Features**:
  - Links sessions to steps
  - Tracks path selection
  - Stores outputs and scores

#### `002_rag_init.sql`
- **Purpose**: RAG (Retrieval-Augmented Generation) setup
- **Tables Created**:
  - Vector store tables for embeddings
  - Document storage tables
- **Features**:
  - Vector similarity search
  - Document indexing
  - Embedding storage

#### `003_performance_init.sql`
- **Purpose**: Performance tracking tables
- **Tables Created**:
  - `model_performance` - Model performance metrics
  - `query_analytics` - Query analytics
- **Features**:
  - Latency tracking
  - Cost tracking
  - Success rate tracking
  - Performance caching

#### `004_session_cost.sql`
- **Purpose**: Session cost tracking
- **Description**:
  - Adds cost columns to sessions
  - Tracks total cost per session
  - Aggregates costs for analytics

---

## Scripts and Utilities

### PowerShell Scripts (`*.ps1`)

#### `start.ps1`
- **Purpose**: Start the server (PowerShell)
- **Description**: Runs the Go web server with proper environment setup

#### `stop.ps1`
- **Purpose**: Stop the server (PowerShell)
- **Description**: Stops running server instances

Scripts have been moved under `scripts/`. See [scripts/README.md](../scripts/README.md) for the full list.

- **Start/stop** (repo root): `start.ps1`, `stop.ps1`, `start.bat`, `stop.bat`
- **Dev:** `scripts/dev/clean-start.ps1` — clean build and start
- **Test:** `scripts/test/integration.ps1`, `scripts/test/quick.ps1`, `scripts/test/final.ps1`, `scripts/test/ollama.ps1`, `scripts/test/raw.ps1`, `scripts/test/pipeline.ps1`

---

### Batch Scripts (`*.bat`)

#### `start.bat`
- **Purpose**: Start the server (Windows)
- **Description**: Windows batch script to start the server

#### `stop.bat`
- **Purpose**: Stop the server (Windows)
- **Description**: Windows batch script to stop the server

#### `test-start.bat`
- **Purpose**: Test server start
- **Description**: Starts server in test mode

---

### Shell Scripts (`*.sh`)

#### `start.sh`
- **Purpose**: Start the server (Linux/Mac)
- **Description**: Shell script to start the server on Unix-like systems

---

## Documentation Files

### `README.md`
- **Purpose**: Main project documentation
- **Contents**: 
  - Project overview
  - Quick start guide
  - Installation instructions
  - API documentation
  - Feature list
  - Architecture overview

### `ARCHITECTURE.md`
- **Purpose**: Detailed architecture documentation
- **Contents**:
  - System architecture
  - Component descriptions
  - Data flow diagrams
  - Security architecture
  - Deployment architecture

### `API.md`
- **Purpose**: API reference documentation
- **Contents**:
  - Endpoint descriptions
  - Request/response formats
  - Authentication details
  - Example requests

### `AUTHENTICATION.md`
- **Purpose**: Authentication system documentation
- **Contents**:
  - Authentication flow
  - JWT token handling
  - Supabase setup
  - Multi-tenant isolation

### `DATABASE_SETUP.md`
- **Purpose**: Database setup guide
- **Contents**:
  - Supabase configuration
  - Migration instructions
  - Schema documentation
  - RLS policies

### `FEATURES_IMPLEMENTED.md`
- **Purpose**: Feature implementation status
- **Contents**: List of implemented features

### `IMPLEMENTATION_STATUS.md`
- **Purpose**: Implementation status tracking
- **Contents**: Status of various features and components

### `QUICKSTART.md`
- **Purpose**: Quick start guide
- **Contents**: Fast setup instructions

### `ROUTING.md`
- **Purpose**: Model routing documentation
- **Contents**: Routing strategies and algorithms

### `SIMPLIFIED_ARCHITECTURE.md`
- **Purpose**: Simplified architecture overview
- **Contents**: High-level architecture explanation

### `OLLAMA_SETUP.md`
- **Purpose**: Ollama setup guide
- **Contents**: Instructions for setting up local Ollama

### `DESIGN_ACTION_PLAN.md`
- **Purpose**: Design improvement plan
- **Contents**: Planned design enhancements

### `DESIGN_ENHANCEMENT_GUIDE.md`
- **Purpose**: Design enhancement guide
- **Contents**: Guidelines for design improvements

### `QUICK_DESIGN_WINS.md`
- **Purpose**: Quick design improvements
- **Contents**: List of quick design wins

### `COMPARISON.md`
- **Purpose**: Model comparison documentation
- **Contents**: Model comparison features

### `FAVICON_NOTE.md`
- **Purpose**: Favicon implementation notes
- **Contents**: Notes about favicon setup

### `DOCUMENTATION.md`
- **Purpose**: General documentation guide
- **Contents**: Documentation standards and guidelines

### `CODEBASE_REVIEW_SUMMARY.md`
- **Purpose**: Codebase review summary
- **Contents**: Review findings and recommendations

### `CLEANUP_SUMMARY.md`
- **Purpose**: Cleanup summary
- **Contents**: Files removed and code cleaned up

---

## Build Artifacts

### `reasoning.a`
- **Purpose**: Compiled Go archive
- **Description**: Compiled reasoning package (build artifact)

### `reasoning.test.exe`
- **Purpose**: Test executable
- **Description**: Compiled test binary (build artifact)

### `build_error.txt`
- **Purpose**: Build error log
- **Description**: Contains build error messages

### `test_errors.txt`
- **Purpose**: Test error log
- **Description**: Contains test error messages

### `TEST_LOG.txt`
- **Purpose**: Test log
- **Description**: Test execution log

### `test_results.txt`
- **Purpose**: Test results
- **Description**: Test execution results

---

## Data Flow Summary

### Query Flow
1. **User Input** → Frontend (`index.html`)
2. **API Request** → `api.js` → `POST /api/query/smart`
3. **Handler** → `main.go` → `handleQuerySmart`
4. **Reasoning Engine** → `reasoning/engine.go` → `RunSession`
5. **Decomposition** → `decomposer.go` → Breaks into steps
6. **Model Execution** → `orchestrator.go` → Runs models in parallel
7. **Scoring** → `scorer.go` → Scores outputs
8. **Beam Search** → `selector.go` → Selects best path
9. **Consensus** → `consensus.go` → Synthesizes final output
10. **Response** → `composer.go` → Assembles response
11. **Frontend** → Displays result

### Authentication Flow
1. **User Credentials** → `login.html` → `auth.js`
2. **API Request** → `POST /api/auth/signin`
3. **Handler** → `main.go` → `handleSignIn`
4. **Auth API** → `auth/api.go` → `SignIn`
5. **Supabase** → `auth/supabase.go` → Validates credentials
6. **JWT Token** → Returned to frontend
7. **Storage** → `auth.js` → Stores token
8. **Subsequent Requests** → Token included in headers

### Reasoning Session Flow
1. **Start Request** → `POST /api/reasoning/start`
2. **WebSocket** → `WS /api/reasoning/ws` → Real-time updates
3. **Events** → `reasoning/events.go` → Event types
4. **Frontend** → `reasoning-component.js` → Visualizes updates
5. **Completion** → Session saved to database

---

## Key Design Patterns

### 1. **Adapter Pattern**
- Model adapters (`internal/models/adapters/`) implement common interface
- Allows easy addition of new providers

### 2. **Registry Pattern**
- Model registry (`internal/models/registry.go`) centralizes model management
- Single source of truth for model metadata

### 3. **Strategy Pattern**
- Routing strategies (`internal/models/router.go`)
- Different selection algorithms for different use cases

### 4. **Observer Pattern**
- Event system (`internal/reasoning/events.go`)
- WebSocket events for real-time updates

### 5. **Factory Pattern**
- Adapter creation (`cmd/web-server/main.go`)
- Registry initialization

### 6. **Singleton Pattern**
- Database client (`internal/database/supabase.go`)
- Metrics service (`internal/monitoring/metrics.go`)

---

## Technology Stack Summary

### Backend
- **Language**: Go 1.21+
- **HTTP Server**: Standard library `net/http`
- **WebSocket**: `gorilla/websocket`
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (JWT)
- **Environment**: `joho/godotenv`

### Frontend
- **HTML5**: Semantic markup
- **CSS3**: Modern styling with variables
- **JavaScript**: ES6+ (Vanilla, no frameworks)
- **WebSocket**: Native WebSocket API
- **Speech API**: Web Speech API for voice input

### External Services
- **OpenRouter**: Primary AI model provider
- **Google Gemini**: Direct API integration
- **HuggingFace**: Inference API
- **Ollama**: Local model execution
- **Supabase**: Database and authentication

---

## Development Workflow

### 1. **Setup**
```bash
# Install dependencies
go mod download

# Configure environment
cp .env.example .env
# Edit .env with API keys

# Run migrations (if using database)
# Execute SQL files in migrations/ directory
```

### 2. **Development**
```bash
# Start server
go run cmd/web-server/main.go
# OR
make run
# OR
./start.sh (Linux/Mac)
start.bat (Windows)
start.ps1 (PowerShell)
```

### 3. **Testing**
```bash
# Run tests
make test
# OR
go test ./...

# Run with coverage
make coverage
```

### 4. **Building**
```bash
# Build binaries
make build

# Clean build artifacts
make clean
```

---

## File Count Summary

- **Go Source Files**: ~50+ files
- **Frontend HTML**: 8 files
- **JavaScript Modules**: 17 files
- **CSS Files**: 2 files
- **Database Migrations**: 5 files
- **Documentation Files**: 20+ files
- **Scripts**: 12 files (PowerShell, Batch, Shell)
- **Configuration**: 4 files (go.mod, go.sum, Makefile, docker-compose)

---

## Conclusion

This documentation provides a comprehensive overview of the GAIOL project structure. Each component is designed with modularity and extensibility in mind. The codebase follows Go best practices and modern web development patterns.

For specific implementation details, refer to the source code and inline comments. For API usage, see `API.md`. For architecture details, see `ARCHITECTURE.md`.

---

**Last Updated**: January 2025  
**Project Version**: 1.0.0  
**Go Version**: 1.21+
