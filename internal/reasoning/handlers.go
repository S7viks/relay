package reasoning

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"relay/internal/models"
	"relay/internal/monitoring"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// ReasoningAPI provides HTTP and WS handlers for the reasoning engine
type ReasoningAPI struct {
	Engine  *ReasoningEngine
	Metrics *monitoring.MetricsService // NEW: For monitoring stats
	Clients map[string][]*websocket.Conn
	mu      sync.RWMutex // Protects Clients and WebSocket writes
}

// NewReasoningAPI creates a new reasoning API instance
func NewReasoningAPI(router *models.ModelRouter) *ReasoningAPI {
	api := &ReasoningAPI{
		Engine:  NewReasoningEngine(router),
		Metrics: monitoring.NewMetricsService(),
		Clients: make(map[string][]*websocket.Conn),
	}

	// Register the engine's event callback to broadcast via WebSocket
	api.Engine.OnEvent = api.BroadcastEvent
	return api
}

// BroadcastEvent sends a reasoning event to all connected WebSocket clients for a session
func (api *ReasoningAPI) BroadcastEvent(event ReasoningEvent) {
	api.mu.RLock()
	conns, exists := api.Clients[event.SessionID]
	api.mu.RUnlock()

	if !exists {
		return
	}

	// Serialize WebSocket writes to prevent concurrent write panic
	for _, conn := range conns {
		api.mu.Lock()
		conn.WriteJSON(event)
		api.mu.Unlock()
	}
}

// HandleStartReasoning handles POST /api/reasoning/start
func (api *ReasoningAPI) HandleStartReasoning(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Prompt string     `json:"prompt"`
		Models []string   `json:"models"`
		Beam   BeamConfig `json:"beam"` // Optional: Override beam config
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	sessionID := api.Engine.InitSession(r.Context(), req.Prompt)

	// Auto-select models if none provided - prioritize speed
	modelIDs := req.Models
	if len(modelIDs) == 0 {
		// Fastest free models for speed
		modelIDs = []string{
			"google/gemini-2.0-flash-exp:free", // Fastest free model
			"deepseek/deepseek-r1:free",        // Backup
		}
	}

	// Apply beam search config if provided (beam search is already enabled by default)
	if req.Beam.Enabled {
		api.Engine.EnableBeamSearch(req.Beam)
	}

	// Run reasoning in a background goroutine
	go func() {
		ctx := context.Background()
		api.Engine.RunSession(ctx, sessionID, req.Prompt, modelIDs)
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"session_id": sessionID,
		"status":     "started",
	})
}

// HandleGetStatus handles GET /api/reasoning/status/:id
func (api *ReasoningAPI) HandleGetStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract session ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/api/reasoning/status/")
	sessionID := path

	if sessionID == "" {
		http.Error(w, "session_id is required", http.StatusBadRequest)
		return
	}

	// Get session from memory
	session, exists := api.Engine.MemoryManager.GetSession(sessionID)
	if !exists {
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session)
}

// HandleWebSocket upgrades the connection to WebSocket for a reasoning session
func (api *ReasoningAPI) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session_id")
	if sessionID == "" {
		http.Error(w, "session_id is required", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	api.mu.Lock()
	api.Clients[sessionID] = append(api.Clients[sessionID], conn)
	api.mu.Unlock()

	// Keep connection alive
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}

	// Cleanup on disconnect
	api.mu.Lock()
	conns := api.Clients[sessionID]
	for i, c := range conns {
		if c == conn {
			api.Clients[sessionID] = append(conns[:i], conns[i+1:]...)
			break
		}
	}
	if len(api.Clients[sessionID]) == 0 {
		delete(api.Clients, sessionID)
	}
	api.mu.Unlock()
}

// HandleGetStats handles GET /api/monitoring/stats
func (api *ReasoningAPI) HandleGetStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Refresh stats from DB
	err := api.Metrics.RefreshStats(r.Context())
	if err != nil {
		// Log error but return cached stats if possible
		fmt.Printf("Error refreshing metrics: %v\n", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.Metrics.GetStats())
}
