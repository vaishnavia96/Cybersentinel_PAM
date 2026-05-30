from pydantic import BaseModel


class LinkCreate(BaseModel):
    source_device_id: int
    target_device_id: int
    source_interface: str | None = None
    target_interface: str | None = None
    link_type: str = "manual"


class LinkOut(BaseModel):
    id: int
    source_device_id: int
    target_device_id: int
    source_interface: str | None = None
    target_interface: str | None = None
    link_type: str

    model_config = {"from_attributes": True}


class ScanRequest(BaseModel):
    subnet: str
    credential_id: int | None = None


class ScanResult(BaseModel):
    ip: str
    status: str
    hostname: str | None = None
    vendor: str | None = None
    model: str | None = None
    detail: str | None = None
