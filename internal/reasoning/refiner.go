package reasoning

import (
	"context"
	"fmt"
	"time"
)

// Refiner improves model outputs based on critic feedback
type Refiner struct {
	queryModel *QueryModel
}

// NewRefiner creates a new refiner
func NewRefiner(queryModel *QueryModel) *Refiner {
	return &Refiner{
		queryModel: queryModel,
	}
}

// ImproveOutput requests the model to refine its output based on feedback
func (r *Refiner) ImproveOutput(
	ctx context.Context,
	originalOutput ModelOutput,
	feedback CriticFeedback,
	step ReasoningStep,
	memory *SharedMemory,
) (ModelOutput, error) {
	// Build refinement prompt
	prompt := r.buildRefinementPrompt(originalOutput, feedback, step, memory)

	// Query the same model that produced the original output
	response, err := r.queryModel.Query(ctx, originalOutput.ModelID, prompt)
	if err != nil {
		return ModelOutput{}, fmt.Errorf("refinement query failed: %w", err)
	}

	// Create improved output
	improved := ModelOutput{
		ModelID:   originalOutput.ModelID,
		Response:  response,
		Timestamp: time.Now(),
		IsRefined: true, // Mark as refined
	}

	return improved, nil
}

// buildRefinementPrompt creates a prompt that asks for improvements
func (r *Refiner) buildRefinementPrompt(
	original ModelOutput,
	feedback CriticFeedback,
	step ReasoningStep,
	memory *SharedMemory,
) string {
	issuesList := ""
	if len(feedback.Issues) > 0 {
		issuesList = "\n"
		for i, issue := range feedback.Issues {
			issuesList += fmt.Sprintf("%d. %s\n", i+1, issue)
		}
	}

	suggestionsList := ""
	if len(feedback.Suggestions) > 0 {
		suggestionsList = "\n"
		for i, suggestion := range feedback.Suggestions {
			suggestionsList += fmt.Sprintf("%d. %s\n", i+1, suggestion)
		}
	}

	prompt := fmt.Sprintf(`You previously provided a response for this step:

STEP OBJECTIVE: %s
STEP DESCRIPTION: %s

YOUR PREVIOUS RESPONSE:
%s

An expert critic has evaluated your response and found it needs improvement.

QUALITY SCORE: %.2f / 1.0
CRITIC'S REASONING: %s

ISSUES IDENTIFIED:%s

SUGGESTIONS FOR IMPROVEMENT:%s

Please provide an improved response that addresses these issues and incorporates the suggestions. 
Make your response more comprehensive, accurate, and directly relevant to the step's objective.

Improved Response:`,
		step.Title,
		step.Objective,
		original.Response,
		feedback.QualityScore,
		feedback.Reasoning,
		issuesList,
		suggestionsList,
	)

	return prompt
}
