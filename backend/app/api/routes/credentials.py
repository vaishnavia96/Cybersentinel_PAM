from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import encrypt_value
from app.api.deps import require_role
from app.models.credential import Credential
from app.models.user import User
from app.schemas.credential import CredentialCreate, CredentialOut, CredentialUpdate


def _encrypt_secrets(data: dict) -> dict:
    for key in ("password", "community_string"):
        if data.get(key):
            data[key] = encrypt_value(data[key])
    return data

router = APIRouter(prefix="/credentials", tags=["credentials"])


@router.get("", response_model=list[CredentialOut])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin", "operator"])),
):
    result = await db.execute(select(Credential).order_by(Credential.id))
    return result.scalars().all()


@router.get("/{credential_id}", response_model=CredentialOut)
async def get_credential(
    credential_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin", "operator"])),
):
    result = await db.execute(select(Credential).where(Credential.id == credential_id))
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    return cred


@router.post("", response_model=CredentialOut, status_code=status.HTTP_201_CREATED)
async def create_credential(
    body: CredentialCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    cred = Credential(**_encrypt_secrets(body.model_dump()))
    db.add(cred)
    await db.commit()
    await db.refresh(cred)
    return cred


@router.put("/{credential_id}", response_model=CredentialOut)
async def update_credential(
    credential_id: int,
    body: CredentialUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin", "operator"])),
):
    result = await db.execute(select(Credential).where(Credential.id == credential_id))
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    updates = _encrypt_secrets(body.model_dump(exclude_unset=True))
    for field, value in updates.items():
        setattr(cred, field, value)
    await db.commit()
    await db.refresh(cred)
    return cred


@router.delete("/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    credential_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    result = await db.execute(select(Credential).where(Credential.id == credential_id))
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    await db.delete(cred)
    await db.commit()
