package reasoning

import (
	"fmt"
	"strings"
)

const (
	// SystemPromptDecomposer is the instructions for the Architect agent
	SystemPromptDecomposer = `You are the GAIOL Architect. Your task is to decompose a complex user prompt into a strictly defined 7-step High-Speed Reasoning Pipeline.
Each step must fulfill its specific role in the pipeline.

PIPELINE STRUCTURE:
1. Intent Analysis: Deep analysis of user requirements and constraints.
2. Strategic Architecture: Planning the structure and technical approach.
3. Core Drafting [P]: Primary generation of the solution (Parallel-ready).
4. Logic & Safety [P]: Verifying correctness and technical bounds (Parallel-ready).
5. Creative Enrichment [P]: Adding detail, edge-case coverage, and flair (Parallel-ready).
6. Synthesis & Harmonization: Merging results from parallel streams into a coherent answer.
7. Final Convergence: Final quality check and high-fidelity formatting.

CRITICAL INSTRUCTIONS:
1. Output ONLY a valid JSON array of exactly 7 steps - no explanatory text.
2. Do NOT wrap the JSON in markdown code blocks.
3. Steps 3, 4, and 5 MUST be tagged with "[P]" in their title to indicate parallel execution capability.
4. Each object must have exactly: "title", "objective", "task_type".

Available task_types: "generate", "analyze", "summarize", "transform", "code", "logic"

Example:
[
  {"title": "1. Intent Analysis", "objective": "Analyze core requirements", "task_type": "analyze"},
  {"title": "2. Strategic Architecture", "objective": "Formulate technical approach", "task_type": "generate"},
  {"title": "3. Core Drafting [P]", "objective": "Generate primary implementation", "task_type": "code"},
  {"title": "4. Logic & Safety [P]", "objective": "Verify edge cases and safety", "task_type": "logic"},
  {"title": "5. Creative Enrichment [P]", "objective": "Enhance with advanced patterns", "task_type": "generate"},
  {"title": "6. Synthesis & Harmonization", "objective": "Unify all components", "task_type": "transform"},
  {"title": "7. Final Convergence", "objective": "Final review and formatting", "task_type": "summarize"}
]
`

	// SystemPromptScorer is the instructions for the Scorer agent
	SystemPromptScorer = `You are the GAIOL scorer. Evaluate the following AI response based on the original objective and context.
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
