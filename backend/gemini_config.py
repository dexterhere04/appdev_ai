"""
Gemini + LangChain config with built-in LangSmith tracing.
-----------------------------------------------------------
- Auto-selects best Gemini models for each agent role
- Builds LangChain-native runnables
- Enables LangSmith tracing for debugging and visualization
"""

import os
import threading
from pathlib import Path

from dotenv import load_dotenv, dotenv_values

load_dotenv()

# -------------------------------------------------------------------------
# 🧠 Environment Validation
# -------------------------------------------------------------------------
_ENV_FILE = Path(__file__).with_name(".env")


def _env_value(name: str) -> str | None:
    """Read an env var, tolerating an empty value injected by the container.

    `docker compose` passes `GEMINI_API_KEY: ${GEMINI_API_KEY:-}` from the root
    `.env`. When that root var is unset this injects an *empty* string, which
    shadows the real key in `backend/.env` because `load_dotenv()` never
    overrides existing environment entries. Treat empty as unset and fall back
    to the file's value directly (without mutating os.environ, which would also
    clobber lazily-read secrets like FCB_SECRET).
    """
    value = os.getenv(name)
    if value:
        return value
    # Only consult the file when the var exists but is empty. A var that is
    # genuinely unset (e.g. popped by a test) stays unset.
    if name in os.environ and _ENV_FILE.exists():
        return dotenv_values(_ENV_FILE).get(name) or None
    return None


API_KEY = _env_value("GEMINI_API_KEY")
if not API_KEY:
    raise EnvironmentError("❌ Missing GEMINI_API_KEY in environment (.env)")

# LangSmith optional tracing (free tier available)
LANGCHAIN_TRACING = os.getenv("LANGCHAIN_TRACING_V2", "true").lower() == "true"
LANGCHAIN_API_KEY = os.getenv("LANGCHAIN_API_KEY")
LANGCHAIN_PROJECT = os.getenv("LANGCHAIN_PROJECT", "GeminiDesignAI")

if LANGCHAIN_TRACING:
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    if LANGCHAIN_API_KEY:
        os.environ["LANGCHAIN_API_KEY"] = LANGCHAIN_API_KEY
    os.environ["LANGCHAIN_PROJECT"] = LANGCHAIN_PROJECT
    print(f"🪶 LangSmith tracing enabled → project: {LANGCHAIN_PROJECT}")
else:
    os.environ["LANGCHAIN_TRACING_V2"] = "false"
    print("⚙️ LangSmith tracing disabled.")


# -------------------------------------------------------------------------
# 🔮 Gemini Configuration
# -------------------------------------------------------------------------
import google.generativeai as genai
from langchain_google_genai import ChatGoogleGenerativeAI

genai.configure(api_key=API_KEY)


def _safe_list_models(timeout: float = 8.0):
    """Fetch model list safely without blocking startup."""
    result, err = [], [None]

    def _fetch():
        try:
            result.extend(list(genai.list_models()))
        except Exception as e:
            err[0] = e

    t = threading.Thread(target=_fetch, daemon=True)
    t.start()
    t.join(timeout)
    if t.is_alive() or err[0]:
        return []
    return result


_all_models = _safe_list_models()
_available = [m.name for m in _all_models] if _all_models else []


# -------------------------------------------------------------------------
# 🎯 Model Selection per Role
# -------------------------------------------------------------------------
# Models per role, free-tier-safe first. The first entry the key can list
# becomes the primary; the rest stay as runtime fallbacks via `with_fallbacks`,
# which covers models that list fine but fail at call time — a retired model
# (404) or a tier with zero quota (429). Pro models are included last because a
# free-tier key has zero Pro quota: trying one first burns ~90s in internal
# 429 retries before the fallback even runs. Set FCB_GEMINI_PREFER_PRO=1 to
# promote Pro to the front (for keys with billing enabled).
_MODEL_CANDIDATES = {
    "planner": [
        "models/gemini-flash-latest",
        "models/gemini-3.5-flash",
        "models/gemini-pro-latest",
        "models/gemini-3.1-pro-preview",
    ],
    "codewriter": [
        "models/gemini-flash-latest",
        "models/gemini-3.5-flash",
        "models/gemini-pro-latest",
    ],
    "reviewer": [
        "models/gemini-flash-latest",
        "models/gemini-3.5-flash",
        "models/gemini-pro-latest",
        "models/gemini-3.1-pro-preview",
    ],
    "stylist": [
        "models/gemini-flash-lite-latest",
        "models/gemini-3.5-flash-lite",
        "models/gemini-flash-latest",
    ],
    "coordinator": [
        "models/gemini-flash-latest",
        "models/gemini-3.5-flash",
        "models/gemini-pro-latest",
        "models/gemini-3.1-pro-preview",
    ],
}

