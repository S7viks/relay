package httpserver

import (
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

	// TSOrchestrator calls the Node/TS orchestrator HTTP API (contract v1).
	TSOrchestrator         *orchestratorv1.Client
	TSOrchestratorDelegate bool

	AllowedOrigins map[string]struct{}
	LogLevel       string

	RateLimitMu    sync.Mutex
	RateLimitCount map[string][]time.Time // GAIOL API key id -> timestamps in last minute
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

func splitComma(s string) []string {
	return strings.Split(s, ",")
}
