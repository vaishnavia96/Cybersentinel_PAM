import asyncio
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user, require_role
from app.models.config_metadata import ConfigMetadata
from app.models.user import User
from app.schemas.config import BackupResult, ConfigMetadataOut

router = APIRouter(prefix="/config", tags=["config"])

BACKEND_ROOT = Path(__file__).parent.parent.parent.parent


# In-memory store for async backup results
_backup_results: dict[int, dict] = {}


async def _run_backup(device_id: int):
    from config_worker import backup_device
    result = await backup_device(device_id)
    _backup_results[device_id] = result


@router.post("/backup/trigger", response_model=BackupResult)
async def trigger_backup(
    device_id: int,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_role(["admin", "operator"])),
):
    from config_worker import backup_device
    result = await backup_device(device_id)
    return result


@router.get("/history/{device_id}", response_model=list[ConfigMetadataOut])
async def get_config_history(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ConfigMetadata)
        .where(ConfigMetadata.device_id == device_id)
        .order_by(ConfigMetadata.backup_timestamp.desc())
    )
    return result.scalars().all()


@router.get("/view/{config_id}")
async def view_config(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(ConfigMetadata).where(ConfigMetadata.id == config_id))
    meta = result.scalar_one_or_none()
    if not meta:
        raise HTTPException(status_code=404, detail="Config record not found")

    file_path = BACKEND_ROOT / meta.file_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Config file missing from disk")

    content = file_path.read_text(encoding="utf-8")
    return PlainTextResponse(content)
