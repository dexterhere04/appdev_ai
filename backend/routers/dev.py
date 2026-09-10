from fastapi import APIRouter, Depends, HTTPException, Query, Request

import config
import workspace as ws
import dev_server as ds
from .deps import get_current_user, require_project
from models.project import Project
from models.user import User

router = APIRouter(prefix="/api/projects/{pid}/dev", tags=["dev"])


def _base(project: Project):
    return ws.project_base(project.owner_id, project.id)


@router.post("/start")
async def dev_start(
    project: Project = Depends(require_project),
    user: User = Depends(get_current_user),
    request: Request = None,
):
    if len(ds.running_for_user(user.id)) >= config.MAX_DEV_SERVERS_PER_USER:
        raise HTTPException(429, "dev server limit reached")
    try:
        session = await ds.start(project.id, _base(project), owner_id=user.id)
    except ds.DevServerError as e:
        raise HTTPException(502, detail=str(e))
    # The dev server (DWDS/flutter run) must be reached at its own origin:
    # Flutter's debug tooling opens a root-absolute WebSocket
    # (ws://<host>:<port>/$dwdsSseHandler) that cannot live behind a shared
    # sub-path proxy. docker-compose publishes DEV_WEB_PORT_START..COUNT so the
    # browser can reach the per-project port directly.
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost").split(":")[0]
    url = f"http://{host}:{session.port}/"
    return {"url": url, "port": session.port, "running": True}


@router.post("/hot-reload")
async def dev_hot_reload(project: Project = Depends(require_project)):
    try:
        note = await ds.hot_reload(project.id)
    except ds.DevServerError as e:
        raise HTTPException(409, detail=str(e))
    return {"ok": True, "note": note}


@router.post("/stop")
async def dev_stop(project: Project = Depends(require_project)):
    await ds.stop(project.id)
    return {"ok": True}


@router.get("/logs")
async def dev_logs(project: Project = Depends(require_project), lines: int = Query(60, ge=1, le=500)):
    session = ds.get_session(project.id)
    if not session:
        raise HTTPException(404, "no dev server running for this workspace")
    return {"logs": session.tail(lines), "running": session.running, "port": session.port}
