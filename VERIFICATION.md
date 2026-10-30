# Verification — 30 October 2026

## Passed locally
- 28 automated tests: datastore persistence across fresh store instances, atomic writes, file permissions, concurrent revision conflict protection, safe new-ID import, corruption fail-closed behavior, session expiry/rotation, persisted login throttling, 2,000-record total limit, input validation, safe URLs, CSV formula escaping, approval invalidation after draft edits, and empty repository seed.
- TypeScript check and optimized Next.js production build.
- `npm audit --omit=dev`: zero reported vulnerabilities at check time (not a security guarantee).
- Browser review: authenticated workspace, all ten private research records loaded from the separately held local datastore; create/save a clearly marked QA record; actual managed-server stop/restart; record and session persisted after restart.
- Unauthenticated protected-record API returned an access-denied message before sign-in.
- Private import independently validated: ten stable unique IDs, 16 source URLs, all Draft / Not reviewed, actual sender/sent/reply fields blank, revised call-first drafts with confirmed signature, no 20-tonne opening ask.

## Scope and remaining checks
- This is a single-administrator protected preview, not a penetration-tested production CRM. It is not multi-user or automatically connected to an assistant/mailbox.
- Local QA record remains in the local test datastore only. It is excluded from the repository and private import.
- Responsive CSS is implemented. Desktop browser reviewed; a real-phone interaction pass remains useful.
- Docker configuration is supplied; deployment image build, TLS, cookie flags, persistent-volume permissions and restart survival must be verified on the actual Coolify host before calling the hosted preview ready.
- Repository has an empty seed. Private prospect import and local runtime data are intentionally excluded from source and image.
- UI deletion cleanup was not performed because a no-deletion restriction was reported by action review. Unit tests of deletion use isolated temporary fixtures only.
