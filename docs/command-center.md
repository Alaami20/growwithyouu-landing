# CEO Command Center

Implementation branch: `feat/ceo-command-center`. This is a backend-dependent implementation, not a production activation.

## Included

- White `/admin` workspace with project filters, tasks, milestones, campaigns, finance records, members, reporting lines and assignments.
- Server-verified CEO user ID, verified email and MFA; memory-only browser sessions.
- Database isolation, server-side validation, rate limiting, atomic audit history and optimistic edit conflicts.
- Selected-repository GitHub App integration, HMAC-verified webhook ingestion, deduplicated delivery queue, retry/recovery worker and cached repository snapshots.
- Contributor evidence, fetched-sample counts, CI runs, releases and explicit pagination limits.

## Activation

1. Provision Supabase and apply `database/001_command_center.sql`, then `database/002_github_sync.sql` as database owner.
2. Create and verify the CEO account; disable public signups. Configure the exact account ID and verified email using the server environment variables in `.env.example`. Configure the Magic Link email template to include `{{ .Token }}` so it sends a numeric code rather than a link. Enable email OTP and production SMTP delivery for the pre-created CEO account; the client sets `shouldCreateUser: false`. Complete TOTP enrollment after the email-code verification on first login. No password is required by the dashboard.
3. Configure server-only Supabase credentials and the exact `ADMIN_ORIGIN`. Never put service credentials in Vite client variables.
4. Install a GitHub App on selected repositories with read permissions for metadata, contents, issues, pull requests and Actions. Optional protection/security views need their corresponding read permissions. Configure the installation, private key and authorized repository-to-project map.
5. Set a webhook secret and subscribe the App to relevant repository activity at `/api/github-webhook`. Configure an authenticated scheduler to call `/api/reconcile` with an HTTP Authorization header containing the configured `CRON_SECRET`, at least hourly. No scheduler is provisioned by this branch. A call processes at most three jobs; increase scheduler frequency if backlog grows.
6. Run the test suite and production build. On a staging deployment, verify unauthorized requests fail; CEO MFA works; record changes and stale writes behave correctly; signed webhook delivery queues and reconciles; and another user cannot read the database.
7. Import verified team and roadmap data through the dashboard or a reviewed migration. This checkout does not include the previously described roster/roadmap import. Do not claim those records exist in production.

### Verified implementation evidence

- The server auth guard now parses only a Bearer authorization header and fails closed before any database access when required configuration is missing.
- `npm test` passes all 11 tests, including email-code sign-in, MFA claims, rejection of other identities, RLS isolation, audit history, stale-write conflicts, signed webhook verification and GitHub activity summarization.
- `npm run build` passes and preserves the public Vite website routes.
- GitHub synchronization failures are returned from the private GitHub endpoint and displayed in the dashboard with repository, event, attempt count and error details.

### Remaining production verification

This checkout cannot verify live login or data operations without authorized access to the production Supabase, Vercel and GitHub App accounts. The production hostname was not DNS-resolvable from the verification environment, so no claim is made that the live deployment is activated.

1. In Vercel, open the production project settings and add every variable in `.env.example` under **Settings → Environment Variables → Production**. Keep `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` and `CRON_SECRET` server-only; do not prefix any with `VITE_`. Confirm `CEO_VERIFIED_EMAIL=alaamiari@growwithyouu.com` and `ADMIN_ORIGIN=https://growwithyouu.com`.
2. In Supabase **Authentication → Providers → Email**, enable email OTP, disable public sign-ups, configure production SMTP, and set the email template to include `{{ .Token }}`. Create and verify only the CEO user, then set its UUID as `CEO_USER_ID`. Enroll and verify a TOTP factor on first sign-in.
3. In the Supabase SQL editor, run `database/001_command_center.sql` and then `database/002_github_sync.sql` as database owner. Confirm the tables, functions, RLS policies and seed projects exist.
4. Install the GitHub App only on the selected repositories, set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_INSTALLATION_ID`, and a JSON `GITHUB_PROJECT_MAP`. Configure the App webhook URL as `https://growwithyouu.com/api/github-webhook`, use the same `GITHUB_WEBHOOK_SECRET`, and subscribe to repository activity.
5. Configure an authenticated hourly scheduler for `https://growwithyouu.com/api/reconcile` with an HTTP Authorization header containing `CRON_SECRET`. Review failed jobs in the GitHub dashboard after intentionally sending a signed test webhook.
6. After redeploying, verify: another Supabase account receives a 403; the CEO requires both the email code and TOTP; unauthenticated API calls fail; create/update/stale-update behavior produces audit rows and a 409 conflict; webhook deliveries deduplicate; and contributor, PR, CI, release and unavailable-integration states are visible.
7. Deploy only after those checks pass, then verify `/`, `/admin`, `/api/admin/config`, `/api/admin/data`, `/api/admin/github` and `/api/reconcile` from the production origin. Never execute real-money crypto trades.

## Remaining scope

Public website content editing and rollback, real organization-chart visualization, marketing platform synchronization/publishing, analytics, billing, Drive recruitment import/CV access, provider connections, App Store integration and automated reports are not implemented. Campaigns and finances currently use manual records. There is no production deployment verification, no external GitHub write operation and no real-money trading capability.

Snapshot counts describe fetched records, not all-time contribution totals. Work quality and hours are not inferred from commits. Reports export the loaded sample (1,000 rows per operational table, 100 audit events).
