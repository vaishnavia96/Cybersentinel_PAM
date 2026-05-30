from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_, cast, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.metric import Metric
from app.models.user import User
from app.schemas.metric import MetricPoint

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/historical", response_model=list[MetricPoint])
async def get_historical_metrics(
    device_id: int = Query(...),
    metric_name: str | None = Query(None),
    start_time: datetime | None = Query(None),
    end_time: datetime | None = Query(None),
    label_key: str | None = Query(None),
    label_value: str | None = Query(None),
    limit: int = Query(2000, le=10000),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if start_time is None:
        start_time = datetime.now(timezone.utc) - timedelta(hours=1)
    if end_time is None:
        end_time = datetime.now(timezone.utc)

    query = (
        select(Metric)
        .where(Metric.device_id == device_id)
        .where(Metric.timestamp >= start_time)
        .where(Metric.timestamp <= end_time)
        .order_by(Metric.timestamp)
        .limit(limit)
    )
    if metric_name:
        query = query.where(Metric.metric_name == metric_name)
    if label_key and label_value:
        query = query.where(Metric.labels[label_key].astext == label_value)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/latest/{device_id}")
async def get_latest_metrics(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get the most recent snapshot of all metric types for a device."""
    since = datetime.now(timezone.utc) - timedelta(minutes=5)
    result = await db.execute(
        select(Metric)
        .where(Metric.device_id == device_id)
        .where(Metric.timestamp >= since)
        .order_by(Metric.timestamp.desc())
        .limit(500)
    )
    rows = result.scalars().all()

    interfaces = {}
    storage = []
    processes = []
    cores = []
    aggregate = {}

    for r in rows:
        lbl = r.labels or {}
        if r.metric_name.startswith("if_") and "interface" in lbl:
            iface = lbl["interface"]
            if iface not in interfaces:
                interfaces[iface] = {}
            if r.metric_name not in interfaces[iface]:
                interfaces[iface][r.metric_name] = r.metric_value
        elif r.metric_name.startswith("storage_") and "mount" in lbl:
            key = lbl["mount"]
            existing = next((s for s in storage if s["mount"] == key), None)
            if not existing:
                existing = {"mount": key, "type": lbl.get("type", "unknown")}
                storage.append(existing)
            if r.metric_name not in existing:
                existing[r.metric_name] = r.metric_value
        elif r.metric_name.startswith("proc_") and "process" in lbl:
            key = lbl.get("pid", "")
            existing = next((p for p in processes if p.get("pid") == key), None)
            if not existing:
                existing = {"pid": key, "name": lbl.get("process", "")}
                processes.append(existing)
            if r.metric_name not in existing:
                existing[r.metric_name] = r.metric_value
        elif r.metric_name == "cpu_load" and "core" in lbl:
            core_id = lbl["core"]
            if not any(c["core"] == core_id for c in cores):
                cores.append({"core": core_id, "load": r.metric_value})
        elif not lbl and r.metric_name not in aggregate:
            aggregate[r.metric_name] = r.metric_value

    return {
        "aggregate": aggregate,
        "cores": sorted(cores, key=lambda x: int(x["core"])),
        "interfaces": [{"name": k, **v} for k, v in interfaces.items()],
        "storage": storage,
        "processes": sorted(processes, key=lambda x: x.get("proc_mem_kb", 0), reverse=True)[:30],
    }
