package reasoning

import (
	"context"
	"fmt"

	"gaiol/internal/models"
	"gaiol/internal/uaip"
)

// QueryRequest is a simplified request format for reasoning components
type QueryRequest struct {
	Prompt      string
	ModelID     string
	System      string
	Stream      bool
	Temperature float64
}

// QueryResponse is a simplified response format
type QueryResponse struct {
	Response      string
	EstimatedCost float64
	Usage         struct {
		TotalTokens int
	}
}

// QueryModel is a convenience wrapper around ModelRouter for reasoning components
type QueryModel struct {
	router *models.ModelRouter
}

// NewQueryModel creates a new QueryModel instance
func NewQueryModel(router *models.ModelRouter) *QueryModel {
	return &QueryModel{router: router}
}

// Query executes a simple model query using the specified model ID directly
func (qm *QueryModel) Query(ctx context.Context, modelID string, prompt string) (string, error) {
	return qm.QueryWithTokens(ctx, modelID, prompt, 1000) // Default 1000 tokens
}

// QueryWithTokens executes a query with custom max_tokens
func (qm *QueryModel) QueryWithTokens(ctx context.Context, modelID string, prompt string, maxTokens int) (string, error) {
	resp, err := qm.QueryFullWithTokens(ctx, modelID, prompt, maxTokens)
	if err != nil {
		return "", err
	}
	return resp.Response, nil
}

// QueryFull executes a model query and returns full usage/cost info
func (qm *QueryModel) QueryFull(ctx context.Context, modelID string, prompt string) (QueryResponse, error) {
	return qm.QueryFullWithTokens(ctx, modelID, prompt, 1000)
}

// QueryFullWithTokens executes a model query with custom max_tokens and returns full usage/cost info
func (qm *QueryModel) QueryFullWithTokens(ctx context.Context, modelID string, prompt string, maxTokens int) (QueryResponse, error) {
	// Convert to UAIP format
	uaipReq := &uaip.UAIPRequest{
		Payload: uaip.Payload{
			Input: uaip.PayloadInput{
				Data:   prompt,
				Format: "text",
			},
			OutputRequirements: uaip.OutputRequirements{
				MaxTokens:   maxTokens,
				Temperature: 0.7,
			},
		},
	}

	registry := qm.router.GetRegistry()
	modelMeta, err := registry.GetModel(models.ModelID(modelID))
	if err != nil {
		modelMeta, err = registry.GetModel(models.ModelID("openrouter:" + modelID))
		if err != nil {
			return QueryResponse{}, fmt.Errorf("model not found: %s", modelID)
		}
	}

	adapter := modelMeta.Adapter
	if adapter == nil {
		return QueryResponse{}, fmt.Errorf("no adapter for model: %s", modelID)
	}

	resp, err := adapter.GenerateText(ctx, modelMeta.ModelName, uaipReq)
	if err != nil {
		return QueryResponse{}, fmt.Errorf("model execution failed: %w", err)
	}

	if !resp.Status.Success {
		return QueryResponse{}, fmt.Errorf("model status fail: %s", resp.Status.Message)
	}

	result := QueryResponse{
		Response: resp.Result.Data,
	}
	result.Usage.TotalTokens = resp.Result.TokensUsed

	// Calculate cost if not provided by adapter
	if resp.Metadata.CostInfo.TotalCost > 0 {
		result.EstimatedCost = resp.Metadata.CostInfo.TotalCost
	} else {
		// Use registry cost info
		costInfo := modelMeta.CostInfo
		result.EstimatedCost = (float64(resp.Result.TokensUsed) * costInfo.CostPerToken) + costInfo.CostPerRequest
	}

	return result, nil
}
