"""Private Unix-socket broker. Run as a dedicated allocation service."""
import argparse,json,os,socketserver
from pathlib import Path
from app.core.organization_allocator import OrganizationAllocator
import central_registration

class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(5)
        try:
            raw=self.rfile.readline(2048)
            if not raw.endswith(b"\n"):raise ValueError("Invalid request")
            request=json.loads(raw)
            if set(request)!={"ref","key","code"} or not all(isinstance(v,str) for v in request.values()):raise ValueError("Invalid request")
            token=central_registration.complete(self.server.inbox,request["ref"],request["key"],request["code"],self.server.allocator)
            result=dict(status="ok",token=token) if token else dict(status="invalid")
        except Exception:
            result=dict(status="unavailable")
        self.wfile.write(json.dumps(result).encode()+b"\n")

def main():
    p=argparse.ArgumentParser();p.add_argument("--inbox",required=True);p.add_argument("--socket",required=True)
    p.add_argument("--journal",required=True);p.add_argument("--storage",required=True)
    a=p.parse_args()
    allocator=OrganizationAllocator(os.environ["MS_ALLOCATION_DSN"],os.environ["MS_CENTRAL_REGISTRY_URL"],a.journal,a.storage)
    path=Path(a.socket)
    if path.exists() or path.is_symlink():raise RuntimeError("Socket path already exists")
    old=os.umask(0o117)
    try:
        with socketserver.UnixStreamServer(str(path),Handler) as server:
            os.chmod(path,0o660)
            os.umask(old)
            server.inbox=a.inbox;server.allocator=allocator
            try:server.serve_forever()
            finally:path.unlink(missing_ok=True)
    finally:os.umask(old)
if __name__=="__main__":main()
