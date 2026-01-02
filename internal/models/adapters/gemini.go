package adapters

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "strings"
    "sync"
    "time"

    "gaiol/internal/models"
    "gaiol/internal/uaip"
)

// FIXED: Better rate limiter
type RateLimiter struct {
    tokens   chan struct{}
    ticker   *time.Ticker
    mu       sync.Mutex
    lastUsed time.Time
}

func NewRateLimiter() *RateLimiter {
    rl := &RateLimiter{
        tokens: make(chan struct{}, 1),
        ticker: time.NewTicker(4 * time.Second),
    }
    
    rl.tokens <- struct{}{}
    
    go func() {
        for range rl.ticker.C {
            select {
            case rl.tokens <- struct{}{}:
            default:
            }
        }
    }()
    
    return rl
}

func (rl *RateLimiter) Wait(ctx context.Context) error {
    rl.mu.Lock()
    rl.lastUsed = time.Now()
    rl.mu.Unlock()
    
    select {
    case <-rl.tokens:
        return nil
    case <-ctx.Done():
        return ctx.Err()
    case <-time.After(10 * time.Second):
        return fmt.Errorf("rate limit timeout")
    }
}

type GeminiAdapter struct {
    apiKey      string
    baseURL     string
    client      *http.Client
    rateLimiter *RateLimiter
}

type GeminiRequest struct {
    Contents         []GeminiContent  `json:"contents"`
    GenerationConfig *GeminiConfig    `json:"generationConfig,omitempty"`
    SafetySettings   []SafetySetting  `json:"safetySettings,omitempty"`
}

type GeminiContent struct {
    Parts []GeminiPart `json:"parts"`
}

type GeminiPart struct {
    Text string `json:"text"`
}

type GeminiConfig struct {
    Temperature     *float64 `json:"temperature,omitempty"`
    MaxOutputTokens *int     `json:"maxOutputTokens,omitempty"`
    TopK            *int     `json:"topK,omitempty"`
    TopP            *float64 `json:"topP,omitempty"`
}

type SafetySetting struct {
    Category  string `json:"category"`
    Threshold string `json:"threshold"`
}

type GeminiResponse struct {
    Candidates    []GeminiCandidate `json:"candidates"`
    UsageMetadata *GeminiUsage      `json:"usageMetadata,omitempty"`
    Error         *GeminiError      `json:"error,omitempty"`
}

type GeminiCandidate struct {
    Content       GeminiContent  `json:"content"`
    FinishReason  string         `json:"finishReason"`
    Index         int            `json:"index"`
    SafetyRatings []SafetyRating `json:"safetyRatings"`
}

type GeminiUsage struct {
    PromptTokenCount     int `json:"promptTokenCount"`
    CandidatesTokenCount int `json:"candidatesTokenCount"`
    TotalTokenCount      int `json:"totalTokenCount"`
}

type SafetyRating struct {
    Category    string `json:"category"`
    Probability string `json:"probability"`
}

type GeminiError struct {
    Code    int    `json:"code"`
    Message string `json:"message"`
    Status  string `json:"status"`
}

func NewGeminiAdapter(apiKey string) *GeminiAdapter {
    return &GeminiAdapter{
        apiKey:      apiKey,
        baseURL:     "https://generativelanguage.googleapis.com/v1beta",
        client:      &http.Client{Timeout: 60 * time.Second},
        rateLimiter: NewRateLimiter(),
    }
}

func (g *GeminiAdapter) Name() string {
    return "gemini-1.5-flash"
}

func (g *GeminiAdapter) Provider() string {
    return "google"
}

func (g *GeminiAdapter) SupportedTasks() []models.TaskType {
    return []models.TaskType{
        models.TaskGenerate,
        models.TaskAnalyze,
        models.TaskSummarize,
        models.TaskTransform,
    }
}

func (g *GeminiAdapter) RequiresAuth() bool {
    return true
}

func (g *GeminiAdapter) GetCapabilities() models.ModelCapabilities {
    return models.ModelCapabilities{
        MaxTokens:         8192,
        SupportsStreaming: false,
        Languages:         []string{"en", "es", "fr", "de", "it", "pt", "hi", "ja", "ko", "zh"},
        ContextWindow:     1048576,
        QualityScore:      0.85,
        Multimodal:        true,
    }
}

func (g *GeminiAdapter) GetCost() models.CostInfo {
    return models.CostInfo{
        CostPerToken:    0.0,
        CostPerRequest:  0.0,
        FreeTierLimit:   15,
        RateLimitPerMin: 15,
    }
}

