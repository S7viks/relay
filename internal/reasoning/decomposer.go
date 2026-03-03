package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"relay/internal/models"
)

// DecomposedStep represents a raw step from the LLM
type DecomposedStep struct {
	Title     string `json:"title"`
	Objective string `json:"objective"`
	TaskType  string `json:"task_type"`
}

// Decomposer handles breaking down prompts into steps
type Decomposer struct {
	Router *models.ModelRouter
}

// NewDecomposer creates a new decomposer
func NewDecomposer(router *models.ModelRouter) *Decomposer {
	return &Decomposer{
		Router: router,
	}
}

// DecomposePrompt takes a user prompt and returns a list of ReasoningSteps
func (d *Decomposer) DecomposePrompt(ctx context.Context, prompt string) ([]ReasoningStep, error) {
	// Add timeout for decomposition (15 seconds max)
	decomposeCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	// Get all free models from registry and try them
	registry := d.Router.GetRegistry()
	allModels := registry.ListModels()

	// Filter for free models and prioritize local Ollama or fast cloud models
	var decomposerModels []string
	for _, model := range allModels {
		if model.CostInfo.CostPerToken == 0.0 {
			// Prioritize Ollama (local) first, then Gemini and Llama-3.2
			if model.Provider == "ollama" {
				// Prepend Ollama models
				decomposerModels = append([]string{string(model.ID)}, decomposerModels...)
			} else if strings.Contains(string(model.ID), "gemini") || strings.Contains(string(model.ID), "llama-3.2") {
				decomposerModels = append([]string{string(model.ID)}, decomposerModels...)
			} else {
				decomposerModels = append(decomposerModels, string(model.ID))
			}
		}
	}

	if len(decomposerModels) == 0 {
		return nil, fmt.Errorf("no free models available for decomposition")
	}

	// If an Ollama model was found, it should already be at the front
	if strings.HasPrefix(decomposerModels[0], "ollama:") {
		fmt.Printf("🔍 Using Ollama for decomposition: %s\n", decomposerModels[0])
	} else {
		fmt.Printf("📋 Found %d free models available for decomposition\n", len(decomposerModels))
	}

	qm := NewQueryModel(d.Router)
	prompt_full := SystemPromptDecomposer + "\n\n" + prompt

	var resp string
	var err error
	for _, modelID := range decomposerModels {
		fmt.Printf("🔍 Attempting decomposition with model: %s\n", modelID)
		fmt.Printf("📝 Sending prompt (first 200 chars): %s...\n", prompt_full[:min(200, len(prompt_full))])

		// Use custom UAIP request with higher token limit for decomposition
		ctx2, cancel2 := context.WithTimeout(decomposeCtx, 10*time.Second)
		defer cancel2()

		resp, err = qm.QueryWithTokens(ctx2, modelID, prompt_full, 2000) // Increased from default
		fmt.Printf("📤 Raw response length: %d, Error: %v\n", len(resp), err)
		if len(resp) > 0 {
			fmt.Printf("📄 Raw response (first 500 chars): %s\n", resp[:min(500, len(resp))])
		}
		if err == nil && resp != "" {
			fmt.Printf("✅ Got response from %s (length: %d chars)\n", modelID, len(resp))
			break
		}
		fmt.Printf("❌ Model %s failed or returned empty. Error: %v\n", modelID, err)
		// If context deadline exceeded, stop trying more models and fall back
		if decomposeCtx.Err() == context.DeadlineExceeded {
			fmt.Printf("⏱️  Decomposition timeout reached. Stopping model attempts.\n")
			break
		}
	}

	if err != nil || resp == "" {
		fmt.Printf("\n")
		fmt.Printf("===========================================\n")
		fmt.Printf("⚠️  ALL DECOMPOSER MODELS FAILED\n")
		fmt.Printf("⚠️  Falling back to permanent 7-step pipeline\n")
		fmt.Printf("===========================================\n")
		fmt.Printf("\n")
		return d.createFallbackDecomposition(prompt), nil
	}

	// Extract and clean the JSON response
	cleanResp := d.extractJSON(resp)
	if cleanResp == "" {
		fmt.Printf("⚠️  Failed to extract JSON from response. Raw response: %s\n", resp)
		fmt.Printf("⚠️  Falling back to permanent 7-step pipeline.\n")
		return d.createFallbackDecomposition(prompt), nil
	}

	// If response doesn't start with '[', wrap it in array brackets
	if !strings.HasPrefix(strings.TrimSpace(cleanResp), "[") {
		cleanResp = "[" + cleanResp + "]"
		fmt.Printf("🔧 Wrapped response in array brackets\n")
	}

	var rawSteps []DecomposedStep
	err = json.Unmarshal([]byte(cleanResp), &rawSteps)
	if err != nil {
		// Log the cleaned response for debugging
		fmt.Printf("JSON Parse Error: %v\nCleaned Response: %s\nRaw Response: %s\n", err, cleanResp, resp)
		fmt.Printf("⚠️  JSON parsing failed. Falling back to permanent 7-step pipeline.\n")
		return d.createFallbackDecomposition(prompt), nil
	}

	// Convert raw steps to ReasoningStep structs
	steps := make([]ReasoningStep, len(rawSteps))
	for i, rs := range rawSteps {
		steps[i] = ReasoningStep{
			Index:     i,
			Title:     rs.Title,
			Objective: rs.Objective,
			TaskType:  models.TaskType(rs.TaskType),
			Status:    "pending",
		}
	}

	return steps, nil
}

