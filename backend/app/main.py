from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password, encrypt_value
from app.models.user import User
from app.models.credential import Credential
from app.models.alert_rule import AlertRule
from app.api.routes.health import router as health_router
from app.api.routes.auth import router as auth_router
from app.api.routes.devices import router as devices_router
from app.api.routes.credentials import router as credentials_router
from app.api.routes.discovery import router as discovery_router
from app.api.routes.topology import router as topology_router
from app.api.routes.metrics import router as metrics_router
from app.api.routes.ws import router as ws_router
from app.api.routes.ws_ssh import router as ws_ssh_router
from app.api.routes.poller import router as poller_router
from app.api.routes.alerts import router as alerts_router
from app.api.routes.syslogs import router as syslogs_router
from app.api.routes.config import router as config_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSessionLocal() as session:
        # Seed admin user
        result = await session.execute(select(User).where(User.username == "admin"))
        if result.scalar_one_or_none() is None:
            session.add(User(username="admin", hashed_password=hash_password("admin123"), role="admin", is_active=True))

        # Seed default SNMP credential
        result = await session.execute(select(Credential).where(Credential.name == "SNMP-Public"))
        if result.scalar_one_or_none() is None:
            session.add(Credential(name="SNMP-Public", type="snmp_v2c", community_string=encrypt_value("public")))

        # Seed default alert rules
        result = await session.execute(select(AlertRule))
        if not result.scalars().first():
            for metric, op, threshold, sev in [
                ("cpu_utilization", ">", 90, "critical"),
                ("cpu_utilization", ">", 75, "warning"),
                ("memory_utilization", ">", 85, "critical"),
                ("memory_utilization", ">", 70, "warning"),
                ("syslog_severity", "<=", 3, "critical"),
            ]:
                session.add(AlertRule(metric_name=metric, operator=op, threshold=threshold, severity=sev))

        await session.commit()
    yield


app = FastAPI(title="NMS API Core", version="0.5.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(devices_router, prefix="/api")
app.include_router(credentials_router, prefix="/api")
app.include_router(discovery_router, prefix="/api")
app.include_router(topology_router, prefix="/api")
app.include_router(metrics_router, prefix="/api")
app.include_router(ws_router, prefix="/api")
app.include_router(ws_ssh_router, prefix="/api")
app.include_router(poller_router, prefix="/api")
app.include_router(alerts_router, prefix="/api")
app.include_router(syslogs_router, prefix="/api")
app.include_router(config_router, prefix="/api")