// FIXED: Better error handling and logging
func (g *GeminiAdapter) GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error) {
    startTime := time.Now()

    if modelName == "" {
        modelName = "gemini-1.5-flash"
    }

    // Rate limiting
    if err := g.rateLimiter.Wait(ctx); err != nil {
        return g.createErrorResponse(req, fmt.Errorf("rate limit error: %w", err), startTime), nil
    }

    // Convert request
    geminiReq := g.convertToGeminiRequest(req)

    // Make API call with detailed error logging
    geminiResp, err := g.callGeminiAPIWithModel(ctx, geminiReq, modelName)
    if err != nil {
        // Log the actual error for debugging
        fmt.Printf("DEBUG: Gemini API error: %v\n", err)
        return g.createErrorResponse(req, err, startTime), nil
    }

    return g.convertToUAIPResponse(geminiResp, req, startTime, modelName), nil
}

// FIXED: Better error handling and response reading
func (g *GeminiAdapter) callGeminiAPIWithModel(ctx context.Context, req *GeminiRequest, modelName string) (*GeminiResponse, error) {
    jsonData, err := json.Marshal(req)
    if err != nil {
        return nil, fmt.Errorf("failed to marshal request: %w", err)
    }

    url := fmt.Sprintf("%s/models/%s:generateContent?key=%s", g.baseURL, modelName, g.apiKey)
    
    httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
    if err != nil {
        return nil, fmt.Errorf("failed to create HTTP request: %w", err)
    }

    httpReq.Header.Set("Content-Type", "application/json")
    httpReq.Header.Set("User-Agent", "GAIOL/1.0")

    resp, err := g.client.Do(httpReq)
    if err != nil {
        return nil, fmt.Errorf("HTTP request failed: %w", err)
    }
    defer resp.Body.Close()

    // FIXED: Read full body for better error messages
    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, fmt.Errorf("failed to read response: %w", err)
    }

    // FIXED: Check status before decoding
    if resp.StatusCode != http.StatusOK {
        var geminiErr GeminiError
        if json.Unmarshal(body, &geminiErr) == nil && geminiErr.Message != "" {
            return nil, fmt.Errorf("Gemini API error %d: %s (Status: %s)", geminiErr.Code, geminiErr.Message, geminiErr.Status)
        }
        return nil, fmt.Errorf("HTTP %d: %s - Body: %s", resp.StatusCode, resp.Status, truncate(string(body), 200))
    }

    var geminiResp GeminiResponse
    if err := json.Unmarshal(body, &geminiResp); err != nil {
        return nil, fmt.Errorf("failed to decode response: %w - Body: %s", err, truncate(string(body), 200))
    }

    // Check for API-level errors
    if geminiResp.Error != nil {
        return nil, fmt.Errorf("Gemini API error %d: %s", geminiResp.Error.Code, geminiResp.Error.Message)
    }

    return &geminiResp, nil
}

