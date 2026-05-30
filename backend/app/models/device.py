from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(45), unique=True, nullable=False, index=True)
    hostname = Column(String(255), nullable=True)
    vendor = Column(String(100), nullable=True)
    model = Column(String(100), nullable=True)
    location = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, default="unknown")
    snmp_status = Column(String(10), nullable=False, default="unknown", server_default="unknown")
    os_info = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    credentials = relationship("Credential", secondary="device_credentials", lazy="selectin")
