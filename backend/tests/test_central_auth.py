import pytest
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import Session
from app.core.database import Base
from app.core.central_auth import (CentralAuth, Principal, AuthenticationDenied, IsolationError,
    sessions, memberships, organizations, handoffs)
from app.core.tenant_boundary import MARKER
from app.core.security import get_password_hash
from app.models.models import User, UserRole, SystemSetting, Meeting

@pytest.fixture
def central(tmp_path):
    registry = create_engine(f"sqlite:///{tmp_path/'registry.db'}")
    engines = {org:create_engine(f"sqlite:///{tmp_path/(org+'.db')}") for org in ("alpha","bravo")}
    for org, engine in engines.items():
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            db.add(SystemSetting(key=MARKER,value=org))
            db.add(User(id=1,email="admin@example.com",full_name=org,hashed_password=get_password_hash("Password-"+org+"!"),role=UserRole.admin,is_active=True,must_change_password=False))
            db.flush()
            db.add(Meeting(id=1,title=org+" private meeting",owner_id=1))
            db.commit()
    now = [1000]
    service=CentralAuth(registry,engines,testing=True,ttl=60,clock=lambda:now[0])
    service.initialize_registry()
    for org in engines:
        service.attach_organization(org,org,"admin@example.com",1)
    yield service,registry,engines,now
    for engine in (registry,*engines.values()):engine.dispose()

def test_same_ids_and_email_stay_isolated(central):
    service,_,engines,_=central
    a=service.login("alpha","ADMIN@example.com","Password-alpha!")
    b=service.login("bravo","admin@example.com","Password-bravo!")
    with service.request_database(a) as (principal,db):
        assert principal.org_id=="alpha"
        meeting=db.get(Meeting,1)
        assert meeting.title=="alpha private meeting"
        meeting.title="alpha updated"
        db.commit()
    with service.request_database(b) as (principal,db):
        assert principal.org_id=="bravo"
        assert db.get(Meeting,1).title=="bravo private meeting"
    with pytest.raises(AuthenticationDenied):
        service.login("bravo","admin@example.com","Password-alpha!")

def test_no_shared_or_wrong_db(central):
    service,registry,engines,_=central
    with pytest.raises(IsolationError):
        CentralAuth(registry,{"alpha":engines["alpha"],"bravo":engines["alpha"]},testing=True)
    with pytest.raises(IsolationError):
        CentralAuth(registry,engines)
    with Session(engines["alpha"]) as db:
        db.query(SystemSetting).filter_by(key=MARKER).one().value="bravo"
        db.commit()
    with pytest.raises(IsolationError):
        service.login("alpha","admin@example.com","Password-alpha!")

def test_handoff_one_use_and_no_plaintext_tokens(central):
    service,registry,_,now=central
    principal=Principal("alpha",1,"admin@example.com")
    h=service.create_verified_handoff(principal)
    s=service.exchange_verified_handoff(h)
    assert service.authenticate(s)==principal
    assert service.cookie_options()==dict(key="__Host-minuteseal-session",httponly=True,secure=True,samesite="lax",path="/",max_age=60)
    with pytest.raises(AuthenticationDenied):service.exchange_verified_handoff(h)
    with registry.connect() as conn:
        assert h not in str(conn.execute(select(handoffs)).all())
        assert s not in str(conn.execute(select(sessions)).all())
    h2=service.create_verified_handoff(principal)
    now[0]+=61
    with pytest.raises(AuthenticationDenied):service.exchange_verified_handoff(h2)
    with pytest.raises(AuthenticationDenied):service.authenticate(s)

def test_logout_and_disabled_membership(central):
    service,registry,engines,_=central
    token=service.login("alpha","admin@example.com","Password-alpha!")
    service.logout(token)
    with pytest.raises(AuthenticationDenied):service.authenticate(token)
    token=service.login("alpha","admin@example.com","Password-alpha!")
    with registry.begin() as conn:
        conn.execute(update(memberships).where(memberships.c.org_id=="alpha").values(enabled=False))
    with pytest.raises(AuthenticationDenied):service.authenticate(token)
    b=service.login("bravo","admin@example.com","Password-bravo!")
    with Session(engines["bravo"]) as db:
        db.get(User,1).is_active=False
        db.commit()
    with pytest.raises(AuthenticationDenied):service.authenticate(b)

def test_forgery_and_account_mismatch(central):
    service,registry,_,_=central
    with pytest.raises(AuthenticationDenied):service.authenticate("x"*43)
    with pytest.raises(AuthenticationDenied):service.create_verified_handoff(Principal("alpha",999,"admin@example.com"))
    s=service.login("alpha","admin@example.com","Password-alpha!")
    with registry.begin() as conn:
        conn.execute(update(organizations).where(organizations.c.id=="alpha").values(enabled=False))
    with pytest.raises(AuthenticationDenied):service.authenticate(s)

def test_http_otp_handoff_redirect_and_isolation(central):
    from fastapi import Depends, FastAPI
    from fastapi.testclient import TestClient
    from app.api.endpoints.central_auth import central_router, organization_database
    service,_,_,_=central
    origin="https://minuteseal.example"
    app=FastAPI()
    app.include_router(central_router(service,origin),prefix="/api/auth")
    @app.get("/api/meetings/{meeting_id}")
    def meeting(meeting_id:int,db=Depends(organization_database(service))):
        return {"title":db.get(Meeting,meeting_id).title}
    with TestClient(app,base_url=origin,follow_redirects=False) as a, TestClient(app,base_url=origin,follow_redirects=False) as b:
        assert a.get("/api/meetings/1").status_code==401
        handoff=service.create_verified_handoff(Principal("alpha",1,"admin@example.com"))
        assert a.post("/api/auth/complete",json={"token":handoff},headers={"Origin":"https://other.example"}).status_code==403
        result=a.post("/api/auth/complete",json={"token":handoff},headers={"Origin":origin})
        assert result.status_code==303 and result.headers["location"]=="/dashboard"
        assert "httponly" in result.headers["set-cookie"].lower()
        assert "secure" in result.headers["set-cookie"].lower()
        assert a.get("/api/auth/me").json()["organization_id"]=="alpha"
        assert b.post("/api/auth/complete",json={"token":handoff},headers={"Origin":origin}).status_code==401
        assert b.post("/api/auth/login",json={"organization":"bravo","email":"admin@example.com","password":"Password-bravo!"},headers={"Origin":origin}).status_code==200
        assert a.get("/api/meetings/1",headers={"X-Organization-ID":"bravo"}).json()["title"]=="alpha private meeting"
        assert b.get("/api/meetings/1",headers={"X-Organization-ID":"alpha"}).json()["title"]=="bravo private meeting"
        assert a.post("/api/auth/logout",headers={"Origin":origin}).status_code==200
        assert a.get("/api/meetings/1").status_code==401
        assert b.get("/api/meetings/1").status_code==200
