from datetime import datetime, timezone, timedelta

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Incident, IncidentLevel, IncidentStatus


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def update_overdue_active_levels(db: Session) -> None:
    red_cutoff = _utcnow() - timedelta(seconds=settings.red_threshold_seconds)
    incidents = db.scalars(
        select(Incident).where(
            Incident.status == IncidentStatus.ACTIVE,
            Incident.max_level_reached == IncidentLevel.ORANGE,
            Incident.started_at <= red_cutoff,
        )
    ).all()
    changed = False
    for incident in incidents:
        incident.max_level_reached = IncidentLevel.RED
        changed = True
    if changed:
        db.commit()


def create_incident(db: Session, message: str) -> Incident:
    incident = Incident(
        message=message.strip(),
        status=IncidentStatus.ACTIVE,
        max_level_reached=IncidentLevel.ORANGE,
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return incident


def get_active_incidents(db: Session) -> list[Incident]:
    update_overdue_active_levels(db)
    return db.scalars(
        select(Incident)
        .where(Incident.status == IncidentStatus.ACTIVE)
        .order_by(Incident.started_at.desc())
    ).all()


def resolve_incident(db: Session, incident_id: int) -> Incident | None:
    incident = db.get(Incident, incident_id)
    if not incident or incident.status != IncidentStatus.ACTIVE:
        return None

    resolved_at = _utcnow()
    started_at = _as_utc(incident.started_at)
    duration_seconds = int((resolved_at - started_at).total_seconds())

    incident.status = IncidentStatus.RESOLVED
    incident.resolved_at = resolved_at
    incident.duration_seconds = duration_seconds
    incident.max_level_reached = (
        IncidentLevel.RED
        if duration_seconds >= settings.red_threshold_seconds
        else IncidentLevel.ORANGE
    )

    db.commit()
    db.refresh(incident)
    return incident


def get_history(
    db: Session,
    status: IncidentStatus | None,
    from_dt: datetime | None,
    to_dt: datetime | None,
    limit: int,
    offset: int,
) -> tuple[list[Incident], int]:
    update_overdue_active_levels(db)

    base_query: Select[tuple[Incident]] = select(Incident)
    count_query = select(func.count(Incident.id))

    if status:
        base_query = base_query.where(Incident.status == status)
        count_query = count_query.where(Incident.status == status)
    if from_dt:
        base_query = base_query.where(Incident.started_at >= from_dt)
        count_query = count_query.where(Incident.started_at >= from_dt)
    if to_dt:
        base_query = base_query.where(Incident.started_at <= to_dt)
        count_query = count_query.where(Incident.started_at <= to_dt)

    total = db.scalar(count_query) or 0
    items = db.scalars(
        base_query.order_by(Incident.started_at.desc()).limit(limit).offset(offset)
    ).all()
    return items, total
