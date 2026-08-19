import argparse
from pathlib import Path

from app.services.backup import restore_database_backup, validate_backup


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and restore an OMS database backup.")
    parser.add_argument("backup", help="Path to .dump or .sqlite3 backup")
    parser.add_argument("--yes", action="store_true", help="Confirm that web and worker services are stopped")
    args = parser.parse_args()
    path = Path(args.backup).resolve()
    validate_backup(path)
    if not args.yes:
        raise SystemExit("Backup is valid. Stop backend/worker services, then rerun with --yes to restore.")
    restore_database_backup(path)
    print(f"Restore completed from {path}")


if __name__ == "__main__":
    main()
