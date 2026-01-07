package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"gaiol/internal/models"
	"gaiol/internal/uaip"
)

// Ensure OpenRouterAdapter implements ModelWithEmbeddings
var _ models.ModelWithEmbeddings = (*OpenRouterAdapter)(nil)

// OpenRouterAdapter implements ModelAdapter for OpenRouter API
type OpenRouterAdapter struct {
	defaultModel string
	baseURL      string
	client       *http.Client
	rateLimiter  *RateLimiter
	apiKey       string
	freeModels   []string
}

// OpenRouter uses OpenAI-compatible format
type OpenRouterRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
	Temperature float64   `json:"temperature,omitempty"`
	TopP        float64   `json:"top_p,omitempty"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type OpenRouterResponse struct {
	ID      string   `json:"id"`
	Choices []Choice `json:"choices"`
	Data    []struct {
		Embedding []float64 `json:"embedding"`
	} `json:"data"` // For embeddings
	Usage Usage     `json:"usage"`
	Error *APIError `json:"error,omitempty"`
}

type Choice struct {
	Index   int `json:"index"`
	Message struct {
		Role    string                 `json:"role"`
		Content string                 `json:"content"`
		Extra   map[string]interface{} `json:"extra,omitempty"`
	} `json:"message"`
	FinishReason string `json:"finish_reason"`
}

type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

type APIError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    string `json:"code"`
}

// NewOpenRouterAdapter creates a new OpenRouter adapter
func NewOpenRouterAdapter(defaultModel, apiKey string) *OpenRouterAdapter {
	if defaultModel == "" {
		defaultModel = "deepseek/deepseek-r1" // 2026 working free model
	}

	freeModels := []string{
		// 2026 WORKING Free Models (verified)
		"deepseek/deepseek-r1",
		"xiaomi/mimo-v2-flash",
		"z-ai/glm-4.5-air",
		"qwen/qwen3-coder-480b-a35b",
		"meta-llama/llama-4-maverick",
		"google/gemini-2.5-pro-exp-03-25",
		"mistralai/mistral-small-3.1-24b-instruct",
	}

	return &OpenRouterAdapter{
		defaultModel: defaultModel,
		baseURL:      "https://openrouter.ai/api/v1",
		client:       &http.Client{Timeout: 20 * time.Second}, // Reduced to match handler timeout
		rateLimiter:  NewRateLimiter(),
		apiKey:       apiKey,
		freeModels:   freeModels,
	}
}

func (o *OpenRouterAdapter) Name() string {
	// Adapter name (provider-level)
	return "openrouter"
}

func (o *OpenRouterAdapter) Provider() string {
	return "openrouter"
}

func (o *OpenRouterAdapter) SupportedTasks() []models.TaskType {
	return []models.TaskType{
		models.TaskGenerate,
		models.TaskAnalyze,
		models.TaskSummarize,
		models.TaskTransform,
		models.TaskCode,
	}
}

func (o *OpenRouterAdapter) RequiresAuth() bool {
	return true
}

func (o *OpenRouterAdapter) GetCapabilities() models.ModelCapabilities {
	return models.ModelCapabilities{
		MaxTokens:         2048,
		SupportsStreaming: false,
		Languages:         []string{"en", "zh", "es", "fr", "de", "ja", "ko"},
		ContextWindow:     32768,
		QualityScore:      0.85,
		Multimodal:        false,
	}
}

func (o *OpenRouterAdapter) GetCost() models.CostInfo {
	return models.CostInfo{
		CostPerToken:    0.0,
		CostPerRequest:  0.0,
		FreeTierLimit:   20,
		RateLimitPerMin: 20,
	}
}

func (o *OpenRouterAdapter) HealthCheck() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	testReq := &uaip.UAIPRequest{
		UAIP: uaip.UAIPHeader{
			Version:   uaip.ProtocolVersion,
			MessageID: "health-check",
			Timestamp: time.Now(),
		},
		Payload: uaip.Payload{
			Input: uaip.PayloadInput{
				Data:   "Hello",
				Format: "text",
			},
			OutputRequirements: uaip.OutputRequirements{
				MaxTokens:   10,
				Temperature: 0.1,
			},
		},
	}

	resp, err := o.GenerateText(ctx, "", testReq)
	if err != nil {
		return fmt.Errorf("health check failed: %w", err)
	}

	if !resp.Status.Success {
		return fmt.Errorf("health check unsuccessful: %s", resp.Status.Message)
	}

	return nil
}

// GenerateText now accepts modelName per call
func (o *OpenRouterAdapter) GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error) {
	startTime := time.Now()

	// If caller didn't specify a model, use default
	if modelName == "" {
		modelName = o.defaultModel
	}

	// Rate limiting
	if err := o.rateLimiter.Wait(ctx); err != nil {
		return o.createErrorResponse(req, fmt.Errorf("rate limit error: %w", err), startTime), nil
	}

	// Primary model first, then free fallbacks (limit to 3 attempts to avoid long waits)
	modelsToTry := []string{modelName}
	// Only try first 2 fallbacks to avoid long waits
	if len(o.freeModels) > 0 {
		modelsToTry = append(modelsToTry, o.freeModels[0])
		if len(o.freeModels) > 1 {
			modelsToTry = append(modelsToTry, o.freeModels[1])
		}
	}

	var lastErr error
	for i, m := range modelsToTry {
		// Check if context is already cancelled
		if ctx.Err() != nil {
			return o.createErrorResponse(req, fmt.Errorf("context cancelled: %w", ctx.Err()), startTime), nil
		}

		if i > 0 {
			fmt.Printf("   Trying fallback model: %s\n", m)
		}

		orReq := o.optimizeForReasoningModels(req, m)
		orResp, err := o.callOpenRouterAPI(ctx, orReq)

		if err == nil && len(orResp.Choices) > 0 {
			// success – use the actual model used (m)
			return o.convertToUAIPResponse(orResp, req, startTime, m), nil
		}

		lastErr = err
		// Fail fast on auth errors, timeouts, OR rate limits (don't spam retries)
		if err != nil && (strings.Contains(err.Error(), "401") ||
			strings.Contains(err.Error(), "unauthorized") ||
			strings.Contains(err.Error(), "timeout") ||
			strings.Contains(err.Error(), "429") ||
			strings.Contains(err.Error(), "Too Many Requests")) {
			break
		}
	}

	return o.createErrorResponse(req, lastErr, startTime), nil
}

// Special handling for reasoning models (qwq, glm)
func (o *OpenRouterAdapter) optimizeForReasoningModels(req *uaip.UAIPRequest, modelName string) *OpenRouterRequest {
	maxTokens := req.Payload.OutputRequirements.MaxTokens

	if strings.Contains(modelName, "qwq") || strings.Contains(modelName, "glm") {
		maxTokens = min(maxTokens+200, 800)

		prompt := "Answer concisely after your reasoning: " + req.Payload.Input.Data

		return &OpenRouterRequest{
			Model: modelName,
			Messages: []Message{
				{Role: "user", Content: prompt},
			},
			MaxTokens:   maxTokens,
			Temperature: 0.3,
			TopP:        0.9,
		}
	}

	return o.convertToOpenRouterRequest(req, modelName)
}

func (o *OpenRouterAdapter) convertToOpenRouterRequest(req *uaip.UAIPRequest, modelName string) *OpenRouterRequest {
	maxTokens := req.Payload.OutputRequirements.MaxTokens
	if maxTokens > 1000 {
		maxTokens = 1000
	}
	if maxTokens < 50 {
		maxTokens = 150
	}

	prompt := req.Payload.Input.Data
	if strings.Contains(modelName, "deepseek") {
		prompt = "Please respond concisely: " + prompt
	}

	return &OpenRouterRequest{
		Model: modelName,
		Messages: []Message{
			{
				Role:    "user",
				Content: prompt,
			},
		},
		MaxTokens:   maxTokens,
		Temperature: req.Payload.OutputRequirements.Temperature,
		TopP:        0.9,
	}
}

func (o *OpenRouterAdapter) callOpenRouterAPI(ctx context.Context, req *OpenRouterRequest) (*OpenRouterResponse, error) {
	// Check API key early
	if o.apiKey == "" {
		return nil, fmt.Errorf("OpenRouter API key not configured")
	}

	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := o.baseURL + "/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create HTTP request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", o.apiKey))
	httpReq.Header.Set("HTTP-Referer", "https://gaiol.ai")
	httpReq.Header.Set("X-Title", "GAIOL Universal AI Interoperability")

	resp, err := o.client.Do(httpReq)
	if err != nil {
		// Check if it's a context timeout
		if ctx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("request timeout: %w", err)
		}
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	// Log HTTP status for debugging
	fmt.Printf("   OpenRouter HTTP Status: %d %s\n", resp.StatusCode, resp.Status)

	// Check for auth errors early
	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("OpenRouter API key invalid or expired (401)")
	}

	var orResp OpenRouterResponse
	if err := json.NewDecoder(resp.Body).Decode(&orResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if orResp.Error != nil {
		return nil, fmt.Errorf("OpenRouter API error: %s", orResp.Error.Message)
	}

	if resp.StatusCode != http.StatusOK {
		// Read body for error details
		bodyBytes, _ := io.ReadAll(resp.Body)
		fmt.Printf("❌ OpenRouter API failed with HTTP %d: %s\n", resp.StatusCode, string(bodyBytes))
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, resp.Status)
	}

	return &orResp, nil
}

func (o *OpenRouterAdapter) extractFromReasoningFields(choice Choice) string {
	if reasoning, ok := choice.Message.Extra["reasoning"].(string); ok {
		if text := o.extractAnswerFromReasoning(reasoning); text != "" {
			return text
		}
	}

	if reasoningDetails, ok := choice.Message.Extra["reasoning_details"].([]interface{}); ok && len(reasoningDetails) > 0 {
		if detailMap, ok := reasoningDetails[0].(map[string]interface{}); ok {
			if text, ok := detailMap["text"].(string); ok {
				return o.extractAnswerFromReasoning(text)
			}
		}
	}

	return ""
}

func (o *OpenRouterAdapter) convertToUAIPResponse(resp *OpenRouterResponse, originalReq *uaip.UAIPRequest, startTime time.Time, modelUsed string) *uaip.UAIPResponse {
	processingMs := int(time.Since(startTime).Milliseconds())

	if len(resp.Choices) == 0 {
		return o.createEmptyResponse(originalReq)
	}

	choice := resp.Choices[0]
	var responseText string

	content := strings.TrimSpace(choice.Message.Content)

	if content != "" {
		responseText = o.cleanReasoningArtifacts(content)
	} else {
		fmt.Printf("DEBUG: GLM empty content, checking reasoning fields...\n")
		fmt.Printf("DEBUG: Full choice: %+v\n", choice)

		if rawData, ok := choice.Message.Extra["reasoning"].(string); ok {
			fmt.Printf("DEBUG: Found reasoning field: %s\n", rawData[:min(100, len(rawData))])
			responseText = o.extractAnswerFromReasoning(rawData)
		}

		if responseText == "" {
			responseText = o.extractGLMSpecificResponse(choice)
		}
	}

	responseText = NewResponseCleaner().AutoClean(responseText, modelUsed)

	if responseText == "" {
		responseText = o.generateFallbackResponse(choice, resp.Usage.TotalTokens)
	}

	return &uaip.UAIPResponse{
		UAIP: uaip.UAIPHeader{
			Version:       uaip.ProtocolVersion,
			MessageID:     o.generateMessageID(),
			CorrelationID: originalReq.UAIP.MessageID,
			Timestamp:     time.Now(),
		},
		Status: uaip.ResponseStatus{
			Code:    uaip.StatusOK,
			Message: "Generated successfully",
			Success: true,
		},
		Result: uaip.Result{
			Data:         responseText,
			Format:       "text",
			TokensUsed:   resp.Usage.TotalTokens,
			ProcessingMs: processingMs,
			Quality:      0.85,
			ModelUsed:    modelUsed,
			Metadata: map[string]interface{}{
				"model_name":    modelUsed,
				"provider":      "openrouter",
				"finish_reason": choice.FinishReason,
				"raw_choice":    choice,
			},
		},
	}
}

func (o *OpenRouterAdapter) extractGLMSpecificResponse(choice Choice) string {
	if reasoningField, exists := choice.Message.Extra["reasoning"]; exists {
		if reasoning, ok := reasoningField.(string); ok && len(reasoning) > 10 {
			return o.extractAnswerFromReasoning(reasoning)
		}
	}

	for key, value := range choice.Message.Extra {
		if strValue, ok := value.(string); ok && len(strValue) > 10 && len(strValue) < 1000 {
			fmt.Printf("DEBUG: Found text in field '%s': %s\n", key, strValue[:min(50, len(strValue))])
			if o.looksLikeResponse(strValue) {
				return strValue
			}
		}
	}

	return ""
}

func (o *OpenRouterAdapter) looksLikeResponse(text string) bool {
	text = strings.ToLower(text)
	return !strings.Contains(text, "let me think") &&
		!strings.Contains(text, "okay, so") &&
		!strings.Contains(text, "hmm") &&
		len(text) > 20 && len(text) < 500
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (o *OpenRouterAdapter) generateFallbackResponse(choice Choice, totalTokens int) string {
	if choice.FinishReason == "length" {
		return "Response was truncated due to length limits. The model processed the request but exceeded token limits."
	}
	return fmt.Sprintf("Generated %d tokens but parsing needs adjustment. Finish reason: %s", totalTokens, choice.FinishReason)
}

func (o *OpenRouterAdapter) cleanReasoningArtifacts(content string) string {
	thinkRegex := regexp.MustCompile(`<think>.*?</think>`)
	cleaned := thinkRegex.ReplaceAllString(content, "")

	prefixes := []string{"<think>", "</think>", "Okay,", "Let me think"}
	for _, prefix := range prefixes {
		if strings.HasPrefix(cleaned, prefix) {
			cleaned = strings.TrimPrefix(cleaned, prefix)
		}
	}

	return strings.TrimSpace(cleaned)
}

func (o *OpenRouterAdapter) extractAnswerFromReasoning(reasoning string) string {
	reasoning = strings.TrimSpace(reasoning)

	conclusionMarkers := []string{
		"So the answer is:",
		"Therefore:",
		"In conclusion:",
		"The answer is:",
		"Final answer:",
		"So:",
	}

	for _, marker := range conclusionMarkers {
		if idx := strings.LastIndex(reasoning, marker); idx != -1 {
			answer := strings.TrimSpace(reasoning[idx+len(marker):])
			if len(answer) > 0 && len(answer) < 500 {
				return answer
			}
		}
	}

	sentences := strings.Split(reasoning, ".")
	for i := len(sentences) - 1; i >= 0; i-- {
		sentence := strings.TrimSpace(sentences[i])
		if len(sentence) > 10 && len(sentence) < 200 {
			return sentence + "."
		}
	}

	if len(reasoning) > 200 {
		return reasoning[:200] + "... (reasoning model response)"
	}
	return reasoning
}

func (o *OpenRouterAdapter) createEmptyResponse(req *uaip.UAIPRequest) *uaip.UAIPResponse {
	return &uaip.UAIPResponse{
		UAIP: uaip.UAIPHeader{
			Version:       uaip.ProtocolVersion,
			MessageID:     o.generateMessageID(),
			CorrelationID: req.UAIP.MessageID,
			Timestamp:     time.Now(),
		},
		Status: uaip.ResponseStatus{
			Code:    uaip.StatusInternalError,
			Message: "No response from model",
			Success: false,
		},
		Error: &uaip.ErrorInfo{
			Code:            uaip.ErrorCodeInternalError,
			Type:            uaip.ErrorTypeInternal,
			Message:         "OpenRouter returned empty response",
			SuggestedAction: "try_different_model",
		},
	}
}

func (o *OpenRouterAdapter) createErrorResponse(req *uaip.UAIPRequest, err error, startTime time.Time) *uaip.UAIPResponse {
	errorCode := uaip.ErrorCodeInternalError
	errorType := uaip.ErrorTypeInternal
	suggestedAction := "retry"

	errMsg := err.Error()
	if strings.Contains(errMsg, "rate limit") || strings.Contains(errMsg, "429") {
		errorCode = uaip.ErrorCodeRateLimit
		errorType = uaip.ErrorTypeRateLimit
		suggestedAction = "wait_and_retry"
	} else if strings.Contains(errMsg, "unauthorized") || strings.Contains(errMsg, "401") {
		errorCode = uaip.ErrorCodeAuthFailed
		errorType = uaip.ErrorTypeAuthentication
		suggestedAction = "check_api_key"
	}

	return &uaip.UAIPResponse{
		UAIP: uaip.UAIPHeader{
			Version:       uaip.ProtocolVersion,
			MessageID:     o.generateMessageID(),
			CorrelationID: req.UAIP.MessageID,
			Timestamp:     time.Now(),
		},
		Status: uaip.ResponseStatus{
			Code:    uaip.StatusInternalError,
			Message: "Request failed",
			Success: false,
		},
		Error: &uaip.ErrorInfo{
			Code:            errorCode,
			Type:            errorType,
			Message:         fmt.Sprintf("OpenRouter API issue: %s", errMsg),
			SuggestedAction: suggestedAction,
		},
		Metadata: uaip.ResponseMetadata{
			ProcessedAt: time.Now(),
			TraceID:     req.UAIP.MessageID,
		},
	}
}

func (o *OpenRouterAdapter) generateMessageID() string {
	return fmt.Sprintf("or-%d", time.Now().UnixNano())
}

// GenerateEmbedding generates vector embeddings for the given text
func (o *OpenRouterAdapter) GenerateEmbedding(ctx context.Context, modelName string, text string) ([]float64, error) {
	if modelName == "" {
		modelName = "openai/text-embedding-3-small"
	}

	reqBody := map[string]interface{}{
		"model": modelName,
		"input": text,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal embedding request: %w", err)
	}

	url := o.baseURL + "/embeddings"
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create embedding request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", o.apiKey))

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("embedding request failed: %w", err)
	}
	defer resp.Body.Close()

	var orResp OpenRouterResponse
	if err := json.NewDecoder(resp.Body).Decode(&orResp); err != nil {
		return nil, fmt.Errorf("failed to decode embedding response: %w", err)
	}

	if orResp.Error != nil {
		return nil, fmt.Errorf("OpenRouter embedding error: %s", orResp.Error.Message)
	}

	if len(orResp.Data) == 0 {
		return nil, fmt.Errorf("no embedding returned")
	}

	return orResp.Data[0].Embedding, nil
}
