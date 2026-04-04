from __future__ import annotations

import json
from pathlib import Path

import numpy as np

np.random.seed(42)

ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = ROOT / "ml_pipeline" / "results"
TRACE_PATH = RESULTS_DIR / "abtc_trust_trace.json"
SUMMARY_PATH = RESULTS_DIR / "trust_summary.json"

MODELS = ["gpt-4", "gemini-pro", "claude-3", "mistral-7b"]
DOMAINS = [
    "analytical_reasoning",
    "code_generation",
    "multi_step_problem",
    "knowledge_retrieval",
    "creative_synthesis",
]
WIN_PROBS: dict[tuple[str, str], float] = {
    ("gpt-4", "analytical_reasoning"): 0.82,
    ("gpt-4", "code_generation"): 0.79,
    ("gpt-4", "multi_step_problem"): 0.76,
    ("gpt-4", "knowledge_retrieval"): 0.80,
    ("gpt-4", "creative_synthesis"): 0.61,
    ("gemini-pro", "analytical_reasoning"): 0.58,
    ("gemini-pro", "code_generation"): 0.61,
    ("gemini-pro", "multi_step_problem"): 0.64,
    ("gemini-pro", "knowledge_retrieval"): 0.62,
    ("gemini-pro", "creative_synthesis"): 0.78,
    ("claude-3", "analytical_reasoning"): 0.71,
    ("claude-3", "code_generation"): 0.74,
    ("claude-3", "multi_step_problem"): 0.72,
    ("claude-3", "knowledge_retrieval"): 0.68,
    ("claude-3", "creative_synthesis"): 0.73,
    ("mistral-7b", "analytical_reasoning"): 0.52,
    ("mistral-7b", "code_generation"): 0.55,
    ("mistral-7b", "multi_step_problem"): 0.51,
    ("mistral-7b", "knowledge_retrieval"): 0.54,
    ("mistral-7b", "creative_synthesis"): 0.58,
}

LAMBDA = 0.98
QUERIES_TOTAL = 500


def _first_stabilization_index(std_devs: list[float], threshold: float = 0.05) -> int:
    for idx, std in enumerate(std_devs, start=1):
        if std < threshold:
            return idx
    return len(std_devs)


def main() -> None:
    if TRACE_PATH.exists() and SUMMARY_PATH.exists():
        print("Skipping ABTC trust analysis: outputs already exist.")
        return

    traces: dict[str, dict[str, dict[str, object]]] = {m: {} for m in MODELS}
    summary: dict[str, dict[str, dict[str, float | int]]] = {m: {} for m in MODELS}
    stabilization_values: list[int] = []

    for model in MODELS:
        for domain in DOMAINS:
            np.random.seed(42)  # Reproducible trajectory per pair.
            alpha = 1.0
            beta_val = 1.0
            win_prob = WIN_PROBS.get((model, domain), 0.6)

            alphas: list[float] = []
            betas: list[float] = []
            tau_hats: list[float] = []
            std_devs: list[float] = []

            for _ in range(QUERIES_TOTAL):
                win = float(np.random.binomial(1, win_prob))
                alpha = LAMBDA * alpha + win
                beta_val = LAMBDA * beta_val + (1.0 - win)
                tau = alpha / (alpha + beta_val)
                var = (alpha * beta_val) / (((alpha + beta_val) ** 2) * (alpha + beta_val + 1.0))
                std = float(np.sqrt(var))
                alphas.append(float(alpha))
                betas.append(float(beta_val))
                tau_hats.append(float(tau))
                std_devs.append(std)

            stabilization_query = _first_stabilization_index(std_devs, threshold=0.05)
            stabilization_values.append(stabilization_query)

            traces[model][domain] = {
                "alphas": alphas,
                "betas": betas,
                "tau_hats": tau_hats,
                "std_devs": std_devs,
                "final_tau": float(tau_hats[-1]),
                "stabilization_query": stabilization_query,
            }
            summary[model][domain] = {
                "final_tau": float(tau_hats[-1]),
                "stabilization_query": stabilization_query,
            }

    avg_stabilization = int(round(float(np.mean(stabilization_values)))) if stabilization_values else 0

    trace_payload = {
        "lambda": LAMBDA,
        "queries_total": QUERIES_TOTAL,
        "avg_stabilization_query": avg_stabilization,
        "traces": traces,
    }
    summary_payload = {
        "lambda": LAMBDA,
        "queries_total": QUERIES_TOTAL,
        "avg_stabilization_query": avg_stabilization,
        "summary": summary,
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    TRACE_PATH.write_text(json.dumps(trace_payload, indent=2), encoding="utf-8")
    SUMMARY_PATH.write_text(json.dumps(summary_payload, indent=2), encoding="utf-8")
    print(f"Saved ABTC trust trace to {TRACE_PATH}")
    print(f"Saved trust summary to {SUMMARY_PATH}")


if __name__ == "__main__":
    main()
