package contracts

import (
	"context"

	"gaiol/internal/reasoning"
)

// ReasoningSessionRunner is the minimal surface for multi-step reasoning sessions
// (session lifecycle + run). The canonical implementation is *reasoning.ReasoningEngine.
type ReasoningSessionRunner interface {
	InitSession(ctx context.Context, prompt string) string
	RunSession(ctx context.Context, sessionID, prompt string, modelIDs []string) (*reasoning.SharedMemory, error)
}

var _ ReasoningSessionRunner = (*reasoning.ReasoningEngine)(nil)
