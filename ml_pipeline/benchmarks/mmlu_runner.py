"""MMLU-style multiple-choice knowledge benchmark runner."""

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


def _format_mmlu(item: dict[str, Any]) -> str:
    labels = ["A", "B", "C", "D", "E", "F"]
    lines = [item["question"].strip(), ""]
    for i, choice in enumerate(item.get("choices", [])):
        if i < len(labels):
            lines.append(f"{labels[i]}. {choice}")
    lines.append("")
    lines.append("Answer with the letter only (A, B, C, ...).")
    return "\n".join(lines)


def _parse_choice(text: str) -> str | None:
    match = re.search(r"\b([A-F])\b", text.upper())
    return match.group(1) if match else None


def _load_items(limit: int) -> list[dict[str, Any]]:
    try:
        from datasets import load_dataset  # type: ignore

        ds = load_dataset("cais/mmlu", "all", split="test")
        items: list[dict[str, Any]] = []
        for i, row in enumerate(ds):
            if i >= limit:
                break
            choices = list(row["choices"])
            answer_idx = int(row["answer"])
            items.append(
                {
                    "id": f"mmlu_hf_{i:04d}",
                    "subject": str(row.get("subject", "unknown")),
                    "question": str(row["question"]),
                    "choices": choices,
                    "answer": chr(ord("A") + answer_idx),
                }
            )
        if items:
            print(f"MMLU: loaded {len(items)} items from HuggingFace cais/mmlu")
            return items
    except Exception as exc:
        print(f"MMLU: HuggingFace load skipped ({exc}); using fixtures")

    return load_fixture("mmlu_sample.json")[:limit]


def run_mmlu(limit: int = 25, direct_baseline: bool = False) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in _load_items(limit):
        prompt = _format_mmlu(item)
        gaiol = run_with_backends(prompt, task_kind="qa", use_gaiol=True)
        predicted = _parse_choice(gaiol["response"])
        row: dict[str, Any] = {
            "id": item["id"],
            "subject": item.get("subject"),
            "gold": item.get("answer"),
            "gaiol_predicted": predicted,
            "gaiol_correct": predicted == item.get("answer"),
            "gaiol_latency_ms": gaiol["latency_ms"],
            "gaiol_failed": gaiol["failed"],
        }
        if direct_baseline:
            direct = run_with_backends(prompt, task_kind="qa", use_gaiol=False)
            direct_pred = _parse_choice(direct["response"])
            row.update(
                {
                    "direct_predicted": direct_pred,
                    "direct_correct": direct_pred == item.get("answer"),
                    "direct_latency_ms": direct["latency_ms"],
                    "direct_failed": direct["failed"],
                }
            )
        rows.append(row)
        status = "OK" if not gaiol["failed"] else "FAIL"
        print(f"MMLU | {item['id']} | pred={predicted} gold={item.get('answer')} | {status}")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Run MMLU-style benchmark via GAIOL orchestrator.")
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--direct-baseline", action="store_true")
    args = parser.parse_args()

    rows = run_mmlu(limit=args.limit, direct_baseline=args.direct_baseline)
    existing: dict[str, Any] = {}
    if STANDARD_RESULTS_PATH.exists():
        import json

        existing = json.loads(STANDARD_RESULTS_PATH.read_text(encoding="utf-8"))
    payload = merge_results(existing, "mmlu", rows)
    path = save_standard_results(payload)
    correct = sum(1 for r in rows if r.get("gaiol_correct"))
    print(f"MMLU accuracy (GAIOL): {correct}/{len(rows)} -> saved {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
