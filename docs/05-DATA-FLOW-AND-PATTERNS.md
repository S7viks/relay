# GAIOL — Data Flow & Operational Patterns

## End-to-End Request Pipeline

### Phase 1: Request Intake

```
Web Client
    │ Package: query + session ID + feature flags + config
    ▼
API Gateway (httpserver)
    │ Auth middleware: validate bearer token → verify via Supabase → attach user context
    │ Route classification:
    │   ├── Conversational/reasoning → Orchestrator
    │   └── Administrative → Control services
    │ Load conversation history (returning users) OR new session (new users)
    ▼
Query Complexity Scoring
    │ Evaluates: structural complexity, domain specificity, length, context dependence
    ├── Simple factual → single-model, no decomposition (lightweight path)
    └── Complex / multi-step → full pipeline
```

### Phase 2: RAG Context Enrichment (complex queries)

```
Query
    │ Entity extraction + semantic expansion + intent normalization
    ▼
Embedding Engine
    │ Dense vector projection (DPR-style)
    ▼
Vector Index (Supabase pgvector)
    │ Approximate nearest-neighbor search → top-ranked document chunks
    ▼
Prompt Assembly
    │ Retrieved fragments + conversation history + system instructions → structured prompt template
```

### Phase 3: Orchestration + Consensus

```
Decomposed Subtasks T = {t₁, …, tₙ}
    │
    ▼
For each subtask tᵢ:
    │
    ├─ Model Selector
    │   └── Rank candidates by: task fit, historical performance, cost, latency, availability
    │
    ├─ Parallel Model Invocation (via provider-specific adapters)
    │   └── Responses normalized to canonical format + annotated with execution metadata
    │
    ├─ Critic Component
    │   └── Evaluate each response: factual accuracy, logical coherence, completeness, context consistency
    │
    ├─ ABTC Consensus (if multiple responses)
    │   └── Trust-weighted fusion → select or synthesize best response
    │
    └─ Refinement Loop (if quality below threshold)
        └── Re-prompt with alternative models / retrieve more context / reformulate
    
Final Assembly
    │ Subtask outputs → single coherent response
```

### Phase 4: Response Delivery

```
Validated Response
    │
    ├── Cost Metering: token count × pricing → aggregate per query/session/user/org
    │
    ├── Response structure: generated content + citations + execution metadata + cost summary
    │
    ├── Delivery:
    │   ├── Streaming: partial results sent incrementally
    │   └── Non-streaming: full JSON payload
    │
    └── Persistence: full session state saved for auditing + analytics
```

---

## Go Reasoning Orchestrator — Execution Detail

From `internal/reasoning/orchestrator.go`:

```
Incoming reasoning request
    │
    ├── Dynamic model routing (if model set is empty/"auto")
    │
    ├── Optional RAG prompt augmentation (before model execution)
    │
    ├── Parallel model calls
    │   └── First-success bias + timeout protections
    │
    ├── Retry wrapper
    │
    ├── Multi-level fallback (if all selected models fail):
    │   ├── Level 1: Local Ollama probe → Ollama generation
    │   └── Level 2: HuggingFace fallback generation
    │
    └── Emit reasoning events for live WebSocket updates
```

---

## TypeScript Orchestrator Pipeline — Detailed Steps

From `orchestrator/src/orchestration/pipeline.ts`:

```
OrchestratorPipeline.run(request)
    │
    1. Decompose objective
    │   └── HeuristicDecomposer (sentence-split baseline) OR LLM decomposer
    │
    2. Per subtask:
    │
    3.   Fetch trust state for {model × domain} pairs
    │
    4.   Routing plan
    │    └── Candidate pool + diversity rationale
    │
    5.   Optional: beam path exploration + pruning
    │
    6.   Model invocation with retry
    │    └── Observability events emitted at each step
    │
    7.   Score + prune beam candidates
    │
    8.   Consensus selection
    │    └── Mode: abtc | static | uniform
    │
    9.   Trust posterior updates (ABTC with decay + strength params)
    │
    10.  Record trace pieces
    │
    11. Persist final trace (traces.append)
    │
    12. Compute summary metrics
    │
    13. Map + validate v1 response
    └── Return
```

