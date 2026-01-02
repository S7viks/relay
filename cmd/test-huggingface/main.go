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
    fmt.Println("🤗 GAIOL HuggingFace Adapter Test (with Fallbacks)")
    fmt.Println("==================================================")
 
    // Get HuggingFace API key
    apiKey := os.Getenv("HF_API_KEY")
    if apiKey == "" {
        fmt.Println("⚠️  Warning: HF_API_KEY environment variable not set!")
        fmt.Println("   Get your token from: https://huggingface.co/settings/tokens")
        return
    }
 
    // Create adapter - will try fallbacks if primary model fails
    hf := adapters.NewHuggingFaceAdapter("gpt2", apiKey)
 
    // Test 1: Basic Info
    fmt.Println("\n📋 1. ADAPTER INFORMATION")
    fmt.Printf("   Name: %s\n", hf.Name())
    fmt.Printf("   Provider: %s\n", hf.Provider())
    fmt.Printf("   Requires Auth: %v\n", hf.RequiresAuth())
 
    capabilities := hf.GetCapabilities()
    fmt.Printf("   Max Tokens: %d\n", capabilities.MaxTokens)
    fmt.Printf("   Quality Score: %.2f\n", capabilities.QualityScore)
 
    // Test 2: Text Generation with fallback
    fmt.Println("\n💬 2. TEXT GENERATION TEST (with fallbacks)")
    req := &uaip.UAIPRequest{
        UAIP: uaip.UAIPHeader{
            Version:   uaip.ProtocolVersion,
            MessageID: "test-hf-generation",
            Timestamp: time.Now(),
        },
        Task: uaip.Task{
            Type: "generate",
        },
        Payload: uaip.Payload{
            Input: uaip.PayloadInput{
                Data:   "Once upon a time",
                Format: "text",
            },
            OutputRequirements: uaip.OutputRequirements{
                Format:      "text",
                MaxTokens:   50,
                Temperature: 0.7,
            },
        },
    }
 
    fmt.Print("   Generating response (trying multiple models)... ")
    ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
    defer cancel()
 
    resp, err := hf.GenerateText(ctx, "mistralai/Mistral-7B-Instruct-v0.2", req)
    if err != nil {
        fmt.Printf("❌ Error: %v\n", err)
        return
    }
 
    if resp.Status.Success {
        fmt.Println("✅ Success")
        fmt.Printf("   Response: %s\n", resp.Result.Data)
        fmt.Printf("   Model Used: %s\n", resp.Result.ModelUsed)
        fmt.Printf("   Processing Time: %dms\n", resp.Result.ProcessingMs)
        fmt.Printf("   Quality Score: %.2f\n", resp.Result.Quality)
    } else {
        fmt.Printf("❌ Failed: %s\n", resp.Status.Message)
        if resp.Error != nil {
            fmt.Printf("   Error: %s\n", resp.Error.Message)
            fmt.Printf("   Suggested Action: %s\n", resp.Error.SuggestedAction)
        }
    }
 
    fmt.Println("\n🎉 HuggingFace adapter test completed!")
    fmt.Println("Note: If all models failed, HuggingFace API may be experiencing issues.")
}