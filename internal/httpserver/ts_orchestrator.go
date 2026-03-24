package httpserver

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"gaiol/internal/apijson"
	"gaiol/internal/database"
	orchestratorv1 "gaiol/internal/gaiol/orchestratorcontract/v1"

	"github.com/google/uuid"
)

func envBool(key string) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	return v == "1" || v == "true" || v == "yes" || v == "y" || v == "on"
}

func tsExplorePathsDefaultOn() bool {
	v := strings.TrimSpace(os.Getenv("GAIOL_TS_EXPLORE_PATHS"))
	if v == "" {
		return true
	}
	return envBool("GAIOL_TS_EXPLORE_PATHS")
}

func tsBeamWidth() int {
	n, err := strconv.Atoi(strings.TrimSpace(os.Getenv("GAIOL_TS_BEAM_WIDTH")))
	if err != nil || n < 1 {
		return 2
	}
	return n
}

func tsConsensusMode() string {
	m := strings.TrimSpace(strings.ToLower(os.Getenv("GAIOL_TS_CONSENSUS_MODE")))
	if m == "uniform" || m == "static" || m == "abtc" {
		return m
	}
	return "abtc"
}

func tsDomain() string {
	d := strings.TrimSpace(os.Getenv("GAIOL_TS_DOMAIN"))
	if d == "" {
		return "general"
	}
	return d
}

func mapTaskKindV1(task string) string {
	switch strings.ToLower(strings.TrimSpace(task)) {
	case "code":
		return "code"
	case "summarization", "summarize":
		return "summarization"
	case "reasoning":
		return "reasoning"
	case "creative":
		return "creative"
	case "tool_use", "tool":
		return "tool_use"
	case "unknown":
		return "unknown"
	default:
		return "qa"
	}
}

// tryQuerySmartViaTSOrchestrator writes the smart-query JSON response and returns true if delegation succeeded.
func (d *Deps) tryQuerySmartViaTSOrchestrator(
	w http.ResponseWriter,
	r *http.Request,
	prompt string,
	task string,
	strategy string,
	maxTokens int,
	temp float64,
	tenantCtx database.TenantContext,
) bool {
	if !d.TSOrchestratorDelegate || d.TSOrchestrator == nil {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(strategy), "go_reasoning") {
		return false
	}

	ctx := r.Context()
	traceID := uuid.New().String()
	explore := tsExplorePathsDefaultOn()
	if strings.EqualFold(strings.TrimSpace(strategy), "beam") {
		explore = true
	}
	bw := tsBeamWidth()
	consensus := tsConsensusMode()
	maxTok := maxTokens
	tempPtr := temp

	reqV1 := &orchestratorv1.OrchestrateRequestV1{
		SchemaVersion: "1.0",
		TraceID:       traceID,
		Domain:        tsDomain(),
		TaskKind:      mapTaskKindV1(task),
		Objective:     prompt,
		Messages: []orchestratorv1.ChatMessageV1{
			{Role: "user", Content: prompt},
		},
		Constraints: &orchestratorv1.TaskConstraintsV1{
			Temperature:     &tempPtr,
			MaxOutputTokens: &maxTok,
		},
		ExplorePaths:  &explore,
		BeamWidth:     &bw,
		ConsensusMode: consensus,
	}
	if tenantCtx.TenantID != "" {
		sid := tenantCtx.TenantID
		reqV1.SessionID = sid
	}

	res, err := d.TSOrchestrator.Orchestrate(ctx, reqV1)
	if err != nil {
		log.Printf("TS orchestrator delegate failed (falling back to Go reasoning): %v", err)
		return false
	}

	metrics := orchestratorv1.SummarizeOrchestrationTrace(&res.Trace, 0)
	totalCost := 0.0
	if metrics != nil {
		totalCost = metrics.CostUSD.Total
	}

	if d.DB != nil && tenantCtx.TenantID != "" {
		_ = logUsageToAPIQueries(d.DB, tenantCtx, "ts-orchestrator", 0, totalCost, 0, true, "", traceID)
	}

	processingMs := int64(0)
	if metrics != nil {
		processingMs = metrics.DurationMs
	}

	response := map[string]interface{}{
		"uaip": true,
		"status": map[string]interface{}{
			"success": true,
		},
		"result": map[string]interface{}{
			"data":          res.Answer,
			"tokens_used":   0,
			"model_used":    "typescript-orchestrator",
			"processing_ms": processingMs,
			"quality":       1.0,
		},
		"metadata": map[string]interface{}{
			"cost_info": map[string]interface{}{
				"total_cost": totalCost,
			},
			"session_id":     traceID,
			"steps_executed": len(res.Trace.Subtasks),
			"engine":         "typescript_orchestrator",
			"trace_id":       res.TraceID,
		},
		"model_id":    "typescript-orchestrator",
		"model_name":  "GAIOL TypeScript Orchestrator",
		"response":    res.Answer,
		"tokens_used": 0,
		"cost":        totalCost,
		"latency_ms":  processingMs,
		"quality":     1.0,
		"strategy":    "ts_orchestrator",
		"orchestration": map[string]interface{}{
			"schema_version":      res.SchemaVersion,
			"trace_id":            res.TraceID,
			"trust_updates_count": len(res.TrustUpdates),
			"consensus_mode":      consensus,
			"explore_paths":       explore,
			"beam_width":          bw,
		},
		"orchestration_trace":        res.Trace,
		"orchestration_trust_updates": res.TrustUpdates,
		"orchestration_metrics":      metrics,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("encode ts orchestrator response: %v", err)
	}
	return true
}

