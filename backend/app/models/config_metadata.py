from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.core.database import Base


class ConfigMetadata(Base):
    __tablename__ = "config_metadata"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String(500), nullable=False)
    checksum = Column(String(64), nullable=False)
    backup_timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
