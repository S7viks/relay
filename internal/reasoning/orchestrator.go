package reasoning

import (
	"context"
	"sync"
	"time"

	"gaiol/internal/models"
)

// Orchestrator handles parallel execution of multiple LLMs
type Orchestrator struct {
	Router        *models.ModelRouter
	PromptBuilder *PromptBuilder
}

// NewOrchestrator creates a new orchestrator
func NewOrchestrator(router *models.ModelRouter, pb *PromptBuilder) *Orchestrator {
	return &Orchestrator{
		Router:        router,
		PromptBuilder: pb,
	}
}

// ExecuteStep runs multiple models in parallel for a given reasoning step
func (o *Orchestrator) ExecuteStep(ctx context.Context, step ReasoningStep, sharedContext string, modelIDs []string) ([]ModelOutput, error) {
	var wg sync.WaitGroup
	outputChan := make(chan ModelOutput, len(modelIDs))

	// Wrap the objective with shared context
	wrappedPrompt := o.PromptBuilder.WrapWithContext(step.Objective, sharedContext)

	for _, modelID := range modelIDs {
		wg.Add(1)
		go func(mid string) {
			defer wg.Done()

			// Add timeout per model query
			mctx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()

			output, err := o.executeModelWithRetry(mctx, mid, wrappedPrompt, 2)
			if err != nil {
				// Log error and return empty output for this model
				return
			}

			outputChan <- output
		}(modelID)
	}

	// Wait for all models to finish or context to be cancelled
	go func() {
		wg.Wait()
		close(outputChan)
	}()

	results := make([]ModelOutput, 0, len(modelIDs))
	for res := range outputChan {
		results = append(results, res)
	}

	return results, nil
}

// executeModelWithRetry handles a single model query with retries
func (o *Orchestrator) executeModelWithRetry(ctx context.Context, modelID, prompt string, maxRetries int) (ModelOutput, error) {
	var lastErr error
	for i := 0; i <= maxRetries; i++ {
		startTime := time.Now()
		// Use reasoning's QueryModel wrapper
		qm := NewQueryModel(o.Router)

		resp, err := qm.Query(ctx, modelID, prompt)
		latency := time.Since(startTime).Milliseconds()

		if err == nil {
			return ModelOutput{
				ModelID:    modelID,
				ModelName:  modelID,
				Response:   resp,
				TokensUsed: 0, // TODO: get from response
				LatencyMs:  latency,
				Timestamp:  time.Now(),
			}, nil
		}

		lastErr = err
		// Exponential backoff or simple sleep could be added here
		time.Sleep(time.Duration(i*100) * time.Millisecond)
	}

	return ModelOutput{}, lastErr
}
