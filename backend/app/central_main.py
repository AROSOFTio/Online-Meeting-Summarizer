"""Opt-in shared-domain application. No fallback to the standalone DB.

Routes with uncompleted guest/queue/membership integration are explicitly
denied, not sent to the old backend. Production activation requires full
coverage of these routes and operational controls.
"""
import os
import re
from fastapi import FastAPI, Request, Response, HTTPException, Form
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from app.core.central_auth import COOKIE, AuthenticationDenied, IsolationError
from app.core.organization_context import bind
from app.core.central_runtime import Runtime
from app.core.subscriptions import check_request, SubscriptionDenied
from app.api.endpoints import action_items, attendance, auth, exports, live_rooms, meetings, minute_formats, recordings, settings, staff, stats, subscriptions, summaries, system, transcripts

# Explicit temporary safety gate. Guest access, membership mutations and
# external queue dispatch need independent tenant-aware integration.
BLOCKED=(

)

def create_app(runtime):
    app=FastAPI(title="MinuteSeal Central API",docs_url=None,redoc_url=None,openapi_url=None)
    @app.middleware("http")
    async def tenant_scope(request:Request,call_next):
        path=request.url.path.rstrip("/")
        if request.method not in {"GET","HEAD","OPTIONS"}:
            if request.headers.get("origin")!=runtime.origin or request.headers.get("sec-fetch-site") in {"cross-site","same-site"}:
                return JSONResponse({"detail":"Cross-origin request denied"},403)
        if path in {"/api/auth/login","/api/auth/logout","/api/health","/api/auth/setup","/api/auth/setup/request-code"}:
            response=await call_next(request)
            response.headers["Cache-Control"]="no-store"
            return response
        if any(p.fullmatch(path) for p in BLOCKED):
            return JSONResponse({"detail":"This feature is not yet enabled on the central runtime"},503,headers={"Cache-Control":"no-store"})
        try:
            invite=re.fullmatch(r"/api/meetings/public/invitations/([A-Z0-9]{32})(?:/(?:join|apology))?",path)
            room=re.fullmatch(r"/api/live-rooms/([0-9]+)/(join|heartbeat|signal|signals|leave|moderate)",path)
            context=None
            if invite:
                context=await run_in_threadpool(runtime.invitation_context,invite.group(1))
            elif room and room.group(2)=="join":
                body=await request.json()
                if body.get("invite_code"):
                    context=await run_in_threadpool(runtime.invitation_context,body["invite_code"].upper())
            elif room and (not request.cookies.get(COOKIE) or request.headers.get("X-MinuteSeal-Guest")=="1"):
                body=dict(request.query_params) if request.method=="GET" else await request.json()
                peer,key=body.get("peer_id"),body.get("session_key")
                if isinstance(peer,str) and isinstance(key,str) and len(peer)<=64 and len(key)<=128:
                    org=live_rooms.guest_peer_organization(int(room.group(1)),peer,key)
                    if org:context=await run_in_threadpool(runtime.trusted_context,org)
                if request.headers.get("X-MinuteSeal-Guest")=="1" and context is None:raise AuthenticationDenied("Invalid guest session")
            if context is None:
                service=await run_in_threadpool(runtime.service)
                principal=await run_in_threadpool(service.authenticate,request.cookies.get(COOKIE,""))
                context=await run_in_threadpool(runtime.context,service,principal)
        except AuthenticationDenied:
            return JSONResponse({"detail":"Authentication required"},401,headers={"Cache-Control":"no-store"})
        except Exception:
            return JSONResponse({"detail":"Organization temporarily unavailable"},503,headers={"Cache-Control":"no-store"})
        with bind(context):
            try:await run_in_threadpool(check_request,request.url.path,request.method)
            except SubscriptionDenied as exc:return JSONResponse({"detail":exc.detail},exc.status_code,headers={"Cache-Control":"no-store"})
            response=await call_next(request)
            response.headers["Cache-Control"]="no-store"
            return response

    @app.get("/api/health")
    def health():
        from sqlalchemy import text
        try:
            with runtime.registry.connect() as c:c.execute(text("SELECT 1"))
        except Exception:return JSONResponse({"status":"unhealthy"},503)
        return {"status":"healthy","database":"healthy"}

    @app.post("/api/auth/login")
    def login(response:Response,username:str=Form(max_length=255),password:str=Form(max_length=128),organization:str|None=Form(None,max_length=255)):
        try:token=runtime.login(username,password,organization)
        except AuthenticationDenied:raise HTTPException(401,"Invalid credentials. If you belong to multiple organizations, enter your organization name.")
        except Exception:raise HTTPException(503,"Authentication temporarily unavailable")
        response.set_cookie(COOKIE,token,httponly=True,secure=True,samesite="lax",path="/",max_age=86400)
        return {"authenticated":True}

    @app.post("/api/auth/logout")
    def logout(request:Request,response:Response):
        try:runtime.service().logout(request.cookies.get(COOKIE,""))
        except AuthenticationDenied:pass
        response.delete_cookie(COOKIE,path="/",secure=True,httponly=True,samesite="lax")
        return {"detail":"Signed out"}

    @app.post("/api/auth/setup/request-code")
    def legacy_code(body:auth.SetupEmail):
        context=runtime.legacy_setup_context(str(body.email))
        if context:
            from app.core.database import SessionLocal
            with bind(context), SessionLocal() as db:
                return auth.request_setup_code(body,db)
        return {"detail":"If this is an eligible administrator email, a code has been requested. Check your inbox and spam folder."}

    @app.post("/api/auth/setup")
    def legacy_setup(body:auth.InitialSetup):
        context=runtime.legacy_setup_context(str(body.email))
        if context is None:raise HTTPException(400,"Invalid, expired or already-used setup code")
        from app.core.database import SessionLocal
        with bind(context), SessionLocal() as db:
            return auth.initial_setup(body,db)

    # Existing me and change-password handlers use the scoped dependencies.
    for module,prefix in [(auth,"auth"),(subscriptions,"subscription"),(staff,"staff"),(settings,"settings"),
        (system,"system"),(stats,"stats"),(attendance,"meetings"),(meetings,"meetings"),
        (live_rooms,"live-rooms"),(recordings,"recordings"),(transcripts,"transcripts"),
        (summaries,"summaries"),(action_items,"action-items"),(minute_formats,"minute-formats"),(exports,"meetings")]:
        if module is auth:
            from fastapi import APIRouter
            scoped=APIRouter()
            for route in module.router.routes:
                if route.path in {"/me","/change-password"}:scoped.routes.append(route)
            app.include_router(scoped,prefix="/api/auth")
        else:app.include_router(module.router,prefix="/api/"+prefix)
    return app

def from_env():
    return create_app(Runtime(os.environ["MS_CENTRAL_REGISTRY_URL"],os.environ["MS_CENTRAL_JOURNAL"],os.environ["MS_CENTRAL_STORAGE"],os.environ["MS_CENTRAL_ORIGIN"]))
