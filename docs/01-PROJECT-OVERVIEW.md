# GAIOL — Project Overview

## What Is GAIOL?

**GAIOL** (Global Artificial Intelligence Operating Layer) is both a **research system** and a **working software platform**. It is a layered AI orchestration framework that coordinates multiple heterogeneous Large Language Model (LLM) providers behind a single uniform interface, decomposes complex queries into parallelizable subtasks, and aggregates multi-model responses through an adaptive Bayesian consensus algorithm.

The project has two parallel artefacts:
1. **A live codebase** — a full-stack hybrid Go/TypeScript/JavaScript platform that implements the system.
2. **An academic manuscript** (`gaiol-iop.tex`) — an IOP-journal-formatted research paper documenting the architecture, algorithms, and experimental results, authored by students and faculty at B. V. Raju Institute of Information Technology and SRM University AP, Hyderabad/Amaravati, India.

---

## Authors (Paper)

| Name | Role | Affiliation |
|---|---|---|
| Ch. Sai Sathvik | Conceptualization, Software, Validation | BVRIT, Hyderabad |
| D. V. S. Monish Kumar | Conceptualization, Software, Validation | BVRIT, Hyderabad |
| Abhishek Vinod | Methodology, Investigation | BVRIT, Hyderabad |
| Ramdas Kapila (corresponding) | Supervision, Project admin | BVRIT, Hyderabad |
| Sumalatha Saleti | Supervision | SRM University AP, Amaravati |

Contact: kapilaramdas@gmail.com

---

## Core Problem Being Solved

Modern AI deployments use multiple LLMs, retrieval pipelines, and autonomous agents but orchestrate them through **ad-hoc brittle scripts** that have no principled mechanisms for:
- Model selection based on task type and performance history
- Quality assurance across heterogeneous providers
- Cross-provider coordination
- Governance, auditing, and compliance

GAIOL addresses this with an **OS-like abstraction** for AI: managing models, agents, and data through standardized interfaces the same way traditional operating systems manage computation, memory, and inter-process communication.

---

## What GAIOL Is NOT (Scope Limits)

The paper is explicit about what is evaluated vs. what is merely designed:

| Capability | Status |
|---|---|
| Orchestration + ABTC consensus | **Evaluated** — core contribution |
| Universal AI Protocol Layer | **Implemented** — in codebase, not benchmarked |
| Session state / conversation history | **Implemented** — not world-model-level |
| Vector store + RAG | **Implemented** |
| RBAC + multi-tenant isolation | **Implemented** |
| Continuous world model | **Designed only** — future work |
| Federated data mesh | **Designed only** — future work |
| Cross-organizational governance engine | **Designed only** — future work |

---

## Key Numerical Results (from 500-query benchmark)

- **Overall quality score**: 0.83 ± 0.02 (vs. 0.67 for single-model baseline, 0.72 for LangChain)
- **Improvement over single-model**: +24%
- **Improvement over LangChain**: +13%
- **Success rate**: 95.2%
- **Orchestration overhead**: 5 ms per query
- **Per-query cost**: ~$0.003 (comparable to single-model at ~$0.002)
- **Throughput**: 200 req/s under 100 concurrent clients

### ABTC Ablation (quality scores by domain)

| Domain | Static-Equal | Static-Tuned | ABTC |
|---|---|---|---|
| Analytical Reasoning | 0.79 | 0.81 | **0.86** |
| Code Generation | 0.76 | 0.80 | **0.85** |
| Multi-step Problem | 0.77 | 0.79 | **0.84** |
| Knowledge Retrieval | 0.80 | 0.82 | **0.85** |
| Creative Synthesis | 0.72 | 0.74 | **0.79** |

ABTC wins with p < 0.01 (paired t-test) across all domains.

---

## Repository Structure (High Level)

```
/
├── cmd/                    # Go binary entrypoints (web-server, run-agent-test)
├── internal/               # Go backend packages (76 files)
│   ├── auth/               # Supabase auth middleware + context
│   ├── database/           # DB client, tenant isolation, vector store
│   ├── httpserver/         # HTTP handlers, route registration, TS bridge
│   ├── keys/               # Encrypted API key management
│   ├── models/             # Model registry, router, adapters, performance tracker
│   │   └── adapters/       # OpenRouter, HuggingFace, Ollama, Gemini, Anthropic, OpenAI
│   ├── monitoring/         # Metrics service
│   ├── reasoning/          # Core intelligence: decompose→execute→score→consensus
│   ├── uaip/               # Universal AI Protocol DTOs
│   ├── gaiol/              # Model resolve, contracts, orchestrator v1 client
│   └── integration/        # Cross-service integration tests
├── orchestrator/           # TypeScript orchestration service (88 files)
│   └── src/
│       ├── api/            # Fastify server (/health, /v1/orchestrate, /v1/traces)
│       ├── orchestration/  # Core pipeline: decompose→route→invoke→consensus→trace
│       ├── routing/        # Model scoring, diversity selection, routing plan
│       ├── consensus/      # ABTC algorithm, beam pruning, trust updates
│       ├── decomposition/  # Heuristic + LLM-based query decomposition
│       ├── providers/      # OpenAI, Anthropic, Gemini adapters + mock
│       ├── persistence/    # In-memory + file-backed trust/trace stores
│       ├── observability/  # Events, trace, replay, metrics summary, pino logger
│       ├── contract/v1/    # Wire types, AJV validators, request/response mapping
│       ├── domain/         # Core IDs, task models, trust records
│       └── config/         # Env-based registry, adapter construction
├── web/                    # Placeholder README (static UI removed; see archive/web-legacy)
├── migrations/             # Supabase SQL schema migrations (14 files)
├── scripts/                # Dev/ops/test automation (mostly PowerShell)
├── dashboard/              # Optional Vite/React admin UI
├── docs/                   # Documentation (index: docs/README.md; canonical 01–06 series)
├── _archive/               # Local only (gitignored): poster/LaTeX, planning docs, build clutter
└── Dockerfile, Makefile, package.json, .env.example, README.md
```
