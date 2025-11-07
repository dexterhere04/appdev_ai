from __future__ import annotations
import asyncio, json, os, shutil, subprocess, sys
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import re
from fastapi.responses import Response
import workspace as ws

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# Serve built previews from /workspaces/<id>/build/web


@app.get("/preview/{wid}/build/web/{path:path}")
async def serve_preview_file(wid: str, path: str = "index.html"):
    base = ws.ensure_workspace(wid)
    file_path = base / "build" / "web" / path

    if not file_path.exists():
        return Response("Not Found", status_code=404)

    # Inject correct <base href> into index.html
    if path == "" or path == "index.html":
        html = file_path.read_text()
        base_href = f'/preview/{wid}/build/web/'
        if '<base href="' in html:
            html = re.sub(r'<base href="[^"]*">', f'<base href="{base_href}">', html)
        else:
            html = html.replace("<head>", f"<head><base href='{base_href}'>")

        return Response(html, media_type="text/html")

    # Proper static file serving
    return FileResponse(str(file_path))

class FilePatch(BaseModel):
    path: str
    content: str

@app.post("/api/workspaces")
def create_workspace():
    created = ws.new_workspace()
    return {"workspaceId": created["id"]}

@app.get("/api/workspaces/{wid}")
def get_tree(wid: str):
    try:
        return {"files": ws.list_tree(wid)}
    except FileNotFoundError:
        raise HTTPException(404, "workspace not found")

@app.get("/api/workspaces/{wid}/file")
def get_file(wid: str, path: str = Query(...)):
    try:
        return {"path": path, "content": ws.read_file(wid, path)}
    except FileNotFoundError:
        raise HTTPException(404, "file not found")
    except ValueError:
        raise HTTPException(400, "invalid path")

@app.put("/api/workspaces/{wid}/file")
def put_file(wid: str, patch: FilePatch):
    try:
        ws.write_file(wid, patch.path, patch.content)
        return {"ok": True}
    except FileNotFoundError:
        raise HTTPException(404, "workspace not found")
    except ValueError:
        raise HTTPException(400, "invalid path")

def _flutter_env(base: Path) -> dict:
    env = os.environ.copy()
    # Optional: speed up pub
    env.setdefault("PUB_CACHE", str(base / ".pub-cache"))
    return env

async def _stream_process(cmd, cwd: Path):
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=_flutter_env(cwd),
    )
    assert proc.stdout
    try:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            yield f"data: {line.decode(errors='ignore').rstrip()}\n\n"
    finally:
        await proc.wait()
        yield f"data: __EXIT__ {proc.returncode}\n\n"

@app.post("/api/workspaces/{wid}/build")
async def build_web(wid: str):
    base = ws.ensure_workspace(wid)
    # Clean previous build to avoid stale
    out = base / "build" / "web"
    if out.exists():
        shutil.rmtree(out, ignore_errors=True)

    # Prepare SSE URL for logs and preview URL
    logs_url = f"/api/workspaces/{wid}/build/logs"
    preview_url = f"/preview/{wid}/build/web/index.html"
    return {"logs": logs_url, "preview": preview_url}

@app.get("/api/workspaces/{wid}/build/logs")
async def build_logs(wid: str):
    """
    Server-Sent Events (EventSource) endpoint.
    Triggers `flutter build web` and streams logs.
    """
    base = ws.ensure_workspace(wid)

    async def event_gen():
        # ensure flutter pub get runs first (faster incremental builds)
        yield "data: Running flutter pub get...\n\n"
        async for chunk in _stream_process(["flutter", "pub", "get"], cwd=base):
            yield chunk

        yield "data: Building web...\n\n"
        cmd = ["flutter", "build", "web", "--release", "--pwa-strategy=none"]
        async for chunk in _stream_process(cmd, cwd=base):
            yield chunk

        yield "data: Build finished. Open preview URL.\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
