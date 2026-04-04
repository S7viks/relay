package httpserver

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"gaiol/internal/auth"
	"gaiol/internal/database"
	orchestratorv1 "gaiol/internal/gaiol/orchestratorcontract/v1"
	"gaiol/internal/models"
	"gaiol/internal/reasoning"
)

const RateLimitPerMin = 60

// Deps holds shared HTTP handler dependencies (replaces package-level globals in main).
type Deps struct {
	Registry     *models.Registry
	Router       *models.ModelRouter
	Tracker      *models.PerformanceTracker
	DB           *database.Client
	DBAvailable  bool
	AuthDisabled bool
	AuthAPI      *auth.AuthAPI
	ReasoningAPI *reasoning.ReasoningAPI
	WorldModel   *reasoning.WorldModel

	TSOrchestrator         *orchestratorv1.Client
	TSOrchestratorDelegate bool

	AllowedOrigins map[string]struct{}
	LogLevel       string

	RateLimitMu    sync.Mutex
	RateLimitCount map[string][]time.Time
}

// InitConfigFromEnv sets AllowedOrigins and LogLevel from environment variables.
func (d *Deps) InitConfigFromEnv() {
	s := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
	if s == "" {
		d.AllowedOrigins = nil
	} else {
		d.AllowedOrigins = make(map[string]struct{})
		for _, o := range strings.Split(s, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				d.AllowedOrigins[o] = struct{}{}
			}
		}
	}
	d.LogLevel = strings.ToLower(strings.TrimSpace(os.Getenv("LOG_LEVEL")))
	if d.LogLevel == "" {
		d.LogLevel = "info"
	}
}

