import os,re
import pytest
from sqlalchemy import text,select
from sqlalchemy.exc import OperationalError
from sqlalchemy import create_engine
from app.core.organization_allocator import OrganizationAllocator
from app.core.central_auth import organizations
from app.models.models import User,Meeting


@pytest.mark.skipif(os.environ.get("MS_ALLOCATOR_TEST")!="1",reason="requires dedicated test PostgreSQL")
def test_real_otp_allocation(tmp_path):
    import onboarding,central_registration,central_registration_broker,central_registration_client
    import socketserver,threading
    from unittest.mock import patch
    a=OrganizationAllocator(os.environ["MS_ALLOCATION_DSN"],os.environ["MS_CENTRAL_REGISTRY_URL"],tmp_path/"journal",tmp_path/"storage")
    inbox=tmp_path/"inbox.db"
    tokens=[]; refs=[]
    # Exercise the actual Unix broker protocol with a real PostgreSQL allocator.
    socket_path=str(tmp_path/"broker.sock")
    broker=socketserver.UnixStreamServer(socket_path,central_registration_broker.Handler)
    broker.inbox=inbox;broker.allocator=a
    thread=threading.Thread(target=broker.serve_forever,daemon=True);thread.start()
    def complete(ref,key,code):
        return central_registration_client.complete(socket_path,ref,key,code)
    for name in ("Alpha","Bravo"):
        messages=[]
        data=dict(name=name+" Group",contact=name+" Admin",email=name.lower()+"@example.com",sector="Corporate",password="Test-Only-Pass!",confirm_password="Test-Only-Pass!")
        ref,key,sent=onboarding.register_browser(inbox,data,lambda *args:messages.append(args))
        code=re.search(r"code is ([0-9]{6})",messages[-1][2]).group(1)
        assert sent
        assert complete(ref,"x"*43,code) is None
        wrong="000000" if code!="000000" else "111111"
        assert complete(ref,key,wrong) is None
        assert not list(a.journal.glob(ref+".json"))
        token=complete(ref,key,code)
        assert token
        assert complete(ref,key,code) is None
        assert onboarding.pending_password(inbox,ref) is None
        refs.append(ref);tokens.append(token)
    broker.shutdown();broker.server_close();thread.join()
    service=a.auth_service()
    for name,ref,token in zip(("Alpha","Bravo"),refs,tokens):
        with service.request_database(token) as (principal,db):
            assert principal.org_id=="org-"+ref
            user=db.get(User,1)
            assert user.full_name==name+" Admin" and not user.must_change_password
            db.add(Meeting(id=1,title=name+" private",owner_id=1));db.commit()
    with service.request_database(tokens[0]) as (_,db):
        assert db.get(Meeting,1).title=="Alpha private"
        db.get(Meeting,1).title="changed";db.commit()
    with service.request_database(tokens[1]) as (_,db):
        assert db.get(Meeting,1).title=="Bravo private"
    with a.registry.connect() as c:assert len(c.execute(select(organizations)).all())==2
    import json
    record=json.loads((a.journal/(refs[0]+".json")).read_text())
    denied=create_engine(a.url.set(username=record["role"],password=record["password"],database="msorg_"+refs[1]))
    with pytest.raises(OperationalError):
        with denied.connect():pass
    denied.dispose()
