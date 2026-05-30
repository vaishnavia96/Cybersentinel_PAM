from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user, require_role
from app.models.active_alert import ActiveAlert
from app.models.alert_rule import AlertRule
from app.models.user import User
from app.schemas.alert import ActiveAlertOut, AlertRuleCreate, AlertRuleOut, AlertRuleUpdate

router = APIRouter(prefix="/alerts", tags=["alerts"])


# ── Active alerts ──

@router.get("/active", response_model=list[ActiveAlertOut])
async def list_active_alerts(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ActiveAlert)
        .where(ActiveAlert.resolved_at.is_(None))
        .order_by(ActiveAlert.triggered_at.desc())
    )
    return result.scalars().all()


@router.get("/all", response_model=list[ActiveAlertOut])
async def list_all_alerts(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(ActiveAlert).order_by(ActiveAlert.triggered_at.desc()).limit(200))
    return result.scalars().all()


@router.post("/acknowledge/{alert_id}", response_model=ActiveAlertOut)
async def acknowledge_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin", "operator"])),
):
    result = await db.execute(select(ActiveAlert).where(ActiveAlert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    result = await db.execute(select(ActiveAlert).where(ActiveAlert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.delete(alert)
    await db.commit()


# ── Alert rules ──

@router.get("/rules", response_model=list[AlertRuleOut])
async def list_rules(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(AlertRule).order_by(AlertRule.id))
    return result.scalars().all()


@router.post("/rules", response_model=AlertRuleOut, status_code=status.HTTP_201_CREATED)
async def create_rule(
    body: AlertRuleCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    rule = AlertRule(**body.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=AlertRuleOut)
async def update_rule(
    rule_id: int,
    body: AlertRuleUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()
