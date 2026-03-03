package models

import (
	"context"
	"relay/internal/uaip"
)

// ModelProvider represents different AI service providers
type ModelProvider string

const (
	ProviderGoogle      ModelProvider = "google"
	ProviderOpenAI      ModelProvider = "openai"
	ProviderAnthropic   ModelProvider = "anthropic"
	ProviderHuggingFace ModelProvider = "huggingface"
	ProviderOllama      ModelProvider = "ollama"
	ProviderMicrosoft   ModelProvider = "microsoft"
)

// ModelInfo contains basic information about a model
type ModelInfo struct {
	Name         string            `json:"name"`
	Provider     ModelProvider     `json:"provider"`
	Type         string            `json:"type"`
	Description  string            `json:"description"`
	Version      string            `json:"version"`
	Capabilities ModelCapabilities `json:"capabilities"`
	Cost         CostInfo          `json:"cost"`
}

// ModelAdapter defines the interface that all AI model adapters must implement
type ModelAdapter interface {
	Name() string
	Provider() string
	SupportedTasks() []TaskType
	RequiresAuth() bool
	GetCapabilities() ModelCapabilities
	GetCost() CostInfo
	HealthCheck() error

	GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error)
}

// TaskType represents the type of AI task
type TaskType string

const (
	TaskGenerate  TaskType = "generate"
	TaskAnalyze   TaskType = "analyze"
	TaskSummarize TaskType = "summarize"
	TaskTransform TaskType = "transform"
	TaskClassify  TaskType = "classify"
	TaskCode      TaskType = "code"
	TaskVision    TaskType = "vision"
	TaskLogic     TaskType = "logic"
)

// ModelCapabilities describes what a model can do
type ModelCapabilities struct {
	MaxTokens         int      `json:"max_tokens"`
	SupportsStreaming bool     `json:"supports_streaming"`
	Languages         []string `json:"languages"`
	ContextWindow     int      `json:"context_window"`
	QualityScore      float64  `json:"quality_score"`
	Multimodal        bool     `json:"multimodal"`
}

// CostInfo represents pricing and usage limits
type CostInfo struct {
	CostPerToken    float64 `json:"cost_per_token"`
	CostPerRequest  float64 `json:"cost_per_request"`
	FreeTierLimit   int     `json:"free_tier_limit"`
	RateLimitPerMin int     `json:"rate_limit_per_min"`
}
