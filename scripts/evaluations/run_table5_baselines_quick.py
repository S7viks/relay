#!/usr/bin/env python3
"""Quick Table 5 perf for Sys-2..5 only (Sys-1 uses GAIOL scripts)."""

import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("t5", HERE / "run_table5_benchmark.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

mod.load_dotenv()
mod.LATENCY_RUNS = 5
mod.CONCURRENCY_LEVELS = [1, 10, 100]

results = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "query": mod.BASE_QUERY,
    "note": "Sys-2..5 only; Sys-1 from capacity/overhead scripts",
    "systems": {},
}

for sys_id in ["sys2_direct_api", "sys3_langchain", "sys4_openrouter", "sys5_multi_wrap"]:
    fn = mod.SYSTEMS[sys_id]
    label = mod.SYS_LABELS[sys_id]
    print(f"=== {label} ===", flush=True)
    lat = mod.run_latency_probe(fn, runs=5)
    print(f"  latency mean={lat['latency_ms_mean']} success={lat['success_rate_pct']}%", flush=True)
    tp = [mod.run_throughput(fn, n) for n in mod.CONCURRENCY_LEVELS]
    for row in tp:
        print(f"  N={row['concurrency']}: {row['throughput_req_per_s']} req/s", flush=True)
    results["systems"][sys_id] = {"label": label, "latency": lat, "throughput": tp}

out = HERE / "results" / "table5_baselines_results.json"
out.write_text(json.dumps(results, indent=2), encoding="utf-8")
print(f"Saved {out}", flush=True)
