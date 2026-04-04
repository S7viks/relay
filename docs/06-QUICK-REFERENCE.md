# GAIOL — Quick Reference & Known Issues

## File Index (Key Files at a Glance)

### Go Backend — Most Important Files
| File | Why It Matters |
|---|---|
| `cmd/web-server/main.go` | **Primary entrypoint** — boot order, env, auth mode, model registry, all wiring |
| `internal/httpserver/register.go` | **Route map** — complete API surface |
| `internal/httpserver/handlers.go` | **All HTTP handlers** — very large, core logic |
| `internal/httpserver/ts_orchestrator.go` | **Go→TS delegation** — smart query bridge |
| `internal/reasoning/orchestrator.go` | **Core AI execution** — parallel models, fallback, events |
| `internal/reasoning/consensus.go` | **Go-side consensus** logic |
| `internal/models/registry.go` | **Model catalog** — registration + query |
| `internal/gaiol/orchestratorcontract/v1/client.go` | **TS client** — HTTP calls to /v1/orchestrate |

### TypeScript Orchestrator — Most Important Files
| File | Why It Matters |
|---|---|
| `orchestrator/src/api/server.ts` | **TS entrypoint** — Fastify server + route handlers |
| `orchestrator/src/orchestration/pipeline.ts` | **Core TS pipeline** — full run loop |
| `orchestrator/src/consensus/abtc.ts` | **ABTC implementation** — Beta math + updates |
| `orchestrator/src/contract/v1/wire-types.ts` | **Go↔TS contract** types |
| `orchestrator/src/persistence/memory-store.ts` | **Default stores** — in-memory (not durable) |

### Frontend — Most Important Files
| File | Why It Matters |
|---|---|
| `dashboard/src/` | **Unified React SPA** (Vite); built to `dashboard/dist/`, served by Go at **`/`** (`/assets/*` for bundles) |
| `web/README.md` | Notes: static `web/` UI removed; use `archive/web-legacy/` for historical HTML/JS |
| `archive/web-legacy/` | Archived pre-React HTML/JS SPA (inactive) |

---

## Known Issues & Limitations

### In the Codebase

1. **TS orchestrator uses in-memory stores by default**  
   Trust scores and traces are lost on process restart. `FileTrustRepository` exists but isn't default in `server.ts`. Must be explicitly wired.

2. **Vector insert path marked unimplemented**  
   In `internal/database/vector.go`: the insert path exists but is marked as unimplemented. RAG retrieval works, but programmatic document ingestion via Go may not.

3. **Windows-first automation**  
   Most scripts are `.ps1` or `.bat`. Unix has `start.sh` and `test_agent.sh` / `test_world_model.sh` but full parity is incomplete.

4. **Schema lacks tenant columns on some tables**  
   `documents`, `model_performance`, `world_model_facts` are currently global in migrations (no tenant column / RLS). These rely on application-level partitioning assumptions.

5. **TeX build requires missing dependencies**  
   `_archive/research-presentation/poster/gaiol-iop.log` (when present) may show `logreq.sty` missing (biblatex workflow). The paper uses a fallback in `gaiol-iop.tex` for `algpseudocode.sty` and `iopjournal.cls`, so it may compile but with degraded formatting without those packages.

6. **Figures referenced but not in repo**  
   The paper references figure files (`figs/Figure_2.png`, `figs/Figure_3.png`, `figs/5.1.png`, `figs/5.4.png`, `figs/consensus_voting.png`, author photos) that have placeholder `\fbox{Missing file}` fallbacks in the TeX.

### In the Research Paper

1. **Synthetic benchmark** — not evaluated on standard benchmarks (MMLU, HumanEval, MT-Bench) directly; planned for future work
2. **GPT-4 evaluator bias** — self-preference risk; human annotation only 10% of benchmark
3. **Single-node experiments** — throughput/latency numbers are single-node Azure D8s_v3
4. **ABTC stationarity assumption** — abrupt model changes not handled (change-point detection planned)
5. **Federated/governance/world model** — architectural provisions only, not empirically validated

---

## Glossary

| Term | Meaning |
|---|---|
| GAIOL | Global Artificial Intelligence Operating Layer |
| ABTC | Adaptive Bayesian Trust-Weighted Consensus |
| UAIP | Universal AI Protocol — canonical message format across adapters |
| Beam Width (k) | Number of reasoning paths kept alive at each step (default: 3) |
| k_models | Number of models selected per subtask step (default: 3) |
| λ (lambda) | Temporal decay factor in ABTC (default: 0.98, window ≈ 50 interactions) |
| Trust prior | Beta(1,1) — uniform, non-informative initialization for new models |
| TS Orchestrator | The TypeScript-based advanced orchestration service (optional) |
| Go Orchestrator | The Go-based internal reasoning orchestrator (always available) |
| Tenant | An organizational context (multi-tenant platform) |
| RLS | Row-Level Security in PostgreSQL — enforces tenant isolation |
| RAG | Retrieval-Augmented Generation |
| DPR | Dense Passage Retrieval — embedding approach for RAG |
| Sys-1 through Sys-5 | Paper's system labels: GAIOL, Direct API, LangChain, OpenRouter, Multi-Wrapper |

---

## Consensus Modes (TS Orchestrator)

| Mode | Behavior |
|---|---|
| `abtc` | Full Adaptive Bayesian Trust-Weighted Consensus — per-model, per-domain Beta trust with decay |
| `static` | Static hand-tuned weights |
| `uniform` | Equal weights for all models |

Configure via `GAIOL_CONSENSUS_MODE` env var.

---

## Routing Strategies

| Strategy | Behavior |
|---|---|
| Minimum cost | Route to cheapest model that satisfies task |
| Quality-weighted | Weight cost vs. historical quality |
| Adaptive | Dynamic adjustment based on recent performance |
| Budget-constrained | Hard cap on per-query spend |

---

## Test Infrastructure

### Go Tests
```bash
make test                              # Unit tests
# Build-tagged integration tests:
go test -tags=integration ./internal/integration/...
# Requires TS orchestrator running first
```

### TypeScript Tests (Vitest)
```bash
cd orchestrator && npm test
# Key test files:
# pipeline.test.ts, beam-pipeline.test.ts, abtc.test.ts,
# engine.test.ts (consensus), scorer.test.ts, retry.test.ts
```

### Integration Scripts (Windows)
```powershell
scripts/test/integration.ps1           # HTTP smoke tests
scripts/test/reasoning-start.ps1       # Reasoning /start smoke (-Raw for JSON)
scripts/test/go-ts-orchestrator-integration.ps1  # End-to-end with TS orchestrator
scripts/test/ollama.ps1                # Local Ollama integration
```

---

## Paper Compilation (archived sources)

Manuscript sources live under `_archive/research-presentation/poster/`, not in the runtime tree.

```bash
cd _archive/research-presentation/poster

# Standard IOP compile sequence:
pdflatex gaiol-iop
bibtex gaiol-iop
pdflatex gaiol-iop
pdflatex gaiol-iop

# Requirements:
# - iopjournal.cls
# - references.bib (generated by ../expand-bibtex.mjs from references_input.bib)
# - figs/ directory with figure PNG/JPG files
# - logreq.sty may be missing locally (see build log)
```

To enrich the bibliography (from `_archive/research-presentation/`):

```bash
cd _archive/research-presentation
node expand-bibtex.mjs
```