// Register attaches all HTTP routes to mux (use http.DefaultServeMux in production).
func Register(mux *http.ServeMux, d *Deps) {
	cors := d.corsMiddleware

	// 1. Root and System Routes (public)
	// /health must use CORS: the Vercel-hosted UI calls it cross-origin; api.js sends
	// Content-Type on GET which triggers a preflight OPTIONS.
	mux.Handle("/health", cors(http.HandlerFunc(d.handleHealth)))
	// Hashed JS/CSS from Vite (must be before catch-all SPA)
	mux.HandleFunc("/assets/", serveRootAssets)
	// Legacy bookmarks: /dashboard/* -> /*
	mux.HandleFunc("/dashboard", redirectLegacyDashboard)
	mux.HandleFunc("/dashboard/", redirectLegacyDashboard)
	mux.HandleFunc("/welcome", serveUnifiedSPA)

	// 2. Model Routes (public)
	mux.Handle("/api/models/free", cors(http.HandlerFunc(d.handleListFreeModels)))
	mux.Handle("/api/models", cors(http.HandlerFunc(d.handleListModels)))
	mux.Handle("/api/models/", cors(http.HandlerFunc(d.handleModelsByProvider)))

	// 3. Authentication Routes
	if d.AuthDisabled {
		noAuthStub := cors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"user":    map[string]interface{}{"id": "local", "email": "local@localhost", "tenant_id": "local"},
				"success": true,
			})
		}))
		mux.Handle("/api/auth/signup", noAuthStub)
		mux.Handle("/api/auth/signin", noAuthStub)
		mux.Handle("/api/auth/signout", noAuthStub)
		mux.Handle("/api/auth/session", noAuthStub)
		mux.Handle("/api/auth/refresh", noAuthStub)
		mux.Handle("/api/auth/user", noAuthStub)
		mux.Handle("/api/auth/recover", noAuthStub)
		mux.Handle("/api/auth/update-password", noAuthStub)
	} else {
		authMiddleware := auth.AuthMiddleware(d.DB)
		mux.Handle("/api/auth/signup", cors(d.optionalAuthMiddleware(authMiddleware, http.HandlerFunc(d.handleSignUp))))
		mux.Handle("/api/auth/signin", cors(d.optionalAuthMiddleware(authMiddleware, http.HandlerFunc(d.handleSignIn))))
		mux.Handle("/api/auth/signout", cors(d.optionalAuthMiddleware(authMiddleware, http.HandlerFunc(d.handleSignOut))))
		mux.Handle("/api/auth/session", cors(d.optionalAuthMiddleware(authMiddleware, http.HandlerFunc(d.handleGetSession))))
		mux.Handle("/api/auth/refresh", cors(d.optionalAuthMiddleware(authMiddleware, http.HandlerFunc(d.handleRefreshToken))))
		mux.Handle("/api/auth/user", cors(d.optionalAuthMiddleware(authMiddleware, http.HandlerFunc(d.handleGetUser))))
		mux.Handle("/api/auth/recover", cors(http.HandlerFunc(d.handleRecoverPassword)))
		mux.Handle("/api/auth/update-password", cors(http.HandlerFunc(d.handleUpdatePassword)))
	}

	if d.AuthDisabled {
		mux.Handle("/api/query", cors(http.HandlerFunc(d.handleQuery)))
		mux.Handle("/api/query/smart", cors(http.HandlerFunc(d.handleQuerySmart)))
		mux.Handle("/api/orchestration/trust", cors(http.HandlerFunc(d.handleOrchestrationTrustProxy)))
		mux.Handle("/api/orchestration/trace-ids", cors(http.HandlerFunc(d.handleOrchestrationTraceIDsProxy)))
		mux.Handle("/api/orchestration/eval/contains", cors(http.HandlerFunc(d.handleOrchestrationEvalContainsProxy)))
		mux.Handle("/api/orchestration/traces/", cors(http.HandlerFunc(d.handleOrchestrationTraceProxy)))
		mux.Handle("/api/query/model", cors(http.HandlerFunc(d.handleQueryModel)))
		mux.Handle("/api/reasoning/start", cors(http.HandlerFunc(d.handleReasoningStart)))
		mux.Handle("/api/reasoning/status/", cors(http.HandlerFunc(d.handleReasoningStatus)))
		mux.Handle("/api/reasoning/ws", cors(http.HandlerFunc(d.handleReasoningWebSocket)))
		mux.Handle("/api/monitoring/stats", cors(http.HandlerFunc(d.handleMonitoringStats)))
		mux.Handle("/api/world-model/facts", cors(http.HandlerFunc(d.handleWorldModelFacts)))
		mux.Handle("/api/world-model/store", cors(http.HandlerFunc(d.handleWorldModelStore)))
		mux.Handle("/api/world-model/search", cors(http.HandlerFunc(d.handleWorldModelSearch)))
		mux.Handle("/api/agent/workflow", cors(http.HandlerFunc(d.handleAgentWorkflow)))
		mux.Handle("/api/settings/provider-keys", cors(http.HandlerFunc(d.noAuthHandleProviderKeys)))
		mux.Handle("/api/settings/providers", cors(http.HandlerFunc(d.noAuthHandleCustomProviders)))
		mux.Handle("/api/settings/models", cors(http.HandlerFunc(d.noAuthHandleTenantModelsSettings)))
		mux.Handle("/api/gaiol-keys", cors(http.HandlerFunc(d.noAuthHandleGAIOLKeys)))
		mux.Handle("/api/gaiol-keys/", cors(http.HandlerFunc(d.noAuthHandleGAIOLKeysID)))
		mux.Handle("/api/usage", cors(http.HandlerFunc(d.noAuthHandleUsage)))
		mux.Handle("/api/usage/export", cors(http.HandlerFunc(d.noAuthHandleUsageExport)))
		mux.Handle("/api/billing/summary", cors(http.HandlerFunc(d.noAuthHandleBillingSummary)))
		mux.Handle("/api/billing/history", cors(http.HandlerFunc(d.noAuthHandleBillingHistory)))
		mux.Handle("/api/tenant/models", cors(http.HandlerFunc(d.noAuthHandleTenantModels)))
		mux.Handle("/api/activity", cors(http.HandlerFunc(d.noAuthHandleActivity)))
		mux.Handle("/api/settings/preferences", cors(http.HandlerFunc(d.noAuthHandlePreferences)))
		mux.Handle("/api/settings/gaiol-key/ensure", cors(http.HandlerFunc(d.noAuthHandleEnsureGAIOLKey)))
	} else {
		reqAuth := auth.AuthMiddleware(d.DB)
		mux.Handle("/api/query", cors(reqAuth(http.HandlerFunc(d.handleQuery))))
		mux.Handle("/api/query/smart", cors(reqAuth(http.HandlerFunc(d.handleQuerySmart))))
		mux.Handle("/api/orchestration/trust", cors(reqAuth(http.HandlerFunc(d.handleOrchestrationTrustProxy))))
		mux.Handle("/api/orchestration/trace-ids", cors(reqAuth(http.HandlerFunc(d.handleOrchestrationTraceIDsProxy))))
		mux.Handle("/api/orchestration/eval/contains", cors(reqAuth(http.HandlerFunc(d.handleOrchestrationEvalContainsProxy))))
		mux.Handle("/api/orchestration/traces/", cors(reqAuth(http.HandlerFunc(d.handleOrchestrationTraceProxy))))
		mux.Handle("/api/query/model", cors(reqAuth(http.HandlerFunc(d.handleQueryModel))))
		mux.Handle("/api/reasoning/start", cors(reqAuth(http.HandlerFunc(d.handleReasoningStart))))
		mux.Handle("/api/reasoning/status/", cors(reqAuth(http.HandlerFunc(d.handleReasoningStatus))))
		mux.Handle("/api/reasoning/ws", cors(reqAuth(http.HandlerFunc(d.handleReasoningWebSocket))))
		mux.Handle("/api/monitoring/stats", cors(reqAuth(http.HandlerFunc(d.handleMonitoringStats))))
		mux.Handle("/api/world-model/facts", cors(reqAuth(http.HandlerFunc(d.handleWorldModelFacts))))
		mux.Handle("/api/world-model/store", cors(reqAuth(http.HandlerFunc(d.handleWorldModelStore))))
		mux.Handle("/api/world-model/search", cors(reqAuth(http.HandlerFunc(d.handleWorldModelSearch))))
		mux.Handle("/api/agent/workflow", cors(reqAuth(http.HandlerFunc(d.handleAgentWorkflow))))
		mux.Handle("/api/settings/provider-keys", cors(reqAuth(http.HandlerFunc(d.handleProviderKeys))))
		mux.Handle("/api/settings/providers", cors(reqAuth(http.HandlerFunc(d.handleCustomProviders))))
		mux.Handle("/api/settings/models", cors(reqAuth(http.HandlerFunc(d.handleTenantModelsSettings))))
		mux.Handle("/api/gaiol-keys", cors(reqAuth(http.HandlerFunc(d.handleGAIOLKeys))))
		mux.Handle("/api/gaiol-keys/", cors(reqAuth(http.HandlerFunc(d.handleGAIOLKeysID))))
		mux.Handle("/api/usage", cors(reqAuth(http.HandlerFunc(d.handleUsage))))
		mux.Handle("/api/usage/export", cors(reqAuth(http.HandlerFunc(d.handleUsageExport))))
		mux.Handle("/api/billing/summary", cors(reqAuth(http.HandlerFunc(d.handleBillingSummary))))
		mux.Handle("/api/billing/history", cors(reqAuth(http.HandlerFunc(d.handleBillingHistory))))
		mux.Handle("/api/tenant/models", cors(reqAuth(http.HandlerFunc(d.handleTenantModels))))
		mux.Handle("/api/activity", cors(reqAuth(http.HandlerFunc(d.handleActivity))))
		mux.Handle("/api/settings/preferences", cors(reqAuth(http.HandlerFunc(d.handlePreferences))))
		mux.Handle("/api/settings/gaiol-key/ensure", cors(reqAuth(http.HandlerFunc(d.handleEnsureGAIOLKey))))
	}

	mux.Handle("/v1/chat", cors(http.HandlerFunc(d.handleV1Chat)))

	// Unified React SPA last so /api, /health, /v1, /assets, etc. are never swallowed.
	mux.HandleFunc("/", serveUnifiedSPA)
}
