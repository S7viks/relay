# GAIOL project report pack

This document implements the **Project report: screenshots, values, and performance metrics** plan. Use it when assembling the written report and evidence for your team or course. Source poster: `poster/GAIOL_poster.tex`.

**Figure:** Place the system architecture image at `poster/figures/Figure_2.png` (see `poster/README.md`). It is not in the repository yet; compile the poster after adding it, or embed the same figure from your manuscript.

---

## Part A — Poster and manuscript content (copy into report)

*Label every numeric claim in your final document as **poster/manuscript** unless you reproduced the benchmark yourself.*

### Title and venue

- **Title:** Global Artificial Intelligence Operating Layer — Adaptive Bayesian Consensus for Multi-Model LLM Orchestration  
- **Venue (poster):** *Engineering Applications of Artificial Intelligence*  
- **Authors (poster):** Ch. Sai Sathvik, D. V. S. Monish Kumar, Abhishek Vinod, Ramdas Kapila, Sumalatha Saleti (affiliations as on poster)

### Abstract (poster text)

Modern AI deployments rely on multiple LLMs and agents but are orchestrated via ad-hoc scripts without principled model selection or cross-provider consensus. GAIOL is a layered orchestration framework that coordinates heterogeneous LLM providers behind a uniform interface, decomposes complex queries into parallelizable subtasks, and aggregates responses through **Adaptive Bayesian Trust-Weighted Consensus (ABTC)**. ABTC maintains per-model, per-domain Beta-distributed trust variables updated online after each consensus round. On a **500-query** benchmark (five domains below), GAIOL achieves overall quality **0.83 ± 0.02** (**24%** above single-model, **13%** above LangChain), **95.2%** success rate, and **5 ms** orchestration overhead. An ablation study reports ABTC yields statistically significant gains over uniform and hand-tuned static consensus (**p < 0.01**) across all five domains.

### Problem and contributions

1. **Layered orchestration architecture:** provider-agnostic interface, Universal AI Protocol, adapter-based integration; provisions for federated data and governance.  
2. **Global orchestrator:** beam-search task decomposition, strategy-based model routing, multi-model response assembly.  
3. **ABTC algorithm:** per-model, per-domain trust learned online via Beta–Bernoulli updates, replacing static consensus weights.

### System architecture (narrative)

GAIOL follows a layered design: Presentation (web, API gateway); Business Logic (reasoning engine, orchestration, RAG, consensus); Data Access (multi-tenant storage, vector search); External Integration (Gemini, Hugging Face, OpenRouter adapters). Reasoning pipeline: **decomposition → model selection → parallel inference → scoring → ABTC consensus → verification.**

### Algorithmic framework

**Five phases:**

1. Decomposition: \(Q \rightarrow T = \{t_1,\ldots,t_n\}\)  
2. Smart orchestration: map each \(t_i\) to a subset of models \(\mathcal{M} \subset \mathcal{R}\)  
3. Heterogeneous inference: parallel candidates \(C_i\)  
4. Consensus: scoring function \(f_{\mathrm{score}}(C_i)\) with ABTC  
5. Verification against persistent storage  

**ABTC (as stated on poster).** For each model–domain pair \((m,d)\), trust \(\tau_m^{(d)} \sim \mathrm{Beta}(\alpha_m^{(d)}, \beta_m^{(d)})\); posterior mean \(\hat{\tau}_m^{(d)} = \alpha/(\alpha+\beta)\). After each round, winner \(m_w\) gets success, others failure, with decay **λ = 0.98**:

- \(\alpha_m^{(d)} \leftarrow \lambda \alpha_m^{(d)} + \mathbb{1}[m=m_w]\)  
- \(\beta_m^{(d)} \leftarrow \lambda \beta_m^{(d)} + \mathbb{1}[m \neq m_w]\)  

Candidate score: \(s_i = w_q s_i^{\mathrm{quality}} + w_a s_i^{\mathrm{agree}} + w_t \hat{\tau}_i\). If confidence \(< \theta_{\min}\), synthesize from top-3.

**Model selection fitness (poster):**

\(\mathrm{fitness}(m,t) = 0.4\,\mathrm{CapMatch} + 0.4\,\mathrm{HistAcc} + 0.2(1-\hat{c}_m)\)

**SelectDiverseTop:** provider diversity with **k_models = 3**, beam **k = 3**.

### Evaluation protocol (poster)

| Item | Detail |
|------|--------|
| Benchmark size | **500** queries |
| Domains (100 each) | Analytical reasoning, code generation, multi-step problem solving, knowledge retrieval, creative synthesis |
| Query shape | 2–5 steps per query; context retrieval and cross-model validation |
| Quality judge | GPT-4 as automated evaluator (LLM-as-judge) |
| Human validation | **50** responses human-annotated; Cohen’s **κ = 0.74**, Pearson **r = 0.82** vs human (**p < 0.001**) |
| Hardware | Azure **Standard_D8s_v3** (8 vCPU, 32 GB RAM) |
| Repetitions | **10** runs per configuration; **95%** CI |

