# 08 — Validation report

## Method and limitations

Validation used the repository's Bun lockfile through the temporary `bun` npm runner because Bun was not globally installed; Node was v22.20.0. There is a `bun.lock` but no npm package-lock, so `npm ci` cannot use the repository lockfile. The successful install used `bun install --frozen-lockfile`; it reported 542 packages installed. **UNVERIFIED:** exact locked package integrity beyond the install tool's result; production runtime versions/configuration. [Lock/manifests](../../package.json#L1-L15) · [test/build scripts](../../package.json#L5-L13)

The initial `npm install --no-package-lock` attempt failed with an npm internal `edgesOut` error; no package manifest/lockfile was intentionally changed. A subsequent locked Bun install completed. Install also emitted transient connection-closed download retries, then completed successfully. These are terminal observations; no package-manager output file is committed.

## Results

## Follow-up validation (6 Nov 2026)

After the original audit, `npm run lint` passes with 0 errors and 0 warnings; CI now treats lint as blocking. `npm test` passes 23 tests across 4 files, the workspace TypeScript check passes, `drizzle-kit check` passes locally, and `npm run build` succeeds. The user confirmed the localhost auth issue is resolved after Node system-CA support was persisted in the `dev` script. These checks do not validate the remote Supabase database or a hosted deployment.

The owner reports manually applying migrations 0005 and 0006. This was not independently verified; local project references match the checked-in Supabase project ID, but the local migration URL currently has scheme `https` and cannot be used by Drizzle. The Drizzle history must be checked/reconciled before running future migrations. See the [production readiness runbook](../operations/production-readiness.md).

The table below records the **initial audit baseline**, not the latest follow-up run.

| Check | Result | Notes |
|---|---|---|
| Install | **PASS** | Frozen install from `bun.lock`; 542 packages. The package manifest has build/lint/test scripts; no `typecheck` script. [Manifest](../../package.json#L5-L13) |
| Production build | **PASS** | `npm run build`, exit 0 after the follow-up changes. Vite/TanStack Start emitted `.output/server` SSR bundles and Cloudflare/Nitro metadata. Remaining non-fatal notices are the `vite-tsconfig-paths` redundancy and Nitro's ignored `inlineDynamicImports` option. [Build script](../../package.json#L5-L13) · [Vite config](../../vite.config.ts#L1-L13) |
| TypeScript | **PASS** | Ran `node node_modules/typescript/bin/tsc --noEmit`, exit 0. `tsconfig` sets `strict: true`, `noEmit: true`; type-check is not exposed as an npm script. [tsconfig](../../tsconfig.json#L1-L34) |
| ESLint | **FAIL at initial audit; now PASS** | Initial run found 1,774 formatting errors and 7 Fast Refresh warnings. Follow-up run is clean, and CI lint is blocking. [Lint script](../../package.json#L5-L13) · [ESLint config](../../eslint.config.js#L1-L40) · [CI](../../.github/workflows/ci.yml#L1-L30) |
| Unit/routing tests | **PASS** | Initial baseline: 3 files/21 tests. Current follow-up: 4 files/23 tests passed. Coverage is still unit/routing-only; no hosted database/browser E2E tests are present. [Test script](../../package.json#L5-L13) · [test tree](../../src/test/) |
| Migration journal | **PASS** | `drizzle-kit check` reported the journal/migrations are consistent. This is a local structure check only; it does not apply or validate SQL against the remote database. [Journal](../../drizzle/migrations/meta/_journal.json#L1-L39) · [migration 0005](../../drizzle/migrations/0005_security_limits_and_staff_activation.sql#L1-L196) |
| Git history | **NOT AVAILABLE** | Workspace had no `.git` metadata, so `git log`/remote/status could not be collected; chronology beyond numbered SQL migrations is **UNVERIFIED**. [AGENTS.md](../../AGENTS.md#L9-L18) |

The initial build emitted non-fatal notices that `vite-tsconfig-paths` is redundant in Vite 8 and that Nitro ignores `inlineDynamicImports` while code splitting is enabled. The warning locations below are from the initial audit; the current follow-up lint run is clean.

### Initial ESLint warning locations (resolved or allow-listed)

- [src/components/ui/badge.tsx](../../src/components/ui/badge.tsx#L32)
- [src/components/ui/button.tsx](../../src/components/ui/button.tsx#L49)
- [src/components/ui/form.tsx](../../src/components/ui/form.tsx#L163)
- [src/components/ui/navigation-menu.tsx](../../src/components/ui/navigation-menu.tsx#L111)
- [src/components/ui/sidebar.tsx](../../src/components/ui/sidebar.tsx#L743)
- [src/components/ui/toggle.tsx](../../src/components/ui/toggle.tsx#L42)
- [src/lib/auth.tsx](../../src/lib/auth.tsx#L125)

## Source audit: TODOs, mocks, dead code, keys

- The source scan found no `TODO`/`FIXME` markers. It did find deliberate seeded sample customers/vehicles/orders called on signup. [Seed data](../../drizzle/migrations/0001_shopos_business_functions.sql#L1-L54) · [signup trigger](../../drizzle/migrations/0001_shopos_business_functions.sql#L56-L82)
- A local import-string scan found no references from other `src/**/*.ts(x)` files to these generated UI primitives; treat them as **likely unused, not proven dead code**, because alias/relative/dynamic usage can evade a simple text scan: [accordion.tsx](../../src/components/ui/accordion.tsx), [alert-dialog.tsx](../../src/components/ui/alert-dialog.tsx), [alert.tsx](../../src/components/ui/alert.tsx), [aspect-ratio.tsx](../../src/components/ui/aspect-ratio.tsx), [avatar.tsx](../../src/components/ui/avatar.tsx), [badge.tsx](../../src/components/ui/badge.tsx), [breadcrumb.tsx](../../src/components/ui/breadcrumb.tsx), [calendar.tsx](../../src/components/ui/calendar.tsx), [card.tsx](../../src/components/ui/card.tsx), [carousel.tsx](../../src/components/ui/carousel.tsx), [chart.tsx](../../src/components/ui/chart.tsx), [collapsible.tsx](../../src/components/ui/collapsible.tsx), [command.tsx](../../src/components/ui/command.tsx), [context-menu.tsx](../../src/components/ui/context-menu.tsx), [drawer.tsx](../../src/components/ui/drawer.tsx), [dropdown-menu.tsx](../../src/components/ui/dropdown-menu.tsx), [form.tsx](../../src/components/ui/form.tsx), [hover-card.tsx](../../src/components/ui/hover-card.tsx), [input-otp.tsx](../../src/components/ui/input-otp.tsx), [menubar.tsx](../../src/components/ui/menubar.tsx), [navigation-menu.tsx](../../src/components/ui/navigation-menu.tsx), [pagination.tsx](../../src/components/ui/pagination.tsx), [popover.tsx](../../src/components/ui/popover.tsx), [progress.tsx](../../src/components/ui/progress.tsx), [radio-group.tsx](../../src/components/ui/radio-group.tsx), [resizable.tsx](../../src/components/ui/resizable.tsx), [scroll-area.tsx](../../src/components/ui/scroll-area.tsx), [sidebar.tsx](../../src/components/ui/sidebar.tsx), [slider.tsx](../../src/components/ui/slider.tsx), [table.tsx](../../src/components/ui/table.tsx), [toggle-group.tsx](../../src/components/ui/toggle-group.tsx). Confirm with a TypeScript-aware reference/dead-code tool before removal.
- WhatsApp is now simulated unless server-side `WHATSAPP_MODE=live`; simulated rows use the distinct `simulated` status and do not call Meta. [Mode gate](../../src/api/whatsapp.server.ts#L84-L112) · [DB constraint migration](../../drizzle/migrations/0005_security_limits_and_staff_activation.sql#L5-L9)
- `dvi_submit` exists in SQL but no caller was found in the scanned `src/` files; treat as likely unused until product intent is confirmed. `authenticateCronRequest` also has a definition and no in-workspace call site, so it is an **UNVERIFIED** orphan/generated helper. [DVI submit](../../drizzle/migrations/0001_shopos_business_functions.sql#L285-L295) · [cron helper](../../src/integrations/supabase/cron-auth.ts#L1-L32)
- The Drizzle TypeScript schema is explicitly blank; SQL migrations currently carry the schema definition. [Schema file](../../drizzle/schema.ts#L1) · [migration](../../drizzle/migrations/0000_shopos_core_schema.sql#L1-L4)
- Static regex scan found no hardcoded service-role/private API key value in `src/`. Browser uses only a public publishable key; server-only client reads service-role key from process environment. `.env` is now ignored and `.env.example` contains placeholders. Runtime deployment secrets and emitted bundle verification are **UNVERIFIED**. [Browser client](../../src/integrations/supabase/client.ts#L50-L74) · [server client](../../src/integrations/supabase/client.server.ts#L32-L59) · [ignore rules](../../.gitignore#L1-L18) · [example env](../../.env.example#L1-L13)
- A repository-wide automated dead-code analyzer was not configured/run. No additional unreferenced UI component finding is asserted; unused-component status beyond the candidates above is **UNVERIFIED**. [TypeScript unused checks are disabled](../../tsconfig.json#L21-L24)
- A GitHub Actions workflow was added for locked install, type-check, tests, and build. Lint is deliberately non-blocking while the existing formatting debt remains; the workflow has not yet run on GitHub. [Workflow](../../.github/workflows/ci.yml#L1-L28)

## Runtime/security checks not performed

No live database connection was used for catalog inspection, RLS policy simulation, storage bucket checks, backups, restore, or cross-tenant authorization tests. The owner reports migrations 0005–0006 were applied, but that is not independently verified. [Supabase config](../../supabase/config.toml#L1) · [RLS migration](../../drizzle/migrations/0000_shopos_core_schema.sql#L284-L359) · [follow-up migration](../../drizzle/migrations/0005_security_limits_and_staff_activation.sql#L1-L195) · [WhatsApp mode](../../src/api/whatsapp.server.ts#L84-L112)

## Questions for the owner

1. Are the SQL migrations in `drizzle/migrations` applied to the configured project, and what exact deployment tool/target executes them? [Drizzle config](../../drizzle.config.ts#L1-L10) · [Supabase config](../../supabase/config.toml#L1)
2. Is fake WhatsApp mode allowed in any deployed environment, or should missing credentials fail closed? [Fallback code](../../src/api/whatsapp.server.ts#L86-L96)
3. Should DVI submission be a separate workflow (`dvi_submit`) or is direct send intended? [SQL function](../../drizzle/migrations/0001_shopos_business_functions.sql#L285-L318) · [inspection UI](../../src/components/ro/InspectionPanel.tsx#L95-L109)
4. Are Git history, CI workflows, backups, staging configuration, and production security controls maintained outside the supplied folder? These are **UNVERIFIED** from the workspace. [Workspace scripts](../../package.json#L5-L13) · [Supabase config](../../supabase/config.toml#L1)
