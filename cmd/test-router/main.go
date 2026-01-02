package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"gaiol/internal/models"
	"gaiol/internal/models/adapters"
	"gaiol/internal/uaip"
)

func main() {
	openRouterKey := os.Getenv("OPENROUTER_API_KEY")
	hfKey := os.Getenv("HUGGINGFACE_API_KEY")

	if openRouterKey == "" {
		log.Fatal("❌ OPENROUTER_API_KEY not set")
	}

	fmt.Println("🧪 Testing ModelRouter with Intelligent Routing\n")
	fmt.Println(strings.Repeat("=", 70))

	// Initialize adapters
	orAdapter := adapters.NewOpenRouterAdapter("", openRouterKey)
	hfAdapter := adapters.NewHuggingFaceAdapter("", hfKey)

	// Create registry and router
	registry := models.NewRegistry(orAdapter, hfAdapter)
	router := models.NewModelRouter(registry)

	fmt.Printf("\n📋 Registry loaded: %d models available\n\n", registry.Count())

	// Test 1: Free-only strategy for simple generation
	fmt.Println("═══ Test 1: Free-Only Strategy ═══")
	testRouting(router, models.RoutingConfig{
		Strategy: models.StrategyFreeOnly,
		Task:     models.TaskGenerate,
	}, "Write a haiku about programming")

	// Test 2: Quality-first for code generation
	fmt.Println("\n═══ Test 2: Highest Quality for Code ═══")
	testRouting(router, models.RoutingConfig{
		Strategy:   models.StrategyHighestQuality,
		Task:       models.TaskCode,
		MinQuality: 0.80,
	}, "Write a Python function to calculate fibonacci numbers")

	// Test 3: Balanced strategy for analysis
	fmt.Println("\n═══ Test 3: Balanced Strategy for Analysis ═══")
	testRouting(router, models.RoutingConfig{
		Strategy:   models.StrategyBalanced,
		Task:       models.TaskAnalyze,
		MaxCost:    0.00001,
		MinQuality: 0.75,
	}, "Explain the concept of machine learning in 50 words")

	// Test 4: Prefer specific provider
	fmt.Println("\n═══ Test 4: Prefer OpenRouter Provider ═══")
	testRouting(router, models.RoutingConfig{
		Strategy:          models.StrategyFreeOnly,
		Task:              models.TaskGenerate,
		PreferredProvider: "openrouter",
	}, "Tell me a short joke")

	// Test 5: Require specific tags
	fmt.Println("\n═══ Test 5: Require 'reasoning' Tag ═══")
	testRouting(router, models.RoutingConfig{
		Strategy:    models.StrategyFreeOnly,
		Task:        models.TaskAnalyze,
		RequireTags: []string{"reasoning"},
	}, "What is quantum entanglement?")

	fmt.Println("\n" + strings.Repeat("=", 70))
	fmt.Println("✅ Router testing complete!")
}

func testRouting(router *models.ModelRouter, config models.RoutingConfig, prompt string) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	fmt.Printf("\n📍 Strategy: %s | Task: %s\n", config.Strategy, config.Task)
	fmt.Printf("📝 Prompt: %s\n", prompt)

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
				MaxTokens:   150,
				Temperature: 0.7,
			},
		},
	}

	startTime := time.Now()
	resp, err := router.RouteAndExecute(ctx, config, req)
	duration := time.Since(startTime)

	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		fmt.Printf("⏱️  Duration: %v\n", duration)
		return
	}

	if !resp.Status.Success {
		fmt.Printf("❌ Failed: %s\n", resp.Status.Message)
		if resp.Error != nil {
			fmt.Printf("   Error: %s\n", resp.Error.Message)
		}
		fmt.Printf("⏱️  Duration: %v\n", duration)
		return
	}

	fmt.Printf("✅ Success!\n")
	fmt.Printf("🤖 Model: %s\n", resp.Result.ModelUsed)
	fmt.Printf("🪙 Tokens: %d\n", resp.Result.TokensUsed)
	fmt.Printf("⏱️  Latency: %dms\n", resp.Result.ProcessingMs)
	fmt.Printf("📊 Quality: %.2f\n", resp.Result.Quality)
	fmt.Printf("💬 Response:\n%s\n", wrapText(resp.Result.Data, 65))
}

func wrapText(text string, width int) string {
	text = strings.TrimSpace(text)
	if len(text) <= width {
		return "   " + text
	}

	var result []string
	words := strings.Fields(text)
	currentLine := ""

	for _, word := range words {
		if len(currentLine)+len(word)+1 <= width {
			if currentLine == "" {
				currentLine = word
			} else {
				currentLine += " " + word
			}
		} else {
			result = append(result, "   "+currentLine)
			currentLine = word
		}
	}

	if currentLine != "" {
		result = append(result, "   "+currentLine)
	}

	return strings.Join(result, "\n")
}
