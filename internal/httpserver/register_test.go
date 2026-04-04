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

func TestAuthAPI_TrailingSlash_POST_NotSPA405(t *testing.T) {
	d := newTestDepsAuthDisabled(t)
	mux := http.NewServeMux()
	Register(mux, d)
	h := NormalizeAuthAPIPath(mux)
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)

	resp, err := http.Post(srv.URL+"/api/auth/signin/", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusMethodNotAllowed {
		t.Fatalf("POST /api/auth/signin/ fell through to SPA (405); normalize trailing slash for /api/auth/*")
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
}

func TestAuthAPI_DoubleSlash_POST_NotSPA405(t *testing.T) {
	d := newTestDepsAuthDisabled(t)
	mux := http.NewServeMux()
	Register(mux, d)
	h := NormalizeAuthAPIPath(mux)
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)

	req, err := http.NewRequest(http.MethodPost, srv.URL+"//api/auth/signin", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusMethodNotAllowed {
		t.Fatalf("POST //api/auth/signin fell through to SPA (405)")
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
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

func TestRoot_ServesReactSPA(t *testing.T) {
	chdirProjectRoot(t)
	if _, err := os.Stat(reactAppIndex); err != nil {
		t.Skip("dashboard/dist not built; run npm run build in dashboard/")
	}
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
	if !strings.Contains(body, `id="root"`) {
		t.Fatalf("expected Vite index.html shell, got prefix %q", truncateRunes(body, 200))
	}
}

func TestChatRoute_ServesReactSPA(t *testing.T) {
	chdirProjectRoot(t)
	if _, err := os.Stat(reactAppIndex); err != nil {
		t.Skip("dashboard/dist not built; run npm run build in dashboard/")
	}
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
	if !strings.Contains(body, `id="root"`) {
		t.Fatalf("expected Vite index.html shell, got prefix %q", truncateRunes(body, 200))
	}
}

func TestLegacyDashboard_RedirectsToRootPaths(t *testing.T) {
	chdirProjectRoot(t)
	d := newTestDepsAuthDisabled(t)
	mux := http.NewServeMux()
	Register(mux, d)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	client := &http.Client{CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	resp, err := client.Get(srv.URL + "/dashboard/chat")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMovedPermanently {
		t.Fatalf("status %d want 301", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if !strings.HasSuffix(strings.TrimRight(loc, "/"), "/chat") {
		t.Fatalf("Location %q want path /chat", loc)
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

// CORS runs outside auth so browsers still see Access-Control-Allow-Origin on 401 (credentialed cross-origin fetches).
func TestCORS_Unauthorized_ProtectedRoute_HasAllowOrigin(t *testing.T) {
	reg := models.NewEmptyRegistry()
	tracker := models.NewPerformanceTracker(nil)
	rtr := models.NewModelRouter(reg, tracker)
	d := &Deps{
		Registry:     reg,
		Router:       rtr,
		Tracker:      tracker,
		AuthDisabled: false,
		DB:           nil,
		DBAvailable:  false,
		ReasoningAPI: reasoning.NewReasoningAPI(rtr, monitoring.NewMetricsService()),
		WorldModel:   reasoning.NewWorldModel(nil),
		LogLevel:     "error",
		AllowedOrigins: map[string]struct{}{
			"https://gaiol.vercel.app": {},
		},
	}
	mux := http.NewServeMux()
	Register(mux, d)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	req, err := http.NewRequest(http.MethodGet, srv.URL+"/api/activity", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", "https://gaiol.vercel.app")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status %d want 401", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "https://gaiol.vercel.app" {
		t.Fatalf("Access-Control-Allow-Origin %q want https://gaiol.vercel.app", got)
	}
}

func TestCORS_Preflight_OPTIONS_AllowedOrigin(t *testing.T) {
	reg := models.NewEmptyRegistry()
	tracker := models.NewPerformanceTracker(nil)
	rtr := models.NewModelRouter(reg, tracker)
	d := &Deps{
		Registry:     reg,
		Router:       rtr,
		Tracker:      tracker,
		AuthDisabled: true,
		ReasoningAPI: reasoning.NewReasoningAPI(rtr, monitoring.NewMetricsService()),
		WorldModel:   reasoning.NewWorldModel(nil),
		LogLevel:     "error",
		AllowedOrigins: map[string]struct{}{
			"https://gaiol.vercel.app": {},
		},
	}
	mux := http.NewServeMux()
	Register(mux, d)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	req, err := http.NewRequest(http.MethodOptions, srv.URL+"/api/query/smart", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", "https://gaiol.vercel.app")
	req.Header.Set("Access-Control-Request-Method", "POST")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("status %d want 204", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "https://gaiol.vercel.app" {
		t.Fatalf("Access-Control-Allow-Origin %q", got)
	}
}
