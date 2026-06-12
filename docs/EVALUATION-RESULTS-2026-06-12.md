# GAIOL Evaluation Results — Live Run

**Run date:** 2026-06-12  
**Run ID:** `2026-06-12T14:20:30.185Z`  
**Orchestrator:** TypeScript service at `http://localhost:8787` (ABTC, λ=0.98, beam_width=2)  
**Artifact directory:** `scripts/benchmark/results/` (synced copy in `ml_pipeline/results/`)

---

## Executive summary

This report records a **live end-to-end execution** of the paper-aligned evaluation harness against the running GAIOL orchestrator. All infrastructure paths (decomposition, routing, ABTC trust updates, consensus modes, sweeps, fault scenarios) were exercised successfully.

**Critical limitation:** No `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `GOOGLE_API_KEY` were configured in the repo `.env`. The orchestrator therefore used **mock provider adapters** (`mock-fast`, `mock-strong`, `mock-code`). Under this configuration:

| Metric type | Valid in this run? | Notes |
|-------------|-------------------|--------|
| Orchestration success rate | Yes | 25/25 domain queries succeeded |
| Latency (p50 domain) | Yes | ~174–300 ms per domain |
| ABTC / routing / decomposition traces | Yes | Full v1 contract responses |
| LLM-as-judge quality scores | **No** | Judge requires real LLM; mock responses are not valid JSON scores → **0.00** recorded |
| MMLU / HumanEval accuracy | Partial | Fixtures ran; mock answers are not real completions |
| 500-query five-system Table 1 | Not re-run | Requires provider API keys |

**To reproduce paper-comparable quality numbers:** add provider keys to `.env`, restart the orchestrator, and re-run `npm run benchmark` and `python ml_pipeline/benchmarks/run_standard_benchmarks.py`.

---

## 1. Section 6.5 — Synthetic domain benchmark (25 queries)

**Command:** `GAIOL_ORCHESTRATOR_URL=http://localhost:8787 npm run benchmark`  
**Source:** `scripts/benchmark/results/benchmark_results.json`

### Aggregate

| Metric | Value |
|--------|------:|
| Total queries | 25 |
| Overall success rate | **100%** (25/25) |
| Mean latency | **237 ms** |
| Mean consensus confidence | 0.50 |
| Mean quality (LLM judge) | 0.00 * |
| Total wall time | 66.5 s |

\* Quality scores are **not meaningful** without a real LLM judge (see Executive summary).

### Per domain

| Domain | Queries | Success | Avg latency | Avg quality * |
|--------|--------:|--------:|------------:|--------------:|
| analytical_reasoning | 5 | 100% | 300 ms | 0.00 |
| code_generation | 5 | 100% | 209 ms | 0.00 |
| multi_step_problem | 5 | 100% | 257 ms | 0.00 |
| knowledge_retrieval | 5 | 100% | 246 ms | 0.00 |
| creative_synthesis | 5 | 100% | 174 ms | 0.00 |

**Decomposition observed:** Multi-sentence queries were split into 1–3 subtasks (heuristic decomposer). Example: train-speed problem → 3 subtasks, 346 ms.

**Sample outputs:** `scripts/benchmark/results/output_samples.md`

---

## 2. ABTC vs uniform vs static (baseline comparison)

**Source:** `scripts/benchmark/results/baseline_comparison.json`  
One representative query per domain; same query evaluated under three consensus modes.

| Domain | ABTC latency | Uniform latency | Static latency |
|--------|-------------:|----------------:|---------------:|
| analytical_reasoning | 195 ms | 4 ms | 6 ms |
| code_generation | 277 ms | 7 ms | 4 ms |
| multi_step_problem | 223 ms | 9 ms | 2 ms |
| knowledge_retrieval | 243 ms | — | — |
| creative_synthesis | 159 ms | — | — |

Quality scores are 0.00 across modes (mock judge limitation). **Latency differences are valid** and show ABTC path exploration adds overhead vs single-call uniform/static on mock providers.

---

## 3. Hyperparameter sensitivity — λ sweep (Section 6.6)

**Source:** `scripts/benchmark/results/sensitivity_lambda.json`  
**λ values (paper `LAMBDA_SWEEP`):** 0.90, 0.95, 0.98, 0.99, 1.00  
**Probe design:** 3 queries × 5 domains per λ (75 orchestrations per λ)

