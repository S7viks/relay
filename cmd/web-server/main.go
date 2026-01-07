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
	dbClient     *database.Client
	dbAvailable  bool
	authAPI      *auth.AuthAPI
	reasoningAPI *reasoning.ReasoningAPI
	metrics      *monitoring.MetricsService
)

func main() {
	// Load environment variables
	if err := loadEnv(); err != nil {
		log.Printf("Warning: Failed to load .env file: %v", err)
	}

	// Initialize adapters
	openRouterKey := os.Getenv("OPENROUTER_API_KEY")
	hfKey := os.Getenv("HUGGINGFACE_API_KEY")

	if openRouterKey == "" {
		log.Fatal("❌ OPENROUTER_API_KEY is required")
	}

	var orAdapter, hfAdapter models.ModelAdapter
	orAdapter = adapters.NewOpenRouterAdapter("", openRouterKey)
	log.Println("✅ OpenRouter adapter initialized")

	if hfKey != "" {
		hfAdapter = adapters.NewHuggingFaceAdapter("", hfKey)
		log.Println("✅ HuggingFace adapter initialized")
	} else {
		// Use dummy adapter if HF not available
		hfAdapter = &DummyAdapter{}
	}

	// Create registry
	registry = models.NewRegistry(orAdapter, hfAdapter)
	log.Printf("📋 Registry initialized with %d models", registry.Count())

	// Initialize database (optional)
	var tracker *models.PerformanceTracker
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
	http.HandleFunc("/", noCacheFileServer)
	http.HandleFunc("/health", handleHealth)

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

	// 4. Query Routes (auth optional - works with or without database)
	// If database is available, use auth middleware (but make it optional)
	// If database is not available, allow queries without auth
	if dbAvailable && authAPI != nil {
		// Use auth middleware but make it optional (allow requests without auth)
		authMiddleware := auth.AuthMiddleware(dbClient)
		http.Handle("/api/query", optionalAuthMiddleware(authMiddleware, cors(handleQuery)))
		http.Handle("/api/query/smart", optionalAuthMiddleware(authMiddleware, cors(handleQuerySmart)))
		http.Handle("/api/query/model", optionalAuthMiddleware(authMiddleware, cors(handleQueryModel)))
	} else {
		// No database: allow queries without auth
		http.HandleFunc("/api/query", cors(handleQuery))
		http.HandleFunc("/api/query/smart", cors(handleQuerySmart))
		http.HandleFunc("/api/query/model", cors(handleQueryModel))
	}

	// 5. Reasoning Routes
	http.HandleFunc("/api/reasoning/start", cors(handleReasoningStart))
	http.HandleFunc("/api/reasoning/status/", cors(handleReasoningStatus))
	http.HandleFunc("/api/reasoning/ws", cors(handleReasoningWebSocket))
	http.HandleFunc("/api/monitoring/stats", cors(handleMonitoringStats))
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
// File Server (no cache)
// ============================================================================

func noCacheFileServer(w http.ResponseWriter, r *http.Request) {
	// Disable caching
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// Handle root path - serve index.html directly without redirect
	if r.URL.Path == "/" || r.URL.Path == "" {
		file, err := os.Open("./web/index.html")
		if err != nil {
			http.Error(w, "index.html not found", http.StatusNotFound)
			return
		}
		defer file.Close()

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		http.ServeContent(w, r, "index.html", time.Time{}, file)
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

	// Check if reasoning API is initialized
	if reasoningAPI == nil || reasoningAPI.Engine == nil {
		log.Printf("❌ Reasoning API or Engine is nil")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "Reasoning engine not initialized",
			"success": false,
		})
		return
	}

	// Use reasoning engine for ALL queries now
	// The reasoning engine will automatically use single-step fallback for simple queries
	sessionID := reasoningAPI.Engine.InitSession(r.Context(), req.Prompt)

	log.Printf("🧠 Starting reasoning session: %s", sessionID)

	// Execute reasoning with automatic fallback
	sm, err := reasoningAPI.Engine.RunSession(r.Context(), sessionID, req.Prompt, []string{})
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
	if sm != nil && len(sm.SelectedPath) > 0 {
		// Get the last output from the selected path
		lastOutput := sm.SelectedPath[len(sm.SelectedPath)-1]
		finalOutput = lastOutput.Response
	}

	if finalOutput == "" {
		finalOutput = "The reasoning engine completed but produced no output."
	}

	log.Printf("✅ Reasoning completed successfully")

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
