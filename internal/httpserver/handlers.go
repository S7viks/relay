package httpserver

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"gaiol/internal/apijson"
	"gaiol/internal/auth"
	"gaiol/internal/database"
	"gaiol/internal/gaiol/modelresolve"
	"gaiol/internal/keys"
	"gaiol/internal/models"
	"gaiol/internal/models/adapters"
	"gaiol/internal/reasoning"
	"gaiol/internal/uaip"
)

const maxJSONBodyBytes = 1 << 20
const maxChatTokens = 128000

func clampChatMaxTokens(n int) int {
	if n < 0 {
		return 0
	}
	if n > maxChatTokens {
		return maxChatTokens
	}
	return n
}

func clampTemperature(t float64) float64 {
	if t < 0 {
		return 0
	}
	if t > 2 {
		return 2
	}
	return t
}

// corsMiddleware wraps http.Handler so it can be applied outside auth (CORS headers on errors and OPTIONS).
func (d *Deps) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		// fetch() uses credentials: 'include' in web/js/api.js and dashboard/src/lib/api.ts. Browsers reject
		// Access-Control-Allow-Origin: * together with credentialed requests.
		// Echo a specific origin and set Allow-Credentials when Origin is present.
		allowOrigin := ""
		if origin != "" {
			if d.AllowedOrigins != nil {
				if _, ok := d.AllowedOrigins[origin]; ok {
					allowOrigin = origin
				}
			} else {
				// Dev / single-app: reflect caller origin. For strict production, set ALLOWED_ORIGINS.
				allowOrigin = origin
			}
		}
		if allowOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowOrigin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		} else if d.AllowedOrigins == nil && origin == "" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "3600")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
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

// Hijack implements http.Hijacker so WebSocket upgrade can take over the connection.
func (r *responseRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if h, ok := r.ResponseWriter.(http.Hijacker); ok {
		return h.Hijack()
	}
	return nil, nil, fmt.Errorf("response writer does not support hijacking")
}

// localTenantMiddleware injects a synthetic "local" tenant and user into every
// request context so downstream handlers that call GetTenantFromContext or
// RequireAuth work without a real database or JWT.
// LocalTenantMiddleware injects a synthetic tenant/user for no-auth mode.
func (d *Deps) LocalTenantMiddleware(next http.Handler) http.Handler {
	localTenant := database.TenantContext{
		TenantID: "local",
		UserID:   "local",
		OrgID:    "local",
		Role:     "owner",
	}
	localUser := &auth.User{
		ID:       "local",
		Email:    "local@localhost",
		TenantID: "local",
		OrgID:    "local",
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		ctx = database.WithTenant(ctx, localTenant)
		ctx = auth.WithUser(ctx, localUser)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// skipNoiseHTTPLog suppresses 404 spam from browsers (Chrome DevTools, favicon probes, etc.).
func skipNoiseHTTPLog(path string, status int) bool {
	if status != http.StatusNotFound {
		return false
	}
	if strings.HasPrefix(path, "/.well-known/") {
		return true
	}
	switch path {
	case "/favicon.ico", "/robots.txt":
		return true
	default:
		return false
	}
}

// requestLogMiddleware logs one line per request for log aggregators.
// RequestLogMiddleware logs one line per request.
func (d *Deps) RequestLogMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		dur := time.Since(start).Milliseconds()
		if d.LogLevel == "debug" {
			log.Printf("request method=%s path=%s status=%d duration_ms=%d size=%d", r.Method, r.URL.Path, rec.status, dur, rec.size)
		} else if rec.status >= 500 || (rec.status >= 400 && r.URL.Path != "/health" && !skipNoiseHTTPLog(r.URL.Path, rec.status)) {
			log.Printf("request method=%s path=%s status=%d duration_ms=%d", r.Method, r.URL.Path, rec.status, dur)
		}
	})
}

