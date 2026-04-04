import json
import time
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ORCHESTRATOR_URL = "http://localhost:3001/v1/orchestrate"
QUERIES_FILE = Path("ml_pipeline/data/queries.json")
OUTPUT_FILE = Path("ml_pipeline/data/responses/sys1_gaiol.jsonl")
MAX_RETRIES = 3
REQUEST_TIMEOUT_SECONDS = 60


def load_queries():
    if not QUERIES_FILE.exists():
        raise FileNotFoundError(f"Missing queries file: {QUERIES_FILE}")
    with QUERIES_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_processed_ids():
    processed = set()
    if not OUTPUT_FILE.exists():
        return processed
    with OUTPUT_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            query_id = row.get("query_id")
            if query_id:
                processed.add(query_id)
    return processed


def is_rate_limited(err):
    if isinstance(err, urllib.error.HTTPError):
        return err.code == 429
    text = str(err).lower()
    return "rate limit" in text or "too many requests" in text


def post_with_retry(payload):
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        req = urllib.request.Request(ORCHESTRATOR_URL, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
                return json.loads(resp.read().decode("utf-8")), None
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as err:
            last_error = err
            if attempt >= MAX_RETRIES:
                break
            if is_rate_limited(err):
                sleep_s = 2 ** (attempt - 1)
                print(f"Rate limited. Retrying in {sleep_s}s (attempt {attempt}/{MAX_RETRIES})")
                time.sleep(sleep_s)
                continue
            if isinstance(err, urllib.error.HTTPError) and err.code >= 500:
                sleep_s = 2 ** (attempt - 1)
                print(f"Server error {err.code}. Retrying in {sleep_s}s (attempt {attempt}/{MAX_RETRIES})")
                time.sleep(sleep_s)
                continue
            break
    return None, last_error


def extract_content(response):
    if not isinstance(response, dict):
        return ""
    result = response.get("result")
    if isinstance(result, dict) and "content" in result:
        return result.get("content") or ""
    return response.get("content") or response.get("response") or ""


def run():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    queries = load_queries()
    processed_ids = load_processed_ids()
    pending = [q for q in queries if q["id"] not in processed_ids]
    if not pending:
        print("Sys-1 | All queries already processed.")
        return 0

    with OUTPUT_FILE.open("a", encoding="utf-8") as out:
        for query in pending:
            started = time.perf_counter()
            payload = {
                "schema_version": "1.0",
                "trace_id": f"sys1-{query['id']}-{uuid.uuid4().hex[:8]}",
                "task_kind": query["domain"],
                "objective": query["query"],
                "constraints": {"temperature": 0.7, "max_tokens": 800},
                "consensus_mode": "abtc",
                "beam_width": 3,
                "explore_paths": True,
            }
            response_data, error = post_with_retry(payload)
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            failed = error is not None
            content = "" if failed else extract_content(response_data)
            metrics = response_data.get("metrics", {}) if isinstance(response_data, dict) else {}

            row = {
                "query_id": query["id"],
                "system": "sys1_gaiol",
                "domain": query["domain"],
                "difficulty": query["difficulty"],
                "query": query["query"],
                "response": content,
                "latency_ms": elapsed_ms,
                "confidence": metrics.get("confidence", 0.5),
                "models_used": metrics.get("modelsUsed", []),
                "subtask_count": metrics.get("subtaskCount", 1),
                "token_count": metrics.get("totalTokens", 0),
                "failed": failed,
                "error": None if not failed else str(error),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            out.flush()

            status = "OK" if not failed else "FAIL"
            print(f"Sys-1 | {query['domain']} | {query['id']} | {elapsed_ms}ms | {status}")
            time.sleep(0.5)
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
