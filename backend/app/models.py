import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Integer, String, Text
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    line: Mapped[str | None] = mapped_column(String(8), nullable=True)
    track: Mapped[int | None] = mapped_column(Integer, nullable=True)
    station: Mapped[str | None] = mapped_column(String(128), nullable=True)
    interstation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus, name="incident_status_enum"), nullable=False, default=IncidentStatus.ACTIVE
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.now
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_level: Mapped[IncidentLevel] = mapped_column(
        Enum(IncidentLevel, name="incident_level_start_enum"), nullable=False, default=IncidentLevel.GREEN
    )
    max_level_reached: Mapped[IncidentLevel] = mapped_column(
        Enum(IncidentLevel, name="incident_level_max_enum"), nullable=False, default=IncidentLevel.ORANGE
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.now
    )

