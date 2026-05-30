from sqlalchemy import Column, ForeignKey, Integer, Table

from app.core.database import Base

device_credentials = Table(
    "device_credentials",
    Base.metadata,
    Column("device_id", Integer, ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True),
    Column("credential_id", Integer, ForeignKey("credentials.id", ondelete="CASCADE"), primary_key=True),
)
