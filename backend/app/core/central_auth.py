"""Shared-domain authentication and isolated tenant database routing.

This module is opt-in; existing single-tenant installations do not import it.
The central database stores routing metadata and hashed sessions, never
organization records or passwords. Tenant connections are configured only
by the trusted operator, not by client requests.
"""
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import re
import secrets
import time
from typing import Mapping

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from sqlalchemy import Boolean, Column, ForeignKey, Integer, MetaData, String, Table, and_, insert, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from app.models.models import User, SystemSetting
from app.core.tenant_boundary import MARKER

metadata = MetaData()
organizations = Table("central_organizations", metadata,
    Column("id", String(40), primary_key=True),
    Column("name", String(255), nullable=False),
    Column("enabled", Boolean, nullable=False, default=True))
memberships = Table("central_memberships", metadata,
    Column("org_id", String(40), ForeignKey("central_organizations.id"), primary_key=True),
    Column("email", String(255), primary_key=True),
    Column("user_id", Integer, nullable=False),
    Column("enabled", Boolean, nullable=False, default=True))
sessions = Table("central_sessions", metadata,
    Column("digest", String(64), primary_key=True),
    Column("org_id", String(40), nullable=False),
    Column("email", String(255), nullable=False),
    Column("user_id", Integer, nullable=False),
    Column("expires_at", Integer, nullable=False, index=True))
# A verified-registration handoff is short-lived, consumed once, and stored as
# a digest. Only the trusted registration/provisioning service can create one.
handoffs = Table("central_registration_handoffs", metadata,
    Column("digest", String(64), primary_key=True),
    Column("org_id", String(40), nullable=False),
    Column("email", String(255), nullable=False),
    Column("user_id", Integer, nullable=False),
    Column("expires_at", Integer, nullable=False),
    Column("consumed", Boolean, nullable=False, default=False))

ORG = re.compile(r"[a-z][a-z0-9-]{1,39}")
TOKEN = re.compile(r"[A-Za-z0-9_-]{43}")
COOKIE = "__Host-minuteseal-session"
PH = PasswordHasher()
DUMMY_HASH = PH.hash(secrets.token_urlsafe(32))

class AuthenticationDenied(Exception):
    pass

class IsolationError(Exception):
    pass

@dataclass(frozen=True)
class Principal:
    org_id: str
    user_id: int
    email: str

def normalized_email(email):
    return email.strip().lower()

def digest(token):
    return hashlib.sha256(token.encode("ascii")).hexdigest()

def token_digest(token):
    if not isinstance(token, str) or not TOKEN.fullmatch(token):
        raise AuthenticationDenied("Invalid session or handoff")
    return digest(token)

