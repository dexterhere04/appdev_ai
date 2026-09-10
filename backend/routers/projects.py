from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

import config
import db
import ratelimit
import workspace as ws
from models.user import User
from .deps import get_current_user, require_project

router = APIRouter(prefix="/api/projects", tags=["projects"])


class CreateProject(BaseModel):
    name: str = "Untitled project"


class RenameProject(BaseModel):
    name: str


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _base(project):
    return ws.project_base(project.owner_id, project.id)


@router.get("")
def list_projects(user: User = Depends(get_current_user)):
    return {"projects": [p.public() for p in db.list_projects(user.id)]}


@router.post("", status_code=201)
def create_project(body: CreateProject, request: Request, user: User = Depends(get_current_user)):
    if not ratelimit.check_limit(f"create:{user.id}:{_client_ip(request)}", config.RATE_LIMIT_CREATE_PER_MIN):
        raise HTTPException(429, "too many project creations, slow down")
    name = (body.name or "").strip()[:120] or "Untitled project"
    if db.project_count(user.id) >= config.MAX_PROJECTS_PER_USER:
        raise HTTPException(429, "project limit reached")
    project = db.create_project(user.id, name)
    try:
        ws.provision(user.id, project.id)
    except Exception as e:
        db.delete_project(project.id)
        ws.remove_project(user.id, project.id)
        raise HTTPException(500, detail=f"provisioning failed: {e}")
    return {"project": project.public()}


@router.patch("/{pid}")
def rename_project(pid: str, body: RenameProject, project=Depends(require_project)):
    name = (body.name or "").strip()[:120]
    if not name:
        raise HTTPException(400, "name cannot be empty")
    updated = db.rename_project(pid, name)
    return {"project": updated.public()}


@router.delete("/{pid}")
def delete_project(pid: str, project=Depends(require_project)):
    ws.remove_project(project.owner_id, pid)
    db.delete_project(pid)
    return {"ok": True}


@router.get("/{pid}/files")
def get_files(project=Depends(require_project)):
    try:
        return {"files": ws.list_tree(_base(project))}
    except FileNotFoundError:
        raise HTTPException(404, "project not found")
