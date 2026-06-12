from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    start = time.perf_counter()
    steps = [
        ("Quality evaluation", ROOT / "ml_pipeline" / "eval" / "quality_evaluator.py"),
        ("Human validation", ROOT / "ml_pipeline" / "eval" / "human_validation.py"),
        ("Results computation", ROOT / "ml_pipeline" / "analysis" / "compute_results.py"),
        ("ABTC trust analysis", ROOT / "ml_pipeline" / "analysis" / "abtc_trust_analysis.py"),
    ]

    for name, script in steps:
        print(f"Running: {name}...")
        result = subprocess.run([sys.executable, str(script)], cwd=str(ROOT), check=False)
        if result.returncode == 0:
            print("Done")
        else:
            print(f"FAILED ({result.returncode})")
            break

    total = time.perf_counter() - start
    print(f"Total analysis time: {total:.2f}s")


if __name__ == "__main__":
    main()
