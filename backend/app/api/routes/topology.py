from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user, require_role
from app.models.topology_link import TopologyLink
from app.models.user import User
from app.schemas.topology import LinkCreate, LinkOut

router = APIRouter(prefix="/topology", tags=["topology"])


@router.post("/discover")
async def discover_topology(_: User = Depends(require_role(["admin", "operator"]))):
    from topology_discovery import run_topology_discovery
    result = await run_topology_discovery()
    return result


@router.get("/links", response_model=list[LinkOut])
async def list_links(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(TopologyLink).order_by(TopologyLink.id))
    return result.scalars().all()


@router.post("/links", response_model=LinkOut, status_code=status.HTTP_201_CREATED)
async def create_link(
    body: LinkCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin", "operator"])),
):
    link = TopologyLink(**body.model_dump())
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


@router.delete("/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_link(
    link_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin", "operator"])),
):
    result = await db.execute(select(TopologyLink).where(TopologyLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.delete(link)
    await db.commit()
