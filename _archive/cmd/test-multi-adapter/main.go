package main

import (
    "context"
    "fmt"
    "io"
    "log"
    "net/http"
    "os"
    "strings"
    "time"

    "gaiol/internal/models/adapters"
    "gaiol/internal/uaip"
)

func main() {
    geminiKey := os.Getenv("GEMINI_API_KEY")
    openRouterKey := os.Getenv("OPENROUTER_API_KEY")
    hfKey := os.Getenv("HUGGINGFACE_API_KEY")

    fmt.Println("🔍 GAIOL Adapter Diagnostic Tool\n")
    fmt.Println("=" + strings.Repeat("=", 60))

    // Test API keys
    fmt.Println("\n📋 API Key Check:")
    checkAPIKey("Gemini", geminiKey)
    checkAPIKey("OpenRouter", openRouterKey)
    checkAPIKey("HuggingFace", hfKey)

    if geminiKey == "" || openRouterKey == "" {
        log.Fatal("❌ Missing required API keys")
    }

    // Test direct API connectivity
    fmt.Println("\n🌐 Direct API Connectivity Test:")
    testGeminiAPI(geminiKey)
    testOpenRouterAPI(openRouterKey)
    testHuggingFaceAPI(hfKey)

    // Test adapters
    fmt.Println("\n🧪 Adapter Tests:")
    fmt.Println(strings.Repeat("-", 60))

    gemini := adapters.NewGeminiAdapter(geminiKey)
    testAdapterDetailed(gemini, "gemini-2.0-flash", "What is 2+2?")

    openRouter := adapters.NewOpenRouterAdapter("", openRouterKey)
    testAdapterDetailed(openRouter, "qwen/qwq-32b:free", "What is quantum computing?")

    if hfKey != "" {
        hf := adapters.NewHuggingFaceAdapter("", hfKey)
        testAdapterDetailed(hf, "meta-llama/Llama-3.1-8B-Instruct", "Once upon a time")


    }

    fmt.Println("\n" + strings.Repeat("=", 60))
    fmt.Println("✅ Diagnostic complete!")
}

func checkAPIKey(name, key string) {
    if key == "" {
        fmt.Printf("   ❌ %s: NOT SET\n", name)
    } else {
        masked := key[:min(8, len(key))] + "..." + key[max(0, len(key)-4):]
        fmt.Printf("   ✅ %s: %s\n", name, masked)
    }
}

