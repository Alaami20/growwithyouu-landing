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
2. Create and verify the CEO account; disable public signups. Configure the exact account ID and verified email using the server environment variables in `.env.example`. Complete TOTP enrollment on first login.
3. Configure server-only Supabase credentials and the exact `ADMIN_ORIGIN`. Never put service credentials in Vite client variables.
4. Install a GitHub App on selected repositories with read permissions for metadata, contents, issues, pull requests and Actions. Optional protection/security views need their corresponding read permissions. Configure the installation, private key and authorized repository-to-project map.
5. Set a webhook secret and subscribe the App to relevant repository activity at `/api/github-webhook`. Configure an authenticated scheduler to call `/api/reconcile` with `Authorization: Bearer <CRON_SECRET>` at least hourly. No scheduler is provisioned by this branch. A call processes at most three jobs; increase scheduler frequency if backlog grows.
6. Run the test suite and production build. On a staging deployment, verify unauthorized requests fail; CEO MFA works; record changes and stale writes behave correctly; signed webhook delivery queues and reconciles; and another user cannot read the database.
7. Import verified team and roadmap data through the dashboard or a reviewed migration. This checkout does not include the previously described roster/roadmap import. Do not claim those records exist in production.

## Remaining scope

Public website content editing and rollback, real organization-chart visualization, marketing platform synchronization/publishing, analytics, billing, Drive recruitment import/CV access, provider connections, App Store integration and automated reports are not implemented. Campaigns and finances currently use manual records. There is no production deployment verification, no external GitHub write operation and no real-money trading capability.

Snapshot counts describe fetched records, not all-time contribution totals. Work quality and hours are not inferred from commits. Reports export the loaded sample (1,000 rows per operational table, 100 audit events).