// optionalAuthMiddleware wraps auth middleware but allows requests without auth to pass through
func (d *Deps) optionalAuthMiddleware(authMiddleware func(http.Handler) http.Handler, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		_, cookieErr := r.Cookie("sb-access-token")

		if authHeader == "" && cookieErr != nil {
			next.ServeHTTP(w, r)
			return
		}

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

const reactDashboardIndex = "dashboard/dist/index.html"

// serveReactDashboardAssets serves hashed JS/CSS from the Vite build (base /dashboard/).
func serveReactDashboardAssets(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	http.StripPrefix("/dashboard", http.FileServer(http.Dir("dashboard/dist"))).ServeHTTP(w, r)
}

// serveReactDashboardSPA serves the Vite React app for /dashboard and client routes under /dashboard/*.
func serveReactDashboardSPA(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	rel := strings.TrimPrefix(r.URL.Path, "/dashboard")
	rel = strings.Trim(rel, "/")
	if rel != "" && !strings.Contains(rel, "..") {
		candidate := filepath.Join("dashboard", "dist", filepath.FromSlash(rel))
		if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			http.ServeFile(w, r, candidate)
			return
		}
	}
	f, err := os.Open(reactDashboardIndex)
	if err != nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>GAIOL Dashboard</title></head><body style="font-family:system-ui;padding:2rem;max-width:40rem"><h1>Dashboard build missing</h1><p>Run <code>cd dashboard &amp;&amp; npm install &amp;&amp; npm run build</code> to generate <code>dashboard/dist/</code>, then restart the server.</p><p><a href="/">Home</a></p></body></html>`))
		return
	}
	defer f.Close()
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	http.ServeContent(w, r, "index.html", time.Time{}, f)
}

func redirectDashboardSlash(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/dashboard" {
		http.Redirect(w, r, "/dashboard/", http.StatusMovedPermanently)
		return
	}
	http.NotFound(w, r)
}

// ============================================================================
// File Server (no cache)
// ============================================================================

func noCacheFileServer(w http.ResponseWriter, r *http.Request) {
	// Disable caching
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// Root is the public landing page; chat UI is served at /chat (see register.go).
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

func (d *Deps) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	health := map[string]interface{}{
		"status":        "healthy",
		"models":        d.Registry.Count(),
		"version":       "1.0.0",
		"time":          time.Now().Format(time.RFC3339),
		"auth_disabled": d.AuthDisabled,
	}

	dbPayload := map[string]interface{}{
		"connected": d.DBAvailable,
	}
	if d.DB != nil {
		pingCtx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
		err := d.DB.PingREST(pingCtx)
		cancel()
		dbPayload["reachable"] = err == nil
		if err != nil {
			dbPayload["ping_error"] = err.Error()
		}
	} else {
		dbPayload["reachable"] = false
	}
	health["database"] = dbPayload

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)
}

// ============================================================================
// Model Listing Handlers
// ============================================================================

func (d *Deps) handleListModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	models := d.Registry.ListModels()
	response := map[string]interface{}{
		"models": convertModelsToJSON(models),
		"count":  len(models),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (d *Deps) handleListFreeModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	freeModels := d.Registry.FindFreeModels()
	response := map[string]interface{}{
		"models": convertModelsToJSON(freeModels),
		"count":  len(freeModels),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (d *Deps) handleModelsByProvider(w http.ResponseWriter, r *http.Request) {
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

	models := d.Registry.FindModelsByProvider(provider)
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
		"tenant_id":          tenant.TenantID,
		"organization_id":    tenant.OrgID,
		"user_id":            tenant.UserID,
		"model_id":           modelID,
		"tokens_used":        tokensUsed,
		"cost":               cost,
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

// buildRegistryFromKeys builds a model d.Registry and d.Router from tenant provider keys (openrouter, huggingface, google).
// Returns (nil, nil) if no keys are present. Caller must not use env provider keys for tenant inference.
func buildRegistryFromKeys(providerKeys map[string]string, perfTracker *models.PerformanceTracker) (*models.Registry, *models.ModelRouter) {
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
	return reg, models.NewModelRouter(reg, perfTracker)
}

// buildTenantRegistry builds a d.Registry/d.Router for a tenant from:
// - legacy provider keys (provider_api_keys): openrouter, huggingface, google
// - custom providers (tenant_providers): openai-compatible endpoints
// - tenant models (tenant_models): explicit model ids for routing
func buildTenantRegistry(ctx context.Context, db *database.Client, tenantID string, perfTracker *models.PerformanceTracker) (*models.Registry, *models.ModelRouter, error) {
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
					ProviderKey:   parts[0],
					ModelID:       parts[1],
					DisplayName:   "",
					QualityScore:  0.75,
					CostPerToken:  0.0,
					ContextWindow: 0,
					MaxTokens:     0,
					Tags:          []string{"default"},
					IsActive:      true,
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
	return reg, models.NewModelRouter(reg, perfTracker), nil
}

// ============================================================================
// Query Handlers
// ============================================================================

func (d *Deps) handleQuery(w http.ResponseWriter, r *http.Request) {
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

	if !apijson.DecodeJSON(w, r, maxJSONBodyBytes, &req) {
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
	req.MaxTokens = clampChatMaxTokens(req.MaxTokens)
	req.Temperature = clampTemperature(req.Temperature)

	// Execute queries for all requested models
	ctx := r.Context()
	results := make([]map[string]interface{}, 0, len(req.Models))

	for _, modelID := range req.Models {
		modelMeta, err := modelresolve.LookupRegisteredModel(d.Registry, modelID)
		if err != nil {
			results = append(results, map[string]interface{}{
				"model_id": modelID,
				"error":    "Model not found: " + err.Error(),
			})
			continue
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

func (d *Deps) handleQuerySmart(w http.ResponseWriter, r *http.Request) {
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

	if !apijson.DecodeJSON(w, r, maxJSONBodyBytes, &req) {
		return
	}

	log.Printf("📋 Query request - Prompt: %q, Strategy: %s, Task: %s", req.Prompt, req.Strategy, req.Task)

	if req.Prompt == "" {
		log.Printf("❌ Empty prompt")
		http.Error(w, "prompt is required", http.StatusBadRequest)
		return
	}
	if req.MaxTokens == 0 {
		req.MaxTokens = 300
	}
	if req.Temperature == 0 {
		req.Temperature = 0.7
	}
	req.MaxTokens = clampChatMaxTokens(req.MaxTokens)
	req.Temperature = clampTemperature(req.Temperature)

	var tenantCtx database.TenantContext
	if !d.AuthDisabled {
		tc, err := database.EnsureTenantContext(r.Context())
		if err != nil {
			apijson.WriteError(w, http.StatusUnauthorized, "Unauthorized", "no_tenant")
			return
		}
		tenantCtx = tc
	} else {
		tenantCtx, _ = database.GetTenantFromContext(r.Context())
	}

	if d.tryQuerySmartViaTSOrchestrator(w, r, req.Prompt, req.Task, req.Strategy, req.MaxTokens, req.Temperature, tenantCtx) {
		return
	}

	// Local no-auth mode convenience: fail fast with a helpful message when no models are configured.
	if d.AuthDisabled && (d.Registry == nil || d.Registry.Count() == 0) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "No models configured. Add provider keys in Settings (Dashboard > Models), or in no-auth mode add OPENROUTER_API_KEY (or GEMINI_API_KEY) to .env and restart.",
			"success": false,
		})
		return
	}

	// Tenant-scoped inference when auth+DB; local router when no-auth mode
	var engine *reasoning.ReasoningEngine
	if !d.AuthDisabled {
		tenantReg, tenantRouter, buildErr := buildTenantRegistry(r.Context(), d.DB, tenantCtx.TenantID, d.Tracker)
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
		engine = d.ReasoningAPI.Engine
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

	totalCost := 0.0
	stepsExecuted := 0
	if sm != nil {
		totalCost = sm.TotalCost
		stepsExecuted = len(sm.Steps)
	}

	// Usage logging (Phase 4)
	if d.DB != nil && tenantCtx.TenantID != "" {
		_ = logUsageToAPIQueries(d.DB, tenantCtx, "reasoning-engine", 0, totalCost, 0, true, "", "")
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
				"total_cost": totalCost,
			},
			"session_id":     sessionID,
			"steps_executed": stepsExecuted,
		},
		// Legacy format for backward compatibility
		"model_id":    "reasoning-engine",
		"model_name":  "GAIOL Reasoning Engine",
		"response":    finalOutput,
		"tokens_used": 0,
		"cost":        totalCost,
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

// mergeAutoProvisionGAIOLJSON appends one-shot gaiol_api_key fields when the tenant had no GAIOL keys.
// Logs and swallows errors so provider save still succeeds.
func (d *Deps) mergeAutoProvisionGAIOLJSON(ctx context.Context, tenantCtx database.TenantContext, source string, resp map[string]interface{}) {
	if d.DB == nil || resp == nil {
		return
	}
	raw, created, err := keys.EnsureDefaultGAIOLKeyIfNone(ctx, d.DB, tenantCtx.TenantID)
	if err != nil {
		log.Printf("EnsureDefaultGAIOLKeyIfNone (source=%s tenant=%s): %v", source, tenantCtx.TenantID, err)
		return
	}
	if !created {
		return
	}
	resp["gaiol_api_key"] = raw
	resp["gaiol_api_key_created"] = true
	resp["gaiol_api_key_message"] = "GAIOL API key created automatically. Show once and store securely; use as Authorization: Bearer for /v1/chat."
	_ = d.DB.InsertAuditLog(ctx, tenantCtx.TenantID, tenantCtx.UserID, "gaiol_key_auto_provisioned", map[string]interface{}{"source": source})
}

func (d *Deps) handleProviderKeys(w http.ResponseWriter, r *http.Request) {
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || d.DB == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := keys.ListProviderKeys(r.Context(), d.DB, tenantCtx.TenantID)
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
		hint, err := keys.StoreProviderKey(r.Context(), d.DB, tenantCtx.TenantID, body.Provider, body.APIKey)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = d.DB.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "provider_key_added", map[string]interface{}{"provider": body.Provider})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		resp := map[string]interface{}{"key_hint": hint}
		d.mergeAutoProvisionGAIOLJSON(r.Context(), tenantCtx, "provider_api_key", resp)
		json.NewEncoder(w).Encode(resp)
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
		if err := keys.DeleteProviderKey(r.Context(), d.DB, tenantCtx.TenantID, provider); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = d.DB.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "provider_key_removed", map[string]interface{}{"provider": provider})
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Universal provider endpoints (tenant-configurable).
// Provider keys are stored encrypted in tenant_providers; models are registered in tenant_models.
func (d *Deps) handleCustomProviders(w http.ResponseWriter, r *http.Request) {
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || d.DB == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := keys.ListCustomProviders(r.Context(), d.DB, tenantCtx.TenantID)
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
		hint, err := keys.StoreCustomProvider(r.Context(), d.DB, tenantCtx.TenantID, body.ProviderKey, body.ProviderType, body.BaseURL, body.APIKey, body.AuthHeader, body.AuthScheme)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = d.DB.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "custom_provider_saved", map[string]interface{}{"provider_key": body.ProviderKey})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		resp := map[string]interface{}{"key_hint": hint}
		d.mergeAutoProvisionGAIOLJSON(r.Context(), tenantCtx, "tenant_provider", resp)
		json.NewEncoder(w).Encode(resp)
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
		if err := keys.DeleteCustomProvider(r.Context(), d.DB, tenantCtx.TenantID, providerKey); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = d.DB.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "custom_provider_deleted", map[string]interface{}{"provider_key": providerKey})
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (d *Deps) handleTenantModelsSettings(w http.ResponseWriter, r *http.Request) {
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || d.DB == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := keys.ListTenantModels(r.Context(), d.DB, tenantCtx.TenantID)
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
			ProviderKey   string   `json:"provider_key"`
			ModelID       string   `json:"model_id"`
			DisplayName   string   `json:"display_name"`
			QualityScore  *float64 `json:"quality_score"`
			CostPerToken  *float64 `json:"cost_per_token"`
			ContextWindow *int     `json:"context_window"`
			MaxTokens     *int     `json:"max_tokens"`
			Tags          []string `json:"tags"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if err := keys.UpsertTenantModel(r.Context(), d.DB, tenantCtx.TenantID, body.ProviderKey, body.ModelID, body.DisplayName, body.QualityScore, body.CostPerToken, body.ContextWindow, body.MaxTokens, body.Tags); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = d.DB.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "tenant_model_saved", map[string]interface{}{"provider_key": body.ProviderKey, "model_id": body.ModelID})
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
		if err := keys.DeleteTenantModel(r.Context(), d.DB, tenantCtx.TenantID, providerKey, modelID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = d.DB.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "tenant_model_deleted", map[string]interface{}{"provider_key": providerKey, "model_id": modelID})
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (d *Deps) handleGAIOLKeys(w http.ResponseWriter, r *http.Request) {
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || d.DB == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := keys.ListGAIOLKeys(r.Context(), d.DB, tenantCtx.TenantID)
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
		rawKey, err := keys.CreateGAIOLKey(r.Context(), d.DB, tenantCtx.TenantID, body.Name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = d.DB.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "gaiol_key_created", map[string]interface{}{"name": body.Name})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"api_key": rawKey, "message": "Show once; store securely"})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (d *Deps) handleGAIOLKeysID(w http.ResponseWriter, r *http.Request) {
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || d.DB == nil {
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
	if err := keys.RevokeGAIOLKey(r.Context(), d.DB, tenantCtx.TenantID, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = d.DB.InsertAuditLog(r.Context(), tenantCtx.TenantID, tenantCtx.UserID, "gaiol_key_revoked", map[string]interface{}{"key_id": id})
	w.WriteHeader(http.StatusNoContent)
}

func (d *Deps) handleActivity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || d.DB == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	limit := 50
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	entries, err := d.DB.GetAuditLogForTenant(r.Context(), tenantCtx.TenantID, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"activity": entries})
}

