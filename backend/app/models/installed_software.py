from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.core.database import Base


class InstalledSoftware(Base):
    __tablename__ = "installed_software"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    software_name = Column(String(500), nullable=False)
    discovered_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
