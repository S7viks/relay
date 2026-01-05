package reasoning

import (
	"context"

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

// Query executes a simple model query
func (qm *QueryModel) Query(ctx context.Context, modelID string, prompt string) (string, error) {
	// Convert to UAIP format
	uaipReq := &uaip.UAIPRequest{
		Payload: uaip.Payload{
			Input: uaip.PayloadInput{
				Data:   prompt,
				Format: "text",
			},
			OutputRequirements: uaip.OutputRequirements{
				MaxTokens:   1000,
				Temperature: 0.7,
			},
		},
	}

	// Route and execute
	resp, err := qm.router.RouteAndExecute(ctx, models.RoutingConfig{
		Strategy: models.StrategyFreeOnly,
		Task:     models.TaskGenerate,
	}, uaipReq)

	if err != nil {
		return "", err
	}

	return resp.Result.Data, nil
}
