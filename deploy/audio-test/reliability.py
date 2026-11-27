import io, tempfile, time, hashlib
from pathlib import Path
from types import SimpleNamespace as N
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers
from app.core.database import Base
from app.models.models import User, UserRole, Meeting, MeetingStatus, MeetingInvitation, Summary, Transcript
from app.models.meeting_flow import MeetingRuntime
from app.api.endpoints import live_rooms as rooms, recordings as rec
from app.workers import tasks
from app.models.minute_formats import MeetingMinuteFormat
from app.services.structured_minutes import FormatDefinition
from contextlib import nullcontext
import json
engine=create_engine("sqlite://")
Base.metadata.create_all(engine)
db=Session(engine)
host=User(full_name="Host",email="host@example.invalid",hashed_password="unused",role=UserRole.admin)
guest=User(full_name="Guest",email="guest@example.invalid",hashed_password="unused",role=UserRole.staff)
db.add_all([host,guest]);db.commit()
meeting=Meeting(title="Synthetic reliability",owner_id=host.id,status=MeetingStatus.draft)
db.add(meeting);db.commit()
mid=meeting.id
db.add(MeetingRuntime(meeting_id=mid,lifecycle="live"));db.commit()
rooms._room_key=lambda mid:("synthetic",mid)
rooms.meeting_ice_servers=lambda *a:{"ice_servers":[]}
rooms._optional_user=lambda request, db:request.user
def join(user):return rooms.join_live_room(mid,rooms.JoinLiveRoom(),N(user=user),db)
def moderate(actor,target,action):return rooms.moderate_live_room(mid,rooms.ModerateRequest(peer_id=actor["peer_id"],session_key=actor["session_key"],target_id=target,action=action),db)
h=join(host);g=join(guest)
moderate(h,g["peer_id"],"mute");moderate(h,"*","lock")
# Simulate a full backend restart: database persists, ephemeral peers do not.
rooms._ROOMS.clear();rooms._SIGNALS.clear()
h=join(host);g=join(guest)
assert g["locked"] and g["forced_muted"] and g["participants"][1]["muted"]
new=User(full_name="New",email="new@example.invalid",hashed_password="unused",role=UserRole.staff);db.add(new);db.commit()
try:join(new)
except HTTPException as e:assert e.status_code==423
else:raise AssertionError("locked meeting admitted new user")
assert not moderate(h,"*","release")["participants"][1]["forced_muted"]
assert not moderate(h,"*","unlock")["locked"]
assert join(new)["locked"] is False
print("PASS persistent admission and mute policy across process restart; existing guests can rejoin, new ones rejected")
with tempfile.TemporaryDirectory() as d:
 rec.settings=N(UPLOAD_DIR=d,EXPORT_DIR=d,TENANT_ID="test")
 rec.storage_write=lambda *a:nullcontext()
 rec.log_action=lambda *a,**kw:None
 rec.scoped_path=lambda p:Path(p)
 uploadid="a"*64
 payload1=b"x"*rec._PART_SIZE
 payload2=b"test tail"
 def file(data):return UploadFile(file=io.BytesIO(data),filename="part",headers=Headers({"content-type":"application/octet-stream"}))
 rec.upload_part(mid,uploadid,0,file(payload1),db,host)
 assert rec.upload_progress(mid,uploadid,db,host)["parts"]==[0]
 rec.upload_part(mid,uploadid,0,file(payload1),db,host)
 try:rec.upload_part(mid,uploadid,0,file(b"wrong"),db,host)
 except HTTPException as e:assert e.status_code==409
 else:raise AssertionError("conflicting upload accepted")
 rec.upload_part(mid,uploadid,1,file(payload2),db,host)
 request=N(client=None)
 result=rec.complete_upload(mid,uploadid,request,2,"recording.webm",db,host)
 db.expire_all()
 assert Path(db.get(Meeting,mid).recording.filepath).read_bytes()==payload1+payload2
 assert rec.upload_progress(mid,uploadid,db,host)["completed"]
 assert rec.complete_upload(mid,uploadid,request,2,"recording.webm",db,host)["id"]==result["id"]
 print("PASS resumed upload, conflict protection, byte-exact assembly, completion retry without duplication")
 meeting=db.get(Meeting,mid);meeting.status=MeetingStatus.completed;db.commit()
 try:rec.upload_recording(mid,request,file(b"wrong"),db,host)
 except HTTPException as e:assert e.status_code==409
 else:raise AssertionError("completed recording overwritten")
 print("PASS completed recording replacement blocked")
 fmt=FormatDefinition.model_validate({"name":"Custom test minutes","sector":"General","fields":[{"id":"a","label":"Discussion","kind":"paragraph","source":"discussion","required":True}]})
 db.add_all([Summary(meeting_id=mid,summary_text="Committee reviewed the report"),Transcript(meeting_id=mid,content="Committee reviewed the report"),MeetingMinuteFormat(meeting_id=mid,definition=fmt.model_dump_json(),values_json=json.dumps({"a":"Committee reviewed the report"}))]);db.commit()
 pdf=tasks._build_generated_minutes_pdf(db,meeting,"Committee reviewed the report")
 assert pdf.startswith(b"%PDF")
 print("PASS selected custom minutes format renders a PDF for automatic delivery")
