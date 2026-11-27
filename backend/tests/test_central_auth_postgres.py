"""Real PostgreSQL test; URLs must target throwaway databases."""
import os
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from app.core.database import Base
from app.core.central_auth import CentralAuth, Principal, AuthenticationDenied, IsolationError
from app.core.tenant_boundary import MARKER
from app.core.security import get_password_hash
from app.models.models import User, UserRole, SystemSetting, Meeting

@pytest.mark.skipif(os.getenv("CC_CENTRAL_PG_TEST")!="1",reason="requires isolated PostgreSQL integration environment")
def test_postgres_role_and_request_boundary():
    registry=create_engine(os.environ["CC_TEST_REGISTRY"])
    engines={k:create_engine(os.environ["CC_TEST_"+k.upper()]) for k in ("alpha","bravo")}
    try:
        with pytest.raises(IsolationError):
            CentralAuth(registry,{"alpha":engines["alpha"],"bravo":create_engine(engines["bravo"].url.set(username=engines["alpha"].url.username))})
        for org,engine in engines.items():
            Base.metadata.create_all(engine)
            with Session(engine) as db:
                db.add(SystemSetting(key=MARKER,value=org))
                db.add(User(id=1,email="same@example.com",full_name=org,hashed_password=get_password_hash("Password-"+org+"!"),role=UserRole.admin,is_active=True,must_change_password=False))
                db.flush()
                db.add(Meeting(id=1,title=org+" private",owner_id=1))
                db.commit()
        # A tenant's actual PostgreSQL role cannot connect to another tenant database.
        forbidden=create_engine(engines["alpha"].url.set(database=engines["bravo"].url.database))
        try:
            with pytest.raises(OperationalError):
                with forbidden.connect():pass
        finally:
            forbidden.dispose()
        svc=CentralAuth(registry,engines)
        svc.initialize_registry()
        for org in engines:
            svc.attach_organization(org,org,"same@example.com",1)
        token=svc.exchange_verified_handoff(svc.create_verified_handoff(Principal("alpha",1,"same@example.com")))
        with svc.request_database(token) as (principal,db):
            assert principal.org_id=="alpha"
            assert db.get(Meeting,1).title=="alpha private"
            db.get(Meeting,1).title="changed alpha"; db.commit()
        bravo=svc.login("bravo","same@example.com","Password-bravo!")
        with svc.request_database(bravo) as (principal,db):
            assert principal.org_id=="bravo"
            assert db.get(Meeting,1).title=="bravo private"
        with pytest.raises(AuthenticationDenied):
            svc.login("bravo","same@example.com","Password-alpha!")
    finally:
        for e in [registry,*engines.values()]:e.dispose()
