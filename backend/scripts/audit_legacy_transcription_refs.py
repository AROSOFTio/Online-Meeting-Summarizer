from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FORBIDDEN = (("whis" + "per").lower(), ("faster-" + "whis" + "per").lower())
EXCLUDE_PARTS = {".git", "node_modules", ".next", "__pycache__"}
TEXT_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".json", ".md", ".yml", ".yaml", ".txt"}


def main() -> None:
    offenders = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        if any(part in EXCLUDE_PARTS for part in path.parts):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore").lower()
        if any(term in text for term in FORBIDDEN):
            offenders.append(str(path.relative_to(ROOT)))
    if offenders:
        raise SystemExit("Legacy transcription references remain: " + ", ".join(sorted(offenders)))
    print("No legacy transcription-provider references found.")


if __name__ == "__main__":
    main()
