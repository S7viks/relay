package v1

import (
	"testing"
)

func TestSummarizeOrchestrationTrace(t *testing.T) {
	cost := 0.01
	trace := &OrchestrationTraceV1{
		TraceID:   "t1",
		Domain:    "d",
		StartedAt: "2025-01-01T00:00:00.000Z",
		FinishedAt: "2025-01-01T00:00:01.000Z",
		Decomposition: DecompositionV1{Subtasks: []SubtaskSpecV1{{ID: "s1", Title: "x", Description: "", TaskKind: "qa"}}},
		Subtasks: []SubtaskTraceV1{
			{
				SubtaskID:      "s1",
				RoutedModelIDs: []string{"a", "b"},
				Calls: []ModelCallV1{
					{ModelID: "a", ProviderID: "pa", Text: "", LatencyMs: 10, Error: "x"},
					{ModelID: "b", ProviderID: "pb", Text: "ok", LatencyMs: 20, Usage: &ModelCallUsageV1{CostUsd: &cost}},
				},
				Scores: map[string]float64{"a": 0, "b": 1},
				PathExploration: &PathExplorationTraceV1{
					Pruning: BeamPruneTraceV1{BeamWidth: 2, KeptPathIDs: []string{"p1"}, DiscardedPathIDs: []string{"p2"}},
				},
			},
		},
	}
	s := SummarizeOrchestrationTrace(trace, 2)
	if s == nil {
		t.Fatal("nil summary")
	}
	if s.TotalModelCalls != 2 || s.SuccessfulModelCalls != 1 || s.FailedModelCalls != 1 {
		t.Fatalf("calls: %+v", s)
	}
	if s.TotalRetries != 2 {
		t.Fatalf("retries: %d", s.TotalRetries)
	}
	if s.CostUSD.Total < 0.009 || s.CostUSD.Total > 0.011 {
		t.Fatalf("cost: %v", s.CostUSD.Total)
	}
	if s.Beam.PrunedPathCount != 1 || s.Beam.KeptPathCount != 1 {
		t.Fatalf("beam: %+v", s.Beam)
	}
	if s.LatencyMs.Max != 20 || s.LatencyMs.Count != 2 {
		t.Fatalf("latency: %+v", s.LatencyMs)
	}
}
