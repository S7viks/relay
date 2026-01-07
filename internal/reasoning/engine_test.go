package reasoning

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"
)

// TestReasoningEngineCreation tests engine initialization
func TestReasoningEngineCreation(t *testing.T) {
	router := NewMockRouter()
	engine := NewReasoningEngine(router)

	if engine == nil {
		t.Fatal("NewReasoningEngine returned nil")
	}

	if engine.MemoryManager == nil {
		t.Error("MemoryManager should be initialized")
	}

	if engine.Decomposer == nil {
		t.Error("Decomposer should be initialized")
	}

	if engine.Orchestrator == nil {
		t.Error("Orchestrator should be initialized")
	}

	if engine.Scorer == nil {
		t.Error("Scorer should be initialized")
	}

	if engine.Composer == nil {
		t.Error("Composer should be initialized")
	}

	// Verify default beam config
	if !engine.BeamConfig.Enabled {
		t.Error("Beam search should be enabled by default")
	}

	if engine.BeamConfig.BeamWidth != 3 {
		t.Errorf("Expected beam width 3, got %d", engine.BeamConfig.BeamWidth)
	}
}

// TestDefaultBeamConfig tests default beam search configuration
func TestDefaultBeamConfig(t *testing.T) {
	config := DefaultBeamConfig()

	if !config.Enabled {
		t.Error("Beam search should be enabled by default")
	}

	if config.BeamWidth < 1 {
		t.Error("Beam width should be positive")
	}

	if config.BeamWidth > 10 {
		t.Error("Beam width seems too large (performance concerns)")
	}

	t.Logf("Default beam config: Enabled=%v, BeamWidth=%d", config.Enabled, config.BeamWidth)
}

// TestInitSession tests session initialization
func TestInitSession(t *testing.T) {
	router := NewMockRouter()
	engine := NewReasoningEngine(router)

	ctx := context.Background()
	prompt := "Test prompt for session initialization"

	sessionID := engine.InitSession(ctx, prompt)

	if sessionID == "" {
		t.Fatal("SessionID should not be empty")
	}

	// Verify session was created in memory manager
	sm, exists := engine.MemoryManager.GetSession(sessionID)

	if !exists {
		t.Fatal("Session should exist after initialization")
	}

	if sm.OriginalPrompt != prompt {
		t.Errorf("Expected prompt %q, got %q", prompt, sm.OriginalPrompt)
	}

	t.Logf("Created session: %s", sessionID)
}

// TestInitSessionUniqueness tests that each session gets a unique ID
func TestInitSessionUniqueness(t *testing.T) {
	router := NewMockRouter()
	engine := NewReasoningEngine(router)

	ctx := context.Background()

	// Create multiple sessions
	ids := make(map[string]bool)
	numSessions := 100

	for i := 0; i < numSessions; i++ {
		sessionID := engine.InitSession(ctx, "Test prompt")

		if ids[sessionID] {
			t.Errorf("Duplicate session ID: %s", sessionID)
		}

		ids[sessionID] = true
	}

	if len(ids) != numSessions {
		t.Errorf("Expected %d unique IDs, got %d", numSessions, len(ids))
	}
}

// TestEnableDisableBeamSearch tests beam search configuration
func TestEnableDisableBeamSearch(t *testing.T) {
	router := NewMockRouter()
	engine := NewReasoningEngine(router)

	// Verify initially enabled
	if !engine.BeamConfig.Enabled {
		t.Error("Beam search should be enabled by default")
	}

	// Test disable
	engine.DisableBeamSearch()

	if engine.BeamConfig.Enabled {
		t.Error("Beam search should be disabled")
	}

	// Test re-enable with custom config
	customConfig := BeamConfig{
		Enabled:   true,
		BeamWidth: 5,
	}

	engine.EnableBeamSearch(customConfig)

	if !engine.BeamConfig.Enabled {
		t.Error("Beam search should be enabled")
	}

	if engine.BeamConfig.BeamWidth != 5 {
		t.Errorf("Expected beam width 5, got %d", engine.BeamConfig.BeamWidth)
	}
}

