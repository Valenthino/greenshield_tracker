# Protected preview deployment contract

Target requested: a separate Green Shield project / preview environment in Coolify Root Team. This is not approval to change unrelated applications or choose production hosting. Marketing-site deployment remains separate.

## Build and runtime
- Standard source build: `docker build -t green-shield-crm .`
- Build command in Dockerfile: `npm ci && npm run build`.
- Start command: `npm run start:container` → `next start --hostname 0.0.0.0 --port 3000`.
- Internal HTTP port: **3000**; TLS terminates at the trusted reverse proxy.
- Health endpoint: `GET /api/health/` (unauthenticated, no sensitive data).
- Persistent mount target: **`/app/data`**; file **`/app/data/crm.json`**.
- Run as non-root UID/GID **1000:1000**. A new Docker named volume should inherit the image’s directory ownership; bind mounts may need explicit host ownership setup. Verify before launch.
- **One replica, one Node process, stop-before-start/recreate deployments.** No rolling overlap or parallel jobs writing this file.
- Runtime variables: `CRM_PASSWORD_HASH` securely provisioned, `CRM_DATABASE_PATH=/app/data/crm.json`, `CRM_PUBLIC_ORIGIN=https://greenshield.vavqo.com`, `CRM_COOKIE_SECURE=true`.
- No build-time secrets are needed. The source archive excludes `.env.local`, actual datastore, dependencies, and build output.

## GitHub source
Publish this sanitized source only to the newly authorized repository (public sanitized code is permitted). The bundled seed is empty. Do not commit the private prospect import, runtime datastore, `.env.local`, session files, or backup exports. Use the authorized GitHub/Coolify route; public source needs no private-repository credential. Do not create credentials or broaden access without approval.

After secure login is configured, import the separate private prospect file through the authenticated workspace. Its ten records are unreviewed and unsent. Never bake that private import into a public image or repository.

## Required checks before declaring preview ready
1. Confirm the selected app is Green Shield only, domain and TLS valid, runtime secrets set, persistent mount present, and replacement policy does not overlap writers.
2. Open HTTPS URL without a session. It must show sign-in only; `/api/records/` and `/api/backup/` must deny access.
3. Sign in with securely provisioned password. The new repository starts empty; after the authorized private import, confirm ten unreviewed, unsent records and consent review gate.
4. Create a clearly labeled test record, save, reload. Stop and restart the app without replacing its volume; confirm the edit survives, then remove that test record.
5. Confirm cookie is HttpOnly, Secure and SameSite Strict; log out and confirm protected API access is denied again.
6. Export records backup and verify a safe restore process before storing important operational data.

No password, live token, or session cookie should be pasted into ordinary chat or committed to source. If secure credential provisioning is not available, leave the app unconfigured/fail-closed and report the exact remaining action. A healthcheck returning 200 alone is not evidence of secure setup or persistence.
