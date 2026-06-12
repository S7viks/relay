package httpserver

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const (
	benchmarkResultsDir    = "scripts/benchmark/results"
	benchmarkDashboardHTML = "web/results-dashboard.html"
)

var allowedBenchmarkResultFiles = map[string]struct{}{
	"benchmark_results.json":      {},
	"baseline_comparison.json":    {},
	"sensitivity_lambda.json":     {},
	"sensitivity_beamwidth.json":  {},
	"fault_tolerance.json":        {},
	"cumulative_quality.json":     {},
	"convergence_curve.json":      {},
	"standard_benchmarks.json":    {},
}

func serveBenchmarkDashboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, err := os.Stat(benchmarkDashboardHTML); err != nil {
		http.Error(w, "benchmark dashboard not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	http.ServeFile(w, r, benchmarkDashboardHTML)
}

func serveBenchmarkResultJSON(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	name := strings.TrimPrefix(r.URL.Path, "/api/benchmark/results/")
	name = strings.Trim(name, "/")
	if name == "" || strings.Contains(name, "..") || strings.Contains(name, "/") {
		http.NotFound(w, r)
		return
	}
	if _, ok := allowedBenchmarkResultFiles[name]; !ok {
		http.NotFound(w, r)
		return
	}

	path := filepath.Join(benchmarkResultsDir, name)
	if _, err := os.Stat(path); err != nil {
		http.Error(w, "result file not found; run npm run benchmark", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	http.ServeFile(w, r, path)
}
