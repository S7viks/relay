import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

QUERIES_FILE = Path("ml_pipeline/data/queries.json")
OUTPUT_FILE = Path("ml_pipeline/data/responses/sys4_openrouter.jsonl")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "mistralai/mistral-7b-instruct"
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


def call_with_retry(api_key, query_text):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": query_text}],
        "temperature": 0.7,
        "max_tokens": 800,
    }

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.post(
                OPENROUTER_URL,
                headers=headers,
                json=payload,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            if response.status_code == 429:
                raise requests.HTTPError("429 Too Many Requests", response=response)
            response.raise_for_status()
            return response.json(), None
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if attempt >= MAX_RETRIES:
                break
            if status_code == 429 or "rate limit" in str(exc).lower():
                sleep_s = 2 ** (attempt - 1)
                print(f"Rate limited. Retrying in {sleep_s}s (attempt {attempt}/{MAX_RETRIES})")
                time.sleep(sleep_s)
                continue
            if status_code is not None and status_code >= 500:
                sleep_s = 2 ** (attempt - 1)
                print(f"Server error {status_code}. Retrying in {sleep_s}s (attempt {attempt}/{MAX_RETRIES})")
                time.sleep(sleep_s)
                continue
            break
    return None, last_error


def run():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("Sys-4 | Missing OPENROUTER_API_KEY. Skipping.")
        return 0

    queries = load_queries()
    processed_ids = load_processed_ids()
    pending = [q for q in queries if q["id"] not in processed_ids]
    if not pending:
        print("Sys-4 | All queries already processed.")
        return 0

    with OUTPUT_FILE.open("a", encoding="utf-8") as out:
        for query in pending:
            started = time.perf_counter()
            result, error = call_with_retry(api_key, query["query"])
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            failed = error is not None

            content = ""
            token_count = 0
            if not failed and isinstance(result, dict):
                choices = result.get("choices", [])
                if choices:
                    message = choices[0].get("message", {})
                    content = message.get("content", "") or ""
                token_count = result.get("usage", {}).get("total_tokens", 0)

            row = {
                "query_id": query["id"],
                "system": "sys4_openrouter",
                "domain": query["domain"],
                "difficulty": query["difficulty"],
                "query": query["query"],
                "response": content,
                "latency_ms": elapsed_ms,
                "confidence": 0.7,
                "models_used": [MODEL],
                "subtask_count": 1,
                "token_count": token_count,
                "failed": failed,
                "error": None if not failed else str(error),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            out.flush()

            status = "OK" if not failed else "FAIL"
            print(f"Sys-4 | {query['domain']} | {query['id']} | {elapsed_ms}ms | {status}")
            time.sleep(0.5)
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
