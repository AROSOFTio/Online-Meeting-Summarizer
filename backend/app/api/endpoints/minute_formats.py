import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core import deps
from app.core.config import settings
from app.models.models import Meeting, MeetingStatus, Transcript, User, UserRole
from app.models.minute_formats import MinuteFormat, MeetingMinuteFormat
from app.services.structured_minutes import FormatDefinition, get_snapshot, metadata, validate_values, missing_required, generate_snapshot

router = APIRouter()


def meeting_access(db, meeting_id, user, write=False):
    query = db.query(Meeting).filter(Meeting.id == meeting_id)
    meeting = query.with_for_update().first() if write else query.first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if user.role != UserRole.admin and meeting.owner_id != user.id:
        if write or user.role != UserRole.staff or meeting.status != MeetingStatus.completed:
            raise HTTPException(403, "Not authorized")
    if write and (meeting.status == MeetingStatus.processing or (Path(settings.EXPORT_DIR)/f"meeting-{meeting_id}-final-minutes.pdf").exists()):
        raise HTTPException(409, "Processing or finalized meetings cannot be changed")
    return meeting


def payload(db, meeting_id):
    snapshot = get_snapshot(db, meeting_id)
    if not snapshot:
        return None
    row, definition, values = snapshot
    return {"definition":definition.model_dump(),"values":values,"status":row.status,"missing_required":missing_required(definition,values)}


@router.get("/library")
def library(db:Session=Depends(deps.get_db), user:User=Depends(deps.get_minutes_editor)):
    return [{"id":r.id,"definition":json.loads(r.definition)} for r in db.query(MinuteFormat).filter(MinuteFormat.owner_id==user.id).order_by(MinuteFormat.id.desc()).all()]


@router.post("/library")
def save_format(body:FormatDefinition,db:Session=Depends(deps.get_db),user:User=Depends(deps.get_minutes_editor)):
    row=MinuteFormat(owner_id=user.id,definition=body.model_dump_json())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id":row.id,"definition":body.model_dump()}


class Selection(BaseModel):
    format_id:int


@router.get("/meeting/{meeting_id}")
def read_meeting(meeting_id:int,db:Session=Depends(deps.get_db),user:User=Depends(deps.get_current_user)):
    meeting_access(db,meeting_id,user)
    return payload(db,meeting_id)


@router.put("/meeting/{meeting_id}/format")
def select_format(meeting_id:int,body:Selection,db:Session=Depends(deps.get_db),user:User=Depends(deps.get_minutes_editor)):
    meeting=meeting_access(db,meeting_id,user,True)
    template=db.query(MinuteFormat).filter(MinuteFormat.id==body.format_id,MinuteFormat.owner_id==user.id).first()
    if not template:
        raise HTTPException(404,"Format not found")
    existing=db.get(MeetingMinuteFormat,meeting_id)
    if existing:
        raise HTTPException(409,"A format is already attached; preserve the existing meeting draft")
    definition=FormatDefinition.model_validate_json(template.definition)
    row=MeetingMinuteFormat(meeting_id=meeting_id,definition=template.definition,values_json=json.dumps(validate_values(definition,metadata(db,meeting,definition))))
    db.add(row)
    db.commit()
    return payload(db,meeting_id)


class Values(BaseModel):
    values:dict[str,str]


@router.put("/meeting/{meeting_id}/values")
def edit_values(meeting_id:int,body:Values,db:Session=Depends(deps.get_db),user:User=Depends(deps.get_minutes_editor)):
    meeting_access(db,meeting_id,user,True)
    snapshot=get_snapshot(db,meeting_id,lock=True)
    if not snapshot:
        raise HTTPException(404,"No format selected")
    row,definition,_=snapshot
    if row.status=="final":
        raise HTTPException(409,"Final minutes are locked")
    try:
        values=validate_values(definition,body.values)
    except ValueError as exc:
        raise HTTPException(422,str(exc)) from exc
    row.values_json=json.dumps(values,ensure_ascii=False)
    db.commit()
    return payload(db,meeting_id)


@router.post("/meeting/{meeting_id}/generate")
def generate(meeting_id:int,db:Session=Depends(deps.get_db),user:User=Depends(deps.get_minutes_editor)):
    meeting=meeting_access(db,meeting_id,user,True)
    if meeting.status!=MeetingStatus.completed:
        raise HTTPException(409,"Complete transcription first")
    transcript=db.query(Transcript).filter(Transcript.meeting_id==meeting_id).first()
    if not transcript or not get_snapshot(db,meeting_id):
        raise HTTPException(404,"Transcript or format not found")
    try:
        generate_snapshot(db,meeting,transcript.content)
    except ValueError as exc:
        raise HTTPException(422,str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(503,"AI generation unavailable; existing draft preserved") from exc
    return payload(db,meeting_id)
