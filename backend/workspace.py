from __future__ import annotations
import os, shutil, uuid, re
from pathlib import Path
from typing import Dict, Any, List
import subprocess, time
ROOT = Path(__file__).parent.resolve()
WORKSPACES = ROOT / "workspaces"
TEMPLATE = ROOT / "templates" / "blank"
WORKSPACES.mkdir(exist_ok=True, parents=True)

SAFE_PATH = re.compile(r"^[A-Za-z0-9_\-./]+$")

def new_workspace() -> dict[str, str]:
    wid = uuid.uuid4().hex[:8]
    wdir = WORKSPACES / wid

    # Copy template
    shutil.copytree(TEMPLATE, wdir)

    # Ensure required folders exist before web setup
    (wdir / "assets").mkdir(exist_ok=True)

    # Run flutter create web config
    subprocess.run(
        ["flutter", "create", ".", "--platforms", "web"],
        cwd=str(wdir),
        check=True,
    )

    return {"id": wid, "path": str(wdir)}

def _validate_relpath(path: str) -> str:
    if not path or not SAFE_PATH.match(path) or ".." in Path(path).parts or Path(path).is_absolute():
        raise ValueError("Invalid path")
    return path

def list_tree(wid: str) -> List[Dict[str, Any]]:
    base = WORKSPACES / wid
    if not base.exists():
        raise FileNotFoundError("workspace not found")

    def walk_dir(dir_path: Path) -> List[Dict[str, Any]]:
        nodes = []
        for entry in sorted(dir_path.iterdir()):
            rel = entry.relative_to(base).as_posix()

            # Skip build artifacts
            if rel.startswith("build/"):
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
    base = WORKSPACES / wid
    rel = _validate_relpath(rel)
    f = base / rel
    if not f.exists() or not f.is_file(): raise FileNotFoundError("file not found")
    return f.read_text(encoding="utf-8")

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
    p = WORKSPACES / wid
    if not p.exists(): raise FileNotFoundError("workspace not found")
    return p
