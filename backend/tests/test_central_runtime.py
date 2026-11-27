import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.core.organization_allocator import OrganizationAllocator
from app.core.central_runtime import Runtime
from app.central_main import create_app
from app.core.security import get_password_hash
from app.core.central_auth import COOKIE
from app.models.models import Meeting,User,SystemSetting,Recording
from app.api.endpoints.live_rooms import _ROOMS,_SIGNALS

@pytest.mark.skipif(os.getenv("MS_ALLOCATOR_TEST")!="1",reason="requires disposable PostgreSQL")
def test_actual_dashboard_and_api_routes(tmp_path):
    a=OrganizationAllocator(os.environ["MS_ALLOCATION_DSN"],os.environ["MS_CENTRAL_REGISTRY_URL"],tmp_path/"journal",tmp_path/"storage")
    tokens=[];orgs=[]
    for name,ref in [("Alpha","a"*32),("Bravo","b"*32)]:
        tokens.append(a.allocate(dict(ref=ref,status="verified",name=name,contact=name+" Admin",email=name.lower()+"@example.com",sector="Corporate"),get_password_hash("Password-"+name+"!")))
        orgs.append("org-"+ref)
    origin="https://minuteseal.example"
    runtime=Runtime(os.environ["MS_CENTRAL_REGISTRY_URL"],tmp_path/"journal",tmp_path/"storage",origin)
    app=create_app(runtime)
    headers={"Origin":origin}
    with TestClient(app,base_url=origin) as alpha, TestClient(app,base_url=origin) as bravo, TestClient(app,base_url=origin) as anon:
        assert anon.get("/api/stats").status_code==401
        assert anon.get("/api/meetings/").status_code==401
        assert anon.get("/api/settings/logo").status_code==401
        for client,token,name in [(alpha,tokens[0],"Alpha"),(bravo,tokens[1],"Bravo")]:
            client.cookies.set(COOKIE,token)
            assert client.get("/api/auth/me").json()["full_name"]==name+" Admin"
            result=client.post("/api/meetings/",headers=headers,json={"title":name+" private","date":"2026-11-27T12:00:00","participants":[]})
            assert result.status_code==201,result.text
            assert result.json()["id"]==1
            assert client.get("/api/stats").json()["total_meetings"]==1
            assert client.get("/api/settings/").json()["school_name"]==name
            assert client.get("/api/subscription").json()["tenant"]==orgs[0 if name=="Alpha" else 1]
            assert client.get("/api/staff/").json()[0]["full_name"]==name+" Admin"
            assert client.get("/api/meetings/1").json()["title"]==name+" private"
        assert alpha.get("/api/meetings/1",headers={"X-Organization-ID":orgs[1]}).json()["title"]=="Alpha private"
        assert alpha.put("/api/meetings/1",headers=headers,json={"title":"Alpha changed"}).status_code==200
        assert bravo.get("/api/meetings/1").json()["title"]=="Bravo private"
        assert alpha.put("/api/settings/",headers={"Origin":"https://evil.example"},json={"school_name":"evil"}).status_code==403
        assert alpha.put("/api/settings/",headers=headers,json={"school_name":"Alpha updated"}).status_code==200
        assert bravo.get("/api/settings/").json()["school_name"]=="Bravo"
        for client in (alpha,bravo):
            assert client.post("/api/meetings/1/start",headers=headers).status_code==200
        pa=alpha.post("/api/live-rooms/1/join",headers=headers,json={})
        pb=bravo.post("/api/live-rooms/1/join",headers=headers,json={})
        assert pa.status_code==200,pa.text
        assert pb.status_code==200,pb.text
        assert len(pa.json()["participants"])==len(pb.json()["participants"])==1
        peer=pa.json()
        denied=bravo.post("/api/live-rooms/1/heartbeat",headers=headers,json={"peer_id":peer["peer_id"],"session_key":peer["session_key"]})
        assert denied.status_code==401
        from unittest.mock import patch
        with patch("app.services.email.email_service.send",return_value=1):
            staff=alpha.post("/api/staff/",headers=headers,json={"email":"new@example.com","full_name":"New Staff","role":"staff"})
        assert staff.status_code==201,staff.text
        assert len(bravo.get("/api/staff/").json())==1
        from app.core.central_auth import memberships
        with runtime.registry.connect() as c:
            assert c.execute(select(memberships).where(memberships.c.email=="new@example.com")).mappings().one()["org_id"]==orgs[0]
        invite=alpha.post("/api/meetings/1/invitations",headers=headers,json={"emails":["guest@example.com"],"send_email":False})
        assert invite.status_code==200,invite.text
        code=invite.json()["general_link"].split("/")[-1]
        assert len(code)==32
        assert anon.get("/api/meetings/public/invitations/"+code).json()["meeting_title"]=="Alpha changed"
        assert anon.get("/api/meetings/public/invitations/"+"X"*32).status_code==401
        assert anon.get("/api/stats").status_code==401
        guest=anon.post("/api/live-rooms/1/join",headers=headers,json={"invite_code":code,"full_name":"Guest"})
        assert guest.status_code==200,guest.text
        peer=guest.json()
        assert len(peer["participants"])==2
        beat=anon.post("/api/live-rooms/1/heartbeat",headers=headers,json={"peer_id":peer["peer_id"],"session_key":peer["session_key"]})
        assert beat.status_code==200,beat.text
        assert len(beat.json()["participants"])==2
        assert len(bravo.post("/api/live-rooms/1/heartbeat",headers=headers,json={"peer_id":pb.json()["peer_id"],"session_key":pb.json()["session_key"]}).json()["participants"])==1
        # A named staff member joining by email invitation still uses the
        # guest room capability (not an authenticated app session).
        from app.models.models import MeetingInvitation
        with runtime.service().request_database(tokens[0]) as (_,db):
            named=db.query(MeetingInvitation).filter_by(meeting_id=1,email="guest@example.com").one()
            named.email="new@example.com";named_code=named.code;db.commit()
        named_guest=anon.post("/api/live-rooms/1/join",headers=headers,json={"invite_code":named_code}).json()
        assert named_guest["peer_id"] and len(named_guest["participants"])==3
        host=pa.json()
        def proof(p):return {"peer_id":p["peer_id"],"session_key":p["session_key"]}
        def signal(client,p,target,kind):
            return client.post("/api/live-rooms/1/signal",headers=headers,json={**proof(p),"target_id":target["peer_id"],"type":kind,"payload":{"type":kind,"sdp":"test"}})
        def receive(client,p):
            result=client.get("/api/live-rooms/1/signals",params=proof(p))
            assert result.status_code==200,result.text
            return result.json()["messages"]
        assert signal(alpha,host,named_guest,"offer").json()["delivered"]
        assert any(m["type"]=="offer" and m["from_peer_id"]==host["peer_id"] for m in receive(anon,named_guest))
        assert signal(anon,named_guest,host,"answer").json()["delivered"]
        assert any(m["type"]=="answer" and m["from_peer_id"]==named_guest["peer_id"] for m in receive(alpha,host))
        # Simulate disconnected internet exceeding the room lease.
        import time
        _ROOMS[(orgs[0],1)][named_guest["peer_id"]].last_seen=time.monotonic()-40
        assert anon.post("/api/live-rooms/1/heartbeat",headers=headers,json=proof(named_guest)).status_code==401
        rejoined=anon.post("/api/live-rooms/1/join",headers=headers,json={"invite_code":named_code,"muted":True}).json()
        assert rejoined["peer_id"]!=named_guest["peer_id"]
        assert len(rejoined["participants"])==3
        assert any(p["is_self"] and p["muted"] for p in rejoined["participants"])
        assert signal(anon,rejoined,host,"offer").json()["delivered"]
        assert any(m["type"]=="offer" and m["from_peer_id"]==rejoined["peer_id"] for m in receive(alpha,host))
        assert signal(alpha,host,rejoined,"answer").json()["delivered"]
        assert any(m["type"]=="answer" and m["from_peer_id"]==host["peer_id"] for m in receive(anon,rejoined))
        # A corrupted stored path must not read the other organization's files.
        service=runtime.service()
        target=tmp_path/"storage"/orgs[1]/"recordings"/"secret.txt";target.write_text("bravo confidential")
        with service.request_database(tokens[0]) as (_,db):
            db.add(Recording(id=1,meeting_id=1,filename="secret.txt",filepath=str(target)));db.commit()
        assert alpha.get("/api/recordings/1/download").status_code==409
        assert alpha.post("/api/auth/logout",headers=headers).status_code==200
        assert alpha.get("/api/stats").status_code==401
        assert bravo.get("/api/stats").status_code==200
        assert alpha.post("/api/auth/login",headers=headers,data={"username":"alpha@example.com","password":"Password-Alpha!"}).status_code==200
        assert alpha.get("/api/auth/me").json()["full_name"]=="Alpha Admin"
