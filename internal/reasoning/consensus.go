package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// ConsensusStrategy defines how model disagreements are resolved
type ConsensusStrategy string

const (
	StrategyMajority  ConsensusStrategy = "majority"
	StrategyWeighted  ConsensusStrategy = "weighted"
	StrategyMetaAgent ConsensusStrategy = "meta_agent"
)

// ConsensusConfig handles settings for meta-reasoning
type ConsensusConfig struct {
	Enabled   bool              `json:"enabled"`
	Strategy  ConsensusStrategy `json:"strategy"`
	MetaModel string            `json:"meta_model"` // e.g., "openai/gpt-4o"
	Threshold float64           `json:"threshold"`  // Below this, trigger meta-agent
}

// DefaultConsensusConfig returns recommended settings
func DefaultConsensusConfig() ConsensusConfig {
	return ConsensusConfig{
		Enabled:   true, // Enabled by default for better consensus
		Strategy:  StrategyMetaAgent,
		MetaModel: "openrouter:google/gemini-2.0-flash-exp:free", // Use free model for consensus
		Threshold: 0.6, // Lower threshold to trigger more often
	}
}

// ConsensusAgent manages model reconciliation
type ConsensusAgent struct {
	Orchestrator *Orchestrator
}

func NewConsensusAgent(orch *Orchestrator) *ConsensusAgent {
	return &ConsensusAgent{Orchestrator: orch}
}

// Reconcile resolves differences between multiple model outputs
func (ca *ConsensusAgent) Reconcile(ctx context.Context, objective string, outputs []ModelOutput, config ConsensusConfig) (*ConsensusResult, error) {
	if len(outputs) == 0 {
		return nil, fmt.Errorf("no outputs to reconcile")
	}

	if len(outputs) == 1 {
		return &ConsensusResult{
			AgreementScore: 1.0,
			BestOutput:     &outputs[0],
			Rationale:      "Single model output provided.",
			Method:         "direct",
			Diversion:      false,
		}, nil
	}

	// 1. Calculate Agreement Score (Similarity check)
	agreementScore := ca.calculateAgreement(outputs)

	// 2. Decide if Meta-Agent is needed
	if config.Strategy == StrategyMetaAgent || (agreementScore < config.Threshold && config.Enabled) {
		return ca.runMetaAgentReasoning(ctx, objective, outputs, config.MetaModel)
	}

	// 3. Fallback to Simple Selection (Greedy/Weighted)
	var best *ModelOutput
	maxScore := -1.0
	for i := range outputs {
		if outputs[i].Scores.Overall > maxScore {
			maxScore = outputs[i].Scores.Overall
			best = &outputs[i]
		}
	}

	return &ConsensusResult{
		AgreementScore: agreementScore,
		BestOutput:     best,
		Rationale:      fmt.Sprintf("Agreement score %.2f. Reverted to best individual model.", agreementScore),
		Method:         string(config.Strategy),
		Diversion:      agreementScore < 0.5,
	}, nil
}

// calculateAgreement performs basic semantic similarity or keyword overlap check
func (ca *ConsensusAgent) calculateAgreement(outputs []ModelOutput) float64 {
	if len(outputs) < 2 {
		return 1.0
	}

	// Simple heuristic: compare response lengths and keyword overlap
	// In production, this would use embeddings or Jaccard similarity
	totalSim := 0.0
	count := 0
	for i := 0; i < len(outputs); i++ {
		for j := i + 1; j < len(outputs); j++ {
			sim := ca.simpleSimilarity(outputs[i].Response, outputs[j].Response)
			totalSim += sim
			count++
		}
	}

	return totalSim / float64(count)
}

func (ca *ConsensusAgent) simpleSimilarity(a, b string) float64 {
	a = strings.ToLower(a)
	b = strings.ToLower(b)

	wordsA := strings.Fields(a)
	wordsB := strings.Fields(b)

	if len(wordsA) == 0 || len(wordsB) == 0 {
		return 0.0
	}

	setA := make(map[string]bool)
	for _, w := range wordsA {
		if len(w) > 3 { // Ignore small words
			setA[w] = true
		}
	}

	intersection := 0
	for _, w := range wordsB {
		if setA[w] {
			intersection++
			delete(setA, w) // Count each word once
		}
	}

	return float64(intersection) / float64(max(len(wordsA), len(wordsB)))
}

// runMetaAgentReasoning asks a high-tier model to judge the winners
func (ca *ConsensusAgent) runMetaAgentReasoning(ctx context.Context, objective string, outputs []ModelOutput, metaModel string) (*ConsensusResult, error) {
	prompt := fmt.Sprintf(`### Objective: %s

I have received multiple conflicting responses from different AI models. 
Your task is to analyze these responses, detect which one is the most accurate/helpful, and synthesize the final best answer.

MODELS RESPONSES:
`, objective)

	for i, out := range outputs {
		prompt += fmt.Sprintf("\n--- Model %d (%s) ---\n%s\n", i+1, out.ModelName, out.Response)
	}

	prompt += `
Respond ONLY in JSON format:
{
  "selected_index": (0-based index of the best response),
  "synthesized_response": "The final improved version of the answer",
  "rationale": "Why this version was selected/synthesized",
  "agreement_score": (0.0 to 1.0 level of consensus among inputs)
}`

	// Query meta-model
	resp, err := ca.Orchestrator.Query(ctx, metaModel, prompt)
	if err != nil {
		return nil, fmt.Errorf("meta-agent query failed: %w", err)
	}

	// Parse JSON output
	var result struct {
		SelectedIndex       int     `json:"selected_index"`
		SynthesizedResponse string  `json:"synthesized_response"`
		Rationale           string  `json:"rationale"`
		AgreementScore      float64 `json:"agreement_score"`
	}

	if err := json.Unmarshal([]byte(resp), &result); err != nil {
		// Fallback if model didn't provide clean JSON
		return nil, fmt.Errorf("meta-agent returned invalid JSON: %w", err)
	}

	// Create a new "Consensus" output
	bestOutput := outputs[0] // fallback
	if result.SelectedIndex >= 0 && result.SelectedIndex < len(outputs) {
		bestOutput = outputs[result.SelectedIndex]
	}

	// Update response with synthesized one if it's superior
	if result.SynthesizedResponse != "" {
		bestOutput.Response = result.SynthesizedResponse
		bestOutput.ModelName = "Consensus (Meta-Agent)"
	}

	return &ConsensusResult{
		AgreementScore: result.AgreementScore,
		BestOutput:     &bestOutput,
		Rationale:      result.Rationale,
		Method:         "meta_agent",
		Diversion:      true,
	}, nil
}
