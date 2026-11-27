from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

connect_args = {}
if settings.is_sqlite:
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

# Enforce foreign key constraints in SQLite
if settings.is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

_StandaloneSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def SessionLocal(**kwargs):
    from app.core.organization_context import current
    context=current.get()
    if context is not None:
        return _StandaloneSession(bind=context.engine, **kwargs)
    import os
    if os.environ.get("MS_CENTRAL_REGISTRY_URL"):
        raise RuntimeError("Central database access requires organization context")
    return _StandaloneSession(**kwargs)
Base = declarative_base()
