# Green Shield · Outreach workspace

Portable, server-backed Next.js CRM for a small, private outreach workflow. This app is separate from the Green Shield marketing website. It is not a static export and needs a persistent Node.js server.

## What works
- Password sign-in; server-side sessions; protected records and backup APIs.
- Editable companies, organization types, contacts, source URLs and fit notes.
- Draft subject, body and follow-up; review status, approver and review date.
- Manual sent/reply/stage/follow-up/sample/requirements records.
- JSON backup export; CSV summary export; import **new IDs only**, without overwriting edits.
- Server-side JSON storage, synchronous serialized mutations within one process, fsync plus atomic rename, and revision conflict checks.
- The repository starts **empty**, with no prospect data. A separate private import file contains the ten researched prospects and revised, unreviewed drafts; load it only through the authenticated import screen after secure setup. It is deliberately not committed to this project.

There is **no email sending, mailbox sync, scheduled follow-up, automated scraping, or assistant connection**. A “Sent” stage is a manual record, not delivery evidence. A future assistant integration needs a separately authorized authenticated connection.

## Local review
Requirements: Node.js 24+, npm.

```sh
npm ci
npm run setup       # creates .env.local; prints a generated password once
npm run dev         # localhost:3000 only
```

Save the generated password in a password manager. `.env.local` stores only a salted scrypt password hash, not the plaintext password. Setup refuses to overwrite an existing file. Never commit credentials, local data, or exports.

```sh
npm run check       # tests, TypeScript, production build
npm run build
npm start           # production server on localhost:3000
```

For a reverse-proxy local review set `CRM_PUBLIC_ORIGIN` to the exact visible origin without a trailing slash, then restart. `CRM_COOKIE_SECURE=false` is for local HTTP only.

## Protected Coolify preview
Use the included Dockerfile from the new GitHub repository (public source permitted; private data excluded). See [DEPLOYMENT.md](DEPLOYMENT.md). Required runtime variables:

| Variable | Value / purpose |
| --- | --- |
| `CRM_PASSWORD_HASH` | Secret salted scrypt hash: 32 lowercase hex salt, colon, 128 lowercase hex hash. Generate with setup, then transfer securely. |
| `CRM_DATABASE_PATH` | `/app/data/crm.json` |
| `CRM_PUBLIC_ORIGIN` | Exact external HTTPS origin, e.g. `https://greenshield.vavqo.com` |
| `CRM_COOKIE_SECURE` | `true` |

Run **exactly one Node process and one container**, with **stop-before-start / recreate**, never overlapping old and new instances. Mount persistent storage at `/app/data`, writable by UID/GID 1000. This JSON store does not coordinate multiple processes or replicas. For concurrent workers, multiple replicas, stronger reporting, or materially larger usage, migrate to a transactional database.

## Security and honest limitations
- One shared administrator password, not individual users, MFA, role-based access, or per-person audit attribution.
- Sessions are random tokens, hashed in the datastore, expire after 12 hours, and use HttpOnly / SameSite Strict / Secure cookies on HTTPS.
- Password changes invalidate existing sessions. Global persisted login throttling permits ten attempts per 15 minutes; a hostile actor can temporarily deny login. Add reverse-proxy rate limiting/private network restrictions where possible.
- Authenticated mutations require an exact Origin match. API responses are not cached. No third-party scripts or analytics.
- Unconfigured authentication fails closed: records/backup/import are inaccessible. `/api/health/` still reports process health and whether authentication is configured; it never exposes records or secrets.
- The file is not encrypted at rest. Infrastructure administrators can read it. Secure the volume and host, keep backups private, and limit access.
- Atomic writes protect against partial replacement, **not** volume loss, filesystem failure, multiple writers, or bad manual edits. A persistent volume is not a backup.
- Maximum 2,000 records, 4 MiB per import request, 60,000 characters per field. Small-workspace design; full-file reads/writes are not appropriate for high throughput.
- All prospect research and legal/commercial fit require review. Published email addresses do not establish marketing consent or buyer acceptance.

## Backup, restore and updates
Use **Export backup** for portable records-only JSON. This omits sessions and infrastructure secrets. Imports add only previously unseen IDs; an import is not an overwrite/restore operation.

For a full server restore: stop the app, preserve the current volume, restore a trusted whole `crm.json` file with owner 1000 and mode 0600, then restart and verify. Full server files contain session hashes and should be handled as sensitive. Keep versioned backups outside the application volume and test restoration. Do not overwrite an existing datastore with the bundled seed: seeding occurs only when the file is absent.

To rotate the password: in a separate private temporary directory run a copy of `scripts/setup.mjs`; transfer only its newly generated hash into the server runtime secret, retain the new password securely, then restart. Do not replace `CRM_DATABASE_PATH`, the volume, or records. Never put secret values in a source repository or Dockerfile.

## Source and verification
The separately supplied private research import was prepared on 30 October 2026; it was not newly re-verified by this app. Drafts are not approved outreach. See [VERIFICATION.md](VERIFICATION.md) for the actual checks and remaining deployment checks.
