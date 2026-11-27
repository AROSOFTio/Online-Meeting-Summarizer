import io
import pytest
from docx import Document
from app.services.structured_minutes import FormatDefinition, validate_values, missing_required
from app.services.structured_export import render_pdf, render_docx, render_txt


def definition():
    return FormatDefinition.model_validate({"name":"Committee minutes","sector":"Government","fields":[
        {"id":"a","label":"Agreed decisions","kind":"list","required":True},
        {"id":"b","label":"Responsibilities","kind":"table","required":True,"source":"actions"},
        {"id":"c","label":"Next date","kind":"date","required":False}
    ]})


def test_formats_validate_and_render():
    fmt=definition()
    values=validate_values(fmt,{"a":"Approve the report","b":"Review budget\tFinance lead\t2026-12-15\tPending"})
    assert not missing_required(fmt,values)
    assert validate_values(fmt,{"b":"Review budget\t\t\t"})["b"].endswith("\t\t\t")
    pdf=render_pdf(fmt,values,{"name":"Example Committee"})
    assert pdf.startswith(b"%PDF")
    doc=Document(io.BytesIO(render_docx(fmt,values,{"name":"Example Committee"})))
    assert any("Agreed decisions" in p.text for p in doc.paragraphs)
    assert doc.tables[0].cell(1,1).text=="Finance lead"
    assert b"Approve the report" in render_txt(fmt,values,{"name":"Example Committee"})


def test_missing_and_invalid_sections():
    fmt=definition()
    assert missing_required(fmt,validate_values(fmt,{}))==["Agreed decisions","Responsibilities"]
    with pytest.raises(ValueError):
        validate_values(fmt,{"c":"tomorrow"})
    with pytest.raises(ValueError):
        validate_values(fmt,{"b":"invalid row"})
    with pytest.raises(ValueError):
        validate_values(fmt,{"unknown":"x"})


def test_format_library_requires_login(client):
    assert client.get("/api/minute-formats/library").status_code==401
    assert client.post("/api/minute-formats/library",json=definition().model_dump()).status_code==401

def test_saved_format_to_ai_and_final_exports(client, db, monkeypatch, tmp_path):
    from datetime import datetime, timezone
    from app.models.models import Meeting, MeetingStatus, Transcript, User
    from app.services import structured_minutes
    from app.core.config import settings
    from app.core.security import get_password_hash
    from app.models.models import UserRole
    monkeypatch.setattr(settings, "EXPORT_DIR", str(tmp_path))
    login=client.post("/api/auth/login",data={"username":"testadmin@starlight.sc.ug","password":"TestAdminPass123!"})
    assert login.status_code==200
    user=db.query(User).filter(User.email=="testadmin@starlight.sc.ug").one()
    meeting=Meeting(title="Integration meeting",owner_id=user.id,date=datetime.now(timezone.utc),status=MeetingStatus.completed)
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    mid=meeting.id
    db.add(Transcript(meeting_id=mid,content="The committee approved the report. Finance will review the budget."))
    db.commit()
    saved=client.post("/api/minute-formats/library",json=definition().model_dump())
    assert saved.status_code==200
    base=f"/api/minute-formats/meeting/{mid}"
    attached=client.put(base+"/format",json={"format_id":saved.json()["id"]})
    assert attached.status_code==200
    assert len(attached.json()["missing_required"])==2
    assert client.post(f"/api/meetings/{mid}/finalize?share=false").status_code==422
    monkeypatch.setattr(structured_minutes,"generate_values",lambda *args:{"a":"Approve the report","b":"Review budget\tFinance lead\t\t","c":""})
    generated=client.post(base+"/generate")
    assert generated.status_code==200
    assert not generated.json()["missing_required"]
    assert client.get(f"/api/meetings/{mid}/export?format=pdf").content.startswith(b"%PDF")
    word=client.get(f"/api/meetings/{mid}/export?format=docx")
    assert word.status_code==200
    assert Document(io.BytesIO(word.content)).tables[0].cell(1,1).text=="Finance lead"
    edited=client.put(base+"/values",json={"values":{"a":"Report adopted","b":"Review budget\tFinance lead\t\t","c":""}})
    assert edited.status_code==200
    finalized=client.post(f"/api/meetings/{mid}/finalize?share=false")
    assert finalized.status_code==200
    assert client.get(base).json()["status"]=="final"
    assert client.put(base+"/values",json={"values":{"a":"Changed"}}).status_code==409
    assert client.post(base+"/generate").status_code==409
    other=User(email="format-test@example.com",hashed_password=get_password_hash("FormatTest123!"),full_name="Other editor",role=UserRole.minute_secretary,is_active=True)
    db.add(other)
    db.commit()
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login",data={"username":"format-test@example.com","password":"FormatTest123!"}).status_code==200
    assert client.get("/api/minute-formats/library").json()==[]
    assert client.get(base).status_code==403


def test_create_meeting_with_selected_template(client,db):
    from datetime import datetime,timezone
    assert client.post("/api/auth/login",data={"username":"testadmin@starlight.sc.ug","password":"TestAdminPass123!"}).status_code==200
    payload={"title":"Template selection test","date":datetime.now(timezone.utc).isoformat(),"participants":[],"minute_format":definition().model_dump()}
    r=client.post("/api/meetings/",json=payload)
    assert r.status_code==201,r.text
    snap=client.get("/api/minute-formats/meeting/"+str(r.json()["id"])).json()
    assert snap["definition"]==definition().model_dump()
    payload["minute_format_id"]=999999
    assert client.post("/api/meetings/",json=payload).status_code==422
    del payload["minute_format"]
    assert client.post("/api/meetings/",json=payload).status_code==404
