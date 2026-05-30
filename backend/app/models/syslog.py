from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base


class Syslog(Base):
    __tablename__ = "syslogs"

    timestamp = Column(DateTime(timezone=True), primary_key=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True)
    facility = Column(Integer, nullable=True)
    severity = Column(String(20), nullable=False)
    message = Column(Text, nullable=False)
