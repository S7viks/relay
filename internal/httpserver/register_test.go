package httpserver

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gaiol/internal/models"
	"gaiol/internal/monitoring"
	"gaiol/internal/reasoning"
)

func newTestDepsAuthDisabled(t *testing.T) *Deps {
	t.Helper()
	reg := models.NewEmptyRegistry()
	tracker := models.NewPerformanceTracker(nil)
	rtr := models.NewModelRouter(reg, tracker)
	return &Deps{
		Registry:       reg,
		Router:         rtr,
		Tracker:        tracker,
		AuthDisabled:   true,
		ReasoningAPI:   reasoning.NewReasoningAPI(rtr, monitoring.NewMetricsService()),
		WorldModel:     reasoning.NewWorldModel(nil),
		LogLevel:       "error",
		AllowedOrigins: nil,
	}
}

func TestHealth_OK(t *testing.T) {
	d := newTestDepsAuthDisabled(t)
	mux := http.NewServeMux()
	Register(mux, d)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	b, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(b), `"status"`) {
		t.Fatalf("body %s", b)
	}
}

func TestV1Chat_GET_NotAllowed(t *testing.T) {
	d := newTestDepsAuthDisabled(t)
	mux := http.NewServeMux()
	Register(mux, d)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	resp, err := http.Get(srv.URL + "/v1/chat")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("status %d want 405", resp.StatusCode)
	}
}
