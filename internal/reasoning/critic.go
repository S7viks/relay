package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// CriticFeedback represents the critic's evaluation of an output
type CriticFeedback struct {
	IsAcceptable bool     `json:"acceptable"`
	QualityScore float64  `json:"quality_score"`
	Issues       []string `json:"issues"`
	Suggestions  []string `json:"suggestions"`
	Reasoning    string   `json:"reasoning"`
}

// ReflectionConfig defines configuration for self-reflection
type ReflectionConfig struct {
	Enabled         bool    `json:"enabled"`
	MinQualityScore float64 `json:"min_quality"`
	MaxRetries      int     `json:"max_retries"`
	CriticModelID   string  `json:"critic_model"`
}

// DefaultReflectionConfig returns sensible defaults
func DefaultReflectionConfig() ReflectionConfig {
	return ReflectionConfig{
		Enabled:         false, // Disabled by default to avoid extra costs
		MinQualityScore: 0.75,
		MaxRetries:      2,
		CriticModelID:   "anthropic/claude-3-5-sonnet", // Best for evaluation
	}
}

// Critic evaluates model outputs for quality
type Critic struct {
	queryModel *QueryModel
	config     ReflectionConfig
}

// NewCritic creates a new critic agent
func NewCritic(queryModel *QueryModel, config ReflectionConfig) *Critic {
	return &Critic{
		queryModel: queryModel,
		config:     config,
	}
}

// ValidateOutput evaluates a selected output for quality
func (c *Critic) ValidateOutput(
	ctx context.Context,
	step ReasoningStep,
	selectedOutput ModelOutput,
	sharedMemory *SharedMemory,
) (CriticFeedback, error) {
	// Build critic prompt
	prompt := c.buildCriticPrompt(step, selectedOutput, sharedMemory)

	// Query the critic model
	response, err := c.queryModel.Query(ctx, c.config.CriticModelID, prompt)
	if err != nil {
		return CriticFeedback{}, fmt.Errorf("critic query failed: %w", err)
	}

	// Parse the critic's response
	feedback, err := c.parseCriticResponse(response)
	if err != nil {
		// If parsing fails, use a lenient fallback
		return CriticFeedback{
			IsAcceptable: true, // Assume acceptable if we can't evaluate
			QualityScore: 0.8,
			Issues:       []string{"Unable to parse critic feedback"},
			Suggestions:  []string{},
			Reasoning:    "Fallback: Could not validate properly",
		}, nil
	}

	// Apply quality threshold
	feedback.IsAcceptable = feedback.QualityScore >= c.config.MinQualityScore

	return feedback, nil
}

// buildCriticPrompt constructs the evaluation prompt
func (c *Critic) buildCriticPrompt(
	step ReasoningStep,
	output ModelOutput,
	memory *SharedMemory,
) string {
	// Get recent context
	contextSummary := c.buildContextSummary(memory)

	prompt := fmt.Sprintf(`You are an expert AI critic evaluating the quality of AI-generated content.

ORIGINAL USER PROMPT: %s

CURRENT STEP OBJECTIVE: %s
STEP DESCRIPTION: %s

RELEVANT CONTEXT:
%s

OUTPUT TO EVALUATE:
%s

Please evaluate this output based on the following criteria:
1. **Relevance** - Does it directly address the step's objective?
2. **Accuracy** - Is the information factually correct and well-reasoned?
3. **Completeness** - Are all important aspects covered?
4. **Coherence** - Is it logically structured and clear?
5. **Usefulness** - Does it contribute meaningfully to solving the overall problem?

Provide your evaluation in the following JSON format:
{
  "acceptable": true or false,
  "quality_score": 0.0 to 1.0,
  "issues": ["list of specific problems found"],
  "suggestions": ["specific improvements to make"],
  "reasoning": "brief explanation of your evaluation"
}

Be critical but fair. Focus on substance over style.`,
		memory.OriginalPrompt,
		step.Title,
		step.Objective,
		contextSummary,
		output.Response,
	)

	return prompt
}

// buildContextSummary creates a concise summary of the reasoning context
func (c *Critic) buildContextSummary(memory *SharedMemory) string {
	var parts []string

	// Include previous steps if any
	if len(memory.SelectedPath) > 0 {
		parts = append(parts, "Previous Steps:")
		for i, pathOutput := range memory.SelectedPath {
			step := memory.Steps[i]
			summary := pathOutput.Response
			if len(summary) > 200 {
				summary = summary[:200] + "..."
			}
			parts = append(parts, fmt.Sprintf("- Step %d (%s): %s", i+1, step.Title, summary))
		}
	}

	if len(parts) == 0 {
		return "This is the first step; no prior context."
	}

	return strings.Join(parts, "\n")
}

// parseCriticResponse extracts CriticFeedback from the model's response
func (c *Critic) parseCriticResponse(response string) (CriticFeedback, error) {
	// Try to extract JSON from the response
	jsonStr := extractJSON(response)
	if jsonStr == "" {
		return CriticFeedback{}, fmt.Errorf("no JSON found in critic response")
	}

	var feedback CriticFeedback
	if err := json.Unmarshal([]byte(jsonStr), &feedback); err != nil {
		return CriticFeedback{}, fmt.Errorf("failed to parse critic JSON: %w", err)
	}

	// Validate the feedback
	if feedback.QualityScore < 0 || feedback.QualityScore > 1 {
		feedback.QualityScore = 0.5 // Default to middle ground if invalid
	}

	return feedback, nil
}

// extractJSON finds and extracts JSON from a text response
func extractJSON(text string) string {
	// Find the first { and last }
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")

	if start == -1 || end == -1 || start >= end {
		return ""
	}

	return text[start : end+1]
}