_PREFER_PRO = os.getenv("FCB_GEMINI_PREFER_PRO", "false").strip().lower() in {
    "1", "true", "yes", "on",
}


def _ordered_candidates(role: str) -> list[str]:
    """Candidates for `role`: preferred tier first, then models the key can list."""
    cands = _MODEL_CANDIDATES.get(role, _MODEL_CANDIDATES["coordinator"])
    if _PREFER_PRO:
        cands = [m for m in cands if "pro" in m] + [m for m in cands if "pro" not in m]
    listed = [m for m in cands if m in _available]
    unlisted = [m for m in cands if m not in _available]
    return (listed + unlisted) if listed else list(cands)


MODELS = {role: _ordered_candidates(role)[0] for role in _MODEL_CANDIDATES}


# -------------------------------------------------------------------------
# 🧩 Runnable Builder (LangChain-compatible)
# -------------------------------------------------------------------------
def get_model_for(role: str) -> str:
    """Return the Gemini model name for a given agent role."""
    return MODELS.get(role, MODELS["coordinator"])


def _build_model(
    model_id: str,
    *,
    temperature: float,
    streaming: bool,
    retry: int,
    max_output_tokens: int | None,
):
    llm = ChatGoogleGenerativeAI(
        model=model_id,
        api_key=API_KEY,
        temperature=temperature,
        streaming=streaming,
    )

    # Optional: add retry + max token binding
    try:
        if retry and hasattr(llm, "with_retry"):
            llm = llm.with_retry(retries=retry)
    except Exception:
        pass

    try:
        if max_output_tokens and hasattr(llm, "bind"):
            llm = llm.bind({"max_output_tokens": max_output_tokens})
    except Exception:
        pass

    return llm


def get_runnable_llm(
    role: str,
    *,
    temperature: float = 0.6,
    streaming: bool = False,
    retry: int = 1,
    max_output_tokens: int | None = None,
):
    """Build a ChatGoogleGenerativeAI runnable with model fallbacks.

    If the preferred model errors at call time (retired → 404, or no quota on
    this tier → 429), LangChain transparently retries with the next candidate.
    """
    candidates = _ordered_candidates(role)
    runnables = [
        _build_model(
            model_id,
            temperature=temperature,
            streaming=streaming,
            retry=retry,
            max_output_tokens=max_output_tokens,
        )
        for model_id in candidates
    ]

    primary, *fallbacks = runnables
    if fallbacks:
        primary = primary.with_fallbacks(fallbacks)
    return primary


# -------------------------------------------------------------------------
# 🚀 Prebuilt Runnables for All Roles
# -------------------------------------------------------------------------
prebuilt_runnables = {}
for role in MODELS.keys():
    try:
        prebuilt_runnables[role] = get_runnable_llm(
            role, temperature=0.5, streaming=False, retry=1
        )
    except Exception:
        prebuilt_runnables[role] = None


# -------------------------------------------------------------------------
# 🧾 Startup Summary
# -------------------------------------------------------------------------
if __name__ == "__main__":
    print("\n✅ Gemini Models Configured:")
    for role, name in MODELS.items():
        print(f"  {role:12} → {name}")
    ok = sum(v is not None for v in prebuilt_runnables.values())
    print(f"Prebuilt runnables: {ok}/{len(prebuilt_runnables)} ready.")
