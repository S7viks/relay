package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"gaiol/internal/models"
	"gaiol/internal/models/adapters"
	"gaiol/internal/uaip"
)

func main() {
	// Create context that listens for the interrupt signal from the OS
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Get API keys from environment
	geminiKey := os.Getenv("GEMINI_API_KEY")
	openrouterKey := os.Getenv("OPENROUTER_API_KEY")
	hfKey := os.Getenv("HUGGINGFACE_API_KEY")

	// Initialize adapters
	var orAdapter, hfAdapter models.ModelAdapter

	if openrouterKey != "" {
		orAdapter = adapters.NewOpenRouterAdapter("", openrouterKey)
		log.Println("✅ OpenRouter adapter initialized")
	}

	if hfKey != "" {
		hfAdapter = adapters.NewHuggingFaceAdapter("", hfKey)
		log.Println("✅ HuggingFace adapter initialized")
	}

	if geminiKey != "" {
		geminiAdapter := adapters.NewGeminiAdapter(geminiKey)
		log.Printf("✅ Gemini adapter initialized: %s", geminiAdapter.Name())
	}

	// Create registry with available adapters
	if orAdapter == nil {
		log.Fatal("❌ At least OPENROUTER_API_KEY must be set")
	}

	// Use dummy adapter if HF not available
	if hfAdapter == nil {
		dummyAdapter := &DummyAdapter{}
		registry := models.NewRegistry(orAdapter, dummyAdapter)
		log.Printf("📋 Registry initialized with %d models", registry.Count())
	} else {
		registry := models.NewRegistry(orAdapter, hfAdapter)
		log.Printf("📋 Registry initialized with %d models", registry.Count())
	}

	// Start the service
	if err := startService(ctx); err != nil {
		log.Fatalf("Service error: %v", err)
	}
}

func startService(ctx context.Context) error {
	log.Println("🚀 UAIP Service started")
	log.Println("Press Ctrl+C to stop...")
	<-ctx.Done()
	log.Println("Shutting down gracefully...")
	return nil
}

// DummyAdapter implements ModelAdapter for cases where HuggingFace is not available
type DummyAdapter struct{}

func (d *DummyAdapter) Name() string                              { return "dummy" }
func (d *DummyAdapter) Provider() string                          { return "dummy" }
func (d *DummyAdapter) SupportedTasks() []models.TaskType         { return nil }
func (d *DummyAdapter) RequiresAuth() bool                        { return false }
func (d *DummyAdapter) GetCapabilities() models.ModelCapabilities { return models.ModelCapabilities{} }
func (d *DummyAdapter) GetCost() models.CostInfo                  { return models.CostInfo{} }
func (d *DummyAdapter) HealthCheck() error                        { return nil }
func (d *DummyAdapter) GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error) {
	return nil, nil
}
