package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"relay/internal/models"
	"relay/internal/uaip"
)

// AnthropicAdapter implements ModelAdapter for Anthropic Messages API.
// API: POST /v1/messages with headers: x-api-key, anthropic-version.
type AnthropicAdapter struct {
	providerKey      string
	baseURL          string
	apiKey           string
	client           *http.Client
	anthropicVersion string
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicRequest struct {
	Model       string            `json:"model"`
	MaxTokens   int               `json:"max_tokens"`
	Temperature float64           `json:"temperature,omitempty"`
	Messages    []anthropicMessage `json:"messages"`
	// Optional system prompt could be added later.
}

type anthropicContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

type anthropicResponse struct {
	ID      string                 `json:"id"`
	Type    string                 `json:"type"`
	Role    string                 `json:"role"`
	Content []anthropicContentBlock `json:"content"`
	Usage   *struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage,omitempty"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func NewAnthropicAdapter(providerKey, baseURL, apiKey string) *AnthropicAdapter {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = "https://api.anthropic.com"
	}
	return &AnthropicAdapter{
		providerKey:      strings.TrimSpace(strings.ToLower(providerKey)),
		baseURL:          baseURL,
		apiKey:           strings.TrimSpace(apiKey),
		client:           &http.Client{Timeout: 20 * time.Second},
		anthropicVersion: "2023-06-01",
	}
}

func (a *AnthropicAdapter) Name() string { return a.providerKey }
func (a *AnthropicAdapter) Provider() string {
	if a.providerKey == "" {
		return "anthropic"
	}
	return a.providerKey
}
func (a *AnthropicAdapter) SupportedTasks() []models.TaskType {
	return []models.TaskType{models.TaskGenerate, models.TaskAnalyze, models.TaskSummarize, models.TaskTransform, models.TaskCode}
}
func (a *AnthropicAdapter) RequiresAuth() bool { return true }
func (a *AnthropicAdapter) GetCapabilities() models.ModelCapabilities {
	return models.ModelCapabilities{SupportsStreaming: false, QualityScore: 0.85}
}
func (a *AnthropicAdapter) GetCost() models.CostInfo { return models.CostInfo{} }
func (a *AnthropicAdapter) HealthCheck() error       { return nil }

func (a *AnthropicAdapter) GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error) {
	if strings.TrimSpace(a.apiKey) == "" {
		return nil, fmt.Errorf("%s provider key is missing", a.Provider())
	}
	prompt := ""
	if req != nil {
		prompt = req.Payload.Input.Data
	}
	if strings.TrimSpace(prompt) == "" {
		return nil, fmt.Errorf("empty prompt")
	}

	maxTokens := 512
	temp := 0.7
	if req != nil {
		if req.Payload.OutputRequirements.MaxTokens > 0 {
			maxTokens = req.Payload.OutputRequirements.MaxTokens
		}
		if req.Payload.OutputRequirements.Temperature > 0 {
			temp = req.Payload.OutputRequirements.Temperature
		}
	}

	r := anthropicRequest{
		Model:       modelName,
		MaxTokens:   maxTokens,
		Temperature: temp,
		Messages: []anthropicMessage{
			{Role: "user", Content: prompt},
		},
	}

	body, _ := json.Marshal(r)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+"/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", a.apiKey)
	httpReq.Header.Set("anthropic-version", a.anthropicVersion)

	start := time.Now()
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var parsed anthropicResponse
		_ = json.Unmarshal(respBody, &parsed)
		if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
			return nil, fmt.Errorf("provider error (%d): %s", resp.StatusCode, parsed.Error.Message)
		}
		return nil, fmt.Errorf("provider error (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var parsed anthropicResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("decode provider response: %w", err)
	}
	if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
		return nil, fmt.Errorf("provider error: %s", parsed.Error.Message)
	}

	out := ""
	for _, b := range parsed.Content {
		if b.Type == "text" && b.Text != "" {
			if out != "" {
				out += "\n"
			}
			out += b.Text
		}
	}

	tokens := 0
	if parsed.Usage != nil {
		tokens = parsed.Usage.InputTokens + parsed.Usage.OutputTokens
	}

	correlationID := ""
	if req != nil {
		correlationID = req.UAIP.MessageID
	}

	return &uaip.UAIPResponse{
		UAIP: uaip.UAIPHeader{
			Version:       uaip.ProtocolVersion,
			MessageID:     fmt.Sprintf("anth-%d", time.Now().UnixNano()),
			CorrelationID: correlationID,
			Timestamp:     time.Now(),
		},
		Status: uaip.ResponseStatus{
			Code:    uaip.StatusOK,
			Message: "Generated successfully",
			Success: true,
		},
		Result: uaip.Result{
			Data:         out,
			Format:       "text",
			TokensUsed:   tokens,
			ProcessingMs: int(time.Since(start).Milliseconds()),
			Quality:      0.85,
			ModelUsed:    modelName,
			Metadata: map[string]interface{}{
				"provider": "anthropic",
			},
		},
	}, nil
}

