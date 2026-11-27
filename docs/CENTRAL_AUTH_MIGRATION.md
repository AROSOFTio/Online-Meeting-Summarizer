# Shared-domain authentication migration

Status: opt-in foundation only. Do not mount the new router or reopen public
registration until the cutover checklist passes. Existing deployments use their
current authentication and dedicated data stores.

Implemented:
- Central registry of organization identities, memberships, hashed opaque sessions,
  and expiring single-use registration handoffs.
- Dedicated PostgreSQL databases and distinct roles; trusted operator mapping;
  database identity marker checked on each tenant session.
- HTTP login, profile, logout and authenticated handoff completion (303 to /dashboard)
  in an opt-in router. Secure host-only cookie; origin checks for mutations.
- A FastAPI database dependency that derives the tenant exclusively from the
  authenticated session, rejecting inactive organizations/users/memberships.
- Isolated SQLite and real PostgreSQL tests, including identical tenant record IDs,
  attempted cross-tenant login/write, role CONNECT denial and handoff replay.

Required before cutover:
1. Implement transactionally recoverable organization/database/role allocation
   on a shared PostgreSQL server, including revoked PUBLIC CONNECT privileges,
   unique credentials, initial admin, trial entitlements, directory profile,
   tenant marker and storage root. Store credentials in protected configuration.
2. Bind OTP verification to provisioning and handoff issuance in the trusted
   registration process; handoff must never be issued to unverified registrations.
   Handle duplicate/retried registrations, expiry and rollback. Implement rate limits.
3. Mount the central auth router in a shared backend; adapt the existing login UI
   and authentication dependencies; ensure role checks and password changes work.
   Bind all API DB sessions, settings, storage, exports, backups and queue jobs
   to the verified tenant context; deny contextless access. Route guest invitations
   and live rooms using tenant-bound capabilities. Do not use the current standalone
   database, worker, settings or static backup directory as fallback.
4. Migrate existing tenants without merging their data; preserve original backups,
   entitlements, accounts, links and service access until verified. Retire
   legacy routing only after each tenant has migrated.
5. Run concurrent tenant read/write, IDOR, storage path, invitation, guest live-room,
   queue/task, backups, subscription, rate-limit and end-to-end browser OTP tests.
   Verify same-domain authenticated dashboard immediately after OTP, no generated
   subdomains or additional login. Test rollback before reopening registration.

No production routing changes are part of this module.

## OTP and allocation bridge (implemented, gated)
The public registration handler sends only the browser reference, browser secret
and OTP to a private Unix socket. The broker independently verifies these
against the inbox and allocates a distinct PostgreSQL database and role, marks
the data/storage identity, initializes the administrator with the original
Argon2id hash, attaches membership, and exchanges a one-use handoff for an
opaque central session. On success the public handler sets a host-only secure
cookie and returns 303 /dashboard. No legacy provisioning fallback is allowed.
The original registration token and pending password hash are retired.
The allocator journals credentials before database DDL so retries can resume.

Tested against disposable PostgreSQL with two automatically allocated tenants,
real Unix-socket broker, wrong OTP/browser proof, OTP replay, identical record
IDs and database CONNECT denial. Separately tested real HTTP handler redirect,
cookie flags, cross-origin and broker failure with a mocked broker.

Production configuration is deliberately NOT enabled. The cluster requires
a dedicated PostgreSQL instance, explicit shared database comment
'MinuteSeal central allocation cluster v1' on the maintenance DB, no unrelated
databases, and PUBLIC CONNECT revoked from maintenance, template1 and registry.
Broker must run with private journal/storage and a restricted Unix socket
accessible only to its designated public listener group. Configure secrets
through protected service configuration, not command-line arguments.
Production readiness still requires resource quotas, expiry/trial policy,
operational rate limits, recovery tests, membership lifecycle and central
runtime integration (including dashboard, workers, storage and guest routes).
Until then keep CC_ONBOARD_REGISTRATION_PAUSED=1 and no broker socket configured.
The test used a captured OTP email, not live SMTP delivery.
