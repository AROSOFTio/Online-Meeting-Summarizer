#!/usr/bin/env python3
"""Inspect only the two explicitly named disposable Compose projects."""
import argparse
import json
import subprocess
from pathlib import Path
from tenantctl import compose_command, SLUG


def inspect(root,row):
    ids=subprocess.check_output(compose_command(root,row,"ps","-q"),text=True).split()
    if not ids:
        raise RuntimeError("No running tenant containers")
    containers=json.loads(subprocess.check_output(["docker","inspect",*ids],text=True))
    services={}
    networks=set()
    volumes=set()
    for c in containers:
        labels=c["Config"]["Labels"]
        assert labels["com.docker.compose.project"]=="cc-"+row["slug"]
        name=labels["com.docker.compose.service"]
        assert c["State"]["Running"],name
        services[name]=c
        networks.update(c["NetworkSettings"]["Networks"].keys())
        for mount in c["Mounts"]:
            if mount["Type"]=="bind":
                assert name in {"backend","worker"} and mount["Destination"]=="/run/convenecore-entitlements" and not mount["RW"]
                assert Path(mount["Source"]).resolve()==(root/row["slug"]/"entitlements").resolve()
                continue
            assert mount["Type"]=="volume", "Unexpected shared host mount"
            volumes.add(mount["Name"])
        published=[binding for bindings in (c["NetworkSettings"]["Ports"] or {}).values() if bindings for binding in bindings]
        if name=="frontend":
            assert published and all(p["HostIp"]=="127.0.0.1" and int(p["HostPort"])==row["port"] for p in published)
        else:
            assert not published, "Private service published to host"
    assert set(services)=={"db","redis","backend","worker","frontend"}
    assert len(networks)==1 and all(n.startswith("cc-"+row["slug"]+"_") for n in networks)
    # Check that backend and worker share their own recording volume only.
    storage=lambda name:{m["Name"] for m in services[name]["Mounts"] if m["Destination"]=="/workspace/storage"}
    assert len(storage("backend"))==1 and storage("backend")==storage("worker")
    assert len({m["Name"] for m in services["db"]["Mounts"] if m["Destination"]=="/var/lib/postgresql/data"})==1
    return networks,volumes


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root",type=Path,required=True)
    parser.add_argument("first")
    parser.add_argument("second")
    args=parser.parse_args()
    assert args.first!=args.second and all(SLUG.fullmatch(s) for s in (args.first,args.second))
    registry=json.loads((args.root/"registry.json").read_text())
    a,b=[inspect(args.root,registry[s]) for s in (args.first,args.second)]
    assert not a[0]&b[0],"Tenant networks overlap"
    assert not a[1]&b[1],"Tenant storage volumes overlap"
    print("PASS: independent networks, storage, database volumes and private service ports.")


if __name__=="__main__":
    main()
