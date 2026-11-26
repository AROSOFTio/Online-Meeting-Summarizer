# ConveneCore platform administration console

The platform console is deliberately separate from every customer-facing backend. It runs on the trusted operator host, uses the existing tenantctl registry, and controls only registered Compose projects. Do not mount the Docker socket or registry into a customer workspace.

## Run privately

From the release checkout on a trusted Linux operator host, using the account that owns the registry and is authorized to manage the dedicated Compose projects:

    python3 deploy/platform_admin.py --init-password
    python3 deploy/platform_admin.py --port 18790

The registry must be private (0700). Password hash, tenant credentials and audit records are private files. The console binds only to 127.0.0.1. Access from an operator workstation with an SSH local port forward:

    ssh -L 18790:127.0.0.1:18790 operator@YOUR_SERVER

Open http://127.0.0.1:18790 in that workstation's browser. Do not publish this port or reverse-proxy it to the Internet. No public SaaS admin URL is installed. The local HTTP cookie relies on the SSH tunnel, host validation, HttpOnly and SameSite=Strict; an Internet-facing version would need HTTPS, MFA, individual administrator identities and additional hardening.

The independent platform password is stored as a salted scrypt digest; sessions expire after 30 minutes of inactivity and mutations require both same-origin requests and a CSRF token. Login attempts are rate-limited in memory. The audit log records fixed operation names and outcomes, not credentials or private meeting content.

## Capabilities

- Dashboard counts, organization search/filter, type, hostname, lifecycle and subscription expiry.
- Provision an independent tenant using the existing registry and generated credentials.
- Start or suspend its stack without deleting its data; suspension requires confirmation.
- Plan and per-organization user, storage and AI-minute allowances and feature configuration.
- On-demand aggregate usage directly from the tenant backend: active users, meetings, stored recording duration, storage volume bytes, processing jobs this month. No individual user or meeting records are retrieved by the console.
- Activity log and explicit operation-failure state.

Plan presets are illustrative and not prices. Limits, feature switches and subscription dates are stored as management metadata; quota enforcement, automatic expiry suspension, payment processing and provider AI-token/minute metering are **not** implemented. Usage snapshots are not live and may be stale. Activate checks past expiry only when starting a workspace. The platform console does not automatically install TLS certificates, DNS or proxy routes. Use tenantctl render-nginx and the existing reviewed operator process. Deliver bootstrap credentials securely from the private tenant environment file; the dashboard does not display them.

Compose commands may take time and run synchronously. After a timeout or failure, inspect the registered tenant with tenantctl status before retrying. A stopped workspace retains its database and volumes. Never use this console as a substitute for validated isolation tests or a verified existing-data migration.

## Verification

Run python -m unittest discover -s deploy -p "test_*.py" -v. Then exercise login, CSRF, workspace creation, activation, refresh and suspension against disposable organizations only. The existing production environment is unchanged until the branch is reviewed and deployed.
