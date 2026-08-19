import os
import shutil
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings


BACKUP_DIR = Path(settings.STORAGE_DIR) / "backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _sqlite_path() -> Path:
    return Path(settings.DATABASE_URL.replace("sqlite:///", "", 1)).resolve()


def create_database_backup() -> Path:
    if settings.is_sqlite:
        source = _sqlite_path()
        if not source.exists():
            raise RuntimeError(f"SQLite database does not exist: {source}")
        target = BACKUP_DIR / f"meeting-summarizer-{_timestamp()}.sqlite3"
        source_connection = sqlite3.connect(source)
        backup_connection = sqlite3.connect(target)
        try:
            source_connection.backup(backup_connection)
        finally:
            backup_connection.close()
            source_connection.close()
        validate_backup(target)
        return target

    target = BACKUP_DIR / f"meeting-summarizer-{_timestamp()}.dump"
    result = subprocess.run(
        ["pg_dump", "--format=custom", "--no-owner", "--no-acl", "--file", str(target), settings.DATABASE_URL],
        capture_output=True,
        text=True,
        timeout=300,
        env=os.environ.copy(),
    )
    if result.returncode != 0:
        target.unlink(missing_ok=True)
        raise RuntimeError(result.stderr.strip() or "pg_dump failed")
    validate_backup(target)
    return target


def validate_backup(path: Path) -> None:
    if not path.exists() or path.stat().st_size == 0:
        raise RuntimeError("Backup file is missing or empty")
    if path.suffix == ".sqlite3":
        connection = sqlite3.connect(path)
        try:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()
            if not integrity or integrity[0] != "ok":
                raise RuntimeError(f"SQLite backup integrity check failed: {integrity}")
        finally:
            connection.close()
        return
    result = subprocess.run(["pg_restore", "--list", str(path)], capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "PostgreSQL backup validation failed")


def restore_database_backup(path: Path) -> None:
    """Offline restore helper. Stop the web/worker services before using this."""
    validate_backup(path)
    if settings.is_sqlite:
        shutil.copy2(path, _sqlite_path())
        return
    result = subprocess.run(
        ["pg_restore", "--clean", "--if-exists", "--no-owner", "--no-acl", "--dbname", settings.DATABASE_URL, str(path)],
        capture_output=True,
        text=True,
        timeout=600,
        env=os.environ.copy(),
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "pg_restore failed")
