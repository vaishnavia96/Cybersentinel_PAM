from sqlalchemy import Column, ForeignKey, Integer, String

from app.core.database import Base


class TopologyLink(Base):
    __tablename__ = "topology_links"

    id = Column(Integer, primary_key=True, index=True)
    source_device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    target_device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    source_interface = Column(String(100), nullable=True)
    target_interface = Column(String(100), nullable=True)
    link_type = Column(String(20), nullable=False, default="manual")
