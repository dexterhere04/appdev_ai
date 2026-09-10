from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel

import db
import workspace as ws
from models.project import Project
from .deps import require_project

router = APIRouter(prefix="/api/projects/{pid}", tags=["files"])


class FilePatch(BaseModel):
    path: str
    content: str


class RenamePatch(BaseModel):
    path: str
    newPath: str


class FolderPatch(BaseModel):
    path: str


def _base_for(project: Project):
    return ws.project_base(project.owner_id, project.id)


def _touch(project: Project) -> None:
    try:
        db.touch_project(project.id)
    except Exception:
        pass


@router.get("/file")
def get_file(project: Project = Depends(require_project), path: str = Query(...)):
    base = _base_for(project)
    try:
        info = ws.read_file_info(base, path)
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


@router.put("/file")
def put_file(project: Project = Depends(require_project), patch: FilePatch = ...):
    base = _base_for(project)
    try:
        ws.write_file(base, patch.path, patch.content)
        _touch(project)
        return {"ok": True}
    except ValueError:
        raise HTTPException(400, "invalid path")


@router.get("/raw")
def get_raw(project: Project = Depends(require_project), path: str = Query(...)):
    base = _base_for(project)
    try:
        data = ws.read_file_bytes(base, path)
    except ValueError:
        raise HTTPException(400, "invalid path")
    except FileNotFoundError:
        raise HTTPException(404, "file not found")
    return Response(content=data, media_type=ws.mime_type(path))


@router.delete("/file")
def delete_file(project: Project = Depends(require_project), path: str = Query(...)):
    base = _base_for(project)
    try:
        ws.delete_file(base, path)
        _touch(project)
        return {"ok": True}
    except ValueError:
        raise HTTPException(400, "invalid path or directory not empty")
    except FileNotFoundError:
        raise HTTPException(404, "file not found")


@router.post("/file/rename")
def rename_file(project: Project = Depends(require_project), patch: RenamePatch = ...):
    base = _base_for(project)
    try:
        ws.rename_file(base, patch.path, patch.newPath)
        _touch(project)
        return {"ok": True}
    except ValueError:
        raise HTTPException(400, "invalid path or target already exists")
    except FileNotFoundError:
        raise HTTPException(404, "file not found")


@router.post("/folder")
def create_folder(project: Project = Depends(require_project), patch: FolderPatch = ...):
    base = _base_for(project)
    try:
        ws.create_folder(base, patch.path)
        _touch(project)
        return {"ok": True}
    except ValueError:
        raise HTTPException(400, "invalid path or already exists")
