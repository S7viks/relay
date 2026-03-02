package main

import (
	"context"
	"fmt"
	"time"

	"gaiol/internal/reasoning"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	router := reasoning.NewMockRouter()
	workflow := reasoning.NewSimpleAgentWorkflow(router, "test-session", nil)

	workflow.OnEvent = func(evt reasoning.ReasoningEvent) {
		fmt.Printf("EVENT: %s - %v\n", evt.Type, evt.Payload)
	}

	result, err := workflow.Execute(ctx, "Explain quantum computing in simple terms")
	if err != nil {
		fmt.Printf("Workflow error: %v\n", err)
		return
	}

	fmt.Printf("\n--- FINAL OUTPUT ---\n%s\n", result.FinalOutput)
	fmt.Printf("Steps: %d, Duration: %v\n", len(result.Steps), result.Duration)
	for i, s := range result.Steps {
		fmt.Printf("%d) %s - %s\n", i+1, s.Phase, s.Output)
	}
}
