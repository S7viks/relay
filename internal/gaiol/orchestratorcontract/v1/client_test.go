package v1

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClient_Orchestrate_RoundTrip(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/orchestrate" {
			http.NotFound(w, r)
			return
		}
		var got OrchestrateRequestV1
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := ValidateOrchestrateRequestV1(&got); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		out := OrchestrateResponseV1{
			SchemaVersion: "1.0",
			TraceID:       got.TraceID,
			SessionID:     got.SessionID,
			Answer:        "ok",
			Trace: OrchestrationTraceV1{
				TraceID: got.TraceID,
				Domain:  got.Domain,
				Decomposition: DecompositionV1{
					Subtasks: []SubtaskSpecV1{
						{ID: "s1", Title: "main", Description: got.Objective, TaskKind: got.TaskKind},
					},
				},
				Subtasks: []SubtaskTraceV1{
					{
						SubtaskID:      "s1",
						RoutedModelIDs: []string{"m1"},
						Calls: []ModelCallV1{
							{ModelID: "m1", ProviderID: "mock", Text: "x", LatencyMs: 1},
						},
						Scores: map[string]float64{"m1": 0.5},
					},
				},
				StartedAt:  "2020-01-01T00:00:00.000Z",
				FinishedAt: "2020-01-01T00:00:01.000Z",
			},
			TrustUpdates: []TrustUpdateEventV1{},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}))
	defer ts.Close()

	cl := NewClient(ts.URL)
	cl.HTTP = ts.Client()

	req := &OrchestrateRequestV1{
		SchemaVersion: "1.0",
		TraceID:       "11111111-1111-1111-1111-111111111111",
		SessionID:     "sess-a",
		Domain:        "general",
		TaskKind:      "qa",
		Objective:     "ping",
		Messages:      []ChatMessageV1{{Role: "user", Content: "ping"}},
	}
	res, err := cl.Orchestrate(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if res.Answer != "ok" || res.TraceID != req.TraceID {
		t.Fatalf("unexpected response: %+v", res)
	}
}

func TestClient_GetTraceBundle(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/traces/t1" || r.Method != http.MethodGet {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"trace":{"trace_id":"t1"},"timeline_rebuilt":[],"metrics_summary":{}}`))
	}))
	defer ts.Close()

	cl := NewClient(ts.URL)
	cl.HTTP = ts.Client()
	body, status, err := cl.GetTraceBundle(context.Background(), "t1")
	if err != nil {
		t.Fatal(err)
	}
	if status != http.StatusOK {
		t.Fatalf("status %d: %s", status, body)
	}
	if !bytes.Contains(body, []byte(`"trace_id":"t1"`)) {
		t.Fatalf("body: %s", body)
	}
}

func TestValidateOrchestrateRequestV1_RejectsBadVersion(t *testing.T) {
	err := ValidateOrchestrateRequestV1(&OrchestrateRequestV1{
		SchemaVersion: "0.9",
		TraceID:       "t",
		Domain:        "d",
		TaskKind:      "qa",
		Objective:     "o",
		Messages:      []ChatMessageV1{{Role: "user", Content: "x"}},
	})
	if err == nil {
		t.Fatal("expected error")
	}
}