func (d *Deps) handlePreferences(w http.ResponseWriter, r *http.Request) {
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || d.DB == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		s, err := d.DB.GetTenantSettings(r.Context(), tenantCtx.TenantID)
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
		s, _ := d.DB.GetTenantSettings(r.Context(), tenantCtx.TenantID)
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
		if err := d.DB.UpsertTenantSettings(r.Context(), s); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (d *Deps) handleUsage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || d.DB == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	from, to := parseUsageRange(r)
	rows, err := d.DB.GetUsageForTenant(r.Context(), tenantCtx.TenantID, from, to)
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
	keyList, _ := keys.ListGAIOLKeys(r.Context(), d.DB, tenantCtx.TenantID)
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

func (d *Deps) handleUsageExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || d.DB == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	from, to := parseUsageRange(r)
	rows, err := d.DB.GetUsageForTenant(r.Context(), tenantCtx.TenantID, from, to)
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

func (d *Deps) handleBillingSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || d.DB == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	rows, err := d.DB.GetUsageForTenant(r.Context(), tenantCtx.TenantID, &start, &now)
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
		"period":      start.Format("2006-01"),
		"total_cost":  totalCost,
		"by_provider": byProviderList,
	})
}

func (d *Deps) handleTenantModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || d.DB == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	tenantReg, _, buildErr := buildTenantRegistry(r.Context(), d.DB, tenantCtx.TenantID, d.Tracker)
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
	list := convertModelsToJSON(models)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"models": list, "count": len(list)})
}

