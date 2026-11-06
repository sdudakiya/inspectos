# 02 — How the app was built

## Evidence limitation

**UNVERIFIED:** There is no `.git` directory in the provided workspace, so `git log`, branch, remote, and Lovable commit sequence could not be obtained. The current files cannot prove the historical order in which the UI was authored. `AGENTS.md` says the app was rebuilt from a Vue/Express project and warns that pushes sync to Lovable; the `.lovable/project.json` contains a template/revision identifier, not commit history. [AGENTS.md](../../AGENTS.md#L1-L18) · [.lovable/project.json](../../.lovable/project.json#L1-L5)

The sequence below is therefore a **logical reconstruction**, inferred from numbered SQL migrations, route/component dependencies, and roadmap checkboxes—not a claim about actual commit chronology. [roadmap.md](../../roadmap.md#L1-L16) · [migration files](../../drizzle/migrations/0000_shopos_core_schema.sql#L1-L4)

## Reconstructed implementation phases

| Likely phase | What was introduced | Evidence and connections |
|---|---|---|
| 1. Project scaffold | Lovable TanStack Start template; Vite preset, React/TypeScript, Tailwind, file routing, QueryClient, shadcn UI aliases/components. | [README](../../README.md#L20-L29) · [Vite config](../../vite.config.ts#L1-L13) · [router](../../src/router.tsx#L1-L16) · [shadcn config](../../components.json#L1-L22) |
| 2. Core multi-shop schema | 19 application tables, `app_role`, constraints/indexes, timestamps, role/permission helpers, RLS, `board_orders` view, Realtime publication. | [Core migration](../../drizzle/migrations/0000_shopos_core_schema.sql#L1-L379) |
| 3. Signup and shop bootstrap | Auth-user trigger checks `staff_invites`; otherwise creates tenant, shop, profile, owner role and calls `seed_shop(..., true)`; seeds pipeline, bays, vendors, DVI template, and sample orders. | [Seed function](../../drizzle/migrations/0001_shopos_business_functions.sql#L1-L54) · [signup trigger](../../drizzle/migrations/0001_shopos_business_functions.sql#L56-L82) |
| 4. Core transactional operations | `quick_add_order`, guarded `transition_order`, bay/technician assignment, archive, WhatsApp consent, DVI start/submit/send, token resolution and approval. Later migration `0004` replaces transition logic with DVI/technician/bay guards. | [Business functions](../../drizzle/migrations/0001_shopos_business_functions.sql#L84-L340) · [transition revision](../../drizzle/migrations/0004_transition_guards_tech_bay_dvi.sql#L1-L92) |
| 5. Auth and application shell | Email/password, signup, reset email, Google and Lovable OAuth controls; auth context loads profile/role/shop; `_authenticated` layout checks session, renders nav, signs out. | [Login/signup](../../src/routes/index.tsx#L13-L81) · [auth context](../../src/lib/auth.tsx#L23-L96) · [protected layout](../../src/routes/_authenticated/route.tsx#L8-L68) |
| 6. Shop floor workflows | Live status board, search/filter, check-in dialog, order detail, transition dialog, bay occupancy view. The data helpers centralize queries and Realtime invalidation. | [Board](../../src/routes/_authenticated/board.tsx#L15-L116) · [check-in](../../src/components/board/QuickAddDialog.tsx#L48-L151) · [transition dialog](../../src/components/board/TransitionDialog.tsx#L15-L104) · [query/realtime layer](../../src/lib/shop-data.ts#L16-L95) |
| 7. DVI and customer portal | Technician findings/photos, photo annotation, token link, customer decisions/signature/consent. SQL stores a hash and expiry for portal token; service functions resolve and authorize it. | [Inspection UI](../../src/components/ro/InspectionPanel.tsx#L31-L150) · [photo markup](../../src/components/ro/PhotoMarkupDialog.tsx#L1-L136) · [portal UI](../../src/routes/portal.$token.tsx#L9-L192) · [portal SQL](../../drizzle/migrations/0001_shopos_business_functions.sql#L297-L339) |
| 8. Messaging/integrations | WhatsApp templates, opt-in and milestone/manual requests, explicit mock status by default, opt-in Meta Cloud API path, callback webhook with HMAC signature and deduplication. | [templates](../../src/lib/whatsapp-templates.ts#L1-L91) · [sender](../../src/api/whatsapp.server.ts#L20-L115) · [webhook](../../src/routes/api/public/webhooks/whatsapp.ts#L1-L95) |
| 9. Settings and follow-up controls | Shop details/feature flags, pipeline conditions, bays/vendors, staff activation/invites; SQL migration sequence adjusts unique ordering and function grants/guards. | [Settings](../../src/routes/_authenticated/settings.tsx#L20-L275) · [migration 0002](../../drizzle/migrations/0002_pipeline_step_order_not_deferrable.sql#L1-L2) · [migration 0003](../../drizzle/migrations/0003_revoke_anon_helpers.sql#L1-L2) |

## Explicit migration chronology (not Git chronology)

1. `0000_shopos_core_schema.sql`: enum/tables/indexes/triggers/helper functions/grants/RLS/view/Realtime. [Lines 1–379](../../drizzle/migrations/0000_shopos_core_schema.sql#L1-L379)
2. `0001_shopos_business_functions.sql`: sample seed and auth trigger, transactions, token portal, function grants, storage policies. [Lines 1–358](../../drizzle/migrations/0001_shopos_business_functions.sql#L1-L358)
3. `0002_pipeline_step_order_not_deferrable.sql`: drops and recreates the `(shop_id, step_order)` uniqueness as non-deferrable. [Migration](../../drizzle/migrations/0002_pipeline_step_order_not_deferrable.sql#L1-L2)
4. `0003_revoke_anon_helpers.sql`: removes public/anon execution on helper functions and grants authenticated/service-role execution. [Migration](../../drizzle/migrations/0003_revoke_anon_helpers.sql#L1-L2)
5. `0004_transition_guards_tech_bay_dvi.sql`: replaces `transition_order` with DVI send, technician, and bay conflict checks. [Migration](../../drizzle/migrations/0004_transition_guards_tech_bay_dvi.sql#L1-L92)
6. `0005_security_limits_and_staff_activation.sql`: revokes cross-user role helper access, narrows shop/profile writes, validates complete unique portal decisions, introduces rate limits, and adds a simulated WhatsApp state. The user reports it was applied manually; the remote schema and Drizzle ledger are **not independently verified**. [Migration](../../drizzle/migrations/0005_security_limits_and_staff_activation.sql#L1-L195) · [journal entry](../../drizzle/migrations/meta/_journal.json#L32-L39)
7. `0006_signup_without_sample_orders.sql`: keeps starter shop configuration but disables fabricated customer/vehicle/repair-order seed rows for future signups. Existing demo rows are not removed. [Migration](../../drizzle/migrations/0006_signup_without_sample_orders.sql#L1-L31)

## Roadmap cross-check

The roadmap marks check-in, board, bays, DVI, portal, WhatsApp and settings as complete, while offline tablet queue remains unchecked and real WhatsApp sending waits on Meta credentials. It also says photo markup is not rebuilt, but a `PhotoMarkupDialog` implementation is present; that roadmap item is stale or refers to another capability (**UNVERIFIED**). [Roadmap](../../roadmap.md#L5-L15) · [photo markup implementation](../../src/components/ro/PhotoMarkupDialog.tsx#L45-L136) · [Meta fallback](../../src/api/whatsapp.server.ts#L86-L96)

## Unconfirmed historical/deployment details

- Lovable commit authors, timestamps, original branch, and exact sequence: **UNVERIFIED** because Git metadata is absent.
- Whether these SQL files have all been applied to the configured Supabase project, and the migration runner/production deploy procedure: **UNVERIFIED**. `drizzle.config.ts` points at `drizzle/schema.ts` and `LOVABLE_DB_MIGRATION_URL`, but the schema file is intentionally blank. [Drizzle config](../../drizzle.config.ts#L1-L9) · [schema](../../drizzle/schema.ts#L1) · [Supabase config](../../supabase/config.toml#L1)
- The roadmap notes that the owner chose to enter existing customer/order/staff data manually rather than import it. [Roadmap](../../roadmap.md#L15)
