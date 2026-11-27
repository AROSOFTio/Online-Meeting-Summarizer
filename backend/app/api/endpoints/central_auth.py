"""Opt-in HTTP integration for shared-domain authentication.

The OTP verifier must create the one-time handoff through the trusted
service interface; there is intentionally no public handoff issuance route.
Do not mount in production until organization provisioning and all
application routes/workers are tenant-aware.
"""
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from app.core.central_auth import AuthenticationDenied, CentralAuth, COOKIE, IsolationError, ORG
from app.models.models import User

class Login(BaseModel):
    organization: str = Field(min_length=2, max_length=40)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)

class Handoff(BaseModel):
    token: str = Field(min_length=43,max_length=43)

def central_router(service: CentralAuth, origin: str):
    router = APIRouter()

    def same_origin(request: Request):
        if request.headers.get("origin") != origin or request.headers.get("sec-fetch-site") in {"cross-site","same-site"}:
            raise HTTPException(403, "Cross-origin request denied")

    def cookie(request: Request):
        return request.cookies.get(COOKIE, "")

    def deny(exc):
        if isinstance(exc, IsolationError):
            raise HTTPException(503, "Organization temporarily unavailable") from exc
        raise HTTPException(401, "Invalid credentials or session") from exc

    @router.post("/login")
    def login(body: Login, request: Request, response: Response):
        same_origin(request)
        if not ORG.fullmatch(body.organization):
            raise HTTPException(401, "Invalid credentials or session")
        try:
            token = service.login(body.organization, body.email, body.password)
        except (AuthenticationDenied, IsolationError) as exc:
            deny(exc)
        response.set_cookie(value=token, **service.cookie_options())
        response.headers["Cache-Control"] = "no-store"
        return {"authenticated":True}

    @router.post("/complete")
    def complete(body: Handoff, request: Request):
        same_origin(request)
        try:
            token = service.exchange_verified_handoff(body.token)
        except (AuthenticationDenied, IsolationError) as exc:
            deny(exc)
        response = RedirectResponse("/dashboard", status_code=303,
            headers={"Cache-Control":"no-store", "Referrer-Policy":"no-referrer"})
        response.set_cookie(value=token, **service.cookie_options())
        return response

    @router.get("/me")
    def me(request: Request, response: Response):
        try:
            with service.request_database(cookie(request)) as (principal, db):
                user = db.get(User, principal.user_id)
                response.headers["Cache-Control"] = "no-store"
                return dict(id=user.id, email=user.email, full_name=user.full_name,
                    role=user.role, is_active=user.is_active,
                    must_change_password=user.must_change_password, organization_id=principal.org_id)
        except (AuthenticationDenied, IsolationError) as exc:
            deny(exc)

    @router.post("/logout")
    def logout(request: Request, response: Response):
        same_origin(request)
        try:
            service.logout(cookie(request))
        except AuthenticationDenied:
            pass
        response.delete_cookie(COOKIE, path="/", secure=True, httponly=True, samesite="lax")
        response.headers["Cache-Control"] = "no-store"
        return {"authenticated":False}

    return router

def organization_database(service: CentralAuth):
    """FastAPI dependency for tenant data routes. No client org selector."""
    def dependency(request: Request):
        try:
            with service.request_database(request.cookies.get(COOKIE, "")) as (principal, db):
                if db.get(User, principal.user_id).must_change_password:
                    raise HTTPException(403, "Change your temporary password first")
                yield db
        except AuthenticationDenied as exc:
            raise HTTPException(401, "Invalid credentials or session") from exc
        except IsolationError as exc:
            raise HTTPException(503, "Organization temporarily unavailable") from exc
    return dependency
