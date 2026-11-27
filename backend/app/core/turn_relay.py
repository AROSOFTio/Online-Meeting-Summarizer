"""Issue time-limited TURN REST credentials after live room authorization."""
import base64
import hashlib
import hmac
import logging
import os
import re
import time
from pathlib import Path

TTL_SECONDS = 4 * 3600
DEFAULT_URLS = (
    "turn:turn.minuteseal.arosoftlabs.com:3478?transport=udp",
    "turn:turn.minuteseal.arosoftlabs.com:3478?transport=tcp",
    "turns:turn.minuteseal.arosoftlabs.com:5349?transport=tcp",
)
STUN = {"urls": ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"]}
log = logging.getLogger(__name__)

def meeting_ice_servers(peer_id: str, now=None):
    servers = [STUN]
    result = {"ice_servers": servers, "ice_expires_at": 0}
    path = os.environ.get("MEETING_TURN_SECRET_FILE")
    if not path:
        return result
    try:
        secret = Path(path).read_text().strip()
        if not re.fullmatch(r"[0-9a-f]{64}", secret):
            raise ValueError("Invalid relay secret format")
    except (OSError, ValueError):
        log.warning("Meeting TURN relay configuration unavailable")
        return result
    if not re.fullmatch(r"[0-9a-f]{32}", peer_id):
        raise ValueError("Invalid meeting peer")
    expiry = int(time.time() if now is None else now) + TTL_SECONDS
    username = f"{expiry}:{peer_id}"
    credential = base64.b64encode(hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()).decode("ascii")
    servers.append({"urls": list(DEFAULT_URLS), "username": username, "credential": credential})
    result["ice_expires_at"] = expiry
    return result
