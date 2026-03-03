package reasoning

import (
	"fmt"
	"relay/internal/database"
	"sort"
	"strings"
	"sync"
	"time"
)

// MemoryManager handles storage and retrieval of reasoning sessions
type MemoryManager struct {
	mu       sync.RWMutex
	sessions map[string]*SharedMemory
}

// NewMemoryManager creates a new memory manager
func NewMemoryManager() *MemoryManager {
	return &MemoryManager{
		sessions: make(map[string]*SharedMemory),
	}
}

// CreateSession initializes a new reasoning session
func (mm *MemoryManager) CreateSession(sessionID, prompt string) *SharedMemory {
	mm.mu.Lock()
	defer mm.mu.Unlock()

	sm := NewSharedMemory(sessionID, prompt)
	mm.sessions[sessionID] = sm
	return sm
}

// GetSession retrieves a reasoning session by ID
func (mm *MemoryManager) GetSession(sessionID string) (*SharedMemory, bool) {
	mm.mu.RLock()
	defer mm.mu.RUnlock()
	session, exists := mm.sessions[sessionID]
	return session, exists
}

// GetContextForPath builds a context string from a specific sequence of model outputs
func (mm *MemoryManager) GetContextForPath(sessionID string, path []ModelOutput) (string, error) {
	mm.mu.RLock()
	defer mm.mu.RUnlock()

	session, exists := mm.sessions[sessionID]
	if !exists {
		return "", fmt.Errorf("session not found: %s", sessionID)
	}

	session.mu.RLock()
	defer session.mu.RUnlock()

	var context strings.Builder
	context.WriteString("REASONING CONTEXT:\n")
	context.WriteString(fmt.Sprintf("Original Goal: %s\n\n", session.OriginalPrompt))

	if len(path) > 0 {
		context.WriteString("PREVIOUS COMPLETED STEPS (THIS PATH):\n")
		for i, output := range path {
			stepTitle := "Step"
			if i < len(session.Steps) {
				stepTitle = session.Steps[i].Title
			}
			context.WriteString(fmt.Sprintf("### %s\n%s\n\n", stepTitle, output.Response))
		}
	}

	return context.String(), nil
}

// GetContextForStep builds a context string from previous steps
func (mm *MemoryManager) GetContextForStep(sessionID string, stepIndex int) (string, error) {
	mm.mu.RLock()
	defer mm.mu.RUnlock()

	session, exists := mm.sessions[sessionID]
	if !exists {
		return "", fmt.Errorf("session not found: %s", sessionID)
	}

	session.mu.RLock()
	defer session.mu.RUnlock()

	var context strings.Builder
	context.WriteString("REASONING CONTEXT:\n")
	context.WriteString(fmt.Sprintf("Original Goal: %s\n\n", session.OriginalPrompt))

	if len(session.SelectedPath) > 0 {
		context.WriteString("PREVIOUS COMPLETED STEPS:\n")
		for i, output := range session.SelectedPath {
			stepTitle := "Step"
			if i < len(session.Steps) {
				stepTitle = session.Steps[i].Title
			}
			context.WriteString(fmt.Sprintf("### %s\n%s\n\n", stepTitle, output.Response))
		}
	}

	return context.String(), nil
}

