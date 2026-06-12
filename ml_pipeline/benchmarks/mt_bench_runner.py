"""MT-Bench-style multi-turn reasoning benchmark runner."""

from __future__ import annotations

import argparse
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
    # MT-Bench full set requires separate download; fixtures cover the protocol.
    return load_fixture("mt_bench_sample.json")[:limit]


def run_mt_bench(limit: int = 10, direct_baseline: bool = False) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in _load_items(limit):
        conversation: list[dict[str, str]] = []
        turn_results: list[dict[str, Any]] = []
        for turn_idx, user_turn in enumerate(item.get("turns", [])):
            conversation.append({"role": "user", "content": user_turn})
            prompt = "\n\n".join(
                f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}" for m in conversation
            )
            gaiol = run_with_backends(prompt, task_kind="reasoning", use_gaiol=True)
            assistant_text = gaiol["response"]
            conversation.append({"role": "assistant", "content": assistant_text})
            turn_results.append(
                {
                    "turn": turn_idx + 1,
                    "latency_ms": gaiol["latency_ms"],
                    "failed": gaiol["failed"],
                    "response_chars": len(assistant_text),
                }
            )

        row: dict[str, Any] = {
            "id": item["id"],
            "category": item.get("category"),
            "turns": turn_results,
            "turn_count": len(turn_results),
        }

        if direct_baseline:
            conversation = []
            direct_turns: list[dict[str, Any]] = []
            for turn_idx, user_turn in enumerate(item.get("turns", [])):
                conversation.append({"role": "user", "content": user_turn})
                prompt = "\n\n".join(
                    f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}" for m in conversation
                )
                direct = run_with_backends(prompt, task_kind="reasoning", use_gaiol=False)
                assistant_text = direct["response"]
                conversation.append({"role": "assistant", "content": assistant_text})
                direct_turns.append(
                    {
                        "turn": turn_idx + 1,
                        "latency_ms": direct["latency_ms"],
                        "failed": direct["failed"],
                    }
                )
            row["direct_turns"] = direct_turns

        rows.append(row)
        print(f"MT-Bench | {item['id']} | turns={len(turn_results)}")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Run MT-Bench-style multi-turn benchmark.")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--direct-baseline", action="store_true")
    args = parser.parse_args()

    rows = run_mt_bench(limit=args.limit, direct_baseline=args.direct_baseline)
    existing: dict[str, Any] = {}
    if STANDARD_RESULTS_PATH.exists():
        import json

        existing = json.loads(STANDARD_RESULTS_PATH.read_text(encoding="utf-8"))
    payload = merge_results(existing, "mt_bench", rows)
    path = save_standard_results(payload)
    print(f"MT-Bench completed {len(rows)} dialogs -> saved {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
