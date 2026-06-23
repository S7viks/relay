#!/usr/bin/env python3
"""Run Table 5 performance benchmarks for all five systems at matched concurrency."""

from __future__ import annotations

import json
import os
import statistics
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = Path(__file__).resolve().parent / "results"

BASE_QUERY = "Explain the advantages of microservices architecture."
CONCURRENCY_LEVELS = [1, 10, 100]
LATENCY_RUNS = 10
ORCHESTRATOR_URL = os.getenv("GAIOL_ORCHESTRATOR_URL", "http://localhost:8787").rstrip("/")
if not ORCHESTRATOR_URL.endswith("/v1/orchestrate"):
    ORCHESTRATOR_URL = f"{ORCHESTRATOR_URL}/v1/orchestrate"


def load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def http_json_post(url: str, payload: dict[str, Any], headers: dict[str, str] | None = None, timeout: float = 180.0) -> tuple[int, dict[str, Any] | str, float]:
    body = json.dumps(payload).encode("utf-8")
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    start = time.perf_counter()
    req = urllib.request.Request(url, data=body, headers=req_headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            elapsed_ms = (time.perf_counter() - start) * 1000
            try:
                return resp.status, json.loads(raw), elapsed_ms
            except json.JSONDecodeError:
                return resp.status, raw, elapsed_ms
    except urllib.error.HTTPError as err:
        elapsed_ms = (time.perf_counter() - start) * 1000
        try:
            detail = err.read().decode("utf-8")
        except Exception:
            detail = str(err)
        return err.code, detail, elapsed_ms
    except Exception as err:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return 0, str(err), elapsed_ms


def call_sys1() -> tuple[bool, float]:
    payload = {"objective": BASE_QUERY, "domain": "capacity", "consensus_mode": "uniform"}
    status, _, elapsed_ms = http_json_post(ORCHESTRATOR_URL, payload, timeout=600.0)
    return 200 <= status < 300, elapsed_ms


def call_sys2() -> tuple[bool, float]:
    or_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if or_key:
        payload = {
            "model": os.getenv("SYS2_BENCH_MODEL", "openrouter/free"),
            "messages": [{"role": "user", "content": BASE_QUERY}],
            "max_tokens": 400,
            "temperature": 0.7,
        }
        status, _, elapsed_ms = http_json_post(
            "https://openrouter.ai/api/v1/chat/completions",
            payload,
            headers={
                "Authorization": f"Bearer {or_key}",
                "HTTP-Referer": "https://gaiol.local",
                "X-Title": "GAIOL Table5 Benchmark",
            },
            timeout=120,
        )
        return 200 <= status < 300, elapsed_ms
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if not groq_key:
        return False, 0.0
    payload = {
        "model": os.getenv("GROQ_BENCH_MODEL", "llama-3.1-8b-instant"),
        "messages": [{"role": "user", "content": BASE_QUERY}],
        "max_tokens": 400,
        "temperature": 0.7,
    }
    status, _, elapsed_ms = http_json_post(
        "https://api.groq.com/openai/v1/chat/completions",
        payload,
        headers={"Authorization": f"Bearer {groq_key}"},
        timeout=60,
    )
    return 200 <= status < 300, elapsed_ms


def call_sys3() -> tuple[bool, float]:
    """LangChain-style RAG: retrieve top docs + single completion via OpenRouter."""
    or_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    docs = [
        "Microservices decompose applications into independently deployable services.",
        "Each service owns its data and communicates over lightweight protocols.",
        "Independent scaling and fault isolation are key microservices benefits.",
    ]
    query_tokens = set(BASE_QUERY.lower().split())
    ranked = sorted(docs, key=lambda d: -len(query_tokens & set(d.lower().split())))
    context = "\n".join(ranked[:2])
    prompt = f"Context:\n{context}\n\nQuestion: {BASE_QUERY}\nAnswer:"
    if or_key:
        payload = {
            "model": os.getenv("SYS3_BENCH_MODEL", "openrouter/free"),
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 400,
            "temperature": 0.7,
        }
        status, _, elapsed_ms = http_json_post(
            "https://openrouter.ai/api/v1/chat/completions",
            payload,
            headers={
                "Authorization": f"Bearer {or_key}",
                "HTTP-Referer": "https://gaiol.local",
                "X-Title": "GAIOL Table5 Benchmark",
            },
            timeout=120,
        )
        return 200 <= status < 300, elapsed_ms
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if not groq_key:
        return False, 0.0
    payload = {
        "model": os.getenv("GROQ_BENCH_MODEL", "llama-3.1-8b-instant"),
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 400,
        "temperature": 0.7,
    }
    status, _, elapsed_ms = http_json_post(
        "https://api.groq.com/openai/v1/chat/completions",
        payload,
        headers={"Authorization": f"Bearer {groq_key}"},
        timeout=60,
    )
    return 200 <= status < 300, elapsed_ms


def call_sys4() -> tuple[bool, float]:
    or_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not or_key:
        return False, 0.0
    payload = {
        "model": os.getenv("OPENROUTER_BENCH_MODEL", "openrouter/free"),
        "messages": [{"role": "user", "content": BASE_QUERY}],
        "max_tokens": 400,
        "temperature": 0.7,
    }
    status, _, elapsed_ms = http_json_post(
        "https://openrouter.ai/api/v1/chat/completions",
        payload,
        headers={
            "Authorization": f"Bearer {or_key}",
            "HTTP-Referer": "https://gaiol.local",
            "X-Title": "GAIOL Table5 Benchmark",
        },
        timeout=90,
    )
    return 200 <= status < 300, elapsed_ms


def call_sys5() -> tuple[bool, float]:
    """Naive multi-model: two OpenRouter calls sequentially (no consensus)."""
    or_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not or_key:
        return False, 0.0
    headers = {
        "Authorization": f"Bearer {or_key}",
        "HTTP-Referer": "https://gaiol.local",
        "X-Title": "GAIOL Table5 Benchmark",
    }
    models = [
        os.getenv("SYS5_MODEL_A", "openrouter/free"),
        os.getenv("SYS5_MODEL_B", "openrouter/free"),
    ]
    start = time.perf_counter()
    ok = True
    for model in models:
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": BASE_QUERY}],
            "max_tokens": 200,
            "temperature": 0.7,
        }
        status, _, _ = http_json_post(
            "https://openrouter.ai/api/v1/chat/completions",
            payload,
            headers=headers,
            timeout=90,
        )
        if status < 200 or status >= 300:
            ok = False
    elapsed_ms = (time.perf_counter() - start) * 1000
    return ok, elapsed_ms


