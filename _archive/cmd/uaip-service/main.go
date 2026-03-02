package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gaiol/internal/models"
	"gaiol/internal/models/adapters"
	"gaiol/internal/uaip"
)

var (
	registry *models.Registry
	router   *models.ModelRouter
)

func main() {
	// Create context that listens for the interrupt signal from the OS
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Load configuration from environment
	config := loadConfig()

	// Initialize model adapters
	adapterMap, err := initializeAdapters(config)
	if err != nil {
		log.Fatalf("Failed to initialize adapters: %v", err)
	}

	// Create registry with available adapters
	if len(adapterMap) == 0 {
		log.Fatal("❌ No adapters initialized - at least one API key must be set")
	}

	// Initialize registry (requires at least 2 adapters, use dummy if needed)
	var orAdapter, hfAdapter models.ModelAdapter
	if or, ok := adapterMap["openrouter"]; ok {
		orAdapter = or
	}
	if hf, ok := adapterMap["huggingface"]; ok {
		hfAdapter = hf
	} else {
		// Create dummy adapter if HuggingFace not available
		hfAdapter = &DummyAdapter{}
	}

	if orAdapter == nil {
		log.Fatal("❌ OPENROUTER_API_KEY must be set - OpenRouter adapter is required")
	}

	registry = models.NewRegistry(orAdapter, hfAdapter)
	router = models.NewModelRouter(registry)

	log.Printf("✅ UAIP Service initialized with %d models available", registry.Count())

	// Start the service
	if err := startService(ctx, config); err != nil {
		log.Fatalf("Service error: %v", err)
	}
}

func loadConfig() map[string]interface{} {
	config := make(map[string]interface{})
	
	// Load environment variables
	config["GEMINI_API_KEY"] = os.Getenv("GEMINI_API_KEY")
	config["OPENROUTER_API_KEY"] = os.Getenv("OPENROUTER_API_KEY")
	config["HUGGINGFACE_API_KEY"] = os.Getenv("HUGGINGFACE_API_KEY")
	config["APP_PORT"] = os.Getenv("APP_PORT")
	if config["APP_PORT"] == "" {
		config["APP_PORT"] = "8080"
	}
	config["LOG_LEVEL"] = os.Getenv("LOG_LEVEL")
	if config["LOG_LEVEL"] == "" {
		config["LOG_LEVEL"] = "info"
	}

	return config
}

func initializeAdapters(config map[string]interface{}) (map[string]models.ModelAdapter, error) {
	adapters := make(map[string]models.ModelAdapter)

	// Initialize OpenRouter adapter
	if openrouterKey, ok := config["OPENROUTER_API_KEY"].(string); ok && openrouterKey != "" {
		orAdapter := adapters.NewOpenRouterAdapter("", openrouterKey)
		adapters["openrouter"] = orAdapter
		log.Println("✅ OpenRouter adapter initialized")
	} else {
		log.Println("⚠️  Warning: OPENROUTER_API_KEY not set - OpenRouter models unavailable")
	}

	// Initialize HuggingFace adapter
	if hfKey, ok := config["HUGGINGFACE_API_KEY"].(string); ok && hfKey != "" {
		hfAdapter := adapters.NewHuggingFaceAdapter("", hfKey)
		adapters["huggingface"] = hfAdapter
		log.Println("✅ HuggingFace adapter initialized")
	} else {
		log.Println("ℹ️  Info: HUGGINGFACE_API_KEY not set - HuggingFace models unavailable")
	}

	// Initialize Gemini adapter (direct, not through OpenRouter)
	if geminiKey, ok := config["GEMINI_API_KEY"].(string); ok && geminiKey != "" {
		geminiAdapter := adapters.NewGeminiAdapter(geminiKey)
		adapters["gemini"] = geminiAdapter
		log.Println("✅ Gemini adapter initialized")
	} else {
		log.Println("ℹ️  Info: GEMINI_API_KEY not set - Direct Gemini access unavailable")
	}

	return adapters, nil
}

func startService(ctx context.Context, config map[string]interface{}) error {
	port := config["APP_PORT"].(string)
	
	log.Printf("🚀 UAIP Service starting on port %s", port)
	log.Println("📋 Available models:", registry.Count())
	log.Println("💰 Free models:", len(registry.FindFreeModels()))
	log.Println("Press Ctrl+C to stop")

	// For now, just wait for shutdown signal
	// In the future, this could start HTTP/gRPC servers, message queues, etc.
	<-ctx.Done()
	
	log.Println("🛑 Shutting down gracefully...")
	
	// Give a moment for cleanup
	time.Sleep(500 * time.Millisecond)
	
	return nil
}

// DummyAdapter implements ModelAdapter for cases where we need a placeholder
type DummyAdapter struct{}

func (d *DummyAdapter) Name() string                              { return "dummy" }
func (d *DummyAdapter) Provider() string                          { return "dummy" }
func (d *DummyAdapter) SupportedTasks() []models.TaskType         { return nil }
func (d *DummyAdapter) RequiresAuth() bool                        { return false }
func (d *DummyAdapter) GetCapabilities() models.ModelCapabilities { return models.ModelCapabilities{} }
func (d *DummyAdapter) GetCost() models.CostInfo                  { return models.CostInfo{} }
func (d *DummyAdapter) HealthCheck() error                        { return nil }
func (d *DummyAdapter) GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error) {
	return nil, fmt.Errorf("dummy adapter cannot generate text")
}
