import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini API key
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# ---- PATCH: Handle unexpected fields like 'thinking' ----
try:
    # Works for most versions (<=0.7.x)
    from google.generativeai import models as gen_models
    ModelClass = getattr(gen_models, "Model", None)
except ImportError:
    ModelClass = None

if ModelClass:
    old_init = ModelClass.__init__

    def patched_init(self, **kwargs):
        """Ignore extra unexpected fields like 'thinking'."""
        valid_args = {k: v for k, v in kwargs.items() if k in old_init.__code__.co_varnames}
        old_init(self, **valid_args)

    ModelClass.__init__ = patched_init
else:
    print("⚠️ Gemini SDK changed — using fallback mode for model listing.")

# ---- Utility to pick best stable models ----
def get_best_models():
    """Auto-selects best stable models for each agent role."""
    try:
        all_models = list(genai.list_models())
        model_names = [m.name for m in all_models]
    except Exception as e:
        print(f"⚠️ Model listing failed, fallback to defaults: {e}")
        model_names = []

    def pick(candidates):
        for name in candidates:
            if name in model_names:
                return name
        return candidates[0]  # fallback

    return {
        "planner": pick(["models/gemini-2.5-pro", "models/gemini-pro-latest"]),
        "codewriter": pick(["models/gemini-2.5-flash", "models/gemini-flash-latest"]),
        "reviewer": pick(["models/gemini-2.5-pro", "models/gemini-pro-latest"]),
        "stylist": pick(["models/gemini-2.5-flash-lite", "models/gemini-flash-lite-latest"]),
        "coordinator": pick(["models/gemini-pro-latest"]),
    }

MODELS = get_best_models()

print("\n✅ Gemini Models Configured:")
for role, name in MODELS.items():
    print(f"  {role:12} →  {name}")