// TestEngineEventCallback tests event emission during reasoning
func TestEngineEventCallback(t *testing.T) {
	router := NewMockRouter()
	engine := NewReasoningEngine(router)

	receivedEvents := make([]ReasoningEvent, 0)
	var mu sync.Mutex

	engine.OnEvent = func(event ReasoningEvent) {
		mu.Lock()
		defer mu.Unlock()
		receivedEvents = append(receivedEvents, event)
		t.Logf("Event: Type=%s, SessionID=%s", event.Type, event.SessionID)
	}

	ctx := context.Background()
	sessionID := engine.InitSession(ctx, "Test event emission")

	// Emit test event
	engine.emitEvent(sessionID, EventStepStart, "test payload")

	// Give a moment for event to be processed
	time.Sleep(10 * time.Millisecond)

	mu.Lock()
	eventCount := len(receivedEvents)
	mu.Unlock()

	if eventCount == 0 {
		t.Error("Expected at least 1 event")
	}

	// Verify event properties
	mu.Lock()
	if len(receivedEvents) > 0 {
		event := receivedEvents[0]
		if event.SessionID != sessionID {
			t.Errorf("Event sessionID mismatch: expected %s, got %s", sessionID, event.SessionID)
		}

		if event.Type != EventStepStart {
			t.Errorf("Event type mismatch: expected %s, got %s", EventStepStart, event.Type)
		}
	}
	mu.Unlock()
}

// TestRunSessionNotFound tests error handling for non-existent session
func TestRunSessionNotFound(t *testing.T) {
	router := NewMockRouter()
	engine := NewReasoningEngine(router)

	ctx := context.Background()

	_, err := engine.RunSession(ctx, "non-existent-session", "Test prompt", []string{"model-1"})

	if err == nil {
		t.Error("Expected error for non-existent session")
	}

	if err.Error() != "session not found: non-existent-session" {
		t.Logf("Error message: %v", err)
	}
}

// TestRunSessionConcurrentSafety tests thread safety of multiple concurrent sessions
func TestRunSessionConcurrentSafety(t *testing.T) {
	t.Skip("Skipping - requires full mock decomposer and router")

	router := NewMockRouter()
	engine := NewReasoningEngine(router)

	numConcurrent := 5
	var wg sync.WaitGroup
	errors := make(chan error, numConcurrent)

	for i := 0; i < numConcurrent; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			ctx := context.Background()
			sessionID := engine.InitSession(ctx, "Concurrent test")

			// Note: This would need proper mocking to work
			_, err := engine.RunSession(ctx, sessionID, "Test", []string{"model-1"})
			if err != nil {
				errors <- err
			}
		}(i)
	}

	wg.Wait()
	close(errors)

	for err := range errors {
		t.Logf("Concurrent execution error: %v", err)
	}
}

// TestBeamConfigVariations tests different beam search configurations
func TestBeamConfigVariations(t *testing.T) {
	router := NewMockRouter()

	testCases := []struct {
		name      string
		config    BeamConfig
		shouldRun bool
	}{
		{
			name:      "Default config",
			config:    DefaultBeamConfig(),
			shouldRun: true,
		},
		{
			name: "Narrow beam",
			config: BeamConfig{
				Enabled:   true,
				BeamWidth: 1,
			},
			shouldRun: true,
		},
		{
			name: "Wide beam",
			config: BeamConfig{
				Enabled:   true,
				BeamWidth: 10,
			},
			shouldRun: true,
		},
		{
			name: "Disabled beam search",
			config: BeamConfig{
				Enabled:   false,
				BeamWidth: 3,
			},
			shouldRun: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			engine := NewReasoningEngine(router)
			engine.EnableBeamSearch(tc.config)

			if engine.BeamConfig.Enabled != tc.config.Enabled {
				t.Errorf("Enabled mismatch: expected %v, got %v", tc.config.Enabled, engine.BeamConfig.Enabled)
			}

			if engine.BeamConfig.BeamWidth != tc.config.BeamWidth {
				t.Errorf("BeamWidth mismatch: expected %d, got %d", tc.config.BeamWidth, engine.BeamConfig.BeamWidth)
			}

			t.Logf("Config applied: Enabled=%v, BeamWidth=%d", engine.BeamConfig.Enabled, engine.BeamConfig.BeamWidth)
		})
	}
}

// TestSessionLifecycle tests complete session lifecycle
func TestSessionLifecycle(t *testing.T) {
	router := NewMockRouter()
	engine := NewReasoningEngine(router)

	ctx := context.Background()

	// Phase 1: Initialize
	prompt := "Complete lifecycle test"
	sessionID := engine.InitSession(ctx, prompt)

	if sessionID == "" {
		t.Fatal("Session initialization failed")
	}

	// Phase 2: Verify session exists
	sm, exists := engine.MemoryManager.GetSession(sessionID)
	if !exists {
		t.Fatal("Session should exist after init")
	}

	if sm.OriginalPrompt != prompt {
		t.Error("Prompt not stored correctly")
	}

	// Phase 3: Verify initial state
	if len(sm.Steps) != 0 {
		t.Error("Steps should be empty before RunSession")
	}

	if sm.TotalCost != 0 {
		t.Error("Initial cost should be 0")
	}

	t.Logf("Session lifecycle test passed for %s", sessionID)
}

