from __future__ import annotations
import asyncio, json, os, re, shutil, subprocess, sys
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import workspace as ws
import dev_server as ds

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"],
)

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

# Serve built previews from /workspaces/<id>/build/web
_build_locks: dict[str, asyncio.Lock] = {}

def _lock_for(wid: str) -> asyncio.Lock:
    if wid not in _build_locks:
        _build_locks[wid] = asyncio.Lock()
    return _build_locks[wid]

def _validate_wid(wid: str) -> None:
    ws._validate_wid(wid)


@app.get("/preview/{wid}/build/web/{path:path}")
async def serve_preview_file(wid: str, path: str = "index.html"):
    try:
        _validate_wid(wid)
        base = ws.ensure_workspace(wid)
    except ValueError:
        return Response("Not Found", status_code=404)
    except FileNotFoundError:
        return Response("Not Found", status_code=404)

    file_path = base / "build" / "web" / path
    web_root = (base / "build" / "web").resolve()
    resolved = file_path.resolve()
    if not resolved.is_relative_to(web_root):
        return Response("Not Found", status_code=404)

    if not resolved.exists() or not resolved.is_file():
        return Response("Not Found", status_code=404)

    # Inject correct <base href> into index.html
    if path == "" or path == "index.html":
        html = resolved.read_text()
        base_href = f'/preview/{wid}/build/web/'
        if '<base href="' in html:
            html = re.sub(r'<base href="[^"]*">', f'<base href="{base_href}">', html)
        else:
            html = html.replace("<head>", f"<head><base href='{base_href}'>")

        return Response(
            html,
            media_type="text/html",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )

    # Proper static file serving
    return FileResponse(
        str(resolved),
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )

class FilePatch(BaseModel):
    path: str
    content: str

@app.post("/api/workspaces")
def create_workspace():
    try:
        created = ws.new_workspace()
    except Exception as e:
        raise HTTPException(500, detail=str(e))
    return {"workspaceId": created["id"]}

@app.get("/api/workspaces/{wid}")
def get_tree(wid: str):
    try:
        _validate_wid(wid)
        return {"files": ws.list_tree(wid)}
    except ValueError:
        raise HTTPException(400, "invalid workspace id")
    except FileNotFoundError:
        raise HTTPException(404, "workspace not found")

@app.get("/api/workspaces/{wid}/file")
def get_file(wid: str, path: str = Query(...)):
    try:
        _validate_wid(wid)
        info = ws.read_file_info(wid, path)
    except ValueError:
        raise HTTPException(400, "invalid path")
    except FileNotFoundError:
        raise HTTPException(404, "file not found")
    if "binary" in info:
        return {
            "path": path,
            "binary": True,
            "size": info["binary"],
            "image": ws.is_image_path(path),
        }
    return {"path": path, "content": info["text"]}

@app.put("/api/workspaces/{wid}/file")
def put_file(wid: str, patch: FilePatch):
    try:
        _validate_wid(wid)
        ws.write_file(wid, patch.path, patch.content)
        return {"ok": True}
    except ValueError:
        raise HTTPException(400, "invalid path")
    except FileNotFoundError:
        raise HTTPException(404, "workspace not found")

@app.get("/api/workspaces/{wid}/raw")
def get_raw(wid: str, path: str = Query(...)):
    """Serve a file's raw bytes (for images/binary assets)."""
    try:
        _validate_wid(wid)
        data = ws.read_file_bytes(wid, path)
    except ValueError:
        raise HTTPException(400, "invalid path")
    except FileNotFoundError:
        raise HTTPException(404, "file not found")
    return Response(content=data, media_type=ws.mime_type(path))

@app.delete("/api/workspaces/{wid}/file")
def delete_file(wid: str, path: str = Query(...)):
    try:
        _validate_wid(wid)
        ws.delete_file(wid, path)
        return {"ok": True}
    except ValueError:
        raise HTTPException(400, "invalid path or directory not empty")
    except FileNotFoundError:
        raise HTTPException(404, "file not found")

class RenamePatch(BaseModel):
    path: str
    newPath: str

@app.post("/api/workspaces/{wid}/file/rename")
def rename_file(wid: str, patch: RenamePatch):
    try:
        _validate_wid(wid)
        ws.rename_file(wid, patch.path, patch.newPath)
        return {"ok": True}
    except ValueError:
        raise HTTPException(400, "invalid path or target already exists")
    except FileNotFoundError:
        raise HTTPException(404, "file not found")

class FolderPatch(BaseModel):
    path: str

