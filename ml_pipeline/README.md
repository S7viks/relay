# GAIOL ML Pipeline — Paper Evaluation Reproduction

Reproduces the experimental results in the GAIOL paper (Table 1, figures, ablation).

## Prerequisites

- Python 3.11+
- Node.js 20+ (for the TypeScript orchestrator)
- Running GAIOL orchestrator on `http://localhost:3001` (see repo `QUICKSTART.md`)

## Setup

```bash
# From repo root
pip install -r ml_pipeline/requirements.txt
cp ml_pipeline/.env.example ml_pipeline/.env
# Edit ml_pipeline/.env with your API keys
```

Start the orchestrator before running Sys-1:

```bash
cd orchestrator && npm run dev:api
```

## Reproduce Table 1 (system comparison)

Runs all five systems (GAIOL + four baselines) against `ml_pipeline/data/queries.json`:

```bash
python ml_pipeline/runners/run_all.py
```

Outputs append to `ml_pipeline/data/responses/*.jsonl`.

## Regenerate figures and aggregate metrics

```bash
python ml_pipeline/analysis/compute_results.py
python ml_pipeline/figures/generate_all_figures.py
```

Results land in `ml_pipeline/results/` and `ml_pipeline/figures/`.

## TypeScript benchmark (Sections 6.5–6.6)

From repo root or `orchestrator/`:

```bash
npm run benchmark              # full 25-query benchmark + sweeps
npm run benchmark:sweeps       # sensitivity + fault-tolerance only
npm run benchmark:convergence  # ABTC trust convergence curve
npm run benchmark:cumulative   # ABTC vs uniform vs static warm-up curves
```

Results: `scripts/benchmark/results/`.

Set `OPENAI_API_KEY` or `OPENROUTER_API_KEY` for real LLM-as-judge scoring in the benchmark (`GAIOL_USE_LLM_JUDGE=0` to disable). Dual Gemini judging in Python eval uses `GOOGLE_API_KEY` and `EVAL_MODEL_GEMINI`.

## Standard benchmarks (MMLU, HumanEval, MT-Bench)

Requires a running orchestrator (`cd orchestrator && npm run dev:api`):

```bash
python ml_pipeline/benchmarks/run_standard_benchmarks.py
python ml_pipeline/analysis/sync_benchmark_results.py   # optional: copy TS results for figures
python ml_pipeline/figures/generate_all_figures.py
```

Optional HuggingFace full suites: `pip install datasets`. Without it, bundled fixtures under `ml_pipeline/benchmarks/fixtures/` are used.

## Human validation (real annotations)

Place paired annotator scores in `ml_pipeline/data/human_annotations.jsonl`:

```json
{"query_id": "q_0001", "annotator_id": "a1", "overall": 0.82}
{"query_id": "q_0001", "annotator_id": "a2", "overall": 0.79}
```

Then run `python ml_pipeline/eval/human_validation.py` (delete existing `human_validation.json` to regenerate).

## AutoGen baseline (optional, deferred protocol)

```bash
pip install pyautogen
AUTOGEN_ENABLED=1 python ml_pipeline/runners/sys6_autogen.py
```

## Benchmark results dashboard (Go server)

After running benchmarks, open `http://localhost:8080/benchmark` (serves `web/results-dashboard.html` + `/api/benchmark/results/*.json`).
