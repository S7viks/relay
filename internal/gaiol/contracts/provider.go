package contracts

import (
	"context"

	"gaiol/internal/uaip"
)

// TextModelClient is the minimal stable surface for text generation across providers.
// Production adapters typically implement the wider models.ModelAdapter interface,
// which includes HealthCheck, capabilities, and naming; those types satisfy
// TextModelClient as long as they implement GenerateText.
type TextModelClient interface {
	GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error)
}
