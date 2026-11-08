# CEO Command Center

The dashboard uses server-side email/password authentication and private Vercel Blob storage. No external identity service, SQL database or email-code delivery service is required.

## Production setup

1. In the existing Vercel project, open Infrastructure/Storage and create a **Private** Blob store connected to **Production only**. Enable the read/write token environment variable, named `BLOB_READ_WRITE_TOKEN`. Do not create a public store. The runtime rejects public blob responses.
2. Keep `CEO_VERIFIED_EMAIL=alaamiari@growwithyouu.com` and `ADMIN_ORIGIN=https://growwithyouu.com`. The server refuses to configure any other allowed email.
3. The application automatically creates a cryptographically random session signing key in private storage on first login. Optionally override it with `ADMIN_SESSION_SECRET`, a Vercel **Secret** containing at least 32 random characters. Do not reuse the login password.
4. Run `node scripts/hash-admin-password.mjs` in a local interactive terminal and enter the desired password privately. Save the resulting `ADMIN_PASSWORD_HASH` as a Vercel **Secret**. Alternatively, the owner can enter `ADMIN_PASSWORD` directly as a masked Vercel **Secret**. A configured hash takes precedence. No production password belongs in this repository, an issue, a screenshot, a log, or a browser bundle.
5. Redeploy after configuring the environment. Open `/admin`, sign in, create a test member, edit it, and verify it persists after a refresh and a subsequent deployment. Verify the audit entry and stale-write conflict. Sign out everywhere, then verify the old cookie cannot access private APIs. Login and actual storage operations must be verified before claiming activation.

New storage initializes with three projects (GrowWithYouu, TripFly and Crypora), empty members and work records, and explicit unconnected integration states. There is no fabricated team roster or activity. Existing data from an earlier provider is not automatically migrated or deleted; export it privately and review an import if any exists.

## Authentication

Only the configured company email and environment password can sign in. No signup, password-reset or email-delivery endpoint exists. The previous email OTP and mandatory authenticator flow has been removed at the owner's request; possession of the correct password is now the sign-in requirement.

Sessions last eight hours and use HMAC signatures with Secure, HttpOnly, SameSite=Strict host-only cookies. Password or signing-key rotation invalidates old sessions. Sign out everywhere increments a persistent revocation epoch. Origin checks protect mutations. API calls are limited to 120 per session per minute. Login attempts are limited to five per client and thirty globally per fifteen minutes, across server instances. Temporary lockouts can affect the owner too. IP addresses are stored only as HMAC-derived identifiers in expiring rate windows. Storage errors fail closed.

Passwords support salted scrypt hashes. Choosing a very short numeric password remains easy to guess despite throttling; a longer password is recommended.

## Durable records

All operational data, GitHub snapshots and audit history live in a private Blob object; security budgets and the session epoch use a separate private object. Reads bypass cached versions. Writes use ETag preconditions, retry concurrent changes, and commit edits with audit entries together. An unavailable or incorrectly configured store never falls back to temporary function files or browser storage.

Records validate member/project references, reject reporting cycles and duplicate assignments, and require row versions for edits. The dashboard loads the first 1,000 records per table and the newest 100 audit events. Storage rejects documents larger than 20 MiB instead of silently discarding history. This compact store is intended for a small single-owner workspace, not high-throughput analytics; private storage operations consume Vercel usage allowances. Export and archive records before reaching capacity. Never connect previews to the production store.

## GitHub integration

Set the optional values from `.env.example`: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_INSTALLATION_ID`, `GITHUB_WEBHOOK_SECRET`, authorized repository-to-project JSON `GITHUB_PROJECT_MAP`, and `CRON_SECRET`. Use selected-repository read permissions for metadata, contents, pull requests, issues and Actions. Optional protection/security views need the corresponding read permissions.

Point signed webhooks to `/api/github-webhook`. Deliveries deduplicate and queue durably. Configure an authenticated scheduler to call `/api/reconcile` with exactly `Authorization: Bearer <CRON_SECRET>`. A call processes at most three jobs with expiring leases and retry backoff; terminal failures are visible in the GitHub view. No scheduler or GitHub App is provisioned by the code itself. Counts describe fetched samples and a reporting window, not all-time work quality or hours.

## Validation and scope

Run `npm test`, `npm run build` and `git diff --check`. Tests cover password and signed session verification, wrong-account denial, expiry, global logout, cross-origin denial, persistent throttling across handler instances, storage failures, private-only storage, conditional write conflicts, atomic audit history, references/cycles, queue deduplication, lease recovery and GitHub summarization.

Included views support members, reporting assignments, tasks, milestones, campaigns, manual finance records, manual applications, audit logs and JSON report exports. Public website design and routes are preserved.

Remaining work: public website content editing/rollback, graphical organization chart, live marketing publishing/metrics, analytics, billing, Drive recruitment import/CV access, provider connections, App Store integration, automatic reports and verified roster/roadmap import. These remain explicitly unconnected or manual; no end-to-end completion is implied by a successful build. No real-money cryptocurrency trades are supported or performed.

## Workspace redesign review — 8 November 2026

This branch isolates private dashboard CSS in a Shadow DOM, lazy-loads its JavaScript,
adds a fixed scrolling sidebar, searchable/collapsible navigation, mobile drawer,
sticky top bar and light/dark preference. Logout is in Settings. Organization Chart
uses React Flow and Dagre with saved manager edges, pan/zoom, fit, minimap,
collapse/expand and profile editing. The existing member table remains available.
No imported roster or fabricated integrations are included. Public page markup and
styles are preserved; the public bundle no longer eagerly loads dashboard code.

The Blob write fix obtains the authoritative conditional-write ETag with `head`
before downloading the body. Regression coverage verifies mismatched download/API
ETags, atomic audits and stale-edit protection. This addresses the observed edit
conflict, but requires a live save/reload verification after an approved deployment.

Validation: `npm test` 18/18; `npm run build` passes. Vite reports dependency
`use client` directive warnings; this application renders in the browser.
Browser checks of authenticated redesigned pages, all six viewport widths,
light/dark screenshots and full feature acceptance are still pending.

Remaining work from the overhaul brief: richer dashboard analytics; advanced
member table controls; verified private team import; calendar; recruitment pipeline;
finance summaries; editorial draft/publish/rollback; additional engineering views;
source-backed charts and exports. Existing manual record editors continue to work.
GitHub App keys, installation/repository mappings, signed webhook and authenticated
scheduler configuration must still be supplied in provider dashboards. Analytics,
billing and automated Drive imports remain unavailable until actually connected.
The redesign must remain a review PR until explicit production approval.
