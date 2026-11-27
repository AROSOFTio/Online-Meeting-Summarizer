"""Local-only registration broker client; public process holds no DB credentials."""
import json, socket, re
TOKEN=re.compile(r"[A-Za-z0-9_-]{43}")
def complete(socket_path,ref,key,code):
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
        s.settimeout(30);s.connect(socket_path)
        s.sendall(json.dumps(dict(ref=ref,key=key,code=code)).encode()+b"\n")
        with s.makefile("rb") as f: data=json.loads(f.readline(1024))
    if data.get("status")=="invalid":return None
    if data.get("status")!="ok" or not TOKEN.fullmatch(data.get("token","")):raise RuntimeError("Registration broker unavailable")
    return data["token"]