class CentralAuth:
    def __init__(self, registry: Engine, tenant_engines: Mapping[str, Engine],
                 *, testing=False, ttl=86400, clock=time.time):
        if not testing and (registry.dialect.name != "postgresql" or
            any(engine.dialect.name != "postgresql" for engine in tenant_engines.values())):
            raise IsolationError("Production requires PostgreSQL databases")
        # Reject accidental reuse, even when a distinct Engine wraps the same URL.
        engines = [registry, *tenant_engines.values()]
        keys = [(e.url.get_backend_name(), e.url.host, e.url.port, e.url.database) for e in engines]
        if len(set(keys)) != len(keys):
            raise IsolationError("Registry and organization databases must be distinct")
        if not testing:
            roles = [e.url.username for e in engines]
            if any(not role for role in roles) or len(set(roles)) != len(roles):
                raise IsolationError("Registry and organization database roles must be distinct")
        if any(not ORG.fullmatch(org_id) for org_id in tenant_engines):
            raise IsolationError("Invalid configured organization ID")
        if not 60 <= ttl <= 86400:
            raise ValueError("Session TTL out of range")
        self.registry = registry
        self._engines = dict(tenant_engines)
        self.ttl = ttl
        self.clock = clock

    def initialize_registry(self):
        metadata.create_all(self.registry)

    @contextmanager
    def _tenant_db(self, org_id):
        engine = self._engines.get(org_id)
        if engine is None:
            raise IsolationError("No configured database for organization")
        with Session(engine, autoflush=False) as db:
            marker = db.query(SystemSetting).filter(SystemSetting.key == MARKER).one_or_none()
            if marker is None or marker.value != org_id:
                raise IsolationError("Organization database identity mismatch")
            yield db

    def attach_organization(self, org_id, name, email, user_id):
        """Operator only: attach an already initialized isolated database."""
        if not ORG.fullmatch(org_id):
            raise IsolationError("Invalid organization")
        email = normalized_email(email)
        with self._tenant_db(org_id) as db:
            user = db.get(User, user_id)
            if not user or normalized_email(user.email) != email or not user.is_active:
                raise IsolationError("Membership does not match organization user")
        with self.registry.begin() as conn:
            conn.execute(insert(organizations).values(id=org_id, name=name, enabled=True))
            conn.execute(insert(memberships).values(org_id=org_id, email=email, user_id=user_id, enabled=True))

    def _active_membership(self, conn, org_id, email):
        row = conn.execute(select(memberships).join(organizations,
            organizations.c.id == memberships.c.org_id).where(and_(
            memberships.c.org_id == org_id, memberships.c.email == email,
            memberships.c.enabled.is_(True), organizations.c.enabled.is_(True)))).mappings().first()
        if row is None:
            raise AuthenticationDenied("Invalid credentials or membership")
        return row

    def _active_user(self, db, principal):
        user = db.get(User, principal.user_id)
        if not user or not user.is_active or normalized_email(user.email) != principal.email:
            raise AuthenticationDenied("Invalid credentials or membership")
        return user

    def _new_session(self, conn, principal):
        token = secrets.token_urlsafe(32)
        conn.execute(insert(sessions).values(digest=digest(token), org_id=principal.org_id,
            user_id=principal.user_id, email=principal.email,
            expires_at=int(self.clock()) + self.ttl))
        return token

    def login(self, org_id, email, password):
        email = normalized_email(email)
        if not isinstance(password, str) or not 1 <= len(password) <= 128:
            raise AuthenticationDenied("Invalid credentials or membership")
        try:
            with self.registry.begin() as conn:
                member = self._active_membership(conn, org_id, email)
                principal = Principal(org_id, member["user_id"], email)
                with self._tenant_db(org_id) as db:
                    user = self._active_user(db, principal)
                    PH.verify(user.hashed_password, password)
                return self._new_session(conn, principal)
        except (VerificationError, InvalidHashError, AuthenticationDenied) as exc:
            try:
                PH.verify(DUMMY_HASH, password)
            except VerificationError:
                pass
            raise AuthenticationDenied("Invalid credentials or membership") from exc

    def create_verified_handoff(self, principal):
        """Trusted service only, AFTER registration OTP and account creation."""
        with self.registry.begin() as conn:
            member = self._active_membership(conn, principal.org_id, principal.email)
            if member["user_id"] != principal.user_id:
                raise AuthenticationDenied("Invalid membership")
            with self._tenant_db(principal.org_id) as db:
                user = self._active_user(db, principal)
                if user.must_change_password:
                    raise AuthenticationDenied("Account setup incomplete")
            token = secrets.token_urlsafe(32)
            conn.execute(insert(handoffs).values(digest=digest(token), org_id=principal.org_id,
                email=principal.email, user_id=principal.user_id,
                expires_at=int(self.clock()) + 60, consumed=False))
            return token

    def exchange_verified_handoff(self, token):
        key = token_digest(token)
        with self.registry.begin() as conn:
            row = conn.execute(select(handoffs).where(handoffs.c.digest == key)).mappings().first()
            if row is None or row["consumed"] or row["expires_at"] <= int(self.clock()):
                raise AuthenticationDenied("Invalid registration handoff")
            member = self._active_membership(conn, row["org_id"], row["email"])
            principal = Principal(row["org_id"], row["user_id"], row["email"])
            if member["user_id"] != principal.user_id:
                raise AuthenticationDenied("Invalid membership")
            with self._tenant_db(principal.org_id) as db:
                if self._active_user(db, principal).must_change_password:
                    raise AuthenticationDenied("Account setup incomplete")
            result = conn.execute(update(handoffs).where(and_(
                handoffs.c.digest == key, handoffs.c.consumed.is_(False),
                handoffs.c.expires_at > int(self.clock()))).values(consumed=True))
            if result.rowcount != 1:
                raise AuthenticationDenied("Registration handoff already consumed")
            return self._new_session(conn, principal)

    def authenticate(self, token):
        key = token_digest(token)
        with self.registry.connect() as conn:
            row = conn.execute(select(sessions).where(and_(sessions.c.digest == key,
                sessions.c.expires_at > int(self.clock())))).mappings().first()
            if row is None:
                raise AuthenticationDenied("Invalid session")
            member = self._active_membership(conn, row["org_id"], row["email"])
            principal = Principal(row["org_id"], row["user_id"], row["email"])
            if member["user_id"] != principal.user_id:
                raise AuthenticationDenied("Invalid membership")
        with self._tenant_db(principal.org_id) as db:
            self._active_user(db, principal)
        return principal

    @contextmanager
    def request_database(self, token):
        """Request data access must derive its organization exclusively from the session."""
        principal = self.authenticate(token)
        with self._tenant_db(principal.org_id) as db:
            self._active_user(db, principal)
            yield principal, db

    def logout(self, token):
        key = token_digest(token)
        with self.registry.begin() as conn:
            conn.execute(sessions.delete().where(sessions.c.digest == key))

    def cookie_options(self):
        return dict(key=COOKIE, httponly=True, secure=True, samesite="lax", path="/", max_age=self.ttl)
