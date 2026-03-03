package models

import (
	"fmt"
	"sort"
	"strings"
	"sync"
)

// ModelID uniquely identifies a model (format: "provider:model-name")
type ModelID string

// ModelMetadata contains all information about a registered model
type ModelMetadata struct {
	ID            ModelID
	Provider      string
	ModelName     string // Actual model name used in API calls
	DisplayName   string // Human-readable name
	CostInfo      CostInfo
	Capabilities  []TaskType
	QualityScore  float64
	ContextWindow int
	MaxTokens     int
	Tags          []string
	Adapter       ModelAdapter
}

// Registry manages all available models and their metadata
type Registry struct {
	models map[ModelID]ModelMetadata
	mu     sync.RWMutex
}

// NewRegistry creates and initializes a new model registry with predefined models
// for providers that have adapters configured. This is primarily used in tests
// and legacy flows that still rely on a curated catalog.
func NewRegistry(openRouterAdapter, hfAdapter, ollamaAdapter ModelAdapter) *Registry {
	r := &Registry{
		models: make(map[ModelID]ModelMetadata),
	}

	// Register in priority order: Ollama > HF > OpenRouter
	if ollamaAdapter != nil {
		r.registerOllamaModels(ollamaAdapter)
	}

	if hfAdapter != nil {
		r.registerHuggingFaceModels(hfAdapter)
	}
	if openRouterAdapter != nil {
		r.registerOpenRouterModels(openRouterAdapter)
	}

	return r
}

// NewEmptyRegistry creates an empty registry without registering any predefined models.
// This is the preferred constructor for tenant-facing flows where models are defined
// explicitly via tenant configuration (tenant_models, preferences, etc.).
func NewEmptyRegistry() *Registry {
	return &Registry{
		models: make(map[ModelID]ModelMetadata),
	}
}

// AddGeminiModels registers Gemini models when a Google API key is provided (e.g. from tenant keys).
// Call after NewRegistry when building a registry from tenant provider keys that include "google".
func (r *Registry) AddGeminiModels(adapter ModelAdapter) {
	if adapter == nil {
		return
	}
	geminiModels := map[string]struct {
		DisplayName   string
		Capabilities  []TaskType
		MaxTokens     int
		ContextWindow int
		QualityScore  float64
		CostPerToken  float64
		Tags          []string
	}{
		"gemini-1.5-flash": {
			DisplayName:   "Gemini 1.5 Flash",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskSummarize, TaskTransform},
			MaxTokens:     8192,
			ContextWindow: 1048576,
			QualityScore:  0.85,
			CostPerToken:  0.0,
			Tags:          []string{"free", "fast", "google"},
		},
		"gemini-2.0-flash": {
			DisplayName:   "Gemini 2.0 Flash",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskSummarize, TaskCode},
			MaxTokens:     8192,
			ContextWindow: 1048576,
			QualityScore:  0.88,
			CostPerToken:  0.0,
			Tags:          []string{"free", "fast", "google"},
		},
	}
	for modelName, info := range geminiModels {
		id := ModelID("gemini:" + modelName)
		r.mu.Lock()
		r.models[id] = ModelMetadata{
			ID:            id,
			Provider:      "gemini",
			ModelName:     modelName,
			DisplayName:   info.DisplayName,
			CostInfo:      CostInfo{CostPerToken: info.CostPerToken},
			Capabilities:  info.Capabilities,
			QualityScore:  info.QualityScore,
			ContextWindow: info.ContextWindow,
			MaxTokens:     info.MaxTokens,
			Tags:          info.Tags,
			Adapter:       adapter,
		}
		r.mu.Unlock()
	}
}

