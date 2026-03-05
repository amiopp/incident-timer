from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import IncidentLevel, IncidentStatus


class IncidentCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)


class IncidentResponse(BaseModel):
    id: int
    message: str
    status: IncidentStatus
    started_at: datetime
    resolved_at: datetime | None
    duration_seconds: int | None
    max_level_reached: IncidentLevel
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HistoryResponse(BaseModel):
    items: list[IncidentResponse]
    total: int
    limit: int
    offset: int
