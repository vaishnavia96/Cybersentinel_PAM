import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import require_role, get_current_user
from app.models.device import Device
from app.models.credential import Credential
from app.models.installed_software import InstalledSoftware
from app.models.user import User
from app.schemas.device import DeviceCreate, DeviceOut, DeviceUpdate
from app.core.security import decrypt_value
from app.models.device_credential import device_credentials

router = APIRouter(prefix="/devices", tags=["devices"])


async def _attach_credentials(db: AsyncSession, device: Device, credential_ids: list[int]):
    device.credentials.clear()
    if credential_ids:
        result = await db.execute(select(Credential).where(Credential.id.in_(credential_ids)))
        device.credentials = list(result.scalars().all())


@router.get("", response_model=list[DeviceOut])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Device).order_by(Device.id))
    return result.scalars().all()


class RescanRequest(BaseModel):
    device_ids: list[int] = []
    all: bool = False


@router.post("/rescan")
async def rescan_devices(
    body: RescanRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin", "operator"])),
):
    """Force re-ping + SNMP fingerprint for specific devices or all devices."""
    from discovery_worker import scan_host

    if body.all:
        result = await db.execute(select(Device))
    elif body.device_ids:
        result = await db.execute(select(Device).where(Device.id.in_(body.device_ids)))
    else:
        return []

    devices = result.scalars().all()
    if not devices:
        return []

    cred_result = await db.execute(
        select(Credential).where(Credential.type.in_(["snmp_v2c", "snmp_v3"]))
    )
    creds = cred_result.scalars().all()
    communities: list[tuple[int, str]] = []
    for c in creds:
        if c.community_string:
            try:
                plain = decrypt_value(c.community_string)
            except Exception:
                plain = c.community_string
            communities.append((c.id, plain))

    sem = asyncio.Semaphore(20)

    async def scan_one(device: Device):
        async with sem:
            return device, await scan_host(device.ip_address, communities, None)

    scan_tasks = await asyncio.gather(*[scan_one(d) for d in devices], return_exceptions=True)

    now = datetime.now(timezone.utc)
    results = []
    for item in scan_tasks:
        if isinstance(item, Exception):
            continue
        device, scan = item
        snmp_hit = bool(scan.get("hostname") or scan.get("vendor"))
        device.status = "up" if scan["status"] == "up" else "down"
        device.snmp_status = "on" if snmp_hit else ("off" if scan["status"] == "up" else device.snmp_status)
        if scan.get("hostname"):
            device.hostname = scan["hostname"]
        if scan.get("vendor"):
            device.vendor = scan["vendor"]
        if scan.get("model"):
            device.model = scan["model"]
        if scan.get("os_info"):
            device.os_info = scan["os_info"]
        device.updated_at = now

        # Link the matched SNMP credential if not already linked
        cred_id = scan.get("_credential_id")
        if cred_id and snmp_hit:
            existing = await db.execute(
                select(device_credentials).where(
                    device_credentials.c.device_id == device.id,
                    device_credentials.c.credential_id == cred_id,
                )
            )
            if existing.first() is None:
                await db.execute(
                    device_credentials.insert().values(device_id=device.id, credential_id=cred_id)
                )

        results.append({
            "device_id": device.id,
            "ip_address": device.ip_address,
            "status": device.status,
            "snmp_status": device.snmp_status,
            "hostname": device.hostname,
            "vendor": device.vendor,
            "model": device.model,
            "os_info": device.os_info,
            "detail": scan.get("detail", ""),
        })

    await db.commit()
    return results


@router.get("/{device_id}", response_model=DeviceOut)
async def get_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
async def create_device(
    body: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin", "operator"])),
):
    data = body.model_dump(exclude={"credential_ids"})
    device = Device(**data)
    db.add(device)
    await db.flush()
    await _attach_credentials(db, device, body.credential_ids)
    await db.commit()
    await db.refresh(device)
    return device


@router.put("/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: int,
    body: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin", "operator"])),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    updates = body.model_dump(exclude_unset=True, exclude={"credential_ids"})
    for field, value in updates.items():
        setattr(device, field, value)
    if body.credential_ids is not None:
        await _attach_credentials(db, device, body.credential_ids)
    await db.commit()
    await db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.delete(device)
    await db.commit()


@router.get("/{device_id}/software")
async def get_device_software(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(InstalledSoftware)
        .where(InstalledSoftware.device_id == device_id)
        .order_by(InstalledSoftware.software_name)
    )
    rows = result.scalars().all()
    return [{"id": r.id, "software_name": r.software_name, "discovered_at": r.discovered_at.isoformat() if r.discovered_at else None} for r in rows]