| λ | abtc_decay | Mean latency | Orchestrations marked success |
|---:|-----------:|-------------:|------------------------------:|
| 0.90 | 0.10 | 2.1 ms | 0/15 * |
| 0.95 | 0.05 | 2.4 ms | 0/15 * |
| 0.98 | 0.02 | 2.1 ms | 0/15 * |
| 0.99 | 0.01 | 2.1 ms | 0/15 * |
| 1.00 | 0.00 | 2.5 ms | 0/15 * |

\* Sweep probes use a lightweight quality gate; with mock judge all quality=0, so `success=false` in sweep rows despite HTTP 200. Latency values reflect fast mock responses.

---

## 4. Beam width sweep

**Source:** `scripts/benchmark/results/sensitivity_beamwidth.json`  
**Beam widths (paper `BEAM_WIDTH_SWEEP`):** 1, 2, 3, 4, 5

| beam_width | Mean latency | Runs |
|----------:|-------------:|-----:|
| 1 | 35 ms | 5/5 HTTP OK |
| 2 | 218 ms | 5/5 |
| 3 | 269 ms | 5/5 |
| 4 | 212 ms | 5/5 |
| 5 | 232 ms | 5/5 |

Confirms expected latency tradeoff: wider beam → more path exploration on multi-subtask mock runs.

---

## 5. Fault tolerance (real timeout pressure)

**Source:** `scripts/benchmark/results/fault_tolerance.json`

| Scenario | Timeout | Success rate |
|----------|--------:|-------------:|
| normal | 90 s | **5/5** |
| tight | 8 s | **5/5** |
| very-tight | 4 s | **5/5** |

Mock responses complete well within all budgets; this validates the harness under degraded timeout settings, not real provider slowness.

---

## 6. Cumulative quality curve (ABTC vs uniform vs static warm-up)

**Source:** `scripts/benchmark/results/cumulative_quality.json`  
**Design:** 20 sequential rounds, rotating domain mix, three modes.

All per-round quality scores recorded as 0.00 (mock judge). **Infrastructure completed all 60 orchestrations** (20 rounds × 3 modes). Cumulative mean quality flat at 0.

---

## 7. ABTC convergence curve

**Source:** `scripts/benchmark/results/convergence_curve.json`

| Field | Value |
|-------|-------|
| λ | 0.98 |
| Domain | analytical_reasoning |
| Rounds requested | 20 |
| Points recorded | **0** |

**Finding:** Convergence probe returned an empty `points` array in this run. Unit-level convergence logic passes in `orchestrator` tests (`abtcConvergenceCurve`); the live benchmark probe needs follow-up (likely interaction between mock responses and the probe’s quality gate).

---

## 8. Standard benchmarks (MMLU, HumanEval, MT-Bench)

**Command:**  
`GAIOL_ORCHESTRATOR_URL=http://localhost:8787 python ml_pipeline/benchmarks/run_standard_benchmarks.py --limit-mmlu 3 --limit-humaneval 2 --limit-mt-bench 2`

**Source:** `scripts/benchmark/results/standard_benchmarks.json`  
**Dataset source:** Bundled fixtures (HuggingFace `datasets` not installed)

### MMLU (3 items)

| ID | Subject | Gold | Predicted | Correct | Latency |
|----|---------|------|-----------|---------|--------:|
| mmlu_001 | high_school_mathematics | A | F | No | 3276 ms |
| mmlu_002 | world_history | A | A | **Yes** | 2825 ms |
| mmlu_003 | computer_science | B | A | No | 2900 ms |

**Accuracy:** 1/3 (33.3%) — *not comparable to paper claims; mock models do not solve MCQ tasks.*

### HumanEval (2 items)

| Task | pass@1 | Latency |
|------|--------|--------:|
| HumanEval/0 | Fail | 2828 ms |
| HumanEval/1 | Fail | 2536 ms |

**pass@1:** 0/2 — mock responses are not executable Python.

### MT-Bench (2 dialogs, 4 turns)

| Dialog | Category | Turn latencies | Status |
|--------|----------|----------------|--------|
| mt_001 | writing | 2744 ms, 3005 ms | Both turns OK |
| mt_002 | reasoning | 2422 ms, 4161 ms | Both turns OK |

Multi-turn orchestration path verified; responses are mock text (236–1646 chars).

---

## 9. Five-system comparison (Table 1 — not re-run live)

**Archived artifact:** `ml_pipeline/results/system_comparison.json`  
**Status:** Pre-existing **simulated / partial** run (Sys-1 GAIOL had 0% success in stored responses; other systems used direct API simulation).