// handleOrchestrationTraceProxy proxies GET /api/orchestration/traces/:id to the TS service GET /v1/traces/:id.
func (d *Deps) handleOrchestrationTraceProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if d.TSOrchestrator == nil {
		apijson.WriteError(w, http.StatusServiceUnavailable, "TS orchestrator client not configured", "ts_orchestrator_disabled")
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/orchestration/traces/")
	id = strings.Trim(id, "/")
	if id == "" || strings.Contains(id, "/") {
		http.Error(w, "trace id required", http.StatusBadRequest)
		return
	}
	ctx, cancelFn := contextWithOptionalTimeout(r.Context(), 30*time.Second)
	defer cancelFn()
	body, status, err := d.TSOrchestrator.GetTraceBundle(ctx, id)
	if err != nil {
		log.Printf("orchestration trace proxy: %v", err)
		apijson.WriteError(w, http.StatusBadGateway, "orchestrator unreachable", "orchestrator_upstream_error")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// handleOrchestrationTrustProxy proxies GET /api/orchestration/trust to TS GET /v1/trust.
func (d *Deps) handleOrchestrationTrustProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if d.TSOrchestrator == nil {
		apijson.WriteError(w, http.StatusServiceUnavailable, "TS orchestrator client not configured", "ts_orchestrator_disabled")
		return
	}
	ctx, cancelFn := contextWithOptionalTimeout(r.Context(), 15*time.Second)
	defer cancelFn()
	domain := strings.TrimSpace(r.URL.Query().Get("domain"))
	body, status, err := d.TSOrchestrator.GetTrustJSON(ctx, domain)
	if err != nil {
		log.Printf("orchestration trust proxy: %v", err)
		apijson.WriteError(w, http.StatusBadGateway, "orchestrator unreachable", "orchestrator_upstream_error")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// handleOrchestrationTraceIDsProxy proxies GET /api/orchestration/trace-ids to TS GET /v1/traces?limit=.
func (d *Deps) handleOrchestrationTraceIDsProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if d.TSOrchestrator == nil {
		apijson.WriteError(w, http.StatusServiceUnavailable, "TS orchestrator client not configured", "ts_orchestrator_disabled")
		return
	}
	limit := 50
	if s := strings.TrimSpace(r.URL.Query().Get("limit")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			limit = n
		}
	}
	ctx, cancelFn := contextWithOptionalTimeout(r.Context(), 15*time.Second)
	defer cancelFn()
	body, status, err := d.TSOrchestrator.GetTraceIndexJSON(ctx, limit)
	if err != nil {
		log.Printf("orchestration trace-ids proxy: %v", err)
		apijson.WriteError(w, http.StatusBadGateway, "orchestrator unreachable", "orchestrator_upstream_error")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// handleOrchestrationEvalContainsProxy proxies POST /api/orchestration/eval/contains to TS.
func (d *Deps) handleOrchestrationEvalContainsProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if d.TSOrchestrator == nil {
		apijson.WriteError(w, http.StatusServiceUnavailable, "TS orchestrator client not configured", "ts_orchestrator_disabled")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		apijson.WriteError(w, http.StatusBadRequest, "read body", "bad_request")
		return
	}
	ctx, cancelFn := contextWithOptionalTimeout(r.Context(), 30*time.Second)
	defer cancelFn()
	body, status, err := d.TSOrchestrator.PostEvalContainsJSON(ctx, raw)
	if err != nil {
		log.Printf("orchestration eval proxy: %v", err)
		apijson.WriteError(w, http.StatusBadGateway, "orchestrator unreachable", "orchestrator_upstream_error")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func contextWithOptionalTimeout(parent context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	if _, hasDeadline := parent.Deadline(); hasDeadline {
		return parent, func() {}
	}
	return context.WithTimeout(parent, d)
}
