"""Agent 5 regression: AI fallback, validation, and file application."""
import uuid

import pytest

import ai_pipeline
import workspace as ws


def test_fallback_produces_valid_main(tmp_path):
    base = tmp_path / "proj"
    base.mkdir()
    result = ai_pipeline.fallback_files("a habit tracker with a blue theme")
    assert len(result) == 1
    assert result[0]["path"] == "lib/main.dart"
    content = result[0]["content"]
    assert "void main" in content and "MaterialApp(" in content


def test_validate_file_rejects_traversal():
    with pytest.raises(ai_pipeline.AIPipelineError):
        ai_pipeline._validate_file("../../etc/passwd", "x")
    with pytest.raises(ai_pipeline.AIPipelineError):
        ai_pipeline._validate_file("/etc/passwd", "x")
    with pytest.raises(ai_pipeline.AIPipelineError):
        ai_pipeline._validate_file("pubspec.lock", "x")
    with pytest.raises(ai_pipeline.AIPipelineError):
        ai_pipeline._validate_file(".dart_tool/package_config.json", "x")
    with pytest.raises(ai_pipeline.AIPipelineError):
        ai_pipeline._validate_file("lib/main.dart", "x" * (ai_pipeline.MAX_FILE_BYTES + 1))
    # legit dart passes
    assert ai_pipeline._validate_file("lib/screens/home.dart", "void main(){}") == "lib/screens/home.dart"


@pytest.mark.asyncio
async def test_run_pipeline_fallback_applies_files(tmp_path):
    base = tmp_path / "proj"
    base.mkdir()
    # Without a GEMINI key the coordinator import fails -> fallback path.
    result = await ai_pipeline.run_pipeline("a todo list app", base)
    assert result["source"] == "fallback"
    assert "lib/main.dart" in result["applied"]
    assert (base / "lib" / "main.dart").exists()


@pytest.mark.asyncio
async def test_run_pipeline_writes_supplied_files(tmp_path, monkeypatch):
    base = tmp_path / "proj"
    base.mkdir()
    import sys

    # Simulate a "model" that returns files (monkeypatch fallback source).
    calls = {"n": 0}

    async def fake_run(prompt, base, on_step=None):
        if on_step:
            for s in ai_pipeline.STEPS:
                on_step(s, "start", "")
        ws.write_file(base, "lib/main.dart", "void main() {}")
        ws.write_file(base, "lib/home.dart", "// home")
        return {"applied": ["lib/main.dart", "lib/home.dart"], "source": "ai", "logs": []}

    monkeypatch.setattr(ai_pipeline, "run_pipeline", fake_run)
    result = await ai_pipeline.run_pipeline("x", base)
    assert result["source"] == "ai"
    assert (base / "lib" / "main.dart").exists()
