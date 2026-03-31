from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine, get_db
from app import models  # noqa: F401
from app.models import IncidentStatus
from app.schemas import HistoryResponse, IncidentCreate, IncidentResponse
from app.services import (
    create_incident,
    force_incident_orange,
    force_incident_red,
    get_active_incidents,
    get_history,
    resolve_incident,
)
from app.websocket_manager import ws_manager

app = FastAPI(title="PCC Incident Timer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/incidents", response_model=IncidentResponse)
async def create_incident_endpoint(payload: IncidentCreate, db: Session = Depends(get_db)):
    incident = create_incident(db, payload.message, payload.start_level, payload.line)
    data = IncidentResponse.model_validate(incident).model_dump(mode="json")
    await ws_manager.broadcast("incident_created", {"incident": data})
    return incident


@app.get("/api/incidents/active", response_model=list[IncidentResponse])
def list_active_incidents(db: Session = Depends(get_db)):
    return get_active_incidents(db)


@app.post("/api/incidents/{incident_id}/resolve", response_model=IncidentResponse)
async def resolve_incident_endpoint(incident_id: int, db: Session = Depends(get_db)):
    incident = resolve_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Active incident not found")

    data = IncidentResponse.model_validate(incident).model_dump(mode="json")
    await ws_manager.broadcast("incident_resolved", {"incident": data})
    return incident


@app.post("/api/incidents/{incident_id}/force-red", response_model=IncidentResponse)
async def force_incident_red_endpoint(incident_id: int, db: Session = Depends(get_db)):
    incident = force_incident_red(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Active incident not found")

    data = IncidentResponse.model_validate(incident).model_dump(mode="json")
    await ws_manager.broadcast("incident_updated", {"incident": data})
    return incident


@app.post("/api/incidents/{incident_id}/force-orange", response_model=IncidentResponse)
async def force_incident_orange_endpoint(incident_id: int, db: Session = Depends(get_db)):
    incident = force_incident_orange(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Active incident not found")

    data = IncidentResponse.model_validate(incident).model_dump(mode="json")
    await ws_manager.broadcast("incident_updated", {"incident": data})
    return incident


@app.get("/api/incidents/history", response_model=HistoryResponse)
def get_incidents_history(
    status: IncidentStatus | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    incident: str | None = Query(default=None),
    incident_type: str | None = Query(default=None),
    line: str | None = Query(default=None),
    severity: models.IncidentLevel | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    items, total = get_history(db, status, from_, to, incident, incident_type, line, severity, limit, offset)
    return HistoryResponse(items=items, total=total, limit=limit, offset=offset)


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
