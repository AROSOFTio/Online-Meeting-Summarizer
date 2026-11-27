"""Privileged broker only: allocate on a dedicated PostgreSQL cluster."""
import fcntl, hashlib, json, os, re, secrets, tempfile
from pathlib import Path
import psycopg
from psycopg import sql
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from argon2 import extract_parameters
from argon2.low_level import Type
from app.core.database import Base
from app.core.central_auth import CentralAuth, Principal, IsolationError, organizations, memberships
from app.core.tenant_boundary import MARKER
from app.models.models import User, UserRole, SystemSetting
from app.models.meeting_flow import DirectoryProfile

REF=re.compile(r"[a-f0-9]{32}")

def save(path, data):
    fd,name=tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd,"w") as f:
            json.dump(data,f);f.flush();os.fsync(f.fileno())
        os.replace(name,path)
        fd=os.open(path.parent,os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)
    finally:
        if os.path.exists(name):os.unlink(name)

class OrganizationAllocator:
    def __init__(self, admin_dsn, registry_url, journal, storage):
        self.admin_dsn=admin_dsn
        self.url=make_url(registry_url)
        if self.url.get_backend_name()!="postgresql":raise IsolationError("PostgreSQL required")
        self.journal=Path(journal);self.storage=Path(storage)
        for p in (self.journal,self.storage):
            p.mkdir(mode=0o700,parents=True,exist_ok=True)
            if p.is_symlink() or p.stat().st_mode & 0o077:raise IsolationError("Private directories required")
        self.registry=create_engine(self.url,pool_pre_ping=True)
        CentralAuth(self.registry,{}).initialize_registry()

    def guard(self,cur):
        cur.execute("SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()")
        if cur.fetchone()[0]!="MinuteSeal central allocation cluster v1":raise IsolationError("Dedicated cluster marker missing")
        cur.execute("SELECT datname FROM pg_database WHERE datallowconn AND datname !~ '^msorg_[a-f0-9]{32}$' AND datname NOT IN (current_database(),%s,'template1')",(self.url.database,))
        if cur.fetchone():raise IsolationError("Unrelated database on allocation cluster")

    def allocate(self,app,password_hash):
        ref=app["ref"]
        if not REF.fullmatch(ref) or app["status"]!="verified" or extract_parameters(password_hash).type!=Type.ID:
            raise IsolationError("Verified registration required")
        org="org-"+ref;role="msorg_"+ref
        fingerprint=hashlib.sha256(json.dumps([app[k] for k in ("ref","name","contact","email","sector")]+[password_hash]).encode()).hexdigest()
        path=self.journal/(ref+".json")
        fd=os.open(self.journal/(ref+".lock"),os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,"a") as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            with psycopg.connect(self.admin_dsn,autocommit=True) as connection:
                with connection.cursor() as cur:
                    self.guard(cur)
                    cur.execute("SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=%s",(role,))
                    existing=cur.fetchone()
                    cur.execute("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=%s",(role,))
                    owner=cur.fetchone()
                    if not path.exists():
                        if existing or owner:raise IsolationError("Unjournaled allocation exists")
                        record=dict(org_id=org,role=role,database=role,password=secrets.token_urlsafe(48),fingerprint=fingerprint,ready=False)
                        save(path,record)
                    else:
                        record=json.loads(path.read_text())
                        if (record["org_id"],record["role"],record["database"],record["fingerprint"])!=(org,role,role,fingerprint):raise IsolationError("Allocation mismatch")
                    if existing is None:
                        cur.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS").format(sql.Identifier(role),sql.Literal(record["password"])))
                    elif existing!=(True,False,False,False,False,False,False):raise IsolationError("Unsafe database role")
                    if owner is None:
                        cur.execute(sql.SQL("CREATE DATABASE {} OWNER {} ALLOW_CONNECTIONS false").format(sql.Identifier(role),sql.Identifier(role)))
                    elif owner[0]!=role:raise IsolationError("Database owner mismatch")
                    cur.execute(sql.SQL("REVOKE CONNECT ON DATABASE {} FROM PUBLIC").format(sql.Identifier(role)))
                    cur.execute(sql.SQL("ALTER DATABASE {} ALLOW_CONNECTIONS true").format(sql.Identifier(role)))
                    cur.execute("SELECT datname FROM pg_database WHERE datallowconn AND datname<>%s AND has_database_privilege(%s,oid,'CONNECT')",(role,role))
                    if cur.fetchone():raise IsolationError("Cross-database permission")
            root=self.storage/org;root.mkdir(mode=0o700,exist_ok=True)
            if root.is_symlink() or root.stat().st_mode & 0o077:raise IsolationError("Unsafe storage")
            marker=root/".convenecore-tenant"
            if marker.exists():
                if marker.is_symlink() or marker.read_text().strip()!=org:raise IsolationError("Storage identity mismatch")
            else:
                if any(root.iterdir()):raise IsolationError("Unlabelled storage")
                with marker.open("x") as f:f.write(org+"\n")
            engine=create_engine(self.url.set(username=role,password=record["password"],database=role))
            try:
                Base.metadata.create_all(engine)
                with Session(engine) as db:
                    marker=db.query(SystemSetting).filter_by(key=MARKER).one_or_none()
                    user=db.query(User).filter_by(email=app["email"]).one_or_none()
                    if marker is None:
                        if db.query(User).count():raise IsolationError("Unlabelled existing data")
                        db.add_all([SystemSetting(key=MARKER,value=org),SystemSetting(key="school_name",value=app["name"]),SystemSetting(key="organization_email",value=app["email"])])
                        user=User(email=app["email"],full_name=app["contact"],hashed_password=password_hash,role=UserRole.admin,is_active=True,must_change_password=False)
                        db.add(user);db.flush()
                        db.add(DirectoryProfile(user_id=user.id,directory_group="Management",position_title="Administrator"))
                    elif marker.value!=org or not user or user.role!=UserRole.admin or not user.is_active or user.must_change_password or user.hashed_password!=password_hash:
                        raise IsolationError("Administrator identity mismatch")
                    uid=user.id;db.commit()
                service=CentralAuth(self.registry,{org:engine})
                with self.registry.connect() as c:
                    o=c.execute(select(organizations).where(organizations.c.id==org)).mappings().first()
                    m=c.execute(select(memberships).where(memberships.c.org_id==org,memberships.c.email==app["email"])).mappings().first()
                if o is None:service.attach_organization(org,app["name"],app["email"],uid)
                elif not o["enabled"] or not m or not m["enabled"] or m["user_id"]!=uid:raise IsolationError("Membership mismatch")
                record["ready"]=True;save(path,record)
                return service.exchange_verified_handoff(service.create_verified_handoff(Principal(org,uid,app["email"])))
            finally:engine.dispose()

    def auth_service(self):
        engines={}
        for path in self.journal.glob("*.json"):
            r=json.loads(path.read_text())
            if r["ready"]:engines[r["org_id"]]=create_engine(self.url.set(username=r["role"],password=r["password"],database=r["database"]))
        return CentralAuth(self.registry,engines)
