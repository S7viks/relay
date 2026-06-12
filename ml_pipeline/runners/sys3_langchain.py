import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

QUERIES_FILE = Path("ml_pipeline/data/queries.json")
OUTPUT_FILE = Path("ml_pipeline/data/responses/sys3_langchain.jsonl")
MAX_RETRIES = 3

DOCUMENTS = [
    "Machine learning is a subset of artificial intelligence focused on learning patterns from data.",
    "Bayesian inference updates prior beliefs with observed evidence to obtain posterior probabilities.",
    "Distributed systems face the CAP theorem tradeoff among consistency, availability, and partition tolerance.",
    "Python binary search has O(log n) time complexity on sorted arrays.",
    "Normalization in databases reduces redundancy and update anomalies.",
    "Raft consensus uses leader election, log replication, and safety constraints for distributed agreement.",
    "Gradient descent iteratively updates model parameters to minimize a differentiable loss function.",
    "TCP provides reliable ordered delivery while UDP favors low-latency best-effort transmission.",
    "Hash tables provide average O(1) insert and lookup under good hashing assumptions.",
    "Sharding partitions data across nodes to increase throughput and storage capacity.",
    "Vector embeddings map high-dimensional semantics into dense numerical representations.",
    "Retrieval-augmented generation combines retrieval with generation for grounded responses.",
    "Big-O notation describes asymptotic growth as input size increases.",
    "A/B testing compares variants with statistical analysis to infer causal impact.",
    "Concurrency bugs include race conditions, deadlocks, and starvation.",
    "Indexes speed reads but may increase write amplification and storage overhead.",
    "Regularization methods like L1 and L2 reduce overfitting in machine learning models.",
    "Cache invalidation policies include TTL, write-through, and event-based eviction.",
    "Feature flags enable controlled rollout and rapid rollback of functionality.",
    "Observability combines logs, metrics, and traces for system diagnostics.",
]


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
    text = str(exc).lower()
    return "rate limit" in text or "too many requests" in text or "429" in text


def build_chain():
    try:
        from langchain.chains import RetrievalQA
    except ModuleNotFoundError as exc:
        print(f"Sys-3 | Missing dependency: {exc}. Install ml_pipeline/requirements.txt. Skipping.")
        return None, "dependency"

    try:
        from langchain_openai import ChatOpenAI, OpenAIEmbeddings
    except ImportError:
        try:
            from langchain.chat_models import ChatOpenAI
            from langchain.embeddings import OpenAIEmbeddings
        except ModuleNotFoundError as exc:
            print(f"Sys-3 | Missing dependency: {exc}. Install ml_pipeline/requirements.txt. Skipping.")
            return None, "dependency"

    try:
        from langchain_community.vectorstores import FAISS
    except ImportError:
        try:
            from langchain.vectorstores import FAISS
        except ModuleNotFoundError as exc:
            print(f"Sys-3 | Missing dependency: {exc}. Install ml_pipeline/requirements.txt. Skipping.")
            return None, "dependency"

    try:
        from langchain_core.documents import Document
    except ImportError:
        try:
            from langchain.docstore.document import Document
        except ModuleNotFoundError as exc:
            print(f"Sys-3 | Missing dependency: {exc}. Install ml_pipeline/requirements.txt. Skipping.")
            return None, "dependency"

    openai_key = os.getenv("OPENAI_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if not openai_key and not openrouter_key:
        return None, "keys"

    if openai_key:
        llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.7, openai_api_key=openai_key)
        embeddings = OpenAIEmbeddings(openai_api_key=openai_key)
    else:
        llm = ChatOpenAI(
            model="openai/gpt-3.5-turbo",
            temperature=0.7,
            openai_api_key=openrouter_key,
            openai_api_base="https://openrouter.ai/api/v1",
        )
        embeddings = OpenAIEmbeddings(
            openai_api_key=openrouter_key,
            openai_api_base="https://openrouter.ai/api/v1",
            model="text-embedding-3-small",
        )

    docs = [Document(page_content=text) for text in DOCUMENTS]
    vectorstore = FAISS.from_documents(docs, embeddings)
    retriever = vectorstore.as_retriever(search_kwargs={"k": 4})
    return RetrievalQA.from_chain_type(llm=llm, retriever=retriever, chain_type="stuff"), None


def ask_with_retry(qa_chain, query_text):
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = qa_chain.invoke({"query": query_text})
            return result, None
        except Exception as exc:
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


def extract_result_text(result):
    if isinstance(result, dict):
        return result.get("result") or result.get("answer") or ""
    return ""


def run():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    qa_chain, skip_reason = build_chain()
    if qa_chain is None:
        if skip_reason == "keys":
            print("Sys-3 | Missing OPENAI_API_KEY and OPENROUTER_API_KEY. Skipping.")
        return 0

    queries = load_queries()
    processed_ids = load_processed_ids()
    pending = [q for q in queries if q["id"] not in processed_ids]
    if not pending:
        print("Sys-3 | All queries already processed.")
        return 0

    with OUTPUT_FILE.open("a", encoding="utf-8") as out:
        for query in pending:
            started = time.perf_counter()
            result, error = ask_with_retry(qa_chain, query["query"])
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            failed = error is not None
            content = "" if failed else extract_result_text(result)

            row = {
                "query_id": query["id"],
                "system": "sys3_langchain",
                "domain": query["domain"],
                "difficulty": query["difficulty"],
                "query": query["query"],
                "response": content,
                "latency_ms": elapsed_ms,
                "confidence": 0.75,
                "models_used": ["gpt-3.5-turbo"],
                "subtask_count": 1,
                "token_count": 0,
                "failed": failed,
                "error": None if not failed else str(error),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            out.flush()

            status = "OK" if not failed else "FAIL"
            print(f"Sys-3 | {query['domain']} | {query['id']} | {elapsed_ms}ms | {status}")
            time.sleep(0.5)
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
