package reasoning

import (
	"fmt"
	"strings"
)

const (
	// SystemPromptDecomposer is the instructions for the Architect agent
	SystemPromptDecomposer = `You are the GAIOL Architect. Your task is to decompose a complex user prompt into a sequence of logical, independent but sequential steps.
Each step should be a specific sub-task that contributes to the final goal.
Your output MUST be a JSON array of objects, each with "title" and "objective" fields.

Example:
[
  {"title": "Step 1", "objective": "Analyze the problem..."},
  {"title": "Step 2", "objective": "Generate options..."}
]`

	// SystemPromptCritic is the instructions for the Scorer agent
	SystemPromptCritic = `You are the GAIOL critic. Evaluate the following AI response based on the original objective and context.
Provide scores from 0.0 to 1.0 for: Relevance, Coherence, Completeness, Accuracy, and Creativity.
Your output MUST be a JSON object with these fields and an "overall" score.

Example:
{
  "relevance": 0.9,
  "coherence": 0.8,
  "completeness": 0.85,
  "accuracy": 0.9,
  "creativity": 0.7,
  "overall": 0.83
}`
)

// PromptBuilder handles template generation for reasoning
type PromptBuilder struct {
	MaxContextTokens int
}

// NewPromptBuilder creates a new prompt builder
func NewPromptBuilder() *PromptBuilder {
	return &PromptBuilder{
		MaxContextTokens: 4000, // Default limit
	}
}

// WrapWithContext injects shared memory into the model's prompt
func (pb *PromptBuilder) WrapWithContext(objective, sharedContext string) string {
	var sb strings.Builder

	sb.WriteString("You are a specialized agent in a collaborative multi-agent reasoning system.\n")
	sb.WriteString("Below is the SHARED MEMORY of what has been achieved so far in this session.\n\n")
	
	sb.WriteString(sharedContext)
	
	sb.WriteString("\n--- CURRENT TASK ---\n")
	sb.WriteString(fmt.Sprintf("Your specific objective for this step is: %s\n", objective))
	sb.WriteString("Please provide a high-quality response based on the context above. Be concise but thorough.")

	return sb.String()
}

// TrimContext ensures the shared memory doesn't exceed token limits
func (pb *PromptBuilder) TrimContext(context string) string {
	// Simple character-based estimation for now
	// 4 characters approx 1 token
	maxChars := pb.MaxContextTokens * 4
	
	if len(context) <= maxChars {
		return context
	}
	
	// Keep the most recent part of the context
	return "...[TRUNCATED]...\n" + context[len(context)-maxChars:]
}
