package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"relay/internal/auth"
	"relay/internal/database"
	"relay/internal/keys"
	"relay/internal/models"
	"relay/internal/models/adapters"
	"relay/internal/monitoring"
	"relay/internal/reasoning"
	"relay/internal/uaip"

	"github.com/joho/godotenv"
)

var (
	registry         *models.Registry
	router           *models.ModelRouter
	tracker          *models.PerformanceTracker
	dbClient         *database.Client
	dbAvailable      bool
	authAPI          *auth.AuthAPI
	reasoningAPI     *reasoning.ReasoningAPI
	worldModel       *reasoning.WorldModel
	metrics          *monitoring.MetricsService
	rateLimitMu      sync.Mutex
	rateLimitCount   map[string][]time.Time // key (tenantID) -> timestamps in last minute
	allowedOrigins   map[string]struct{}    // CORS: non-empty means restrict; empty means allow *
	logLevel         string                 // "debug" | "info" | "warn" | "error"
)

const rateLimitPerMin = 60

func main() {
	// Load environment variables
	if err := loadEnv(); err != nil {
		log.Printf("Warning: Failed to load .env file: %v", err)
	}
	initCORS()
	initLogLevel()

	// Initialize model adapters
	fmt.Println("🔧 Initializing model adapters...")

	// 1. OLLAMA FIRST (local, fast, unlimited)
	ollamaAdapter := adapters.NewOllamaAdapter("")
	ollamaModels, ollamaErr := ollamaAdapter.CheckAvailability(context.Background())
	if ollamaErr == nil && len(ollamaModels) > 0 {
		fmt.Printf("✅ Ollama available with %d local models: %v\n", len(ollamaModels), ollamaModels)
		fmt.Println("💡 Ollama will be used as PRIMARY provider (unlimited, fast)")
	} else {
		fmt.Printf("⚠️ Ollama not available: %v\n", ollamaErr)
		fmt.Println("💡 Install Ollama and run: ollama pull llama3.2")
		ollamaAdapter = nil
	}

	// 2. Global registry: keep it empty for the tenant-facing API.
	// All real model definitions come from tenant configuration (tenant_models).
	registry = models.NewEmptyRegistry()
	fmt.Printf("📋 Global registry initialized empty (tenant-defined models only at runtime)\n")

	// Initialize database (optional)
	var err error
	dbClient, err = database.NewClient()
	if err != nil {
		log.Printf("⚠️  Database not available: %v - authentication features disabled", err)
		dbClient = nil
		dbAvailable = false
	} else if dbClient != nil {
		// Test database connection - check if client is properly initialized
		if dbClient.Client == nil {
			log.Printf("⚠️  Database client is nil - authentication features disabled")
			dbClient = nil
			dbAvailable = false
		} else {
			log.Println("✅ Database client initialized")
			authAPI = auth.NewAuthAPI(dbClient)
			tracker = models.NewPerformanceTracker(dbClient)
			// Refresh cache asynchronously to avoid blocking startup
			go func() {
				if err := tracker.RefreshCache(context.Background()); err != nil {
					log.Printf("⚠️  Performance cache refresh failed (non-critical): %v", err)
				} else {
					log.Println("✅ Performance cache refreshed")
				}
			}()
			log.Println("✅ Performance tracker initialized (cache refreshing in background)")
			dbAvailable = true
		}
	} else {
		dbAvailable = false
		log.Println("⚠️  Database not available - authentication features disabled")
	}

	// Create router
	router = models.NewModelRouter(registry, tracker)
	log.Println("✅ Model router initialized")

	// Initialize World Model (NEW)
	worldModel = reasoning.NewWorldModel(dbClient)
	log.Println("✅ World Model initialized")

	// Initialize reasoning API
	reasoningAPI = reasoning.NewReasoningAPI(router)
	log.Println("✅ Reasoning API initialized")

	// Initialize metrics
	metrics = monitoring.NewMetricsService()
	log.Println("✅ Metrics service initialized")

	// Register routes
	registerRoutes()

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	handler := requestLogMiddleware(http.DefaultServeMux)
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigint := make(chan os.Signal, 1)
		signal.Notify(sigint, os.Interrupt, syscall.SIGTERM)
		<-sigint

		log.Println("🛑 Shutting down server...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			log.Printf("Server shutdown error: %v", err)
		}
	}()

	log.Printf("🚀 GAIOL Web Server starting on http://localhost:%s", port)
	log.Printf("📊 Health check: http://localhost:%s/health", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed to start: %v", err)
	}
}

func loadEnv() error {
	// Try to load .env file
	if _, err := os.Stat(".env"); err == nil {
		if err := godotenv.Load(".env"); err != nil {
			return fmt.Errorf("failed to load .env file: %w", err)
		}
		log.Println("✅ Loaded environment variables from .env file")
		return nil
	}
	return nil
}