// no-auth stubs for dashboard/settings when DB is not available (local mode).
// Return shapes expected by the frontend so dashboard and models pages render.

func (d *Deps) noAuthHandleProviderKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{})
}

func (d *Deps) noAuthHandleCustomProviders(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"providers": []interface{}{}})
	case http.MethodPost, http.MethodDelete:
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "API and model management are not available in local no-auth mode. Set provider keys in .env (e.g. OPENROUTER_API_KEY, GEMINI_API_KEY) and restart."})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (d *Deps) noAuthHandleTenantModelsSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"models": []interface{}{}})
	case http.MethodPost, http.MethodDelete:
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Model management is not available in local no-auth mode. Models are loaded from .env provider keys."})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (d *Deps) noAuthHandleGAIOLKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode([]interface{}{})
}

func (d *Deps) noAuthHandleGAIOLKeysID(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodDelete {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func (d *Deps) noAuthHandleUsage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"summary":     map[string]interface{}{"requests": 0, "tokens": 0, "cost": 0.0},
		"by_day":      []interface{}{},
		"by_provider": []interface{}{},
		"by_key":      []interface{}{},
	})
}

func (d *Deps) noAuthHandleUsageExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/csv")
	w.Write([]byte("date,requests,tokens,cost\n"))
}

