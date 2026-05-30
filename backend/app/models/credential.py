from sqlalchemy import Column, Integer, String

from app.core.database import Base


class Credential(Base):
    __tablename__ = "credentials"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), unique=True, nullable=False)
    type = Column(String(20), nullable=False)  # snmp_v2c, snmp_v3, ssh
    username = Column(String(100), nullable=True)
    password = Column(String(255), nullable=True)
    community_string = Column(String(255), nullable=True)
