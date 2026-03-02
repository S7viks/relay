package models

import (
	"context"
)

// EmbeddingProvider defines the interface for generating vector embeddings
type EmbeddingProvider interface {
	GenerateEmbedding(ctx context.Context, text string) ([]float64, error)
	GetVectorSize() int
}

// ModelWithEmbeddings is an interface for adapters that support embeddings
type ModelWithEmbeddings interface {
	ModelAdapter
	GenerateEmbedding(ctx context.Context, model string, text string) ([]float64, error)
}
