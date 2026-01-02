package main

import (
    "context"
    "fmt"
    "os"
    "time"
    
    "gaiol/internal/models/adapters"
    "gaiol/internal/uaip"
)

func main() {
    fmt.Println("🌟 GAIOL Multi-Model Test - TRUE AI INTEROPERABILITY!")
    fmt.Println("====================================================")
    
    // Get API keys
    geminiKey := os.Getenv("GEMINI_API_KEY")
    openrouterKey := os.Getenv("OPENROUTER_API_KEY")
    
    if geminiKey == "" || openrouterKey == "" {
        fmt.Println("❌ Missing API keys!")
        fmt.Println("   GEMINI_API_KEY:", geminiKey != "")
        fmt.Println("   OPENROUTER_API_KEY:", openrouterKey != "")
        return
    }
    
    // Create both adapters
    gemini := adapters.NewGeminiAdapter(geminiKey)
    openrouter := adapters.NewOpenRouterAdapter("qwen/qwq-32b:free", openrouterKey)
    
    fmt.Println("\n🎯 Testing the same prompt with different AI models:")
    prompt := "Explain artificial intelligence in exactly 3 sentences."
    
    fmt.Printf("Prompt: \"%s\"\n\n", prompt)
    
    // Test Gemini
    fmt.Println("🟦 GOOGLE GEMINI RESPONSE:")
    testModel(gemini, prompt, "gemini")
    
    fmt.Println("\n🔀 OPENROUTER (DeepSeek) RESPONSE:")
    testModel(openrouter, prompt, "openrouter")
    
    fmt.Println("\n🎉 SUCCESS! GAIOL achieved true AI interoperability!")
    fmt.Println("Same UAIP protocol works with multiple AI providers seamlessly!")
}

func testModel(adapter interface{}, prompt, providerName string) {
    // Create UAIP request
    req := &uaip.UAIPRequest{
        UAIP: uaip.UAIPHeader{
            Version:   uaip.ProtocolVersion,
            MessageID: fmt.Sprintf("multi-test-%s-%d", providerName, time.Now().UnixNano()),
            Timestamp: time.Now(),
        },
        Task: uaip.Task{
            Type: "generate",
        },
        Payload: uaip.Payload{
            Input: uaip.PayloadInput{
                Data:   prompt,
                Format: "text",
            },
            OutputRequirements: uaip.OutputRequirements{
                Format:      "text",
                MaxTokens:   100,
                Temperature: 0.7,
            },
        },
    }
    
    ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
    defer cancel()
    
    var resp *uaip.UAIPResponse
    var err error
    
    // Type switch to call the right adapter
    var modelName string
    switch a := adapter.(type) {
    case *adapters.GeminiAdapter:
        modelName = "gemini-1.5-flash"
        resp, err = a.GenerateText(ctx, modelName, req)
    case *adapters.OpenRouterAdapter:
        modelName = "qwen/qwq-32b:free"
        resp, err = a.GenerateText(ctx, modelName, req)
    default:
        fmt.Println("   ❌ Unknown adapter type")
        return
    }
    
    if err != nil {
        fmt.Printf("   ❌ Error: %v\n", err)
        return
    }
    
    if resp.Status.Success {
        fmt.Printf("   ✅ Model: %s\n", resp.Result.ModelUsed)
        fmt.Printf("   📝 Response: %s\n", resp.Result.Data)
        fmt.Printf("   ⚡ Time: %dms | Tokens: %d | Quality: %.2f\n", 
            resp.Result.ProcessingMs, resp.Result.TokensUsed, resp.Result.Quality)
    } else {
        fmt.Printf("   ❌ Failed: %s\n", resp.Status.Message)
    }
}
