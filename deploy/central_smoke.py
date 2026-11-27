"""Controlled live-stack smoke; no public access or real customer records."""
import http.client,json,os,re,secrets,threading
from pathlib import Path
from urllib.parse import urlencode
import public_registration as reg
import onboarding
from unittest.mock import patch
ROOT=Path("/var/lib/minuteseal-central")
origin="https://minuteseal.arosoftlabs.com"
host="minuteseal.arosoftlabs.com"
os.environ["CC_ONBOARD_REGISTRATION_PAUSED"]="0"
os.environ["MS_CENTRAL_REGISTRATION_SOCKET"]=str(ROOT/"socket/broker.sock")
reg.BASE="/register"
messages=[]
original=onboarding.register_browser
def register(path,data):
    return original(path,data,lambda *args:messages.append(args))
def call(port,method,path,body=None,headers=None):
    c=http.client.HTTPConnection("127.0.0.1",port,timeout=40)
    c.request(method,path,body,{"Host":host,**(headers or {})})
    r=c.getresponse();status=r.status;h=dict(r.getheaders());data=r.read();c.close()
    return status,h,data
name="MinuteSeal temporary smoke "+secrets.token_hex(4)
email=secrets.token_hex(8)+"@example.com"
password="Smoke-"+secrets.token_urlsafe(16)+"!"
with patch.object(onboarding,"register_browser",register):
    server=reg.Server(ROOT/"registration/inbox.db",0,origin)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        port=server.server_port
        form={"Content-Type":"application/x-www-form-urlencoded","Origin":origin}
        status,h,body=call(port,"POST","/register/",urlencode(dict(name=name,contact="Test Administrator",email=email,sector="Corporate",password=password,confirm_password=password)),form)
        assert status==200 and messages, status
        cookie=h["Set-Cookie"].split(";",1)[0]
        ref=cookie.split("=",1)[1].split(".",1)[0]
        (ROOT/"private/smoke-ref").write_text(ref)
        code=re.search(r"code is ([0-9]{6})",messages[-1][2]).group(1)
        status,_,_=call(port,"POST","/register/verify",urlencode({"code":"000000" if code!="000000" else "111111"}),{**form,"Cookie":cookie})
        assert status==400,status
        status,h,_=call(port,"POST","/register/verify",urlencode({"code":code}),{**form,"Cookie":cookie})
        assert status==303 and h["Location"]=="/dashboard",status
        session=h["Set-Cookie"].split(";",1)[0]
        assert session.startswith("__Host-minuteseal-session=")
        auth={"Cookie":session,"Origin":origin}
        for endpoint in ("/api/auth/me","/api/stats","/api/settings/","/api/meetings/","/api/staff/","/api/subscription","/api/live-rooms/ongoing","/api/system/status"):
            status,_,body=call(19284,"GET",endpoint,headers=auth)
            assert status==200,(endpoint,status)
            if endpoint=="/api/auth/me":assert json.loads(body)["full_name"]=="Test Administrator"
            if endpoint=="/api/settings/":assert json.loads(body)["school_name"]==name
        status,_,_=call(19284,"GET","/api/stats",headers={"X-Organization-ID":"org-"+ref})
        assert status==401,status
        status,_,_=call(19283,"GET","/dashboard")
        assert status==200,status
        status,_,_=call(port,"POST","/register/verify",urlencode({"code":code}),{**form,"Cookie":cookie})
        assert status!=303,status
        status,_,_=call(19284,"POST","/api/auth/logout",headers=auth)
        assert status==200,status
        status,_,_=call(19284,"GET","/api/auth/me",headers=auth)
        assert status==401,status
        status,h,_=call(19284,"POST","/api/auth/login",urlencode({"username":email,"password":password}),form)
        assert status==200,status
        status,_,_=call(19284,"GET","/api/auth/me",headers={"Cookie":next(v for k,v in h.items() if k.lower()=="set-cookie").split(";",1)[0]})
        assert status==200,status
        print("PASS: actual registration HTTP -> OTP -> broker -> dedicated DB -> authenticated dashboard, replay rejection, logout and subsequent login")
    finally:
        server.shutdown();server.server_close();thread.join()