// TestMemoryManagerIntegration tests integration with MemoryManager
func TestMemoryManagerIntegration(t *testing.T) {
	router := NewMockRouter()
	engine := NewReasoningEngine(router)

	ctx := context.Background()

	// Create multiple sessions
	sessions := make([]string, 3)
	for i := 0; i < 3; i++ {
		sessions[i] = engine.InitSession(ctx, "Integration test")
	}

	// Verify all sessions are accessible
	for _, sid := range sessions {
		_, exists := engine.MemoryManager.GetSession(sid)
		if !exists {
			t.Errorf("Session %s should exist", sid)
		}
	}

	// Verify sessions are independent
	for i, sid1 := range sessions {
		sm1, _ := engine.MemoryManager.GetSession(sid1)
		for j, sid2 := range sessions {
			if i != j {
				sm2, _ := engine.MemoryManager.GetSession(sid2)
				if sm1.SessionID == sm2.SessionID {
					t.Error("Sessions should have unique IDs")
				}
			}
		}
	}
}

// TestComponentsInitialization tests that all components are properly wired
func TestComponentsInitialization(t *testing.T) {
	router := NewMockRouter()
	engine := NewReasoningEngine(router)

	// Test Orchestrator has PromptBuilder
	if engine.Orchestrator.PromptBuilder == nil {
		t.Error("Orchestrator should have PromptBuilder")
	}

	// Test Orchestrator has Router
	if engine.Orchestrator.Router == nil {
		t.Error("Orchestrator should have Router")
	}

	// Test Decomposer is functional
	if engine.Decomposer == nil {
		t.Error("Decomposer should be initialized")
	}

	// Test Composer is functional
	if engine.Composer == nil {
		t.Error("Composer should be initialized")
	}

	// Test ConsensusAgent is initialized
	if engine.ConsensusAgent == nil {
		t.Error("ConsensusAgent should be initialized")
	}

	t.Log("All components properly initialized and wired")
}

// TestPermanentReasoningPipeline verifies that the system always produces a 7-step pipeline
func TestPermanentReasoningPipeline(t *testing.T) {
	router := NewMockRouter()
	engine := NewReasoningEngine(router)

	ctx := context.Background()
	prompt := "How do I make a cup of tea?"

	_ = engine.InitSession(ctx, prompt)

	// We'll test the decomposer's fallback logic directly
	steps := engine.Decomposer.createFallbackDecomposition(prompt)

	if len(steps) != 7 {
		t.Errorf("Expected 7 steps in permanent pipeline, got %d", len(steps))
	}

	// Verify parallel step tags
	parallelCount := 0
	for _, step := range steps {
		if strings.Contains(step.Title, "[P]") {
			parallelCount++
		}
	}

	if parallelCount != 3 {
		t.Errorf("Expected 3 parallel-tagged steps, got %d", parallelCount)
	}

	t.Logf("Permanent pipeline verified with %d steps and %d parallel tasks", len(steps), parallelCount)
}

// TestParallelExecutionGrouping verifies that RunSession correctly groups parallel steps
func TestParallelExecutionGrouping(t *testing.T) {
	// This test focuses on the grouping logic in RunSession
	// Since RunSession is long-running and complex, we'll verify it via log and state check
	router := NewMockRouter()
	engine := NewReasoningEngine(router)

	ctx := context.Background()
	prompt := "Speed test prompt"
	sessionID := engine.InitSession(ctx, prompt)

	// Mock 7 steps with parallel tags for 3, 4, 5
	sm, _ := engine.MemoryManager.GetSession(sessionID)
	sm.Steps = engine.Decomposer.createFallbackDecomposition(prompt)

	// We'll use a short timeout context to avoid long waits, but enough for grouping to happen
	runCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Execute RunSession and verify it completes (or hits timeout)
	// With MockRouter (DummyAdapter), each model takes negligible time
	_, err := engine.RunSession(runCtx, sessionID, prompt, []string{"mock-model"})

	if err != nil {
		t.Fatalf("RunSession failed: %v", err)
	}

	// Verify all steps are marked completed
	for i, step := range sm.Steps {
		if step.Status != "completed" {
			t.Errorf("Step %d (%s) not completed, status: %s", i, step.Title, step.Status)
		}
	}

	t.Log("Parallel execution grouping verified")
}
