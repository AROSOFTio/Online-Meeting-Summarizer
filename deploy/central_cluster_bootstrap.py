"""Initialize a dedicated empty central cluster. Never run on legacy PostgreSQL."""
import os,psycopg
from psycopg import sql
from sqlalchemy.engine import make_url
url=make_url(os.environ["MS_CENTRAL_REGISTRY_URL"])
with psycopg.connect(os.environ["MS_ALLOCATION_DSN"],autocommit=True) as db:
    with db.cursor() as cur:
        cur.execute("SELECT datname FROM pg_database WHERE datallowconn AND datname NOT IN ('postgres','template1')")
        others={x[0] for x in cur.fetchall()}
        if others and others!={url.database}:raise RuntimeError("Refusing nonempty database cluster")
        cur.execute("SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='postgres'")
        marker=cur.fetchone()[0]
        if others and marker!="MinuteSeal central allocation cluster v1":raise RuntimeError("Existing unmarked cluster")
        if not others:
            cur.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS").format(sql.Identifier(url.username),sql.Literal(url.password)))
            cur.execute(sql.SQL("CREATE DATABASE {} OWNER {} ALLOW_CONNECTIONS false").format(sql.Identifier(url.database),sql.Identifier(url.username)))
            cur.execute(sql.SQL("REVOKE CONNECT ON DATABASE {} FROM PUBLIC").format(sql.Identifier(url.database)))
            cur.execute(sql.SQL("ALTER DATABASE {} ALLOW_CONNECTIONS true").format(sql.Identifier(url.database)))
            cur.execute("COMMENT ON DATABASE postgres IS 'MinuteSeal central allocation cluster v1'")
        cur.execute("REVOKE CONNECT ON DATABASE postgres FROM PUBLIC")
        cur.execute("REVOKE CONNECT ON DATABASE template1 FROM PUBLIC")
from app.core.central_auth import CentralAuth
from sqlalchemy import create_engine
CentralAuth(create_engine(url),{}).initialize_registry()
print("Dedicated central registry initialized")
