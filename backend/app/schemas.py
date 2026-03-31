from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import IncidentLevel, IncidentStatus


IncidentLine = Literal["T1", "T2", "T3", "T4", "BW1", "BW2"]


class IncidentCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    start_level: IncidentLevel = IncidentLevel.GREEN
    line: IncidentLine | None = None


class IncidentResponse(BaseModel):
    id: int
    line: IncidentLine | None = None
    message: str
    status: IncidentStatus
    started_at: datetime
    resolved_at: datetime | None
    duration_seconds: int | None
    start_level: IncidentLevel
    max_level_reached: IncidentLevel
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HistoryResponse(BaseModel):
    items: list[IncidentResponse]
    total: int
    limit: int
    offset: int