// registerOpenRouterModels adds all OpenRouter models to the registry
func (r *Registry) registerOpenRouterModels(adapter ModelAdapter) {
	openRouterModels := map[string]struct {
		DisplayName   string
		Capabilities  []TaskType
		MaxTokens     int
		ContextWindow int
		QualityScore  float64
		CostPerToken  float64
		Tags          []string
	}{
		// === FREE MODELS ===
		"google/gemini-2.0-flash-exp:free": {
			DisplayName:   "Gemini 2.0 Flash (Free)",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskSummarize, TaskCode},
			MaxTokens:     2048,
			ContextWindow: 32768,
			QualityScore:  0.88,
			CostPerToken:  0.0,
			Tags:          []string{"free", "fast", "multimodal"},
		},
		"google/gemini-flash-1.5:free": {
			DisplayName:   "Gemini 1.5 Flash (Free)",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskSummarize},
			MaxTokens:     2048,
			ContextWindow: 32768,
			QualityScore:  0.86,
			CostPerToken:  0.0,
			Tags:          []string{"free", "fast"},
		},
		"meta-llama/llama-3.2-3b-instruct:free": {
			DisplayName:   "Llama 3.2 3B (Free)",
			Capabilities:  []TaskType{TaskGenerate, TaskCode, TaskAnalyze},
			MaxTokens:     2048,
			ContextWindow: 8192,
			QualityScore:  0.80,
			CostPerToken:  0.0,
			Tags:          []string{"free", "llama", "small"},
		},
		"mistralai/mistral-7b-instruct:free": {
			DisplayName:   "Mistral 7B (Free)",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskCode},
			MaxTokens:     2048,
			ContextWindow: 8192,
			QualityScore:  0.82,
			CostPerToken:  0.0,
			Tags:          []string{"free", "mistral"},
		},
		"qwen/qwen-2-7b-instruct:free": {
			DisplayName:   "Qwen 2 7B (Free)",
			Capabilities:  []TaskType{TaskGenerate, TaskCode, TaskAnalyze},
			MaxTokens:     2048,
			ContextWindow: 32768,
			QualityScore:  0.83,
			CostPerToken:  0.0,
			Tags:          []string{"free", "reasoning"},
		},
		"z-ai/glm-4.5-air:free": {
			DisplayName:   "Zhipu GLM 4.5 Air (Free)",
			Capabilities:  []TaskType{TaskGenerate, TaskSummarize, TaskAnalyze},
			MaxTokens:     2048,
			ContextWindow: 32768,
			QualityScore:  0.82,
			CostPerToken:  0.0,
			Tags:          []string{"free", "general"},
		},
		"deepseek/deepseek-r1:free": {
			DisplayName:   "DeepSeek R1 (Free)",
			Capabilities:  []TaskType{TaskAnalyze, TaskGenerate, TaskCode, TaskLogic},
			MaxTokens:     2048,
			ContextWindow: 32768,
			QualityScore:  0.83,
			CostPerToken:  0.0,
			Tags:          []string{"free", "reasoning", "logic"},
		},
		"moonshotai/kimi-k2:free": {
			DisplayName:   "Kimi K2 (Free)",
			Capabilities:  []TaskType{TaskGenerate, TaskSummarize},
			MaxTokens:     2048,
			ContextWindow: 32768,
			QualityScore:  0.80,
			CostPerToken:  0.0,
			Tags:          []string{"free"},
		},

		// === PREMIUM MODELS ===
		"anthropic/claude-sonnet-4": {
			DisplayName:   "Claude Sonnet 4",
			Capabilities:  []TaskType{TaskSummarize, TaskAnalyze, TaskGenerate, TaskCode, TaskLogic},
			MaxTokens:     8192,
			ContextWindow: 200000,
			QualityScore:  0.96,
			CostPerToken:  0.000015,
			Tags:          []string{"long_context", "premium", "high_quality", "logic", "anthropic"},
		},
		"anthropic/claude-3.5-sonnet": {
			DisplayName:   "Claude 3.5 Sonnet",
			Capabilities:  []TaskType{TaskSummarize, TaskAnalyze, TaskGenerate, TaskCode, TaskLogic},
			MaxTokens:     4096,
			ContextWindow: 200000,
			QualityScore:  0.94,
			CostPerToken:  0.000015,
			Tags:          []string{"long_context", "premium", "high_quality", "logic", "anthropic"},
		},
		"openai/gpt-4o": {
			DisplayName:   "GPT-4o",
			Capabilities:  []TaskType{TaskGenerate, TaskCode, TaskAnalyze, TaskSummarize, TaskLogic},
			MaxTokens:     4096,
			ContextWindow: 128000,
			QualityScore:  0.93,
			CostPerToken:  0.000005,
			Tags:          []string{"premium", "fast", "reliable", "logic", "openai"},
		},
		"openai/gpt-4o-mini": {
			DisplayName:   "GPT-4o Mini",
			Capabilities:  []TaskType{TaskGenerate, TaskCode, TaskAnalyze},
			MaxTokens:     4096,
			ContextWindow: 128000,
			QualityScore:  0.88,
			CostPerToken:  0.000003,
			Tags:          []string{"cheap", "good_quality", "fast", "openai"},
		},
		"x-ai/grok-2": {
			DisplayName:   "Grok 2 (xAI)",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskCode, TaskLogic},
			MaxTokens:     4096,
			ContextWindow: 131072,
			QualityScore:  0.91,
			CostPerToken:  0.00001,
			Tags:          []string{"premium", "xai", "grok"},
		},
		"deepseek/deepseek-chat": {
			DisplayName:   "DeepSeek Chat (V3)",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskCode, TaskLogic},
			MaxTokens:     4096,
			ContextWindow: 65536,
			QualityScore:  0.90,
			CostPerToken:  0.000001,
			Tags:          []string{"cheap", "reasoning", "deepseek"},
		},
		"meta-llama/llama-3.1-70b-instruct": {
			DisplayName:   "Llama 3.1 70B",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskCode},
			MaxTokens:     4096,
			ContextWindow: 128000,
			QualityScore:  0.90,
			CostPerToken:  0.000005,
			Tags:          []string{"premium", "llama", "open_source"},
		},
		"mistralai/mistral-large-latest": {
			DisplayName:   "Mistral Large",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskCode, TaskLogic},
			MaxTokens:     4096,
			ContextWindow: 128000,
			QualityScore:  0.91,
			CostPerToken:  0.000008,
			Tags:          []string{"premium", "mistral"},
		},
	}

	for modelName, info := range openRouterModels {
		id := ModelID("openrouter:" + modelName)
		r.models[id] = ModelMetadata{
			ID:            id,
			Provider:      "openrouter",
			ModelName:     modelName,
			DisplayName:   info.DisplayName,
			CostInfo:      CostInfo{CostPerToken: info.CostPerToken},
			Capabilities:  info.Capabilities,
			QualityScore:  info.QualityScore,
			ContextWindow: info.ContextWindow,
			MaxTokens:     info.MaxTokens,
			Tags:          info.Tags,
			Adapter:       adapter,
		}
	}
}

