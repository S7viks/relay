# Simplified GAIOL Architecture

## Overview

The GAIOL reasoning engine has been simplified to focus on the core flow:
**Decompose → Beam Search → Best Path → Combined Output**

## Core Flow

```
1. User enters prompt
   ↓
2. Decompose prompt into logical steps
   ↓
3. For each step:
   a. Run multiple models in parallel
   b. Score all outputs
   c. Use beam search to explore paths
   d. Keep top N paths (beam width)
   ↓
4. Select best path (highest cumulative score)
   ↓
5. Combine outputs from best path into final result
```

## Simplified Components

### 1. ReasoningEngine (`engine.go`)
**Removed:**
- ❌ Reflection/Critic/Refiner (too complex)
- ❌ Complex reflection loops
- ❌ Output refinement iterations

**Kept:**
- ✅ Decomposer (breaks prompt into steps)
- ✅ Orchestrator (runs models in parallel)
- ✅ Scorer (evaluates outputs)
- ✅ Beam Search (explores multiple paths)
- ✅ Consensus (optional, for reconciling disagreements)
- ✅ Composer (combines final output)

### 2. Beam Search Flow

**How it works:**
1. **First Step**: Start with empty path, run all models, create initial paths
2. **Subsequent Steps**: 
   - For each active path, run all models
   - Create new paths by extending each active path with each model output
   - Score all new paths
   - Keep top N paths (beam width = 3 by default)
3. **Final Selection**: Best path is the one with highest cumulative score

**Benefits:**
- Explores multiple reasoning paths simultaneously
- Finds best combination of model outputs across steps
- Balances exploration vs. computation cost

### 3. Consensus (Optional)

When enabled, consensus helps reconcile disagreements between models:
- **Majority Voting**: Simple voting mechanism
- **Weighted Voting**: Votes weighted by model scores
- **Meta-Agent**: Uses another LLM to synthesize best answer

**Default:** Enabled with Meta-Agent strategy

## Configuration

### Beam Search Config
```go
BeamConfig{
    Enabled:   true,  // Always enabled by default
    BeamWidth: 3,     // Keep top 3 paths
}
```

### Consensus Config
```go
ConsensusConfig{
    Enabled:   true,  // Enabled by default
    Strategy:  "meta_agent",
    MetaModel: "openrouter:google/gemini-2.0-flash-exp:free",
    Threshold: 0.6,
}
```

## Auto-Model Selection

If no models provided, automatically selects 4 free models:
1. `google/gemini-2.0-flash-exp:free`
2. `google/gemini-flash-1.5:free`
3. `meta-llama/llama-3.2-3b-instruct:free`
4. `mistralai/mistral-7b-instruct:free`

## API Usage

### Start Reasoning Session
```json
POST /api/reasoning/start
{
  "prompt": "Your complex task here",
  "models": [],  // Optional: empty = auto-select
  "beam": {      // Optional: override beam config
    "enabled": true,
    "beam_width": 3
  }
}
```

### Response
```json
{
  "session_id": "uuid-here"
}
```

### WebSocket Events
- `decompose_start` - Decomposition begins
- `decompose_end` - Steps created
- `step_start` - Step processing begins
- `model_response` - Model output received
- `beam_update` - Beam search path update
- `consensus` - Consensus reached (if enabled)
- `step_end` - Step completed
- `reasoning_end` - Final output ready

## Key Simplifications

### Before (Complex)
- Multiple reflection loops
- Critic validation
- Output refinement iterations
- Complex state management
- Multiple selection algorithms

### After (Simple)
- Single beam search flow
- Direct path selection
- Optional consensus
- Clean state management
- Focused on best path finding

## Benefits

1. **Simpler Code**: Easier to understand and maintain
2. **Faster Execution**: No reflection loops = faster results
3. **Better Results**: Beam search finds better paths than greedy
4. **More Predictable**: Clear flow, easier to debug
5. **Still Powerful**: Beam search + consensus = high quality outputs

## File Structure

```
internal/reasoning/
├── engine.go          # Main engine (simplified)
├── memory.go          # Session & path management
├── decomposer.go      # Prompt decomposition
├── orchestrator.go    # Parallel model execution
├── scorer.go          # Output scoring
├── selector.go        # Path selection (simplified)
├── consensus.go       # Optional consensus
├── composer.go        # Final output assembly
├── handlers.go        # HTTP/WebSocket handlers
└── types.go           # Data structures
```

## Next Steps

The codebase is now focused on:
1. ✅ Beam search for path exploration
2. ✅ Best path selection
3. ✅ Combined output generation

All unnecessary complexity has been removed while maintaining the core functionality.
