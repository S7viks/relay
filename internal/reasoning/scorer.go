package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"gaiol/internal/models"
)

// Scorer handles output evaluation using a critic model
type Scorer struct {
	Router *models.ModelRouter
}

// NewScorer creates a new scorer
func NewScorer(router *models.ModelRouter) *Scorer {
	return &Scorer{
		Router: router,
	}
}

// ScoreOutput evaluates a single model output using a critic agent
func (s *Scorer) ScoreOutput(ctx context.Context, objective, response string) (MetricScores, error) {
	prompt := fmt.Sprintf("Objective: %s\n\nResponse to Evaluate: %s", objective, response)

	// Use reasoning's QueryModel wrapper
	qm := NewQueryModel(s.Router)
	promptFull := SystemPromptCritic + "\n\n" + prompt

	resp, err := qm.Query(ctx, "anthropic/claude-3-5-sonnet", promptFull)
	if err != nil {
		return MetricScores{}, err
	}

	cleanResp := s.cleanJSONResponse(resp)

	var scores MetricScores
	err = json.Unmarshal([]byte(cleanResp), &scores)
	if err != nil {
		return MetricScores{}, fmt.Errorf("failed to parse score JSON: %v", err)
	}

	return scores, nil
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
func (s *Scorer) ScoreMultipleOutputs(ctx context.Context, objective string, outputs []ModelOutput) ([]ModelOutput, error) {
	var wg sync.WaitGroup
	mu := sync.Mutex{}

	for i := range outputs {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			scores, err := s.ScoreOutput(ctx, objective, outputs[idx].Response)
			if err == nil {
				mu.Lock()
				outputs[idx].Scores = scores
				mu.Unlock()
			}
		}(i)
	}

	wg.Wait()
	return outputs, nil
}
