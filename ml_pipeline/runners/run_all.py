import argparse
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

RUNNERS = [
    "ml_pipeline/runners/sys1_gaiol.py",
    "ml_pipeline/runners/sys2_direct_api.py",
    "ml_pipeline/runners/sys3_langchain.py",
    "ml_pipeline/runners/sys4_openrouter.py",
    "ml_pipeline/runners/sys5_multi_wrapper.py",
]


def run_runner(runner_path):
    started = time.perf_counter()
    proc = subprocess.run([sys.executable, runner_path], check=False)
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return {
        "runner": runner_path,
        "return_code": proc.returncode,
        "elapsed_ms": elapsed_ms,
    }


def run_sequential():
    results = []
    for runner in RUNNERS:
        print(f"Running {runner} ...")
        results.append(run_runner(runner))
    return results


def run_parallel():
    results = []
    with ThreadPoolExecutor(max_workers=len(RUNNERS)) as pool:
        futures = {pool.submit(run_runner, runner): runner for runner in RUNNERS}
        for future in as_completed(futures):
            results.append(future.result())
    return results


def print_summary(results, total_ms):
    completed = [r for r in results if r["return_code"] == 0]
    failed = [r for r in results if r["return_code"] != 0]
    print("\n=== Runner Summary ===")
    for r in sorted(results, key=lambda x: x["runner"]):
        status = "OK" if r["return_code"] == 0 else "FAIL"
        print(f"{r['runner']} | {status} | code={r['return_code']} | {r['elapsed_ms']}ms")
    print(f"Completed: {len(completed)}")
    print(f"Failed: {len(failed)}")
    print(f"Total time: {total_ms}ms")


def main():
    parser = argparse.ArgumentParser(description="Run all baseline systems.")
    parser.add_argument("--parallel", action="store_true", help="Run all runners in parallel.")
    args = parser.parse_args()

    started = time.perf_counter()
    results = run_parallel() if args.parallel else run_sequential()
    total_ms = int((time.perf_counter() - started) * 1000)
    print_summary(results, total_ms)
    return 0 if all(r["return_code"] == 0 for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
