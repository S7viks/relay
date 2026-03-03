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

// OpenAICompatibleAdapter implements ModelAdapter for OpenAI-compatible chat completion APIs.
// This covers OpenAI, many proxies, and vendors that implement /v1/chat/completions.
type OpenAICompatibleAdapter struct {
	providerKey string
	baseURL     string
	authHeader  string
	authScheme  string
	apiKey      string
	client      *http.Client
}

type oaicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type oaicRequest struct {
	Model       string        `json:"model"`
	Messages    []oaicMessage `json:"messages"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
	Temperature float64       `json:"temperature,omitempty"`
}

type oaicError struct {
	Message string      `json:"message"`
	Type    string      `json:"type,omitempty"`
	Code    interface{} `json:"code,omitempty"`
}

type oaicResponse struct {
	Choices []struct {
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason,omitempty"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage,omitempty"`
	Error *oaicError `json:"error,omitempty"`
}

func NewOpenAICompatibleAdapter(providerKey, baseURL, authHeader, authScheme, apiKey string) *OpenAICompatibleAdapter {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.TrimSpace(authHeader) == "" {
		authHeader = "Authorization"
	}
	authScheme = strings.TrimSpace(authScheme)
	if authScheme == "" {
		authScheme = "Bearer"
	}
	return &OpenAICompatibleAdapter{
		providerKey: strings.TrimSpace(strings.ToLower(providerKey)),
		baseURL:     baseURL,
		authHeader:  authHeader,
		authScheme:  authScheme,
		apiKey:      strings.TrimSpace(apiKey),
		client:      &http.Client{Timeout: 20 * time.Second},
	}
}

func (a *OpenAICompatibleAdapter) Name() string { return a.providerKey }
func (a *OpenAICompatibleAdapter) Provider() string {
	return a.providerKey
}
func (a *OpenAICompatibleAdapter) SupportedTasks() []models.TaskType {
	return []models.TaskType{models.TaskGenerate, models.TaskAnalyze, models.TaskSummarize, models.TaskTransform, models.TaskCode}
}
func (a *OpenAICompatibleAdapter) RequiresAuth() bool { return true }
func (a *OpenAICompatibleAdapter) GetCapabilities() models.ModelCapabilities {
	return models.ModelCapabilities{SupportsStreaming: false, QualityScore: 0.75}
}
func (a *OpenAICompatibleAdapter) GetCost() models.CostInfo { return models.CostInfo{} }
func (a *OpenAICompatibleAdapter) HealthCheck() error       { return nil }

func (a *OpenAICompatibleAdapter) endpoint(path string) string {
	// Accept either https://host or https://host/v1 as baseURL.
	if strings.HasSuffix(a.baseURL, "/v1") {
		return a.baseURL + strings.TrimPrefix(path, "/v1")
	}
	return a.baseURL + path
}

func (a *OpenAICompatibleAdapter) authValue() string {
	if a.authScheme == "" {
		return a.apiKey
	}
	return a.authScheme + " " + a.apiKey
}

func (a *OpenAICompatibleAdapter) GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error) {
	if strings.TrimSpace(a.apiKey) == "" {
		return nil, fmt.Errorf("%s provider key is missing", a.providerKey)
	}
	prompt := ""
	if req != nil {
		prompt = req.Payload.Input.Data
	}
	if strings.TrimSpace(prompt) == "" {
		return nil, fmt.Errorf("empty prompt")
	}

	r := oaicRequest{
		Model: modelName,
		Messages: []oaicMessage{
			{Role: "user", Content: prompt},
		},
	}
	if req != nil {
		if req.Payload.OutputRequirements.MaxTokens > 0 {
			r.MaxTokens = req.Payload.OutputRequirements.MaxTokens
		}
		if req.Payload.OutputRequirements.Temperature > 0 {
			r.Temperature = req.Payload.OutputRequirements.Temperature
		}
	}

	body, _ := json.Marshal(r)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.endpoint("/v1/chat/completions"), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set(a.authHeader, a.authValue())

	start := time.Now()
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Best-effort parse OpenAI error body.
		var parsed oaicResponse
		_ = json.Unmarshal(respBody, &parsed)
		if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
			return nil, fmt.Errorf("provider error (%d): %s", resp.StatusCode, parsed.Error.Message)
		}
		return nil, fmt.Errorf("provider error (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var parsed oaicResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("decode provider response: %w", err)
	}
	if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
		return nil, fmt.Errorf("provider error: %s", parsed.Error.Message)
	}
	out := ""
	if len(parsed.Choices) > 0 {
		out = parsed.Choices[0].Message.Content
	}
	tokens := 0
	if parsed.Usage != nil {
		tokens = parsed.Usage.TotalTokens
	}

	correlationID := ""
	if req != nil {
		correlationID = req.UAIP.MessageID
	}

	return &uaip.UAIPResponse{
		UAIP: uaip.UAIPHeader{
			Version:       uaip.ProtocolVersion,
			MessageID:     fmt.Sprintf("oaic-%d", time.Now().UnixNano()),
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
			Quality:      0.75,
			ModelUsed:    modelName,
		},
	}, nil
}