// DecomposeWithRetry attempts to decompose the prompt with fallback/retry logic
func (d *Decomposer) DecomposeWithRetry(ctx context.Context, prompt string, maxRetries int) ([]ReasoningStep, error) {
	var lastErr error
	for i := 0; i < maxRetries; i++ {
		steps, err := d.DecomposePrompt(ctx, prompt)
		if err == nil {
			if d.validateSteps(steps) {
				return steps, nil
			}
			lastErr = fmt.Errorf("steps failed sanity check")
		} else {
			lastErr = err
		}
	}
	return nil, fmt.Errorf("failed to decompose after %d attempts: %v", maxRetries, lastErr)
}

// validateSteps checks if the steps are logically sound
func (d *Decomposer) validateSteps(steps []ReasoningStep) bool {
	if len(steps) == 0 {
		return false
	}
	// Add more complex validation logic here if needed
	// e.g., checking for empty titles or objectives
	for _, step := range steps {
		if strings.TrimSpace(step.Title) == "" || strings.TrimSpace(step.Objective) == "" {
			return false
		}
	}
	return true
}

// extractJSON attempts to extract valid JSON array from model response
func (d *Decomposer) extractJSON(resp string) string {
	resp = strings.TrimSpace(resp)
	if resp == "" {
		return ""
	}

	// Method 1: Try to find JSON in markdown code blocks
	if cleanedFromMarkdown := d.extractFromMarkdown(resp); cleanedFromMarkdown != "" {
		return cleanedFromMarkdown
	}

	// Method 2: Try to find a JSON array directly
	if jsonArray := d.extractJSONArray(resp); jsonArray != "" {
		return jsonArray
	}

	// Method 3: If response starts with '[', try to find the closing ']'
	if strings.HasPrefix(resp, "[") {
		// Find the last valid closing bracket
		for i := len(resp) - 1; i >= 0; i-- {
			if resp[i] == ']' {
				candidate := resp[:i+1]
				// Test if it's valid JSON
				var test []DecomposedStep
				if json.Unmarshal([]byte(candidate), &test) == nil {
					return candidate
				}
			}
		}
	}

	// Method 4: Return as-is and let caller handle error
	return resp
}

// extractFromMarkdown removes markdown code block wrapping
func (d *Decomposer) extractFromMarkdown(resp string) string {
	resp = strings.TrimSpace(resp)

	// Check for ```json or ``` blocks
	if strings.HasPrefix(resp, "```json") {
		resp = strings.TrimPrefix(resp, "```json")
		resp = strings.TrimSuffix(strings.TrimSpace(resp), "```")
		return strings.TrimSpace(resp)
	} else if strings.HasPrefix(resp, "```") {
		resp = strings.TrimPrefix(resp, "```")
		resp = strings.TrimSuffix(strings.TrimSpace(resp), "```")
		return strings.TrimSpace(resp)
	}

	return ""
}

// extractJSONArray finds a JSON array within mixed text
func (d *Decomposer) extractJSONArray(resp string) string {
	// Find the first '[' and last ']'
	startIdx := strings.Index(resp, "[")
	if startIdx == -1 {
		return ""
	}

	// Find matching closing bracket
	for i := len(resp) - 1; i > startIdx; i-- {
		if resp[i] == ']' {
			candidate := resp[startIdx : i+1]
			// Validate it's proper JSON
			var test []DecomposedStep
			if json.Unmarshal([]byte(candidate), &test) == nil {
				return candidate
			}
		}
	}

	return ""
}

// cleanJSONResponse removes markdown code blocks if present (legacy fallback)
func (d *Decomposer) cleanJSONResponse(resp string) string {
	resp = strings.TrimSpace(resp)
	if strings.HasPrefix(resp, "```json") {
		resp = strings.TrimPrefix(resp, "```json")
		resp = strings.TrimSuffix(resp, "```")
	} else if strings.HasPrefix(resp, "```") {
		resp = strings.TrimPrefix(resp, "```")
		resp = strings.TrimSuffix(resp, "```")
	}
	return strings.TrimSpace(resp)
}

// createFallbackDecomposition creates a standard 7-step pipeline when models fail
func (d *Decomposer) createFallbackDecomposition(prompt string) []ReasoningStep {
	return []ReasoningStep{
		{Index: 0, Title: "1. Intent Analysis", Objective: "Analyze core requirements: " + prompt, TaskType: models.TaskAnalyze, Status: "pending"},
		{Index: 1, Title: "2. Strategic Architecture", Objective: "Formulate technical approach", TaskType: models.TaskGenerate, Status: "pending"},
		{Index: 2, Title: "3. Core Drafting [P]", Objective: "Generate primary implementation", TaskType: models.TaskCode, Status: "pending"},
		{Index: 3, Title: "4. Logic & Safety [P]", Objective: "Verify edge cases and safety", TaskType: models.TaskLogic, Status: "pending"},
		{Index: 4, Title: "5. Creative Enrichment [P]", Objective: "Enhance details and edge cases", TaskType: models.TaskGenerate, Status: "pending"},
		{Index: 5, Title: "6. Synthesis & Harmonization", Objective: "Unify all reasoning branches", TaskType: models.TaskTransform, Status: "pending"},
		{Index: 6, Title: "7. Final Convergence", Objective: "Final quality review and formatting", TaskType: models.TaskSummarize, Status: "pending"},
	}
}
