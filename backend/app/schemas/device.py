from datetime import datetime

from pydantic import BaseModel

from app.schemas.credential import CredentialOut


class DeviceCreate(BaseModel):
    ip_address: str
    hostname: str | None = None
    vendor: str | None = None
    model: str | None = None
    location: str | None = None
    credential_ids: list[int] = []


class DeviceUpdate(BaseModel):
    ip_address: str | None = None
    hostname: str | None = None
    vendor: str | None = None
    model: str | None = None
    location: str | None = None
    status: str | None = None
    credential_ids: list[int] | None = None


class DeviceOut(BaseModel):
    id: int
    ip_address: str
    hostname: str | None = None
    vendor: str | None = None
    model: str | None = None
    location: str | None = None
    status: str
    snmp_status: str = "unknown"
    os_info: str | None = None
    created_at: datetime
    updated_at: datetime
    credentials: list[CredentialOut] = []

    model_config = {"from_attributes": True}
