#!/usr/bin/env python3
"""Run only against two disposable, freshly provisioned staging workspaces."""
import argparse
import json
import io
import wave
import secrets
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlencode


def request(row,path,method="GET",body=None,token=None,form=False,extra=None):
    headers={"Accept":"application/json",**(extra or {})}
    if token:headers["Authorization"]="Bearer "+token
    if body is not None:
        if not isinstance(body, bytes):
            headers["Content-Type"]="application/x-www-form-urlencoded" if form else "application/json"
            body=(urlencode(body) if form else json.dumps(body)).encode()
    req=Request("http://127.0.0.1:"+str(row["port"])+path,data=body,headers=headers,method=method)
    try:
        with urlopen(req,timeout=90) as response:
            raw=response.read()
            return response.status, json.loads(raw) if "application/json" in response.headers.get("Content-Type","") else raw
    except HTTPError as response:
        return response.code,response.read()


def expect(row,path,status,**kwargs):
    code,data=request(row,path,**kwargs)
    if code!=status:
        raise AssertionError(f"{row['slug']} {path}: expected {status}, received {code}")
    return data


def upload_test_audio(row, meeting_id, token, sample):
    output=io.BytesIO()
    with wave.open(output,"wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(sample.to_bytes(2,"little",signed=True)*16000)
    original=output.getvalue()
    boundary="cc-"+secrets.token_hex(16)
    body=(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"fixture.wav\"\r\nContent-Type: audio/wav\r\n\r\n").encode()+original+f"\r\n--{boundary}--\r\n".encode()
    recording=expect(row,f"/api/recordings/upload/{meeting_id}",200,method="POST",body=body,token=token,extra={"Content-Type":"multipart/form-data; boundary="+boundary})
    return recording["id"],original


def credentials(root,row):
    env=dict(line.split("=",1) for line in (root/row["slug"]/"tenant.env").read_text().splitlines() if "=" in line and not line.startswith("#"))
    return {"username":env["ADMIN_EMAIL"].strip("'"),"password":env["ADMIN_PASSWORD"].strip("'")}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root",type=Path,required=True)
    parser.add_argument("first")
    parser.add_argument("second")
    args=parser.parse_args()
    registry=json.loads((args.root/"registry.json").read_text())
    a,b=registry[args.first],registry[args.second]
    if a==b or not a["enabled"] or not b["enabled"]:
        raise RuntimeError("Two different enabled disposable tenants required")
    creds=[credentials(args.root,r) for r in (a,b)]
    tokens=[expect(r,"/api/auth/login",200,method="POST",body=c,form=True)["access_token"] for r,c in zip((a,b),creds)]
    # Intentionally use the same admin email but different passwords.
    assert creds[0]["username"]==creds[1]["username"]
    expect(b,"/api/auth/login",400,method="POST",body=creds[0],form=True)
    expect(b,"/api/auth/me",401,token=tokens[0])
    expect(a,"/api/auth/me",401,token=tokens[1])
    # Bootstrap password change is required on new managed deployments.
    for r,c,t in zip((a,b),creds,tokens):
        user=expect(r,"/api/auth/me",200,token=t)
        if user["must_change_password"]:
            expect(r,"/api/auth/change-password",200,method="POST",token=t,body={"current_password":c["password"],"new_password":"NewCc!"+secrets.token_urlsafe(24)})
    meetings=[]
    for r,t in zip((a,b),tokens):
        assert expect(r,"/api/meetings/",200,token=t)==[]
        meetings.append(expect(r,"/api/meetings/",201,method="POST",token=t,body={"title":"Private "+r["slug"],"description":"","date":datetime.now(timezone.utc).isoformat(),"participants":[]}))
    assert meetings[0]["id"]==meetings[1]["id"]
    mid=meetings[0]["id"]
    for r,t in zip((a,b),tokens):
        assert expect(r,f"/api/meetings/{mid}",200,token=t)["title"]=="Private "+r["slug"]
        assert len(expect(r,"/api/meetings/",200,token=t))==1
        expect(r,f"/api/meetings/{mid}",401,token=tokens[1] if r==a else tokens[0])
        expect(r,"/api/minute-formats/library",200,method="POST",token=t,body={"name":"Format "+r["slug"],"sector":"General","fields":[{"id":"title","label":"Meeting title","kind":"text","required":True}]})
        formats=expect(r,"/api/minute-formats/library",200,token=t)
        assert len(formats)==1 and formats[0]["definition"]["name"]=="Format "+r["slug"]
        expect(r,f"/api/minute-formats/meeting/{mid}/format",200,method="PUT",token=t,body={"format_id":formats[0]["id"]})
        draft=expect(r,f"/api/minute-formats/meeting/{mid}",200,token=t)
        assert draft["values"]["title"]=="Private "+r["slug"]
        assert expect(r,f"/api/meetings/{mid}/export?format=pdf",200,token=t).startswith(b"%PDF")
        word=expect(r,f"/api/meetings/{mid}/export?format=docx",200,token=t)
        with zipfile.ZipFile(io.BytesIO(word)) as doc:
            xml=doc.read("word/document.xml")
        assert ("Private "+r["slug"]).encode() in xml
        assert ("Private "+(b if r==a else a)["slug"]).encode() not in xml
        expect(r,"/api/settings/",200,method="PUT",token=t,body={"school_name":"Organization "+r["slug"]})
        assert expect(r,"/api/settings/",200,token=t)["school_name"]=="Organization "+r["slug"]
    # Physical recording contents must remain independent, even with the same ID.
    recording_a,bytes_a=upload_test_audio(a,mid,tokens[0],0)
    recording_b,bytes_b=upload_test_audio(b,mid,tokens[1],123)
    assert recording_a==recording_b and bytes_a!=bytes_b
    assert expect(a,f"/api/recordings/{recording_a}/download",200,token=tokens[0])==bytes_a
    assert expect(b,f"/api/recordings/{recording_b}/download",200,token=tokens[1])==bytes_b
    expect(b,f"/api/recordings/{recording_b}/download",401,token=tokens[0])
    expect(a,f"/api/recordings/{recording_a}/play",401,token=tokens[1])
    # Live room peer credentials must not work in another process.
    for r,t in zip((a,b),tokens):
        expect(r,f"/api/meetings/{mid}/start",200,method="POST",token=t)
    peer=expect(a,f"/api/live-rooms/{mid}/join",200,method="POST",token=tokens[0],body={})
    heartbeat={"peer_id":peer["peer_id"],"session_key":peer["session_key"],"muted":False}
    expect(a,f"/api/live-rooms/{mid}/heartbeat",200,method="POST",body=heartbeat)
    rejected,_=request(b,f"/api/live-rooms/{mid}/heartbeat",method="POST",body=heartbeat)
    assert rejected in {401,403,404}
    expect(a,f"/api/live-rooms/{mid}/leave",200,method="POST",body=heartbeat)
    invitation=expect(a,f"/api/meetings/{mid}/invitations",200,method="POST",token=tokens[0],body={"user_ids":[],"emails":[],"send_email":False})
    code=invitation["general_link"].rstrip("/").split("/")[-1]
    assert invitation["general_link"].startswith("https://"+a["host"]+"/")
    expect(a,f"/api/meetings/public/invitations/{code}",200)
    expect(b,f"/api/meetings/public/invitations/{code}",404)
    expect(b,f"/api/meetings/{mid}",403,method="PUT",token=tokens[1],body={"title":"Cross-origin mutation"},extra={"Origin":"https://"+a["host"],"Sec-Fetch-Site":"same-site"})
    expect(a,"/api/system/backups",200,method="POST",token=tokens[0])
    assert expect(b,"/api/system/backups",200,token=tokens[1])==[]
    backup=expect(a,"/api/system/backups",200,token=tokens[0])[0]
    expect(b,f"/api/system/backups/{backup['id']}/download",404,token=tokens[1])
    expect(b,f"/api/system/backups/{backup['id']}/download",401,token=tokens[0])
    expect(a,f"/api/meetings/{mid}",200,method="PUT",token=tokens[0],body={"title":"Updated "+a["slug"]})
    assert expect(b,f"/api/meetings/{mid}",200,token=tokens[1])["title"]=="Private "+b["slug"]
    expect(a,f"/api/meetings/{mid}?permanent=true",200,method="DELETE",token=tokens[0])
    assert expect(b,f"/api/meetings/{mid}",200,token=tokens[1])["title"]=="Private "+b["slug"]
    print("PASS: two disposable workspaces, overlapping IDs, distinct credentials, token replay, formats, exports, settings, invitations, recording bytes, live sessions, backup access and mutations.")


if __name__=="__main__":
    main()
