package v1

import (
	"math"
	"sort"
	"time"
)

// OrchestrationMetricsSummary mirrors the TS metrics_summary shape for dashboards (JSON-friendly).
type OrchestrationMetricsSummary struct {
	TraceID               string             `json:"trace_id"`
	Domain                string             `json:"domain"`
	DurationMs            int64              `json:"duration_ms"`
	SubtaskCount          int                `json:"subtask_count"`
	TotalModelCalls       int                `json:"total_model_calls"`
	SuccessfulModelCalls  int                `json:"successful_model_calls"`
	FailedModelCalls      int                `json:"failed_model_calls"`
	TotalRetries          int                `json:"total_retries"`
	LatencyMs             LatencySummary     `json:"latency_ms"`
	CostUSD               CostSummary        `json:"cost_usd"`
	Beam                  BeamSummary        `json:"beam"`
	Trust                 TrustMetricsSummary `json:"trust"`
}

type LatencySummary struct {
	Max   int64    `json:"max"`
	Sum   int64    `json:"sum"`
	Count int      `json:"count"`
	Avg   *float64 `json:"avg,omitempty"`
	P50   *float64 `json:"p50,omitempty"`
	P90   *float64 `json:"p90,omitempty"`
}

type CostSummary struct {
	Total      float64            `json:"total"`
	ByModel    map[string]float64 `json:"by_model"`
	ByProvider map[string]float64 `json:"by_provider"`
}

type BeamSummary struct {
	MaxBeamWidth     int `json:"max_beam_width"`
	PrunedPathCount  int `json:"pruned_path_count"`
	KeptPathCount    int `json:"kept_path_count"`
}

type TrustMetricsSummary struct {
	TrustRoundCount     int      `json:"trust_round_count"`
	PersistedEntryCount int      `json:"persisted_entry_count"`
	MeanTrustMeanDelta  *float64 `json:"mean_trust_mean_delta,omitempty"`
}

func percentileSorted(sorted []int64, p int) *float64 {
	if len(sorted) == 0 {
		return nil
	}
	idx := int(math.Ceil(float64(p)/100*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	v := float64(sorted[idx])
	return &v
}

// SummarizeOrchestrationTrace aggregates latency, cost, success, beam, and trust movement from a completed v1 trace.
func SummarizeOrchestrationTrace(trace *OrchestrationTraceV1, totalRetries int) *OrchestrationMetricsSummary {
	if trace == nil {
		return nil
	}
	started, _ := time.Parse(time.RFC3339Nano, trace.StartedAt)
	finished, _ := time.Parse(time.RFC3339Nano, trace.FinishedAt)
	durationMs := int64(0)
	if !started.IsZero() && !finished.IsZero() && !finished.Before(started) {
		durationMs = finished.Sub(started).Milliseconds()
	}

	var latencies []int64
	var latSum int64
	byModel := map[string]float64{}
	byProvider := map[string]float64{}
	costTotal := 0.0
	totalCalls, okCalls, failCalls := 0, 0, 0
	maxBeam := 0
	pruned, kept := 0, 0
	trustRounds := 0
	persistedTrust := 0
	var trustDeltas []float64

	for _, st := range trace.Subtasks {
		if st.PathExploration != nil {
			maxBeam = maxInt(maxBeam, st.PathExploration.Pruning.BeamWidth)
			pruned += len(st.PathExploration.Pruning.DiscardedPathIDs)
			kept += len(st.PathExploration.Pruning.KeptPathIDs)
		}
		if st.TrustRound != nil {
			trustRounds++
			for _, e := range st.TrustRound.Entries {
				if e.Persisted {
					persistedTrust++
				}
				trustDeltas = append(trustDeltas, e.PosteriorMean-e.PriorMean)
			}
		}
		for _, c := range st.Calls {
			totalCalls++
			if c.Error != "" {
				failCalls++
			} else {
				okCalls++
			}
			latencies = append(latencies, c.LatencyMs)
			latSum += c.LatencyMs
			cost := 0.0
			if c.Usage != nil && c.Usage.CostUsd != nil {
				cost = *c.Usage.CostUsd
			}
			costTotal += cost
			byModel[c.ModelID] += cost
			byProvider[c.ProviderID] += cost
		}
	}

	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
	count := len(latencies)
	var maxLat int64
	if count > 0 {
		maxLat = latencies[count-1]
	}
	lat := LatencySummary{Max: maxLat, Sum: latSum, Count: count}
	if count > 0 {
		avg := float64(latSum) / float64(count)
		lat.Avg = &avg
		lat.P50 = percentileSorted(latencies, 50)
		lat.P90 = percentileSorted(latencies, 90)
	}

	var meanDelta *float64
	if len(trustDeltas) > 0 {
		s := 0.0
		for _, d := range trustDeltas {
			s += d
		}
		v := s / float64(len(trustDeltas))
		meanDelta = &v
	}

	return &OrchestrationMetricsSummary{
		TraceID:              trace.TraceID,
		Domain:               trace.Domain,
		DurationMs:           durationMs,
		SubtaskCount:         len(trace.Subtasks),
		TotalModelCalls:      totalCalls,
		SuccessfulModelCalls: okCalls,
		FailedModelCalls:     failCalls,
		TotalRetries:         totalRetries,
		LatencyMs:            lat,
		CostUSD: CostSummary{
			Total:      costTotal,
			ByModel:    byModel,
			ByProvider: byProvider,
		},
		Beam: BeamSummary{
			MaxBeamWidth:    maxBeam,
			PrunedPathCount: pruned,
			KeptPathCount:   kept,
		},
		Trust: TrustMetricsSummary{
			TrustRoundCount:     trustRounds,
			PersistedEntryCount: persistedTrust,
			MeanTrustMeanDelta:  meanDelta,
		},
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
