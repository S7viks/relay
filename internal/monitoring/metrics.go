package monitoring

import (
	"context"
	"fmt"
	"sync"
	"time"

	"relay/internal/database"
)

// SystemStats represents aggregated system performance metrics
type SystemStats struct {
	TotalRequests    int64              `json:"total_requests"`
	TotalCost        float64            `json:"total_cost"`
	AvgLatencyMs     int64              `json:"avg_latency_ms"`
	SuccessRate      float64            `json:"success_rate"`
	ModelPerformance map[string]float64 `json:"model_performance"` // model_id -> avg_quality
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

// RefreshStats pulls latest aggregates from the database
func (ms *MetricsService) RefreshStats(ctx context.Context) error {
	client := database.GetClient()
	if client == nil {
		return fmt.Errorf("database client not initialized")
	}

	// 1. Get total requests and success rate from api_queries
	var queryStats []struct {
		Count   int64   `json:"count"`
		AvgTime float64 `json:"avg_time"`
		Success int64   `json:"success_count"`
	}

	// Simplified: just getting some basic counts for now
	// In a real scenario, we'd use complex SQL or views
	_, err := client.From("api_queries").Select("id", "count", true).ExecuteTo(&queryStats)
	// For now, let's assume we use a specialized RPC or simpler queries

	// 2. Get total cost from reasoning_sessions
	var costResult []struct {
		TotalCost float64 `json:"total_cost"`
	}
	_, err = client.From("reasoning_sessions").Select("total_cost.sum()", "", false).ExecuteTo(&costResult)
	if err == nil && len(costResult) > 0 {
		ms.mu.Lock()
		ms.stats.TotalCost = costResult[0].TotalCost
		ms.mu.Unlock()
	}

	// 3. Get model performance from model_performance_agg view
	var modelStats []struct {
		ModelID    string  `json:"model_id"`
		AvgQuality float64 `json:"avg_quality"`
	}
	_, err = client.From("model_performance_agg").Select("model_id, avg_quality", "", false).ExecuteTo(&modelStats)
	if err == nil {
		ms.mu.Lock()
		for _, s := range modelStats {
			ms.stats.ModelPerformance[s.ModelID] = s.AvgQuality
		}
		ms.mu.Unlock()
	}

	ms.mu.Lock()
	ms.stats.UpdatedAt = time.Now()
	ms.mu.Unlock()

	return nil
}

// GetStats returns the current stats
func (ms *MetricsService) GetStats() SystemStats {
	ms.mu.RLock()
	defer ms.mu.RUnlock()
	return ms.stats
}