// registerHuggingFaceModels adds all HuggingFace models to the registry
func (r *Registry) registerHuggingFaceModels(adapter ModelAdapter) {
	hfModels := map[string]struct {
		DisplayName   string
		Capabilities  []TaskType
		MaxTokens     int
		ContextWindow int
		QualityScore  float64
		CostPerToken  float64
		Tags          []string
	}{
		"mistralai/Mistral-7B-Instruct-v0.3": {
			DisplayName:   "Mistral 7B Instruct v0.3",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskCode},
			MaxTokens:     2048,
			ContextWindow: 32768,
			QualityScore:  0.78,
			CostPerToken:  0.0,
			Tags:          []string{"free", "mistral"},
		},
		"google/gemma-2-2b-it": {
			DisplayName:   "Gemma 2 2B IT",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze},
			MaxTokens:     1024,
			ContextWindow: 8192,
			QualityScore:  0.73,
			CostPerToken:  0.0,
			Tags:          []string{"free", "small", "fast", "google"},
		},
		"meta-llama/Llama-3.1-8B-Instruct": {
			DisplayName:   "Llama 3.1 8B Instruct",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskCode},
			MaxTokens:     2048,
			ContextWindow: 8192,
			QualityScore:  0.80,
			CostPerToken:  0.0,
			Tags:          []string{"free", "llama"},
		},
		"Qwen/Qwen2.5-7B-Instruct": {
			DisplayName:   "Qwen 2.5 7B Instruct",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskCode},
			MaxTokens:     2048,
			ContextWindow: 32768,
			QualityScore:  0.79,
			CostPerToken:  0.0,
			Tags:          []string{"free", "qwen"},
		},
	}

	for modelName, info := range hfModels {
		id := ModelID("huggingface:" + modelName)
		r.models[id] = ModelMetadata{
			ID:            id,
			Provider:      "huggingface",
			ModelName:     modelName,
			DisplayName:   info.DisplayName,
			CostInfo:      CostInfo{CostPerToken: info.CostPerToken},
			Capabilities:  info.Capabilities,
			QualityScore:  info.QualityScore,
			ContextWindow: info.ContextWindow,
			MaxTokens:     info.MaxTokens,
			Tags:          info.Tags,
			Adapter:       adapter,
		}
	}
}

// registerOllamaModels adds local Ollama models to the registry
func (r *Registry) registerOllamaModels(adapter ModelAdapter) {
	ollamaModels := map[string]struct {
		DisplayName   string
		Capabilities  []TaskType
		MaxTokens     int
		ContextWindow int
		QualityScore  float64
		CostPerToken  float64
		Tags          []string
	}{
		"llama3.2:latest": {
			DisplayName:   "Llama 3.2 (Local)",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskCode, TaskSummarize},
			MaxTokens:     2048,
			ContextWindow: 8192,
			QualityScore:  0.85, // Good quality
			CostPerToken:  0.0,  // FREE
			Tags:          []string{"free", "local", "fast", "llama"},
		},
		"llama3.1:latest": {
			DisplayName:   "Llama 3.1 (Local)",
			Capabilities:  []TaskType{TaskGenerate, TaskAnalyze, TaskCode, TaskLogic},
			MaxTokens:     2048,
			ContextWindow: 8192,
			QualityScore:  0.88,
			CostPerToken:  0.0,
			Tags:          []string{"free", "local", "fast", "llama"},
		},
		"codellama:latest": {
			DisplayName:   "CodeLlama (Local)",
			Capabilities:  []TaskType{TaskCode, TaskGenerate, TaskAnalyze},
			MaxTokens:     2048,
			ContextWindow: 8192,
			QualityScore:  0.82,
			CostPerToken:  0.0,
			Tags:          []string{"free", "local", "code"},
		},
	}

	for modelName, info := range ollamaModels {
		id := ModelID("ollama:" + modelName)
		r.models[id] = ModelMetadata{
			ID:            id,
			Provider:      "ollama",
			ModelName:     modelName,
			DisplayName:   info.DisplayName,
			CostInfo:      CostInfo{CostPerToken: info.CostPerToken},
			Capabilities:  info.Capabilities,
			QualityScore:  info.QualityScore,
			ContextWindow: info.ContextWindow,
			MaxTokens:     info.MaxTokens,
			Tags:          info.Tags,
			Adapter:       adapter,
		}
	}
}

