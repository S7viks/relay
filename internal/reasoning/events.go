package reasoning

import (
	"gaiol/internal/models"
	"time"
)

// EventType defines the type of event being sent
type EventType string

const (
	EventDecomposeStart EventType = "decompose_start"
	EventDecomposeEnd   EventType = "decompose_end"
	EventStepStart      EventType = "step_start"
	EventModelStart     EventType = "model_start"
	EventModelResponse  EventType = "model_response"
	EventStepEnd        EventType = "step_end"
	EventReasoningEnd   EventType = "reasoning_end"
	EventBeamUpdate     EventType = "beam_update"
	EventConsensus      EventType = "consensus" // NEW: Meta-reasoning consensus
	EventRAG            EventType = "rag"       // NEW: RAG context retrieval
	EventError          EventType = "error"
)

// ReasoningEvent represents a real-time update during the reasoning process
type ReasoningEvent struct {
	Type      EventType   `json:"type"`
	SessionID string      `json:"session_id"`
	Payload   interface{} `json:"payload"`
	Timestamp time.Time   `json:"timestamp"`
}

// EventDecomposePayload contains steps after decomposition
type EventDecomposePayload struct {
	Steps []ReasoningStep `json:"steps"`
}

// EventStepPayload contains information about the current step
type EventStepPayload struct {
	StepIndex int             `json:"step_index"`
	Title     string          `json:"title"`
	Objective string          `json:"objective"`
	TaskType  models.TaskType `json:"task_type"` // NEW: For UI badges
}

// EventModelPayload contains a model's partial or full response
type EventModelPayload struct {
	StepIndex int         `json:"step_index"`
	Output    ModelOutput `json:"output"`
}

// EventReasoningEndPayload contains the final assembled output
type EventReasoningEndPayload struct {
	FinalOutput string `json:"final_output"`
}

// EventCallback is a function that receives reasoning events
type EventCallback func(event ReasoningEvent)