---

## Frontend Query Submission Flow

```javascript
// main.js
handleQuerySubmit()
    └── executeReasoningQuery()
        │
        1. Add user chat bubble to UI
        2. Add assistant placeholder bubble
        3. POST /api/reasoning/start → get session ID
        4. Subscribe to WebSocket /api/reasoning/ws?session={id}
        │
        On WebSocket events:
        ├── reasoning_start → show "Analyzing..." status
        ├── decomposition → show subtask breakdown
        ├── model_selected → show which models are being used
        ├── step_complete → update progress
        ├── reasoning_end → 
        │   ├── Display final output in assistant bubble
        │   ├── Persist to history
        │   └── Refresh sidebar
        └── error → show error state
```

---

## Multi-Tenant Data Isolation Pattern

```
Every HTTP request
    │
    └── Auth middleware → attach user identity to context
            │
            └── Database queries → inject tenant context
                    │
                    └── Row-Level Security in Postgres
                            └── SELECT policies: WHERE org_id = current_tenant()
```

The function `current_tenant()` is set in Supabase via the tenant context helper (`WithTenant`). All core tables have RLS enabled.

---

## TS Orchestrator Contract (Go ↔ TS)

The Go backend sends v1 contract requests to the TS orchestrator:

```json
{
  "schema_version": "1.0",
  "trace_id": "...",
  "task_kind": "...",
  "constraints": {
    "temperature": 0.7,
    "max_tokens": 1000
  },
  "consensus_mode": "abtc",
  "beam_width": 3,
  "explore_paths": true
}
```

Contract validation is bidirectional — AJV schemas enforce both request and response shapes. A `ContractValidationError` is thrown on schema violations.

---

## Background Operations

Runs outside the request path:

1. **Metric refresh**: Aggregate query metrics → refine routing strategies and hyperparameters
2. **Document ingestion**: Chunking → embedding → incremental knowledge-base updates
3. **Registry refresh**: Model registry updated when new models appear or pricing changes
4. **Admin operations**: User management, policy configuration, model availability — run async
5. **Error handling subsystem**:
   - Classifies failures: transient, authentication, configuration, resource exhaustion
   - Recovery strategies: retry with backoff, failover routing, graceful degradation
   - Checkpointed session state for partial failure recovery
6. **Real-time dashboards**: Performance, usage, cost metrics + alerting

---

## Key Design Patterns

### Provider Adapter Pattern
Every LLM provider adapter implements the same `ModelAdapter` interface. Adding or swapping a provider requires no changes to orchestration logic — only a new adapter file.

### Event-Driven Reasoning
The reasoning subsystem emits observable events at every stage, enabling:
- Asynchronous processing
- Loose coupling between components
- Complete audit trails
- Live WebSocket updates to the frontend

### No-Auth / Auth Mode Switch
The entire system can run with or without Supabase auth via env flags, making local development frictionless without requiring cloud infrastructure.

### Stateless Architecture
The Go reasoning pipeline is stateless and horizontally partitionable. Multiple Go instances can serve requests behind a load balancer. The TS orchestrator also targets stateless design (in-memory state is per-process, durable via file trust store if needed).

### Graceful Degradation
Multi-level fallback in the Go orchestrator:
1. Primary model selection
2. First-success from parallel execution
3. Local Ollama
4. HuggingFace

This means the system continues to serve responses even when primary providers fail.

---

## Cost Tracking Architecture

```
Model invocation
    └── Provider-specific pricing table lookup
            └── token_count × price_per_token = query_cost
                    │
                    ├── Per-query tracking → api_queries.usage_tokens / cost
                    ├── Per-session aggregation → reasoning_sessions.total_cost
                    ├── Per-user rollup
                    └── Per-org rollup
                    
Budget enforcement
    └── IntelligentRouter: check budget constraint before dispatching multi-model fan-out
            └── Simple queries → single cost-efficient model
            └── Complex queries → multi-model fan-out (up to budget)
```

4 routing strategies available: minimum-cost, quality-weighted, adaptive, budget-constrained.