SYSTEMS: dict[str, Callable[[], tuple[bool, float]]] = {
    "sys1_gaiol": call_sys1,
    "sys2_direct_api": call_sys2,
    "sys3_langchain": call_sys3,
    "sys4_openrouter": call_sys4,
    "sys5_multi_wrap": call_sys5,
}

SYS_LABELS = {
    "sys1_gaiol": "Sys-1",
    "sys2_direct_api": "Sys-2",
    "sys3_langchain": "Sys-3",
    "sys4_openrouter": "Sys-4",
    "sys5_multi_wrap": "Sys-5",
}


def ci95(values: list[float]) -> tuple[float, float, float]:
    if not values:
        return 0.0, 0.0, 0.0
    mean = statistics.mean(values)
    if len(values) < 2:
        return mean, mean, mean
    stdev = statistics.stdev(values)
    half = 1.96 * stdev / (len(values) ** 0.5)
    return mean, mean - half, mean + half


def run_latency_probe(fn: Callable[[], tuple[bool, float]], runs: int = LATENCY_RUNS) -> dict[str, Any]:
    latencies: list[float] = []
    successes = 0
    for _ in range(runs):
        ok, ms = fn()
        if ok:
            successes += 1
            latencies.append(ms)
    mean, lo, hi = ci95(latencies)
    return {
        "runs": runs,
        "successes": successes,
        "success_rate_pct": round(100.0 * successes / runs, 1),
        "error_rate_pct": round(100.0 * (runs - successes) / runs, 1),
        "latency_ms_mean": round(mean, 1),
        "latency_ms_ci95_low": round(lo, 1),
        "latency_ms_ci95_high": round(hi, 1),
        "latency_samples_ms": [round(x, 1) for x in latencies],
    }


def run_throughput(fn: Callable[[], tuple[bool, float]], concurrency: int) -> dict[str, Any]:
    successes = 0
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(fn) for _ in range(concurrency)]
        for fut in as_completed(futures):
            try:
                ok, _ = fut.result()
                if ok:
                    successes += 1
            except Exception:
                pass
    duration_ms = (time.perf_counter() - start) * 1000
    qps = (successes / duration_ms) * 1000 if duration_ms > 0 else 0.0
    return {
        "concurrency": concurrency,
        "duration_ms": round(duration_ms, 1),
        "successes": successes,
        "success_rate_pct": round(100.0 * successes / concurrency, 1),
        "error_rate_pct": round(100.0 * (concurrency - successes) / concurrency, 1),
        "throughput_req_per_s": round(qps, 2),
    }


def main() -> None:
    load_dotenv()
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print("Table 5 benchmark — matched concurrency N=1,10,100")
    print(f"Orchestrator: {ORCHESTRATOR_URL}")
    print(f"Query: {BASE_QUERY[:60]}...")

    results: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "query": BASE_QUERY,
        "concurrency_levels": CONCURRENCY_LEVELS,
        "systems": {},
    }

    for sys_id, fn in SYSTEMS.items():
        label = SYS_LABELS[sys_id]
        print(f"\n=== {label} ({sys_id}) ===")
        sys_result: dict[str, Any] = {"label": label}

        print(f"  Latency probe ({LATENCY_RUNS} sequential runs)...")
        lat = run_latency_probe(fn)
        sys_result["latency"] = lat
        print(f"    mean={lat['latency_ms_mean']} ms, success={lat['success_rate_pct']}%")

        throughput_by_n: list[dict[str, Any]] = []
        for n in CONCURRENCY_LEVELS:
            print(f"  Throughput N={n}...")
            tp = run_throughput(fn, n)
            throughput_by_n.append(tp)
            print(f"    {tp['throughput_req_per_s']} req/s ({tp['successes']}/{n} ok)")
        sys_result["throughput"] = throughput_by_n
        results["systems"][sys_id] = sys_result

    out_path = RESULTS_DIR / "table5_benchmark_results.json"
    out_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nSaved: {out_path}")


if __name__ == "__main__":
    main()
