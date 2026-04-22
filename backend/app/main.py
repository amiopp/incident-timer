from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine, get_db
from app import models  # noqa: F401 pour que SQLAlchemy enregistre les modèles
from app.models import IncidentStatus
from app.schemas import (
    HistoryResponse,
    IncidentActionStateResponse,
    IncidentChoicePayload,
    IncidentCreate,
    IncidentResponse,
)
from app.services import (
    add_incident_choice,
    create_incident,
    force_incident_orange,
    force_incident_red,
    get_active_incident_action_states,
    get_active_incidents,
    get_history,
    list_incident_choices,
    remove_incident_choice,
    resolve_incident,
    toggle_on_call_contact,
    toggle_passenger_announcement,
)
from app.websocket_manager import ws_manager

app = FastAPI(title="PCC Incident Timer API", version="1.0.0")

# Middleware CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Crée les tables au démarrage
@app.on_event("startup")
def startup():
    # Crée toutes les tables définies via Base
    Base.metadata.create_all(bind=engine)
    print("✅ Tables créées ou déjà existantes")
    
    # Ajoute les colonnes track/station/interstation si elles n'existent pas (fallback si migration échoue)
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        columns = [col["name"] for col in inspector.get_columns("incidents")]
        
        with engine.begin() as conn:
            if "track" not in columns:
                conn.execute(text("ALTER TABLE incidents ADD COLUMN track INTEGER NULL"))
                conn.commit()
                print("✅ Colonne 'track' ajoutée")
            if "station" not in columns:
                conn.execute(text("ALTER TABLE incidents ADD COLUMN station VARCHAR(128) NULL"))
                conn.commit()
                print("✅ Colonne 'station' ajoutée")
            if "interstation" not in columns:
                conn.execute(text("ALTER TABLE incidents ADD COLUMN interstation VARCHAR(128) NULL"))
                conn.commit()
                print("✅ Colonne 'interstation' ajoutée")
    except Exception as e:
        print(f"⚠️ Fallback track/station/interstation columns: {type(e).__name__}: {e}")

# Health check
@app.get("/health")
def health():
    return {"status": "ok"}

# Création d'un incident
@app.post("/api/incidents", response_model=IncidentResponse)
async def create_incident_endpoint(payload: IncidentCreate, db: Session = Depends(get_db)):
    try:
        incident = create_incident(
            db,
            payload.message,
            payload.start_level,
            payload.line,
            payload.track,
            payload.station,
            payload.interstation,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    data = IncidentResponse.model_validate(incident).model_dump(mode="json")
    await ws_manager.broadcast("incident_created", {"incident": data})
    return incident

# Liste des incidents actifs
@app.get("/api/incidents/active", response_model=list[IncidentResponse])
def list_active_incidents(db: Session = Depends(get_db)):
    return get_active_incidents(db)


@app.get("/api/incidents/choices")
def list_incident_choices_endpoint():
    return list_incident_choices()


@app.post("/api/incidents/choices")
async def add_incident_choice_endpoint(payload: IncidentChoicePayload):
    try:
        choices = add_incident_choice(payload.value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await ws_manager.broadcast("incident_choices_updated", {"choices": choices})
    return choices


@app.post("/api/incidents/choices/remove")
async def remove_incident_choice_endpoint(payload: IncidentChoicePayload):
    choices = remove_incident_choice(payload.value)
    await ws_manager.broadcast("incident_choices_updated", {"choices": choices})
    return choices


# État des actions (annonce / astreinte) pour les incidents actifs
@app.get("/api/incidents/actions", response_model=list[IncidentActionStateResponse])
def list_active_incident_actions(db: Session = Depends(get_db)):
    states = get_active_incident_action_states(db)
    return [IncidentActionStateResponse.model_validate(state) for state in states]


@app.post(
    "/api/incidents/{incident_id}/actions/passenger-announcement/toggle",
    response_model=IncidentActionStateResponse,
)
async def toggle_passenger_announcement_endpoint(
    incident_id: int,
    db: Session = Depends(get_db),
):
    state = toggle_passenger_announcement(db, incident_id, "OPÉRATEUR PCC")
    if not state:
        raise HTTPException(status_code=404, detail="Active incident not found")

    payload = IncidentActionStateResponse.model_validate(state).model_dump(mode="json")
    await ws_manager.broadcast("incident_action_updated", {"action_state": payload})
    return payload


@app.post(
    "/api/incidents/{incident_id}/actions/on-call/toggle",
    response_model=IncidentActionStateResponse,
)
async def toggle_on_call_contact_endpoint(
    incident_id: int,
    db: Session = Depends(get_db),
):
    state = toggle_on_call_contact(db, incident_id, "OPÉRATEUR PCC")
    if not state:
        raise HTTPException(status_code=404, detail="Active incident not found")

    payload = IncidentActionStateResponse.model_validate(state).model_dump(mode="json")
    await ws_manager.broadcast("incident_action_updated", {"action_state": payload})
    return payload

# Résolution d'un incident
@app.post("/api/incidents/{incident_id}/resolve", response_model=IncidentResponse)
async def resolve_incident_endpoint(incident_id: int, db: Session = Depends(get_db)):
    incident = resolve_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Active incident not found")
    data = IncidentResponse.model_validate(incident).model_dump(mode="json")
    await ws_manager.broadcast("incident_resolved", {"incident": data})
    return incident

# Forcer un incident en rouge
@app.post("/api/incidents/{incident_id}/force-red", response_model=IncidentResponse)
async def force_incident_red_endpoint(incident_id: int, db: Session = Depends(get_db)):
    incident = force_incident_red(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Active incident not found")
    data = IncidentResponse.model_validate(incident).model_dump(mode="json")
    await ws_manager.broadcast("incident_updated", {"incident": data})
    return incident

# Forcer un incident en orange
@app.post("/api/incidents/{incident_id}/force-orange", response_model=IncidentResponse)
async def force_incident_orange_endpoint(incident_id: int, db: Session = Depends(get_db)):
    incident = force_incident_orange(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Active incident not found")
    data = IncidentResponse.model_validate(incident).model_dump(mode="json")
    await ws_manager.broadcast("incident_updated", {"incident": data})
    return incident

# Historique des incidents
@app.get("/api/incidents/history", response_model=HistoryResponse)
def get_incidents_history(
    status: IncidentStatus | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    incident: str | None = Query(default=None),
    incident_type: str | None = Query(default=None),
    line: str | None = Query(default=None),
    track: int | None = Query(default=None, ge=1, le=2),
    location: str | None = Query(default=None),
    severity: models.IncidentLevel | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    items, total = get_history(
        db,
        status,
        from_,
        to,
        incident,
        incident_type,
        line,
        track,
        location,
        severity,
        limit,
        offset,
    )
    return HistoryResponse(items=items, total=total, limit=limit, offset=offset)

# WebSocket
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)