@app.post("/api/workspaces/{wid}/folder")
def create_folder(wid: str, patch: FolderPatch):
    try:
        _validate_wid(wid)
        ws.create_folder(wid, patch.path)
        return {"ok": True}
    except ValueError:
        raise HTTPException(400, "invalid path or already exists")
    except FileNotFoundError:
        raise HTTPException(404, "workspace not found")

def _flutter_env(base: Path) -> dict:
    env = os.environ.copy()
    return env

async def _stream_process(cmd, cwd: Path, code_holder: list):
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
        code_holder.append(proc.returncode)

@app.post("/api/workspaces/{wid}/build")
async def build_web(wid: str):
    try:
        _validate_wid(wid)
        base = ws.ensure_workspace(wid)
    except ValueError:
        raise HTTPException(400, "invalid workspace id")
    except FileNotFoundError:
        raise HTTPException(404, "workspace not found")

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
    try:
        _validate_wid(wid)
        base = ws.ensure_workspace(wid)
    except ValueError:
        raise HTTPException(400, "invalid workspace id")
    except FileNotFoundError:
        raise HTTPException(404, "workspace not found")

    lock = _lock_for(wid)

    async def event_gen():
        async with lock:
            yield "data: Running flutter pub get...\n\n"
            pub_code = [0]
            async for chunk in _stream_process(["flutter", "pub", "get"], cwd=base, code_holder=pub_code):
                yield chunk

            if pub_code[0] != 0:
                yield f"data: __EXIT__ {pub_code[0]}\n\n"
                return

            yield "data: Building web...\n\n"
            cmd = ["flutter", "build", "web", "--release", "--pwa-strategy=none"]
            exit_code = [0]
            async for chunk in _stream_process(cmd, cwd=base, code_holder=exit_code):
                yield chunk

            if exit_code[0] == 0:
                yield "data: Build finished. Open preview URL.\n\n"
            yield f"data: __EXIT__ {exit_code[0]}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")

class AIGenerateRequest(BaseModel):
    prompt: str = ""

@app.post("/api/ai/generate")
async def ai_generate(req: AIGenerateRequest):
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(400, "Missing 'prompt'")
    try:
        from ai_agents.coordinator import CoordinatorAgent
    except Exception as e:
        raise HTTPException(503, f"AI pipeline unavailable: {e}")
    coordinator = CoordinatorAgent()
    try:
        result = await coordinator.generate_design(prompt)
    except Exception as e:
        raise HTTPException(502, f"AI generation failed: {e}")
    return {"result": result}

# ---- Dev-mode hot reload (flutter run -d web-server) ----

@app.post("/api/workspaces/{wid}/dev/start")
async def dev_start(wid: str, request: Request):
    try:
        _validate_wid(wid)
        base = ws.ensure_workspace(wid)
    except ValueError:
        raise HTTPException(400, "invalid workspace id")
    except FileNotFoundError:
        raise HTTPException(404, "workspace not found")
    try:
        session = await ds.start(wid, base)
    except ds.DevServerError as e:
        raise HTTPException(502, detail=str(e))
    host = request.headers.get("host", "localhost").split(":")[0] or "localhost"
    url = f"http://{host}:{session.port}"
    return {"url": url, "port": session.port, "running": True}

@app.post("/api/workspaces/{wid}/dev/hot-reload")
async def dev_hot_reload(wid: str):
    try:
        _validate_wid(wid)
        ws.ensure_workspace(wid)
    except ValueError:
        raise HTTPException(400, "invalid workspace id")
    except FileNotFoundError:
        raise HTTPException(404, "workspace not found")
    try:
        note = await ds.hot_reload(wid)
    except ds.DevServerError as e:
        raise HTTPException(409, detail=str(e))
    return {"ok": True, "note": note}

@app.post("/api/workspaces/{wid}/dev/stop")
async def dev_stop(wid: str):
    try:
        _validate_wid(wid)
        ws.ensure_workspace(wid)
    except ValueError:
        raise HTTPException(400, "invalid workspace id")
    except FileNotFoundError:
        raise HTTPException(404, "workspace not found")
    await ds.stop(wid)
    return {"ok": True}

@app.get("/api/workspaces/{wid}/dev/logs")
async def dev_logs(wid: str, lines: int = Query(60, ge=1, le=500)):
    try:
        _validate_wid(wid)
        ws.ensure_workspace(wid)
    except ValueError:
        raise HTTPException(400, "invalid workspace id")
    except FileNotFoundError:
        raise HTTPException(404, "workspace not found")
    session = ds.get_session(wid)
    if not session:
        raise HTTPException(404, "no dev server running for this workspace")
    return {"logs": session.tail(lines), "running": session.running, "port": session.port}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=5000)