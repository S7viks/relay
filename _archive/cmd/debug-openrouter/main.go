package main

import (
    "bytes"
    
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "os"
    "time"
)

func main() {
    fmt.Println("🔍 OpenRouter API Debug Test")
    fmt.Println("=============================")
    
    apiKey := os.Getenv("OPENROUTER_API_KEY")
    if apiKey == "" {
        fmt.Println("❌ OPENROUTER_API_KEY not set")
        return
    }
    
    // Test with different models and prompts
    models := []string{
        "qwen/qwq-32b:free",
        "z-ai/glm-4.5-air:free", 
        "deepseek/deepseek-r1:free",
    }
    
    prompts := []string{
        "Hello, how are you?",
        "What is 2+2?",
        "Explain AI in one sentence.",
    }
    
    for _, model := range models {
        fmt.Printf("\n🤖 Testing model: %s\n", model)
        for i, prompt := range prompts {
            fmt.Printf("  Test %d: %s\n", i+1, prompt)
            testModel(model, prompt, apiKey)
        }
    }
}

func testModel(model, prompt, apiKey string) {
    payload := map[string]interface{}{
        "model": model,
        "messages": []map[string]string{
            {"role": "user", "content": prompt},
        },
        "max_tokens":   200,
        "temperature":  0.7,
    }
    
    jsonData, _ := json.Marshal(payload)
    
    req, _ := http.NewRequest("POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewBuffer(jsonData))
    req.Header.Set("Authorization", "Bearer "+apiKey)
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("HTTP-Referer", "https://gaiol.ai")
    req.Header.Set("X-Title", "GAIOL Debug Test")
    
    client := &http.Client{Timeout: 30 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        fmt.Printf("    ❌ HTTP Error: %v\n", err)
        return
    }
    defer resp.Body.Close()
    
    body, _ := io.ReadAll(resp.Body)
    
    var result map[string]interface{}
    if err := json.Unmarshal(body, &result); err != nil {
        fmt.Printf("    ❌ JSON Error: %v\n", err)
        fmt.Printf("    Raw body: %s\n", string(body))
        return
    }
    
    // Check for errors
    if errorObj, exists := result["error"]; exists {
        fmt.Printf("    ❌ API Error: %v\n", errorObj)
        return
    }
    
    // Check choices
    if choices, exists := result["choices"].([]interface{}); exists && len(choices) > 0 {
        choice := choices[0].(map[string]interface{})
        message := choice["message"].(map[string]interface{})
        content := message["content"].(string)
        finishReason := choice["finish_reason"].(string)
        
        if content == "" {
            fmt.Printf("    ⚠️  Empty content! Finish reason: %s\n", finishReason)
            fmt.Printf("    Full choice: %v\n", choice)
        } else {
            fmt.Printf("    ✅ Got content: %s (reason: %s)\n", content[:min(50, len(content))], finishReason)
        }
    } else {
        fmt.Printf("    ❌ No choices in response\n")
        fmt.Printf("    Full response: %v\n", result)
    }
    
    time.Sleep(4 * time.Second) // Rate limiting
}

func min(a, b int) int {
    if a < b {
        return a
    }
    return b
}