**Baselines:** S-1 GAIOL; S-2 Direct API (single GPT-4); S-3 LangChain (ReAct + FAISS); S-4 OpenRouter (default routing); S-5 Multi-Wrapper (GPT-4 + Gemini Pro, confidence-based).

### Main results table (poster / manuscript)

| Metric | S-1 (GAIOL) | S-2 | S-3 | S-4 | S-5 |
|--------|-------------|-----|-----|-----|-----|
| Quality | **0.83** | 0.67 | 0.72 | 0.67 | 0.62 |
| Success (%) | **95.2** | 92.0 | 94.5 | 93.8 | 90.5 |
| Latency (ms) | 450 | 400 | 800 | 420 | 600 |
| Overhead (ms) | **5** | 0 | 50 | 2 | 10 |

Poster notes: GAIOL **5 ms** orchestration overhead; per-query cost **~$0.003** (comparable to single-model).

### Ablation table (poster / manuscript)

| Domain | Equal | Tuned | ABTC |
|--------|-------|-------|------|
| Analytical | 0.79 | 0.81 | **0.86** |
| Code Gen. | 0.76 | 0.80 | **0.85** |
| Multi-step | 0.77 | 0.79 | **0.84** |
| Knowledge | 0.80 | 0.82 | **0.85** |
| Creative | 0.72 | 0.74 | **0.79** |
| **Overall** | 0.77 | 0.79 | **0.83** |

Poster: **p < 0.01** vs static methods; largest gains in code generation (+9 pp) and creative synthesis (+7 pp). Trust posteriors differ by domain (e.g. GPT-4 \(\hat{\tau}\approx 0.82\) analytical vs 0.61 creative; Gemini inverse).

### References (poster)

1. P. Lewis et al., RAG for Knowledge-Intensive NLP, NeurIPS 2020.  
2. J. Wei et al., Chain-of-Thought Prompting, NeurIPS 2022.  
3. S. Yao et al., ReAct, ICLR 2023.  
4. Q. Wu et al., AutoGen, ICLR 2024.  
5. O. Chapelle & L. Li, Thompson Sampling, NeurIPS 2011.  
6. H. Chase, LangChain, GitHub 2022.  
7. P. Liang et al., Holistic evaluation of language models, TMLR 2023.  
8. OpenAI, GPT-4 Technical Report, 2023.

---

## Part B — Implementation vs poster (ABTC)

*Include this subsection (or a shortened version) in your report so manuscript claims and code stay aligned.*

| Poster concept | Repository implementation |
|----------------|----------------------------|
| ABTC: Beta \((\alpha,\beta)\) per (model, domain), online updates with λ decay | **Not implemented** as Beta–Bernoulli state in Go. |
| Consensus after scoring | **Implemented:** `internal/reasoning/engine.go` invokes `ConsensusAgent.Reconcile` when consensus is enabled. |
| Trust-weighted scoring \(w_q, w_a, w_t\) with \(\hat{\tau}\) | **Partially reflected** via per-output `Scores.Overall` and agreement; **no** persistent Beta trust per domain in this package. |
| Meta-reasoner / synthesis | **Implemented:** `internal/reasoning/consensus.go` — `StrategyMetaAgent` calls `runMetaAgentReasoning`, which prompts a **meta-model** (`DefaultConsensusConfig`: e.g. OpenRouter Gemini Flash) to select or synthesize a final answer from competing `ModelOutput`s. |
| Agreement signal | **Implemented:** `calculateAgreement` uses a lexical overlap heuristic between responses (not embeddings in this path). |
| Fallback when agreement is high | **Implemented:** If strategy is not meta-agent and agreement ≥ threshold, picks best output by `Scores.Overall` (greedy/weighted path). |

**Summary for the report:** The shipped product implements **multi-model consensus via agreement heuristics and an LLM meta-agent**, which is conceptually related to the paper’s “consensus” stage but **is not the ABTC Beta–Bernoulli updater** described on the poster. Cite poster numbers only as manuscript results, or run a reproduction benchmark.

Code pointers: `internal/reasoning/consensus.go`, `internal/reasoning/engine.go`.

---

## Part C — Screenshot and capture checklist (product evidence)

Capture from a running server (`QUICKSTART.md`). **Redact** all API keys, tokens, and secrets.

