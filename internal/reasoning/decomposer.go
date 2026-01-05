package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"gaiol/internal/models"
)

// DecomposedStep represents a raw step from the LLM
type DecomposedStep struct {
	Title     string `json:"title"`
	Objective string `json:"objective"`
}

// Decomposer handles breaking down prompts into steps
type Decomposer struct {
	Router *models.ModelRouter
}

// NewDecomposer creates a new decomposer
func NewDecomposer(router *models.ModelRouter) *Decomposer {
	return &Decomposer{
		Router: router,
	}
}

// DecomposePrompt takes a user prompt and returns a list of ReasoningSteps
func (d *Decomposer) DecomposePrompt(ctx context.Context, prompt string) ([]ReasoningStep, error) {
	// Prepare the request for the decomposer (ideally using a strong model like GPT-4)
	// Use reasoning's QueryModel wrapper
	qm := NewQueryModel(d.Router)
	prompt_full := SystemPromptDecomposer + "\n\n" + prompt

	resp, err := qm.Query(ctx, "anthropic/claude-3-5-sonnet", prompt_full)
	if err != nil {
		return nil, fmt.Errorf("failed to query decomposer model: %v", err)
	}

	// Clean the response (sometimes LLMs wrap JSON in markdown blocks)
	cleanResp := d.cleanJSONResponse(resp)

	var rawSteps []DecomposedStep
	err = json.Unmarshal([]byte(cleanResp), &rawSteps)
	if err != nil {
		return nil, fmt.Errorf("failed to parse decomposition JSON: %v. Response was: %s", err, cleanResp)
	}

	// Convert raw steps to ReasoningStep structs
	steps := make([]ReasoningStep, len(rawSteps))
	for i, rs := range rawSteps {
		steps[i] = ReasoningStep{
			Index:     i,
			Title:     rs.Title,
			Objective: rs.Objective,
			Status:    "pending",
		}
	}

	return steps, nil
}

// DecomposeWithRetry attempts to decompose the prompt with fallback/retry logic
func (d *Decomposer) DecomposeWithRetry(ctx context.Context, prompt string, maxRetries int) ([]ReasoningStep, error) {
	var lastErr error
	for i := 0; i < maxRetries; i++ {
		steps, err := d.DecomposePrompt(ctx, prompt)
		if err == nil {
			if d.validateSteps(steps) {
				return steps, nil
			}
			lastErr = fmt.Errorf("steps failed sanity check")
		} else {
			lastErr = err
		}
	}
	return nil, fmt.Errorf("failed to decompose after %d attempts: %v", maxRetries, lastErr)
}

// validateSteps checks if the steps are logically sound
func (d *Decomposer) validateSteps(steps []ReasoningStep) bool {
	if len(steps) == 0 {
		return false
	}
	// Add more complex validation logic here if needed
	// e.g., checking for empty titles or objectives
	for _, step := range steps {
		if strings.TrimSpace(step.Title) == "" || strings.TrimSpace(step.Objective) == "" {
			return false
		}
	}
	return true
}

// cleanJSONResponse removes markdown code blocks if present
func (d *Decomposer) cleanJSONResponse(resp string) string {
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
