package httpserver

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gaiol/internal/models"
	"gaiol/internal/monitoring"
	"gaiol/internal/reasoning"
)

// chdirProjectRoot sets working directory to the repo root (directory containing go.mod)
// so handlers that open ./web/... resolve correctly during tests.
func chdirProjectRoot(t *testing.T) {
	t.Helper()
	orig, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	wd := orig
	for {
		if _, err := os.Stat(filepath.Join(wd, "go.mod")); err == nil {
			break
		}
		parent := filepath.Dir(wd)
		if parent == wd {
			t.Skip("project root (go.mod) not found; skipping static file test")
		}
		wd = parent
	}
	if wd != orig {
		if err := os.Chdir(wd); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.Chdir(orig) })
	}
}

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

func TestRoot_ServesLanding(t *testing.T) {
	chdirProjectRoot(t)
	d := newTestDepsAuthDisabled(t)
	mux := http.NewServeMux()
	Register(mux, d)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	resp, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	b, _ := io.ReadAll(resp.Body)
	body := string(b)
	if !strings.Contains(body, "get-gaiol-key") && !strings.Contains(body, "Stop wasting spend") {
		t.Fatalf("expected landing page body, got prefix %q", truncateRunes(body, 200))
	}
}

func TestChatRoute_ServesChatApp(t *testing.T) {
	chdirProjectRoot(t)
	d := newTestDepsAuthDisabled(t)
	mux := http.NewServeMux()
	Register(mux, d)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	resp, err := http.Get(srv.URL + "/chat")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	b, _ := io.ReadAll(resp.Body)
	body := string(b)
	if !strings.Contains(body, "chatPage") {
		t.Fatalf("expected chat index body, got prefix %q", truncateRunes(body, 200))
	}
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func TestAPIModels_OK(t *testing.T) {
	chdirProjectRoot(t)
	d := newTestDepsAuthDisabled(t)
	mux := http.NewServeMux()
	Register(mux, d)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	resp, err := http.Get(srv.URL + "/api/models")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/models status %d want 200 (static / handler must not shadow API)", resp.StatusCode)
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
