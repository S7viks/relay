package reasoning

import (
	"sync"
	"time"
)

// MetricScores represents quality evaluations for a model's output
type MetricScores struct {
	Relevance    float64 `json:"relevance"`
	Coherence    float64 `json:"coherence"`
	Completeness float64 `json:"completeness"`
	Accuracy     float64 `json:"accuracy"`
	Creativity   float64 `json:"creativity"`
	Overall      float64 `json:"overall"`
}

// ModelOutput represents a single response from an LLM
type ModelOutput struct {
	ModelID    string       `json:"model_id"`
	ModelName  string       `json:"model_name"`
	Response   string       `json:"response"`
	Scores     MetricScores `json:"scores"`
	Cost       float64      `json:"cost"`
	TokensUsed int          `json:"tokens_used"`
	LatencyMs  int64        `json:"latency_ms"`
	Timestamp  time.Time    `json:"timestamp"`
	IsRefined  bool         `json:"is_refined,omitempty"` // Indicates if this output was refined by critic
}

// ReasoningStep represents one logical step in the decomposed prompt
type ReasoningStep struct {
	Index          int           `json:"index"`
	Title          string        `json:"title"`
	Objective      string        `json:"objective"`
	ModelOutputs   []ModelOutput `json:"model_outputs"`
	SelectedOutput *ModelOutput  `json:"selected_output"`
	Status         string        `json:"status"` // pending, processing, completed, error
	StartTime      time.Time     `json:"start_time"`
	EndTime        time.Time     `json:"end_time"`
}

// PathNode represents a node in the reasoning tree (useful for beam search)
type PathNode struct {
	StepIndex       int     `json:"step_index"`
	OutputIndex     int     `json:"output_index"`
	Score           float64 `json:"score"`
	ParentID        string  `json:"parent_id"`
	CumulativeScore float64 `json:"cumulative_score"`
}

// SharedMemory is the unified context pool for all LLMs in a reasoning session
type SharedMemory struct {
	mu sync.RWMutex

	SessionID      string                 `json:"session_id"`
	OriginalPrompt string                 `json:"original_prompt"`
	Steps          []ReasoningStep        `json:"steps"`
	SelectedPath   []ModelOutput          `json:"selected_path"`
	Metadata       map[string]interface{} `json:"metadata"`
	CreatedAt      time.Time              `json:"created_at"`
	UpdatedAt      time.Time              `json:"updated_at"`
}

// NewSharedMemory creates a new shared memory instance
func NewSharedMemory(sessionID, prompt string) *SharedMemory {
	return &SharedMemory{
		SessionID:      sessionID,
		OriginalPrompt: prompt,
		Steps:          make([]ReasoningStep, 0),
		SelectedPath:   make([]ModelOutput, 0),
		Metadata:       make(map[string]interface{}),
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}
}

// GetContext returns a summarized context of previous successful steps
func (sm *SharedMemory) GetContext() string {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	// Implementation here will format the path into a prompt context
	return ""
}
