package models

import (
	"context"
	"fmt"

	"relay/internal/uaip"
)

type RoutingStrategy string

const (
	StrategyLowestCost     RoutingStrategy = "lowest_cost"
	StrategyHighestQuality RoutingStrategy = "highest_quality"
	StrategyBalanced       RoutingStrategy = "balanced"
	StrategyFreeOnly       RoutingStrategy = "free_only"
)

type RoutingConfig struct {
	Strategy          RoutingStrategy
	Task              TaskType
	MaxCost           float64 // Maximum cost per token
	MinQuality        float64 // Minimum quality score (0-1)
	RequireTags       []string
	ExcludeTags       []string
	PreferredProvider string
}

type ModelRouter struct {
	registry *Registry
	tracker  *PerformanceTracker // NEW: For learned quality scores
}

func NewModelRouter(registry *Registry, tracker *PerformanceTracker) *ModelRouter {
	return &ModelRouter{
		registry: registry,
		tracker:  tracker,
	}
}

// GetRegistry returns the model registry
func (mr *ModelRouter) GetRegistry() *Registry {
	return mr.registry
}

// Route selects the best model based on routing config
func (mr *ModelRouter) Route(config RoutingConfig) (*ModelMetadata, error) {
	// Start with all models for the task
	candidates := mr.registry.FindModelsByTask(config.Task)

	if len(candidates) == 0 {
		return nil, fmt.Errorf("no models support task: %s", config.Task)
	}

	// PRIORITY FIX: Prefer local (Ollama) models first
	localModels := filterByProvider(candidates, "ollama")
	if len(localModels) > 0 {
		fmt.Printf("🏠 Using local Ollama model (no rate limits, free)\n")
		return &localModels[0], nil
	}

	// Then HuggingFace
	hfModels := filterByProvider(candidates, "huggingface")
	if len(hfModels) > 0 && config.Strategy == StrategyFreeOnly {
		fmt.Printf("🤗 Using HuggingFace model (free API)\n")
		return &hfModels[0], nil
	}

	// Rest of routing logic...
	// Apply Learned Quality Adjustment
	if mr.tracker != nil {
		for i := range candidates {
			if learned, ok := mr.tracker.GetLearnedQuality(candidates[i].ModelName, config.Task); ok {
				candidates[i].QualityScore = (candidates[i].QualityScore * 0.7) + (learned * 0.3)
			}
		}
	}

	// Apply strategy-specific filtering
	switch config.Strategy {
	case StrategyFreeOnly:
		candidates = filterFree(candidates)
	case StrategyLowestCost:
		candidates = filterByCost(candidates, config.MaxCost)
	case StrategyHighestQuality:
		candidates = filterByQuality(candidates, config.MinQuality)
	case StrategyBalanced:
		candidates = filterBalanced(candidates, config.MaxCost, config.MinQuality)
	}

	if len(candidates) == 0 {
		return nil, fmt.Errorf("no models match routing criteria")
	}

	// Apply tag filters
	if len(config.RequireTags) > 0 {
		candidates = filterByRequiredTags(candidates, config.RequireTags)
	}
	if len(config.ExcludeTags) > 0 {
		candidates = filterByExcludedTags(candidates, config.ExcludeTags)
	}

	// Prefer specific provider
	if config.PreferredProvider != "" {
		if preferred := filterByProvider(candidates, config.PreferredProvider); len(preferred) > 0 {
			candidates = preferred
		}
	}

	if len(candidates) == 0 {
		return nil, fmt.Errorf("no models after applying filters")
	}

	// Return the best match
	return &candidates[0], nil
}

// RouteAndExecute selects a model and executes the request
func (mr *ModelRouter) RouteAndExecute(ctx context.Context, config RoutingConfig, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error) {
	model, err := mr.Route(config)
	if err != nil {
		return nil, fmt.Errorf("routing failed: %w", err)
	}

	fmt.Printf("🔀 Router selected: %s (provider: %s, quality: %.2f, cost: $%.6f/token)\n",
		model.DisplayName, model.Provider, model.QualityScore, model.CostInfo.CostPerToken)

	// Call the adapter with the selected model
	return model.Adapter.GenerateText(ctx, model.ModelName, req)
}

// === Filter functions ===

func filterFree(models []ModelMetadata) []ModelMetadata {
	var result []ModelMetadata
	for _, m := range models {
		if m.CostInfo.CostPerToken == 0.0 {
			result = append(result, m)
		}
	}
	sortByQuality(result)
	return result
}

func filterByCost(models []ModelMetadata, maxCost float64) []ModelMetadata {
	var result []ModelMetadata
	for _, m := range models {
		if m.CostInfo.CostPerToken <= maxCost {
			result = append(result, m)
		}
	}
	sortByCost(result)
	return result
}

func filterByQuality(models []ModelMetadata, minQuality float64) []ModelMetadata {
	var result []ModelMetadata
	for _, m := range models {
		if m.QualityScore >= minQuality {
			result = append(result, m)
		}
	}
	sortByQuality(result)
	return result
}

func filterBalanced(models []ModelMetadata, maxCost, minQuality float64) []ModelMetadata {
	var result []ModelMetadata
	for _, m := range models {
		if m.CostInfo.CostPerToken <= maxCost && m.QualityScore >= minQuality {
			result = append(result, m)
		}
	}
	sortByValueScore(result)
	return result
}

func filterByRequiredTags(models []ModelMetadata, tags []string) []ModelMetadata {
	var result []ModelMetadata
	for _, m := range models {
		if hasAllTags(m.Tags, tags) {
			result = append(result, m)
		}
	}
	return result
}

func filterByExcludedTags(models []ModelMetadata, tags []string) []ModelMetadata {
	var result []ModelMetadata
	for _, m := range models {
		if !hasAnyTag(m.Tags, tags) {
			result = append(result, m)
		}
	}
	return result
}

func filterByProvider(models []ModelMetadata, provider string) []ModelMetadata {
	var result []ModelMetadata
	for _, m := range models {
		if m.Provider == provider {
			result = append(result, m)
		}
	}
	return result
}

// === Sort helpers ===

func sortByCost(models []ModelMetadata) {
	for i := 0; i < len(models)-1; i++ {
		for j := i + 1; j < len(models); j++ {
			if models[i].CostInfo.CostPerToken > models[j].CostInfo.CostPerToken {
				models[i], models[j] = models[j], models[i]
			}
		}
	}
}

func sortByQuality(models []ModelMetadata) {
	for i := 0; i < len(models)-1; i++ {
		for j := i + 1; j < len(models); j++ {
			if models[i].QualityScore < models[j].QualityScore {
				models[i], models[j] = models[j], models[i]
			}
		}
	}
}

func sortByValueScore(models []ModelMetadata) {
	for i := 0; i < len(models)-1; i++ {
		for j := i + 1; j < len(models); j++ {
			scoreI := models[i].QualityScore / (models[i].CostInfo.CostPerToken + 0.001)
			scoreJ := models[j].QualityScore / (models[j].CostInfo.CostPerToken + 0.001)
			if scoreI < scoreJ {
				models[i], models[j] = models[j], models[i]
			}
		}
	}
}

func hasAllTags(modelTags, requiredTags []string) bool {
	for _, rt := range requiredTags {
		found := false
		for _, mt := range modelTags {
			if rt == mt {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
