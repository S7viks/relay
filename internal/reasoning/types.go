package reasoning

import (
	"relay/internal/models"
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

// SessionConfig handles session-wide behavior settings
type SessionConfig struct {
	BudgetLimit     float64 `json:"budget_limit"`
	PriorityProfile string  `json:"priority_profile"` // "quality", "speed", "balanced"
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

// ConsensusResult represents the outcome of the meta-reasoning process
type ConsensusResult struct {
	AgreementScore float64      `json:"agreement_score"`
	Method         string       `json:"method"`         // "voting" or "meta_agent"
	FinalDecision  string       `json:"final_decision"` // The actual text selected
	BestOutput     *ModelOutput `json:"best_output"`    // Pointer to the winner
	Confidence     float64      `json:"confidence"`
	Rationale      string       `json:"rationale"`
	Diversion      bool         `json:"diversion"` // true if models strongly disagreed
}

// ReasoningStep represents one logical step in the decomposed prompt
type ReasoningStep struct {
	Index          int              `json:"index"`
	Title          string           `json:"title"`
	Objective      string           `json:"objective"`
	TaskType       models.TaskType  `json:"task_type"` // NEW: Identifies the type of task for routing
	ModelOutputs   []ModelOutput    `json:"model_outputs"`
	SelectedOutput *ModelOutput     `json:"selected_output"`
	Consensus      *ConsensusResult `json:"consensus,omitempty"` // NEW: Result of meta-reasoning
	Status         string           `json:"status"`              // pending, processing, completed, error
	StartTime      time.Time        `json:"start_time"`
	EndTime        time.Time        `json:"end_time"`
}

// PathNode represents a node in the reasoning tree (useful for beam search)
type PathNode struct {
	ID              string  `json:"id"`
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
	UserID         string                 `json:"user_id"`
	TenantID       string                 `json:"tenant_id"`
	OriginalPrompt string                 `json:"original_prompt"`
	Steps          []ReasoningStep        `json:"steps"`
	SelectedPath   []ModelOutput          `json:"selected_path"`
	ActivePaths    [][]ModelOutput        `json:"active_paths"` // NEW: For Beam Search tracking
	TotalCost      float64                `json:"total_cost"`   // NEW: Session-wide tracking
	Metadata       map[string]interface{} `json:"metadata"`
	CreatedAt      time.Time              `json:"created_at"`
	UpdatedAt      time.Time              `json:"updated_at"`
	Config         SessionConfig          `json:"config"` // NEW: Session-wide settings
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
		Config: SessionConfig{
			BudgetLimit:     0.05, // Default $0.05 per session
			PriorityProfile: "balanced",
		},
	}
}

// GetContext returns a summarized context of previous successful steps
func (sm *SharedMemory) GetContext() string {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	// Implementation here will format the path into a prompt context
	return ""
}