func testGeminiAPI(apiKey string) {
    fmt.Println("\n→ Testing Gemini API directly...")
    
    url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=%s", apiKey)
    
    payload := `{
        "contents": [{
            "parts": [{"text": "Hi"}]
        }],
        "generationConfig": {
            "maxOutputTokens": 10
        }
    }`

    resp, err := http.Post(url, "application/json", strings.NewReader(payload))
    if err != nil {
        fmt.Printf("   ❌ Connection failed: %v\n", err)
        return
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    
    if resp.StatusCode == 200 {
        fmt.Printf("   ✅ Gemini API: OK (Status %d)\n", resp.StatusCode)
    } else {
        fmt.Printf("   ❌ Gemini API: Failed (Status %d)\n", resp.StatusCode)
        fmt.Printf("   Response: %s\n", truncate(string(body), 200))
    }
}

func testOpenRouterAPI(apiKey string) {
    fmt.Println("\n→ Testing OpenRouter API directly...")
    
    payload := `{
        "model": "qwen/qwq-32b:free",
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 10
    }`

    req, _ := http.NewRequest("POST", "https://openrouter.ai/api/v1/chat/completions", strings.NewReader(payload))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Authorization", "Bearer "+apiKey)
    req.Header.Set("HTTP-Referer", "https://gaiol.ai")

    client := &http.Client{Timeout: 30 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        fmt.Printf("   ❌ Connection failed: %v\n", err)
        return
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    
    if resp.StatusCode == 200 {
        fmt.Printf("   ✅ OpenRouter API: OK (Status %d)\n", resp.StatusCode)
    } else {
        fmt.Printf("   ❌ OpenRouter API: Failed (Status %d)\n", resp.StatusCode)
        fmt.Printf("   Response: %s\n", truncate(string(body), 200))
    }
}

func testHuggingFaceAPI(apiKey string) {
    if apiKey == "" {
        fmt.Println("\n→ Skipping HuggingFace (no API key)")
        return
    }

    fmt.Println("\n→ Testing HuggingFace API directly...")

    req, _ := http.NewRequest("POST",
    "https://router.huggingface.co/v1/chat/completions",
    strings.NewReader(`{
        "model": "meta-llama/Llama-3.1-8B-Instruct",
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 10
    }`))

    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Authorization", "Bearer "+apiKey)

    // Optional recommended headers
    req.Header.Set("User-Agent", "gaiol-diagnostic/1.0")
    req.Header.Set("X-Title", "GAIOL Adapter Test")

    client := &http.Client{Timeout: 30 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        fmt.Printf("   ❌ Connection failed: %v\n", err)
        return
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)

    if resp.StatusCode == 200 {
        fmt.Printf("   ✅ HuggingFace API: OK (Status %d)\n", resp.StatusCode)
    } else {
        fmt.Printf("   ❌ HuggingFace API: Failed (Status %d)\n", resp.StatusCode)
        fmt.Printf("   Response: %s\n", truncate(string(body), 200))
    }
}


func testAdapterDetailed(adapter interface{}, modelName, prompt string) {
    ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
    defer cancel()

    adapterName := getAdapterName(adapter)
    fmt.Printf("\n▶ %s Adapter (model: %s)\n", adapterName, modelName)

    req := &uaip.UAIPRequest{
        UAIP: uaip.UAIPHeader{
            Version:   uaip.ProtocolVersion,
            MessageID: fmt.Sprintf("test-%d", time.Now().UnixNano()),
            Timestamp: time.Now(),
        },
        Payload: uaip.Payload{
            Input: uaip.PayloadInput{
                Data:   prompt,
                Format: "text",
            },
            OutputRequirements: uaip.OutputRequirements{
                MaxTokens:   50,
                Temperature: 0.7,
            },
        },
    }

    startTime := time.Now()
    var resp *uaip.UAIPResponse
    var err error

    switch a := adapter.(type) {
    case *adapters.GeminiAdapter:
        resp, err = a.GenerateText(ctx, modelName, req)
    case *adapters.OpenRouterAdapter:
        resp, err = a.GenerateText(ctx, modelName, req)
    case *adapters.HuggingFaceAdapter:
        resp, err = a.GenerateText(ctx, modelName, req)
    }

    duration := time.Since(startTime)

    if err != nil {
        fmt.Printf("   ❌ Error: %v\n", err)
        fmt.Printf("   Duration: %v\n", duration)
        return
    }

    if !resp.Status.Success {
        fmt.Printf("   ❌ Failed: %s\n", resp.Status.Message)
        if resp.Error != nil {
            fmt.Printf("   Error Code: %s\n", resp.Error.Code)
            fmt.Printf("   Error Type: %s\n", resp.Error.Type)
            fmt.Printf("   Error Message: %s\n", resp.Error.Message)
            fmt.Printf("   Suggested Action: %s\n", resp.Error.SuggestedAction)
        }
        fmt.Printf("   Duration: %v\n", duration)
        return
    }

    fmt.Printf("   ✅ Success!\n")
    fmt.Printf("   Model Used: %s\n", resp.Result.ModelUsed)
    fmt.Printf("   Duration: %v\n", duration)
    fmt.Printf("   Tokens: %d\n", resp.Result.TokensUsed)
    fmt.Printf("   Response: %s\n", truncate(resp.Result.Data, 100))
}

func getAdapterName(adapter interface{}) string {
    switch adapter.(type) {
    case *adapters.GeminiAdapter:
        return "Gemini"
    case *adapters.OpenRouterAdapter:
        return "OpenRouter"
    case *adapters.HuggingFaceAdapter:
        return "HuggingFace"
    default:
        return "Unknown"
    }
}

func truncate(s string, maxLen int) string {
    s = strings.TrimSpace(s)
    if len(s) <= maxLen {
        return s
    }
    return s[:maxLen] + "..."
}

func min(a, b int) int {
    if a < b {
        return a
    }
    return b
}

func max(a, b int) int {
    if a > b {
        return a
    }
    return b
}