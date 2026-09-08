from __future__ import annotations
import os, shutil, uuid, re, mimetypes
from pathlib import Path
from typing import Dict, Any, List, Optional
import subprocess, time
ROOT = Path(__file__).parent.resolve()
WORKSPACES = ROOT / "workspaces"
TEMPLATE = ROOT / "templates" / "blank"
WORKSPACES.mkdir(exist_ok=True, parents=True)

SAFE_PATH = re.compile(r"^[A-Za-z0-9_\-./]+$")
WID_RE = re.compile(r"^[a-f0-9]{8}$")

def _validate_wid(wid: str) -> None:
    if not wid or not WID_RE.match(wid):
        raise ValueError("invalid workspace id")

def new_workspace() -> dict[str, str]:
    if shutil.which("flutter") is None:
        raise RuntimeError("flutter not found on PATH")

    wid = uuid.uuid4().hex[:8]
    wdir = WORKSPACES / wid

    # Copy template
    shutil.copytree(TEMPLATE, wdir)

    try:
        # Ensure required folders exist before web setup
        (wdir / "assets").mkdir(exist_ok=True)

        # Run flutter create web config
        subprocess.run(
            ["flutter", "create", ".", "--platforms", "web"],
            cwd=str(wdir),
            check=True,
            timeout=120,
        )
    except subprocess.CalledProcessError as e:
        shutil.rmtree(wdir, ignore_errors=True)
        raise RuntimeError(f"flutter create failed: {e}")
    except subprocess.TimeoutExpired as e:
        shutil.rmtree(wdir, ignore_errors=True)
        raise RuntimeError(f"flutter create timed out: {e}")
    except Exception:
        shutil.rmtree(wdir, ignore_errors=True)
        raise

    return {"id": wid, "path": str(wdir)}

def _validate_relpath(path: str) -> str:
    if not path or not SAFE_PATH.match(path) or ".." in Path(path).parts or Path(path).is_absolute():
        raise ValueError("Invalid path")
    return path

class IsBinaryError(Exception):
    """Raised when a file is not valid UTF-8 text (e.g. an image or font)."""
    def __init__(self, size: int):
        super().__init__(f"binary file ({size} bytes)")
        self.size = size

# File extensions considered editable text (everything else may still be detected
# via content sniffing in read_file_binary).
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

def read_file_bytes(wid: str, rel: str) -> bytes:
    base = WORKSPACES / wid
    rel = _validate_relpath(rel)
    f = base / rel
    if not f.exists() or not f.is_file():
        raise FileNotFoundError("file not found")
    return f.read_bytes()

def read_file_info(wid: str, rel: str) -> Dict[str, Any]:
    """Read a file, decoding UTF-8 text when possible.

    Returns {"text": str} for text files, or {"binary": size} for binary ones.
    """
    rel = _validate_relpath(rel)
    data = read_file_bytes(wid, rel)
    if is_binary_path(rel):
        return {"binary": len(data)}
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return {"binary": len(data)}
    return {"text": text}

def list_tree(wid: str) -> List[Dict[str, Any]]:
    _validate_wid(wid)
    base = WORKSPACES / wid
    if not base.exists():
        raise FileNotFoundError("workspace not found")

    def walk_dir(dir_path: Path) -> List[Dict[str, Any]]:
        nodes = []
        for entry in sorted(dir_path.iterdir()):
            rel = entry.relative_to(base).as_posix()

            # Skip hidden/dot entries (e.g. .dart_tool, .pub-cache, .git)
            if entry.name.startswith("."):
                continue

            # Skip build artifacts
            if entry.name == "build" or rel.startswith("build/"):
                continue

            if entry.is_dir():
                nodes.append({
                    "id": rel,
                    "path":rel,
                    "name": entry.name,
                    "type": "dir",
                    "children": walk_dir(entry),
                })
            else:
                nodes.append({
                    "id": rel,
                    "path":rel,
                    "name": entry.name,
                    "type": "file",
                    "size": entry.stat().st_size,
                })
        return nodes

    return walk_dir(base)

def read_file(wid: str, rel: str) -> str:
    """Read a UTF-8 text file; raises IsBinaryError for non-text files."""
    info = read_file_info(wid, rel)
    if "binary" in info:
        raise IsBinaryError(info["binary"])
    return info["text"]

def write_file(wid: str, rel: str, content: str) -> None:
    base = WORKSPACES / wid
    rel = _validate_relpath(rel)
    f = base / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    
    # Use low-level file handle to ensure write durability
    with open(f, "w", encoding="utf-8") as out:
        out.write(content)
        out.flush()
        os.fsync(out.fileno())  # ✅ ensures data is committed to disk
    
    print(f"✅ Flushed and saved {f}")

def ensure_workspace(wid: str) -> Path:
    _validate_wid(wid)
    p = WORKSPACES / wid
    if not p.exists(): raise FileNotFoundError("workspace not found")
    return p

def delete_file(wid: str, rel: str) -> None:
    """Delete a file (or empty dir), pruning empty parent dirs up to the root."""
    base = ensure_workspace(wid)
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
    # prune empty parents
    parent = target.parent
    while parent != base and parent.is_dir() and not any(parent.iterdir()):
        parent.rmdir()
        parent = parent.parent

def rename_file(wid: str, rel: str, new_rel: str) -> None:
    base = ensure_workspace(wid)
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

def create_folder(wid: str, rel: str) -> None:
    base = ensure_workspace(wid)
    rel = _validate_relpath(rel)
    folder = base / rel
    if folder.exists():
        raise ValueError("path already exists")
    folder.mkdir(parents=True, exist_ok=True)

def mime_type(rel: str) -> str:
    guessed, _ = mimetypes.guess_type(rel)
    return guessed or "application/octet-stream"
