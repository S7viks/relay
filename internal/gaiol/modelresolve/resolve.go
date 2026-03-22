package modelresolve

import (
	"fmt"
	"strings"

	"gaiol/internal/models"
)

// Canonical registry provider keys (adapter / ModelMetadata.Provider).
const (
	ProviderOllama      = "ollama"
	ProviderHuggingFace = "huggingface"
	ProviderOpenRouter  = "openrouter"
	ProviderGemini      = "gemini"
)

// OpenRouter-native model slugs (no "openrouter:" prefix).
const (
	SlugGemini20FlashExpFree = "google/gemini-2.0-flash-exp:free"
	SlugDeepSeekR1Free       = "deepseek/deepseek-r1:free"
	// ScorerQuerySlug matches the historical bare slug passed to QueryModel (resolved via openrouter: prefix).
	ScorerQuerySlug = "anthropic/claude-3-5-sonnet"
)

// HuggingFaceFallbackModelName is the model name passed to HF adapter in orchestrator emergency fallback.
const HuggingFaceFallbackModelName = "mistralai/Mistral-7B-Instruct-v0.2"

// RegistryGetter is the minimal registry surface for strict ID resolution.
type RegistryGetter interface {
	GetModel(id models.ModelID) (*models.ModelMetadata, error)
}

// RegistryWithFree extends RegistryGetter for reasoning paths that may fall back to any free model.
type RegistryWithFree interface {
	RegistryGetter
	FindFreeModels() []models.ModelMetadata
}

// QualifiedOpenRouter returns registry ModelID for an OpenRouter-native slug.
func QualifiedOpenRouter(slug string) string {
	return ProviderOpenRouter + ":" + strings.TrimSpace(slug)
}

// DefaultReasoningStarterModelIDs matches the historical defaults when POST /api/reasoning/start sends no models.
func DefaultReasoningStarterModelIDs() []string {
	return []string{
		QualifiedOpenRouter(SlugGemini20FlashExpFree),
		QualifiedOpenRouter(SlugDeepSeekR1Free),
	}
}

// DefaultDynamicRouteFailureModelID is used when ModelRouter.Route fails during auto routing.
func DefaultDynamicRouteFailureModelID() string {
	return QualifiedOpenRouter(SlugGemini20FlashExpFree)
}

// DefaultConsensusMetaModelID is the default meta-model for consensus reconciliation.
func DefaultConsensusMetaModelID() string {
	return QualifiedOpenRouter(SlugGemini20FlashExpFree)
}

// DefaultAgentWorkflowModelID is the preferred local model for SimpleAgentWorkflow phases.
func DefaultAgentWorkflowModelID() string {
	return ProviderOllama + ":llama3.2:latest"
}

// IsOllamaProvider reports whether p is the canonical ollama registry provider key.
func IsOllamaProvider(p string) bool {
	return strings.EqualFold(strings.TrimSpace(p), ProviderOllama)
}

// DecomposerPriorityHint mirrors historical substring checks for “fast cloud” free models.
func DecomposerPriorityHint(modelID string) bool {
	s := strings.ToLower(modelID)
	return strings.Contains(s, "gemini") || strings.Contains(s, "llama-3.2")
}

// LookupRegisteredModel tries GetModel(raw) then GetModel("openrouter:"+raw), matching
// handleQuery / handleQueryModel and related HTTP paths (no free-model fallback).
func LookupRegisteredModel(reg RegistryGetter, raw string) (*models.ModelMetadata, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("model id is required")
	}
	m, err := reg.GetModel(models.ModelID(raw))
	if err == nil {
		return m, nil
	}
	m2, err2 := reg.GetModel(models.ModelID(ProviderOpenRouter + ":" + raw))
	if err2 == nil {
		return m2, nil
	}
	return nil, fmt.Errorf("model not found: %s", raw)
}

// LookupRegisteredModelOrFree matches reasoning.QueryModel resolution: strict lookup, then first free model.
func LookupRegisteredModelOrFree(reg RegistryWithFree, raw string) (*models.ModelMetadata, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("model id is required")
	}
	m, err := reg.GetModel(models.ModelID(raw))
	if err == nil {
		return m, nil
	}
	m2, err2 := reg.GetModel(models.ModelID(ProviderOpenRouter + ":" + raw))
	if err2 == nil {
		return m2, nil
	}
	free := reg.FindFreeModels()
	if len(free) > 0 {
		return &free[0], nil
	}
	return nil, fmt.Errorf("model not found: %s", raw)
}

// OrderedFreeModelIDsForDecomposer returns free model IDs in the same relative order as the legacy decomposer loop.
func OrderedFreeModelIDsForDecomposer(all []models.ModelMetadata) []string {
	var out []string
	for _, model := range all {
		if model.CostInfo.CostPerToken != 0.0 {
			continue
		}
		id := string(model.ID)
		if IsOllamaProvider(model.Provider) {
			out = append([]string{id}, out...)
		} else if DecomposerPriorityHint(id) {
			out = append([]string{id}, out...)
		} else {
			out = append(out, id)
		}
	}
	return out
}
