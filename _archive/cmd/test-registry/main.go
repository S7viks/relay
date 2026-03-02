package main

import (
    "fmt"
    "os"
    "strings"

    "gaiol/internal/models"
    "gaiol/internal/models/adapters"
)

func main() {
    openRouterKey := os.Getenv("OPENROUTER_API_KEY")
    hfKey := os.Getenv("HUGGINGFACE_API_KEY")

    // Initialize adapters
    orAdapter := adapters.NewOpenRouterAdapter("", openRouterKey)
    hfAdapter := adapters.NewHuggingFaceAdapter("", hfKey)

    // Create registry
    registry := models.NewRegistry(orAdapter, hfAdapter)

    fmt.Println("🎯 GAIOL Model Registry Test\n")
    fmt.Println(strings.Repeat("=", 60))

    // Test 1: Count models
    fmt.Printf("\n📊 Total models registered: %d\n", registry.Count())

    // Test 2: List all models
    fmt.Println("\n📋 All registered models:")
    for _, model := range registry.ListModels() {
        fmt.Printf("   - %s (%s) | Quality: %.2f | Cost: $%.6f | Tags: %v\n",
            model.DisplayName,
            model.Provider,
            model.QualityScore,
            model.CostInfo.CostPerToken,
            model.Tags,
        )
    }

    // Test 3: Find free models
    freeModels := registry.FindFreeModels()
    fmt.Printf("\n💰 Free models: %d\n", len(freeModels))
    for _, m := range freeModels {
        fmt.Printf("   - %s (%s)\n", m.DisplayName, m.Provider)
    }

    // Test 4: Find models by task
    codeModels := registry.FindModelsByTask(models.TaskCode)
    fmt.Printf("\n💻 Models for coding: %d\n", len(codeModels))
    for _, m := range codeModels[:min(5, len(codeModels))] {
        fmt.Printf("   - %s (Quality: %.2f)\n", m.DisplayName, m.QualityScore)
    }

    // Test 5: Find by provider
    orModels := registry.FindModelsByProvider("openrouter")
    hfModels := registry.FindModelsByProvider("huggingface")
    fmt.Printf("\n🔌 OpenRouter models: %d\n", len(orModels))
    fmt.Printf("🔌 HuggingFace models: %d\n", len(hfModels))

    fmt.Println("\n" + strings.Repeat("=", 60))
    fmt.Println("✅ Registry test complete!")
}

func min(a, b int) int {
    if a < b {
        return a
    }
    return b
}