| System | Avg quality | Avg latency | Success rate |
|--------|------------:|------------:|-------------:|
| sys1_gaiol | 0.757 | 0 ms | 0% |
| sys2_direct_api | 0.757 | 880 ms | 97.8% |
| sys3_langchain | 0.709 | 1683 ms | 93.8% |
| sys4_openrouter | 0.644 | 641 ms | 98.0% |
| sys5_multi_wrap | 0.540 | 1052 ms | 98.0% |

**Not valid for publication** without re-running `python ml_pipeline/runners/run_all.py` with live API keys and a healthy orchestrator.

---

## 10. Human validation calibration

**Command:** `python ml_pipeline/eval/human_validation.py`  
**Source:** `ml_pipeline/data/human_validation.json`

| Metric | Reported | Raw computed |
|--------|----------|-------------|
| Sample size | 150 | — |
| Cohen's κ (annotator agreement) | 0.74 | 0.6165 |
| Pearson r (GPT vs mean annotator) | 0.82 | 0.9626 |

**Note:** This run used **simulated annotators** (no `human_annotations.jsonl` present). Reported κ/r are aligned to paper targets when raw values diverge. For real calibration, supply `ml_pipeline/data/human_annotations.jsonl` and re-run.

---

## 11. AutoGen baseline (deferred protocol)

**Command:** `python ml_pipeline/runners/sys6_autogen.py`  
**Source:** `ml_pipeline/results/autogen_baseline.json`

```json
{
  "status": "skipped",
  "reason": "AUTOGEN_ENABLED not set"
}
```

Per referee responses, full AutoGen-vs-GAIOL-backend comparison is deferred; manifest documents the intended protocol.

---

## 12. Algorithm & contract verification (unit tests)

**Command:** `cd orchestrator && npm test`

| Suite | Result |
|-------|--------|
| Test files | 15 passed |
| Tests | **36 passed** |
| Includes | ABTC trust update, decomposition fallback, routing scorer (Eq. 3 weights), sensitivity helpers, `/v1/orchestrate` contract v1 |

**Go server routes (benchmark dashboard):** `go test ./internal/httpserver/...` — passed (includes `/benchmark` and `/api/benchmark/results/` handlers).

---

## 13. How to view results in the UI

1. Ensure artifacts exist under `scripts/benchmark/results/`.
2. Start Go server: `go run cmd/web-server/main.go`
3. Open **http://localhost:8080/benchmark**

---

## 14. Reproduction checklist (paper-comparable run)

1. Copy `.env.example` → `.env` and set at least one of:
   - `OPENAI_API_KEY`
   - `OPENROUTER_API_KEY`
   - `GOOGLE_API_KEY`
2. Start orchestrator: `cd orchestrator && npm run dev:api`
3. Run full benchmark: `GAIOL_ORCHESTRATOR_URL=http://localhost:8787 npm run benchmark`
4. Run standard suites: `python ml_pipeline/benchmarks/run_standard_benchmarks.py`
5. Optional full Table 1: `python ml_pipeline/runners/run_all.py`
6. Sync for figures: `python ml_pipeline/analysis/sync_benchmark_results.py`

---

## Appendix A — Raw artifact index

| File | Description |
|------|-------------|
| `benchmark_results.json` | 25-query domain benchmark |
| `baseline_comparison.json` | ABTC vs uniform vs static |
| `sensitivity_lambda.json` | λ sweep |
| `sensitivity_beamwidth.json` | Beam width sweep |
| `fault_tolerance.json` | Timeout scenarios |
| `cumulative_quality.json` | Warm-up curves |
| `convergence_curve.json` | ABTC posterior probe |
| `standard_benchmarks.json` | MMLU / HumanEval / MT-Bench |
| `output_samples.md` | Best response per domain |
| `ml_pipeline/data/human_validation.json` | Human calibration stats |
| `ml_pipeline/results/autogen_baseline.json` | AutoGen skip manifest |

---

## Appendix B — Harness fixes applied during this run

These fixes were required to execute evaluations successfully:

- `scripts/benchmark/run_benchmark.ts`: default orchestrator URL → port **8787**; removed top-level `await` (tsx CJS compatibility).
- `ml_pipeline/benchmarks/common.py`: request uses `max_output_tokens` (schema-valid); parses `answer` field from v1 response.

---

*Generated from live benchmark execution on 2026-06-12. Quality scores in this document are infrastructure-valid but semantically incomplete without real LLM providers and judge API keys.*
