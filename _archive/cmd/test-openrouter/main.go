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
    fmt.Println("🔀 GAIOL OpenRouter Adapter Test")
    fmt.Println("=================================")
    
    // Get OpenRouter API key
    apiKey := os.Getenv("OPENROUTER_API_KEY")
    if apiKey == "" {
        fmt.Println("⚠️  Warning: OPENROUTER_API_KEY environment variable not set!")
        fmt.Println("   Get your key from: https://openrouter.ai/keys")
        return
    }
    
    // Create OpenRouter adapter
    or := adapters.NewOpenRouterAdapter("qwen/qwq-32b:free", apiKey)
    
    // Test 1: Basic Info
    fmt.Println("\n📋 1. ADAPTER INFORMATION")
    fmt.Printf("   Name: %s\n", or.Name())
    fmt.Printf("   Provider: %s\n", or.Provider())
    fmt.Printf("   Requires Auth: %v\n", or.RequiresAuth())
    fmt.Printf("   Supported Tasks: %v\n", or.SupportedTasks())
    
    capabilities := or.GetCapabilities()
    fmt.Printf("   Max Tokens: %d\n", capabilities.MaxTokens)
    fmt.Printf("   Quality Score: %.2f\n", capabilities.QualityScore)
    
    cost := or.GetCost()
    fmt.Printf("   Cost per Request: $%.4f\n", cost.CostPerRequest)
    fmt.Printf("   Rate Limit: %d req/min\n", cost.RateLimitPerMin)
    
    // Test 2: Health Check
    fmt.Println("\n🏥 2. HEALTH CHECK")
    fmt.Print("   Testing connectivity... ")
    if err := or.HealthCheck(); err != nil {
        fmt.Printf("❌ Failed: %v\n", err)
        return
    }
    fmt.Println("✅ Passed")
    
    // Test 3: Text Generation
    fmt.Println("\n💬 3. TEXT GENERATION TEST")
    req := &uaip.UAIPRequest{
        UAIP: uaip.UAIPHeader{
            Version:   uaip.ProtocolVersion,
            MessageID: "test-or-generation",
            Timestamp: time.Now(),
        },
        Task: uaip.Task{
            Type: "generate",
        },
        Payload: uaip.Payload{
            Input: uaip.PayloadInput{
                Data:   "Explain what GAIOL is and why universal AI interoperability matters.",
                Format: "text",
            },
            OutputRequirements: uaip.OutputRequirements{
                Format:      "text",
                MaxTokens:   200,
                Temperature: 0.7,
            },
        },
    }
    
    fmt.Print("   Generating response... ")
    ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
    defer cancel()
    
    resp, err := or.GenerateText(ctx, "qwen/qwq-32b:free", req)
    if err != nil {
        fmt.Printf("❌ Error: %v\n", err)
        return
    }
    
    if resp.Status.Success {
        fmt.Println("✅ Success")
        fmt.Printf("   Response: %s\n", resp.Result.Data)
        fmt.Printf("   Model Used: %s\n", resp.Result.ModelUsed)
        fmt.Printf("   Tokens Used: %d\n", resp.Result.TokensUsed)
        fmt.Printf("   Processing Time: %dms\n", resp.Result.ProcessingMs)
        fmt.Printf("   Quality Score: %.2f\n", resp.Result.Quality)
    } else {
        fmt.Printf("❌ Failed: %s\n", resp.Status.Message)
        if resp.Error != nil {
            fmt.Printf("   Error: %s\n", resp.Error.Message)
            fmt.Printf("   Suggested Action: %s\n", resp.Error.SuggestedAction)
        }
    }
    
    fmt.Println("\n🎉 OpenRouter adapter test completed!")
}
