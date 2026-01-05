package reasoning

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"gaiol/internal/models"

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
	Engine      *ReasoningEngine
	connections map[string][]*websocket.Conn
	connMu      sync.RWMutex
}

// NewReasoningAPI creates a new reasoning API instance
func NewReasoningAPI(router *models.ModelRouter) *ReasoningAPI {
	api := &ReasoningAPI{
		Engine:      NewReasoningEngine(router),
		connections: make(map[string][]*websocket.Conn),
	}

	// Register the engine's event callback to broadcast via WebSocket
	api.Engine.OnEvent = api.BroadcastEvent
	return api
}

// BroadcastEvent sends a reasoning event to all connected WebSocket clients for a session
func (api *ReasoningAPI) BroadcastEvent(event ReasoningEvent) {
	api.connMu.RLock()
	conns, exists := api.connections[event.SessionID]
	api.connMu.RUnlock()

	if !exists {
		return
	}

	for _, conn := range conns {
		conn.WriteJSON(event)
	}
}

// HandleStartReasoning handles POST /api/reasoning/start
func (api *ReasoningAPI) HandleStartReasoning(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Prompt string   `json:"prompt"`
		Models []string `json:"models"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	sessionID := api.Engine.InitSession(req.Prompt)

	// Run reasoning in a background goroutine
	go func() {
		ctx := context.Background()
		api.Engine.RunSession(ctx, sessionID, req.Prompt, req.Models)
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

	api.connMu.Lock()
	api.connections[sessionID] = append(api.connections[sessionID], conn)
	api.connMu.Unlock()

	// Keep connection alive
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}

	// Cleanup on disconnect
	api.connMu.Lock()
	conns := api.connections[sessionID]
	for i, c := range conns {
		if c == conn {
			api.connections[sessionID] = append(conns[:i], conns[i+1:]...)
			break
		}
	}
	if len(api.connections[sessionID]) == 0 {
		delete(api.connections, sessionID)
	}
	api.connMu.Unlock()
}
