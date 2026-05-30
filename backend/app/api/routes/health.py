from fastapi import APIRouter
from sqlalchemy import text

from app.core.database import AsyncSessionLocal

router = APIRouter()


@router.get("/health")
async def health_check():
    db_status = "disconnected"
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
            db_status = "connected"
    except Exception:
        db_status = "disconnected"

    return {
        "status": "ok",
        "service": "NMS API Core",
        "database": db_status,
    }
