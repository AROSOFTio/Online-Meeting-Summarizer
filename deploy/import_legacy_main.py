"""One-time import of the empty legacy main workspace; no customer data deletion."""
import os,sys,json,secrets,subprocess
from pathlib import Path
import psycopg
from psycopg import sql
from sqlalchemy import create_engine,select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from app.core.organization_allocator import OrganizationAllocator,save
from app.core.central_auth import CentralAuth,organizations,memberships
from app.core.tenant_boundary import MARKER
from app.core.subscription_policy import load
from app.models.models import User,UserRole,SystemSetting,Meeting,Recording,BackupRecord,Export
from app.core.initial_setup import KEY
ref=sys.argv[1]
dump=Path(sys.argv[2]);policy_path=Path(sys.argv[3])
a=OrganizationAllocator(os.environ["MS_ALLOCATION_DSN"],os.environ["MS_CENTRAL_REGISTRY_URL"],os.environ["MS_CENTRAL_JOURNAL"],os.environ["MS_CENTRAL_STORAGE"])
if not __import__("re").fullmatch(r"[a-f0-9]{32}",ref):raise RuntimeError("Invalid migration ref")
org="org-"+ref;role="msorg_"+ref
path=a.journal/(ref+".json")
finalize_only="--finalize-restored" in sys.argv[4:]
if finalize_only:
    record=json.loads(path.read_text())
    if record["ready"] or record["fingerprint"]!="legacy-main-import" or record["org_id"]!=org or record["role"]!=role or record["database"]!=role:
        raise RuntimeError("Unsafe migration finalization")
    url=a.url.set(username=role,password=record["password"],database=role)
else:
    if path.exists():raise RuntimeError("Migration already exists; refuse overwrite")
    record=dict(org_id=org,role=role,database=role,password=secrets.token_urlsafe(48),fingerprint="legacy-main-import",ready=False,legacy_setup=True,setup_secret=secrets.token_urlsafe(48))
    with psycopg.connect(a.admin_dsn,autocommit=True) as c:
        with c.cursor() as cur:
            a.guard(cur)
            cur.execute("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=%s) OR EXISTS(SELECT 1 FROM pg_database WHERE datname=%s)",(role,role))
            if cur.fetchone()[0]:raise RuntimeError("Migration destination exists")
            save(path,record)
            cur.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS").format(sql.Identifier(role),sql.Literal(record["password"])))
            cur.execute(sql.SQL("CREATE DATABASE {} OWNER {} ALLOW_CONNECTIONS false").format(sql.Identifier(role),sql.Identifier(role)))
            cur.execute(sql.SQL("REVOKE CONNECT ON DATABASE {} FROM PUBLIC").format(sql.Identifier(role)))
            cur.execute(sql.SQL("ALTER DATABASE {} ALLOW_CONNECTIONS true").format(sql.Identifier(role)))
            cur.execute("SELECT datname FROM pg_database WHERE datallowconn AND datname<>%s AND has_database_privilege(%s,oid,'CONNECT')",(role,role))
            if cur.fetchone():raise RuntimeError("Database isolation check failed")
    url=a.url.set(username=role,password=record["password"],database=role)
    result=subprocess.run(["pg_restore","--exit-on-error","--no-owner","--no-acl","-h",url.host,"-p",str(url.port or 5432),"-U",role,"-d",role,str(dump)],env={**os.environ,"PGPASSWORD":record["password"]},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    if result.returncode:raise RuntimeError("Legacy database restore failed")
engine=create_engine(url)
with Session(engine) as db:
    marker=db.query(SystemSetting).filter_by(key=MARKER).one()
    if marker.value!="minuteseal" or db.query(Meeting).count() or db.query(Recording).count() or db.query(BackupRecord).count() or db.query(Export).count():
        raise RuntimeError("Legacy main has records requiring a file migration; cutover refused")
    users=db.query(User).all()
    if len(users)!=1 or users[0].role!=UserRole.admin or not users[0].is_active:raise RuntimeError("Unexpected legacy user population")
    admin=users[0];admin.email=admin.email.strip().lower();uid=admin.id;email=admin.email
    marker.value=org
    db.query(SystemSetting).filter_by(key=KEY).delete()
    name=db.query(SystemSetting).filter_by(key="school_name").first()
    name=name.value if name else "MinuteSeal"
    db.commit()
root=a.storage/org
root.mkdir(mode=0o700)
(root/".convenecore-tenant").write_text(org+"\n")
policy=json.loads(policy_path.read_text())
if policy["tenant"]!="minuteseal":raise RuntimeError("Unexpected legacy policy")
policy["tenant"]=org
save(root/"subscription.json",policy)
load(root/"subscription.json",org)
svc=CentralAuth(a.registry,{org:engine});svc.attach_organization(org,name,email,uid)
record["ready"]=True;save(path,record)
print("Legacy main organization imported; existing administrator and audit records preserved")
