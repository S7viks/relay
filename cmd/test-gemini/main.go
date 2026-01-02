package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"gaiol/internal/models/adapters"
	"gaiol/internal/uaip"
)

func main() {
	fmt.Println("🚀 GAIOL Gemini Adapter Test")
	fmt.Println("=============================")
	
	// Get API key
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		log.Fatal("❌ GEMINI_API_KEY environment variable required")
	}
	
	// Create adapter
	gemini := adapters.NewGeminiAdapter(apiKey)
	
	// Test 1: Basic Info
	fmt.Println("\n📋 1. ADAPTER INFORMATION")
	fmt.Printf("   Name: %s\n", gemini.Name())
	fmt.Printf("   Provider: %s\n", gemini.Provider())
	fmt.Printf("   Requires Auth: %v\n", gemini.RequiresAuth())
	fmt.Printf("   Supported Tasks: %v\n", gemini.SupportedTasks())
	
	capabilities := gemini.GetCapabilities()
	fmt.Printf("   Max Tokens: %d\n", capabilities.MaxTokens)
	fmt.Printf("   Quality Score: %.2f\n", capabilities.QualityScore)
	fmt.Printf("   Languages: %v\n", capabilities.Languages[:3]) // Show first 3
	
	cost := gemini.GetCost()
	fmt.Printf("   Cost per Request: $%.4f\n", cost.CostPerRequest)
	fmt.Printf("   Rate Limit: %d req/min\n", cost.RateLimitPerMin)
	
	// Test 2: Health Check
	fmt.Println("\n🏥 2. HEALTH CHECK")
	fmt.Print("   Testing connectivity... ")
	if err := gemini.HealthCheck(); err != nil {
		fmt.Printf("❌ Failed: %v\n", err)
		return
	}
	fmt.Println("✅ Passed")
	
	// Test 3: Simple Generation
	fmt.Println("\n💬 3. TEXT GENERATION TEST")
	req := &uaip.UAIPRequest{
		UAIP: uaip.UAIPHeader{
			Version:   uaip.ProtocolVersion,
			MessageID: "test-generation",
			Timestamp: time.Now(),
		},
		Payload: uaip.Payload{
			Input: uaip.PayloadInput{
				Data:   "Explain GAIOL in exactly one sentence.",
				Format: "text",
			},
			OutputRequirements: uaip.OutputRequirements{
				Format:      "text",
				MaxTokens:   50,
				Temperature: 0.7,
			},
		},
	}
	
	fmt.Print("   Generating response... ")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	resp, err := gemini.GenerateText(ctx, "gemini-1.5-flash", req)
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		return
	}
	
	if resp.Status.Success {
		fmt.Println("✅ Success")
		fmt.Printf("   Response: %s\n", resp.Result.Data)
		fmt.Printf("   Tokens Used: %d\n", resp.Result.TokensUsed)
		fmt.Printf("   Processing Time: %dms\n", resp.Result.ProcessingMs)
		fmt.Printf("   Quality Score: %.2f\n", resp.Result.Quality)
	} else {
		fmt.Printf("❌ Failed: %s\n", resp.Status.Message)
		if resp.Error != nil {
			fmt.Printf("   Error Code: %s\n", resp.Error.Code)
			fmt.Printf("   Error Message: %s\n", resp.Error.Message)
		}
	}
	
	// Test 4: Rate Limiting (simplified)
	fmt.Println("\n⏱️  4. RATE LIMITING TEST")
	fmt.Print("   Testing rate limits... ")
	
	start := time.Now()
	
	// Make two quick requests
	_, err1 := gemini.GenerateText(ctx, "gemini-1.5-flash", req)
	_, err2 := gemini.GenerateText(ctx, "gemini-1.5-flash", req)
	
	elapsed := time.Since(start)
	
	if err1 == nil && err2 == nil && elapsed >= 3*time.Second {
		fmt.Printf("✅ Working (took %v)\n", elapsed)
	} else if err1 != nil || err2 != nil {
		fmt.Printf("❌ Requests failed\n")
	} else {
		fmt.Printf("⚠️  Rate limiting may not be working (took %v)\n", elapsed)
	}
	
	fmt.Println("\n🎉 All tests completed!")
}