import asyncio

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user, require_role
from app.models.user import User
from app.schemas.topology import ScanRequest, ScanResult

router = APIRouter(prefix="/discovery", tags=["discovery"])

_scan_state: dict = {"running": False, "results": [], "subnet": None, "progress": 0, "total": 0}


async def _run_scan_task(subnet: str, credential_id: int | None):
    global _scan_state
    _scan_state.update(running=True, results=[], subnet=subnet, progress=0, total=0)
    try:
        from discovery_worker import run_scan
        results = await run_scan(subnet, credential_id)
        _scan_state["results"] = results
        _scan_state["progress"] = len(results)
        _scan_state["total"] = len(results)
        _scan_state["up_count"] = sum(1 for r in results if r["status"] == "up")
        _scan_state["unknown_count"] = sum(1 for r in results if r["status"] != "up")
    except Exception as e:
        _scan_state["results"] = [{"ip": subnet, "status": "error", "detail": str(e)}]
    finally:
        _scan_state["running"] = False


@router.post("/scan")
async def trigger_scan(
    body: ScanRequest,
    _: User = Depends(require_role(["admin", "operator"])),
):
    if _scan_state["running"]:
        raise HTTPException(status_code=409, detail="A scan is already in progress")

    _scan_state.update(running=True, results=[], subnet=body.subnet, progress=0, total=0)
    asyncio.get_event_loop().create_task(_run_scan_task(body.subnet, body.credential_id))
    return {"status": "started", "subnet": body.subnet}


@router.get("/scan/status")
async def scan_status(_: User = Depends(get_current_user)):
    return {
        "running": _scan_state["running"],
        "subnet": _scan_state["subnet"],
        "progress": _scan_state["progress"],
        "total": _scan_state["total"],
        "results_count": len(_scan_state["results"]),
        "up_count": _scan_state.get("up_count", 0),
        "unknown_count": _scan_state.get("unknown_count", 0),
    }


@router.get("/scan/results", response_model=list[ScanResult])
async def scan_results(_: User = Depends(get_current_user)):
    return _scan_state["results"]
