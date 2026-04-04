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

// InsertDocument stores an embedding row in the documents table.
func (c *Client) InsertDocument(ctx context.Context, tenantID, content string, embedding []float32, metadata map[string]interface{}) error {
	if tenantID == "" {
		return fmt.Errorf("InsertDocument: tenantID must not be empty")
	}

	parts := make([]string, len(embedding))
	for i, v := range embedding {
		parts[i] = strconv.FormatFloat(float64(v), 'f', 6, 32)
	}
	vecStr := "[" + strings.Join(parts, ",") + "]"

	metaJSON, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("InsertDocument: marshal metadata: %w", err)
	}
	metaObj := map[string]interface{}{}
	if len(metaJSON) > 0 && string(metaJSON) != "null" {
		if err := json.Unmarshal(metaJSON, &metaObj); err != nil {
			return fmt.Errorf("InsertDocument: unmarshal metadata: %w", err)
		}
	}

	if c == nil || c.Client == nil {
		return fmt.Errorf("InsertDocument: database client is not initialized")
	}
	row := map[string]interface{}{
		"org_id":     tenantID,
		"content":    content,
		"embedding":  vecStr,
		"metadata":   metaObj,
		"created_at": time.Now().UTC(),
	}
	_, _, err = c.Client.From("documents").Insert(row, false, "", "", "").Execute()
	return err
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
