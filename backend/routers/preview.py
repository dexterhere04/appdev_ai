import re

import db
import preview_token
import workspace as ws
from fastapi import APIRouter, Request, Response
from fastapi.responses import FileResponse

router = APIRouter(prefix="/preview", tags=["preview"])


def _preview_cookie_name(pid: str) -> str:
    return f"fcb_preview_{pid}"


def _authorized(pid: str, access: str | None, cookie: str | None) -> bool:
    if access and preview_token.verify(access, pid):
        return True
    if cookie and preview_token.verify(cookie, pid):
        return True
    return False


@router.get("/{pid}/{path:path}")
async def serve_preview(
    pid: str,
    request: Request,
    path: str = "index.html",
    access: str | None = None,
):
    """Serve the built Flutter web app for an owned project.

    Authorization: the `access` query param is minted inside the authenticated
    build endpoint. Because the app runs in an iframe (no Authorization header),
    the index response also sets a path-scoped HttpOnly cookie so subresource
    requests authenticate too. No access + no valid cookie → 404 (indistinct).
    """
    cookie_val = request.cookies.get(_preview_cookie_name(pid))
    if not _authorized(pid, access, cookie_val):
        return Response("Not Found", status_code=404)

    project = db.get_project(pid)
    if project is None:
        return Response("Not Found", status_code=404)
    base = ws.project_base(project.owner_id, pid)
    web_root = (base / "build" / "web").resolve()

    file_path = web_root / path
    resolved = file_path.resolve()
    if not resolved.is_relative_to(web_root) or not resolved.exists() or not resolved.is_file():
        return Response("Not Found", status_code=404)

    # For index.html, rewrite <base href> and set the access cookie.
    if path == "" or path == "index.html":
        html = resolved.read_text()
        base_href = f"/preview/{pid}/"
        if '<base href="' in html:
            html = re.sub(r'<base href="[^"]*">', f'<base href="{base_href}">', html)
        else:
            html = html.replace("<head>", f"<head><base href='{base_href}'>")

        resp = Response(
            html,
            media_type="text/html",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )
        resp.set_cookie(
            _preview_cookie_name(pid),
            preview_token.mint(pid),
            path=f"/preview/{pid}",
            httponly=True,
            samesite="lax",
            max_age=6 * 3600,
        )
        return resp

    return FileResponse(
        str(resolved),
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )
