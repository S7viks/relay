import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from openai import OpenAI

QUERIES_FILE = Path("ml_pipeline/data/queries.json")
OUTPUT_FILE = Path("ml_pipeline/data/responses/sys2_direct_api.jsonl")
MAX_RETRIES = 3


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


def is_rate_limited(exc):
    status_code = getattr(exc, "status_code", None)
    if status_code == 429:
        return True
    text = str(exc).lower()
    return "rate limit" in text or "too many requests" in text or "429" in text


def make_client():
    openai_key = os.getenv("OPENAI_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")

    if openai_key:
        return OpenAI(api_key=openai_key), "gpt-4"
    if openrouter_key:
        return OpenAI(api_key=openrouter_key, base_url="https://openrouter.ai/api/v1"), "openai/gpt-4"
    return None, None


def call_with_retry(client, model, query_text):
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": query_text}],
                temperature=0.7,
                max_tokens=800,
            )
            return resp, None
        except Exception as exc:  # SDK-specific exception classes vary by version.
            last_error = exc
            if attempt >= MAX_RETRIES:
                break
            if is_rate_limited(exc):
                sleep_s = 2 ** (attempt - 1)
                print(f"Rate limited. Retrying in {sleep_s}s (attempt {attempt}/{MAX_RETRIES})")
                time.sleep(sleep_s)
                continue
            break
    return None, last_error


def run():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    client, model = make_client()
    if client is None:
        print("Sys-2 | Missing OPENAI_API_KEY and OPENROUTER_API_KEY. Skipping.")
        return 0

    queries = load_queries()
    processed_ids = load_processed_ids()
    pending = [q for q in queries if q["id"] not in processed_ids]
    if not pending:
        print("Sys-2 | All queries already processed.")
        return 0

    with OUTPUT_FILE.open("a", encoding="utf-8") as out:
        for query in pending:
            started = time.perf_counter()
            resp, error = call_with_retry(client, model, query["query"])
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            failed = error is not None

            content = ""
            token_count = 0
            if not failed and resp is not None:
                if resp.choices:
                    content = resp.choices[0].message.content or ""
                usage = getattr(resp, "usage", None)
                if usage is not None:
                    token_count = getattr(usage, "total_tokens", 0) or 0

            row = {
                "query_id": query["id"],
                "system": "sys2_direct_api",
                "domain": query["domain"],
                "difficulty": query["difficulty"],
                "query": query["query"],
                "response": content,
                "latency_ms": elapsed_ms,
                "confidence": 1.0,
                "models_used": ["gpt-4"],
                "subtask_count": 1,
                "token_count": token_count,
                "failed": failed,
                "error": None if not failed else str(error),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            out.flush()

            status = "OK" if not failed else "FAIL"
            print(f"Sys-2 | {query['domain']} | {query['id']} | {elapsed_ms}ms | {status}")
            time.sleep(0.5)
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
