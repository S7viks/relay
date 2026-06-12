"""Shared helpers for standard benchmark runners (MMLU, HumanEval, MT-Bench)."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
RESULTS_DIR = ROOT / "ml_pipeline" / "results"
STANDARD_RESULTS_PATH = RESULTS_DIR / "standard_benchmarks.json"


def orchestrator_url() -> str:
    base = os.getenv("GAIOL_ORCHESTRATOR_URL", "http://localhost:3001").strip().rstrip("/")
    if base.endswith("/v1/orchestrate"):
        return base
    return f"{base}/v1/orchestrate"


def load_fixture(name: str) -> list[dict[str, Any]]:
    path = FIXTURES / name
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise ValueError(f"{path} must contain a JSON array")
    return data


def post_orchestrate(objective: str, task_kind: str = "qa", domain: str = "knowledge_retrieval", timeout: int = 90) -> dict[str, Any]:
    payload = {
        "schema_version": "1.0",
        "trace_id": f"bench-{int(time.time() * 1000)}",
        "domain": domain,
        "task_kind": task_kind,
        "objective": objective,
        "messages": [{"role": "user", "content": objective}],
        "constraints": {"temperature": 0.2, "max_output_tokens": 1024},
        "consensus_mode": "abtc",
        "beam_width": 2,
        "explore_paths": True,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        orchestrator_url(),
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def extract_answer(response: dict[str, Any]) -> str:
    if not isinstance(response, dict):
        return ""
    if response.get("answer"):
        return str(response["answer"])
    result = response.get("result")
    if isinstance(result, dict) and result.get("content"):
        return str(result["content"])
    return str(response.get("content") or response.get("response") or "")


def openai_complete(prompt: str, temperature: float = 0.2) -> str:
    from openai import OpenAI  # type: ignore

    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if openai_key:
        client = OpenAI(api_key=openai_key)
        model = os.getenv("BENCHMARK_MODEL", "gpt-4o-mini")
    elif openrouter_key:
        client = OpenAI(api_key=openrouter_key, base_url="https://openrouter.ai/api/v1")
        model = os.getenv("BENCHMARK_MODEL", "openai/gpt-4o-mini")
    else:
        raise RuntimeError("OPENAI_API_KEY or OPENROUTER_API_KEY required for direct baseline")

    resp = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1024,
    )
    return (resp.choices[0].message.content or "").strip()


def run_with_backends(
    prompt: str,
    *,
    task_kind: str = "qa",
    use_gaiol: bool = True,
) -> dict[str, Any]:
    started = time.perf_counter()
    failed = False
    error: str | None = None
    text = ""
    backend = "gaiol" if use_gaiol else "direct_api"

    try:
        if use_gaiol:
            text = extract_answer(post_orchestrate(prompt, task_kind=task_kind, domain=task_kind if task_kind != "qa" else "knowledge_retrieval"))
        else:
            text = openai_complete(prompt)
    except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError, TimeoutError) as exc:
        failed = True
        error = str(exc)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return {
        "backend": backend,
        "response": text,
        "latency_ms": elapsed_ms,
        "failed": failed,
        "error": error,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def merge_results(existing: dict[str, Any], suite: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    out = dict(existing)
    out[suite] = {
        "count": len(rows),
        "results": rows,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    return out


def save_standard_results(data: dict[str, Any]) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    STANDARD_RESULTS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return STANDARD_RESULTS_PATH
