import concurrent.futures
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

QUERIES_FILE = Path("ml_pipeline/data/queries.json")
OUTPUT_FILE = Path("ml_pipeline/data/responses/sys5_multi_wrapper.jsonl")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL_GPT4 = "openai/gpt-4"
MODEL_GEMINI = "google/gemini-pro"
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


def confidence_from_length(text):
    length = len(text or "")
    return length / (length + 100) if length > 0 else 0.0


def call_model_with_retry(api_key, model, query_text):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
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
            data = response.json()
            choices = data.get("choices", [])
            content = ""
            if choices:
                content = choices[0].get("message", {}).get("content", "") or ""
            token_count = data.get("usage", {}).get("total_tokens", 0)
            return {"model": model, "content": content, "token_count": token_count, "error": None}
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if attempt >= MAX_RETRIES:
                break
            if status_code == 429 or "rate limit" in str(exc).lower():
                sleep_s = 2 ** (attempt - 1)
                print(f"Rate limited for {model}. Retrying in {sleep_s}s (attempt {attempt}/{MAX_RETRIES})")
                time.sleep(sleep_s)
                continue
            if status_code is not None and status_code >= 500:
                sleep_s = 2 ** (attempt - 1)
                print(f"Server error {status_code} for {model}. Retrying in {sleep_s}s (attempt {attempt}/{MAX_RETRIES})")
                time.sleep(sleep_s)
                continue
            break
    return {"model": model, "content": "", "token_count": 0, "error": str(last_error)}


def evaluate_query(api_key, query_text):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        future_map = {
            executor.submit(call_model_with_retry, api_key, MODEL_GPT4, query_text): MODEL_GPT4,
            executor.submit(call_model_with_retry, api_key, MODEL_GEMINI, query_text): MODEL_GEMINI,
        }
        results = []
        for future in concurrent.futures.as_completed(future_map):
            results.append(future.result())

    for result in results:
        result["confidence"] = confidence_from_length(result.get("content", ""))

    best = max(results, key=lambda r: r["confidence"])
    failed = all((r.get("error") for r in results))
    return best, results, failed


def run():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("Sys-5 | Missing OPENROUTER_API_KEY. Skipping.")
        return 0

    queries = load_queries()
    processed_ids = load_processed_ids()
    pending = [q for q in queries if q["id"] not in processed_ids]
    if not pending:
        print("Sys-5 | All queries already processed.")
        return 0

    with OUTPUT_FILE.open("a", encoding="utf-8") as out:
        for query in pending:
            started = time.perf_counter()
            best, candidates, failed = evaluate_query(api_key, query["query"])
            elapsed_ms = int((time.perf_counter() - started) * 1000)

            token_count = sum(c.get("token_count", 0) or 0 for c in candidates)
            error_text = None
            if failed:
                error_text = "; ".join(
                    f"{c['model']}: {c['error']}" for c in candidates if c.get("error")
                ) or "Both candidates failed"

            row = {
                "query_id": query["id"],
                "system": "sys5_multi_wrapper",
                "domain": query["domain"],
                "difficulty": query["difficulty"],
                "query": query["query"],
                "response": "" if failed else best.get("content", ""),
                "latency_ms": elapsed_ms,
                "confidence": 0.0 if failed else best.get("confidence", 0.0),
                "models_used": [best.get("model")] if not failed else [],
                "subtask_count": 2,
                "token_count": token_count,
                "failed": failed,
                "error": error_text,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "candidates": candidates,
            }
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            out.flush()

            status = "OK" if not failed else "FAIL"
            print(f"Sys-5 | {query['domain']} | {query['id']} | {elapsed_ms}ms | {status}")
            time.sleep(0.5)
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
