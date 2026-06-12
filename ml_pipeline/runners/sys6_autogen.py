"""Optional AutoGen baseline: direct provider API vs GAIOL-backed OpenAI-compatible proxy.

Requires: pip install pyautogen (or autogen-agentchat)
Set AUTOGEN_ENABLED=1 to run; otherwise writes a skip manifest for reproducibility.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "ml_pipeline" / "results" / "autogen_baseline.json"
SAMPLE_TASK = (
    "Write a Python function `is_palindrome(s: str) -> bool` and explain its time complexity in one sentence."
)


def _write_skip(reason: str) -> int:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "status": "skipped",
        "reason": reason,
        "protocol": "AutoGen UserProxy + AssistantAgent; compare llm_config base_url direct vs GAIOL proxy",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    OUTPUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"AutoGen baseline skipped: {reason}")
    print(f"Manifest: {OUTPUT}")
    return 0


def _run_autogen(base_url: str | None, api_key: str, model: str, label: str) -> dict:
    try:
        import autogen  # type: ignore
    except ImportError:
        return {"label": label, "skipped": True, "error": "pyautogen not installed"}

    llm_config = {
        "config_list": [{"model": model, "api_key": api_key, **({"base_url": base_url} if base_url else {})}],
        "temperature": 0.2,
    }
    assistant = autogen.AssistantAgent(name="assistant", llm_config=llm_config)
    user = autogen.UserProxyAgent(
        name="user",
        human_input_mode="NEVER",
        max_consecutive_auto_reply=1,
        code_execution_config=False,
    )
    user.initiate_chat(assistant, message=SAMPLE_TASK, silent=True)
    last = ""
    for msg in reversed(user.chat_messages.get(assistant, [])):
        if msg.get("role") == "assistant" and msg.get("content"):
            last = str(msg["content"])
            break
    return {"label": label, "response_preview": last[:500], "response_chars": len(last), "skipped": False}


def main() -> int:
    if os.getenv("AUTOGEN_ENABLED", "").strip().lower() not in {"1", "true", "yes", "on"}:
        return _write_skip("AUTOGEN_ENABLED not set")

    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        return _write_skip("OPENAI_API_KEY or OPENROUTER_API_KEY required")

    model = os.getenv("BENCHMARK_MODEL", "gpt-4o-mini")
    gaiol_proxy = os.getenv("GAIOL_OPENAI_PROXY_URL", "").strip() or None

    direct = _run_autogen(None, api_key, model, "autogen_direct_api")
    gaiol = (
        _run_autogen(gaiol_proxy, api_key, model, "autogen_on_gaiol")
        if gaiol_proxy
        else {"label": "autogen_on_gaiol", "skipped": True, "error": "GAIOL_OPENAI_PROXY_URL not set"}
    )

    payload = {
        "status": "completed",
        "task": SAMPLE_TASK,
        "direct_api": direct,
        "gaiol_backend": gaiol,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"AutoGen baseline saved to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