func registerRoutes() {
	// CORS middleware
	cors := corsMiddleware

	// 1. Root and System Routes (public)
	http.HandleFunc("/health", handleHealth)
	// Auth and app pages (exact paths so they take precedence over file server)
	http.HandleFunc("/login", serveStaticPage("login.html"))
	http.HandleFunc("/signup", serveStaticPage("signup.html"))
	http.HandleFunc("/reset-password", serveStaticPage("reset-password.html"))
	http.HandleFunc("/terms", serveStaticPage("terms.html"))
	http.HandleFunc("/dashboard", serveDashboard)
	http.HandleFunc("/dashboard/", serveDashboard)
	http.HandleFunc("/", noCacheFileServer)

	// 2. Model Routes (public, specific first)
	http.HandleFunc("/api/models/free", cors(handleListFreeModels))
	http.HandleFunc("/api/models", cors(handleListModels))
	http.HandleFunc("/api/models/", cors(handleModelsByProvider))

	// 3. Authentication Routes (always available, but return 503 if database unavailable)
	authMiddleware := auth.AuthMiddleware(dbClient)
	http.Handle("/api/auth/signup", optionalAuthMiddleware(authMiddleware, cors(handleSignUp)))
	http.Handle("/api/auth/signin", optionalAuthMiddleware(authMiddleware, cors(handleSignIn)))
	http.Handle("/api/auth/signout", optionalAuthMiddleware(authMiddleware, cors(handleSignOut)))
	http.Handle("/api/auth/session", optionalAuthMiddleware(authMiddleware, cors(handleGetSession)))
	http.Handle("/api/auth/refresh", optionalAuthMiddleware(authMiddleware, cors(handleRefreshToken)))
	http.Handle("/api/auth/user", optionalAuthMiddleware(authMiddleware, cors(handleGetUser)))
	http.HandleFunc("/api/auth/recover", cors(handleRecoverPassword))
	http.HandleFunc("/api/auth/update-password", cors(handleUpdatePassword))

	// 4. Query Routes (protected when DB available; require auth for Phase 2)
	if dbAvailable && authAPI != nil {
		authMiddleware := auth.AuthMiddleware(dbClient)
		http.Handle("/api/query", authMiddleware(cors(handleQuery)))
		http.Handle("/api/query/smart", authMiddleware(cors(handleQuerySmart)))
		http.Handle("/api/query/model", authMiddleware(cors(handleQueryModel)))
	} else {
		http.HandleFunc("/api/query", cors(handleQuery))
		http.HandleFunc("/api/query/smart", cors(handleQuerySmart))
		http.HandleFunc("/api/query/model", cors(handleQueryModel))
	}

	// 5. Reasoning Routes (protected when DB available)
	if dbAvailable && authAPI != nil {
		reqAuth := auth.AuthMiddleware(dbClient)
		http.Handle("/api/reasoning/start", reqAuth(cors(handleReasoningStart)))
		http.Handle("/api/reasoning/status/", reqAuth(cors(handleReasoningStatus)))
		http.Handle("/api/reasoning/ws", reqAuth(cors(handleReasoningWebSocket)))
	} else {
		http.HandleFunc("/api/reasoning/start", cors(handleReasoningStart))
		http.HandleFunc("/api/reasoning/status/", cors(handleReasoningStatus))
		http.HandleFunc("/api/reasoning/ws", cors(handleReasoningWebSocket))
	}
	http.HandleFunc("/api/monitoring/stats", cors(handleMonitoringStats))

	// 6. World Model Routes (protected when DB available)
	if dbAvailable && authAPI != nil {
		reqAuth := auth.AuthMiddleware(dbClient)
		http.Handle("/api/world-model/facts", reqAuth(cors(func(w http.ResponseWriter, r *http.Request) {
			handleWorldModelFacts(w, r)
		})))
		http.Handle("/api/world-model/store", reqAuth(cors(func(w http.ResponseWriter, r *http.Request) {
			handleWorldModelStore(w, r)
		})))
		http.Handle("/api/world-model/search", reqAuth(cors(func(w http.ResponseWriter, r *http.Request) {
			handleWorldModelSearch(w, r)
		})))
	} else {
		http.HandleFunc("/api/world-model/facts", cors(handleWorldModelFacts))
		http.HandleFunc("/api/world-model/store", cors(handleWorldModelStore))
		http.HandleFunc("/api/world-model/search", cors(handleWorldModelSearch))
	}

	// 7. Multi-Agent Workflow Route (protected when DB available)
	if dbAvailable && authAPI != nil {
		reqAuth := auth.AuthMiddleware(dbClient)
		http.Handle("/api/agent/workflow", reqAuth(cors(func(w http.ResponseWriter, r *http.Request) {
			handleAgentWorkflow(w, r)
		})))
	} else {
		http.HandleFunc("/api/agent/workflow", cors(handleAgentWorkflow))
	}

	// 8. Provider keys and GAIOL keys (Phase 4; protected when DB available)
	if dbAvailable && authAPI != nil {
		reqAuth := auth.AuthMiddleware(dbClient)
		http.Handle("/api/settings/provider-keys", reqAuth(cors(handleProviderKeys)))
		// Universal providers/models (tenant-configurable)
		http.Handle("/api/settings/providers", reqAuth(cors(handleCustomProviders)))
		http.Handle("/api/settings/models", reqAuth(cors(handleTenantModelsSettings)))
		http.Handle("/api/gaiol-keys", reqAuth(cors(handleGAIOLKeys)))
		http.Handle("/api/gaiol-keys/", reqAuth(cors(handleGAIOLKeysID)))
		// 10. Usage and billing (Phase 6)
		http.Handle("/api/usage", reqAuth(cors(handleUsage)))
		http.Handle("/api/usage/export", reqAuth(cors(handleUsageExport)))
		http.Handle("/api/billing/summary", reqAuth(cors(handleBillingSummary)))
		http.Handle("/api/billing/history", reqAuth(cors(handleBillingHistory)))
		// 11. Tenant-scoped models list (Phase 7)
		http.Handle("/api/tenant/models", reqAuth(cors(handleTenantModels)))
		// Activity log (Phase 7.8)
		http.Handle("/api/activity", reqAuth(cors(handleActivity)))
		// Tenant preferences (budget, default model, strategy)
		http.Handle("/api/settings/preferences", reqAuth(cors(handlePreferences)))
	}
	// 9. Unified inference by GAIOL key only (no JWT)
	http.Handle("/v1/chat", cors(handleV1Chat))
}

// ============================================================================
// CORS and logging init
// ============================================================================

func initCORS() {
	s := os.Getenv("ALLOWED_ORIGINS")
	if s == "" {
		allowedOrigins = nil
		return
	}
	allowedOrigins = make(map[string]struct{})
	for _, o := range strings.Split(s, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			allowedOrigins[o] = struct{}{}
		}
	}
}

func initLogLevel() {
	logLevel = strings.ToLower(strings.TrimSpace(os.Getenv("LOG_LEVEL")))
	if logLevel == "" {
		logLevel = "info"
	}
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowedOrigins != nil {
			if _, ok := allowedOrigins[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}
			// If origin not in list, do not set Allow-Origin (browser will block cross-origin)
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "3600")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next(w, r)
	}
}

// responseRecorder wraps ResponseWriter to capture status and size for logging.
type responseRecorder struct {
	http.ResponseWriter
	status int
	size   int
}

func (r *responseRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	n, err := r.ResponseWriter.Write(b)
	r.size += n
	return n, err
}

// requestLogMiddleware logs one line per request for log aggregators.
func requestLogMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		dur := time.Since(start).Milliseconds()
		if logLevel == "debug" {
			log.Printf("request method=%s path=%s status=%d duration_ms=%d size=%d", r.Method, r.URL.Path, rec.status, dur, rec.size)
		} else if rec.status >= 500 || (rec.status >= 400 && r.URL.Path != "/health") {
			log.Printf("request method=%s path=%s status=%d duration_ms=%d", r.Method, r.URL.Path, rec.status, dur)
		}
	})
}

// optionalAuthMiddleware wraps auth middleware but allows requests without auth to pass through
func optionalAuthMiddleware(authMiddleware func(http.Handler) http.Handler, next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check if auth header is present
		authHeader := r.Header.Get("Authorization")

		// Also check for cookie-based auth
		_, cookieErr := r.Cookie("sb-access-token")

		// If NO auth header AND NO auth cookie, allow request without authentication
		if authHeader == "" && cookieErr != nil {
			// No authentication provided - proceed without auth
			next(w, r)
			return
		}

		// Auth credentials present - validate them using auth middleware
		authMiddleware(next).ServeHTTP(w, r)
	})
}

// ============================================================================
// Static page server (for /login, /signup, /dashboard)
// ============================================================================

func serveStaticPage(filename string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		file, err := os.Open("./web/" + filename)
		if err != nil {
			http.Error(w, filename+" not found", http.StatusNotFound)
			return
		}
		defer file.Close()
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		http.ServeContent(w, r, filename, time.Time{}, file)
	}
}

// serveDashboard serves dashboard.html for /dashboard and /dashboard/* (SPA-style client routing).
func serveDashboard(w http.ResponseWriter, r *http.Request) {
	file, err := os.Open("./web/dashboard.html")
	if err != nil {
		http.Error(w, "dashboard not found", http.StatusNotFound)
		return
	}
	defer file.Close()
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	http.ServeContent(w, r, "dashboard.html", time.Time{}, file)
}

// ============================================================================
// File Server (no cache)
// ============================================================================

func noCacheFileServer(w http.ResponseWriter, r *http.Request) {
	// Disable caching
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// Handle root path - serve landing page (no auth required)
	if r.URL.Path == "/" || r.URL.Path == "" {
		file, err := os.Open("./web/landing.html")
		if err != nil {
			http.Error(w, "landing.html not found", http.StatusNotFound)
			return
		}
		defer file.Close()

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		http.ServeContent(w, r, "landing.html", time.Time{}, file)
		return
	}

	// For all other paths, serve from ./web directory
	// Use StripPrefix to serve files correctly
	fs := http.FileServer(http.Dir("./web"))
	http.StripPrefix("/", fs).ServeHTTP(w, r)
}

// ============================================================================
// Health Check
// ============================================================================

func handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	health := map[string]interface{}{
		"status":  "healthy",
		"models":  registry.Count(),
		"version": "1.0.0",
		"time":    time.Now().Format(time.RFC3339),
	}

	// Check database availability
	health["database"] = map[string]interface{}{
		"connected": dbAvailable,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)
}

// ============================================================================
// Model Listing Handlers
// ============================================================================

func handleListModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	models := registry.ListModels()
	response := map[string]interface{}{
		"models": convertModelsToJSON(models),
		"count":  len(models),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleListFreeModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	freeModels := registry.FindFreeModels()
	response := map[string]interface{}{
		"models": convertModelsToJSON(freeModels),
		"count":  len(freeModels),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleModelsByProvider(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract provider from path: /api/models/{provider}
	path := strings.TrimPrefix(r.URL.Path, "/api/models/")
	provider := strings.TrimSuffix(path, "/")

	if provider == "" {
		http.Error(w, "Provider is required", http.StatusBadRequest)
		return
	}

	models := registry.FindModelsByProvider(provider)
	response := map[string]interface{}{
		"provider": provider,
		"models":   convertModelsToJSON(models),
		"count":    len(models),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func convertModelsToJSON(models []models.ModelMetadata) []map[string]interface{} {
	result := make([]map[string]interface{}, len(models))
	for i, m := range models {
		result[i] = map[string]interface{}{
			"id":             string(m.ID),
			"provider":       m.Provider,
			"model_name":     m.ModelName,
			"display_name":   m.DisplayName,
			"cost_per_token": m.CostInfo.CostPerToken,
			"capabilities":   m.Capabilities,
			"quality_score":  m.QualityScore,
			"context_window": m.ContextWindow,
			"max_tokens":     m.MaxTokens,
			"tags":           m.Tags,
		}
	}
	return result
}

// logUsageToAPIQueries inserts a row into api_queries for usage/billing. gaiolKeyID is optional (set when request used a GAIOL key).
func logUsageToAPIQueries(db *database.Client, tenant database.TenantContext, modelID string, tokensUsed int, cost float64, processingMs int, success bool, errMsg string, gaiolKeyID string) error {
	if db == nil || db.Client == nil {
		return nil
	}
	row := map[string]interface{}{
		"tenant_id":           tenant.TenantID,
		"organization_id":     tenant.OrgID,
		"user_id":             tenant.UserID,
		"model_id":            modelID,
		"tokens_used":         tokensUsed,
		"cost":                cost,
		"processing_time_ms": processingMs,
		"success":            success,
		"error_message":      errMsg,
	}
	if gaiolKeyID != "" {
		row["gaiol_api_key_id"] = gaiolKeyID
	}
	_, _, err := db.From("api_queries").Insert(row, false, "", "", "").Execute()
	if err != nil {
		log.Printf("⚠️ Failed to log usage to api_queries: %v", err)
		return err
	}
	return nil
}

// buildRegistryFromKeys builds a model registry and router from tenant provider keys (openrouter, huggingface, google).
// Returns (nil, nil) if no keys are present. Caller must not use env provider keys for tenant inference.
func buildRegistryFromKeys(providerKeys map[string]string, tracker *models.PerformanceTracker) (*models.Registry, *models.ModelRouter) {
	var openRouter, hf, ollama models.ModelAdapter
	if k := providerKeys["openrouter"]; k != "" {
		openRouter = adapters.NewOpenRouterAdapter("", k)
	}
	if k := providerKeys["huggingface"]; k != "" {
		hf = adapters.NewHuggingFaceAdapter("", k)
	}
	// Ollama: optional local; skip when building from tenant keys (tenant uses cloud keys only unless we add local later)
	ollama = nil
	reg := models.NewRegistry(openRouter, hf, ollama)
	if k := providerKeys["google"]; k != "" {
		reg.AddGeminiModels(adapters.NewGeminiAdapter(k))
	}
	if reg.Count() == 0 {
		return nil, nil
	}
	return reg, models.NewModelRouter(reg, tracker)
}

// buildTenantRegistry builds a registry/router for a tenant from:
// - legacy provider keys (provider_api_keys): openrouter, huggingface, google
// - custom providers (tenant_providers): openai-compatible endpoints
// - tenant models (tenant_models): explicit model ids for routing
func buildTenantRegistry(ctx context.Context, db *database.Client, tenantID string, tracker *models.PerformanceTracker) (*models.Registry, *models.ModelRouter, error) {
	if db == nil || db.Client == nil || strings.TrimSpace(tenantID) == "" {
		return nil, nil, fmt.Errorf("database + tenant_id are required")
	}

	legacyKeys, err := keys.LoadProviderKeysForTenant(ctx, db, tenantID)
	if err != nil {
		return nil, nil, err
	}

	var openRouterAdapter models.ModelAdapter
	var hfAdapter models.ModelAdapter
	var geminiAdapter models.ModelAdapter

	if k := legacyKeys["openrouter"]; k != "" {
		openRouterAdapter = adapters.NewOpenRouterAdapter("", k)
	}
	if k := legacyKeys["huggingface"]; k != "" {
		hfAdapter = adapters.NewHuggingFaceAdapter("", k)
	}
	if k := legacyKeys["google"]; k != "" {
		geminiAdapter = adapters.NewGeminiAdapter(k)
	}

	reg := models.NewEmptyRegistry()

	adapterByProvider := map[string]models.ModelAdapter{}
	if openRouterAdapter != nil {
		adapterByProvider["openrouter"] = openRouterAdapter
	}
	if hfAdapter != nil {
		adapterByProvider["huggingface"] = hfAdapter
	}
	if geminiAdapter != nil {
		adapterByProvider["google"] = geminiAdapter
		adapterByProvider["gemini"] = geminiAdapter
	}

	customProviders, err := keys.LoadCustomProvidersForTenant(ctx, db, tenantID)
	if err != nil {
		return nil, nil, err
	}
	for pk, cfg := range customProviders {
		switch strings.TrimSpace(strings.ToLower(cfg.ProviderType)) {
		case "", "openai_compatible":
			adapterByProvider[pk] = adapters.NewOpenAICompatibleAdapter(pk, cfg.BaseURL, cfg.AuthHeader, cfg.AuthScheme, cfg.APIKey)
		case "anthropic_messages":
			adapterByProvider[pk] = adapters.NewAnthropicAdapter(pk, cfg.BaseURL, cfg.APIKey)
		default:
			continue
		}
	}

	tenantModels, err := keys.LoadTenantModelsForTenant(ctx, db, tenantID)
	if err != nil {
		return nil, nil, err
	}

	// If no tenant_models rows exist, attempt to register default_model_id (if set) so
	// a tenant can be functional with minimal config.
	if len(tenantModels) == 0 {
		if s, _ := db.GetTenantSettings(ctx, tenantID); s != nil && strings.TrimSpace(s.DefaultModelID) != "" {
			parts := strings.SplitN(strings.TrimSpace(s.DefaultModelID), ":", 2)
			if len(parts) == 2 {
				tenantModels = append(tenantModels, keys.TenantModelRow{
					ProviderKey: parts[0],
					ModelID:     parts[1],
					DisplayName: "",
					QualityScore: 0.75,
					CostPerToken: 0.0,
					ContextWindow: 0,
					MaxTokens: 0,
					Tags: []string{"default"},
					IsActive: true,
				})
			}
		}
	}

	for _, m := range tenantModels {
		pk := strings.TrimSpace(strings.ToLower(m.ProviderKey))
		if pk == "" || strings.TrimSpace(m.ModelID) == "" || !m.IsActive {
			continue
		}

		adapter := adapterByProvider[pk]
		if adapter == nil {
			continue
		}

		regProvider := pk
		idPrefix := pk
		if pk == "google" || pk == "gemini" {
			regProvider = "gemini"
			idPrefix = "gemini"
		}

		id := models.ModelID(idPrefix + ":" + m.ModelID)
		display := strings.TrimSpace(m.DisplayName)
		if display == "" {
			display = m.ModelID
		}
		_ = reg.RegisterModel(models.ModelMetadata{
			ID:            id,
			Provider:      regProvider,
			ModelName:     m.ModelID,
			DisplayName:   display,
			CostInfo:      models.CostInfo{CostPerToken: m.CostPerToken},
			Capabilities:  []models.TaskType{models.TaskGenerate, models.TaskAnalyze, models.TaskSummarize, models.TaskTransform, models.TaskCode},
			QualityScore:  m.QualityScore,
			ContextWindow: m.ContextWindow,
			MaxTokens:     m.MaxTokens,
			Tags:          m.Tags,
			Adapter:       adapter,
		})
	}

	if reg.Count() == 0 {
		return nil, nil, nil
	}
	return reg, models.NewModelRouter(reg, tracker), nil
}

// ============================================================================
// Query Handlers
// ============================================================================

func handleQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Prompt      string   `json:"prompt"`
		Models      []string `json:"models"`
		MaxTokens   int      `json:"max_tokens"`
		Temperature float64  `json:"temperature"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Prompt == "" {
		http.Error(w, "prompt is required", http.StatusBadRequest)
		return
	}

	if req.MaxTokens == 0 {
		req.MaxTokens = 300
	}
	if req.Temperature == 0 {
		req.Temperature = 0.7
	}

	// Execute queries for all requested models
	ctx := r.Context()
	results := make([]map[string]interface{}, 0, len(req.Models))

	for _, modelID := range req.Models {
		modelMeta, err := registry.GetModel(models.ModelID(modelID))
		if err != nil {
			// Try with openrouter: prefix
			modelMeta, err = registry.GetModel(models.ModelID("openrouter:" + modelID))
			if err != nil {
				results = append(results, map[string]interface{}{
					"model_id": modelID,
					"error":    "Model not found: " + err.Error(),
				})
				continue
			}
		}

		uaipReq := &uaip.UAIPRequest{
			UAIP: uaip.UAIPHeader{
				Version:   uaip.ProtocolVersion,
				MessageID: fmt.Sprintf("query-%d", time.Now().UnixNano()),
				Timestamp: time.Now(),
			},
			Payload: uaip.Payload{
				Input: uaip.PayloadInput{
					Data:   req.Prompt,
					Format: "text",
				},
				OutputRequirements: uaip.OutputRequirements{
					MaxTokens:   req.MaxTokens,
					Temperature: req.Temperature,
				},
			},
		}

		resp, err := modelMeta.Adapter.GenerateText(ctx, modelMeta.ModelName, uaipReq)
		if err != nil {
			results = append(results, map[string]interface{}{
				"model_id": modelID,
				"error":    err.Error(),
			})
			continue
		}

		results = append(results, map[string]interface{}{
			"model_id":    modelID,
			"response":    resp.Result.Data,
			"tokens_used": resp.Result.TokensUsed,
			"cost":        resp.Metadata.CostInfo.TotalCost,
			"latency_ms":  resp.Result.ProcessingMs,
			"quality":     resp.Result.Quality,
		})
	}

	response := map[string]interface{}{
		"results": results,
		"count":   len(results),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleQuerySmart(w http.ResponseWriter, r *http.Request) {
	// Add panic recovery with proper error response
	defer func() {
		if err := recover(); err != nil {
			log.Printf("❌ PANIC in handleQuerySmart: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":   fmt.Sprintf("Internal server error: %v", err),
				"success": false,
			})
		}
	}()

	log.Printf("📥 handleQuerySmart called - using Reasoning Engine")

	if r.Method != "POST" {
		log.Printf("❌ Invalid method: %s", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Prompt      string  `json:"prompt"`
		Strategy    string  `json:"strategy"`
		Task        string  `json:"task"`
		MaxTokens   int     `json:"max_tokens"`
		Temperature float64 `json:"temperature"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("❌ Invalid JSON: %v", err)
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("📋 Query request - Prompt: %q, Strategy: %s, Task: %s", req.Prompt, req.Strategy, req.Task)

	if req.Prompt == "" {
		log.Printf("❌ Empty prompt")
		http.Error(w, "prompt is required", http.StatusBadRequest)
		return
	}

	// Tenant-scoped inference: use provider keys from DB only (Phase 4)
	var tenantCtx database.TenantContext
	var engine *reasoning.ReasoningEngine
	if dbAvailable && dbClient != nil {
		tenantCtx, _ = database.GetTenantFromContext(r.Context())
		tenantReg, tenantRouter, buildErr := buildTenantRegistry(r.Context(), dbClient, tenantCtx.TenantID, tracker)
		if buildErr != nil {
			log.Printf("❌ Build tenant registry: %v", buildErr)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Failed to load tenant models/providers", "success": false})
			return
		}
		if tenantReg == nil || tenantRouter == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":   "No tenant models/providers configured. Add built-in provider keys in Dashboard > Models, or register custom providers/models via /api/settings/providers and /api/settings/models.",
				"success": false,
			})
			return
		}
		engine = reasoning.NewReasoningEngine(tenantRouter)
	} else {
		tenantCtx, _ = database.GetTenantFromContext(r.Context())
		engine = reasoningAPI.Engine
	}
	if engine == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "Reasoning engine not initialized", "success": false})
		return
	}

	sessionID := engine.InitSession(r.Context(), req.Prompt)
	log.Printf("🧠 Starting reasoning session: %s", sessionID)

	sm, err := engine.RunSession(r.Context(), sessionID, req.Prompt, []string{})
	if err != nil {
		log.Printf("❌ Reasoning failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "Reasoning failed: " + err.Error(),
			"success": false,
		})
		return
	}

	// Extract the final result from the reasoning session
	finalOutput := ""
	if sm != nil {
		// Use composer to assemble final output from selected path (handles multi-step)
		if len(sm.SelectedPath) > 0 {
			// Use the composer to properly assemble multi-step outputs
			composer := reasoning.NewComposer()
			finalOutput = composer.AssembleFinalOutput(sm.SelectedPath)
		} else if len(sm.Steps) > 0 {
			// If no selected path but we have steps, try to extract from step outputs
			for i := len(sm.Steps) - 1; i >= 0; i-- {
				if sm.Steps[i].SelectedOutput != nil && sm.Steps[i].SelectedOutput.Response != "" {
					finalOutput = sm.Steps[i].SelectedOutput.Response
					break
				}
				// Also check all model outputs in case selected output is nil
				if len(sm.Steps[i].ModelOutputs) > 0 {
					for _, out := range sm.Steps[i].ModelOutputs {
						if out.Response != "" {
							finalOutput = out.Response
							break
						}
					}
					if finalOutput != "" {
						break
					}
				}
			}
		}
	}

	// If still empty, provide a helpful error message
	if finalOutput == "" {
		finalOutput = "⚠️ All AI models are currently unavailable due to API rate limits or service issues.\n\nPossible causes:\n- OpenRouter API rate limit exceeded (429 errors)\n- API key issues or payment required (402 errors)\n- Model not found (404 errors)\n- Ollama service unavailable or timing out\n\nPlease wait a few minutes and try again, or check your API keys and service status."
	}

	log.Printf("✅ Reasoning completed successfully")

	// Usage logging (Phase 4)
	if dbClient != nil && tenantCtx.TenantID != "" {
		cost := 0.0
		if sm != nil {
			cost = sm.TotalCost
		}
		_ = logUsageToAPIQueries(dbClient, tenantCtx, "reasoning-engine", 0, cost, 0, true, "", "")
	}

	// Build response in the same format as before for frontend compatibility
	response := map[string]interface{}{
		"uaip": true,
		"status": map[string]interface{}{
			"success": true,
		},
		"result": map[string]interface{}{
			"data":          finalOutput,
			"tokens_used":   0, // Could aggregate from sm if needed
			"model_used":    "ReasoningEngine",
			"processing_ms": 0,
			"quality":       1.0,
		},
		"metadata": map[string]interface{}{
			"cost_info": map[string]interface{}{
				"total_cost": sm.TotalCost,
			},
			"session_id":     sessionID,
			"steps_executed": len(sm.Steps),
		},
		// Legacy format for backward compatibility
		"model_id":    "reasoning-engine",
		"model_name":  "GAIOL Reasoning Engine",
		"response":    finalOutput,
		"tokens_used": 0,
		"cost":        sm.TotalCost,
		"latency_ms":  0,
		"quality":     1.0,
		"strategy":    "reasoning",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("❌ Failed to encode response: %v", err)
	}
}

