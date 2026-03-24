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
	mux.HandleFunc("/health", cors(d.handleHealth))
	if d.AuthDisabled {
		redirect := func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/", http.StatusFound) }
		mux.HandleFunc("/login", redirect)
		mux.HandleFunc("/signup", redirect)
		mux.HandleFunc("/reset-password", redirect)
	} else {
		mux.HandleFunc("/login", serveStaticPage("login.html"))
		mux.HandleFunc("/signup", serveStaticPage("signup.html"))
		mux.HandleFunc("/reset-password", serveStaticPage("reset-password.html"))
	}
	mux.HandleFunc("/terms", serveStaticPage("terms.html"))
	// React SPA (Vite): build output in dashboard/dist — see docs/DASHBOARD.md
	mux.HandleFunc("/dashboard", redirectDashboardSlash)
	mux.HandleFunc("/dashboard/assets/", serveReactDashboardAssets)
	mux.HandleFunc("/dashboard/", serveReactDashboardSPA)
	mux.HandleFunc("/welcome", serveStaticPage("landing.html"))
	mux.HandleFunc("/chat", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/dashboard/chat", http.StatusFound)
	})
	mux.HandleFunc("/chat/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/chat", http.StatusFound)
	})

	// 2. Model Routes (public)
	mux.HandleFunc("/api/models/free", cors(d.handleListFreeModels))
	mux.HandleFunc("/api/models", cors(d.handleListModels))
	mux.HandleFunc("/api/models/", cors(d.handleModelsByProvider))

	// 3. Authentication Routes
	if d.AuthDisabled {
		noAuthStub := cors(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"user":    map[string]interface{}{"id": "local", "email": "local@localhost", "tenant_id": "local"},
				"success": true,
			})
		})
		mux.HandleFunc("/api/auth/signup", noAuthStub)
		mux.HandleFunc("/api/auth/signin", noAuthStub)
		mux.HandleFunc("/api/auth/signout", noAuthStub)
		mux.HandleFunc("/api/auth/session", noAuthStub)
		mux.HandleFunc("/api/auth/refresh", noAuthStub)
		mux.HandleFunc("/api/auth/user", noAuthStub)
		mux.HandleFunc("/api/auth/recover", noAuthStub)
		mux.HandleFunc("/api/auth/update-password", noAuthStub)
	} else {
		authMiddleware := auth.AuthMiddleware(d.DB)
		mux.Handle("/api/auth/signup", d.optionalAuthMiddleware(authMiddleware, cors(d.handleSignUp)))
		mux.Handle("/api/auth/signin", d.optionalAuthMiddleware(authMiddleware, cors(d.handleSignIn)))
		mux.Handle("/api/auth/signout", d.optionalAuthMiddleware(authMiddleware, cors(d.handleSignOut)))
		mux.Handle("/api/auth/session", d.optionalAuthMiddleware(authMiddleware, cors(d.handleGetSession)))
		mux.Handle("/api/auth/refresh", d.optionalAuthMiddleware(authMiddleware, cors(d.handleRefreshToken)))
		mux.Handle("/api/auth/user", d.optionalAuthMiddleware(authMiddleware, cors(d.handleGetUser)))
		mux.HandleFunc("/api/auth/recover", cors(d.handleRecoverPassword))
		mux.HandleFunc("/api/auth/update-password", cors(d.handleUpdatePassword))
	}

	if d.AuthDisabled {
		mux.HandleFunc("/api/query", cors(d.handleQuery))
		mux.HandleFunc("/api/query/smart", cors(d.handleQuerySmart))
		mux.HandleFunc("/api/orchestration/trust", cors(d.handleOrchestrationTrustProxy))
		mux.HandleFunc("/api/orchestration/trace-ids", cors(d.handleOrchestrationTraceIDsProxy))
		mux.HandleFunc("/api/orchestration/eval/contains", cors(d.handleOrchestrationEvalContainsProxy))
		mux.HandleFunc("/api/orchestration/traces/", cors(d.handleOrchestrationTraceProxy))
		mux.HandleFunc("/api/query/model", cors(d.handleQueryModel))
		mux.HandleFunc("/api/reasoning/start", cors(d.handleReasoningStart))
		mux.HandleFunc("/api/reasoning/status/", cors(d.handleReasoningStatus))
		mux.HandleFunc("/api/reasoning/ws", cors(d.handleReasoningWebSocket))
		mux.HandleFunc("/api/monitoring/stats", cors(d.handleMonitoringStats))
		mux.HandleFunc("/api/world-model/facts", cors(d.handleWorldModelFacts))
		mux.HandleFunc("/api/world-model/store", cors(d.handleWorldModelStore))
		mux.HandleFunc("/api/world-model/search", cors(d.handleWorldModelSearch))
		mux.HandleFunc("/api/agent/workflow", cors(d.handleAgentWorkflow))
		mux.HandleFunc("/api/settings/provider-keys", cors(d.noAuthHandleProviderKeys))
		mux.HandleFunc("/api/settings/providers", cors(d.noAuthHandleCustomProviders))
		mux.HandleFunc("/api/settings/models", cors(d.noAuthHandleTenantModelsSettings))
		mux.HandleFunc("/api/gaiol-keys", cors(d.noAuthHandleGAIOLKeys))
		mux.HandleFunc("/api/gaiol-keys/", cors(d.noAuthHandleGAIOLKeysID))
		mux.HandleFunc("/api/usage", cors(d.noAuthHandleUsage))
		mux.HandleFunc("/api/usage/export", cors(d.noAuthHandleUsageExport))
		mux.HandleFunc("/api/billing/summary", cors(d.noAuthHandleBillingSummary))
		mux.HandleFunc("/api/billing/history", cors(d.noAuthHandleBillingHistory))
		mux.HandleFunc("/api/tenant/models", cors(d.noAuthHandleTenantModels))
		mux.HandleFunc("/api/activity", cors(d.noAuthHandleActivity))
		mux.HandleFunc("/api/settings/preferences", cors(d.noAuthHandlePreferences))
	} else {
		reqAuth := auth.AuthMiddleware(d.DB)
		mux.Handle("/api/query", reqAuth(cors(d.handleQuery)))
		mux.Handle("/api/query/smart", reqAuth(cors(d.handleQuerySmart)))
		mux.Handle("/api/orchestration/trust", reqAuth(cors(d.handleOrchestrationTrustProxy)))
		mux.Handle("/api/orchestration/trace-ids", reqAuth(cors(d.handleOrchestrationTraceIDsProxy)))
		mux.Handle("/api/orchestration/eval/contains", reqAuth(cors(d.handleOrchestrationEvalContainsProxy)))
		mux.Handle("/api/orchestration/traces/", reqAuth(cors(d.handleOrchestrationTraceProxy)))
		mux.Handle("/api/query/model", reqAuth(cors(d.handleQueryModel)))
		mux.Handle("/api/reasoning/start", reqAuth(cors(d.handleReasoningStart)))
		mux.Handle("/api/reasoning/status/", reqAuth(cors(d.handleReasoningStatus)))
		mux.Handle("/api/reasoning/ws", reqAuth(cors(d.handleReasoningWebSocket)))
		mux.Handle("/api/monitoring/stats", reqAuth(cors(d.handleMonitoringStats)))
		mux.Handle("/api/world-model/facts", reqAuth(cors(d.handleWorldModelFacts)))
		mux.Handle("/api/world-model/store", reqAuth(cors(d.handleWorldModelStore)))
		mux.Handle("/api/world-model/search", reqAuth(cors(d.handleWorldModelSearch)))
		mux.Handle("/api/agent/workflow", reqAuth(cors(d.handleAgentWorkflow)))
		mux.Handle("/api/settings/provider-keys", reqAuth(cors(d.handleProviderKeys)))
		mux.Handle("/api/settings/providers", reqAuth(cors(d.handleCustomProviders)))
		mux.Handle("/api/settings/models", reqAuth(cors(d.handleTenantModelsSettings)))
		mux.Handle("/api/gaiol-keys", reqAuth(cors(d.handleGAIOLKeys)))
		mux.Handle("/api/gaiol-keys/", reqAuth(cors(d.handleGAIOLKeysID)))
		mux.Handle("/api/usage", reqAuth(cors(d.handleUsage)))
		mux.Handle("/api/usage/export", reqAuth(cors(d.handleUsageExport)))
		mux.Handle("/api/billing/summary", reqAuth(cors(d.handleBillingSummary)))
		mux.Handle("/api/billing/history", reqAuth(cors(d.handleBillingHistory)))
		mux.Handle("/api/tenant/models", reqAuth(cors(d.handleTenantModels)))
		mux.Handle("/api/activity", reqAuth(cors(d.handleActivity)))
		mux.Handle("/api/settings/preferences", reqAuth(cors(d.handlePreferences)))
	}

	mux.Handle("/v1/chat", cors(d.handleV1Chat))

	// Static files and HTML pages last so /api, /health, /v1, etc. are never swallowed by the file server.
	mux.HandleFunc("/", noCacheFileServer)
}
