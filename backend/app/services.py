import json
from datetime import datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import TypedDict

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Incident, IncidentLevel, IncidentStatus


LEVEL_ORDER = {
    IncidentLevel.GREEN: 0,
    IncidentLevel.ORANGE: 1,
    IncidentLevel.RED: 2,
}

DEFAULT_INCIDENT_CHOICES = [
    "Panne signalisation",
    "Retard important ligne tram",
    "Incident voyageur",
    "Obstacle sur voie",
    "Coupure electrique secteur",
    "Arret d'urgence active",
    "Probleme de communication radio",
    "Incident securite station",
]
INCIDENT_CHOICES_FILE = Path(__file__).resolve().parent.parent / "data" / "incident_choices.json"
INCIDENT_CHOICES_LOCK = Lock()


class IncidentActionState(TypedDict):
    incident_id: int
    passenger_announcement_done: bool
    passenger_announcement_done_at: datetime | None
    passenger_announcement_done_by: str | None
    on_call_contact_done: bool
    on_call_contact_done_at: datetime | None
    on_call_contact_done_by: str | None


INCIDENT_ACTIONS_STATE: dict[int, IncidentActionState] = {}


def _normalize_incident_choice(value: str) -> str:
    return " ".join(value.strip().split())


def _normalize_location(value: str | None) -> str | None:
    if not value:
        return None
    normalized = " ".join(value.strip().split())
    return normalized if normalized else None


def _normalize_track(value: int | None) -> int | None:
    if value is None:
        return None
    if value not in (1, 2):
        raise ValueError("Track must be 1 or 2")
    return value


def _sanitize_incident_choices(raw: object) -> dict[str, list[str]] | list[str]:
    """Support both new hierarchical format and old flat list format"""
    if isinstance(raw, dict):
        # New hierarchical format
        cleaned: dict[str, list[str]] = {}
        for category, items in raw.items():
            if not isinstance(category, str) or not isinstance(items, list):
                continue
            cleaned_items = []
            seen = set()
            for item in items:
                if not isinstance(item, str):
                    continue
                normalized = _normalize_incident_choice(item)
                if not normalized or normalized.casefold() in seen:
                    continue
                seen.add(normalized.casefold())
                cleaned_items.append(normalized)
            if cleaned_items:
                cleaned[category] = cleaned_items
        return cleaned if cleaned else list(DEFAULT_INCIDENT_CHOICES)
    
    elif isinstance(raw, list):
        # Old flat list format
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in raw:
            if not isinstance(item, str):
                continue
            normalized = _normalize_incident_choice(item)
            if not normalized:
                continue
            key = normalized.casefold()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(normalized)
        return cleaned
    
    return list(DEFAULT_INCIDENT_CHOICES)


