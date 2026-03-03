package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"relay/internal/database"
)

// WorldModel maintains persistent shared knowledge across sessions
type WorldModel struct {
	Facts map[string]Fact
	mu    sync.RWMutex
	db    *database.Client
}

// Fact represents a stored piece of knowledge
type Fact struct {
	Key       string                 `json:"key"`
	Value     string                 `json:"value"`
	Source    string                 `json:"source"`    // Which agent learned this
	SessionID string                 `json:"session_id"` // When it was learned
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata"`
}

// NewWorldModel creates a new world model
func NewWorldModel(db *database.Client) *WorldModel {
	wm := &WorldModel{
		Facts: make(map[string]Fact),
		db:    db,
	}

	// Load existing facts from database
	if db != nil {
		wm.loadFromDatabase(context.Background())
	}

	return wm
}

// Store adds a fact to the world model
func (wm *WorldModel) Store(ctx context.Context, key, value, source, sessionID string) error {
	wm.mu.Lock()
	defer wm.mu.Unlock()

	fact := Fact{
		Key:       normalizeKey(key),
		Value:     value,
		Source:    source,
		SessionID: sessionID,
		Timestamp: time.Now(),
		Metadata:  make(map[string]interface{}),
	}

	wm.Facts[fact.Key] = fact

	fmt.Printf("🧠 World Model: Stored fact '%s' = '%s' (from: %s)\n", fact.Key, value, source)

	// Persist to database
	if wm.db != nil {
		return wm.persistFact(ctx, fact)
	}

	return nil
}

// Retrieve gets a fact from the world model
func (wm *WorldModel) Retrieve(ctx context.Context, key string) (*Fact, bool) {
	wm.mu.RLock()
	defer wm.mu.RUnlock()

	fact, exists := wm.Facts[normalizeKey(key)]
	if !exists {
		return nil, false
	}

	return &fact, true
}

// Search finds relevant facts by keyword matching
func (wm *WorldModel) Search(ctx context.Context, query string, limit int) []Fact {
	wm.mu.RLock()
	defer wm.mu.RUnlock()

	query = strings.ToLower(query)
	results := make([]Fact, 0)

	for _, fact := range wm.Facts {
		// Check if query matches key or value
		if strings.Contains(strings.ToLower(fact.Key), query) ||
			strings.Contains(strings.ToLower(fact.Value), query) {
			results = append(results, fact)
			if len(results) >= limit {
				break
			}
		}
	}

	fmt.Printf("🔍 World Model: Found %d facts matching '%s'\n", len(results), query)

	return results
}

// GetContext builds a context string from relevant facts
func (wm *WorldModel) GetContext(ctx context.Context, query string, maxFacts int) string {
	facts := wm.Search(ctx, query, maxFacts)

	if len(facts) == 0 {
		return ""
	}

	var context strings.Builder
	context.WriteString("KNOWN FACTS FROM PREVIOUS SESSIONS:\n")

	for i, fact := range facts {
		context.WriteString(fmt.Sprintf("%d. %s: %s (learned in session %s)\n",
			i+1, fact.Key, fact.Value, fact.SessionID))
	}

	context.WriteString("\n")
	return context.String()
}

// ListAll returns all facts (for debugging/admin)
func (wm *WorldModel) ListAll() []Fact {
	wm.mu.RLock()
	defer wm.mu.RUnlock()

	facts := make([]Fact, 0, len(wm.Facts))
	for _, fact := range wm.Facts {
		facts = append(facts, fact)
	}

	return facts
}

// Clear removes all facts (for testing)
func (wm *WorldModel) Clear() {
	wm.mu.Lock()
	defer wm.mu.Unlock()

	wm.Facts = make(map[string]Fact)
	fmt.Println("🧹 World Model: Cleared all facts")
}

// ExtractFacts parses agent output to extract learnable facts
func (wm *WorldModel) ExtractFacts(ctx context.Context, text, source, sessionID string) []string {
	// Simple heuristic: look for statements with "is", "are", "has", "have"
	// In production, you'd use NLP or LLM-based extraction

	extracted := make([]string, 0)
	sentences := strings.Split(text, ".")

	for _, sentence := range sentences {
		sentence = strings.TrimSpace(sentence)
		if len(sentence) < 10 {
			continue
		}

		// Look for factual statements
		if strings.Contains(sentence, " is ") ||
			strings.Contains(sentence, " are ") ||
			strings.Contains(sentence, " has ") ||
			strings.Contains(sentence, " have ") {

			// Extract as key-value
			parts := strings.SplitN(sentence, " is ", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				value := strings.TrimSpace(parts[1])

				if len(key) > 3 && len(value) > 3 {
					wm.Store(ctx, key, value, source, sessionID)
					extracted = append(extracted, sentence)
				}
			}
		}
	}

	return extracted
}

// persistFact saves a fact to the database
func (wm *WorldModel) persistFact(ctx context.Context, fact Fact) error {
	metadataJSON, _ := json.Marshal(fact.Metadata)

	data := map[string]interface{}{
		"key":        fact.Key,
		"value":      fact.Value,
		"source":     fact.Source,
		"session_id": fact.SessionID,
		"metadata":   string(metadataJSON),
		"created_at": fact.Timestamp,
		"updated_at": fact.Timestamp,
	}

	// Upsert (insert or update)
	_, _, err := wm.db.From("world_model_facts").
		Insert(data, true, "key", "", "").Execute()

	if err != nil {
		return fmt.Errorf("failed to persist fact: %w", err)
	}

	return nil
}

// loadFromDatabase loads existing facts from database
func (wm *WorldModel) loadFromDatabase(ctx context.Context) error {
	if wm.db == nil {
		return nil
	}

	var facts []struct {
		Key       string    `json:"key"`
		Value     string    `json:"value"`
		Source    string    `json:"source"`
		SessionID string    `json:"session_id"`
		CreatedAt time.Time `json:"created_at"`
	}

	_, err := wm.db.From("world_model_facts").
		Select("key, value, source, session_id, created_at", "", false).
		ExecuteTo(&facts)

	if err != nil {
		fmt.Printf("⚠️ Failed to load world model from database: %v\n", err)
		return err
	}

	for _, f := range facts {
		wm.Facts[f.Key] = Fact{
			Key:       f.Key,
			Value:     f.Value,
			Source:    f.Source,
			SessionID: f.SessionID,
			Timestamp: f.CreatedAt,
			Metadata:  make(map[string]interface{}),
		}
	}

	fmt.Printf("🧠 World Model: Loaded %d facts from database\n", len(facts))
	return nil
}

// normalizeKey converts a key to lowercase and removes extra whitespace
func normalizeKey(key string) string {
	key = strings.TrimSpace(key)
	key = strings.ToLower(key)
	// Replace multiple spaces with single space
	key = strings.Join(strings.Fields(key), " ")
	return key
}
