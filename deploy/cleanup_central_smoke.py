"""Delete only a specifically identified, disposable smoke-test organization."""
import os,sys,json,re,shutil
from pathlib import Path
import psycopg
from psycopg import sql
from sqlalchemy import create_engine,select,delete
from app.core.central_auth import organizations,memberships,sessions,handoffs,invitations
from app.core.organization_allocator import OrganizationAllocator
ref=sys.argv[1]
if not re.fullmatch("[a-f0-9]{32}",ref):raise RuntimeError("Invalid smoke reference")
org="org-"+ref;role="msorg_"+ref
a=OrganizationAllocator(os.environ["MS_ALLOCATION_DSN"],os.environ["MS_CENTRAL_REGISTRY_URL"],os.environ["MS_CENTRAL_JOURNAL"],os.environ["MS_CENTRAL_STORAGE"])
with a.registry.begin() as c:
    record=c.execute(select(organizations).where(organizations.c.id==org)).mappings().one()
    if not record["name"].startswith("MinuteSeal temporary smoke "):raise RuntimeError("Not a disposable smoke account")
    for table in (sessions,handoffs,invitations,memberships,organizations):
        c.execute(delete(table).where((table.c.id if table is organizations else table.c.org_id)==org))
with psycopg.connect(a.admin_dsn,autocommit=True) as conn:
    with conn.cursor() as cur:
        a.guard(cur)
        cur.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(role)))
        cur.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(role)))
(a.journal/(ref+".json")).unlink()
(a.journal/(ref+".lock")).unlink(missing_ok=True)
shutil.rmtree(a.storage/org)
import sqlite3
with sqlite3.connect("/central/registration/inbox.db") as db:
    email=db.execute("SELECT email FROM applications WHERE ref=?",(ref,)).fetchone()
    for table in ("registration_passwords","browser_otp","applications"):db.execute(f"DELETE FROM {table} WHERE ref=?",(ref,))
    if email:db.execute("DELETE FROM mail_attempts WHERE email=?",(email[0],))
print("Temporary smoke organization removed")
