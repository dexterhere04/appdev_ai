from __future__ import annotations
import os, shutil, uuid, re, mimetypes, subprocess
from pathlib import Path
from typing import Dict, Any, List
import config

WORKSPACES = config.WORKSPACES_ROOT
TEMPLATE = Path(__file__).parent.resolve() / "templates" / "blank"
WORKSPACES.mkdir(exist_ok=True, parents=True)

SAFE_PATH = re.compile(r"^[A-Za-z0-9_\-./]+$")
PROJECT_ID_RE = re.compile(r"^[0-9a-f]{32}$")


def validate_project_id(pid: str) -> None:
    """Project/owner ids are opaque 32-hex uuids (no dashes)."""
    if not pid or not PROJECT_ID_RE.match(pid):
        raise ValueError("invalid project id")


def project_base(owner_id: str, pid: str) -> Path:
    """Resolve the on-disk dir for a project: workspaces/<owner>/<pid>/."""
    validate_project_id(owner_id)
    validate_project_id(pid)
    return WORKSPACES / owner_id / pid


def provision(owner_id: str, pid: str, *, flutter_create: bool = True) -> Path:
    """Copy the blank template into a fresh project dir and scaffold web config.

    Ownership is structural: the dir lives under workspaces/<owner_id>/<pid>/.
    On any failure the partial directory is removed.
    """
    base = project_base(owner_id, pid)
    base.parent.mkdir(parents=True, exist_ok=True)
    if base.exists():
        shutil.rmtree(base, ignore_errors=True)

    shutil.copytree(TEMPLATE, base)
    try:
        (base / "assets").mkdir(exist_ok=True)
        if flutter_create:
            if shutil.which("flutter") is None:
                raise RuntimeError("flutter not found on PATH")
            import envpolicy
            subprocess.run(
                ["flutter", "create", ".", "--platforms", "web"],
                cwd=str(base),
                check=True,
                timeout=120,
                env=envpolicy.build_env(),
            )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        shutil.rmtree(base, ignore_errors=True)
        raise RuntimeError(f"flutter create failed: {e}")
    except Exception:
        shutil.rmtree(base, ignore_errors=True)
        raise
    return base


def remove_project(owner_id: str, pid: str) -> None:
    base = project_base(owner_id, pid)
    if base.exists():
        shutil.rmtree(base, ignore_errors=True)
    # prune now-empty owner dir (best effort)
    parent = base.parent
    try:
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()
    except OSError:
        pass


def _validate_relpath(path: str) -> str:
    if not path or not SAFE_PATH.match(path) or ".." in Path(path).parts or Path(path).is_absolute():
        raise ValueError("Invalid path")
    return path


class IsBinaryError(Exception):
    """Raised when a file is not valid UTF-8 text (e.g. an image or font)."""

    def __init__(self, size: int):
        super().__init__(f"binary file ({size} bytes)")
        self.size = size


BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".pdf", ".zip", ".gz", ".tar", ".jar", ".so", ".dll", ".exe",
    ".pyc", ".class", ".mp3", ".mp4", ".mov", ".wav", ".ogg",
}

IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff", ".svg",
}


def is_binary_path(rel: str) -> bool:
    return Path(rel).suffix.lower() in BINARY_EXTENSIONS


def is_image_path(rel: str) -> bool:
    return Path(rel).suffix.lower() in IMAGE_EXTENSIONS


def read_file_bytes(base: Path, rel: str) -> bytes:
    rel = _validate_relpath(rel)
    f = base / rel
    if not f.exists() or not f.is_file():
        raise FileNotFoundError("file not found")
    return f.read_bytes()


def read_file_info(base: Path, rel: str) -> Dict[str, Any]:
    """Read a file, decoding UTF-8 text when possible.

    Returns {"text": str} for text files, or {"binary": size} for binary ones.
    """
    rel = _validate_relpath(rel)
    data = read_file_bytes(base, rel)
    if is_binary_path(rel):
        return {"binary": len(data)}
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return {"binary": len(data)}
    return {"text": text}


def list_tree(base: Path) -> List[Dict[str, Any]]:
    if not base.exists():
        raise FileNotFoundError("project not found")

    def walk_dir(dir_path: Path) -> List[Dict[str, Any]]:
        nodes = []
        for entry in sorted(dir_path.iterdir()):
            rel = entry.relative_to(base).as_posix()
            if entry.name.startswith("."):
                continue
            if entry.name == "build" or rel.startswith("build/"):
                continue
            if entry.is_dir():
                nodes.append({
                    "id": rel,
                    "path": rel,
                    "name": entry.name,
                    "type": "dir",
                    "children": walk_dir(entry),
                })
            else:
                nodes.append({
                    "id": rel,
                    "path": rel,
                    "name": entry.name,
                    "type": "file",
                    "size": entry.stat().st_size,
                })
        return nodes

    return walk_dir(base)


def write_file(base: Path, rel: str, content: str) -> None:
    rel = _validate_relpath(rel)
    f = base / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    with open(f, "w", encoding="utf-8") as out:
        out.write(content)
        out.flush()
        os.fsync(out.fileno())


def delete_file(base: Path, rel: str) -> None:
    """Delete a file (or empty dir), pruning empty parent dirs up to root."""
    rel = _validate_relpath(rel)
    target = base / rel
    if target.is_dir():
        try:
            target.rmdir()  # only removes empty dirs
        except OSError:
            raise ValueError("directory not empty")
    elif target.is_file():
        target.unlink()
    else:
        raise FileNotFoundError("file not found")
    parent = target.parent
    while parent != base and parent.is_dir() and not any(parent.iterdir()):
        parent.rmdir()
        parent = parent.parent


def rename_file(base: Path, rel: str, new_rel: str) -> None:
    rel = _validate_relpath(rel)
    new_rel = _validate_relpath(new_rel)
    if rel == new_rel:
        return
    src = base / rel
    dst = base / new_rel
    if not src.exists():
        raise FileNotFoundError("file not found")
    if dst.exists():
        raise ValueError("target already exists")
    dst.parent.mkdir(parents=True, exist_ok=True)
    os.rename(src, dst)


def create_folder(base: Path, rel: str) -> None:
    rel = _validate_relpath(rel)
    folder = base / rel
    if folder.exists():
        raise ValueError("path already exists")
    folder.mkdir(parents=True, exist_ok=True)


def mime_type(rel: str) -> str:
    guessed, _ = mimetypes.guess_type(rel)
    return guessed or "application/octet-stream"