func (g *GeminiAdapter) convertToGeminiRequest(req *uaip.UAIPRequest) *GeminiRequest {
    maxTokens := req.Payload.OutputRequirements.MaxTokens
    temperature := req.Payload.OutputRequirements.Temperature
    topK := 64
    topP := 0.95
    
    return &GeminiRequest{
        Contents: []GeminiContent{
            {
                Parts: []GeminiPart{
                    {Text: req.Payload.Input.Data},
                },
            },
        },
        GenerationConfig: &GeminiConfig{
            Temperature:     &temperature,
            MaxOutputTokens: &maxTokens,
            TopK:            &topK,
            TopP:            &topP,
        },
        SafetySettings: []SafetySetting{
            {Category: "HARM_CATEGORY_HARASSMENT", Threshold: "BLOCK_NONE"},  // CHANGED
            {Category: "HARM_CATEGORY_HATE_SPEECH", Threshold: "BLOCK_NONE"},
            {Category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", Threshold: "BLOCK_NONE"},
            {Category: "HARM_CATEGORY_DANGEROUS_CONTENT", Threshold: "BLOCK_NONE"},
        },
    }
}

func (g *GeminiAdapter) convertToUAIPResponse(resp *GeminiResponse, originalReq *uaip.UAIPRequest, startTime time.Time, modelUsed string) *uaip.UAIPResponse {
    processingMs := int(time.Since(startTime).Milliseconds())

    if len(resp.Candidates) == 0 {
        return &uaip.UAIPResponse{
            UAIP: uaip.UAIPHeader{
                Version:       uaip.ProtocolVersion,
                MessageID:     g.generateMessageID(),
                CorrelationID: originalReq.UAIP.MessageID,
                Timestamp:     time.Now(),
            },
            Status: uaip.ResponseStatus{
                Code:    uaip.StatusInternalError,
                Message: "No candidates returned by Gemini",
                Success: false,
            },
            Error: &uaip.ErrorInfo{
                Code:    uaip.ErrorCodeInternalError,
                Type:    uaip.ErrorTypeInternal,
                Message: "No candidates returned - possibly filtered by safety settings",
            },
        }
    }

    candidate := resp.Candidates[0]
    var responseText string
    if len(candidate.Content.Parts) > 0 {
        responseText = candidate.Content.Parts[0].Text
    }

    // FIXED: Handle empty responses
    if responseText == "" {
        responseText = fmt.Sprintf("[Empty response - Finish reason: %s]", candidate.FinishReason)
    }

    qualityScore := g.calculateQualityScore(candidate.FinishReason)

    // FIXED: Safe token count access
    tokensUsed := 0
    if resp.UsageMetadata != nil {
        tokensUsed = resp.UsageMetadata.TotalTokenCount
    }

    return &uaip.UAIPResponse{
        UAIP: uaip.UAIPHeader{
            Version:       uaip.ProtocolVersion,
            MessageID:     g.generateMessageID(),
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
            TokensUsed:   tokensUsed,
            ProcessingMs: processingMs,
            Quality:      qualityScore,
            ModelUsed:    modelUsed,
            Metadata: map[string]interface{}{
                "model_name":        modelUsed,
                "finish_reason":     candidate.FinishReason,
                "safety_ratings":    candidate.SafetyRatings,
                "prompt_tokens":     getPromptTokens(resp),
                "completion_tokens": getCompletionTokens(resp),
            },
        },
    }
}

func getPromptTokens(resp *GeminiResponse) int {
    if resp.UsageMetadata != nil {
        return resp.UsageMetadata.PromptTokenCount
    }
    return 0
}

func getCompletionTokens(resp *GeminiResponse) int {
    if resp.UsageMetadata != nil {
        return resp.UsageMetadata.CandidatesTokenCount
    }
    return 0
}

func (g *GeminiAdapter) generateMessageID() string {
    return fmt.Sprintf("gemini-%d", time.Now().UnixNano())
}

func (g *GeminiAdapter) HealthCheck() error {
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
                Data:   "Test",
                Format: "text",
            },
            OutputRequirements: uaip.OutputRequirements{
                MaxTokens:   5,
                Temperature: 0.1,
            },
        },
    }
    
    resp, err := g.GenerateText(ctx, "gemini-2.0-flash", testReq)
    if err != nil {
        return fmt.Errorf("health check failed: %w", err)
    }
    
    if !resp.Status.Success {
        return fmt.Errorf("health check unsuccessful: %s", resp.Status.Message)
    }
    
    return nil
}

func (g *GeminiAdapter) createErrorResponse(req *uaip.UAIPRequest, err error, startTime time.Time) *uaip.UAIPResponse {
    errorCode := uaip.ErrorCodeInternalError
    errorType := uaip.ErrorTypeInternal
    suggestedAction := "retry"
    
    errMsg := err.Error()
    if strings.Contains(errMsg, "rate limit") || strings.Contains(errMsg, "429") {
        errorCode = uaip.ErrorCodeRateLimit
        errorType = uaip.ErrorTypeRateLimit
        suggestedAction = "wait_and_retry"
    } else if strings.Contains(errMsg, "timeout") || strings.Contains(errMsg, "context deadline") {
        errorCode = uaip.ErrorCodeTimeout
        errorType = uaip.ErrorTypeTimeout
        suggestedAction = "retry_with_longer_timeout"
    } else if strings.Contains(errMsg, "unauthorized") || strings.Contains(errMsg, "401") || strings.Contains(errMsg, "403") {
        errorCode = uaip.ErrorCodeAuthFailed
        errorType = uaip.ErrorTypeAuthentication
        suggestedAction = "check_api_key"
    } else if strings.Contains(errMsg, "API_KEY_INVALID") {
        errorCode = uaip.ErrorCodeAuthFailed
        errorType = uaip.ErrorTypeAuthentication
        suggestedAction = "verify_api_key_at_aistudio.google.com"
    } else if strings.Contains(errMsg, "RESOURCE_EXHAUSTED") {
        errorCode = uaip.ErrorCodeRateLimit
        errorType = uaip.ErrorTypeRateLimit
        suggestedAction = "quota_exceeded_wait_or_upgrade"
    }
    
    return &uaip.UAIPResponse{
        UAIP: uaip.UAIPHeader{
            Version:       uaip.ProtocolVersion,
            MessageID:     g.generateMessageID(),
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
            Message:         errMsg,
            SuggestedAction: suggestedAction,
        },
        Metadata: uaip.ResponseMetadata{
            ProcessedAt: time.Now(),
            TraceID:     req.UAIP.MessageID,
        },
    }
}

func (g *GeminiAdapter) calculateQualityScore(finishReason string) float64 {
    switch finishReason {
    case "STOP":
        return 0.90
    case "MAX_TOKENS":
        return 0.75
    case "SAFETY":
        return 0.60
    case "RECITATION":
        return 0.50
    default:
        return 0.70
    }
}

func truncate(s string, maxLen int) string {
    if len(s) <= maxLen {
        return s
    }
    return s[:maxLen] + "..."
}