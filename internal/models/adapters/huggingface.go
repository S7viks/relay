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

    "gaiol/internal/models"
    "gaiol/internal/uaip"
)

type HuggingFaceAdapter struct {
    defaultModel string
    baseURL      string
    client       *http.Client
    rateLimiter  *RateLimiter
    apiKey       string
    freeModels   []string
}

/* -------------------------------------------------------
   HF OpenAI-Compatible Chat API Request/Response Structs
------------------------------------------------------- */

type HFMessage struct {
    Role    string `json:"role"`
    Content string `json:"content"`
}

type HFChatRequest struct {
    Model       string      `json:"model"`
    Messages    []HFMessage `json:"messages"`
    MaxTokens   int         `json:"max_tokens,omitempty"`
    Temperature float64     `json:"temperature,omitempty"`
}

type HFChoice struct {
    Message HFMessage `json:"message"`
}

type HFChatResponse struct {
    Choices []HFChoice `json:"choices"`
}

/* -------------------------------------------------------
   Adapter Constructor
------------------------------------------------------- */

func NewHuggingFaceAdapter(defaultModel, apiKey string) *HuggingFaceAdapter {
    if defaultModel == "" {
        defaultModel = "mistralai/Mistral-7B-Instruct-v0.2"
    }

    freeFallbackModels := []string{
        "google/gemma-2b-it",
        "tiiuae/falcon-7b-instruct",
        "mistralai/Mistral-7B-Instruct-v0.2",
    }

    return &HuggingFaceAdapter{
        defaultModel: defaultModel,
        baseURL:      "https://router.huggingface.co/v1",
        client:       &http.Client{Timeout: 90 * time.Second},
        rateLimiter:  NewRateLimiter(),
        apiKey:       apiKey,
        freeModels:   freeFallbackModels,
    }
}

/* -------------------------------------------------------
   UAIP Interface Implementations
------------------------------------------------------- */

func (h *HuggingFaceAdapter) Name() string { return "huggingface" }
func (h *HuggingFaceAdapter) Provider() string { return "huggingface" }
func (h *HuggingFaceAdapter) RequiresAuth() bool { return true }

func (h *HuggingFaceAdapter) SupportedTasks() []models.TaskType {
    return []models.TaskType{
        models.TaskGenerate,
        models.TaskAnalyze,
        models.TaskSummarize,
    }
}

func (h *HuggingFaceAdapter) GetCapabilities() models.ModelCapabilities {
    return models.ModelCapabilities{
        MaxTokens:         1024,
        SupportsStreaming: false,
        Languages:         []string{"en"},
        ContextWindow:     4096,
        QualityScore:      0.80,
        Multimodal:        false,
    }
}

func (h *HuggingFaceAdapter) GetCost() models.CostInfo {
    return models.CostInfo{
        CostPerToken:    0,
        CostPerRequest:  0,
        FreeTierLimit:   1000,
        RateLimitPerMin: 10,
    }
}

/* -------------------------------------------------------
   Health Check
------------------------------------------------------- */

func (h *HuggingFaceAdapter) HealthCheck() error {
    ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
    defer cancel()

    req := &uaip.UAIPRequest{
        UAIP: uaip.UAIPHeader{
            Version:   uaip.ProtocolVersion,
            MessageID: "health-check",
            Timestamp: time.Now(),
        },
        Payload: uaip.Payload{
            Input: uaip.PayloadInput{
                Data:   "ping",
                Format: "text",
            },
            OutputRequirements: uaip.OutputRequirements{
                MaxTokens:   10,
                Temperature: 0.1,
            },
        },
    }

    _, err := h.GenerateText(ctx, h.defaultModel, req)
    return err
}

/* -------------------------------------------------------
   Core GenerateText Function
------------------------------------------------------- */

func (h *HuggingFaceAdapter) GenerateText(ctx context.Context, modelName string, req *uaip.UAIPRequest) (*uaip.UAIPResponse, error) {
    start := time.Now()

    if modelName == "" {
        modelName = h.defaultModel
    }

    // Rate limiting
    if err := h.rateLimiter.Wait(ctx); err != nil {
        return h.createErrorResponse(req, err, start), nil
    }

    modelsToTry := append([]string{modelName}, h.freeModels...)

    var lastErr error

    for i, model := range modelsToTry {
        if i > 0 {
            fmt.Printf("   Trying fallback HF model: %s\n", model)
        }

        hfReq := h.convertToHFRequest(model, req)
        hfResp, err := h.callHuggingFaceAPI(ctx, model, hfReq)

        if err == nil && len(hfResp.Choices) > 0 {
            return h.convertToUAIPResponse(
                hfResp.Choices[0].Message.Content,
                req,
                start,
                model,
            ), nil
        }

        lastErr = err

        if err != nil && (strings.Contains(err.Error(), "401") || strings.Contains(err.Error(), "403")) {
            break
        }
    }

    return h.createErrorResponse(req, lastErr, start), nil
}

