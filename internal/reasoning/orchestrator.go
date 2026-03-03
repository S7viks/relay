package reasoning

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"relay/internal/models"
	"relay/internal/models/adapters"
	"relay/internal/uaip"
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

// ExecuteStep runs parallel models with FAST FAIL and circuit breaking
func (o *Orchestrator) ExecuteStep(ctx context.Context, step ReasoningStep, sharedContext string, modelIDs []string, config SessionConfig) ([]ModelOutput, error) {
	// PERFORMANCE: Use parent context timeout (don't create new one)
	effectiveModelIDs := modelIDs
	if len(modelIDs) == 0 || (len(modelIDs) == 1 && modelIDs[0] == "auto") {
		strategy := models.StrategyHighestQuality

		switch config.PriorityProfile {
		case "speed":
			strategy = models.StrategyFreeOnly // FREE = FASTER
		case "balanced":
			strategy = models.StrategyBalanced
		}

		routeConfig := models.RoutingConfig{
			Strategy: strategy,
			Task:     step.TaskType,
			MaxCost:  config.BudgetLimit,
		}
		if routeConfig.Task == "" {
			routeConfig.Task = models.TaskAnalyze
		}

		model, err := o.Router.Route(routeConfig)
		if err != nil {
			fmt.Printf("⚠️ Dynamic routing failed, using fallback\n")
			effectiveModelIDs = []string{"google/gemini-2.0-flash-exp:free"} // Fast free model
		} else {
			effectiveModelIDs = []string{string(model.ID)}
		}
	}

	// PERFORMANCE FIX: Use buffered channel + first-responder wins
	outputChan := make(chan ModelOutput, len(effectiveModelIDs))
	doneChan := make(chan struct{}) // Signal when we have enough results

	var wg sync.WaitGroup
	var mu sync.Mutex
	successCount := 0
	maxSuccess := 1 // CRITICAL: Only wait for FIRST success, not all models

	// RAG augmentation (optional)
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

	// Launch models in parallel
	for _, modelID := range effectiveModelIDs {
		wg.Add(1)
		go func(mid string) {
			defer wg.Done()

			// Check if we already have enough results
			select {
			case <-doneChan:
				return // Skip execution
			default:
			}

			// AGGRESSIVE TIMEOUT: 5 seconds max per model
			mctx, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()

			output, err := o.executeModelWithRetry(mctx, mid, wrappedPrompt, 1) // Only 1 retry
			if err != nil {
				fmt.Printf("⚠️ Model %s failed: %v\n", mid, err)
				return
			}

			// Validate response quality
			if output.Response != "" &&
				!strings.Contains(output.Response, "⚠️") &&
				!strings.Contains(output.Response, "Request failed") &&
				len(output.Response) > 10 { // Must be substantial

				mu.Lock()
				successCount++
				if successCount >= maxSuccess {
					close(doneChan) // Signal others to stop
				}
				mu.Unlock()

				outputChan <- output
			}
		}(modelID)
	}

	// Wait for first success OR all to finish (whichever comes first)
	go func() {
		wg.Wait()
		close(outputChan)
	}()

	// Collect results with timeout
	results := make([]ModelOutput, 0)
	timeout := time.After(10 * time.Second) // MAX 10s for entire step

	for {
		select {
		case output, ok := <-outputChan:
			if !ok {
				goto DONE // Channel closed
			}
			if output.Scores.Overall > 0.0 {
				results = append(results, output)
				if len(results) >= maxSuccess {
					goto DONE // Got enough results
				}
			}
		case <-timeout:
			fmt.Println("⚠️ Step timeout after 10s")
			goto DONE
		case <-ctx.Done():
			fmt.Println("⚠️ Context cancelled")
			goto DONE
		}
	}

DONE:
	// If NO successful results, try fallbacks IN ORDER
	if len(results) == 0 && len(effectiveModelIDs) > 0 {
		fmt.Println("🚨 All models failed for step. Attempting fallbacks...")

		// FALLBACK 1: Ollama (local, fast)
		fmt.Println("🏠 Trying local Ollama fallback...")
		ollamaCtx, ollamaCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer ollamaCancel()

		ollamaAdapter := adapters.NewOllamaAdapter("")
		ollamaModels, err := ollamaAdapter.CheckAvailability(ollamaCtx)
		if err == nil && len(ollamaModels) > 0 {
			// Try first available local model
			modelName := ollamaModels[0]
			fmt.Printf("🦙 Using local Ollama model: %s\n", modelName)

			uaipReq := &uaip.UAIPRequest{
				Payload: uaip.Payload{
					Input: uaip.PayloadInput{
						Data:   wrappedPrompt,
						Format: "text",
					},
					OutputRequirements: uaip.OutputRequirements{
						MaxTokens:   1000,
						Temperature: 0.7,
					},
				},
			}

			resp, err := ollamaAdapter.GenerateText(ollamaCtx, modelName, uaipReq)
			if err == nil && resp.Status.Success {
				fmt.Println("✅ Ollama fallback succeeded!")
				return []ModelOutput{{
					ModelID:    "ollama:" + modelName,
					ModelName:  "Ollama " + modelName + " (Local)",
					Response:   resp.Result.Data,
					TokensUsed: resp.Result.TokensUsed,
					Cost:       0.0,
					Timestamp:  time.Now(),
					Scores:     MetricScores{Overall: 0.7},
				}}, nil
			}
		}
		fmt.Printf("⚠️ Ollama fallback failed: %v\n", err)

		// FALLBACK 2: HuggingFace
		fmt.Println("🤗 Trying HuggingFace fallback...")
		hfAdapter := adapters.NewHuggingFaceAdapter("", os.Getenv("HUGGINGFACE_API_KEY"))
		hfCtx, hfCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer hfCancel()

		hfReq := &uaip.UAIPRequest{
			Payload: uaip.Payload{
				Input: uaip.PayloadInput{
					Data:   wrappedPrompt,
					Format: "text",
				},
				OutputRequirements: uaip.OutputRequirements{
					MaxTokens:   500,
					Temperature: 0.7,
				},
			},
		}

		hfResp, hfErr := hfAdapter.GenerateText(hfCtx, "mistralai/Mistral-7B-Instruct-v0.2", hfReq)
		if hfErr == nil && hfResp.Status.Success {
			fmt.Println("✅ HuggingFace fallback succeeded!")
			return []ModelOutput{{
				ModelID:    "huggingface:mistral",
				ModelName:  "Mistral 7B (HF)",
				Response:   hfResp.Result.Data,
				TokensUsed: hfResp.Result.TokensUsed,
				Cost:       0.0,
				Timestamp:  time.Now(),
				Scores:     MetricScores{Overall: 0.65},
			}}, nil
		}
		fmt.Printf("⚠️ HuggingFace fallback failed: %v\n", hfErr)
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
	var lastResponse QueryResponse
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
				Scores:     MetricScores{Overall: 0.5}, // Default so collector accepts; scorer can override later
			}, nil
		}

		// If error but response has data (error message), store it
		if resp.Response != "" {
			lastResponse = resp
		}

		lastErr = err
		// Exponential backoff or simple sleep could be added here
		time.Sleep(time.Duration(i*100) * time.Millisecond)
	}

	// If we have a response with error data, return it as ModelOutput instead of error
	// This allows error messages to be displayed to users
	if lastResponse.Response != "" {
		return ModelOutput{
			ModelID:    modelID,
			ModelName:  modelID + " (Error)",
			Response:   lastResponse.Response,
			TokensUsed: lastResponse.Usage.TotalTokens,
			Cost:       lastResponse.EstimatedCost,
			LatencyMs:  0,
			Timestamp:  time.Now(),
			Scores:     MetricScores{Overall: 0.0}, // Mark as low quality
		}, nil
	}

	return ModelOutput{}, lastErr
}

// Query is a convenience method for a single model query
func (o *Orchestrator) Query(ctx context.Context, modelID, prompt string) (string, error) {
	qm := NewQueryModel(o.Router)
	return qm.Query(ctx, modelID, prompt)
}
