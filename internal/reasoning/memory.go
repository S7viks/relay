package reasoning

import (
	"fmt"
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

// SaveSession would handle persistence to a database or file
func (mm *MemoryManager) SaveSession(sessionID string) error {
	// TODO: Implement JSON persistence
	return nil
}
