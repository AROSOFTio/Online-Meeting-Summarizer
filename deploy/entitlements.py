import json
from pathlib import Path
DEFAULT={"plan":"starter","expiry":"","grace_days":0,"limits":{"users":10,"storage_gib":5,"ai_minutes":300},"features":["live","recording","ai","templates","exports","actions","audit"]}
def publish(root,row,profile=None):
    import tenantctl
    profile={**DEFAULT,**(profile if profile is not None else row.get("profile",{}))}
    policy={"tenant":row["slug"],**{k:profile[k] for k in DEFAULT}}
    directory=Path(root)/row["slug"]/"entitlements"
    directory.mkdir(mode=0o700,exist_ok=True)
    if directory.is_symlink():raise ValueError("Invalid entitlement directory")
    tenantctl.private_write(directory/"subscription.json",json.dumps(policy,indent=2)+"\n")
    env_path=Path(root)/row["slug"]/"tenant.env"
    env=env_path.read_text()
    updated="".join(x for x in env.splitlines(keepends=True) if not x.startswith("TENANT_POLICY_DIR="))
    if updated and not updated.endswith("\n"):updated+="\n"
    updated+=tenantctl.dotenv({"TENANT_POLICY_DIR":str(directory.resolve())})
    if updated!=env:tenantctl.private_write(env_path,updated)
