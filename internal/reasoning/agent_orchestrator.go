package reasoning

import (
	"context"
	"fmt"
	"strings"
	"time"

	"relay/internal/models"
)

// SimpleAgentWorkflow runs a 3-agent workflow: Planner → Executor → Critic
type SimpleAgentWorkflow struct {
	Orchestrator *Orchestrator
	SessionID    string
	WorldModel   *WorldModel // NEW
	OnEvent      EventCallback
}

// NewSimpleAgentWorkflow creates a simple 3-agent workflow with world model
func NewSimpleAgentWorkflow(router *models.ModelRouter, sessionID string, worldModel *WorldModel) *SimpleAgentWorkflow {
	pb := NewPromptBuilder()
	orch := NewOrchestrator(router, pb)

	return &SimpleAgentWorkflow{
		Orchestrator: orch,
		SessionID:    sessionID,
		WorldModel:   worldModel, // NEW
	}
}

// Execute runs the 3-agent workflow
func (saw *SimpleAgentWorkflow) Execute(ctx context.Context, userPrompt string) (*WorkflowResult, error) {
	result := &WorkflowResult{
		SessionID: saw.SessionID,
		Steps:     make([]WorkflowStep, 0),
		StartTime: time.Now(),
	}

	// Use ANY available model (prefer free ones)
	modelID := "ollama:llama3.2:latest" // Try Ollama first

	// PHASE 1: PLANNING (30s timeout)
	fmt.Println("🎯 PHASE 1: Planning")
	saw.emitEvent("agent_phase", map[string]interface{}{"phase": "planning"})

	planCtx, planCancel := context.WithTimeout(ctx, 30*time.Second)
	defer planCancel()

	planner := NewAgent(RolePlanner, modelID, saw.WorldModel) // NEW: Pass world model
	planTask := AgentTask{
		ID:          "plan",
		Description: userPrompt,
		Context:     "",
	}

	planOutput, err := planner.Execute(planCtx, saw.Orchestrator, planTask)
	if err != nil {
		return nil, fmt.Errorf("planning failed: %w", err)
	}

	result.Steps = append(result.Steps, WorkflowStep{
		Phase:  "planning",
		Agent:  "planner",
		Output: planOutput.Response,
	})

	fmt.Printf("✅ Planning complete: %s\n", planOutput.Response[:min(100, len(planOutput.Response))])

	// PHASE 2: EXECUTION (60s timeout)
	fmt.Println("⚙️ PHASE 2: Execution")
	saw.emitEvent("agent_phase", map[string]interface{}{"phase": "execution"})

	execCtx, execCancel := context.WithTimeout(ctx, 60*time.Second)
	defer execCancel()

	executor := NewAgent(RoleExecutor, modelID, saw.WorldModel) // NEW: Pass world model
	execTask := AgentTask{
		ID:          "execute",
		Description: "Based on this plan, execute the main task: " + userPrompt,
		Context:     "Plan: " + planOutput.Response,
	}

	execOutput, err := executor.Execute(execCtx, saw.Orchestrator, execTask)
	if err != nil {
		return nil, fmt.Errorf("execution failed: %w", err)
	}

	result.Steps = append(result.Steps, WorkflowStep{
		Phase:  "execution",
		Agent:  "executor",
		Output: execOutput.Response,
	})

	fmt.Printf("✅ Execution complete: %s\n", execOutput.Response[:min(100, len(execOutput.Response))])

	// PHASE 3: CRITIQUE (30s timeout)
	fmt.Println("🔍 PHASE 3: Validation")
	saw.emitEvent("agent_phase", map[string]interface{}{"phase": "critique"})

	critiqueCtx, critiqueCancel := context.WithTimeout(ctx, 30*time.Second)
	defer critiqueCancel()

	critic := NewAgent(RoleCritic, modelID, saw.WorldModel) // NEW: Pass world model
	critiqueTask := AgentTask{
		ID:          "critique",
		Description: "Review this execution output for quality and completeness",
		Context:     "Execution: " + execOutput.Response,
	}

	critiqueOutput, err := critic.Execute(critiqueCtx, saw.Orchestrator, critiqueTask)
	if err != nil {
		// Critique is optional, continue without it
		fmt.Printf("⚠️ Critique failed: %v\n", err)
	} else {
		result.Steps = append(result.Steps, WorkflowStep{
			Phase:  "critique",
			Agent:  "critic",
			Output: critiqueOutput.Response,
		})
		fmt.Printf("✅ Critique complete: %s\n", critiqueOutput.Response[:min(100, len(critiqueOutput.Response))])
	}

	// FINAL SYNTHESIS
	result.FinalOutput = saw.synthesize(result.Steps)
	result.EndTime = time.Now()
	result.Duration = result.EndTime.Sub(result.StartTime)

	saw.emitEvent("workflow_complete", result)

	return result, nil
}

// synthesize combines all step outputs
func (saw *SimpleAgentWorkflow) synthesize(steps []WorkflowStep) string {
	var parts []string

	for _, step := range steps {
		parts = append(parts, fmt.Sprintf("### %s (%s)\n%s\n",
			strings.ToUpper(step.Phase), step.Agent, step.Output))
	}

	return strings.Join(parts, "\n---\n\n")
}

// emitEvent sends workflow events
func (saw *SimpleAgentWorkflow) emitEvent(eventType string, payload interface{}) {
	if saw.OnEvent != nil {
		saw.OnEvent(ReasoningEvent{
			Type:      EventType(eventType),
			SessionID: saw.SessionID,
			Payload:   payload,
			Timestamp: time.Now(),
		})
	}
}

// WorkflowResult holds the complete workflow output
type WorkflowResult struct {
	SessionID   string
	Steps       []WorkflowStep
	FinalOutput string
	StartTime   time.Time
	EndTime     time.Time
	Duration    time.Duration
}

// WorkflowStep represents one agent's work
type WorkflowStep struct {
	Phase  string
	Agent  string
	Output string
}
