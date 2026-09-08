from __future__ import annotations

import asyncio
import os
import re
import socket
from pathlib import Path
from typing import Dict, Optional

# Range of host ports used for per-workspace `flutter run -d web-server` dev
# servers. docker-compose publishes DEV_WEB_PORT_START..+DEV_WEB_PORT_COUNT so
# the browser can reach the servers directly (also works for local dev without
# Docker).
DEV_WEB_PORT_START = int(os.environ.get("DEV_WEB_PORT_START", "8100"))
DEV_WEB_PORT_COUNT = int(os.environ.get("DEV_WEB_PORT_COUNT", "32"))
MAX_BUF = 12000

_READY_RE = re.compile(r"is being served at")
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07")
_HOT_RELOAD_RE = re.compile(
    r"(Performing hot reload|Reloaded in \d+ms|Hot reload)", re.IGNORECASE
)


class DevServerError(Exception):
    pass


def _clean(text: str) -> str:
    return _ANSI_RE.sub("", text).replace("\r", "").replace("\b", "")


class DevSession:
    def __init__(self, wid: str, port: int):
        self.wid = wid
        self.port = port
        self.proc: Optional[asyncio.subprocess.Process] = None
        self.buffer: str = ""
        self.ready = asyncio.Event()
        self._read_task: Optional[asyncio.Task] = None

    @property
    def running(self) -> bool:
        return self.proc is not None and self.proc.returncode is None

    def _push(self, text: str) -> None:
        self.buffer = _clean(text) if not self.buffer else _clean(self.buffer + text)
        if len(self.buffer) > MAX_BUF:
            self.buffer = self.buffer[-MAX_BUF:]

    def tail(self, lines: int = 60) -> str:
        parts = [p for p in self.buffer.split("\n") if p]
        return "\n".join(parts[-lines:])


_sessions: Dict[str, DevSession] = {}
_start_locks: Dict[str, asyncio.Lock] = {}


def _port_free(port: int) -> bool:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind(("0.0.0.0", port))
            return True
        finally:
            s.close()
    except OSError:
        return False


def _alloc_port() -> int:
    for p in range(DEV_WEB_PORT_START, DEV_WEB_PORT_START + DEV_WEB_PORT_COUNT):
        if _port_free(p):
            return p
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("0.0.0.0", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def get_session(wid: str) -> Optional[DevSession]:
    return _sessions.get(wid)


async def _reader(session: DevSession) -> None:
    assert session.proc and session.proc.stdout
    try:
        while True:
            chunk = await session.proc.stdout.read(4096)
            if not chunk:
                break
            text = chunk.decode(errors="ignore")
            session._push(text)
            if _READY_RE.search(session.buffer):
                session.ready.set()
    finally:
        # Unblock waiters even if the process died before becoming ready, so
        # they can observe the failure instead of hanging.
        session.ready.set()


async def _run_pub_get(session: DevSession, base: Path, env: dict) -> None:
    session._push("\n--- flutter pub get ---\n")
    pub = await asyncio.create_subprocess_exec(
        "flutter",
        "pub",
        "get",
        cwd=str(base),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=env,
    )
    assert pub.stdout
    while True:
        chunk = await pub.stdout.read(4096)
        if not chunk:
            break
        session._push(chunk.decode(errors="ignore"))
    await pub.wait()
    if pub.returncode != 0:
        raise DevServerError(f"flutter pub get failed:\n{session.tail(40)}")


async def start(wid: str, base: Path) -> DevSession:
    """Start (or return the running) `flutter run -d web-server` for a workspace."""
    if wid not in _start_locks:
        _start_locks[wid] = asyncio.Lock()

    async with _start_locks[wid]:
        existing = _sessions.get(wid)
        if existing and existing.running:
            return existing
        if existing:
            await _terminate(existing)

        port = _alloc_port()
        session = DevSession(wid, port)
        _sessions[wid] = session
        env = {**os.environ, "PUB_CACHE": os.path.expanduser("~/.pub-cache")}

        # Ensure dependencies are resolved for the current environment's pub
        # cache (a fresh container has an empty cache).
        try:
            await _run_pub_get(session, base, env)
        except DevServerError:
            _sessions.pop(wid, None)
            raise

        proc = await asyncio.create_subprocess_exec(
            "flutter",
            "run",
            "-d",
            "web-server",
            "--web-hostname=0.0.0.0",
            f"--web-port={port}",
            cwd=str(base),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        session.proc = proc
        session._read_task = asyncio.create_task(_reader(session))

        try:
            await asyncio.wait_for(session.ready.wait(), timeout=180)
        except asyncio.TimeoutError:
            await _terminate(session)
            _sessions.pop(wid, None)
            raise DevServerError(f"flutter run timed out. Logs:\n{session.tail(60)}")

        if not session.running:
            await _terminate(session)
            _sessions.pop(wid, None)
            raise DevServerError(
                f"flutter run exited early. Logs:\n{session.tail(60)}"
            )

        return session


async def _terminate(session: DevSession) -> None:
    if session.proc and session.proc.returncode is None:
        try:
            if session.proc.stdin and not session.proc.stdin.is_closing():
                session.proc.stdin.write(b"q\n")
                await session.proc.stdin.drain()
        except Exception:
            pass
        try:
            await asyncio.wait_for(session.proc.wait(), timeout=5)
        except asyncio.TimeoutError:
            try:
                session.proc.kill()
            except ProcessLookupError:
                pass
            await session.proc.wait()
    if session._read_task:
        session._read_task.cancel()


async def stop(wid: str) -> None:
    session = _sessions.pop(wid, None)
    if session:
        await _terminate(session)


async def hot_reload(wid: str) -> str:
    session = _sessions.get(wid)
    if not session or not session.running or not session.proc:
        raise DevServerError("no running dev server for workspace")
    assert session.proc.stdin
    session.proc.stdin.write(b"r\n")
    await session.proc.stdin.drain()
    await asyncio.sleep(0.2)
    for line in reversed(session.tail(80).split("\n")):
        if _HOT_RELOAD_RE.search(line):
            return line
    return "Hot reload triggered"
