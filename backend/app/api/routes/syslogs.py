from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.syslog import Syslog
from app.models.user import User
from app.schemas.alert import SyslogOut

router = APIRouter(prefix="/syslogs", tags=["syslogs"])


@router.get("", response_model=list[SyslogOut])
async def list_syslogs(
    device_id: int | None = Query(None),
    severity: str | None = Query(None),
    keyword: str | None = Query(None),
    start_time: datetime | None = Query(None),
    end_time: datetime | None = Query(None),
    limit: int = Query(200, le=1000),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if start_time is None:
        start_time = datetime.now(timezone.utc) - timedelta(hours=24)
    if end_time is None:
        end_time = datetime.now(timezone.utc)

    query = (
        select(Syslog)
        .where(Syslog.timestamp >= start_time)
        .where(Syslog.timestamp <= end_time)
        .order_by(Syslog.timestamp.desc())
        .limit(limit)
    )

    if device_id is not None:
        query = query.where(Syslog.device_id == device_id)
    if severity is not None:
        query = query.where(Syslog.severity == severity)
    if keyword:
        query = query.where(Syslog.message.ilike(f"%{keyword}%"))

    result = await db.execute(query)
    return result.scalars().all()
