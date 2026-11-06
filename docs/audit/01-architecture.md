# 01 — Stack and architecture

## Stack confirmation

| Layer | Finding | Evidence |
|---|---|---|
| Build/dev server | Vite 8, configured through Lovable's TanStack config preset; Nitro build output targets Cloudflare by default according to the config comment. | [package.json](../../package.json#L16-L88) · [vite.config.ts](../../vite.config.ts#L1-L13) |
| UI | React 19 + TypeScript; Tailwind CSS 4; shadcn configuration with Radix primitives and Lucide icons. | [package.json](../../package.json#L16-L88) · [components.json](../../components.json#L1-L22) · [styles.css](../../src/styles.css#L1-L27) |
| Router/rendering | TanStack Start and file-based TanStack Router, not React Router. Root is configured for SSR; the authenticated layout explicitly disables SSR. | [package.json](../../package.json#L16-L88) · [router.tsx](../../src/router.tsx#L1-L16) · [route tree](../../src/routeTree.gen.ts#L11-L55) · [SSR registration](../../src/routeTree.gen.ts#L238-L244) · [authenticated layout](../../src/routes/_authenticated/route.tsx#L8-L13) |
| Query/cache | TanStack Query v5; router creates a `QueryClient` and shares it with route context. | [package.json](../../package.json#L16-L88) · [router.tsx](../../src/router.tsx#L1-L16) · [root provider](../../src/routes/__root.tsx#L116-L128) |
| Backend/data | Supabase JS/Postgres/Auth/Storage/Realtime; PostgreSQL SQL migrations are under Drizzle's migration directory. | [package.json](../../package.json#L16-L88) · [client](../../src/integrations/supabase/client.ts#L50-L76) · [migration](../../drizzle/migrations/0000_shopos_core_schema.sql#L1-L3) |
| Forms/validation | Native controlled React forms, hand-written check-in validation, and Zod validation at server-function boundaries. `react-hook-form` and `@hookform/resolvers` are dependencies, but no form uses them in the audited route/source paths. | [dependencies](../../package.json#L16-L88) · [check-in validation](../../src/lib/checkin-validation.ts#L1-L26) · [server input validation](../../src/api/shop.functions.ts#L34-L50) |

## Source structure map

- `src/routes/`: file routes, root shell, login/signup, reset, customer portal, authenticated board/RO/bay/settings pages, and a Meta webhook route. Route registration is generated in `src/routeTree.gen.ts`. [Route tree](../../src/routeTree.gen.ts#L11-L55)
- `src/components/board/`: order card, check-in dialog, and transition dialog; `src/components/ro/`: inspection, WhatsApp messages, and photo markup; `src/components/ui/`: reusable shadcn/Radix-style primitives. [Board imports](../../src/routes/_authenticated/board.tsx#L1-L14) · [RO imports](../../src/routes/_authenticated/ro.$orderId.tsx#L1-L17) · [UI config](../../components.json#L1-L22)
- `src/hooks/`: responsive `useIsMobile` utility; `src/lib/`: auth context, permissions, data query factories/realtime, validation, time/phone/error/template helpers. [Auth and permissions](../../src/lib/auth.tsx#L1-L96) · [data/query factories](../../src/lib/shop-data.ts#L1-L95) · [mobile hook](../../src/hooks/use-mobile.tsx#L1-L19)
- `src/integrations/supabase/`: browser client, server service-role client, request-auth middleware, client token attachment, generated database types, preview auth storage, and a cron-auth helper. [Integration file list](../../src/integrations/supabase/client.ts#L1-L87) · [server client](../../src/integrations/supabase/client.server.ts#L1-L59) · [middleware](../../src/integrations/supabase/auth-middleware.ts#L1-L90)
- `src/api/`: TanStack server functions for shop operations and customer portal, plus server-only WhatsApp sender; these are not Supabase Edge Functions. [Shop functions](../../src/api/shop.functions.ts#L1-L196) · [portal functions](../../src/api/portal.functions.ts#L1-L99) · [WhatsApp sender](../../src/api/whatsapp.server.ts#L1-L115)
- `drizzle/`: SQL migrations and an intentionally blank `schema.ts`; `supabase/` has only project config, with no `supabase/migrations/` or `supabase/functions/` directory in this workspace. [Drizzle config](../../drizzle.config.ts#L1-L9) · [blank schema](../../drizzle/schema.ts#L1) · [Supabase config](../../supabase/config.toml#L1)

## Environment variables

The checked-in local `.env` has these names (values intentionally omitted here): `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, and their `VITE_` equivalents. The browser client consumes the `VITE_` URL/key; the server can fall back to `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`. [Local env file](../../.env#L1-L6) · [browser client](../../src/integrations/supabase/client.ts#L50-L74)

Other server-side variables referenced by source: `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_DB_MIGRATION_URL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `LOVABLE_CRON_SECRET`, and `LOVABLE_CRON_SECRET_PREVIOUS`. Their deployed values and environment separation are **UNVERIFIED**. [Service client](../../src/integrations/supabase/client.server.ts#L32-L59) · [Drizzle config](../../drizzle.config.ts#L5-L9) · [WhatsApp sender](../../src/api/whatsapp.server.ts#L86-L100) · [Webhook](../../src/routes/api/public/webhooks/whatsapp.ts#L20-L32) · [cron helper](../../src/integrations/supabase/cron-auth.ts#L1-L30)

The local `.env` is now covered by `.gitignore`; its inspected values are public Supabase settings, but whether it was already tracked in the canonical Git remote is **UNVERIFIED**. [`.env`](../../.env#L1-L6) · [ignore rules](../../.gitignore#L1-L18)

## Architecture diagram

```mermaid
flowchart LR
  Browser[Browser: React + TanStack Router/Query]
  Root[Root shell: AuthProvider + QueryClient]
  Routes[File routes: login, board, RO, bays, settings, portal]
  PublicClient[Supabase browser client: URL + publishable key + user session]
  FunctionAuth[Client middleware attaches access token]
  UserFns[TanStack server functions: authenticated shop operations]
  AuthMW[Bearer validation: Supabase getUser(token)]
  UserClient[User-scoped Supabase client: RLS]
  AdminFns[Portal + WhatsApp server-only operations]
  AdminClient[Server Supabase client: service-role key]
  DB[(Supabase Postgres: RLS, RPCs, triggers)]
  Storage[(Supabase Storage: dvi-media)]
  Meta[Meta WhatsApp Cloud API]
  Webhook[Public TanStack webhook route: HMAC check]
  Auth[(Supabase Auth)]

  Browser --> Root --> Routes
  Routes --> PublicClient
  PublicClient --> Auth
  Routes --> FunctionAuth --> UserFns --> AuthMW --> UserClient --> DB
  UserFns --> AdminFns --> AdminClient
  Routes --> AdminFns
  AdminClient --> DB
  AdminClient --> Storage
  AdminFns --> Meta
  Meta --> Webhook --> AdminClient
  DB -->|Realtime: repair_orders, messages, dvi_inspections| PublicClient
  Auth -->|auth.users trigger: create tenant/shop/profile/role| DB
```

The diagram reflects the browser client/session, auth attachment, server middleware, service-role client, SQL trigger, and Realtime publication documented in source; it does not assert that the remote project is configured identically. [Auth attachment](../../src/integrations/supabase/auth-attacher.ts#L1-L15) · [auth middleware](../../src/integrations/supabase/auth-middleware.ts#L33-L90) · [server client](../../src/integrations/supabase/client.server.ts#L32-L59) · [signup trigger](../../drizzle/migrations/0001_shopos_business_functions.sql#L56-L82) · [Realtime tables](../../drizzle/migrations/0000_shopos_core_schema.sql#L377-L379)

## Supabase client/key boundary

- Browser: `createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ...)`; `SUPABASE_PUBLISHABLE_KEY` resolves from `VITE_SUPABASE_PUBLISHABLE_KEY` in Vite builds. [client](../../src/integrations/supabase/client.ts#L50-L74)
- Server: separate client reads `process.env.SUPABASE_SERVICE_ROLE_KEY` and disables session persistence. Its comments prescribe server-only dynamic imports. [server client](../../src/integrations/supabase/client.server.ts#L32-L59)
- Server-function auth validates bearer claims before exposing a user-scoped client; the app also registers CSRF middleware for server functions. [auth middleware](../../src/integrations/supabase/auth-middleware.ts#L33-L90) · [start middleware](../../src/start.ts#L3-L31)
- Static source scan found no hardcoded service-role key value; a regex scan did see the `sb_secret_` prefix detector and server key *variable name*, neither of which is a key value. The local `.env` key is publishable. Deployed bundle/runtime confirmation is **UNVERIFIED**. [browser client](../../src/integrations/supabase/client.ts#L5-L8) · [server client](../../src/integrations/supabase/client.server.ts#L32-L46) · [local env](../../.env#L1-L6)
