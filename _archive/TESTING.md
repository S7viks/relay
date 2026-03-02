# GAIOL Testing Guide

## Overview
This document provides comprehensive information about testing the GAIOL Multi-Agent Reasoning Engine.

## Test Organization

### Unit Tests
Located in each package with `*_test.go` files:

- **`internal/reasoning/types_test.go`** - Core data structures
- **`internal/reasoning/memory_test.go`** - Memory management
- **`internal/reasoning/scorer_test.go`** - Scoring algorithms
- **`internal/reasoning/critic_test.go`** - Critic evaluation
- **`internal/reasoning/consensus_test.go`** - Consensus mechanisms
- **`internal/reasoning/decomposer_test.go`** - Prompt decomposition
- **`internal/models/router_test.go`** - Model routing

### Integration Tests
- **`internal/reasoning/integration_test.go`** - Full pipeline tests
- **`internal/reasoning/handlers_test.go`** - API endpoint tests

## Running Tests

### Run All Tests
```powershell
# Run all tests with verbose output
go test -v ./...

# Run tests in a specific package
go test -v ./internal/reasoning

# Run a specific test
go test -v ./internal/reasoning -run TestSharedMemoryInitialization
```

### Generate Coverage Report
```powershell
# Generate coverage profile
go test -coverprofile=coverage.out ./...

# View coverage in HTML
go tool cover -html=coverage.out

# Display coverage summary
go test -cover ./...
```

### Run Tests with Race Detection
```powershell
# Detect race conditions
go test -race ./...
```

### Run Benchmarks
```powershell
# Run benchmark tests
go test -bench=. ./...

# Run specific benchmark
go test -bench=BenchmarkScorer ./internal/reasoning
```

## Test Categories

### 1. Unit Tests (Fast)
- Test individual functions and methods
- Use mocks for external dependencies
- Should run in < 1 second per package

### 2. Integration Tests (Medium)
- Test interactions between components
- May use mock adapters
- Should run in < 10 seconds

### 3. End-to-End Tests (Slow)
- Test complete reasoning workflows
- May require real API keys
- Run manually or in CI/CD

## Continuous Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      - run: go test -v -race -coverprofile=coverage.out ./...
      - run: go tool cover -func=coverage.out
```

## Writing New Tests

### Test Template
```go
package reasoning

import "testing"

func TestFeatureName(t *testing.T) {
    // Arrange
    input := "test input"
    expected := "expected output"
    
    // Act
    result := YourFunction(input)
    
    // Assert
    if result != expected {
        t.Errorf("Expected %s, got %s", expected, result)
    }
}
```

### Table-Driven Tests
```go
func TestMultipleScenarios(t *testing.T) {
    tests := []struct {
        name     string
        input    string
        expected string
    }{
        {"scenario 1", "input1", "output1"},
        {"scenario 2", "input2", "output2"},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := YourFunction(tt.input)
            if result != tt.expected {
                t.Errorf("Expected %s, got %s", tt.expected, result)
            }
        })
    }
}
```

## Coverage Goals

| Component | Target Coverage | Priority |
|-----------|----------------|----------|
| Core Types | 90%+ | High |
| Memory Manager | 85%+ | High |
| Scorer | 80%+ | High |
| Orchestrator | 80%+ | High |
| Router | 85%+ | High |
| Consensus | 75%+ | Medium |
| Critic | 75%+ | Medium |
| API Handlers | 70%+ | Medium |
| Integration | 60%+ | Low |

## Troubleshooting

### Common Issues

#### Import Errors
```powershell
# Ensure module is initialized
go mod tidy
go mod download
```

#### Test Timeout
```powershell
# Increase timeout for slow tests
go test -timeout 30s ./...
```

#### Mock Data
```go
// Use test helpers for consistent mock data
func getMockOutput() ModelOutput {
    return ModelOutput{
        ModelID: "test-model",
        Response: "Mock response",
        Scores: MetricScores{Overall: 0.85},
    }
}
```

## Environment Variables for Testing

```powershell
# Set test environment
$env:GAIOL_ENV = "test"
$env:GAIOL_LOG_LEVEL = "debug"

# Optional: Real API keys for integration tests
$env:OPENAI_API_KEY = "your-openai-key-here"
$env:ANTHROPIC_API_KEY = "your-anthropic-key-here"
```

## Quick Test Commands

```powershell
# Fast unit tests only
make test

# Full suite with coverage
make coverage

# Integration tests (requires setup)
go test -v ./internal/reasoning -run Integration

# Smoke test
go run cmd/test-reasoning-engine/main.go
```

## Best Practices

1. **Keep tests independent** - Each test should run in isolation
2. **Use table-driven tests** - For multiple similar scenarios
3. **Test edge cases** - Empty inputs, nil values, boundaries
4. **Mock external services** - Don't rely on real APIs in unit tests
5. **Clear test names** - `TestFeatureUnderSpecificCondition`
6. **Arrange-Act-Assert** - Structure tests clearly
7. **Use sub-tests** - For better organization and failure reporting
8. **Add helpful error messages** - Make failures easy to debug
9. **Test concurrency** - Use `-race` flag to detect issues
10. **Maintain coverage** - Aim for 80%+ on critical paths

## Performance Testing

### Benchmark Example
```go
func BenchmarkScorer(b *testing.B) {
    scorer := NewScorer(nil, nil)
    scores := MetricScores{
        Relevance: 0.9,
        Coherence: 0.85,
        // ...
    }
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        scorer.calculateWeightedScore(scores, "balanced")
    }
}
```

### Load Testing
```powershell
# Test concurrent sessions
go test -run TestConcurrent -count=10 -parallel=5
```

## Next Steps

- [ ] Add integration tests for WebSocket communication
- [ ] Implement database migration tests
- [ ] Add E2E tests with real browser
- [ ] Set up CI/CD pipeline
- [ ] Add performance regression tests