func canManageKeys(tc database.TenantContext) bool {
	// Empty role (e.g. from RPC that does not return role) treated as owner for backward compatibility
	return tc.Role == "admin" || tc.Role == "owner" || tc.Role == ""
}

func handleProviderKeys(w http.ResponseWriter, r *http.Request) {
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || dbClient == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := keys.ListProviderKeys(r.Context(), dbClient, tenantCtx.TenantID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	case http.MethodPost:
		if !canManageKeys(tenantCtx) {
			http.Error(w, "Forbidden: only admins can manage provider keys", http.StatusForbidden)
			return
		}
		var body struct {
			Provider string `json:"provider"`
			APIKey   string `json:"api_key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		hint, err := keys.StoreProviderKey(r.Context(), dbClient, tenantCtx.TenantID, body.Provider, body.APIKey)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = dbClient.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "provider_key_added", map[string]interface{}{"provider": body.Provider})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"key_hint": hint})
	case http.MethodDelete:
		if !canManageKeys(tenantCtx) {
			http.Error(w, "Forbidden: only admins can manage provider keys", http.StatusForbidden)
			return
		}
		provider := r.URL.Query().Get("provider")
		if provider == "" {
			http.Error(w, "provider query required", http.StatusBadRequest)
			return
		}
		if err := keys.DeleteProviderKey(r.Context(), dbClient, tenantCtx.TenantID, provider); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = dbClient.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "provider_key_removed", map[string]interface{}{"provider": provider})
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Universal provider endpoints (tenant-configurable).
// Provider keys are stored encrypted in tenant_providers; models are registered in tenant_models.
func handleCustomProviders(w http.ResponseWriter, r *http.Request) {
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || dbClient == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := keys.ListCustomProviders(r.Context(), dbClient, tenantCtx.TenantID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"providers": list})
	case http.MethodPost:
		if !canManageKeys(tenantCtx) {
			http.Error(w, "Forbidden: only admins can manage providers", http.StatusForbidden)
			return
		}
		var body struct {
			ProviderKey  string `json:"provider_key"`
			ProviderType string `json:"provider_type"`
			BaseURL      string `json:"base_url"`
			APIKey       string `json:"api_key"`
			AuthHeader   string `json:"auth_header"`
			AuthScheme   string `json:"auth_scheme"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		hint, err := keys.StoreCustomProvider(r.Context(), dbClient, tenantCtx.TenantID, body.ProviderKey, body.ProviderType, body.BaseURL, body.APIKey, body.AuthHeader, body.AuthScheme)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = dbClient.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "custom_provider_saved", map[string]interface{}{"provider_key": body.ProviderKey})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"key_hint": hint})
	case http.MethodDelete:
		if !canManageKeys(tenantCtx) {
			http.Error(w, "Forbidden: only admins can manage providers", http.StatusForbidden)
			return
		}
		providerKey := r.URL.Query().Get("provider_key")
		if providerKey == "" {
			http.Error(w, "provider_key query required", http.StatusBadRequest)
			return
		}
		if err := keys.DeleteCustomProvider(r.Context(), dbClient, tenantCtx.TenantID, providerKey); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = dbClient.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "custom_provider_deleted", map[string]interface{}{"provider_key": providerKey})
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleTenantModelsSettings(w http.ResponseWriter, r *http.Request) {
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || dbClient == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := keys.ListTenantModels(r.Context(), dbClient, tenantCtx.TenantID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"models": list})
	case http.MethodPost:
		if !canManageKeys(tenantCtx) {
			http.Error(w, "Forbidden: only admins can manage models", http.StatusForbidden)
			return
		}
		var body struct {
			ProviderKey   string    `json:"provider_key"`
			ModelID       string    `json:"model_id"`
			DisplayName   string    `json:"display_name"`
			QualityScore  *float64  `json:"quality_score"`
			CostPerToken  *float64  `json:"cost_per_token"`
			ContextWindow *int      `json:"context_window"`
			MaxTokens     *int      `json:"max_tokens"`
			Tags          []string  `json:"tags"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if err := keys.UpsertTenantModel(r.Context(), dbClient, tenantCtx.TenantID, body.ProviderKey, body.ModelID, body.DisplayName, body.QualityScore, body.CostPerToken, body.ContextWindow, body.MaxTokens, body.Tags); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = dbClient.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "tenant_model_saved", map[string]interface{}{"provider_key": body.ProviderKey, "model_id": body.ModelID})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	case http.MethodDelete:
		if !canManageKeys(tenantCtx) {
			http.Error(w, "Forbidden: only admins can manage models", http.StatusForbidden)
			return
		}
		providerKey := r.URL.Query().Get("provider_key")
		modelID := r.URL.Query().Get("model_id")
		if providerKey == "" || modelID == "" {
			http.Error(w, "provider_key and model_id queries required", http.StatusBadRequest)
			return
		}
		if err := keys.DeleteTenantModel(r.Context(), dbClient, tenantCtx.TenantID, providerKey, modelID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = dbClient.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "tenant_model_deleted", map[string]interface{}{"provider_key": providerKey, "model_id": modelID})
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGAIOLKeys(w http.ResponseWriter, r *http.Request) {
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || dbClient == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := keys.ListGAIOLKeys(r.Context(), dbClient, tenantCtx.TenantID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	case http.MethodPost:
		if !canManageKeys(tenantCtx) {
			http.Error(w, "Forbidden: only admins can create GAIOL keys", http.StatusForbidden)
			return
		}
		var body struct {
			Name string `json:"name"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		rawKey, err := keys.CreateGAIOLKey(r.Context(), dbClient, tenantCtx.TenantID, body.Name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = dbClient.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "gaiol_key_created", map[string]interface{}{"name": body.Name})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"api_key": rawKey, "message": "Show once; store securely"})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGAIOLKeysID(w http.ResponseWriter, r *http.Request) {
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || dbClient == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !canManageKeys(tenantCtx) {
		http.Error(w, "Forbidden: only admins can revoke GAIOL keys", http.StatusForbidden)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/gaiol-keys/")
	if id == "" {
		http.Error(w, "key id required", http.StatusBadRequest)
		return
	}
	if err := keys.RevokeGAIOLKey(r.Context(), dbClient, tenantCtx.TenantID, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = dbClient.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "gaiol_key_revoked", map[string]interface{}{"key_id": id})
	w.WriteHeader(http.StatusNoContent)
}

func handleActivity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || dbClient == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	limit := 50
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	entries, err := dbClient.GetAuditLogForTenant(r.Context(), tenantCtx.TenantID, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"activity": entries})
}

