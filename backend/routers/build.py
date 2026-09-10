import asyncio
import shutil
from typing import Dict, Optional

import config
import preview_token
import workspace as ws
from ._common import lock_for, stream_process
from .deps import require_project
from models.project import Project
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/projects/{pid}", tags=["build"])

# Global concurrency gate so N parallel release builds never starve the host.
_sem = asyncio.Semaphore(config.MAX_CONCURRENT_BUILDS)

# In-flight async generators per project id -> used for cancellation.
_build_streams: Dict[str, object] = {}


def _base(project: Project):
    return ws.project_base(project.owner_id, project.id)


@router.post("/build")
async def build_web(project: Project = Depends(require_project)):
    base = _base(project)
    out = base / "build" / "web"
    if out.exists():
        shutil.rmtree(out, ignore_errors=True)

    access = preview_token.mint(project.id)
    logs_url = f"/api/projects/{project.id}/build/logs"
    preview_url = f"/preview/{project.id}/index.html?access={access}"
    return {"logs": logs_url, "preview": preview_url}


async def _event_gen(pid: str, base):
    """Full build pipeline; yields SSE `data:` lines ending in one `__EXIT__`."""
    try:
        lock = lock_for(pid)
        async with lock:
            if _sem.locked():
                yield "data: Queued (waiting for a build slot)...\n\n"
            async with _sem:
                yield "data: Running flutter pub get...\n\n"
                pub_code = [0]
                async for chunk in stream_process(["flutter", "pub", "get"], cwd=base, code_holder=pub_code):
                    yield chunk

                if pub_code[0] != 0:
                    yield f"data: __EXIT__ {pub_code[0]}\n\n"
                    return

                yield "data: Building web...\n\n"
                cmd = ["flutter", "build", "web", "--release", "--pwa-strategy=none"]
                exit_code = [0]
                async for chunk in stream_process(cmd, cwd=base, code_holder=exit_code):
                    yield chunk

                if exit_code[0] == 0:
                    yield "data: Build finished. Open preview URL.\n\n"
                yield f"data: __EXIT__ {exit_code[0]}\n\n"
    finally:
        _build_streams.pop(pid, None)


@router.get("/build/logs")
async def build_logs(project: Project = Depends(require_project)):
    base = _base(project)
    gen = _event_gen(project.id, base)
    _build_streams[project.id] = gen

    async def _stream():
        async for chunk in gen:
            yield chunk

    return StreamingResponse(_stream(), media_type="text/event-stream")


@router.post("/build/cancel")
async def build_cancel(project: Project = Depends(require_project)):
    gen = _build_streams.pop(project.id, None)
    if gen is None:
        raise HTTPException(404, "no build in progress")
    try:
        await gen.aclose()  # closes the async generator -> kills subprocesses
    except Exception:
        pass
    return {"ok": True, "note": "build cancelled"}
