package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"gaiol/internal/models"
	"gaiol/internal/models/adapters"
	"gaiol/internal/uaip"
)

var (
	router   *models.ModelRouter
	registry *models.Registry
)

// === REQUEST/RESPONSE TYPES ===

type QueryRequest struct {
	Prompt      string                 `json:"prompt"`
	Models      []string               `json:"models,omitempty"`   // For multi-model comparison
	Strategy    models.RoutingStrategy `json:"strategy,omitempty"` // For smart routing
	Task        models.TaskType        `json:"task,omitempty"`
	MaxTokens   int                    `json:"max_tokens,omitempty"`
	Temperature float64                `json:"temperature,omitempty"`
	ModelID     string                 `json:"model_id,omitempty"` // For direct model selection
}

type ModelResponse struct {
	Response string  `json:"response"`
	Time     int     `json:"time"`
	Tokens   int     `json:"tokens"`
	Quality  float64 `json:"quality"`
	Success  bool    `json:"success"`
	Model    string  `json:"model"`
	Error    string  `json:"error,omitempty"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

func main() {
	// Get API keys
	geminiKey := os.Getenv("GEMINI_API_KEY")
	openrouterKey := os.Getenv("OPENROUTER_API_KEY")
	hfKey := os.Getenv("HUGGINGFACE_API_KEY")

	if openrouterKey == "" {
		log.Println("⚠️  Warning: OPENROUTER_API_KEY not set - OpenRouter models unavailable")
	}
	if geminiKey == "" {
		log.Println("⚠️  Warning: GEMINI_API_KEY not set - Gemini models unavailable")
	}
	if hfKey == "" {
		log.Println("ℹ️  Info: HUGGINGFACE_API_KEY not set - HuggingFace models unavailable")
	}

	// Initialize adapters
	var orAdapter, hfAdapter models.ModelAdapter

	if openrouterKey != "" {
		orAdapter = adapters.NewOpenRouterAdapter("", openrouterKey)
	}

	if hfKey != "" {
		hfAdapter = adapters.NewHuggingFaceAdapter("", hfKey)
	}

	// Create registry with available adapters
	if orAdapter != nil {
		if hfAdapter != nil {
			registry = models.NewRegistry(orAdapter, hfAdapter)
		} else {
			// Create a dummy adapter for registry initialization
			dummyAdapter := &DummyAdapter{}
			registry = models.NewRegistry(orAdapter, dummyAdapter)
		}
	} else {
		log.Fatal("❌ At least OPENROUTER_API_KEY must be set")
	}

	router = models.NewModelRouter(registry)

	// Setup routes
	http.HandleFunc("/", noCacheFileServer)
	http.HandleFunc("/api/query", corsMiddleware(handleQuery))
	http.HandleFunc("/api/query/smart", corsMiddleware(handleSmartQuery))
	http.HandleFunc("/api/query/model", corsMiddleware(handleQueryWithModel))
	http.HandleFunc("/api/models", corsMiddleware(handleListModels))
	http.HandleFunc("/api/models/free", corsMiddleware(handleListFreeModels))
	http.HandleFunc("/api/models/", corsMiddleware(handleModelsByProvider))
	http.HandleFunc("/health", handleHealth)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Println("🚀 GAIOL Web Server")
	fmt.Println(strings.Repeat("=", 70))
	fmt.Printf("📋 Loaded %d models\n", registry.Count())
	fmt.Printf("💰 Free models: %d\n", len(registry.FindFreeModels()))
	fmt.Printf("🌐 Server: http://localhost:%s\n", port)
	fmt.Printf("📂 Web UI: http://localhost:%s\n", port)
	fmt.Println("\nAPI Endpoints:")
	fmt.Println("  POST /api/query             - Multi-model comparison (legacy)")
	fmt.Println("  POST /api/query/smart       - Smart routing (recommended)")
	fmt.Println("  POST /api/query/model       - Query specific model")
	fmt.Println("  GET  /api/models            - List all models")
	fmt.Println("  GET  /api/models/free       - List free models")
	fmt.Println("  GET  /api/models/:provider  - List by provider")
	fmt.Println("  GET  /health                - Health check")
	fmt.Println(strings.Repeat("=", 70))

	log.Fatal(http.ListenAndServe(":"+port, nil))
}

// === MIDDLEWARE ===
func noCacheFileServer(w http.ResponseWriter, r *http.Request) {
	// Disable caching for development
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// Serve the file
	fs := http.FileServer(http.Dir("./web"))
	fs.ServeHTTP(w, r)
}
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// === HANDLERS ===

// POST /api/query - Multi-model comparison (backward compatible)
// POST /api/query - Multi-model comparison with rate limiting
func handleQuery(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "POST" {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Prompt == "" {
		sendError(w, "Prompt is required", http.StatusBadRequest)
		return
	}

	if len(req.Models) == 0 {
		sendError(w, "At least one model required", http.StatusBadRequest)
		return
	}

	// Apply defaults
	if req.MaxTokens == 0 {
		req.MaxTokens = 300
	}
	if req.Temperature == 0 {
		req.Temperature = 0.7
	}

	// Query models with staggered delays to avoid rate limits
	response := make(map[string]ModelResponse)
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i, modelName := range req.Models {
		wg.Add(1)

		// Add 3-second delay between each request (20 RPM = 1 request per 3 seconds)
		time.Sleep(time.Duration(i*3) * time.Second)

		go func(m string) {
			defer wg.Done()

			result := queryModelByName(m, req.Prompt, req.MaxTokens, req.Temperature)

			mu.Lock()
			response[m] = result
			mu.Unlock()
		}(modelName)
	}

	wg.Wait()

	json.NewEncoder(w).Encode(response)
}

// POST /api/query/smart - Smart routing with strategies
func handleSmartQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Prompt == "" {
		sendError(w, "Prompt is required", http.StatusBadRequest)
		return
	}

	// Apply defaults
	if req.Strategy == "" {
		req.Strategy = models.StrategyFreeOnly
	}
	if req.Task == "" {
		req.Task = models.TaskGenerate
	}
	if req.MaxTokens == 0 {
		req.MaxTokens = 200
	}
	if req.Temperature == 0 {
		req.Temperature = 0.7
	}

	// Create UAIP request
	uaipReq := &uaip.UAIPRequest{
		UAIP: uaip.UAIPHeader{
			Version:   uaip.ProtocolVersion,
			MessageID: fmt.Sprintf("req-%d", time.Now().UnixNano()),
			Timestamp: time.Now(),
		},
		Payload: uaip.Payload{
			Input: uaip.PayloadInput{
				Data:   req.Prompt,
				Format: "text",
			},
			OutputRequirements: uaip.OutputRequirements{
				MaxTokens:   req.MaxTokens,
				Temperature: req.Temperature,
			},
		},
	}

	// Route and execute
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()

	config := models.RoutingConfig{
		Strategy:   req.Strategy,
		Task:       req.Task,
		MaxCost:    0.00001,
		MinQuality: 0.70,
	}

	resp, err := router.RouteAndExecute(ctx, config, uaipReq)
	if err != nil {
		sendError(w, "Routing failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// POST /api/query/model - Query specific model by ID
func handleQueryWithModel(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Prompt == "" {
		sendError(w, "Prompt is required", http.StatusBadRequest)
		return
	}

	if req.ModelID == "" {
		sendError(w, "model_id is required", http.StatusBadRequest)
		return
	}

	// Apply defaults
	if req.MaxTokens == 0 {
		req.MaxTokens = 200
	}
	if req.Temperature == 0 {
		req.Temperature = 0.7
	}

	// Get model from registry
	model, err := registry.GetModel(models.ModelID(req.ModelID))
	if err != nil {
		sendError(w, "Model not found: "+err.Error(), http.StatusNotFound)
		return
	}

	// Create UAIP request
	uaipReq := &uaip.UAIPRequest{
		UAIP: uaip.UAIPHeader{
			Version:   uaip.ProtocolVersion,
			MessageID: fmt.Sprintf("req-%d", time.Now().UnixNano()),
			Timestamp: time.Now(),
		},
		Payload: uaip.Payload{
			Input: uaip.PayloadInput{
				Data:   req.Prompt,
				Format: "text",
			},
			OutputRequirements: uaip.OutputRequirements{
				MaxTokens:   req.MaxTokens,
				Temperature: req.Temperature,
			},
		},
	}

	// Execute with specific model
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()

	resp, err := model.Adapter.GenerateText(ctx, model.ModelName, uaipReq)
	if err != nil {
		sendError(w, "Generation failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GET /api/models - List all models
func handleListModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	allModels := registry.ListModels()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"count":  len(allModels),
		"models": allModels,
	})
}

// GET /api/models/free - List free models
func handleListFreeModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	freeModels := registry.FindFreeModels()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"count":  len(freeModels),
		"models": freeModels,
	})
}

// GET /api/models/:provider - List by provider
func handleModelsByProvider(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	provider := strings.TrimPrefix(r.URL.Path, "/api/models/")
	if provider == "" {
		sendError(w, "Provider name required", http.StatusBadRequest)
		return
	}

	providerModels := registry.FindModelsByProvider(provider)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"provider": provider,
		"count":    len(providerModels),
		"models":   providerModels,
	})
}

// GET /health - Health check
func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "ok",
		"models":      registry.Count(),
		"free_models": len(registry.FindFreeModels()),
		"timestamp":   time.Now().Format(time.RFC3339),
	})
}

// === HELPER FUNCTIONS ===

func queryModelByName(modelName, prompt string, maxTokens int, temperature float64) ModelResponse {
	startTime := time.Now()

	// Map legacy model names to registry IDs
	modelID := mapLegacyModelName(modelName)

	model, err := registry.GetModel(models.ModelID(modelID))
	if err != nil {
		return ModelResponse{
			Success: false,
			Error:   "Model not found: " + modelName,
			Time:    int(time.Since(startTime).Milliseconds()),
		}
	}

	uaipReq := &uaip.UAIPRequest{
		UAIP: uaip.UAIPHeader{
			Version:   uaip.ProtocolVersion,
			MessageID: fmt.Sprintf("web-%d", time.Now().UnixNano()),
			Timestamp: time.Now(),
		},
		Payload: uaip.Payload{
			Input: uaip.PayloadInput{
				Data:   prompt,
				Format: "text",
			},
			OutputRequirements: uaip.OutputRequirements{
				MaxTokens:   maxTokens,
				Temperature: temperature,
			},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	resp, err := model.Adapter.GenerateText(ctx, model.ModelName, uaipReq)
	processingTime := int(time.Since(startTime).Milliseconds())

	result := ModelResponse{
		Time:    processingTime,
		Success: err == nil && resp != nil && resp.Status.Success,
		Model:   model.DisplayName,
	}

	if result.Success {
		result.Response = resp.Result.Data
		result.Tokens = resp.Result.TokensUsed
		result.Quality = resp.Result.Quality
	} else {
		result.Error = "Failed to get response"
		if err != nil {
			result.Error = err.Error()
		} else if resp != nil && resp.Error != nil {
			result.Error = resp.Error.Message
		}
	}

	return result
}

// Map legacy model names to registry IDs
func mapLegacyModelName(legacy string) string {
	mapping := map[string]string{
		// OpenRouter free models
		"llama3":   "openrouter:meta-llama/llama-3.2-3b-instruct:free",
		"mistral":  "openrouter:mistralai/mistral-7b-instruct:free",
		"qwen":     "openrouter:qwen/qwen-2-7b-instruct:free",
		"glm":      "openrouter:z-ai/glm-4.5-air:free",
		"deepseek": "openrouter:deepseek/deepseek-r1:free",

		// HuggingFace working model (only one that works reliably)
		"hf-llama": "huggingface:meta-llama/Llama-3.1-8B-Instruct",

		// OpenRouter premium models
		"gpt4mini": "openrouter:openai/gpt-4o-mini",
		"claude":   "openrouter:anthropic/claude-3.5-sonnet",
	}

	if mapped, exists := mapping[legacy]; exists {
		return mapped
	}

	return legacy
}

func sendError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(ErrorResponse{
		Error:   message,
		Code:    fmt.Sprintf("HTTP_%d", code),
		Message: message,
	})
}

// === DUMMY ADAPTER (for registry when HF is not available) ===

type DummyAdapter struct{}

func (d *DummyAdapter) Name() string                              { return "dummy" }
func (d *DummyAdapter) Provider() string                          { return "dummy" }
func (d *DummyAdapter) SupportedTasks() []models.TaskType         { return nil }
func (d *DummyAdapter) RequiresAuth() bool                        { return false }
func (d *DummyAdapter) GetCapabilities() models.ModelCapabilities { return models.ModelCapabilities{} }
func (d *DummyAdapter) GetCost() models.CostInfo                  { return models.CostInfo{} }
func (d *DummyAdapter) HealthCheck() error                        { return nil }
func (d *DummyAdapter) GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error) {
	return nil, fmt.Errorf("dummy adapter")
}
