from datetime import datetime

from pydantic import BaseModel


class ConfigMetadataOut(BaseModel):
    id: int
    device_id: int
    file_path: str
    checksum: str
    backup_timestamp: datetime

    model_config = {"from_attributes": True}


class BackupResult(BaseModel):
    status: str
    detail: str
    checksum: str | None = None
    file_path: str | None = None
    file_size: int | None = None
    last_backup: str | None = None