| # | Capture | Notes |
|---|---------|--------|
| 1 | `GET /health` | Browser or terminal; JSON with status, models, DB. |
| 2 | Login / signup (if enabled) | Shows auth story. |
| 3 | Dashboard — API keys / provider keys | “One GAIOL key” narrative; blur secrets. |
| 4 | Model list with filters / providers | See `docs/comparison.md`. |
| 5 | Query UI — Compare / Smart / Single + parameters | Core workflow. |
| 6 | Result card(s) with **Time, Tokens, Quality, Cost** | Matches `web/js/ui.js` metrics. |
| 7 | Optional: reasoning / WebSocket or step UI | If you demo decomposition/consensus. |
| 8 | Optional: world-model flow | `docs/world-model-verification.md`. |
| 9 | Optional: `POST /v1/chat` or smart query in Postman/curl | Redact `Authorization` header value. |

Store files under `report-artifacts/screenshots/` (gitignored) or your team drive.

---

## Part D — Live performance metrics (separate from poster)

*Tag these as **live run** or **database aggregate** in the report.*

### D.1 Automated snapshots (scripts)

From repo root:

```powershell
# JSON: health + monitoring/stats (server must be running)
.\scripts\collect-report-metrics.ps1

# PNG screenshots via headless Chrome or Edge (starts web-server.exe if port is free)
.\scripts\capture-report-screenshots.ps1
```

Optional: `$env:GAIOL_BASE_URL = 'http://localhost:8080'`. If the server is already running: `.\scripts\capture-report-screenshots.ps1 -NoStartServer`.

Screenshots land in `report-artifacts/screenshots/` (`01-health-json.png`, `02-index-query-ui.png`, etc.). JSON under `report-artifacts/` (`health.json`, `monitoring-stats.json`). See `API.md` for the **actual** `GET /api/monitoring/stats` response shape (`SystemStats`).

### D.2 Per-request latency

- Smart/query API responses include timing (e.g. `latency_ms` / processing time from `cmd/web-server/main.go`).  
- `POST /v1/chat` logs include `latency_ms` and success/failure.

Aggregate over **N** calls: mean, p95, error rate. Record **date**, **host**, and **N**.

### D.3 Supabase SQL (optional)

`api_queries` columns include `processing_time_ms`, `success`, `cost`, `tokens_used` (see `migrations/001_initial_schema.sql`).

```sql
-- Example aggregates (run in Supabase SQL editor; scope by tenant/date as needed)
SELECT
  COUNT(*) AS n,
  AVG(processing_time_ms)::numeric(10,2) AS avg_latency_ms,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) AS success_rate,
  SUM(cost)::numeric(12,6) AS total_cost
FROM api_queries
WHERE created_at > NOW() - INTERVAL '7 days';
```

Model-level quality averages (if populated): view `model_performance_agg` (`migrations/003_performance_init.sql`).

### D.4 Engineering checks (optional)

- `go test ./...` — pass/fail and duration.  
- `go build -o build/gaiol.exe ./cmd/web-server` — build success.

### D.5 Manuscript benchmark

The 500-query protocol and baseline table in **Part A** require a dedicated eval harness. `docs/GAIOL_PUBLIC_PRODUCT_PLAN.md` references CLI/benchmark paths that are **not** in this tree; treat those numbers as **poster-only** unless you reproduce the experiment.

---

## Part E — Suggested report outline

1. Abstract — Poster abstract + one line on implementation (consensus path).  
2. Introduction — Problem and contributions (Part A).  
3. Architecture — Figure `poster/figures/Figure_2.png` + `docs/architecture.md`.  
4. Methods — Algorithm (Part A) + **Implementation vs poster** (Part B).  
5. System demo — Screenshots (Part C).  
6. Evaluation — Manuscript results (Part A) *if attributed or reproduced*; **live** metrics (Part D) in a separate subsection.  
7. Conclusion — Poster conclusion; future work (federation, governance, protocols, robustness, AutoGen/MetaGPT).

---

## Part F — Pre-submission checklist

- [ ] Each number labeled **poster**, **live run**, or **database aggregate**  
- [ ] Architecture figure present  
- [ ] No secrets in screenshots or JSON  
- [ ] Part B (implementation vs ABTC) reviewed by team  

---

## Part G — Memo for team (copy and send)

**Subject:** GAIOL project report — content checklist, screenshots, and performance metrics

**Purpose:** Single reference for the report pack: poster text and tables are in **Part A** of `docs/project-report-pack.md`. Product evidence = **Part C** screenshots. Performance = **Part D** (live) vs poster benchmark (**Part A**); do not merge without labeling.

**Deliverables**

| Deliverable | Where |
|-------------|--------|
| Poster tables and protocol | Part A (this doc) |
| Architecture figure | `poster/figures/Figure_2.png` |
| Screenshots | Part C checklist → `report-artifacts/screenshots/` |
| Live JSON | `scripts/collect-report-metrics.ps1` → `report-artifacts/*.json` |
| DB metrics | Part D.3 SQL |

**Next steps:** Assign owners, collect assets by your deadline, draft report using Part E outline.

---

*Generated for the GAIOL repository. Update if `poster/GAIOL_poster.tex` changes.*
