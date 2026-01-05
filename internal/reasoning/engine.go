package reasoning

import (
	"context"
	"fmt"
	"time"

	"gaiol/internal/models"

	"github.com/google/uuid"
)

// ReasoningEngine is the central coordinator for the multi-agent reasoning flow
type ReasoningEngine struct {
	MemoryManager    *MemoryManager
	Decomposer       *Decomposer
	Orchestrator     *Orchestrator
	Scorer           *Scorer
	Selector         *Selector
	Composer         *Composer
	Critic           *Critic          // NEW: Quality validator
	Refiner          *Refiner         // NEW: Output improver
	ReflectionConfig ReflectionConfig // NEW: Reflection settings
	OnEvent          EventCallback
}

// NewReasoningEngine creates a new reasoning engine instance
func NewReasoningEngine(router *models.ModelRouter) *ReasoningEngine {
	pb := NewPromptBuilder()
	queryModel := NewQueryModel(router)
	reflectionConfig := DefaultReflectionConfig()

	return &ReasoningEngine{
		MemoryManager:    NewMemoryManager(),
		Decomposer:       NewDecomposer(router),
		Orchestrator:     NewOrchestrator(router, pb),
		Scorer:           NewScorer(router),
		Selector:         NewSelector("greedy"),
		Composer:         NewComposer(),
		Critic:           NewCritic(queryModel, reflectionConfig),
		Refiner:          NewRefiner(queryModel),
		ReflectionConfig: reflectionConfig,
	}
}

// emitEvent sends an event if the callback is set
func (re *ReasoningEngine) emitEvent(sessionID string, et EventType, payload interface{}) {
	if re.OnEvent != nil {
		re.OnEvent(ReasoningEvent{
			Type:      et,
			SessionID: sessionID,
			Payload:   payload,
			Timestamp: time.Now(),
		})
	}
}

// InitSession creates a new session and returns the ID
func (re *ReasoningEngine) InitSession(prompt string) string {
	sessionID := uuid.New().String()
	re.MemoryManager.CreateSession(sessionID, prompt)
	return sessionID
}

// RunSession runs the complete reasoning process for an existing session
func (re *ReasoningEngine) RunSession(ctx context.Context, sessionID, prompt string, modelIDs []string) (*SharedMemory, error) {
	sm, exists := re.MemoryManager.GetSession(sessionID)
	if !exists {
		return nil, fmt.Errorf("session not found: %s", sessionID)
	}

	// 2. Decompose Prompt
	re.emitEvent(sessionID, EventDecomposeStart, nil)
	steps, err := re.Decomposer.DecomposeWithRetry(ctx, prompt, 3)
	if err != nil {
		re.emitEvent(sessionID, EventError, err.Error())
		return nil, fmt.Errorf("decomposition failed: %v", err)
	}

	sm.mu.Lock()
	sm.Steps = steps
	sm.mu.Unlock()
	re.emitEvent(sessionID, EventDecomposeEnd, EventDecomposePayload{Steps: steps})

	// 3. Process each step
	for i := range steps {
		// Update status
		sm.mu.Lock()
		sm.Steps[i].Status = "processing"
		sm.Steps[i].StartTime = time.Now()
		sm.mu.Unlock()

		re.emitEvent(sessionID, EventStepStart, EventStepPayload{
			StepIndex: i,
			Title:     sm.Steps[i].Title,
			Objective: sm.Steps[i].Objective,
		})

		// Build context from previous steps
		contextStr, _ := re.MemoryManager.GetContextForStep(sessionID, i)

		// Execute parallel models
		// Note: Orchestrator could also be updated to emit events for each model start/end
		outputs, err := re.Orchestrator.ExecuteStep(ctx, sm.Steps[i], contextStr, modelIDs)
		if err != nil {
			re.emitEvent(sessionID, EventError, err.Error())
			return nil, fmt.Errorf("step %d execution failed: %v", i, err)
		}

		// Score outputs
		scoredOutputs, err := re.Scorer.ScoreMultipleOutputs(ctx, sm.Steps[i].Objective, outputs)
		if err != nil {
			scoredOutputs = outputs
		}

		// Update results and Select winner (Greedy)
		err = re.MemoryManager.UpdateStepResults(sessionID, i, scoredOutputs)
		if err != nil {
			return nil, fmt.Errorf("failed to update results for step %d: %v", i, err)
		}

		// Get the selected output for potential reflection
		selectedOutput := sm.SelectedPath[len(sm.SelectedPath)-1]

		// SELF-REFLECTION LOOP (NEW)
		if re.ReflectionConfig.Enabled {
			attempts := 0
			accepted := false

			for !accepted && attempts < re.ReflectionConfig.MaxRetries {
				// Validate with critic
				feedback, err := re.Critic.ValidateOutput(ctx, sm.Steps[i], selectedOutput, sm)
				if err != nil {
					// If critic fails, accept the output and continue
					feedback = CriticFeedback{IsAcceptable: true, QualityScore: 0.8}
				}

				// Emit reflection event
				re.emitEvent(sessionID, EventReflection, map[string]interface{}{
					"step_index":  i,
					"accepted":    feedback.IsAcceptable,
					"quality":     feedback.QualityScore,
					"issues":      feedback.Issues,
					"suggestions": feedback.Suggestions,
					"attempt":     attempts + 1,
				})

				if feedback.IsAcceptable {
					accepted = true
					break
				}

				// Try to improve
				attempts++
				if attempts < re.ReflectionConfig.MaxRetries {
					re.emitEvent(sessionID, EventRefinement, map[string]interface{}{
						"step_index": i,
						"attempt":    attempts,
					})

					improved, err := re.Refiner.ImproveOutput(ctx, selectedOutput, feedback, sm.Steps[i], sm)
					if err == nil {
						// Update the selected output in memory
						sm.mu.Lock()
						sm.SelectedPath[len(sm.SelectedPath)-1] = improved
						sm.mu.Unlock()
						selectedOutput = improved
					}
				}
			}
		}

		re.emitEvent(sessionID, EventStepEnd, sm.Steps[i])
	}

	// 4. Assemble Final Output
	finalOutput := re.Composer.AssembleFinalOutput(sm.SelectedPath)
	re.emitEvent(sessionID, EventReasoningEnd, EventReasoningEndPayload{FinalOutput: finalOutput})

	return sm, nil
}

// EnableReflection turns on self-reflection with custom config
func (re *ReasoningEngine) EnableReflection(config ReflectionConfig) {
	re.ReflectionConfig = config
}

// DisableReflection turns off self-reflection
func (re *ReasoningEngine) DisableReflection() {
	re.ReflectionConfig.Enabled = false
}