func (d *Deps) noAuthHandleBillingSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"period":      time.Now().Format("2006-01"),
		"total_cost":  0.0,
		"by_provider": []interface{}{},
	})
}

func (d *Deps) noAuthHandleBillingHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"history": []interface{}{}})
}

func (d *Deps) noAuthHandleTenantModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	list := make([]map[string]interface{}, 0)
	if d.Registry != nil {
		models := d.Registry.ListModels()
		for _, m := range models {
			list = append(list, map[string]interface{}{
				"id":           string(m.ID),
				"display_name": m.DisplayName,
				"provider":     m.Provider,
			})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"models": list, "count": len(list)})
}

func (d *Deps) noAuthHandleActivity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"activity": []interface{}{}})
}

func (d *Deps) noAuthHandlePreferences(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"budget_limit":     nil,
			"default_model_id": "",
			"strategy":         "balanced",
		})
	case http.MethodPut:
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (d *Deps) handleBillingHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tenantCtx, err := database.EnsureTenantContext(r.Context())
	if err != nil || d.DB == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	now := time.Now()
	var history []map[string]interface{}
	for i := 0; i < 6; i++ {
		ref := now.AddDate(0, -i, 0)
		monthStart := time.Date(ref.Year(), ref.Month(), 1, 0, 0, 0, 0, now.Location())
		monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Nanosecond)
		rows, err := d.DB.GetUsageForTenant(r.Context(), tenantCtx.TenantID, &monthStart, &monthEnd)
		if err != nil {
			continue
		}
		var cost float64
		for _, row := range rows {
			cost += row.Cost
		}
		history = append(history, map[string]interface{}{
			"month":      monthStart.Format("2006-01"),
			"total_cost": cost,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"history": history})
}