/* -------------------------------------------------------
   HF Request Builder
------------------------------------------------------- */

func (h *HuggingFaceAdapter) convertToHFRequest(model string, req *uaip.UAIPRequest) *HFChatRequest {
    return &HFChatRequest{
        Model: model,
        Messages: []HFMessage{
            {Role: "user", Content: req.Payload.Input.Data},
        },
        MaxTokens:   req.Payload.OutputRequirements.MaxTokens,
        Temperature: req.Payload.OutputRequirements.Temperature,
    }
}

/* -------------------------------------------------------
   HF API Caller
------------------------------------------------------- */

func (h *HuggingFaceAdapter) callHuggingFaceAPI(ctx context.Context, model string, reqBody *HFChatRequest) (*HFChatResponse, error) {
    data, _ := json.Marshal(reqBody)

    url := h.baseURL + "/chat/completions"

    httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(data))
    if err != nil {
        return nil, err
    }

    httpReq.Header.Set("Content-Type", "application/json")
    httpReq.Header.Set("Authorization", "Bearer "+h.apiKey)

    resp, err := h.client.Do(httpReq)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode != 200 {
        body, _ := io.ReadAll(resp.Body)
        return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, body)
    }

    var hfResp HFChatResponse
    err = json.NewDecoder(resp.Body).Decode(&hfResp)
    if err != nil {
        return nil, err
    }

    return &hfResp, nil
}

/* -------------------------------------------------------
   UAIP Response Builder
------------------------------------------------------- */

func (h *HuggingFaceAdapter) convertToUAIPResponse(text string, req *uaip.UAIPRequest, start time.Time, model string) *uaip.UAIPResponse {
    text = strings.TrimSpace(text)

    return &uaip.UAIPResponse{
        UAIP: uaip.UAIPHeader{
            Version:       uaip.ProtocolVersion,
            MessageID:     h.generateMessageID(),
            CorrelationID: req.UAIP.MessageID,
            Timestamp:     time.Now(),
        },
        Status: uaip.ResponseStatus{
            Code:    uaip.StatusOK,
            Message: "Success",
            Success: true,
        },
        Result: uaip.Result{
            Data:         text,
            Format:       "text",
            TokensUsed:   len(text) / 4,
            ProcessingMs: int(time.Since(start).Milliseconds()),
            Quality:      0.85,
            ModelUsed:    model,
        },
    }
}

/* -------------------------------------------------------
   Error Response Builder
------------------------------------------------------- */

func (h *HuggingFaceAdapter) createErrorResponse(req *uaip.UAIPRequest, err error, start time.Time) *uaip.UAIPResponse {
    if err == nil {
        err = fmt.Errorf("unknown error")
    }

    msg := err.Error()

    code := uaip.ErrorCodeInternalError
    etype := uaip.ErrorTypeInternal
    action := "retry"

    switch {
    case strings.Contains(msg, "404"):
        code = uaip.ErrorCodeModelNotFound
        action = "try_different_model"
    case strings.Contains(msg, "429"):
        code = uaip.ErrorCodeRateLimit
        etype = uaip.ErrorTypeRateLimit
        action = "wait_and_retry"
    case strings.Contains(msg, "401") || strings.Contains(msg, "403"):
        code = uaip.ErrorCodeAuthFailed
        etype = uaip.ErrorTypeAuthentication
        action = "check_api_key"
    case strings.Contains(msg, "timeout"):
        code = uaip.ErrorCodeTimeout
        etype = uaip.ErrorTypeTimeout
        action = "retry_with_longer_timeout"
    }

    return &uaip.UAIPResponse{
        UAIP: uaip.UAIPHeader{
            Version:       uaip.ProtocolVersion,
            MessageID:     h.generateMessageID(),
            CorrelationID: req.UAIP.MessageID,
            Timestamp:     time.Now(),
        },
        Status: uaip.ResponseStatus{
            Code:    uaip.StatusInternalError,
            Message: "Request failed",
            Success: false,
        },
        Error: &uaip.ErrorInfo{
            Code:            code,
            Type:            etype,
            Message:         msg,
            SuggestedAction: action,
        },
    }
}

/* -------------------------------------------------------
   Utils
------------------------------------------------------- */

func (h *HuggingFaceAdapter) generateMessageID() string {
    return fmt.Sprintf("hf-%d", time.Now().UnixNano())
}

