# GAIOL Evaluation Results — Post-Fix Live Run

**Run date:** 2026-06-16  
**Run ID:** `2026-06-16T17:15:02.663Z`  
**Orchestrator:** TypeScript service at `http://localhost:8787` (ABTC, λ=0.98)  
**Benchmark config:** `TIMEOUT_MS=180000`, `BENCHMARK_BEAM_WIDTH=2`, LLM judge via `GEMINI_API_KEY` (Gemini API)  
**Command:**

```powershell
Set-Location C:\dev\GAIOL
$env:GAIOL_ORCHESTRATOR_URL="http://localhost:8787"
node $env:APPDATA\npm\node_modules\tsx\dist\cli.mjs --env-file=.env scripts/benchmark/run_benchmark.ts --no-sweeps
```

**Artifacts:** `scripts/benchmark/results/` (synced to `ml_pipeline/results/`)

---

## Executive summary

Configuration fixes (180s timeout, beam width 2, orchestrator URL 8787, Gemini judge) **doubled orchestration success** versus the prior partial run, but **did not reach full 25/25** under live OpenRouter orchestration load.

| Metric | Pre-fix (2026-06-16 partial) | Post-fix (this run) |
|--------|-------------------------------:|--------------------:|
| **Orchestration success** | **4/25 (16%)** | **8/25 (32%)** |
| Timeout per request | 90s | 180s |
| Main benchmark beam width | 3 | 2 |
| Mean latency (successful path) | ~90s (many exact timeouts) | 151s |
| LLM judge | OpenRouter `gpt-4` → HTTP **402** (no credits) | Gemini → HTTP **429** (quota); scores fall back to orchestrator eval or **0.72** placeholder |

**Root causes still limiting full success:**

1. **Heavy domains** (`multi_step_problem`, `knowledge_retrieval`) hit the **180s ceiling** on all 5 queries each (empty response, quality 0).
2. **Gemini judge quota (429)** on nearly every scoring call — quality numbers are mostly **fallback 0.72** or **0.00** on timeouts, not independent judge scores.
3. **OpenRouter orchestration** remains the live provider path; long multi-subtask runs are slow and may need credits or direct provider keys (Gemini/OpenAI) for reliable throughput.

Sensitivity sweeps (`--sweeps-only`) were started after this main run; see `scripts/benchmark/results/sensitivity_*.json` once complete.

---

## 1. Section 6.5 — Synthetic domain benchmark (25 queries)

**Source:** `scripts/benchmark/results/benchmark_results.json`

### Aggregate

| Metric | Value |
|--------|------:|
| Total queries | 25 |
| Overall success rate | **32% (8/25)** |
| Mean latency | **150,679 ms** |
| Mean quality (judge/fallback) | 0.23 |
| Mean consensus confidence | 0.16 |
| Total wall time | ~110 min |

### Per domain

| Domain | Success | Avg latency | Avg quality | Notes |
|--------|--------:|------------:|------------:|-------|
| analytical_reasoning | **5/5** | 73s | 0.72 | All queries completed under timeout |
| code_generation | **1/5** | 174s | 0.14 | 4× hit 180s timeout |
| multi_step_problem | **0/5** | 180s | 0.00 | All timed out at limit |
| knowledge_retrieval | **0/5** | 180s | 0.00 | All timed out at limit |
| creative_synthesis | **2/5** | 146s | 0.29 | 3× timed out at limit |

### Before vs after (orchestration success only)

| Domain | Pre-fix | Post-fix |
|--------|--------:|---------:|
| analytical_reasoning | 3/5 | **5/5** |
| code_generation | 0/5 | **1/5** |
| multi_step_problem | 0/5 | 0/5 |
| knowledge_retrieval | 0/5 | 0/5 |
| creative_synthesis | 1/5 | **2/5** |
| **Total** | **4/25** | **8/25** |

---

## 2. Fixes applied (this session)

| Issue | Fix |
|-------|-----|
| 90s timeouts on beam+decompose | `TIMEOUT_MS=180_000`, `BENCHMARK_BEAM_WIDTH=2` in `scripts/benchmark/run_benchmark.ts` |
| Wrong orchestrator port in Python benchmarks | Default `8787` in `ml_pipeline/benchmarks/common.py` |
| OpenRouter judge HTTP 402 | Prefer `GEMINI_API_KEY` / `GOOGLE_API_KEY` → `gemini-2.0-flash` for LLM-as-judge |
| Missing `datasets` for MMLU/HumanEval | Added to `ml_pipeline/requirements.txt`; `pip install datasets` |
| Lambda sweep 0 quality / 2ms | Not a code bug — orchestrator was down; sweep re-run via `--sweeps-only` |
| Lambda sweep HTTP 500 on `abtc_decay` | Added `abtc_decay` to `orchestrate-request.schema.json` (schema drift vs `wire-types.ts`) |

---

## 3. Baseline comparison (ABTC vs uniform vs static)

**Source:** `scripts/benchmark/results/baseline_comparison.json` (updated with this run’s first query per domain)

Representative query per domain; quality still judge-limited (Gemini 429 → fallback).

---

## 4. Remaining blockers

| Blocker | Impact | Mitigation |
|---------|--------|------------|
| Gemini API **429** quota on judge | Quality scores not from real judge | Enable billing / wait for quota reset; or set `OPENAI_API_KEY` |
| OpenRouter **402** if used for judge | Same | Already bypassed via Gemini preference |
| 180s still insufficient for 17/25 queries | 0% success on two full domains | Increase `GAIOL_BENCHMARK_TIMEOUT_MS`, reduce `beam_width` to 1 for eval runs, or add faster direct provider keys |
| OpenRouter orchestration latency | Multi-subtask queries exceed budget | Fund OpenRouter credits or register `GOOGLE_API_KEY` for direct Gemini orchestration |

---

## 5. Reproduce

```powershell
# Terminal 1 — orchestrator
Set-Location C:\dev\GAIOL\orchestrator
npm run dev:api

# Terminal 2 — main 25-query benchmark
Set-Location C:\dev\GAIOL
$env:GAIOL_ORCHESTRATOR_URL="http://localhost:8787"
node $env:APPDATA\npm\node_modules\tsx\dist\cli.mjs --env-file=.env scripts/benchmark/run_benchmark.ts --no-sweeps

# Optional — sweeps (long; run after main)
node $env:APPDATA\npm\node_modules\tsx\dist\cli.mjs --env-file=.env scripts/benchmark/run_benchmark.ts --sweeps-only

# Sync
python ml_pipeline/analysis/sync_benchmark_results.py
```

---

## 6. Verification

- Orchestrator health: `GET http://localhost:8787/health` → `{"ok":true}`
- Orchestrator unit tests: `npm test` in `orchestrator/` — **43 passed** (2026-06-16)