func (d *Deps) handleV1Chat(w http.ResponseWriter, r *http.Request) {
	if d.AuthDisabled {
		d.handleV1ChatLocal(w, r)
		return
	}
	if r.Method != http.MethodPost {
		apijson.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed", "method_not_allowed")
		return
	}
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		apijson.WriteError(w, http.StatusUnauthorized, "Authorization required", "unauthorized")
		return
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		apijson.WriteError(w, http.StatusUnauthorized, "Invalid Authorization header", "invalid_auth_header")
		return
	}
	rawToken := strings.TrimSpace(parts[1])
	tenantID, gaiolKeyID, err := keys.ValidateGAIOLKey(r.Context(), d.DB, rawToken)
	if err != nil || d.DB == nil {
		apijson.WriteError(w, http.StatusUnauthorized, "Invalid or expired API key", "invalid_api_key")
		return
	}
	// Rate limit: 60 req/min per GAIOL API key
	d.RateLimitMu.Lock()
	if d.RateLimitCount == nil {
		d.RateLimitCount = make(map[string][]time.Time)
	}
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	var kept []time.Time
	for _, t := range d.RateLimitCount[gaiolKeyID] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	kept = append(kept, now)
	d.RateLimitCount[gaiolKeyID] = kept
	if len(kept) > RateLimitPerMin {
		d.RateLimitMu.Unlock()
		w.Header().Set("Retry-After", "60")
		apijson.WriteError(w, http.StatusTooManyRequests, "Rate limit exceeded (60 requests per minute per key)", "rate_limited")
		return
	}
	d.RateLimitMu.Unlock()

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
	if !apijson.DecodeJSON(w, r, maxJSONBodyBytes, &body) {
		return
	}
	if body.Prompt == "" {
		apijson.WriteError(w, http.StatusBadRequest, "prompt is required", "validation_error")
		return
	}
	body.MaxTokens = clampChatMaxTokens(body.MaxTokens)
	body.Temperature = clampTemperature(body.Temperature)
	if body.MaxTokens == 0 {
		body.MaxTokens = 2048
	}

	tenantReg, tenantRouter, buildErr := buildTenantRegistry(r.Context(), d.DB, tenantID, d.Tracker)
	if buildErr != nil {
		apijson.WriteError(w, http.StatusInternalServerError, "Failed to load tenant models/providers", "tenant_registry_error")
		return
	}
	if tenantReg == nil || tenantRouter == nil {
		apijson.WriteError(w, http.StatusBadRequest, "No tenant models/providers configured for this tenant. Add built-in provider keys (Dashboard > Models) or register custom providers/models via /api/settings/providers and /api/settings/models.", "no_tenant_models")
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
			apijson.WriteError(w, http.StatusBadRequest, "Model not registered for this tenant. Add it in Settings > Models.", "model_not_found")
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
		tenantCtx := database.TenantContext{TenantID: tenantID, UserID: "", OrgID: ""}
		_ = logUsageToAPIQueries(d.DB, tenantCtx, requestedModel, resp.Result.TokensUsed, 0.0, resp.Result.ProcessingMs, true, "", gaiolKeyID)
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
		if prefs, _ := d.DB.GetTenantSettings(r.Context(), tenantID); prefs != nil && prefs.Strategy != "" {
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
	tenantCtx := database.TenantContext{TenantID: tenantID, UserID: "", OrgID: ""}
	cost := 0.0
	if sm != nil {
		cost = sm.TotalCost
	}
	_ = logUsageToAPIQueries(d.DB, tenantCtx, "reasoning-engine", 0, cost, 0, true, "", gaiolKeyID)
	log.Printf("v1/chat tenant_id=%s latency_ms=%d success=true", tenantID, time.Since(v1Start).Milliseconds())
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"result":     finalOutput,
		"cost":       cost,
		"session_id": sessionID,
	})
}

