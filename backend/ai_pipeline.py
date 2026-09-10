"""AI generation pipeline that APPLIES files into a user's project (Agent 5).

Contract 7: coordinator output is normalized to `{files: [{path, content}]}`;
every path is validated (safe charset, no `..`, no absolute, no reserved root
segments, size/count caps) and written through workspace.write_file.

Model output is untrusted. If the pipeline is unavailable (no key) or produces
nothing parseable, a deterministic fallback still returns a valid minimal app so
the product promise ("get a scaffold") never depends on the model.
"""
from __future__ import annotations

import json
import logging
import re
from typing import AsyncIterator

import workspace as ws

log = logging.getLogger("ai")

MAX_FILES = 25
MAX_FILE_BYTES = 200_000
RESERVED_ROOT = {"pubspec.lock", ".dart_tool", "build"}
_DART_MULTI = re.compile(r"```dart\n(.*?)```", re.DOTALL)

STEPS = ["vision", "ux", "ui", "critique", "code", "style"]


class AIPipelineError(Exception):
    pass


# ---- extraction ----

def _extract_files(payload: str | dict) -> list[dict]:
    """Pull `{file|path, content}` objects out of whatever the coordinator
    returned (raw JSON, markdown-fenced JSON, or a dict)."""
    if isinstance(payload, dict):
        for key in ("final_code", "code", "files", "result"):
            if key in payload:
                payload = payload[key]
                break
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, str):
        return []

    text = payload.strip()
    # strip markdown fences
    fenced = re.search(r"```(?:json|dart)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Heuristic: a raw dart file blob → single main.dart
        if _looks_like_dart(text):
            return [{"path": "lib/main.dart", "content": text}]
        return []
    return data if isinstance(data, list) else (data.get("files", []) if isinstance(data, dict) else [])


def _looks_like_dart(text: str) -> bool:
    return "void main" in text or "runApp(" in text or "MaterialApp(" in text


def _normalize_path(path: str) -> str:
    """Place model-authored Dart files under lib/ so Flutter compiles them.

    The coordinator prompt asks for entries like {"file": "screen.dart"}, so
    models routinely omit the lib/ prefix. A bare .dart file at the project root
    is ignored by the Flutter toolchain (only lib/ is compiled), which silently
    discards the generated app. Normalize before validation.
    """
    if not path:
        return path
    p = path.strip()
    while p.startswith("./"):
        p = p[2:]
    if p.startswith(("lib/", "web/", "assets/", ".")) or p == "pubspec.yaml":
        return p
    if p.endswith(".dart"):
        return f"lib/{p}"
    return p


def _validate_file(path: str, content: str) -> str:
    """Return the sanitized path or raise AIPipelineError."""
    if not path or not ws.SAFE_PATH.match(path) or ".." in ws.Path(path).parts or ws.Path(path).is_absolute():
        raise AIPipelineError(f"unsafe AI file path: {path!r}")
    if not path.endswith(".dart") and not path.endswith(".yaml") and path not in ("pubspec.yaml",):
        # allow only files a generated app legitimately needs
        if not (path.startswith("web/") and (path.endswith(".html") or path.endswith(".png") or path.endswith(".json") or path.endswith(".js") or path.endswith(".ico"))):
            if not (path.startswith("assets/") and (path.endswith(".json") or path.endswith(".yaml"))):
                raise AIPipelineError(f"disallowed AI file type: {path!r}")
    if path in RESERVED_ROOT or path.startswith(".dart_tool/") or path.startswith("build/"):
        raise AIPipelineError(f"reserved AI file path: {path!r}")
    if len(content.encode("utf-8")) > MAX_FILE_BYTES:
        raise AIPipelineError(f"AI file too large: {path!r}")
    return path


async def run_pipeline(
    prompt: str,
    base,
    on_step=None,
) -> dict:
    """Run the coordinator (or fallback) and write files into `base`.

    `on_step(step, status, detail)` is called for progress. Returns
    `{applied: [paths], source: "ai" | "fallback", logs: [str]}`.
    """
    logs: list[str] = []
    result_files: list[dict] = []
    source = "fallback"

    def _log(msg: str):
        logs.append(msg)
        if on_step:
            on_step(None, "log", msg)

    if on_step:
        for s in STEPS:
            on_step(s, "start", "")

    try:
        # CoordinatorAgent import itself requires the Gemini key at import time
        # (gemini_config raises EnvironmentError without it), so the try wraps
        # import + run.
        from ai_agents.coordinator import CoordinatorAgent

        coordinator = CoordinatorAgent()

        async def _call_with(step, fn, *args):
            if on_step:
                on_step(step, "run", "")
            return await fn(*args)

        vision = await _call_with("vision", coordinator.director.create_vision, prompt)
        ux = await _call_with("ux", coordinator.architect.design_structure, vision)
        ui = await _call_with("ui", coordinator.ui_designer.design_ui, ux)
        critique = await _call_with("critique", coordinator.critic.review_design, ui)
        if "issues" in critique.lower():
            ui = await _call_with("ui", coordinator.ui_designer.design_ui, f"{ux}\n\nFeedback:\n{critique}")
        code = await _call_with("code", coordinator.codewriter.generate_code, ux)
        styled = await _call_with("style", coordinator.stylist.apply_style, code)

        raw_files = _extract_files(styled) or _extract_files(code)
        if raw_files:
            result_files = raw_files
            source = "ai"
        else:
            _log("AI produced no parseable files; using fallback template.")
    except Exception as e:
        log.exception("AI pipeline failed")
        _log(f"AI pipeline unavailable ({type(e).__name__}: {e}); using fallback template.")

    if not result_files:
        result_files = fallback_files(prompt)
        source = "fallback"
        _log("Generated deterministic fallback app.")

    # Validate + apply.
    applied: list[str] = []
    if len(result_files) > MAX_FILES:
        raise AIPipelineError(f"too many AI files ({len(result_files)} > {MAX_FILES})")
    seen: set[str] = set()
    for f in result_files:
        path = str(f.get("path") or f.get("file") or "").strip()
        content = str(f.get("content") or "")
        path = _normalize_path(path)
        path = _validate_file(path, content)
        if path in seen:
            continue
        seen.add(path)
        ws.write_file(base, path, content)
        applied.append(path)

    # Ensure a runnable entrypoint exists even if the model forgot it.
    if "lib/main.dart" not in seen:
        main = str((base / "lib" / "main.dart"))
        ws.write_file(base, "lib/main.dart", _fallback_main(prompt))
        applied.insert(0, "lib/main.dart")
        _log("Ensured lib/main.dart entrypoint.")

    if on_step:
        for s in STEPS:
            on_step(s, "done", "")
        on_step("apply", "done", f"wrote {len(applied)} files")
    return {"applied": applied, "source": source, "logs": logs}


# ---- deterministic fallback ----

def _theme_seed(prompt: str) -> int:
    """Pick a Material seed color from the prompt so results feel bespoke."""
    lowered = prompt.lower()
    palette = [
        ("green", 0xFF2E7D32), ("blue", 0xFF1565C0), ("red", 0xFFC62828),
        ("purple", 0xFF6A1B9A), ("orange", 0xFFE65100), ("teal", 0xFF00695C),
        ("pink", 0xFFAD1457), ("indigo", 0xFF283593), ("cyan", 0xFF00838F),
        ("brown", 0xFF4E342E),
    ]
    for name, color in palette:
        if name in lowered:
            return color
    return 0xFF2E7D32


def fallback_files(prompt: str) -> list[dict]:
    return [{"path": "lib/main.dart", "content": _fallback_main(prompt)}]


def _fallback_main(prompt: str) -> str:
    seed = _theme_seed(prompt)
    title = _title_from(prompt)
    return f"""import 'package:flutter/material.dart';

void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {{
  const MyApp({{super.key}});

  @override
  Widget build(BuildContext context) {{
    return MaterialApp(
      title: {title!r},
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0x{seed:08X})),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }}
}}

class HomeScreen extends StatelessWidget {{
  const HomeScreen({{super.key}});

  @override
  Widget build(BuildContext context) {{
    return Scaffold(
      appBar: AppBar(title: const Text({title!r})),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'A Flutter app scaffolded from your prompt.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 18),
          ),
        ),
      ),
    );
  }}
}}
"""


def _title_from(prompt: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", prompt)
    meaningful = [w for w in words if len(w) > 2 and w.lower() not in {
        "the", "and", "for", "with", "that", "this", "app", "make", "build", "create", "using", "from", "you", "your"}]
    if meaningful:
        return " ".join(meaningful[:4]).title()
    return "My App"
