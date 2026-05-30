from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class Metric(Base):
    __tablename__ = "metrics"

    timestamp = Column(DateTime(timezone=True), primary_key=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True)
    metric_name = Column(String(100), primary_key=True)
    label_hash = Column(String(16), primary_key=True, default="", server_default="")
    metric_value = Column(Float, nullable=False)
    labels = Column(JSONB, nullable=False, server_default="{}", default=dict)