func (d *Deps) handleV1ChatLocal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apijson.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed", "method_not_allowed")
		return
	}

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
	if !apijson.DecodeJSON(w, r, maxJSONBodyBytes, &body) {
		return
	}
	body.MaxTokens = clampChatMaxTokens(body.MaxTokens)
	body.Temperature = clampTemperature(body.Temperature)
	if body.MaxTokens == 0 {
		body.MaxTokens = 2048
	}
	if strings.TrimSpace(body.Prompt) == "" {
		http.Error(w, "prompt is required", http.StatusBadRequest)
		return
	}

	requestedModel := strings.TrimSpace(body.ModelID)
	if requestedModel == "" {
		requestedModel = strings.TrimSpace(body.Model)
	}
	if requestedModel != "" && !strings.Contains(requestedModel, ":") && strings.TrimSpace(body.ProviderKey) != "" {
		requestedModel = strings.TrimSpace(strings.ToLower(body.ProviderKey)) + ":" + requestedModel
	}

	if requestedModel != "" {
		meta, err := d.Registry.GetModel(models.ModelID(requestedModel))
		if err != nil {
			http.Error(w, "Model not available. Add provider keys in Settings (Dashboard > Models), or in no-auth mode add keys to .env.", http.StatusBadRequest)
			return
		}

		uaipReq := &uaip.UAIPRequest{
			UAIP: uaip.UAIPHeader{
				Version:   uaip.ProtocolVersion,
				MessageID: fmt.Sprintf("v1-local-%d", time.Now().UnixNano()),
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
			log.Printf("v1/chat local model=%s latency_ms=%d success=false error=%s", requestedModel, time.Since(v1Start).Milliseconds(), err.Error())
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error(), "success": false})
			return
		}

		log.Printf("v1/chat local model=%s latency_ms=%d success=true", requestedModel, time.Since(v1Start).Milliseconds())
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"result":     resp.Result.Data,
			"cost":       resp.Metadata.CostInfo.TotalCost,
			"session_id": "",
			"model_id":   requestedModel,
		})
		return
	}

	engine := reasoning.NewReasoningEngine(d.Router)
	if body.Strategy == "" {
		body.Strategy = "balanced"
	}
	sessionID := engine.InitSession(r.Context(), body.Prompt)
	sm, err := engine.RunSession(r.Context(), sessionID, body.Prompt, []string{})
	if err != nil {
		log.Printf("v1/chat local latency_ms=%d success=false error=%s", time.Since(v1Start).Milliseconds(), err.Error())
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

	log.Printf("v1/chat local latency_ms=%d success=true", time.Since(v1Start).Milliseconds())
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"result":     finalOutput,
		"cost":       cost,
		"session_id": sessionID,
	})
}

