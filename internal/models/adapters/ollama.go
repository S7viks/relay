package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"relay/internal/models"
	"relay/internal/uaip"
)

// OllamaAdapter provides local LLM inference via Ollama
type OllamaAdapter struct {
	baseURL string
	client  *http.Client
}

// NewOllamaAdapter creates a new Ollama adapter
func NewOllamaAdapter(baseURL string) *OllamaAdapter {
	if baseURL == "" {
		baseURL = "http://localhost:11434" // Default Ollama port
	}

	return &OllamaAdapter{
		baseURL: baseURL,
		client:  &http.Client{Timeout: 30 * time.Second}, // 30s for local
	}
}

// OllamaRequest represents an Ollama API request
type OllamaRequest struct {
	Model   string                 `json:"model"`
	Prompt  string                 `json:"prompt"`
	Stream  bool                   `json:"stream"`
	Options map[string]interface{} `json:"options,omitempty"`
}

// OllamaResponse represents an Ollama API response
type OllamaResponse struct {
	Model     string    `json:"model"`
	CreatedAt time.Time `json:"created_at"`
	Response  string    `json:"response"`
	Done      bool      `json:"done"`
	Context   []int     `json:"context,omitempty"`
}

// Implement ModelAdapter interface

func (o *OllamaAdapter) Name() string {
	return "ollama"
}

func (o *OllamaAdapter) Provider() string {
	return "ollama"
}

func (o *OllamaAdapter) SupportedTasks() []models.TaskType {
	return []models.TaskType{
		models.TaskGenerate,
		models.TaskAnalyze,
		models.TaskCode,
		models.TaskSummarize,
		models.TaskLogic,
	}
}

func (o *OllamaAdapter) RequiresAuth() bool {
	return false // Local, no auth needed
}

func (o *OllamaAdapter) GetCapabilities() models.ModelCapabilities {
	return models.ModelCapabilities{
		MaxTokens:         2048,
		SupportsStreaming: false,
		Languages:         []string{"en", "zh", "es", "fr", "de"},
		ContextWindow:     8192,
		QualityScore:      0.85,
		Multimodal:        false,
	}
}

func (o *OllamaAdapter) GetCost() models.CostInfo {
	return models.CostInfo{
		CostPerToken:    0.0, // FREE!
		CostPerRequest:  0.0,
		FreeTierLimit:   999999,
		RateLimitPerMin: 999999, // No limits
	}
}

func (o *OllamaAdapter) HealthCheck() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := o.CheckAvailability(ctx)
	return err
}

// GenerateText implements the ModelAdapter interface for Ollama
func (o *OllamaAdapter) GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error) {
	startTime := time.Now()

	// Extract prompt from UAIP request
	prompt := req.Payload.Input.Data

	// Create Ollama request
	ollamaReq := OllamaRequest{
		Model:  modelName,
		Prompt: prompt,
		Stream: false,
		Options: map[string]interface{}{
			"temperature": req.Payload.OutputRequirements.Temperature,
			"num_predict": req.Payload.OutputRequirements.MaxTokens,
		},
	}

	reqBody, err := json.Marshal(ollamaReq)
	if err != nil {
		return o.createErrorResponse(req, err, startTime), nil
	}

	// Make request to Ollama
	httpReq, err := http.NewRequestWithContext(ctx, "POST", o.baseURL+"/api/generate", bytes.NewReader(reqBody))
	if err != nil {
		return o.createErrorResponse(req, err, startTime), nil
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return o.createErrorResponse(req, fmt.Errorf("ollama request failed: %w", err), startTime), nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return o.createErrorResponse(req, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(bodyBytes)), startTime), nil
	}

	// Parse response
	var ollamaResp OllamaResponse
	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		return o.createErrorResponse(req, fmt.Errorf("failed to parse response: %w", err), startTime), nil
	}

	latency := time.Since(startTime)

	// Convert to UAIP response
	return &uaip.UAIPResponse{
		UAIP: uaip.UAIPHeader{
			Version:       uaip.ProtocolVersion,
			MessageID:     fmt.Sprintf("ollama-%d", time.Now().UnixNano()),
			CorrelationID: req.UAIP.MessageID,
			Timestamp:     time.Now(),
		},
		Result: uaip.Result{
			Data:         ollamaResp.Response,
			Format:       "text",
			TokensUsed:   len(prompt)/4 + len(ollamaResp.Response)/4, // Rough estimate
			ProcessingMs: int(latency.Milliseconds()),
			ModelUsed:    modelName,
		},
		Metadata: uaip.ResponseMetadata{
			ProcessedAt: time.Now(),
			CostInfo: uaip.CostUsage{
				TotalCost: 0.0, // Ollama is free (local)
				Provider:  "ollama",
			},
		},
		Status: uaip.ResponseStatus{
			Success: true,
			Message: "OK",
			Code:    200,
		},
	}, nil
}

// createErrorResponse creates a UAIP error response
func (o *OllamaAdapter) createErrorResponse(req *uaip.UAIPRequest, err error, startTime time.Time) *uaip.UAIPResponse {
	return &uaip.UAIPResponse{
		UAIP: uaip.UAIPHeader{
			Version:       uaip.ProtocolVersion,
			MessageID:     fmt.Sprintf("ollama-%d", time.Now().UnixNano()),
			CorrelationID: req.UAIP.MessageID,
			Timestamp:     time.Now(),
		},
		Status: uaip.ResponseStatus{
			Success: false,
			Message: err.Error(),
			Code:    500,
		},
		Result: uaip.Result{
			Data: fmt.Sprintf("⚠️ Ollama error: %s", err.Error()),
		},
		Metadata: uaip.ResponseMetadata{
			ProcessedAt: time.Now(),
			CostInfo: uaip.CostUsage{
				Provider: "ollama",
			},
		},
	}
}

// CheckAvailability checks if Ollama is running and returns available models
func (o *OllamaAdapter) CheckAvailability(ctx context.Context) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", o.baseURL+"/api/tags", nil)
	if err != nil {
		return nil, err
	}

	resp, err := o.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama not available: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ollama returned HTTP %d", resp.StatusCode)
	}

	var result struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	models := make([]string, len(result.Models))
	for i, m := range result.Models {
		models[i] = m.Name
	}

	return models, nil
}
