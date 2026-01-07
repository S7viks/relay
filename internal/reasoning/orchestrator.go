package reasoning

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"gaiol/internal/models"
)

// Orchestrator handles parallel execution of multiple LLMs
type Orchestrator struct {
	Router        *models.ModelRouter
	PromptBuilder *PromptBuilder
	RAG           *RAGManager
	SessionID     string        // NEW: Store current session ID for events
	OnEvent       EventCallback // NEW: Callback for live updates
}

// NewOrchestrator creates a new orchestrator
func NewOrchestrator(router *models.ModelRouter, pb *PromptBuilder) *Orchestrator {
	return &Orchestrator{
		Router:        router,
		PromptBuilder: pb,
	}
}

// ExecuteStep runs parallel models for a given step and handles routing
func (o *Orchestrator) ExecuteStep(ctx context.Context, step ReasoningStep, sharedContext string, modelIDs []string, config SessionConfig) ([]ModelOutput, error) {
	var wg sync.WaitGroup
	// Handle dynamic model selection if "auto" is requested or no models provided
	effectiveModelIDs := modelIDs
	if len(modelIDs) == 0 || (len(modelIDs) == 1 && modelIDs[0] == "auto") {
		strategy := models.StrategyHighestQuality

		// Map priority profile to routing strategy
		switch config.PriorityProfile {
		case "speed":
			strategy = models.StrategyLowestCost // Assuming lower cost models are faster or we want to save budget for speed
		case "balanced":
			strategy = models.StrategyBalanced
		}

		routeConfig := models.RoutingConfig{
			Strategy: strategy,
			Task:     step.TaskType,
			MaxCost:  config.BudgetLimit, // Use budget as cost constraint
		}
		// Default to logic if not specified
		if routeConfig.Task == "" {
			routeConfig.Task = models.TaskAnalyze
		}

		model, err := o.Router.Route(routeConfig)
		if err != nil {
			fmt.Printf("⚠️ Dynamic routing failed for task %s, falling back to default: %v\n", step.TaskType, err)
			effectiveModelIDs = []string{"anthropic/claude-3-5-sonnet"} // Safe fallback
		} else {
			effectiveModelIDs = []string{string(model.ID)}
			fmt.Printf("🎯 Dynamic routing selected %s for task %s\n", model.ID, step.TaskType)
		}
	}

	outputChan := make(chan ModelOutput, len(effectiveModelIDs))

	// Wrap the objective with shared context
	prompt := step.Objective
	if o.RAG != nil {
		if augmented, docs, err := o.RAG.AugmentPrompt(ctx, prompt); err == nil {
			prompt = augmented
			if len(docs) > 0 {
				o.emitEvent(ctx, EventRAG, docs)
			}
		}
	}
	wrappedPrompt := o.PromptBuilder.WrapWithContext(prompt, sharedContext)

	for _, modelID := range effectiveModelIDs {
		wg.Add(1)
		go func(mid string) {
			defer wg.Done()

			// Add timeout per model query (reduced to 20s for faster feedback)
			mctx, cancel := context.WithTimeout(ctx, 20*time.Second)
			defer cancel()

			output, err := o.executeModelWithRetry(mctx, mid, wrappedPrompt, 2)
			if err != nil {
				// Send error output instead of silently dropping
				outputChan <- ModelOutput{
					ModelID:  mid,
					Response: fmt.Sprintf("Error: %v", err),
					Scores:   MetricScores{Overall: 0.0},
				}
				return
			}

			outputChan <- output
		}(modelID)
	}

	// Wait for all models to finish or context to be cancelled
	wg.Wait()
	close(outputChan)

	var results []ModelOutput
	for out := range outputChan {
		results = append(results, out)
	}

	// ADVANCED ERROR HANDLING: If all models failed (only error outputs)
	allFailed := true
	for _, r := range results {
		if !strings.HasPrefix(r.Response, "Error:") {
			allFailed = false
			break
		}
	}

	if allFailed && len(effectiveModelIDs) > 0 {
		fmt.Println("🚨 All models failed for step. Attempting fallback to guardian model...")
		fallbackModel := "anthropic/claude-3-5-sonnet"
		output, err := o.executeModelWithRetry(ctx, fallbackModel, wrappedPrompt, 1)
		if err == nil {
			output.ModelName += " (Fallback)"
			return []ModelOutput{output}, nil
		}
		fmt.Printf("❌ Fallback guardian model also failed: %v\n", err)
	}

	return results, nil
}

// emitEvent sends an event to the callback
func (o *Orchestrator) emitEvent(ctx context.Context, et EventType, payload interface{}) {
	if o.OnEvent != nil {
		o.OnEvent(ReasoningEvent{
			Type:      et,
			SessionID: o.SessionID,
			Payload:   payload,
			Timestamp: time.Now(),
		})
	}
}

// executeModelWithRetry handles a single model query with retries
func (o *Orchestrator) executeModelWithRetry(ctx context.Context, modelID, prompt string, maxRetries int) (ModelOutput, error) {
	var lastErr error
	for i := 0; i <= maxRetries; i++ {
		startTime := time.Now()
		// Use reasoning's QueryModel wrapper
		qm := NewQueryModel(o.Router)

		resp, err := qm.QueryFull(ctx, modelID, prompt)
		latency := time.Since(startTime).Milliseconds()

		if err == nil {
			return ModelOutput{
				ModelID:    modelID,
				ModelName:  modelID,
				Response:   resp.Response,
				TokensUsed: resp.Usage.TotalTokens,
				Cost:       resp.EstimatedCost,
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

// Query is a convenience method for a single model query
func (o *Orchestrator) Query(ctx context.Context, modelID, prompt string) (string, error) {
	qm := NewQueryModel(o.Router)
	return qm.Query(ctx, modelID, prompt)
}
