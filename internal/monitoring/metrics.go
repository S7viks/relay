package monitoring

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"gaiol/internal/database"

	postgrest "github.com/supabase-community/postgrest-go"
)

// SystemStats represents aggregated system performance metrics
type SystemStats struct {
	TotalRequests    int64              `json:"total_requests"`
	TotalCost        float64            `json:"total_cost"`
	AvgLatencyMs     int64              `json:"avg_latency_ms"`
	SuccessRate      float64            `json:"success_rate"`
	ModelPerformance map[string]float64 `json:"model_performance"` // key: model_id or model_id|task_type
	ProviderHealth   map[string]bool    `json:"provider_health"`
	UpdatedAt        time.Time          `json:"updated_at"`
}

// MetricsService handles aggregation and retrieval of system-wide metrics
type MetricsService struct {
	mu    sync.RWMutex
	stats SystemStats
}

// NewMetricsService creates a new MetricsService
func NewMetricsService() *MetricsService {
	return &MetricsService{
		stats: SystemStats{
			ModelPerformance: make(map[string]float64),
			ProviderHealth:   make(map[string]bool),
		},
	}
}

const apiQueriesSampleLimit = 10000

// RefreshStats pulls latest aggregates from the database.
// Uses HEAD count for total rows on api_queries (requires RLS to allow the anon/service key used by the server).
// Sample-based avg latency / success rate / cost use the most recent api_queriesSampleLimit rows.
func (ms *MetricsService) RefreshStats(ctx context.Context) error {
	client := database.GetClient()
	if client == nil {
		return fmt.Errorf("database client not initialized")
	}

	now := time.Now()
	var totalReq int64
	var avgMs int64
	var successRate float64
	var totalCost float64
	modelPerf := make(map[string]float64)
	providerHealth := make(map[string]bool)

	// Total row count (exact) via HEAD + Content-Range
	_, headCount, headErr := client.From("api_queries").Select("id", "exact", true).Execute()
	if headErr != nil {
		log.Printf("monitoring: api_queries count HEAD: %v", headErr)
	} else {
		totalReq = headCount
	}

	type apiQueryRow struct {
		ProcessingTimeMs *int     `json:"processing_time_ms"`
		Success          *bool    `json:"success"`
		Cost             *float64 `json:"cost"`
	}
	var qRows []apiQueryRow
	_, sampleErr := client.From("api_queries").
		Select("processing_time_ms,success,cost", "", false).
		Order("created_at", &postgrest.OrderOpts{Ascending: false}).
		Limit(apiQueriesSampleLimit, "").
		ExecuteTo(&qRows)
	if sampleErr != nil {
		log.Printf("monitoring: api_queries sample: %v", sampleErr)
	} else if len(qRows) > 0 {
		var sumMs int64
		var nMs int
		var okCount int
		var costSum float64
		for _, r := range qRows {
			if r.Success != nil && *r.Success {
				okCount++
			}
			if r.ProcessingTimeMs != nil {
				sumMs += int64(*r.ProcessingTimeMs)
				nMs++
			}
			if r.Cost != nil {
				costSum += *r.Cost
			}
		}
		successRate = float64(okCount) / float64(len(qRows))
		if nMs > 0 {
			avgMs = sumMs / int64(nMs)
		}
		totalCost = costSum
	}

	// Optional: add session-level cost (may overlap api_queries.cost depending on logging)
	type sessionCostRow struct {
		TotalCost *float64 `json:"total_cost"`
	}
	var sessRows []sessionCostRow
	_, sessErr := client.From("reasoning_sessions").
		Select("total_cost", "", false).
		Limit(20000, "").
		ExecuteTo(&sessRows)
	if sessErr != nil {
		log.Printf("monitoring: reasoning_sessions costs: %v", sessErr)
	} else {
		var sessionSum float64
		for _, r := range sessRows {
			if r.TotalCost != nil {
				sessionSum += *r.TotalCost
			}
		}
		if sessionSum > 0 {
			totalCost = sessionSum
		}
	}

	var modelStats []struct {
		ModelID    string  `json:"model_id"`
		TaskType   string  `json:"task_type"`
		AvgQuality float64 `json:"avg_quality"`
	}
	_, mpErr := client.From("model_performance_agg").
		Select("model_id,task_type,avg_quality", "", false).
		Limit(500, "").
		ExecuteTo(&modelStats)
	if mpErr != nil {
		log.Printf("monitoring: model_performance_agg: %v", mpErr)
	} else {
		for _, s := range modelStats {
			key := s.ModelID
			if s.TaskType != "" {
				key = s.ModelID + "|" + s.TaskType
			}
			modelPerf[key] = s.AvgQuality
		}
	}

	ms.mu.Lock()
	ms.stats.TotalRequests = totalReq
	ms.stats.TotalCost = totalCost
	ms.stats.AvgLatencyMs = avgMs
	ms.stats.SuccessRate = successRate
	ms.stats.ModelPerformance = modelPerf
	ms.stats.ProviderHealth = providerHealth
	ms.stats.UpdatedAt = now
	ms.mu.Unlock()

	return nil
}

// GetStats returns the current stats
func (ms *MetricsService) GetStats() SystemStats {
	ms.mu.RLock()
	defer ms.mu.RUnlock()
	return ms.stats
}
