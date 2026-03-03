package reasoning

import (
	"context"
	"fmt"
	"strings"

	"relay/internal/models"
	"relay/internal/uaip"
)

// VectorStore is now an alias or we use uaip.VectorStore directly
type VectorStore = uaip.VectorStore

// Document is now an alias or we use uaip.Document directly
type Document = uaip.Document

// RAGManager handles retrieval and augmentation logic
type RAGManager struct {
	Store     VectorStore
	Embedder  models.EmbeddingProvider
	Threshold float64
	MaxDocs   int
}

// NewRAGManager creates a new RAGManager
func NewRAGManager(store VectorStore, embedder models.EmbeddingProvider) *RAGManager {
	return &RAGManager{
		Store:     store,
		Embedder:  embedder,
		Threshold: 0.7,
		MaxDocs:   3,
	}
}

// AugmentPrompt retrieves relevant context and appends it to the prompt
func (rm *RAGManager) AugmentPrompt(ctx context.Context, prompt string) (string, []Document, error) {
	if rm.Store == nil || rm.Embedder == nil {
		return prompt, nil, nil
	}

	// 1. Generate embedding for the prompt
	vector, err := rm.Embedder.GenerateEmbedding(ctx, prompt)
	if err != nil {
		return prompt, nil, fmt.Errorf("failed to generate embedding: %w", err)
	}

	// 2. Query vector store
	docs, err := rm.Store.Query(ctx, vector, rm.MaxDocs)
	if err != nil {
		return prompt, nil, fmt.Errorf("failed to query vector store: %w", err)
	}

	// 3. Filter and Format context
	var contextParts []string
	var selectedDocs []Document
	for _, doc := range docs {
		if doc.Score >= rm.Threshold {
			contextParts = append(contextParts, doc.Content)
			selectedDocs = append(selectedDocs, doc)
		}
	}

	if len(contextParts) == 0 {
		return prompt, nil, nil
	}

	// 4. Augment prompt
	augmentedPrompt := fmt.Sprintf(
		"Context information is below.\n---------------------\n%s\n---------------------\nGiven the context information and not prior knowledge, answer the query.\nQuery: %s\nAnswer: ",
		strings.Join(contextParts, "\n\n"),
		prompt,
	)

	return augmentedPrompt, selectedDocs, nil
}
