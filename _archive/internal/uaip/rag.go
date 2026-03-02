package uaip

import (
	"context"
)

// Document represents a retrieved piece of information for RAG
type Document struct {
	Content  string                 `json:"content"`
	Metadata map[string]interface{} `json:"metadata"`
	Score    float64                `json:"similarity"`
}

// VectorStore defines the interface for storing and retrieving vectors
type VectorStore interface {
	Query(ctx context.Context, vector []float64, limit int) ([]Document, error)
	Insert(ctx context.Context, doc Document) error
}
