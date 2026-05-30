from datetime import datetime

from pydantic import BaseModel


class MetricPoint(BaseModel):
    timestamp: datetime
    metric_name: str
    metric_value: float
    labels: dict = {}

    model_config = {"from_attributes": True}


class MetricQuery(BaseModel):
    device_id: int
    metric_name: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
