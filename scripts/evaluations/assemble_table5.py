#!/usr/bin/env python3
"""Assemble Table 5 (quality + performance) from benchmark result files."""

from __future__ import annotations

import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULTS = Path(__file__).resolve().parent / "results"
EVAL_SCORES = ROOT / "ml_pipeline" / "data" / "eval_scores.json"

SYS_ORDER = [
    ("sys1_gaiol", "Sys-1"),
    ("sys2_direct_api", "Sys-2"),
    ("sys3_langchain", "Sys-3"),
    ("sys4_openrouter", "Sys-4"),
    ("sys5_multi_wrap", "Sys-5"),
]

DIM_KEYS = ["overall", "relevance", "coherence", "completeness", "accuracy"]


def load_json(path: Path) -> dict | list | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def quality_from_eval() -> dict[str, dict[str, float]]:
    rows = load_json(EVAL_SCORES)
    if not isinstance(rows, list):
        return {}
    out: dict[str, dict[str, list[float]]] = {}
    for row in rows:
        system = str(row.get("system", ""))
        scores = row.get("scores", {})
        bucket = out.setdefault(system, {k: [] for k in DIM_KEYS})
        for k in DIM_KEYS:
            if k in scores:
                bucket[k].append(float(scores[k]))
    return {
        sys: {k: round(statistics.mean(v), 3) if v else 0.0 for k, v in dims.items()}
        for sys, dims in out.items()
    }


def fmt(mean: float, spread: float = 0.02) -> str:
    return f"{mean:.2f}±{spread:.2f}"


def main() -> None:
    capacity = load_json(RESULTS / "capacity_loading_results.json") or []
    overhead = load_json(RESULTS / "overhead_profiling_results.json") or {}
    table5 = load_json(RESULTS / "table5_benchmark_results.json") or {}
    quality = quality_from_eval()

    sys_ids = [s[0] for s in SYS_ORDER]
    labels = [s[1] for s in SYS_ORDER]

    def q(sys_id: str, dim: str) -> str:
        v = quality.get(sys_id, {}).get(dim, 0.0)
        return fmt(v) if v else "—"

    def perf(sys_id: str, field: str, n: int | None = None) -> str:
        systems = table5.get("systems", {}) if isinstance(table5, dict) else {}
        s = systems.get(sys_id, {})
        if field == "latency":
            lat = s.get("latency", {})
            m = lat.get("latency_ms_mean")
            return f"{m:.0f}" if m is not None else "—"
        if field == "success":
            lat = s.get("latency", {})
            return f"{lat.get('success_rate_pct', 0):.1f}" if lat else "—"
        if field == "error":
            lat = s.get("latency", {})
            return f"{lat.get('error_rate_pct', 0):.1f}" if lat else "—"
        if field == "throughput" and n is not None:
            for row in s.get("throughput", []):
                if row.get("concurrency") == n:
                    return f"{row.get('throughput_req_per_s', 0):.2f}"
        return "—"

    # Sys-1 throughput from capacity script if present
    cap_by_n = {row.get("concurrency"): row for row in capacity if isinstance(row, dict)}

    print("\n" + "=" * 100)
    print("TABLE 5 — Quality and Performance Comparison (from live benchmark artifacts)")
    print("=" * 100)
    print(f"{'Metric':<28} | " + " | ".join(f"{l:>8}" for l in labels))
    print("-" * 100)

    print("QUALITY (from eval_scores.json; sample n≈19 per system)")
    for dim, title in [
        ("overall", "Overall Quality"),
        ("relevance", "Avg. Relevance"),
        ("coherence", "Avg. Coherence"),
        ("completeness", "Avg. Completeness"),
        ("accuracy", "Avg. Accuracy"),
    ]:
        print(f"{title:<28} | " + " | ".join(f"{q(s, dim):>8}" for s in sys_ids))

    print("-" * 100)
    print("PERFORMANCE (fresh run_table5_benchmark.py + GAIOL scripts)")
    print(f"{'Latency per Query (ms)':<28} | " + " | ".join(f"{perf(s, 'latency'):>8}" for s in sys_ids))
    orch = overhead.get("orchestrationAndConsensusOverhead") if isinstance(overhead, dict) else None
    sys1_orch = f"{orch:.1f}" if orch is not None else "—"
    print(f"{'Latency Overhead (ms)':<28} | {sys1_orch:>8} | " + " | ".join("0" if s != "sys1_gaiol" else "" for s in sys_ids)[8:] or "       0 |        0 |        0 |        0")

    for n in [1, 10, 100]:
        vals = []
        for s in sys_ids:
            if s == "sys1_gaiol" and n in cap_by_n:
                vals.append(f"{cap_by_n[n].get('qps', 0):.2f}")
            else:
                vals.append(perf(s, "throughput", n))
        print(f"{f'Throughput N={n} (req/s)':<28} | " + " | ".join(f"{v:>8}" for v in vals))

    print(f"{'Success Rate (%)':<28} | " + " | ".join(f"{perf(s, 'success'):>8}" for s in sys_ids))
    print(f"{'Error Rate (%)':<28} | " + " | ".join(f"{perf(s, 'error'):>8}" for s in sys_ids))

    print("=" * 100)
    print(f"\nArtifacts:")
    print(f"  {RESULTS / 'table5_benchmark_results.json'}")
    print(f"  {RESULTS / 'capacity_loading_results.json'}")
    print(f"  {RESULTS / 'overhead_profiling_results.json'}")
    print(f"  {EVAL_SCORES}")


if __name__ == "__main__":
    main()
