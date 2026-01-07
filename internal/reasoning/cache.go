package reasoning

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

// CachedResponse represents a cached model output with expiration
type CachedResponse struct {
	Output    ModelOutput
	CachedAt  time.Time
	ExpiresAt time.Time
}

// IsExpired checks if the cached response has expired
func (cr *CachedResponse) IsExpired() bool {
	return time.Now().After(cr.ExpiresAt)
}

// ResponseCache provides in-memory caching for model responses
type ResponseCache struct {
	cache map[string]CachedResponse
	mu    sync.RWMutex
	ttl   time.Duration // Time-to-live for cached responses
}

// NewResponseCache creates a new response cache with specified TTL
func NewResponseCache(ttl time.Duration) *ResponseCache {
	return &ResponseCache{
		cache: make(map[string]CachedResponse),
		ttl:   ttl,
	}
}

// Get retrieves a cached response if it exists and hasn't expired
func (rc *ResponseCache) Get(stepHash string) (ModelOutput, bool) {
	rc.mu.RLock()
	defer rc.mu.RUnlock()

	resp, exists := rc.cache[stepHash]
	if !exists {
		return ModelOutput{}, false
	}

	if resp.IsExpired() {
		// Don't return expired cache entries
		return ModelOutput{}, false
	}

	return resp.Output, true
}

// Set stores a response in the cache
func (rc *ResponseCache) Set(stepHash string, output ModelOutput) {
	rc.mu.Lock()
	defer rc.mu.Unlock()

	rc.cache[stepHash] = CachedResponse{
		Output:    output,
		CachedAt:  time.Now(),
		ExpiresAt: time.Now().Add(rc.ttl),
	}
}

// Clear removes all cached entries
func (rc *ResponseCache) Clear() {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	rc.cache = make(map[string]CachedResponse)
}

// CleanExpired removes expired entries from the cache
func (rc *ResponseCache) CleanExpired() int {
	rc.mu.Lock()
	defer rc.mu.Unlock()

	count := 0
	for key, resp := range rc.cache {
		if resp.IsExpired() {
			delete(rc.cache, key)
			count++
		}
	}
	return count
}

// Size returns the number of cached entries
func (rc *ResponseCache) Size() int {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	return len(rc.cache)
}

// GenerateStepHash creates a deterministic hash for a reasoning step
// to use as a cache key. This includes the step objective, task type, and context.
func GenerateStepHash(step ReasoningStep, context string) string {
	// Create a stable representation of the step for hashing
	data := struct {
		Objective string
		TaskType  string
		Context   string
	}{
		Objective: step.Objective,
		TaskType:  step.TaskType,
		Context:   context,
	}

	jsonData, _ := json.Marshal(data)
	hash := sha256.Sum256(jsonData)
	return fmt.Sprintf("%x", hash)
}
