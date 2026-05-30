from datetime import datetime

from pydantic import BaseModel


class AlertRuleCreate(BaseModel):
    metric_name: str
    operator: str
    threshold: float
    severity: str = "warning"


class AlertRuleUpdate(BaseModel):
    metric_name: str | None = None
    operator: str | None = None
    threshold: float | None = None
    severity: str | None = None


class AlertRuleOut(BaseModel):
    id: int
    metric_name: str
    operator: str
    threshold: float
    severity: str

    model_config = {"from_attributes": True}


class ActiveAlertOut(BaseModel):
    id: int
    device_id: int
    alert_rule_id: int | None = None
    message: str
    severity: str
    triggered_at: datetime
    resolved_at: datetime | None = None

    model_config = {"from_attributes": True}


class SyslogOut(BaseModel):
    timestamp: datetime
    device_id: int
    facility: int | None = None
    severity: str
    message: str

    model_config = {"from_attributes": True}
