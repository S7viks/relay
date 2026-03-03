package database

import (
	"context"
	"encoding/json"
	"fmt"
	"relay/internal/uaip"
)

// SupabaseVectorStore implements VectorStore using Supabase pgvector
type SupabaseVectorStore struct {
	client *Client
}

// NewSupabaseVectorStore creates a new SupabaseVectorStore
func NewSupabaseVectorStore(client *Client) *SupabaseVectorStore {
	return &SupabaseVectorStore{client: client}
}

// Query performs a similarity search in the documents table
func (s *SupabaseVectorStore) Query(ctx context.Context, vector []float64, limit int) ([]uaip.Document, error) {
	if s.client == nil || s.client.Client == nil {
		return nil, fmt.Errorf("supabase client not initialized")
	}

	// RPC call: match_documents(query_embedding, match_threshold, match_count)
	params := map[string]interface{}{
		"query_embedding": vector,
		"match_threshold": 0.5,
		"match_count":     limit,
	}

	// Correct RPC call for supabase-go 0.0.4
	var results []uaip.Document
	resp := s.client.Client.Rpc("match_documents", "", params)
	err := json.Unmarshal([]byte(resp), &results)
	if err != nil {
		return nil, fmt.Errorf("failed to query documents: %w", err)
	}

	return results, nil
}

// Insert adds a new document to the store
func (s *SupabaseVectorStore) Insert(ctx context.Context, doc uaip.Document) error {
	// Not strictly required for the reasoning engine retrieval yet,
	// but useful for building the database.
	// Implementation would involve generating embedding and then inserting.
	return fmt.Errorf("insert not implemented in SupabaseVectorStore")
}
