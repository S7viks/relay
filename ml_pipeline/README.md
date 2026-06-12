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
```

Results: `scripts/benchmark/results/`.
