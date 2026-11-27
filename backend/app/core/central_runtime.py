"""Shared API runtime. Explicit tenant context derived only from central session."""
import json
import re
import threading
import time
import hashlib
from dataclasses import replace
from pathlib import Path
from sqlalchemy import create_engine, select, update, insert, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import make_url
from app.core.central_auth import CentralAuth, IsolationError, AuthenticationDenied, Principal, memberships, organizations, invitations, sessions, login_attempts, digest, ORG
from app.core.organization_context import OrganizationContext
from app.core import subscription_policy

class Runtime:
    def __init__(self, registry_url, journal, storage, origin):
        self.url=make_url(registry_url)
        self.registry=create_engine(self.url,pool_pre_ping=True)
        self.journal=Path(journal);self.storage=Path(storage).resolve()
        self.origin=origin
        self.lock=threading.RLock();self.engines={}

    def service(self):
        with self.lock:
            selected={}
            for path in self.journal.glob("*.json"):
                if path.is_symlink() or path.stat().st_mode & 0o077:raise IsolationError("Unsafe allocation record")
                record=json.loads(path.read_text())
                if not record.get("ready"):continue
                org=record["org_id"]
                if not ORG.fullmatch(org) or not re.fullmatch(r"msorg_[a-f0-9]{32}",record["role"]) or record["role"]!=record["database"] or org!="org-"+record["role"][6:]:
                    raise IsolationError("Invalid allocation record")
                url=self.url.set(username=record["role"],password=record["password"],database=record["database"])
                if org not in self.engines:
                    self.engines[org]=create_engine(url,pool_pre_ping=True,pool_size=1,max_overflow=1,pool_recycle=180,pool_timeout=5)
                elif self.engines[org].url!=url:raise IsolationError("Database credentials changed; restart runtime")
                selected[org]=self.engines[org]
            return CentralAuth(self.registry,selected)

    def context(self, service, principal):
        org=principal.org_id
        engine=service._engines.get(org)
        if engine is None:raise IsolationError("Organization database unavailable")
        root=(self.storage/org).resolve()
        if root.parent!=self.storage or not root.is_dir():raise IsolationError("Invalid organization storage")
        marker=root/".convenecore-tenant"
        if marker.is_symlink() or marker.read_text().strip()!=org:raise IsolationError("Storage identity mismatch")
        policy=root/"subscription.json"
        if policy.is_symlink():raise IsolationError("Unsafe subscription policy")
        subscription_policy.load(policy,org)
        for directory in ("recordings","exports","backups","branding"):
            p=root/directory
            p.mkdir(mode=0o700,exist_ok=True)
            if p.is_symlink() or p.resolve().parent!=root:raise IsolationError("Invalid organization directory")
        return OrganizationContext(principal,engine,root,dict(
            TENANT_ID=org,DATABASE_URL=engine.url.render_as_string(hide_password=False),
            STORAGE_DIR=str(root),UPLOAD_DIR=str(root/"recordings"),EXPORT_DIR=str(root/"exports"),
            SUBSCRIPTION_POLICY_FILE=str(policy),PUBLIC_APP_URL=self.origin,is_sqlite=False),self)

    def throttle_login(self,email):
        key=hashlib.sha256(email.strip().lower().encode()).hexdigest()
        window=int(time.time())//600
        with self.registry.begin() as c:
            statement=pg_insert(login_attempts).values(digest=key,window=window,attempts=1)
            from sqlalchemy import case
            statement=statement.on_conflict_do_update(index_elements=[login_attempts.c.digest],set_={
                "window":window,"attempts":case((login_attempts.c.window==window,login_attempts.c.attempts+1),else_=1)
            }).returning(login_attempts.c.attempts)
            count=c.execute(statement).scalar_one()
            if count>10:raise AuthenticationDenied("Too many attempts; try again later")
            c.execute(delete(login_attempts).where(login_attempts.c.window<window-6))

    def login(self,email,password,organization=None):
        from app.core.central_auth import normalized_email
        email=normalized_email(email)
        self.throttle_login(email)
        with self.registry.connect() as conn:
            q=select(memberships.c.org_id,organizations.c.name).join(organizations,organizations.c.id==memberships.c.org_id).where(memberships.c.email==email,memberships.c.enabled.is_(True),organizations.c.enabled.is_(True))
            rows=conn.execute(q).all()
        if organization:
            rows=[r for r in rows if organization.strip().casefold() in {r[0].casefold(),r[1].casefold()}]
        if len(rows)!=1:raise AuthenticationDenied("Invalid credentials; if you belong to multiple organizations, enter your organization name")
        return self.service().login(rows[0][0],email,password)

    def legacy_setup_context(self,email):
        from app.core.central_auth import normalized_email
        email=normalized_email(email)
        with self.registry.connect() as c:
            rows=c.execute(select(memberships.c.org_id).where(memberships.c.email==email,memberships.c.enabled.is_(True))).scalars().all()
        matches=[]
        for org in rows:
            if not ORG.fullmatch(org) or not org.startswith("org-"):continue
            path=self.journal/(org[4:]+".json")
            if not path.is_file() or path.is_symlink():continue
            record=json.loads(path.read_text())
            if record.get("legacy_setup") and record.get("ready"):
                matches.append((org,record))
        if len(matches)!=1:return None
        org,record=matches[0]
        context=self.trusted_context(org)
        return replace(context,values={**context.values,"ADMIN_EMAIL":email,"SECRET_KEY":record["setup_secret"]})



    def trusted_context(self,org):
        service=self.service()
        with self.registry.connect() as c:
            if not c.execute(select(organizations.c.id).where(organizations.c.id==org,organizations.c.enabled.is_(True))).first():
                raise AuthenticationDenied("Organization unavailable")
        with service._tenant_db(org):pass
        return self.context(service,Principal(org,0,""))

    def reserve_invitation(self,code,org):
        with self.registry.begin() as c:
            c.execute(insert(invitations).values(digest=digest(code),org_id=org))

    def invitation_context(self,code):
        if not re.fullmatch(r"[A-Z0-9]{32}",code):raise AuthenticationDenied("Invalid invitation")
        with self.registry.connect() as c:
            org=c.execute(select(invitations.c.org_id).where(invitations.c.digest==digest(code))).scalar_one_or_none()
        if not org:raise AuthenticationDenied("Invalid invitation")
        return self.trusted_context(org)

    def sync_member(self,org,user_id):
        # Only a trusted route after a committed tenant user mutation may invoke.
        service=self.service()
        from app.models.models import User
        from app.core.central_auth import normalized_email
        with service._tenant_db(org) as db:
            user=db.get(User,user_id)
            if user is None:raise IsolationError("Unknown tenant user")
            email=normalized_email(user.email);active=user.is_active
        with self.registry.begin() as c:
            existing=c.execute(select(memberships).where(memberships.c.org_id==org,memberships.c.email==email)).mappings().first()
            if existing and existing["user_id"]!=user_id:raise IsolationError("Membership identity conflict")
            c.execute(delete(memberships).where(memberships.c.org_id==org,memberships.c.user_id==user_id,memberships.c.email!=email))
            if existing:
                c.execute(update(memberships).where(memberships.c.org_id==org,memberships.c.email==email).values(enabled=active))
            else:c.execute(insert(memberships).values(org_id=org,email=email,user_id=user_id,enabled=active))
            if not active:c.execute(delete(sessions).where(sessions.c.org_id==org,sessions.c.user_id==user_id))
