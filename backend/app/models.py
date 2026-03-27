import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, Integer, BigInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IncidentStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    RESOLVED = "RESOLVED"


class IncidentLevel(str, enum.Enum):
    ORANGE = "ORANGE"
    RED = "RED"
    GREEN = "GREEN"


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus, name="incident_status"), nullable=False, default=IncidentStatus.ACTIVE
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_level: Mapped[IncidentLevel] = mapped_column(
        Enum(IncidentLevel, name="incident_level"), nullable=False, default=IncidentLevel.GREEN
    )
    max_level_reached: Mapped[IncidentLevel] = mapped_column(
        Enum(IncidentLevel, name="incident_level"), nullable=False, default=IncidentLevel.ORANGE
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    notification_level_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
