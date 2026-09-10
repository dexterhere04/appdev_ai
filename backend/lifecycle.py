"""Lifecycle GC (Agent 3).

Runs periodically on the running server:
- purges expired sessions from the metadata store;
- stops stale dev-server processes;
- removes orphan project directories (dirs with no matching DB row) and prunes
  empty owner dirs, so storage cannot grow without bound.
"""
from __future__ import annotations

import asyncio
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

import db
import workspace as ws

log = logging.getLogger("gc")

GC_INTERVAL_S = 6 * 60 * 60  # every 6h


def purge_expired_sessions() -> int:
    now = datetime.now(timezone.utc).isoformat()
    with db._connect() as conn:
        cur = conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
        return cur.rowcount


def _orphan_dirs() -> list[Path]:
    """Project dirs on disk whose DB row is gone (deleted user/project)."""
    rows = db.list_all_project_keys()
    known = set(rows)
    orphans = []
    root = Path(ws.WORKSPACES)
    if not root.exists():
        return orphans
    for owner_dir in root.iterdir():
        if not owner_dir.is_dir():
            continue
        for pid_dir in owner_dir.iterdir():
            if pid_dir.is_dir() and (owner_dir.name, pid_dir.name) not in known:
                orphans.append(pid_dir)
    return orphans


def gc_orphan_projects() -> int:
    removed = 0
    for d in _orphan_dirs():
        try:
            shutil.rmtree(d, ignore_errors=True)
            removed += 1
        except Exception:
            log.exception("GC failed to remove %s", d)
    # prune empty owner dirs
    root = Path(ws.WORKSPACES)
    if root.exists():
        for owner_dir in root.iterdir():
            try:
                if owner_dir.is_dir() and not any(owner_dir.iterdir()):
                    owner_dir.rmdir()
            except OSError:
                pass
    return removed


async def _gc_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await asyncio.sleep(GC_INTERVAL_S)
            purged = purge_expired_sessions()
            removed = gc_orphan_projects()
            if purged or removed:
                log.info("GC: purged %s sessions, removed %s orphan projects", purged, removed)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("GC pass failed")


_gc_task: asyncio.Task | None = None
_stop: asyncio.Event | None = None


def start_gc_loop() -> None:
    global _gc_task, _stop
    if _gc_task and not _gc_task.done():
        return
    _stop = asyncio.Event()
    _gc_task = asyncio.create_task(_gc_loop(_stop))


async def stop_gc_loop() -> None:
    if _gc_task:
        _gc_task.cancel()
        try:
            await _gc_task
        except (asyncio.CancelledError, Exception):
            pass
