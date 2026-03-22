//go:build integration

package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"gaiol/internal/httpserver"
	orchestratorv1 "gaiol/internal/gaiol/orchestratorcontract/v1"
	"gaiol/internal/models"
	"gaiol/internal/monitoring"
	"gaiol/internal/reasoning"
)

var tsOrchestratorBase string

func TestMain(m *testing.M) {
	root, err := findRepoRoot()
	if err != nil {
		fmt.Fprintf(os.Stderr, "integration: %v\n", err)
		os.Exit(1)
	}
	orchDir := filepath.Join(root, "orchestrator")
	distMain := filepath.Join(orchDir, "dist", "api", "server.js")
	if _, err := os.Stat(distMain); err != nil {
		fmt.Fprintf(os.Stderr, "integration: orchestrator not built (%v); run: cd orchestrator && npm run build\n", err)
		os.Exit(1)
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintf(os.Stderr, "integration: listen: %v\n", err)
		os.Exit(1)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, "node", distMain)
	cmd.Dir = orchDir
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("ORCHESTRATOR_PORT=%d", port),
		fmt.Sprintf("PORT=%d", port),
	)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		cancel()
		fmt.Fprintf(os.Stderr, "integration: start node: %v\n", err)
		os.Exit(1)
	}

	tsOrchestratorBase = fmt.Sprintf("http://127.0.0.1:%d", port)
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, tsOrchestratorBase+"/health", nil)
		resp, err := http.DefaultClient.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				break
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	if time.Now().After(deadline) {
		_ = cmd.Process.Kill()
		cancel()
		fmt.Fprintf(os.Stderr, "integration: TS orchestrator did not become healthy\n")
		os.Exit(1)
	}

	code := m.Run()
	_ = cmd.Process.Kill()
	cancel()
	_ = cmd.Wait()
	os.Exit(code)
}

func findRepoRoot() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	d := wd
	for i := 0; i < 16; i++ {
		if _, err := os.Stat(filepath.Join(d, "go.mod")); err == nil {
			return d, nil
		}
		d = filepath.Join(d, "..")
	}
	return "", fmt.Errorf("go.mod not found from %s", wd)
}

func benchDeps() *httpserver.Deps {
	reg := models.NewRegistry(nil, nil, nil)
	tracker := models.NewPerformanceTracker(nil)
	router := models.NewModelRouter(reg, tracker)
	return &httpserver.Deps{
		AuthDisabled:           true,
		Registry:               reg,
		Router:                 router,
		Tracker:                tracker,
		ReasoningAPI:           reasoning.NewReasoningAPI(router, monitoring.NewMetricsService()),
		WorldModel:             reasoning.NewWorldModel(nil),
		TSOrchestrator:         orchestratorv1.NewClient(tsOrchestratorBase),
		TSOrchestratorDelegate: true,
	}
}

func testDeps(t *testing.T) *httpserver.Deps {
	t.Helper()
	return benchDeps()
}

func TestGoTSStack_SmartQuery_EndToEnd(t *testing.T) {
	d := testDeps(t)
	mux := http.NewServeMux()
	httpserver.Register(mux, d)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	body := map[string]interface{}{
		"prompt":      "integration alpha beta gamma objective for beam routing",
		"task":        "qa",
		"strategy":    "beam",
		"max_tokens":  200,
		"temperature": 0.3,
	}
	b, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/query/smart", bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d: %s", resp.StatusCode, raw)
	}
	var out map[string]interface{}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if out["strategy"] != "ts_orchestrator" {
		t.Fatalf("expected ts_orchestrator, got %v", out["strategy"])
	}
	meta, _ := out["metadata"].(map[string]interface{})
	if meta == nil || meta["trace_id"] == nil {
		t.Fatalf("missing metadata.trace_id: %v", out)
	}
	traceID, _ := meta["trace_id"].(string)
	if traceID == "" {
		t.Fatal("empty trace_id")
	}
	ot, ok := out["orchestration_trace"].(map[string]interface{})
	if !ok {
		t.Fatal("missing orchestration_trace")
	}
	subs, _ := ot["subtasks"].([]interface{})
	if len(subs) == 0 {
		t.Fatal("expected subtasks in trace")
	}
	st0, _ := subs[0].(map[string]interface{})
	pe, _ := st0["path_exploration"].(map[string]interface{})
	if pe == nil {
		t.Fatal("expected path_exploration for beam strategy")
	}
	cands, _ := pe["candidates"].([]interface{})
	if len(cands) < 2 {
		t.Fatalf("expected >=2 path candidates for beam explore, got %d", len(cands))
	}
	tu, _ := out["orchestration_trust_updates"].([]interface{})
	if tu == nil {
		t.Fatal("missing orchestration_trust_updates")
	}
	if len(tu) == 0 {
		t.Fatal("expected ABTC trust updates from TS default config")
	}
	om, _ := out["orchestration_metrics"].(map[string]interface{})
	if om == nil {
		t.Fatal("missing orchestration_metrics")
	}
	if om["total_model_calls"].(float64) < 2 {
		t.Fatalf("metrics: %+v", om)
	}

	// Trace proxy on Go mux
	proxyReq, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/orchestration/traces/"+traceID, nil)
	pres, err := http.DefaultClient.Do(proxyReq)
	if err != nil {
		t.Fatal(err)
	}
	defer pres.Body.Close()
	praw, _ := io.ReadAll(pres.Body)
	if pres.StatusCode != http.StatusOK {
		t.Fatalf("proxy status %d: %s", pres.StatusCode, praw)
	}
	var bundle map[string]interface{}
	if err := json.Unmarshal(praw, &bundle); err != nil {
		t.Fatal(err)
	}
	if bundle["metrics_summary"] == nil {
		t.Fatalf("proxy bundle missing metrics_summary: %s", praw)
	}
}

func TestGoTSStack_MultiModelRoutedIDs(t *testing.T) {
	d := testDeps(t)
	mux := http.NewServeMux()
	httpserver.Register(mux, d)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	body := map[string]interface{}{
		"prompt":     "short prompt for diversity",
		"task":       "qa",
		"strategy":   "beam",
		"max_tokens": 100,
	}
	b, _ := json.Marshal(body)
	resp, err := http.DefaultClient.Post(srv.URL+"/api/query/smart", "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d: %s", resp.StatusCode, raw)
	}
	var out map[string]interface{}
	_ = json.Unmarshal(raw, &out)
	ot, _ := out["orchestration_trace"].(map[string]interface{})
	subs, _ := ot["subtasks"].([]interface{})
	st0, _ := subs[0].(map[string]interface{})
	routed, _ := st0["routed_model_ids"].([]interface{})
	if len(routed) < 2 {
		t.Fatalf("expected multiple routed models for diversity/beam, got %v", routed)
	}
}

func BenchmarkGoTSOrchestrator_SmartQuery(b *testing.B) {
	if tsOrchestratorBase == "" {
		b.Skip("integration TestMain did not set base URL")
	}
	d := benchDeps()
	mux := http.NewServeMux()
	httpserver.Register(mux, d)
	srv := httptest.NewServer(mux)
	defer srv.Close()
	payload := []byte(`{"prompt":"benchmark ping","task":"qa","strategy":"beam","max_tokens":64,"temperature":0.2}`)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp, err := http.DefaultClient.Post(srv.URL+"/api/query/smart", "application/json", bytes.NewReader(payload))
		if err != nil {
			b.Fatal(err)
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			b.Fatalf("status %d", resp.StatusCode)
		}
	}
}
