package main

import (
	"context"
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
	orchestratorv1 "gaiol/internal/gaiol/orchestratorcontract/v1"
	"gaiol/internal/httpserver"
	"gaiol/internal/models"
	"gaiol/internal/models/adapters"
	"gaiol/internal/monitoring"
	"gaiol/internal/reasoning"

	"github.com/joho/godotenv"
)

func envBool(key string) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	return v == "1" || v == "true" || v == "yes" || v == "y" || v == "on"
}

func coalescePort(p string) string {
	if strings.TrimSpace(p) == "" {
		return "8080"
	}
	return strings.TrimSpace(p)
}

func main() {
	if err := loadEnv(); err != nil {
		log.Printf("Warning: Failed to load .env file: %v", err)
	}

	authDisabled := envBool("GAIOL_DISABLE_AUTH") || envBool("GAIOL_AUTH_DISABLED") || envBool("DISABLE_AUTH")
	if authDisabled {
		log.Println("Auth disabled: running in local no-auth mode (env provider keys)")
	}

	deps := &httpserver.Deps{AuthDisabled: authDisabled}
	deps.InitConfigFromEnv()

	fmt.Println("Initializing model adapters...")
	ollamaConcrete := adapters.NewOllamaAdapter("")
	ollamaModels, ollamaErr := ollamaConcrete.CheckAvailability(context.Background())
	var ollamaAdapter models.ModelAdapter
	if ollamaErr == nil && len(ollamaModels) > 0 {
		ollamaAdapter = ollamaConcrete
		fmt.Printf("Ollama available with %d local models: %v\n", len(ollamaModels), ollamaModels)
	} else {
		fmt.Printf("Ollama not available: %v\n", ollamaErr)
	}

	if authDisabled {
		var openRouterAdapter models.ModelAdapter
		var hfAdapter models.ModelAdapter
		if k := strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY")); k != "" {
			openRouterAdapter = adapters.NewOpenRouterAdapter("", k)
		}
		if k := strings.TrimSpace(os.Getenv("HUGGINGFACE_API_KEY")); k != "" {
			hfAdapter = adapters.NewHuggingFaceAdapter("", k)
		}
		deps.Registry = models.NewRegistry(openRouterAdapter, hfAdapter, ollamaAdapter)
		if k := strings.TrimSpace(os.Getenv("GEMINI_API_KEY")); k != "" {
			deps.Registry.AddGeminiModels(adapters.NewGeminiAdapter(k))
		}
		fmt.Printf("Global registry initialized from env (models=%d)\n", deps.Registry.Count())
	} else {
		deps.Registry = models.NewEmptyRegistry()
		fmt.Println("Global registry initialized empty (tenant-defined models only at runtime)")
	}

	if authDisabled {
		deps.DB = nil
		deps.DBAvailable = false
		deps.AuthAPI = nil
		deps.Tracker = nil
		database.SetGlobalClient(nil)
		log.Println("Auth disabled: skipping database initialization")
	} else {
		dbClient, err := database.NewClient()
		if err != nil || dbClient == nil || dbClient.Client == nil {
			log.Fatalf("FATAL: database required when authentication is enabled (set GAIOL_DISABLE_AUTH=1 for local dev without Supabase): %v", err)
		}
		deps.DB = dbClient
		database.SetGlobalClient(dbClient)
		log.Println("Database client initialized")
		deps.AuthAPI = auth.NewAuthAPI(dbClient)
		deps.Tracker = models.NewPerformanceTracker(dbClient)
		go func() {
			if err := deps.Tracker.RefreshCache(context.Background()); err != nil {
				log.Printf("Performance cache refresh failed (non-critical): %v", err)
			} else {
				log.Println("Performance cache refreshed")
			}
		}()
		log.Println("Performance tracker initialized (cache refreshing in background)")
		deps.DBAvailable = true
	}

	deps.Router = models.NewModelRouter(deps.Registry, deps.Tracker)
	log.Println("Model router initialized")

	deps.WorldModel = reasoning.NewWorldModel(deps.DB)
	log.Println("World Model initialized")

	deps.ReasoningAPI = reasoning.NewReasoningAPI(deps.Router, monitoring.NewMetricsService())
	log.Println("Reasoning API initialized")

	if tsURL := strings.TrimSpace(os.Getenv("GAIOL_TS_ORCHESTRATOR_URL")); tsURL != "" {
		deps.TSOrchestrator = orchestratorv1.NewClient(tsURL)
		deps.TSOrchestratorDelegate = envBool("GAIOL_USE_TS_ORCHESTRATOR")
		if deps.TSOrchestratorDelegate {
			log.Printf("TS orchestrator delegation enabled (GAIOL_TS_ORCHESTRATOR_URL=%s)", tsURL)
		} else {
			log.Printf("TS orchestrator client configured but delegation off; set GAIOL_USE_TS_ORCHESTRATOR=1 to route /api/query/smart through it")
		}
	}

	httpserver.Register(http.DefaultServeMux, deps)

	if _, err := os.Stat("dashboard/dist/index.html"); err != nil {
		log.Println("Web UI: dashboard/dist/index.html not found — open http://localhost:" + coalescePort(os.Getenv("PORT")) + "/ will show a build hint. Run: cd dashboard && npm install && npm run build")
	} else {
		log.Println("Web UI: serving unified React app at / (from dashboard/dist/)")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	var handler http.Handler = http.DefaultServeMux
	if authDisabled {
		handler = deps.LocalTenantMiddleware(handler)
	}
	handler = deps.RequestLogMiddleware(handler)
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		sigint := make(chan os.Signal, 1)
		signal.Notify(sigint, os.Interrupt, syscall.SIGTERM)
		<-sigint
		log.Println("Shutting down server...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("Server shutdown error: %v", err)
		}
	}()

	log.Printf("GAIOL Web Server starting on http://localhost:%s", port)
	log.Printf("Health check: http://localhost:%s/health", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed to start: %v", err)
	}
}

func loadEnv() error {
	for _, path := range []string{".env", "../.env", "../../.env"} {
		if _, err := os.Stat(path); err == nil {
			if err := godotenv.Load(path); err != nil {
				return fmt.Errorf("failed to load %s: %w", path, err)
			}
			log.Printf("Loaded environment from %s", path)
			return nil
		}
	}
	return nil
}