// UpdateBeamResults updates the active paths for beam search and prunes them to beamWidth
func (mm *MemoryManager) UpdateBeamResults(sessionID string, stepIndex int, newPaths [][]ModelOutput, beamWidth int) error {
	sm, exists := mm.GetSession(sessionID)
	if !exists {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	sm.mu.Lock()
	defer sm.mu.Unlock()

	if stepIndex >= len(sm.Steps) {
		return fmt.Errorf("step index out of bounds: %d", stepIndex)
	}

	// Calculate scores for each path
	type pathWithScore struct {
		path  []ModelOutput
		score float64
	}

	scoredPaths := make([]pathWithScore, 0, len(newPaths))
	for _, p := range newPaths {
		totalScore := 0.0
		for _, output := range p {
			totalScore += output.Scores.Overall
		}
		avgScore := totalScore / float64(len(p))
		scoredPaths = append(scoredPaths, pathWithScore{path: p, score: avgScore})
	}

	// Sort by score (descending)
	sort.Slice(scoredPaths, func(i, j int) bool {
		return scoredPaths[i].score > scoredPaths[j].score
	})

	// Keep top beamWidth paths
	limit := beamWidth
	if len(scoredPaths) < limit {
		limit = len(scoredPaths)
	}

	sm.ActivePaths = make([][]ModelOutput, 0, limit)
	for i := 0; i < limit; i++ {
		sm.ActivePaths = append(sm.ActivePaths, scoredPaths[i].path)
	}

	// For the UI, we still update the "main" steps view with model outputs from all paths
	// This might need refinement to show branches, but for now we aggregate
	sm.Steps[stepIndex].Status = "completed"
	sm.Steps[stepIndex].EndTime = time.Now()

	// Update the "best" path so far (top path in beam)
	if len(sm.ActivePaths) > 0 {
		sm.SelectedPath = sm.ActivePaths[0]
		sm.Steps[stepIndex].SelectedOutput = &sm.ActivePaths[0][len(sm.ActivePaths[0])-1]
	}

	sm.UpdatedAt = time.Now()
	return nil
}

// UpdateStepResults adds model outputs to a step and selects the winner (greedy)
func (mm *MemoryManager) UpdateStepResults(sessionID string, stepIndex int, outputs []ModelOutput) error {
	sm, exists := mm.GetSession(sessionID)
	if !exists {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	sm.mu.Lock()
	defer sm.mu.Unlock()

	if stepIndex >= len(sm.Steps) {
		return fmt.Errorf("step index out of bounds: %d", stepIndex)
	}

	sm.Steps[stepIndex].ModelOutputs = outputs
	sm.Steps[stepIndex].Status = "completed"
	sm.Steps[stepIndex].EndTime = time.Now()

	// Greedy selection: pick the highest score
	var bestOutput *ModelOutput
	maxScore := -1.0

	for i := range outputs {
		if outputs[i].Scores.Overall > maxScore {
			maxScore = outputs[i].Scores.Overall
			bestOutput = &outputs[i]
		}
	}

	if bestOutput != nil {
		sm.Steps[stepIndex].SelectedOutput = bestOutput
		sm.SelectedPath = append(sm.SelectedPath, *bestOutput)
	}

	sm.UpdatedAt = time.Now()
	return nil
}

// SaveSession persists the reasoning session to the database
func (mm *MemoryManager) SaveSession(sm *SharedMemory) error {
	client := database.GetClient()
	if client == nil {
		return fmt.Errorf("database client not initialized")
	}

	// Prepare data for upsert
	data := map[string]interface{}{
		"id":         sm.SessionID,
		"user_id":    sm.UserID,
		"tenant_id":  sm.TenantID,
		"prompt":     sm.OriginalPrompt,
		"status":     "processing", // Initial status
		"metadata":   sm.Metadata,
		"total_cost": sm.TotalCost,
		"created_at": sm.CreatedAt,
		"updated_at": sm.UpdatedAt,
	}

	// Upsert session
	_, _, err := client.From("reasoning_sessions").Insert(data, true, "id", "", "").Execute()
	if err != nil {
		return fmt.Errorf("failed to save reasoning session: %w", err)
	}

	return nil
}

// SaveStep persists a reasoning step to the database
func (mm *MemoryManager) SaveStep(sessionID string, step ReasoningStep) error {
	client := database.GetClient()
	if client == nil {
		return fmt.Errorf("database client not initialized")
	}

	data := map[string]interface{}{
		"session_id": sessionID,
		"step_index": step.Index,
		"title":      step.Title,
		"objective":  step.Objective,
		"status":     step.Status,
		"start_time": step.StartTime,
		"end_time":   step.EndTime,
	}

	_, _, err := client.From("reasoning_steps").Insert(data, true, "session_id,step_index", "", "").Execute()
	if err != nil {
		return fmt.Errorf("failed to save reasoning step: %w", err)
	}

	return nil
}

// SaveOutput persists a model output to the database
func (mm *MemoryManager) SaveOutput(sessionID string, stepIndex int, output ModelOutput, isSelected bool, pathIndex int) error {
	client := database.GetClient()
	if client == nil {
		return fmt.Errorf("database client not initialized")
	}

	// First, find the step_id
	var steps []struct {
		ID string `json:"id"`
	}
	_, err := client.From("reasoning_steps").
		Select("id", "", false).
		Filter("session_id", "eq", sessionID).
		Filter("step_index", "eq", fmt.Sprintf("%d", stepIndex)).
		ExecuteTo(&steps)

	if err != nil || len(steps) == 0 {
		return fmt.Errorf("failed to find step for output: %w", err)
	}

	data := map[string]interface{}{
		"step_id":     steps[0].ID,
		"session_id":  sessionID,
		"model_id":    output.ModelID,
		"model_name":  output.ModelName,
		"response":    output.Response,
		"scores":      output.Scores,
		"cost":        output.Cost,
		"tokens_used": output.TokensUsed,
		"latency_ms":  output.LatencyMs,
		"is_refined":  output.IsRefined,
		"is_selected": isSelected,
		"path_index":  pathIndex,
		"created_at":  output.Timestamp,
	}

	_, _, err = client.From("reasoning_outputs").Insert(data, false, "", "", "").Execute()
	if err != nil {
		return fmt.Errorf("failed to save reasoning output: %w", err)
	}

	return nil
}
