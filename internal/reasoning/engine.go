package reasoning

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"gaiol/internal/database"
	"gaiol/internal/models"

	"github.com/google/uuid"
)

// ReasoningEngine is the central coordinator for beam search reasoning
type ReasoningEngine struct {
	MemoryManager   *MemoryManager
	Decomposer      *Decomposer
	Orchestrator    *Orchestrator
	Scorer          *Scorer
	Composer        *Composer
	BeamConfig      BeamConfig      // Beam search settings
	ConsensusConfig ConsensusConfig // Optional consensus
	ConsensusAgent  *ConsensusAgent // Optional consensus agent
	OnEvent         EventCallback
}

// BeamConfig contains settings for beam search reasoning
type BeamConfig struct {
	Enabled   bool `json:"enabled"`
	BeamWidth int  `json:"beam_width"` // Number of paths to maintain
}

// DefaultBeamConfig returns the default beam search settings
func DefaultBeamConfig() BeamConfig {
	return BeamConfig{
		Enabled:   true, // Enabled by default for better results
		BeamWidth: 3,    // Keep top 3 paths for exploration
	}
}

// NewReasoningEngine creates a new simplified reasoning engine focused on beam search
func NewReasoningEngine(router *models.ModelRouter) *ReasoningEngine {
	pb := NewPromptBuilder()
	orchestrator := NewOrchestrator(router, pb)

	// Optional: Initialize RAG if database is available (lazy initialization)
	// RAG will be initialized on first use to avoid blocking startup
	dbClient := database.GetClient()
	if dbClient != nil {
		// Initialize RAG lazily - don't block on startup
		// The orchestrator will initialize RAG when needed
		store := database.NewSupabaseVectorStore(dbClient)
		// Find embedding model quickly (check only OpenRouter models)
		openRouterModels := router.GetRegistry().FindModelsByProvider("openrouter")
		for _, m := range openRouterModels {
			if m.Adapter != nil {
				if embedder, ok := m.Adapter.(models.EmbeddingProvider); ok {
					rag := NewRAGManager(store, embedder)
					orchestrator.RAG = rag
					break
				}
			}
		}
	}

	// Optional: Initialize Performance Tracker
	var tracker *models.PerformanceTracker
	if dbClient != nil {
		tracker = models.NewPerformanceTracker(dbClient)
		tracker.RefreshCache(context.Background())
	}

	return &ReasoningEngine{
		MemoryManager:   NewMemoryManager(),
		Decomposer:      NewDecomposer(router),
		Orchestrator:    orchestrator,
		Scorer:          NewScorer(router, tracker),
		Composer:        NewComposer(),
		BeamConfig:      DefaultBeamConfig(),
		ConsensusConfig: DefaultConsensusConfig(),
		ConsensusAgent:  NewConsensusAgent(NewOrchestrator(router, pb)),
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
func (re *ReasoningEngine) InitSession(ctx context.Context, prompt string) string {
	sessionID := uuid.New().String()
	sm := re.MemoryManager.CreateSession(sessionID, prompt)

	// Try to get user/tenant info from context
	if t, ok := database.GetTenantFromContext(ctx); ok {
		sm.UserID = t.UserID
		sm.TenantID = t.TenantID
	}

	// Initial persistence
	_ = re.MemoryManager.SaveSession(sm)

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

	// Persist the decomposed steps
	for _, step := range steps {
		_ = re.MemoryManager.SaveStep(sessionID, step)
	}

	re.emitEvent(sessionID, EventDecomposeEnd, EventDecomposePayload{Steps: steps})

	// 3. Process each step with phase-based parallel execution
	// Group steps by their parallel capability
	for i := 0; i < len(steps); {
		// Find steps that can run in parallel (marked with [P])
		var group []int
		group = append(group, i)

		// If current step is parallel, look ahead for more parallel steps
		if strings.Contains(steps[i].Title, "[P]") {
			for j := i + 1; j < len(steps); j++ {
				if strings.Contains(steps[j].Title, "[P]") {
					group = append(group, j)
				} else {
					break
				}
			}
		}

		if len(group) > 1 {
			// Execute group in parallel
			var wg sync.WaitGroup
			for _, stepIdx := range group {
				wg.Add(1)
				go func(idx int) {
					defer wg.Done()
					re.executeStep(ctx, sm, sessionID, idx, modelIDs)
				}(stepIdx)
			}
			wg.Wait()
			i += len(group)
		} else {
			// Execute single sequential step
			re.executeStep(ctx, sm, sessionID, i, modelIDs)
			i++
		}
	}

	// 4. Assemble Final Output
	finalOutput := re.Composer.AssembleFinalOutput(sm.SelectedPath)
	re.emitEvent(sessionID, EventReasoningEnd, EventReasoningEndPayload{FinalOutput: finalOutput})

	return sm, nil
}

// executeStep runs a single reasoning step and updates the shared memory
func (re *ReasoningEngine) executeStep(ctx context.Context, sm *SharedMemory, sessionID string, i int, modelIDs []string) {
	re.Orchestrator.SessionID = sessionID
	re.Orchestrator.OnEvent = re.OnEvent

	// Update status
	sm.mu.Lock()
	sm.Steps[i].Status = "processing"
	sm.Steps[i].StartTime = time.Now()
	sm.mu.Unlock()

	re.emitEvent(sessionID, EventStepStart, EventStepPayload{
		StepIndex: i,
		Title:     sm.Steps[i].Title,
		Objective: sm.Steps[i].Objective,
		TaskType:  sm.Steps[i].TaskType,
	})

	var newPaths [][]ModelOutput

	// Get active paths for beam search (or start with empty path for first step)
	sm.mu.RLock()
	activePaths := sm.ActivePaths
	if len(activePaths) == 0 {
		// First step: start with empty path
		activePaths = [][]ModelOutput{{}}
	}
	sm.mu.RUnlock()

	// Execute beam search: explore paths in parallel
	for _, path := range activePaths {
		// Build context for this specific path
		contextStr, _ := re.MemoryManager.GetContextForPath(sessionID, path)

		// Execute parallel models for this path
		outputs, err := re.Orchestrator.ExecuteStep(ctx, sm.Steps[i], contextStr, modelIDs, sm.Config)
		if err != nil {
			re.emitEvent(sessionID, EventError, fmt.Sprintf("Step %d execution failed: %v", i, err))
			continue
		}

		// Score all outputs
		scoredOutputs, err := re.Scorer.ScoreMultipleOutputs(ctx, sm.Steps[i].Objective, outputs, sm.Steps[i].TaskType, sm.Config.PriorityProfile)
		if err != nil {
			scoredOutputs = outputs
		}

		// Optional: Apply consensus if enabled
		if re.ConsensusConfig.Enabled && len(scoredOutputs) > 1 {
			consensusResult, err := re.ConsensusAgent.Reconcile(ctx, sm.Steps[i].Objective, scoredOutputs, re.ConsensusConfig)
			if err == nil && consensusResult.BestOutput != nil {
				sm.mu.Lock()
				sm.Steps[i].Consensus = consensusResult
				sm.mu.Unlock()
				re.emitEvent(sessionID, EventConsensus, consensusResult)
			}
		}

		// Accumulate cost
		sm.mu.Lock()
		for _, out := range scoredOutputs {
			sm.TotalCost += out.Cost
		}
		sm.mu.Unlock()

		// Create new candidate paths by extending current path with each output
		for _, out := range scoredOutputs {
			newPath := make([]ModelOutput, len(path))
			copy(newPath, path)
			newPath = append(newPath, out)
			newPaths = append(newPaths, newPath)
		}
	}

	// Update step with all model outputs for display
	sm.mu.Lock()
	if len(newPaths) > 0 {
		// Collect all unique outputs from all paths
		allOutputs := make([]ModelOutput, 0)
		seen := make(map[string]bool)
		for _, path := range newPaths {
			if len(path) > 0 {
				lastOutput := path[len(path)-1]
				if !seen[lastOutput.ModelID+lastOutput.Response] {
					allOutputs = append(allOutputs, lastOutput)
					seen[lastOutput.ModelID+lastOutput.Response] = true
				}
			}
		}
		sm.Steps[i].ModelOutputs = allOutputs
	}
	sm.mu.Unlock()

	// Prune paths using beam search: keep only top N paths
	err := re.MemoryManager.UpdateBeamResults(sessionID, i, newPaths, re.BeamConfig.BeamWidth)
	if err != nil {
		re.emitEvent(sessionID, EventError, fmt.Sprintf("failed to update beam results for step %d: %v", i, err))
	}

	// Emit beam update event
	sm.mu.RLock()
	bestScore := 0.0
	if sm.Steps[i].SelectedOutput != nil {
		bestScore = sm.Steps[i].SelectedOutput.Scores.Overall
	}
	re.emitEvent(sessionID, EventBeamUpdate, map[string]interface{}{
		"step_index":   i,
		"active_paths": len(sm.ActivePaths),
		"best_score":   bestScore,
		"total_cost":   sm.TotalCost,
	})
	sm.mu.RUnlock()

	// Persist outputs
	for pathIdx, path := range newPaths {
		if len(path) > 0 {
			output := path[len(path)-1]
			isSelected := false
			sm.mu.RLock()
			if len(sm.ActivePaths) > 0 && len(sm.ActivePaths[0]) > 0 {
				bestOutput := sm.ActivePaths[0][len(sm.ActivePaths[0])-1]
				if output.ModelID == bestOutput.ModelID && output.Response == bestOutput.Response {
					isSelected = true
				}
			}
			sm.mu.RUnlock()
			_ = re.MemoryManager.SaveOutput(sessionID, i, output, isSelected, pathIdx)
		}
	}
	_ = re.MemoryManager.SaveStep(sessionID, sm.Steps[i])

	re.emitEvent(sessionID, EventStepEnd, sm.Steps[i])
}

// EnableBeamSearch turns on beam search with custom config
func (re *ReasoningEngine) EnableBeamSearch(config BeamConfig) {
	re.BeamConfig = config
}

// DisableBeamSearch turns off beam search (falls back to greedy)
func (re *ReasoningEngine) DisableBeamSearch() {
	re.BeamConfig.Enabled = false
}
