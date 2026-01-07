package reasoning

import (
	"context"
	"time"

	"gaiol/internal/models"
	"gaiol/internal/uaip"
)

// NewMockRouter creates a mock router that returns a real *models.ModelRouter
// This uses a dummy adapter so tests don't need real API keys
func NewMockRouter() *models.ModelRouter {
	dummyAdapter := &DummyAdapter{}
	registry := models.NewRegistry(dummyAdapter, dummyAdapter)
	return models.NewModelRouter(registry, nil) // nil tracker for testing
}

// DummyAdapter is a minimal adapter implementation for testing
type DummyAdapter struct{}

func (d *DummyAdapter) GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error) {
	return &uaip.UAIPResponse{
		UAIP: uaip.UAIPHeader{
			Version:   "1.0",
			MessageID: "dummy-response",
			Timestamp: time.Now(),
		},
		Status: uaip.ResponseStatus{
			Success: true,
		},
		Result: uaip.Result{
			Data:       "Dummy response",
			TokensUsed: 10,
			Quality:    0.5,
		},
		Metadata: uaip.ResponseMetadata{
			CostInfo: uaip.CostUsage{
				TotalCost: 0.0,
			},
		},
	}, nil
}

func (d *DummyAdapter) SupportsStreaming() bool {
	return false
}

func (d *DummyAdapter) GetCapabilities() models.ModelCapabilities {
	return models.ModelCapabilities{
		SupportsStreaming: false,
		MaxTokens:         1000,
		ContextWindow:     1000,
		QualityScore:      0.5,
		Multimodal:        false,
		Languages:         []string{"en"},
	}
}

func (d *DummyAdapter) Name() string {
	return "DummyAdapter"
}

func (d *DummyAdapter) Provider() string {
	return "mock"
}

func (d *DummyAdapter) SupportedTasks() []models.TaskType {
	return []models.TaskType{models.TaskGenerate}
}

func (d *DummyAdapter) RequiresAuth() bool {
	return false
}

func (d *DummyAdapter) GetCost() models.CostInfo {
	return models.CostInfo{
		CostPerToken:   0.0,
		CostPerRequest: 0.0,
	}
}

func (d *DummyAdapter) HealthCheck() error {
	return nil
}