func handlePreferences(w http.ResponseWriter, r *http.Request) {
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || dbClient == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		s, err := dbClient.GetTenantSettings(r.Context(), tenantCtx.TenantID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		out := map[string]interface{}{"budget_limit": nil, "default_model_id": "", "strategy": "balanced"}
		if s != nil {
			out["budget_limit"] = s.BudgetLimit
			out["default_model_id"] = s.DefaultModelID
			out["strategy"] = s.Strategy
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	case http.MethodPut:
		var body struct {
			BudgetLimit    *float64 `json:"budget_limit"`
			DefaultModelID string   `json:"default_model_id"`
			Strategy       string   `json:"strategy"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		s, _ := dbClient.GetTenantSettings(r.Context(), tenantCtx.TenantID)
		if s == nil {
			s = &database.TenantSettings{TenantID: tenantCtx.TenantID, Strategy: "balanced"}
		}
		if body.BudgetLimit != nil {
			s.BudgetLimit = body.BudgetLimit
		}
		if body.Strategy != "" {
			s.Strategy = body.Strategy
		}
		s.DefaultModelID = body.DefaultModelID
		if err := dbClient.UpsertTenantSettings(r.Context(), s); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleUsage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || dbClient == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	from, to := parseUsageRange(r)
	rows, err := dbClient.GetUsageForTenant(r.Context(), tenantCtx.TenantID, from, to)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var totalTokens int
	var totalCost float64
	for _, row := range rows {
		totalTokens += row.TokensUsed
		totalCost += row.Cost
	}
	summary := map[string]interface{}{"requests": len(rows), "tokens": totalTokens, "cost": totalCost}
	byDay := make(map[string]map[string]interface{})
	byProvider := make(map[string]map[string]interface{})
	byKey := make(map[string]map[string]interface{})
	for _, row := range rows {
		day := row.CreatedAt.Format("2006-01-02")
		if byDay[day] == nil {
			byDay[day] = map[string]interface{}{"date": day, "requests": 0, "tokens": 0, "cost": 0.0}
		}
		byDay[day]["requests"] = byDay[day]["requests"].(int) + 1
		byDay[day]["tokens"] = byDay[day]["tokens"].(int) + row.TokensUsed
		byDay[day]["cost"] = byDay[day]["cost"].(float64) + row.Cost
		provider := row.ModelID
		if idx := strings.Index(provider, ":"); idx > 0 {
			provider = provider[:idx]
		}
		if byProvider[provider] == nil {
			byProvider[provider] = map[string]interface{}{"provider": provider, "requests": 0, "tokens": 0, "cost": 0.0}
		}
		byProvider[provider]["requests"] = byProvider[provider]["requests"].(int) + 1
		byProvider[provider]["tokens"] = byProvider[provider]["tokens"].(int) + row.TokensUsed
			byProvider[provider]["cost"] = byProvider[provider]["cost"].(float64) + row.Cost
		// Per-GAIOL-key usage
		keyID := ""
		if row.GAIOLKeyID != nil {
			keyID = *row.GAIOLKeyID
		}
		if keyID != "" {
			if byKey[keyID] == nil {
				byKey[keyID] = map[string]interface{}{"key_id": keyID, "requests": 0, "tokens": 0, "cost": 0.0}
			}
			byKey[keyID]["requests"] = byKey[keyID]["requests"].(int) + 1
			byKey[keyID]["tokens"] = byKey[keyID]["tokens"].(int) + row.TokensUsed
			byKey[keyID]["cost"] = byKey[keyID]["cost"].(float64) + row.Cost
		}
	}
	// Resolve key names for by_key
	keyList, _ := keys.ListGAIOLKeys(r.Context(), dbClient, tenantCtx.TenantID)
	keyNames := make(map[string]string)
	for _, k := range keyList {
		keyNames[k.ID] = k.Name
	}
	var byKeyList []map[string]interface{}
	for _, v := range byKey {
		if name := keyNames[v["key_id"].(string)]; name != "" {
			v["key_name"] = name
		} else {
			v["key_name"] = v["key_id"]
		}
		byKeyList = append(byKeyList, v)
	}
	var byDayList []map[string]interface{}
	for _, v := range byDay {
		byDayList = append(byDayList, v)
	}
	var byProviderList []map[string]interface{}
	for _, v := range byProvider {
		byProviderList = append(byProviderList, v)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"summary":     summary,
		"by_day":      byDayList,
		"by_provider": byProviderList,
		"by_key":      byKeyList,
	})
}

func parseUsageRange(r *http.Request) (from, to *time.Time) {
	if s := r.URL.Query().Get("from"); s != "" {
		if t, err := time.Parse("2006-01-02", s); err == nil {
			from = &t
		}
	}
	if s := r.URL.Query().Get("to"); s != "" {
		if t, err := time.Parse("2006-01-02", s); err == nil {
			to = &t
		}
	}
	if from == nil {
		t := time.Now().AddDate(0, 0, -30)
		from = &t
	}
	if to == nil {
		t := time.Now()
		to = &t
	}
	return from, to
}

func handleUsageExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || dbClient == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	from, to := parseUsageRange(r)
	rows, err := dbClient.GetUsageForTenant(r.Context(), tenantCtx.TenantID, from, to)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=usage.csv")
	w.Write([]byte("date,model_id,tokens_used,cost,processing_time_ms,success\n"))
	for _, row := range rows {
		w.Write([]byte(fmt.Sprintf("%s,%s,%d,%.6f,%d,%v\n",
			row.CreatedAt.Format("2006-01-02"), row.ModelID, row.TokensUsed, row.Cost, row.ProcessingTimeMs, row.Success)))
	}
}

func handleBillingSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || dbClient == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	rows, err := dbClient.GetUsageForTenant(r.Context(), tenantCtx.TenantID, &start, &now)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var totalCost float64
	byProvider := make(map[string]float64)
	for _, row := range rows {
		totalCost += row.Cost
		provider := row.ModelID
		if idx := strings.Index(provider, ":"); idx > 0 {
			provider = provider[:idx]
		}
		byProvider[provider] += row.Cost
	}
	var byProviderList []map[string]interface{}
	for p, c := range byProvider {
		byProviderList = append(byProviderList, map[string]interface{}{"provider": p, "cost": c})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"period":       start.Format("2006-01"),
		"total_cost":   totalCost,
		"by_provider":  byProviderList,
	})
}

func handleTenantModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || dbClient == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	tenantReg, _, buildErr := buildTenantRegistry(r.Context(), dbClient, tenantCtx.TenantID, tracker)
	if buildErr != nil {
		http.Error(w, buildErr.Error(), http.StatusInternalServerError)
		return
	}
	if tenantReg == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"models": []interface{}{}, "count": 0})
		return
	}
	models := tenantReg.ListModels()
	list := make([]map[string]interface{}, 0, len(models))
	for _, m := range models {
		list = append(list, map[string]interface{}{
			"id":          string(m.ID),
			"display_name": m.DisplayName,
			"provider":   m.Provider,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"models": list, "count": len(list)})
}

func handleBillingHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || dbClient == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	now := time.Now()
	var history []map[string]interface{}
	for i := 0; i < 6; i++ {
		ref := now.AddDate(0, -i, 0)
		monthStart := time.Date(ref.Year(), ref.Month(), 1, 0, 0, 0, 0, now.Location())
		monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Nanosecond)
		rows, err := dbClient.GetUsageForTenant(r.Context(), tenantCtx.TenantID, &monthStart, &monthEnd)
		if err != nil {
			continue
		}
		var cost float64
		for _, row := range rows {
			cost += row.Cost
		}
		history = append(history, map[string]interface{}{
			"month": monthStart.Format("2006-01"),
			"total_cost": cost,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"history": history})
}

func handleV1Chat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		http.Error(w, "Authorization required", http.StatusUnauthorized)
		return
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		http.Error(w, "Invalid Authorization header", http.StatusUnauthorized)
		return
	}
	rawToken := strings.TrimSpace(parts[1])
	tenantID, gaiolKeyID, err := keys.ValidateGAIOLKey(r.Context(), dbClient, rawToken)
	if err != nil || dbClient == nil {
		http.Error(w, "Invalid or expired API key", http.StatusUnauthorized)
		return
	}
	// Rate limit: 60 req/min per tenant
	rateLimitMu.Lock()
	if rateLimitCount == nil {
		rateLimitCount = make(map[string][]time.Time)
	}
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	var kept []time.Time
	for _, t := range rateLimitCount[tenantID] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	kept = append(kept, now)
	rateLimitCount[tenantID] = kept
	if len(kept) > rateLimitPerMin {
		rateLimitMu.Unlock()
		w.Header().Set("Retry-After", "60")
		http.Error(w, "Rate limit exceeded (60 requests per minute per key)", http.StatusTooManyRequests)
		return
	}
	rateLimitMu.Unlock()

	// Attach TenantContext so downstream code (buildTenantRegistry, GetTenantSettings, engine) uses unified tenant resolution (Layer 1).
	tenantCtx := database.TenantContext{TenantID: tenantID, UserID: "", OrgID: ""}
	r = r.WithContext(database.WithTenant(r.Context(), tenantCtx))

	v1Start := time.Now()
	var body struct {
		Prompt      string  `json:"prompt"`
		ProviderKey string  `json:"provider_key"`
		ModelID     string  `json:"model_id"`
		Model       string  `json:"model"`
		Strategy    string  `json:"strategy"`
		Task        string  `json:"task"`
		MaxTokens   int     `json:"max_tokens"`
		Temperature float64 `json:"temperature"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if body.Prompt == "" {
		http.Error(w, "prompt is required", http.StatusBadRequest)
		return
	}

	tenantReg, tenantRouter, buildErr := buildTenantRegistry(r.Context(), dbClient, tenantID, tracker)
	if buildErr != nil {
		http.Error(w, "Failed to load tenant models/providers", http.StatusInternalServerError)
		return
	}
	if tenantReg == nil || tenantRouter == nil {
		http.Error(w, "No tenant models/providers configured for this tenant. Add built-in provider keys (Dashboard > Models) or register custom providers/models via /api/settings/providers and /api/settings/models.", http.StatusBadRequest)
		return
	}

	requestedModel := strings.TrimSpace(body.ModelID)
	if requestedModel == "" {
		requestedModel = strings.TrimSpace(body.Model)
	}
	if requestedModel != "" && !strings.Contains(requestedModel, ":") && strings.TrimSpace(body.ProviderKey) != "" {
		requestedModel = strings.TrimSpace(strings.ToLower(body.ProviderKey)) + ":" + requestedModel
	}

	// If a specific model is requested, run a direct single-model call (no reasoning engine).
	if requestedModel != "" {
		meta, err := tenantReg.GetModel(models.ModelID(requestedModel))
		if err != nil {
			http.Error(w, "Model not registered for this tenant. Add it in Settings > Models.", http.StatusBadRequest)
			return
		}
		uaipReq := &uaip.UAIPRequest{
			UAIP: uaip.UAIPHeader{
				Version:   uaip.ProtocolVersion,
				MessageID: fmt.Sprintf("v1-%d", time.Now().UnixNano()),
				Timestamp: time.Now(),
			},
			Payload: uaip.Payload{
				Input: uaip.PayloadInput{Data: body.Prompt, Format: "text"},
				OutputRequirements: uaip.OutputRequirements{
					MaxTokens:   body.MaxTokens,
					Temperature: body.Temperature,
				},
			},
		}
		resp, err := meta.Adapter.GenerateText(r.Context(), meta.ModelName, uaipReq)
		if err != nil {
			log.Printf("v1/chat tenant_id=%s model=%s latency_ms=%d success=false error=%s", tenantID, requestedModel, time.Since(v1Start).Milliseconds(), err.Error())
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error(), "success": false})
			return
		}
		_ = logUsageToAPIQueries(dbClient, tenantCtx, requestedModel, resp.Result.TokensUsed, 0.0, resp.Result.ProcessingMs, true, "", gaiolKeyID)
		log.Printf("v1/chat tenant_id=%s model=%s latency_ms=%d success=true", tenantID, requestedModel, time.Since(v1Start).Milliseconds())
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"result":     resp.Result.Data,
			"cost":       0.0,
			"session_id": "",
			"model_id":   requestedModel,
		})
		return
	}

	engine := reasoning.NewReasoningEngine(tenantRouter)
	if body.Strategy == "" {
		if prefs, _ := dbClient.GetTenantSettings(r.Context(), tenantID); prefs != nil && prefs.Strategy != "" {
			body.Strategy = prefs.Strategy
		} else {
			body.Strategy = "balanced"
		}
	}
	sessionID := engine.InitSession(r.Context(), body.Prompt)
	sm, err := engine.RunSession(r.Context(), sessionID, body.Prompt, []string{})
	if err != nil {
		log.Printf("v1/chat tenant_id=%s latency_ms=%d success=false error=%s", tenantID, time.Since(v1Start).Milliseconds(), err.Error())
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error(), "success": false})
		return
	}
	finalOutput := ""
	if sm != nil && len(sm.SelectedPath) > 0 {
		composer := reasoning.NewComposer()
		finalOutput = composer.AssembleFinalOutput(sm.SelectedPath)
	} else if sm != nil && len(sm.Steps) > 0 {
		for i := len(sm.Steps) - 1; i >= 0; i-- {
			if sm.Steps[i].SelectedOutput != nil && sm.Steps[i].SelectedOutput.Response != "" {
				finalOutput = sm.Steps[i].SelectedOutput.Response
				break
			}
		}
	}
	cost := 0.0
	if sm != nil {
		cost = sm.TotalCost
	}
	_ = logUsageToAPIQueries(dbClient, tenantCtx, "reasoning-engine", 0, cost, 0, true, "", gaiolKeyID)
	log.Printf("v1/chat tenant_id=%s latency_ms=%d success=true", tenantID, time.Since(v1Start).Milliseconds())
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"result":  finalOutput,
		"cost":    cost,
		"session_id": sessionID,
	})
}

