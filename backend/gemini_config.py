"""
Gemini + LangChain config with built-in LangSmith tracing.
-----------------------------------------------------------
- Auto-selects best Gemini models for each agent role
- Builds LangChain-native runnables
- Enables LangSmith tracing for debugging and visualization
"""

import os
import threading
from dotenv import load_dotenv

load_dotenv()

# -------------------------------------------------------------------------
# 🧠 Environment Validation
# -------------------------------------------------------------------------
API_KEY = os.getenv("GEMINI_API_KEY")
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


def _safe_list_models(timeout: float = 3.0):
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


def _pick(candidates):
    for name in candidates:
        if name in _available:
            return name
    return candidates[0]


# -------------------------------------------------------------------------
# 🎯 Model Selection per Role
# -------------------------------------------------------------------------
MODELS = {
    "planner": _pick([
        "models/gemini-2.5-pro",
        "models/gemini-2.5-pro-preview-06-05",
        "models/gemini-pro-latest",
    ]),
    "codewriter": _pick([
        "models/gemini-2.5-flash",
        "models/gemini-flash-latest",
    ]),
    "reviewer": _pick([
        "models/gemini-2.5-pro",
        "models/gemini-pro-latest",
    ]),
    "stylist": _pick([
        "models/gemini-2.5-flash-lite",
        "models/gemini-flash-lite-latest",
    ]),
    "coordinator": _pick([
        "models/gemini-pro-latest",
        "models/gemini-2.5-pro",
    ]),
}


# -------------------------------------------------------------------------
# 🧩 Runnable Builder (LangChain-compatible)
# -------------------------------------------------------------------------
def get_model_for(role: str) -> str:
    """Return the Gemini model name for a given agent role."""
    return MODELS.get(role, MODELS["coordinator"])


def get_runnable_llm(
    role: str,
    *,
    temperature: float = 0.6,
    streaming: bool = False,
    retry: int = 1,
    max_output_tokens: int | None = None,
):
    """Builds and returns a ChatGoogleGenerativeAI runnable."""
    model_id = get_model_for(role)

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
