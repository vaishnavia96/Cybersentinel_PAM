import asyncio
import os

from fastapi import APIRouter, Depends

from app.api.deps import require_role
from app.models.user import User

router = APIRouter(prefix="/poller", tags=["poller"])

_poller_process: asyncio.subprocess.Process | None = None
_watchdog_task: asyncio.Task | None = None
_poller_interval: int = 30


async def _spawn_poller(interval: int) -> asyncio.subprocess.Process:
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    venv_python = os.path.join(backend_dir, "venv", "bin", "python")
    script = os.path.join(backend_dir, "poller_worker.py")
    log_path = os.path.join(backend_dir, "storage", "poller.log")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)

    log_file = open(log_path, "a")
    proc = await asyncio.create_subprocess_exec(
        venv_python, script, "--interval", str(interval),
        cwd=backend_dir,
        stdout=log_file,
        stderr=log_file,
        start_new_session=True,
    )
    return proc


async def _watchdog_loop(interval: int):
    """Auto-restart the poller if it crashes."""
    global _poller_process
    while True:
        if _poller_process is None:
            break
        retcode = _poller_process.returncode
        if retcode is not None:
            _poller_process = await _spawn_poller(interval)
        await asyncio.sleep(5)


@router.get("/status")
async def poller_status(_: User = Depends(require_role(["admin", "operator"]))):
    global _poller_process
    if _poller_process and _poller_process.returncode is None:
        return {"running": True, "pid": _poller_process.pid}
    running = _watchdog_task is not None and not _watchdog_task.done()
    return {"running": running, "pid": None if not running else "restarting"}


@router.post("/start")
async def poller_start(
    interval: int = 30,
    _: User = Depends(require_role(["admin", "operator"])),
):
    global _poller_process, _watchdog_task, _poller_interval

    if _poller_process and _poller_process.returncode is None:
        return {"running": True, "pid": _poller_process.pid, "detail": "Already running"}

    _poller_interval = interval
    _poller_process = await _spawn_poller(interval)

    if _watchdog_task and not _watchdog_task.done():
        _watchdog_task.cancel()
    _watchdog_task = asyncio.create_task(_watchdog_loop(interval))

    return {"running": True, "pid": _poller_process.pid}


@router.post("/stop")
async def poller_stop(_: User = Depends(require_role(["admin", "operator"]))):
    global _poller_process, _watchdog_task

    if _watchdog_task and not _watchdog_task.done():
        _watchdog_task.cancel()
        _watchdog_task = None

    if _poller_process and _poller_process.returncode is None:
        pid = _poller_process.pid
        _poller_process.terminate()
        try:
            await asyncio.wait_for(_poller_process.wait(), timeout=5)
        except asyncio.TimeoutError:
            _poller_process.kill()
        _poller_process = None
        return {"running": False, "stopped_pid": pid}

    _poller_process = None
    return {"running": False, "detail": "Was not running"}