func handleQueryModel(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Prompt      string  `json:"prompt"`
		ModelID     string  `json:"model_id"`
		MaxTokens   int     `json:"max_tokens"`
		Temperature float64 `json:"temperature"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Prompt == "" {
		http.Error(w, "prompt is required", http.StatusBadRequest)
		return
	}

	if req.ModelID == "" {
		http.Error(w, "model_id is required", http.StatusBadRequest)
		return
	}

	if req.MaxTokens == 0 {
		req.MaxTokens = 200
	}
	if req.Temperature == 0 {
		req.Temperature = 0.7
	}

	modelMeta, err := registry.GetModel(models.ModelID(req.ModelID))
	if err != nil {
		// Try with openrouter: prefix
		modelMeta, err = registry.GetModel(models.ModelID("openrouter:" + req.ModelID))
		if err != nil {
			http.Error(w, "Model not found: "+err.Error(), http.StatusNotFound)
			return
		}
	}

	uaipReq := &uaip.UAIPRequest{
		UAIP: uaip.UAIPHeader{
			Version:   uaip.ProtocolVersion,
			MessageID: fmt.Sprintf("model-%d", time.Now().UnixNano()),
			Timestamp: time.Now(),
		},
		Payload: uaip.Payload{
			Input: uaip.PayloadInput{
				Data:   req.Prompt,
				Format: "text",
			},
			OutputRequirements: uaip.OutputRequirements{
				MaxTokens:   req.MaxTokens,
				Temperature: req.Temperature,
			},
		},
	}

	ctx := r.Context()
	resp, err := modelMeta.Adapter.GenerateText(ctx, modelMeta.ModelName, uaipReq)
	if err != nil {
		http.Error(w, "Query execution failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"model_id":    req.ModelID,
		"model_name":  modelMeta.DisplayName,
		"response":    resp.Result.Data,
		"tokens_used": resp.Result.TokensUsed,
		"cost":        resp.Metadata.CostInfo.TotalCost,
		"latency_ms":  resp.Result.ProcessingMs,
		"quality":     resp.Result.Quality,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ============================================================================
// Authentication Handlers
// ============================================================================

func handleSignUp(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if database is available
	if !dbAvailable || authAPI == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "Authentication service is currently unavailable (database not connected)",
			"success": false,
		})
		return
	}

	var req auth.SignUpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	resp, err := authAPI.SignUp(r.Context(), req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleRecoverPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !dbAvailable || authAPI == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "Authentication service unavailable", "success": false})
		return
	}
	var req struct {
		Email      string `json:"email"`
		RedirectTo string `json:"redirect_to"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		http.Error(w, "Invalid JSON or missing email", http.StatusBadRequest)
		return
	}
	redirectTo := req.RedirectTo
	if redirectTo == "" {
		redirectTo = "/reset-password"
	}
	if err := authAPI.RecoverPassword(r.Context(), req.Email, redirectTo); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "If an account exists, a recovery email was sent."})
}

func handleUpdatePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if authAPI == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "Authentication service unavailable", "success": false})
		return
	}
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		http.Error(w, "Authorization Bearer token required", http.StatusUnauthorized)
		return
	}
	token := strings.TrimPrefix(authHeader, "Bearer ")
	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" {
		http.Error(w, "Invalid JSON or missing password", http.StatusBadRequest)
		return
	}
	if err := authAPI.UpdatePassword(r.Context(), token, req.Password); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Password updated."})
}

func handleSignIn(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if database is available
	if !dbAvailable || authAPI == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "Authentication service is currently unavailable (database not connected)",
			"success": false,
		})
		return
	}

	var req auth.SignInRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	resp, err := authAPI.SignIn(r.Context(), req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleSignOut(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if database is available
	if !dbAvailable || authAPI == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "Authentication service is currently unavailable (database not connected)",
			"success": false,
		})
		return
	}

	user, err := auth.RequireAuth(r.Context())
	if err != nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Get token from header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		http.Error(w, "Authorization header required", http.StatusUnauthorized)
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		http.Error(w, "Invalid authorization header", http.StatusUnauthorized)
		return
	}

	err = authAPI.SignOut(r.Context(), parts[1])
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"message": "Signed out successfully",
		"user_id": user.ID,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleGetSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if database is available FIRST - before checking auth
	if !dbAvailable || authAPI == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "Authentication service is currently unavailable (database not connected)",
			"success": false,
		})
		return
	}

	// Now check auth - only if database is available
	user, err := auth.RequireAuth(r.Context())
	if err != nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Try to get full user info from Supabase API
	authHeader := r.Header.Get("Authorization")
	var userInfo *auth.UserInfo
	if authHeader != "" && authAPI != nil {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && parts[0] == "Bearer" {
			// Fetch full user info from Supabase
			if fullUser, err := authAPI.GetUser(r.Context(), parts[1]); err == nil {
				userInfo = fullUser
			}
		}
	}

	// Build response with available data
	responseUser := map[string]interface{}{
		"id":        user.ID,
		"email":     user.Email,
		"tenant_id": user.TenantID,
		"org_id":    user.OrgID,
	}

	// Add fields from full user info if available
	if userInfo != nil {
		responseUser["created_at"] = userInfo.CreatedAt
		responseUser["user_metadata"] = userInfo.UserMetadata
	} else {
		// Fallback to JWT claims
		userMetadata := make(map[string]interface{})
		var createdAt string

		if user.Claims != nil {
			if metadata, ok := user.Claims["user_metadata"].(map[string]interface{}); ok {
				userMetadata = metadata
			}
			if created, ok := user.Claims["created_at"].(string); ok {
				createdAt = created
			}
		}
		responseUser["created_at"] = createdAt
		responseUser["user_metadata"] = userMetadata
	}

	response := map[string]interface{}{
		"user": responseUser,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleRefreshToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if database is available
	if !dbAvailable || authAPI == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "Authentication service is currently unavailable (database not connected)",
			"success": false,
		})
		return
	}

	var req struct {
		RefreshToken string `json:"refresh_token"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	session, err := authAPI.RefreshToken(r.Context(), req.RefreshToken)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	response := map[string]interface{}{
		"access_token":  session.AccessToken,
		"refresh_token": session.RefreshToken,
		"expires_in":    session.ExpiresIn,
		"token_type":    session.TokenType,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleGetUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if database is available FIRST - before checking auth
	if !dbAvailable || authAPI == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "Authentication service is currently unavailable (database not connected)",
			"success": false,
		})
		return
	}

	// Now check auth - only if database is available
	user, err := auth.RequireAuth(r.Context())
	if err != nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Try to get full user info from Supabase API
	authHeader := r.Header.Get("Authorization")
	var userInfo *auth.UserInfo
	if authHeader != "" && authAPI != nil {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && parts[0] == "Bearer" {
			// Fetch full user info from Supabase
			if fullUser, err := authAPI.GetUser(r.Context(), parts[1]); err == nil {
				userInfo = fullUser
			}
		}
	}

	// Build response with available data
	responseUser := map[string]interface{}{
		"id":        user.ID,
		"email":     user.Email,
		"tenant_id": user.TenantID,
		"org_id":    user.OrgID,
	}

	// Add fields from full user info if available
	if userInfo != nil {
		responseUser["created_at"] = userInfo.CreatedAt
		responseUser["user_metadata"] = userInfo.UserMetadata
	} else {
		// Fallback to JWT claims
		userMetadata := make(map[string]interface{})
		var createdAt string

		if user.Claims != nil {
			if metadata, ok := user.Claims["user_metadata"].(map[string]interface{}); ok {
				userMetadata = metadata
			}
			if created, ok := user.Claims["created_at"].(string); ok {
				createdAt = created
			}
		}
		responseUser["created_at"] = createdAt
		responseUser["user_metadata"] = userMetadata
	}

	response := map[string]interface{}{
		"user": responseUser,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ============================================================================
// Reasoning Handlers
// ============================================================================

func handleReasoningStart(w http.ResponseWriter, r *http.Request) {
	reasoningAPI.HandleStartReasoning(w, r)
}

func handleReasoningStatus(w http.ResponseWriter, r *http.Request) {
	reasoningAPI.HandleGetStatus(w, r)
}

func handleReasoningWebSocket(w http.ResponseWriter, r *http.Request) {
	reasoningAPI.HandleWebSocket(w, r)
}

func handleMonitoringStats(w http.ResponseWriter, r *http.Request) {
	reasoningAPI.HandleGetStats(w, r)
}

// ============================================================================
// World Model Routes (NEW)
// ============================================================================

// Get all facts from world model
func handleWorldModelFacts(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	facts := worldModel.ListAll()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"facts": facts,
		"count": len(facts),
	})
}

// Store a fact manually
func handleWorldModelStore(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Key       string `json:"key"`
		Value     string `json:"value"`
		Source    string `json:"source"`
		SessionID string `json:"session_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	err := worldModel.Store(r.Context(), req.Key, req.Value, req.Source, req.SessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Fact stored successfully",
	})
}

