"""HumanEval-style code generation benchmark runner."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (
    load_fixture,
    merge_results,
    run_with_backends,
    save_standard_results,
    STANDARD_RESULTS_PATH,
)


def _load_items(limit: int) -> list[dict[str, Any]]:
    try:
        from datasets import load_dataset  # type: ignore

        ds = load_dataset("openai_humaneval", split="test")
        items: list[dict[str, Any]] = []
        for i, row in enumerate(ds):
            if i >= limit:
                break
            items.append(
                {
                    "task_id": str(row["task_id"]),
                    "prompt": str(row["prompt"]),
                    "entry_point": str(row["entry_point"]),
                    "test": str(row["test"]),
                }
            )
        if items:
            print(f"HumanEval: loaded {len(items)} tasks from HuggingFace openai_humaneval")
            return items
    except Exception as exc:
        print(f"HumanEval: HuggingFace load skipped ({exc}); using fixtures")

    return load_fixture("humaneval_sample.json")[:limit]


def _extract_code(text: str) -> str:
    fence = re.search(r"```(?:python)?\s*([\s\S]*?)```", text)
    if fence:
        return fence.group(1).strip()
    return text.strip()


def _exec_test(code: str, test_line: str, entry_point: str) -> bool:
    namespace: dict[str, Any] = {}
    try:
        exec(code, namespace)  # noqa: S102 — benchmark sandbox for generated code
        if entry_point not in namespace:
            return False
        exec(test_line, namespace)  # noqa: S102
        return True
    except Exception:
        return False


def run_humaneval(limit: int = 10, direct_baseline: bool = False) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in _load_items(limit):
        prompt = (
            f"Complete the following Python function. Return only valid Python code.\n\n"
            f"{item['prompt']}"
        )
        gaiol = run_with_backends(prompt, task_kind="code", use_gaiol=True)
        code = _extract_code(gaiol["response"])
        passed = _exec_test(code, item["test"], item["entry_point"])
        row: dict[str, Any] = {
            "task_id": item["task_id"],
            "gaiol_pass": passed,
            "gaiol_latency_ms": gaiol["latency_ms"],
            "gaiol_failed": gaiol["failed"],
        }
        if direct_baseline:
            direct = run_with_backends(prompt, task_kind="code", use_gaiol=False)
            direct_code = _extract_code(direct["response"])
            row.update(
                {
                    "direct_pass": _exec_test(direct_code, item["test"], item["entry_point"]),
                    "direct_latency_ms": direct["latency_ms"],
                    "direct_failed": direct["failed"],
                }
            )
        rows.append(row)
        print(f"HumanEval | {item['task_id']} | pass={passed} | {'OK' if not gaiol['failed'] else 'FAIL'}")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Run HumanEval-style code benchmark.")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--direct-baseline", action="store_true")
    args = parser.parse_args()

    rows = run_humaneval(limit=args.limit, direct_baseline=args.direct_baseline)
    existing: dict[str, Any] = {}
    if STANDARD_RESULTS_PATH.exists():
        import json

        existing = json.loads(STANDARD_RESULTS_PATH.read_text(encoding="utf-8"))
    payload = merge_results(existing, "humaneval", rows)
    path = save_standard_results(payload)
    passed = sum(1 for r in rows if r.get("gaiol_pass"))
    print(f"HumanEval pass@1 (GAIOL): {passed}/{len(rows)} -> saved {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
