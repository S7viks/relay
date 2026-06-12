#!/usr/bin/env python3
"""GAIOL ML Pipeline - full end-to-end runner."""

import subprocess
import time
import sys
from pathlib import Path


STAGES = [
    ("Stage 1: Generate dataset", "ml_pipeline/data/generate_queries.py"),
    ("Stage 2: Run all systems", "ml_pipeline/runners/run_all.py"),
    ("Stage 3-5: Analysis", "ml_pipeline/analysis/run_analysis.py"),
    ("Stage 6: Generate figures", "ml_pipeline/figures/generate_all_figures.py"),
]

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def _log(message: str) -> None:
    print(message, flush=True)


def _format_size(path: Path) -> str:
    size = path.stat().st_size
    units = ["B", "KB", "MB", "GB"]
    idx = 0
    while size >= 1024 and idx < len(units) - 1:
        size /= 1024.0
        idx += 1
    return f"{size:.1f}{units[idx]}"


def _collect_outputs():
    output_paths = [
        Path("ml_pipeline/data/queries.json"),
        Path("ml_pipeline/data/queries_summary.json"),
        Path("ml_pipeline/results/benchmark_results.json"),
        Path("ml_pipeline/results/analysis_report.json"),
        Path("ml_pipeline/figures/Figure_2.png"),
        Path("ml_pipeline/figures/Figure_3.png"),
        Path("ml_pipeline/figures/5.1.png"),
        Path("ml_pipeline/figures/5.4.png"),
        Path("ml_pipeline/figures/consensus_voting.png"),
    ]
    return [p for p in output_paths if p.exists()]


def main():
    _log("╔══════════════════════════════════════════╗")
    _log("║   GAIOL ML Pipeline v1.0                ║")
    _log("║   500 queries · 5 systems · 5 domains   ║")
    _log("╚══════════════════════════════════════════╝")

    for name, script in STAGES:
        _log(f"\n▶ {name}...")
        start = time.time()
        result = subprocess.run(["python", script], capture_output=False, check=False)
        elapsed = time.time() - start
        if result.returncode == 0:
            _log(f"  ✓ Done in {elapsed:.1f}s")
        else:
            _log(f"  ✗ FAILED (exit {result.returncode}) — continuing...")

    _log("\nFinal output summary:")
    outputs = _collect_outputs()
    if not outputs:
        _log("  No expected outputs were found.")
        return
    for path in outputs:
        _log(f"  - {path} ({_format_size(path)})")


if __name__ == "__main__":
    main()