// Search world model
func handleWorldModelSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "Query parameter 'q' is required", http.StatusBadRequest)
		return
	}

	facts := worldModel.Search(r.Context(), query, 10)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"query": query,
		"facts": facts,
		"count": len(facts),
	})
}

// Handle multi-agent workflow
func handleAgentWorkflow(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Prompt string `json:"prompt"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Create session
	sessionID := reasoningAPI.Engine.InitSession(r.Context(), req.Prompt)

	// Create simple workflow with world model (NEW: pass worldModel)
	workflow := reasoning.NewSimpleAgentWorkflow(reasoningAPI.Engine.Orchestrator.Router, sessionID, worldModel)
	workflow.OnEvent = reasoningAPI.BroadcastEvent

	// Execute workflow synchronously (caller can use WS for events)
	result, err := workflow.Execute(r.Context(), req.Prompt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Return result
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"session_id":   sessionID,
		"final_output": result.FinalOutput,
		"steps":        result.Steps,
		"duration_ms":  result.Duration.Milliseconds(),
		"agent_count":  len(result.Steps),
	})
}

// ============================================================================
// Dummy Adapter (for HuggingFace fallback)
// ============================================================================

type DummyAdapter struct{}

func (d *DummyAdapter) Name() string                      { return "dummy" }
func (d *DummyAdapter) Provider() string                  { return "dummy" }
func (d *DummyAdapter) SupportedTasks() []models.TaskType { return []models.TaskType{} }
func (d *DummyAdapter) RequiresAuth() bool                { return false }
func (d *DummyAdapter) GetCapabilities() models.ModelCapabilities {
	return models.ModelCapabilities{}
}
func (d *DummyAdapter) GetCost() models.CostInfo {
	return models.CostInfo{}
}
func (d *DummyAdapter) HealthCheck() error { return nil }
func (d *DummyAdapter) GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error) {
	return nil, fmt.Errorf("dummy adapter cannot generate text")
}
