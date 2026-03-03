package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"relay/internal/models"
)

// Scorer handles output evaluation using a critic model
type Scorer struct {
	Router  *models.ModelRouter
	Tracker *models.PerformanceTracker // NEW: For learning loop
}

// NewScorer creates a new scorer
func NewScorer(router *models.ModelRouter, tracker *models.PerformanceTracker) *Scorer {
	return &Scorer{
		Router:  router,
		Tracker: tracker,
	}
}

// ScoreOutput evaluates a single model output using a critic agent
func (s *Scorer) ScoreOutput(ctx context.Context, objective, response, modelID string, task models.TaskType) (MetricScores, error) {
	start := time.Now()
	prompt := fmt.Sprintf("Objective: %s\n\nResponse to Evaluate: %s", objective, response)

	// Use reasoning's QueryModel wrapper
	qm := NewQueryModel(s.Router)
	promptFull := SystemPromptScorer + "\n\n" + prompt

	resp, err := qm.Query(ctx, "anthropic/claude-3-5-sonnet", promptFull)

	latency := time.Since(start).Milliseconds()

	if err != nil {
		if s.Tracker != nil {
			s.Tracker.Record(ctx, models.ModelPerformance{
				ModelID:   modelID,
				Task:      task,
				Status:    "error",
				LatencyMs: latency,
			})
		}
		return MetricScores{}, err
	}

	cleanResp := s.cleanJSONResponse(resp)

	var scores MetricScores
	err = json.Unmarshal([]byte(cleanResp), &scores)
	if err != nil {
		if s.Tracker != nil {
			s.Tracker.Record(ctx, models.ModelPerformance{
				ModelID:   modelID,
				Task:      task,
				Status:    "parse_error",
				LatencyMs: latency,
			})
		}
		return MetricScores{}, fmt.Errorf("failed to parse score JSON: %v", err)
	}

	// Record success
	if s.Tracker != nil {
		s.Tracker.Record(ctx, models.ModelPerformance{
			ModelID:      modelID,
			Task:         task,
			Status:       "success",
			LatencyMs:    latency,
			QualityScore: s.calculateWeightedScore(scores, "balanced"), // Default for tracking
		})
	}

	return scores, nil
}

func (s *Scorer) calculateWeightedScore(scores MetricScores, profile string) float64 {
	weights := map[string]float64{
		"relevance":    0.2,
		"coherence":    0.2,
		"completeness": 0.2,
		"accuracy":     0.2,
		"creativity":   0.2,
	}

	switch profile {
	case "quality":
		weights["accuracy"] = 0.4
		weights["relevance"] = 0.3
		weights["creativity"] = 0.1
	case "speed":
		// Speed profile might care more about relevance and brevity (completeness)
		weights["relevance"] = 0.4
		weights["completeness"] = 0.3
	}

	total := (scores.Relevance * weights["relevance"]) +
		(scores.Coherence * weights["coherence"]) +
		(scores.Completeness * weights["completeness"]) +
		(scores.Accuracy * weights["accuracy"]) +
		(scores.Creativity * weights["creativity"])

	return total
}

// cleanJSONResponse removes markdown code blocks
func (s *Scorer) cleanJSONResponse(resp string) string {
	resp = strings.TrimSpace(resp)
	if strings.HasPrefix(resp, "```json") {
		resp = strings.TrimPrefix(resp, "```json")
		resp = strings.TrimSuffix(resp, "```")
	} else if strings.HasPrefix(resp, "```") {
		resp = strings.TrimPrefix(resp, "```")
		resp = strings.TrimSuffix(resp, "```")
	}
	return strings.TrimSpace(resp)
}

// ScoreMultipleOutputs scores a batch of outputs in parallel
func (s *Scorer) ScoreMultipleOutputs(ctx context.Context, objective string, outputs []ModelOutput, task models.TaskType, profile string) ([]ModelOutput, error) {
	var wg sync.WaitGroup
	mu := sync.Mutex{}

	for i := range outputs {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			scores, err := s.ScoreOutput(ctx, objective, outputs[idx].Response, outputs[idx].ModelID, task)
			if err == nil {
				// Calculate weighted overall score
				scores.Overall = s.calculateWeightedScore(scores, profile)
				mu.Lock()
				outputs[idx].Scores = scores
				mu.Unlock()
			}
		}(i)
	}

	wg.Wait()
	return outputs, nil
}
