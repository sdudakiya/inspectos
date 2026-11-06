# ShopOS production-readiness runbook

This runbook separates repository work from Supabase/Cloudflare/GitHub account work. Never paste database passwords, service-role keys, or customer data into chat or commit them.

## Current repository status (6 Nov 2026)

- Local development now launches Node with `--use-system-ca` through the `dev` script. This fixes the local certificate-chain issue without disabling TLS verification.
- ESLint is clean locally, and CI now fails on lint errors. The React Refresh rule is an error; its allow-list contains only the intentional helper exports in the shared Radix wrappers.
- The current test suite (23 tests), TypeScript check, migration-journal check, and production build pass locally.
- The checked-in Supabase project reference matches the local project identifiers. The local `LOVABLE_DB_MIGRATION_URL` is still an HTTPS URL, not a PostgreSQL connection URI, so `db:migrate` cannot safely be used until it is replaced locally with the connection string from the Supabase Dashboard.
- The owner reports applying migrations 0005 and 0006 in the SQL Editor. The remote schema and Drizzle migration ledger have not been independently queried.

## 1. Choose and maintain one migration history

**Recommendation: use Drizzle SQL migrations as the canonical source going forward.** The numbered SQL files are already in `drizzle/migrations`, and `npm run db:migrate` is already configured.

1. In Supabase, verify the project reference in the Dashboard matches `supabase/config.toml` before running any database operation.
2. In the local ignored `.env`, replace `LOVABLE_DB_MIGRATION_URL` with the PostgreSQL URI copied from Supabase **Connect → Direct connection** (or session pooler if the network cannot reach direct IPv6). Require TLS with `sslmode=require`. Do not use the HTTPS Project URL, and do not share the URI.
3. Because 0005 and 0006 were reportedly run manually, first inspect the Drizzle history table read-only:

   ```sql
   SELECT id, hash, created_at
   FROM drizzle.__drizzle_migrations
   ORDER BY created_at;
   ```

4. Compare the returned entries with `drizzle/migrations/meta/_journal.json`. Do **not** run `npm run db:migrate` until the manually applied migrations are represented in that history. If the history is missing or incomplete, use a reviewed reconciliation procedure against the exact SQL-file hashes and journal timestamps; do not blindly insert guessed values or rerun non-idempotent migration 0005.
5. For each future change, add a numbered Drizzle migration, apply it to staging first with `npm run db:migrate`, verify it, then promote the same commit/migration to production. Avoid manual SQL except for an incident, and reconcile any emergency manual change immediately.
6. Add a clean-database bootstrap check to release validation so a fresh staging project can be built from the full migration sequence.

The local migration URL currently fails step 2; no remote query or migration was run by this work session.

## 2. Separate staging and production

1. Create a distinct Supabase project and hosting environment for staging; never point staging at production data.
2. Bind separate environment variables/secrets to each deployment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Keep the service-role key server-only. Add a separate migration URI only to the protected migration job.
3. Use synthetic customer, vehicle, repair-order, and staff data in staging. Disable live WhatsApp there; keep the existing mock default.
4. Require the existing CI workflow to pass before deployment. Add protected GitHub Environments (at minimum staging and production), require approval for production, and scope deployment secrets to the matching environment.
5. Confirm the actual hosting account/domain and deployment command before adding an automated deploy job; the build currently emits a Cloudflare-compatible Nitro bundle, but this repository does not prove which account or domain is deployed.

## 3. Backups and restore drills

1. In the Supabase Dashboard, confirm the project's plan, automated backup schedule, retention window, and whether point-in-time recovery is available.
2. Record an owner and alert path for failed/missed backups. Include database and private `dvi-media` storage objects in the recovery plan; database-only restore does not restore object files.
3. At a defined interval, restore a backup into an isolated recovery/staging project—not over production—and verify logins, RLS, repair orders, DVI media, and portal behavior.
4. Record restore duration and data-loss window, then update the recovery procedure. Do not claim backups are tested based only on a dashboard “success” status.

## 4. Monitoring and proxy headers

1. Configure hosting/Cloudflare and Supabase Auth/Postgres logs, error alerts, uptime checks, and an owner/on-call contact. Alert on repeated auth failures, server errors, rate-limit RPC failures, webhook failures, and backup failures; avoid logging access tokens, signatures, or customer payloads.
2. The rate limiter reads `cf-connecting-ip`, then `x-real-ip`/`x-forwarded-for`. If the origin is Cloudflare, restrict direct origin access to Cloudflare and ensure the edge overwrites/strips client-supplied forwarding headers. Otherwise, trust only the hosting provider's documented client-IP header. Never treat arbitrary `X-Forwarded-For` as authoritative.
3. Verify from a staging request that the recorded rate-limit subject uses the real client IP and cannot be changed by adding a forged forwarding header.

## 5. Privacy, terms, retention, and deletion

These require product-owner decisions and legal review; do not publish invented legal promises. Before implementation, decide:

- Applicable countries/states, legal entity, contact address, and who is controller/processor.
- Retention periods and deletion rules for customer/vehicle records, repair orders, photos, signatures, consent records, audit events, IP addresses, and user-agent strings.
- Whether repair/audit records may be anonymized instead of deleted for accounting, safety, or legal-hold reasons.
- Who may request/export/delete data, how identity is verified, response deadlines, and how backups age out.
- WhatsApp opt-in/opt-out language, customer portal consent wording, subprocessors, and breach/contact procedures.

After approval, implement public Privacy and Terms pages plus authenticated, shop-scoped export/deletion workflows and audit logging. Test them with synthetic data before production.

## 6. Hosted acceptance tests

Run against staging only, with two synthetic shops and separate users. Keep production customer records out of the test set.

- Sign in/out, refresh an expired session, password reset, and verify a valid session can load the user's own shop/profile.
- Create a repair order in Shop A; verify Shop B cannot find it through the board, search, detail route, server functions, Realtime, or direct Supabase API/RLS queries.
- Exercise status guards, technician/bay assignment, DVI submit/send, portal token validity/expiry, approval/rejection, duplicate/partial decisions, and replay.
- Confirm rate limits fail closed if the RPC is unavailable and behave correctly behind the real proxy.
- Confirm WhatsApp remains simulated and no Meta request is made in staging.
- Save sanitized evidence (test IDs/results, not tokens or personal data) and rerun after migrations or auth/RLS changes.

No hosted acceptance test has been performed from this local workspace; it needs the staging URL and synthetic test accounts.
