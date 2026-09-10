from __future__ import annotations

import asyncio
import os
from pathlib import Path

import config
import envpolicy

# Registry of per-project build locks so concurrent build triggers serialize.
_build_locks: dict[str, asyncio.Lock] = {}


def lock_for(pid: str) -> asyncio.Lock:
    if pid not in _build_locks:
        _build_locks[pid] = asyncio.Lock()
    return _build_locks[pid]


def flutter_env(cwd: Path, *, extra: dict | None = None) -> dict:
    """Environment for flutter subprocesses — strict allowlist, no secrets."""
    return envpolicy.build_env(extra=extra)


def _rlimit_preexec():
    """Apply CPU + address-space rlimits to the child before exec (POSIX)."""
    import resource

    cpu_s = config.BUILD_TIMEOUT_S + 60
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_s, cpu_s))
    mem = config.BUILD_MEM_LIMIT_BYTES
    resource.setrlimit(resource.RLIMIT_AS, (mem, mem))


async def stream_process(cmd: list[str], cwd: Path, code_holder: list, timeout_s: int | None = None):
    """Run a command streaming stdout/stderr lines as SSE `data:` chunks.

    The child gets an allowlisted env and CPU/AS rlimits. Appends the process
    return code to `code_holder` when it finishes. If `timeout_s` elapses the
    child is killed (exit code recorded as -9) so builds never hang forever.
    """
    timeout_s = timeout_s or config.BUILD_TIMEOUT_S
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=flutter_env(cwd),
        preexec_fn=_rlimit_preexec if os.name == "posix" else None,
    )
    assert proc.stdout
    timed_out = False
    try:
        while True:
            try:
                line = await asyncio.wait_for(proc.stdout.readline(), timeout=timeout_s)
            except asyncio.TimeoutError:
                timed_out = True
                yield "data: Build timed out; killing process.\n\n"
                break
            if not line:
                break
            yield f"data: {line.decode(errors='ignore').rstrip()}\n\n"
    finally:
        if proc.returncode is None:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
        try:
            await asyncio.wait_for(proc.wait(), timeout=15)
        except asyncio.TimeoutError:
            pass
        code_holder[0] = -9 if timed_out else (proc.returncode if proc.returncode is not None else -1)
