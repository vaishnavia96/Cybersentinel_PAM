from sqlalchemy import Column, Float, Integer, String

from app.core.database import Base


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    metric_name = Column(String(100), nullable=False)
    operator = Column(String(10), nullable=False)
    threshold = Column(Float, nullable=False)
    severity = Column(String(20), nullable=False, default="warning")
