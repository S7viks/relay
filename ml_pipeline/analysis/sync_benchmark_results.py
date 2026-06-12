#!/usr/bin/env python3
"""Sync TypeScript benchmark artifacts into ml_pipeline/results for figure generation."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "scripts" / "benchmark" / "results"
DST = ROOT / "ml_pipeline" / "results"

FILES = [
    "benchmark_results.json",
    "baseline_comparison.json",
    "sensitivity_lambda.json",
    "sensitivity_beamwidth.json",
    "fault_tolerance.json",
    "cumulative_quality.json",
    "convergence_curve.json",
    "standard_benchmarks.json",
]


def main() -> int:
    DST.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for name in FILES:
        src = SRC / name
        if not src.exists():
            continue
        shutil.copy2(src, DST / name)
        copied.append(name)

    manifest = {
        "source": str(SRC.relative_to(ROOT)).replace("\\", "/"),
        "destination": str(DST.relative_to(ROOT)).replace("\\", "/"),
        "copied": copied,
    }
    (DST / "sync_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Synced {len(copied)} file(s) to {DST}")
    for name in copied:
        print(f"  - {name}")
    if not copied:
        print("No benchmark result files found. Run: npm run benchmark")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
