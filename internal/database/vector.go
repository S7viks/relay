package database

import (
	"context"
	"encoding/json"
	"fmt"
	"gaiol/internal/uaip"
	"strconv"
	"strings"
	"time"
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

// Insert adds a new document row to the documents table for a tenant.
func (s *SupabaseVectorStore) Insert(ctx context.Context, tenantID string, content string, embedding []float32, metadata map[string]interface{}) error {
	if s.client == nil || s.client.Client == nil {
		return fmt.Errorf("supabase client not initialized")
	}
	if strings.TrimSpace(tenantID) == "" {
		return fmt.Errorf("tenantID is required for vector insert")
	}
	if metadata == nil {
		metadata = map[string]interface{}{}
	}

	row := map[string]interface{}{
		"org_id":     tenantID,
		"content":    content,
		"embedding":  toPGVectorLiteral(embedding),
		"metadata":   metadata,
		"created_at": time.Now().UTC(),
	}

	_, _, err := s.client.Client.From("documents").Insert(row, false, "", "", "").Execute()
	if err != nil {
		return fmt.Errorf("failed to insert document for tenant %s: %w", tenantID, err)
	}
	return nil
}

func toPGVectorLiteral(embedding []float32) string {
	if len(embedding) == 0 {
		return "[]"
	}
	parts := make([]string, len(embedding))
	for i, v := range embedding {
		parts[i] = strconv.FormatFloat(float64(v), 'f', -1, 32)
	}
	return "[" + strings.Join(parts, ",") + "]"
}
