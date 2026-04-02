from datetime import datetime, timedelta

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Incident, IncidentLevel, IncidentStatus


LEVEL_ORDER = {
    IncidentLevel.GREEN: 0,
    IncidentLevel.ORANGE: 1,
    IncidentLevel.RED: 2,
}


def _utcnow() -> datetime:
    return datetime.now()


def _as_utc(value: datetime) -> datetime:
    # On s'assure juste que la date n'a plus de notion de fuseau horaire
    return value.replace(tzinfo=None)


def _max_level(level_a: IncidentLevel, level_b: IncidentLevel) -> IncidentLevel:
    return level_a if LEVEL_ORDER[level_a] >= LEVEL_ORDER[level_b] else level_b


def _current_level(incident: Incident, at_time: datetime) -> IncidentLevel:
    started_at = _as_utc(incident.started_at)
    elapsed_seconds = int((at_time - started_at).total_seconds())

    if incident.start_level == IncidentLevel.RED:
        return IncidentLevel.RED

    if incident.start_level == IncidentLevel.ORANGE:
        return IncidentLevel.RED if elapsed_seconds >= settings.red_threshold_seconds else IncidentLevel.ORANGE

    if elapsed_seconds >= settings.red_threshold_seconds * 2:
        return IncidentLevel.RED
    if elapsed_seconds >= settings.red_threshold_seconds:
        return IncidentLevel.ORANGE
    return IncidentLevel.GREEN


def update_overdue_active_levels(db: Session) -> None:
    now = _utcnow()
    incidents = db.scalars(select(Incident).where(Incident.status == IncidentStatus.ACTIVE)).all()
    changed = False
    for incident in incidents:
        current_level = _current_level(incident, now)
        new_max = _max_level(incident.max_level_reached, current_level)
        if new_max != incident.max_level_reached:
            incident.max_level_reached = new_max
            changed = True
    if changed:
        db.commit()


def create_incident(db: Session, message: str, start_level: IncidentLevel, line: str | None = None) -> Incident:
    normalized_line = line.strip().upper() if line and line.strip() else None
    incident = Incident(
        line=normalized_line,
        message=message.strip(),
        status=IncidentStatus.ACTIVE,
        start_level=start_level,
        max_level_reached=start_level,
      
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
    current_level = _current_level(incident, resolved_at)
    incident.max_level_reached = _max_level(incident.max_level_reached, current_level)

    db.commit()
    db.refresh(incident)
    return incident


def force_incident_red(db: Session, incident_id: int) -> Incident | None:
    incident = db.get(Incident, incident_id)
    if not incident or incident.status != IncidentStatus.ACTIVE:
        return None

    incident.start_level = IncidentLevel.RED
    incident.max_level_reached = IncidentLevel.RED

    db.commit()
    db.refresh(incident)
    return incident


def force_incident_orange(db: Session, incident_id: int) -> Incident | None:
    incident = db.get(Incident, incident_id)
    if not incident or incident.status != IncidentStatus.ACTIVE:
        return None

    if incident.start_level == IncidentLevel.RED or incident.max_level_reached == IncidentLevel.RED:
        return incident

    incident.start_level = IncidentLevel.ORANGE
    incident.max_level_reached = _max_level(incident.max_level_reached, IncidentLevel.ORANGE)

    db.commit()
    db.refresh(incident)
    return incident


def get_history(
    db: Session,
    status: IncidentStatus | None,
    from_dt: datetime | None,
    to_dt: datetime | None,
    incident: str | None,
    incident_type: str | None,
    line: str | None,
    severity: IncidentLevel | None,
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
    if incident:
        incident_text = incident.strip()
        if incident_text:
            pattern = f"%{incident_text}%"
            base_query = base_query.where(Incident.message.ilike(pattern))
            count_query = count_query.where(Incident.message.ilike(pattern))
    if incident_type:
        incident_type_text = incident_type.strip()
        if incident_type_text:
            base_query = base_query.where(Incident.message == incident_type_text)
            count_query = count_query.where(Incident.message == incident_type_text)
    if line:
        line_text = line.strip().upper()
        if line_text:
            # Keep compatibility with historical records where line was encoded in message.
            legacy_prefix = f"[{line_text}] %"
            base_query = base_query.where(or_(Incident.line == line_text, Incident.message.ilike(legacy_prefix)))
            count_query = count_query.where(or_(Incident.line == line_text, Incident.message.ilike(legacy_prefix)))
    if severity:
        base_query = base_query.where(Incident.max_level_reached == severity)
        count_query = count_query.where(Incident.max_level_reached == severity)

    total = db.scalar(count_query) or 0
    items = db.scalars(
        base_query.order_by(Incident.started_at.desc()).limit(limit).offset(offset)
    ).all()
    return items, total
