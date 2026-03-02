package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"gaiol/internal/auth"
	"gaiol/internal/database"
	"gaiol/internal/keys"
	"gaiol/internal/models"
	"gaiol/internal/models/adapters"
	"gaiol/internal/monitoring"
	"gaiol/internal/reasoning"
	"gaiol/internal/uaip"

	"github.com/joho/godotenv"
)

var (
	registry     *models.Registry
	router       *models.ModelRouter
	tracker      *models.PerformanceTracker
	dbClient     *database.Client
	dbAvailable  bool
	authAPI      *auth.AuthAPI
	reasoningAPI *reasoning.ReasoningAPI
	worldModel   *reasoning.WorldModel
	metrics      *monitoring.MetricsService
)

func main() {
	// Load environment variables
	if err := loadEnv(); err != nil {
		log.Printf("Warning: Failed to load .env file: %v", err)
	}

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

	// 2. HuggingFace and 3. OpenRouter: no env keys for tenant-facing API (Phase 4).
	// Tenant inference uses provider keys from DB only. Empty adapters here for fallback when DB/keys unavailable.
	hfAdapter := adapters.NewHuggingFaceAdapter("", "")
	openRouterAdapter := adapters.NewOpenRouterAdapter("", "")
	fmt.Println("✅ HuggingFace and OpenRouter adapters initialized (tenant keys from DB)")

	// Create registry with priority: Ollama > HF > OpenRouter
	registry = models.NewRegistry(openRouterAdapter, hfAdapter, ollamaAdapter)
	fmt.Printf("📋 Registry initialized with %d models\n", registry.Count())

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

	server := &http.Server{
		Addr:         ":" + port,
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
	http.HandleFunc("/dashboard", serveStaticPage("dashboard.html"))
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
		http.Handle("/api/gaiol-keys", reqAuth(cors(handleGAIOLKeys)))
		http.Handle("/api/gaiol-keys/", reqAuth(cors(handleGAIOLKeysID)))
	}
	// 9. Unified inference by GAIOL key only (no JWT)
	http.Handle("/v1/chat", cors(handleV1Chat))
}

// ============================================================================
// CORS Middleware
// ============================================================================

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
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

// logUsageToAPIQueries inserts a row into api_queries for usage/billing. Best-effort; errors are logged only.
func logUsageToAPIQueries(db *database.Client, tenant database.TenantContext, modelID string, tokensUsed int, cost float64, processingMs int, success bool, errMsg string) error {
	if db == nil || db.Client == nil {
		return nil
	}
	row := map[string]interface{}{
		"tenant_id":          tenant.TenantID,
		"organization_id":   tenant.OrgID,
		"user_id":           tenant.UserID,
		"model_id":          modelID,
		"tokens_used":       tokensUsed,
		"cost":               cost,
		"processing_time_ms": processingMs,
		"success":           success,
		"error_message":     errMsg,
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
		providerKeys, loadErr := keys.LoadProviderKeysForTenant(r.Context(), dbClient, tenantCtx.TenantID)
		if loadErr != nil {
			log.Printf("❌ Load provider keys: %v", loadErr)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Failed to load provider keys", "success": false})
			return
		}
		tenantReg, tenantRouter := buildRegistryFromKeys(providerKeys, tracker)
		if tenantReg == nil || tenantRouter == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":   "Add provider API keys in Dashboard Settings (OpenRouter, Google, or HuggingFace) to use the reasoning engine.",
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
		_ = logUsageToAPIQueries(dbClient, tenantCtx, "reasoning-engine", 0, cost, 0, true, "")
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
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"key_hint": hint})
	case http.MethodDelete:
		provider := r.URL.Query().Get("provider")
		if provider == "" {
			http.Error(w, "provider query required", http.StatusBadRequest)
			return
		}
		if err := keys.DeleteProviderKey(r.Context(), dbClient, tenantCtx.TenantID, provider); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
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
		var body struct {
			Name string `json:"name"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		rawKey, err := keys.CreateGAIOLKey(r.Context(), dbClient, tenantCtx.TenantID, body.Name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
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
	id := strings.TrimPrefix(r.URL.Path, "/api/gaiol-keys/")
	if id == "" {
		http.Error(w, "key id required", http.StatusBadRequest)
		return
	}
	if err := keys.RevokeGAIOLKey(r.Context(), dbClient, tenantCtx.TenantID, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
	tenantID, err := keys.ValidateGAIOLKey(r.Context(), dbClient, rawToken)
	if err != nil || dbClient == nil {
		http.Error(w, "Invalid or expired API key", http.StatusUnauthorized)
		return
	}
	providerKeys, loadErr := keys.LoadProviderKeysForTenant(r.Context(), dbClient, tenantID)
	if loadErr != nil {
		http.Error(w, "Failed to load provider keys", http.StatusInternalServerError)
		return
	}
	tenantReg, tenantRouter := buildRegistryFromKeys(providerKeys, tracker)
	if tenantReg == nil || tenantRouter == nil {
		http.Error(w, "No provider keys configured for this tenant", http.StatusBadRequest)
		return
	}
	engine := reasoning.NewReasoningEngine(tenantRouter)
	var body struct {
		Prompt      string  `json:"prompt"`
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
	sessionID := engine.InitSession(r.Context(), body.Prompt)
	sm, err := engine.RunSession(r.Context(), sessionID, body.Prompt, []string{})
	if err != nil {
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
	tenantCtx := database.TenantContext{TenantID: tenantID, UserID: "", OrgID: ""}
	cost := 0.0
	if sm != nil {
		cost = sm.TotalCost
	}
	_ = logUsageToAPIQueries(dbClient, tenantCtx, "reasoning-engine", 0, cost, 0, true, "")
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