// GetModel retrieves a specific model by ID
func (r *Registry) GetModel(id ModelID) (*ModelMetadata, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	model, exists := r.models[id]
	if !exists {
		return nil, fmt.Errorf("model %s not found", id)
	}
	return &model, nil
}

// ListModels returns all registered models
func (r *Registry) ListModels() []ModelMetadata {
	r.mu.RLock()
	defer r.mu.RUnlock()

	models := make([]ModelMetadata, 0, len(r.models))
	for _, m := range r.models {
		models = append(models, m)
	}
	return models
}

// RegisterModel adds or replaces a model in the registry.
// This is used for tenant-configured models (bring-your-own providers/models).
func (r *Registry) RegisterModel(m ModelMetadata) error {
	if strings.TrimSpace(string(m.ID)) == "" {
		return fmt.Errorf("model id is required")
	}
	if strings.TrimSpace(m.Provider) == "" {
		return fmt.Errorf("model provider is required")
	}
	if strings.TrimSpace(m.ModelName) == "" {
		return fmt.Errorf("model name is required")
	}
	if m.Adapter == nil {
		return fmt.Errorf("model adapter is required")
	}
	if strings.TrimSpace(m.DisplayName) == "" {
		m.DisplayName = m.ModelName
	}
	if len(m.Capabilities) == 0 {
		m.Capabilities = []TaskType{TaskGenerate}
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	r.models[m.ID] = m
	return nil
}

// FindModelsByTask returns models that support a specific task
func (r *Registry) FindModelsByTask(task TaskType) []ModelMetadata {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var matches []ModelMetadata
	for _, model := range r.models {
		for _, cap := range model.Capabilities {
			if cap == task {
				matches = append(matches, model)
				break
			}
		}
	}
	return matches
}

// FindModelsByTags returns models that have ANY of the specified tags
func (r *Registry) FindModelsByTags(tags []string) []ModelMetadata {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var matches []ModelMetadata
	for _, model := range r.models {
		if hasAnyTag(model.Tags, tags) {
			matches = append(matches, model)
		}
	}
	return matches
}

// FindFreeModels returns only free models
func (r *Registry) FindFreeModels() []ModelMetadata {
	return r.FindModelsByTags([]string{"free"})
}

// FindBestModel finds the best model for a task with constraints
func (r *Registry) FindBestModel(task TaskType, maxCost float64, minQuality float64) (*ModelMetadata, error) {
	candidates := r.FindModelsByTask(task)

	if len(candidates) == 0 {
		return nil, fmt.Errorf("no models found for task %s", task)
	}

	// Filter by cost and quality
	var filtered []ModelMetadata
	for _, m := range candidates {
		if m.CostInfo.CostPerToken <= maxCost && m.QualityScore >= minQuality {
			filtered = append(filtered, m)
		}
	}

	if len(filtered) == 0 {
		return nil, fmt.Errorf("no models match criteria (maxCost: %.6f, minQuality: %.2f)", maxCost, minQuality)
	}

	// Sort by quality (descending)
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].QualityScore > filtered[j].QualityScore
	})

	return &filtered[0], nil
}

// FindModelsByProvider returns all models from a specific provider
func (r *Registry) FindModelsByProvider(provider string) []ModelMetadata {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var matches []ModelMetadata
	for _, model := range r.models {
		if model.Provider == provider {
			matches = append(matches, model)
		}
	}
	return matches
}

// Count returns the number of registered models
func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return len(r.models)
}

// Helper function to check if model has any of the search tags
func hasAnyTag(modelTags, searchTags []string) bool {
	for _, st := range searchTags {
		for _, mt := range modelTags {
			if st == mt {
				return true
			}
		}
	}
	return false
}
