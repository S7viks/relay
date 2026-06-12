#!/usr/bin/env python3
"""Run MMLU, HumanEval, and MT-Bench standard benchmark suites."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

RUNNERS = {
    "mmlu": ROOT / "ml_pipeline" / "benchmarks" / "mmlu_runner.py",
    "humaneval": ROOT / "ml_pipeline" / "benchmarks" / "humaneval_runner.py",
    "mt_bench": ROOT / "ml_pipeline" / "benchmarks" / "mt_bench_runner.py",
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Run all standard paper benchmarks.")
    parser.add_argument(
        "--suites",
        default="mmlu,humaneval,mt_bench",
        help="Comma-separated suites to run (default: all)",
    )
    parser.add_argument("--limit-mmlu", type=int, default=25)
    parser.add_argument("--limit-humaneval", type=int, default=10)
    parser.add_argument("--limit-mt-bench", type=int, default=10)
    parser.add_argument("--direct-baseline", action="store_true")
    args = parser.parse_args()

    suites = [s.strip() for s in args.suites.split(",") if s.strip()]
    exit_code = 0
    for suite in suites:
        script = RUNNERS.get(suite)
        if not script:
            print(f"Unknown suite: {suite}")
            exit_code = 1
            continue
        cmd = [sys.executable, str(script)]
        if suite == "mmlu":
            cmd.extend(["--limit", str(args.limit_mmlu)])
        elif suite == "humaneval":
            cmd.extend(["--limit", str(args.limit_humaneval)])
        elif suite == "mt_bench":
            cmd.extend(["--limit", str(args.limit_mt_bench)])
        if args.direct_baseline:
            cmd.append("--direct-baseline")
        print(f"\n=== Running {suite} ===")
        proc = subprocess.run(cmd, cwd=str(ROOT), check=False)
        if proc.returncode != 0:
            exit_code = proc.returncode
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