def _write_incident_choices_unlocked(choices: dict[str, list[str]] | list[str]) -> None:
    INCIDENT_CHOICES_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_file = INCIDENT_CHOICES_FILE.with_suffix(".tmp")
    temp_file.write_text(
        json.dumps(choices, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temp_file.replace(INCIDENT_CHOICES_FILE)


def _load_incident_choices_unlocked() -> dict[str, list[str]] | list[str]:
    if not INCIDENT_CHOICES_FILE.exists():
        defaults = list(DEFAULT_INCIDENT_CHOICES)
        _write_incident_choices_unlocked(defaults)
        return defaults

    try:
        raw = json.loads(INCIDENT_CHOICES_FILE.read_text(encoding="utf-8"))
    except Exception:
        defaults = list(DEFAULT_INCIDENT_CHOICES)
        _write_incident_choices_unlocked(defaults)
        return defaults

    cleaned = _sanitize_incident_choices(raw)
    if raw != cleaned:
        _write_incident_choices_unlocked(cleaned)
    return cleaned


def list_incident_choices() -> dict[str, list[str]] | list[str]:
    """Returns incident choices in their original format (hierarchical or flat list)"""
    with INCIDENT_CHOICES_LOCK:
        choices = _load_incident_choices_unlocked()
        if isinstance(choices, dict):
            return {k: v.copy() for k, v in choices.items()}
        else:
            return choices.copy()


def list_incident_choices_flat() -> list[str]:
    """Returns flattened list of all incident choices for backward compatibility"""
    with INCIDENT_CHOICES_LOCK:
        choices = _load_incident_choices_unlocked()
        if isinstance(choices, dict):
            return [item for items in choices.values() for item in items]
        else:
            return choices.copy()


def add_incident_choice(value: str) -> dict[str, list[str]] | list[str]:
    normalized = _normalize_incident_choice(value)
    if not normalized:
        raise ValueError("Incident choice cannot be empty")

    with INCIDENT_CHOICES_LOCK:
        choices = _load_incident_choices_unlocked()
        
        # Only works with flat list format
        if isinstance(choices, list):
            if any(existing.casefold() == normalized.casefold() for existing in choices):
                return choices.copy()
            choices.insert(0, normalized)
            _write_incident_choices_unlocked(choices)
            return choices.copy()
        
        # Return hierarchical format as is
        return {k: v.copy() for k, v in choices.items()}


def remove_incident_choice(value: str) -> dict[str, list[str]] | list[str]:
    normalized = _normalize_incident_choice(value)
    with INCIDENT_CHOICES_LOCK:
        choices = _load_incident_choices_unlocked()
        if not normalized:
            if isinstance(choices, dict):
                return {k: v.copy() for k, v in choices.items()}
            return choices.copy()

        # Only works with flat list format
        if isinstance(choices, list):
            next_choices = [
                choice for choice in choices if choice.casefold() != normalized.casefold()
            ]
            if next_choices != choices:
                _write_incident_choices_unlocked(next_choices)
            return next_choices.copy()
        
        # Return hierarchical format as is
        return {k: v.copy() for k, v in choices.items()}


def _default_action_state(incident_id: int) -> IncidentActionState:
    return {
        "incident_id": incident_id,
        "passenger_announcement_done": False,
        "passenger_announcement_done_at": None,
        "passenger_announcement_done_by": None,
        "on_call_contact_done": False,
        "on_call_contact_done_at": None,
        "on_call_contact_done_by": None,
    }


def _get_or_init_action_state(incident_id: int) -> IncidentActionState:
    state = INCIDENT_ACTIONS_STATE.get(incident_id)
    if state is None:
        state = _default_action_state(incident_id)
        INCIDENT_ACTIONS_STATE[incident_id] = state
    return state


def get_active_incident_action_states(db: Session) -> list[IncidentActionState]:
    active_incidents = db.scalars(
        select(Incident)
        .where(Incident.status == IncidentStatus.ACTIVE)
        .order_by(Incident.started_at.desc())
    ).all()

    active_ids = {incident.id for incident in active_incidents}
    stale_ids = [incident_id for incident_id in INCIDENT_ACTIONS_STATE if incident_id not in active_ids]
    for incident_id in stale_ids:
        INCIDENT_ACTIONS_STATE.pop(incident_id, None)

    return [_get_or_init_action_state(incident.id).copy() for incident in active_incidents]


def toggle_passenger_announcement(
    db: Session,
    incident_id: int,
    done_by: str,
) -> IncidentActionState | None:
    incident = db.get(Incident, incident_id)
    if not incident or incident.status != IncidentStatus.ACTIVE:
        return None

    state = _get_or_init_action_state(incident_id)
    done = not state["passenger_announcement_done"]
    state["passenger_announcement_done"] = done
    state["passenger_announcement_done_at"] = _utcnow() if done else None
    state["passenger_announcement_done_by"] = done_by if done else None
    return state.copy()


def toggle_on_call_contact(
    db: Session,
    incident_id: int,
    done_by: str,
) -> IncidentActionState | None:
    incident = db.get(Incident, incident_id)
    if not incident or incident.status != IncidentStatus.ACTIVE:
        return None

    state = _get_or_init_action_state(incident_id)
    done = not state["on_call_contact_done"]
    state["on_call_contact_done"] = done
    state["on_call_contact_done_at"] = _utcnow() if done else None
    state["on_call_contact_done_by"] = done_by if done else None
    return state.copy()


def clear_incident_action_state(incident_id: int) -> None:
    INCIDENT_ACTIONS_STATE.pop(incident_id, None)


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


def create_incident(
    db: Session,
    message: str,
    start_level: IncidentLevel,
    line: str | None = None,
    track: int | None = None,
    station: str | None = None,
    interstation: str | None = None,
) -> Incident:
    normalized_line = line.strip().upper() if line and line.strip() else None
    normalized_track = _normalize_track(track)
    normalized_station = _normalize_location(station)
    normalized_interstation = _normalize_location(interstation)

    if normalized_station and normalized_interstation:
        raise ValueError("Only one location type can be provided: station or interstation")

    incident = Incident(
        line=normalized_line,
        track=normalized_track,
        station=normalized_station,
        interstation=normalized_interstation,
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
    clear_incident_action_state(incident_id)
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
    track: int | None,
    location: str | None,
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
    if track:
        base_query = base_query.where(Incident.track == track)
        count_query = count_query.where(Incident.track == track)
    if location:
        location_text = location.strip()
        if location_text:
            location_pattern = f"%{location_text}%"
            legacy_location = f"%[LOC:{location_text}]%"
            base_query = base_query.where(
                or_(
                    Incident.station.ilike(location_pattern),
                    Incident.interstation.ilike(location_pattern),
                    Incident.message.ilike(legacy_location),
                )
            )
            count_query = count_query.where(
                or_(
                    Incident.station.ilike(location_pattern),
                    Incident.interstation.ilike(location_pattern),
                    Incident.message.ilike(legacy_location),
                )
            )
    if severity:
        base_query = base_query.where(Incident.max_level_reached == severity)
        count_query = count_query.where(Incident.max_level_reached == severity)

    total = db.scalar(count_query) or 0
    items = db.scalars(
        base_query.order_by(Incident.started_at.desc()).limit(limit).offset(offset)
    ).all()
    return items, total
