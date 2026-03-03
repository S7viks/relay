package models

import (
	"context"
	"fmt"
	"sync"
	"time"

	"relay/internal/database"
)

// ModelPerformance represents a single performance record
type ModelPerformance struct {
	ModelID      string    `json:"model_id"`
	Task         TaskType  `json:"task_type"`
	QualityScore float64   `json:"quality_score"`
	LatencyMs    int64     `json:"latency_ms"`
	TokensUsed   int       `json:"tokens_used"`
	Status       string    `json:"status"`
	SessionID    string    `json:"session_id"`
	CreatedAt    time.Time `json:"created_at"`
}

// PerformanceTracker handles recording and analyzing model benchmarks
type PerformanceTracker struct {
	db        *database.Client
	learnedMu sync.RWMutex
	cache     map[string]float64 // model_id + task -> learned quality
}

// NewPerformanceTracker creates a new performance tracker
func NewPerformanceTracker(db *database.Client) *PerformanceTracker {
	return &PerformanceTracker{
		db:    db,
		cache: make(map[string]float64),
	}
}

// Record observes and saves performance for a model call
func (pt *PerformanceTracker) Record(ctx context.Context, perf ModelPerformance) error {
	if pt.db == nil || pt.db.Client == nil {
		return nil
	}

	// Insert into DB
	_, _, err := pt.db.From("model_performance").Insert(perf, false, "", "", "").Execute()
	if err != nil {
		return fmt.Errorf("failed to record model performance: %w", err)
	}

	return nil
}

// GetLearnedQuality returns the historically observed quality for a model/task combo
func (pt *PerformanceTracker) GetLearnedQuality(modelID string, task TaskType) (float64, bool) {
	pt.learnedMu.RLock()
	defer pt.learnedMu.RUnlock()

	key := fmt.Sprintf("%s:%s", modelID, task)
	val, ok := pt.cache[key]
	return val, ok
}

// RefreshCache pulls latest aggregates from DB
func (pt *PerformanceTracker) RefreshCache(ctx context.Context) error {
	if pt.db == nil || pt.db.Client == nil {
		return nil
	}

	var results []struct {
		ModelID    string   `json:"model_id"`
		TaskType   TaskType `json:"task_type"`
		AvgQuality float64  `json:"avg_quality"`
	}

	// Query the view
	_, err := pt.db.From("model_performance_agg").Select("*", "", false).ExecuteTo(&results)
	if err != nil {
		return fmt.Errorf("failed to refresh performance cache: %w", err)
	}

	pt.learnedMu.Lock()
	defer pt.learnedMu.Unlock()
	for _, res := range results {
		key := fmt.Sprintf("%s:%s", res.ModelID, res.TaskType)
		pt.cache[key] = res.AvgQuality
	}

	return nil
}