func (d *Deps) handleQueryModel(w http.ResponseWriter, r *http.Request) {
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

	if !apijson.DecodeJSON(w, r, maxJSONBodyBytes, &req) {
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
	req.MaxTokens = clampChatMaxTokens(req.MaxTokens)
	req.Temperature = clampTemperature(req.Temperature)

	modelMeta, err := modelresolve.LookupRegisteredModel(d.Registry, req.ModelID)
	if err != nil {
		http.Error(w, "Model not found: "+err.Error(), http.StatusNotFound)
		return
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

func (d *Deps) handleSignUp(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if database is available
	if !d.DBAvailable || d.AuthAPI == nil {
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

	resp, err := d.AuthAPI.SignUp(r.Context(), req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (d *Deps) handleRecoverPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !d.DBAvailable || d.AuthAPI == nil {
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
	if err := d.AuthAPI.RecoverPassword(r.Context(), req.Email, redirectTo); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "If an account exists, a recovery email was sent."})
}

func (d *Deps) handleUpdatePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if d.AuthAPI == nil {
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
	if err := d.AuthAPI.UpdatePassword(r.Context(), token, req.Password); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Password updated."})
}

func (d *Deps) handleSignIn(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if database is available
	if !d.DBAvailable || d.AuthAPI == nil {
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

	resp, err := d.AuthAPI.SignIn(r.Context(), req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (d *Deps) handleSignOut(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if database is available
	if !d.DBAvailable || d.AuthAPI == nil {
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

	err = d.AuthAPI.SignOut(r.Context(), parts[1])
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

func (d *Deps) handleGetSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if database is available FIRST - before checking auth
	if !d.DBAvailable || d.AuthAPI == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "Authentication service is currently unavailable (database not connected)",
			"success": false,
		})
		return
	}

	// No credentials => not logged in (optionalAuth passed through without user in context).
	user, userOK := auth.GetUserFromContext(r.Context())
	if !userOK || user == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"user":          nil,
			"authenticated": false,
		})
		return
	}

	// Try to get full user info from Supabase API
	authHeader := r.Header.Get("Authorization")
	var userInfo *auth.UserInfo
	if authHeader != "" && d.AuthAPI != nil {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && parts[0] == "Bearer" {
			// Fetch full user info from Supabase
			if fullUser, err := d.AuthAPI.GetUser(r.Context(), parts[1]); err == nil {
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
		"user":          responseUser,
		"authenticated": true,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (d *Deps) handleRefreshToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if database is available
	if !d.DBAvailable || d.AuthAPI == nil {
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

	session, err := d.AuthAPI.RefreshToken(r.Context(), req.RefreshToken)
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

func (d *Deps) handleGetUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if database is available FIRST - before checking auth
	if !d.DBAvailable || d.AuthAPI == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "Authentication service is currently unavailable (database not connected)",
			"success": false,
		})
		return
	}

	user, userOK := auth.GetUserFromContext(r.Context())
	if !userOK || user == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"user":          nil,
			"authenticated": false,
		})
		return
	}

	// Try to get full user info from Supabase API
	authHeader := r.Header.Get("Authorization")
	var userInfo *auth.UserInfo
	if authHeader != "" && d.AuthAPI != nil {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && parts[0] == "Bearer" {
			// Fetch full user info from Supabase
			if fullUser, err := d.AuthAPI.GetUser(r.Context(), parts[1]); err == nil {
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
		"user":          responseUser,
		"authenticated": true,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ============================================================================
// Reasoning Handlers
// ============================================================================

func (d *Deps) handleReasoningStart(w http.ResponseWriter, r *http.Request) {
	// Fast-fail when no models (avoids long timeouts and unclear errors)
	if d.AuthDisabled && (d.Registry == nil || d.Registry.Count() == 0) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "No models configured. Add provider keys in Settings (Dashboard > Models), or in no-auth mode add OPENROUTER_API_KEY (or GEMINI_API_KEY) to .env and restart.",
		})
		return
	}
	d.ReasoningAPI.HandleStartReasoning(w, r)
}

func (d *Deps) handleReasoningStatus(w http.ResponseWriter, r *http.Request) {
	d.ReasoningAPI.HandleGetStatus(w, r)
}

func (d *Deps) handleReasoningWebSocket(w http.ResponseWriter, r *http.Request) {
	d.ReasoningAPI.HandleWebSocket(w, r)
}

func (d *Deps) handleMonitoringStats(w http.ResponseWriter, r *http.Request) {
	d.ReasoningAPI.HandleGetStats(w, r)
}

// ============================================================================
// World Model Routes (NEW)
// ============================================================================

// Get all facts from world model
func (d *Deps) handleWorldModelFacts(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	facts := d.WorldModel.ListAll()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"facts": facts,
		"count": len(facts),
	})
}

// Store a fact manually
func (d *Deps) handleWorldModelStore(w http.ResponseWriter, r *http.Request) {
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

	err := d.WorldModel.Store(r.Context(), req.Key, req.Value, req.Source, req.SessionID)
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
func (d *Deps) handleWorldModelSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "Query parameter 'q' is required", http.StatusBadRequest)
		return
	}

	facts := d.WorldModel.Search(r.Context(), query, 10)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"query": query,
		"facts": facts,
		"count": len(facts),
	})
}

// Handle multi-agent workflow
func (d *Deps) handleAgentWorkflow(w http.ResponseWriter, r *http.Request) {
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
	sessionID := d.ReasoningAPI.Engine.InitSession(r.Context(), req.Prompt)

	// Create simple workflow with world model (NEW: pass d.WorldModel)
	workflow := reasoning.NewSimpleAgentWorkflow(d.ReasoningAPI.Engine.Orchestrator.Router, sessionID, d.WorldModel)
	workflow.OnEvent = d.ReasoningAPI.BroadcastEvent

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
