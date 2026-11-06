# 04 — APIs, server functions, and integrations

## Supabase Edge Functions

**None found in this workspace.** There is no `supabase/functions/` tree and `supabase/config.toml` only contains a project ID. The API layer is TanStack Start server functions and a TanStack server route, not deployed Supabase Edge Functions; therefore Supabase Edge Function `verify_jwt` settings do not apply here. Runtime deployment and auth configuration are **UNVERIFIED**. [Supabase config](../../supabase/config.toml#L1) · [shop server functions](../../src/api/shop.functions.ts#L1-L5) · [portal server functions](../../src/api/portal.functions.ts#L1-L10) · [webhook route](../../src/routes/api/public/webhooks/whatsapp.ts#L18-L22)

## Server functions

Every `shop.functions.ts` mutation uses `requireSupabaseAuth` middleware and Zod validation, then operates through a user-scoped client/RLS. Global client middleware adds the Supabase bearer token; server middleware validates it with Supabase `auth.getUser(token)` and logs safe error metadata on failure. Portal operations use a token credential and service-role client. [Shop function pattern](../../src/api/shop.functions.ts#L34-L52) · [auth attachment](../../src/integrations/supabase/auth-attacher.ts#L1-L15) · [auth middleware](../../src/integrations/supabase/auth-middleware.ts#L57-L110) · [portal handler](../../src/api/portal.functions.ts#L9-L22)

| Function | Input → output | Auth/DB/external behavior | Error handling |
|---|---|---|---|
| `transitionOrder` | Order/status IDs, optional version/ETA/vendor/QC/notes/tech/bay → version and optional notification text. | Authenticated; Zod validates IDs/ranges; calls `transition_order`; then reads shop flags and may trigger WhatsApp milestone send. | RPC error returned as `FnResult`; messaging exceptions are logged and swallowed by `notifyMilestone`. [Source](../../src/api/shop.functions.ts#L34-L66) |
| `quickAddOrder` | Customer/vehicle, concern/keytag/wait type/ETA → order ID and notification status. | Authenticated; Zod validation; calls `quick_add_order`; reads created RO/status; may send milestone. | RPC errors returned; subsequent notification failure does not roll back created RO. [Source](../../src/api/shop.functions.ts#L68-L107) |
| `sendStatusUpdate` | Customer ID, nullable RO ID, 1–300-character update → send status/reason. | Authenticated; calls `has_permission('messages.send')`, resolves current profile shop, then service-role sender; requires WhatsApp opt-in there. | Permission failure returned as `FORBIDDEN`; sender returns skipped/failed/simulated/sent result. [Source](../../src/api/shop.functions.ts#L109-L133) · [mock mode](../../src/api/whatsapp.server.ts#L84-L96) |
| `sendInspection` | DVI UUID → portal URL, WhatsApp state and optional reason. | Authenticated; calls `dvi_send`, constructs origin-based `/portal/{token}`, then sends `dvi_ready` template if shop lookup succeeds. | RPC errors returned; WhatsApp failure does not undo DVI sent/token state. [Source](../../src/api/shop.functions.ts#L135-L163) |
| `inviteStaff` | Email, names, one of owner/advisor/technician/parts_specialist → `{ emailed }`. | Authenticated; inserts shop-scoped invite through RLS, then uses server service-role `auth.admin.inviteUserByEmail` with reset-password redirect. | Invite row remains if email send fails; error is logged and `emailed:false` returned. [Source](../../src/api/shop.functions.ts#L165-L196) |
| `getPortal` | Token (20–100 URL-safe chars) → shop, customer/vehicle, RO and findings/media URLs, or generic invalid/expired message. | Public bearer-token flow; service role calls `portal_resolve`, reads DVI/RO/shop/items and signs media URLs for 3600 seconds. | Invalid token or missing DVI yields generic message. Several intermediate Supabase errors are not explicitly checked; effect is **UNVERIFIED**. [Source](../../src/api/portal.functions.ts#L5-L55) |
| `authorizePortal` | Token, up to 200 decisions, PNG data URL, consent text → approved cents/declined count. | Public token credential; Zod validates shape; PNG header/size checked; signature uploaded to `dvi-media`; service-role calls `portal_authorize` with decisions, IP, UA and consent. | Upload and RPC failures return user-facing messages; `atob()`/unexpected exceptions are not caught in this handler. [Source](../../src/api/portal.functions.ts#L58-L99) |

The global start pipeline includes error handling and CSRF middleware filtered to server functions; shop mutation middleware rejects missing/non-bearer/invalid JWTs and calls Supabase `getUser(token)`. [Start middleware](../../src/start.ts#L3-L31) · [JWT middleware](../../src/integrations/supabase/auth-middleware.ts#L33-L110)

## Request limits

The public token portal is rate-limited by source IP and token subject (120 reads per 15 minutes; 5 approval attempts per hour). The WhatsApp webhook is limited by source IP (1,200 requests per minute) before body parsing and HMAC verification, with a 1 MB streamed body cap. Limits are stored as SHA-256 subject digests in `api_rate_limits`; the SQL migration must be applied before these handlers can use the limiter. **UNVERIFIED:** the deployment proxy sanitizes `cf-connecting-ip`/forwarded headers and additional gateway-level limits. [Rate-limit helper](../../src/api/rate-limit.server.ts#L1-L37) · [portal use](../../src/api/portal.functions.ts#L9-L26) · [webhook limits/body cap](../../src/routes/api/public/webhooks/whatsapp.ts#L1-L70) · [migration](../../drizzle/migrations/0005_security_limits_and_staff_activation.sql#L137-L195)

## Public WhatsApp webhook route

Route: `GET` handles Meta verification token/challenge; `POST` applies the configured request limit/body cap, then validates `x-hub-signature-256` HMAC-SHA256 using `WHATSAPP_APP_SECRET`. It accepts status callbacks for known provider message IDs, inserts a unique `(provider,event_id)` row, and updates delivery state monotonically; the route uses service-role access. [Webhook implementation](../../src/routes/api/public/webhooks/whatsapp.ts#L1-L95) · [webhook uniqueness](../../drizzle/migrations/0000_shopos_core_schema.sql#L212-L218)

Malformed JSON after a valid HMAC returns `200 OK`, and duplicate event insert errors are treated as already processed. **UNVERIFIED:** Meta subscription, webhook retry policy, deployed secrets and trusted proxy header handling. [Parse/dedup/response](../../src/routes/api/public/webhooks/whatsapp.ts#L50-L95)

## Supabase calls from UI/query code

This inventory lists direct UI and query-layer operations. Server functions and service-role operations are in the next table. [Query factories](../../src/lib/shop-data.ts#L16-L75) · [UI call sites](../../src/routes/_authenticated/settings.tsx#L66-L235) · [inspection UI](../../src/components/ro/InspectionPanel.tsx#L49-L251)

Defense in depth: centralized shop-data query functions now read the authenticated `current_shop_id()` and add an explicit `shop_id` predicate; check-in search also filters by the profile's shop. These client predicates do not replace verified database RLS. New-shop seed migration 0006 disables fabricated repair orders for future signups; existing seeded sample rows are left untouched. [Scoped queries](../../src/lib/shop-data.ts#L16-L103) · [check-in queries](../../src/components/board/QuickAddDialog.tsx#L58-L105) · [signup migration](../../drizzle/migrations/0006_signup_without_sample_orders.sql#L1-L31)

| File | Table/RPC/storage | Operations |
|---|---|---|
| [src/lib/auth.tsx](../../src/lib/auth.tsx#L23-L47) | `profiles`, `user_roles`, `shops` | Select own profile and role, then shop config. |
| [src/lib/shop-data.ts](../../src/lib/shop-data.ts#L16-L103) | `status_pipelines`, `bays`, `parts_vendors`, `profiles`, `user_roles`, `board_orders`, `dvi_inspections`, `dvi_templates`, `dvi_items` + `dvi_media`, `messages`, `audit_events` | Select/query factory operations; board pages are 100 rows, message/history pages 50 rows each. |
| [src/lib/shop-data.ts](../../src/lib/shop-data.ts#L77-L95) | Supabase Realtime | Subscribe to all changes on `repair_orders`, `messages`, `dvi_inspections`; invalidate matching React Query keys. |
| [src/components/board/QuickAddDialog.tsx](../../src/components/board/QuickAddDialog.tsx#L58-L107) | `customers`, `vehicles`, `repair_orders` | Customer name/phone search; returning customer's vehicles; check duplicate active RO. Create itself uses `quickAddOrder` server function. |
| [src/components/ro/InspectionPanel.tsx](../../src/components/ro/InspectionPanel.tsx#L49-L56) | RPC `dvi_start` | Start or retrieve inspection. |
| [src/components/ro/InspectionPanel.tsx](../../src/components/ro/InspectionPanel.tsx#L157-L201) | Storage bucket `dvi-media`; tables `dvi_items`, `dvi_media` | Create signed URLs, upsert findings, upload JPEG and insert metadata. |
| [src/components/ro/InspectionPanel.tsx](../../src/components/ro/InspectionPanel.tsx#L238-L250) | Storage `dvi-media`; `dvi_media` | Remove object then delete metadata row (return errors from these two calls are not checked). |
| [src/components/ro/MessagesPanel.tsx](../../src/components/ro/MessagesPanel.tsx#L32-L37) | RPC `set_whatsapp_consent` | Record opt-in/out and invalidate order/board. Manual send uses server function. |
| [src/routes/_authenticated/ro.$orderId.tsx](../../src/routes/_authenticated/ro.$orderId.tsx#L69-L121) | RPCs `archive_order`, `assign_bay`, `assign_technician` | Archive, assign/release bay, assign/unassign technician. |
| [src/routes/_authenticated/bays.tsx](../../src/routes/_authenticated/bays.tsx#L43-L53) | RPC `assign_bay` | Assign or release vehicle; invalidate board. |
| [src/routes/_authenticated/settings.tsx](../../src/routes/_authenticated/settings.tsx#L66-L103) | `shops`, `status_pipelines` | Update shop details/flags and pipeline settings. |
| [src/routes/_authenticated/settings.tsx](../../src/routes/_authenticated/settings.tsx#L151-L201) | `bays`, `parts_vendors` | Delete/insert bays; update vendor active flag; insert vendors. |
| [src/routes/_authenticated/settings.tsx](../../src/routes/_authenticated/settings.tsx#L207-L261) | `staff_invites`; RPC `set_staff_active` | Select invites; change staff active state through a permission-checked RPC; invitation creation uses server function. |

## Server-side Supabase calls

| File | Tables/RPC/storage | Purpose |
|---|---|---|
| [src/api/shop.functions.ts](../../src/api/shop.functions.ts#L11-L20) | `profiles` | Resolve current user's shop ID under user-scoped RLS. |
| [src/api/shop.functions.ts](../../src/api/shop.functions.ts#L17-L30) | service-role `shops`; then WhatsApp sender | Read flags and call milestone sender. |
| [src/api/shop.functions.ts](../../src/api/shop.functions.ts#L51-L63) | RPC `transition_order` | Transition RO atomically. |
| [src/api/shop.functions.ts](../../src/api/shop.functions.ts#L97-L104) | RPC `quick_add_order`; `repair_orders`; `status_pipelines` | Create and resolve resulting milestone status. |
| [src/api/shop.functions.ts](../../src/api/shop.functions.ts#L121-L133) | RPC `has_permission`; WhatsApp sender | Check manual-message permission and send. |
| [src/api/shop.functions.ts](../../src/api/shop.functions.ts#L141-L162) | RPC `dvi_send`; WhatsApp sender | Issue token and send portal link. |
| [src/api/shop.functions.ts](../../src/api/shop.functions.ts#L179-L196) | `staff_invites`; service-role Supabase Auth admin | Persist invite and email invite. |
| [src/api/portal.functions.ts](../../src/api/portal.functions.ts#L11-L45) | service-role RPC `portal_resolve`; `dvi_inspections`, `board_orders`, `shops`, `dvi_items`; Storage `dvi-media` | Read token-scoped portal payload and sign finding media. |
| [src/api/portal.functions.ts](../../src/api/portal.functions.ts#L74-L97) | RPC `portal_resolve`, `portal_authorize`; Storage `dvi-media` | Save signature and submit decisions/consent/audit data. |
| [src/api/rate-limit.server.ts](../../src/api/rate-limit.server.ts#L1-L37) | RPC `consume_api_rate_limit`; table `api_rate_limits` | Atomically increment IP/token fixed-window counters; store only SHA-256 subject digests. |
| [src/api/rate-limit.server.ts](../../src/api/rate-limit.server.ts#L1-L37) | RPC `consume_api_rate_limit`; table `api_rate_limits` | Atomically increment IP/token fixed-window counters; store only SHA-256 subject digests. |
| [src/api/whatsapp.server.ts](../../src/api/whatsapp.server.ts#L20-L124) | `customers`, `shops`, `board_orders`, `messages` | Validate customer/shop/opt-in, build/dedupe/record message, update delivery status. |
| [src/routes/api/public/webhooks/whatsapp.ts](../../src/routes/api/public/webhooks/whatsapp.ts#L40-L67) | `messages`, `webhook_events` | Map provider receipt to message and idempotently update delivery state. |

## Third parties and secrets

- **Meta WhatsApp Cloud API:** outbound HTTPS `POST https://graph.facebook.com/{version}/{phoneNumberId}/messages` occurs only if server-side `WHATSAPP_MODE=live`; the default records `simulated` and makes no external send. In live mode the sender uses `WHATSAPP_ACCESS_TOKEN` and a shop/global phone-number ID. Inbound webhook uses `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET`. [Sender mode/fallback](../../src/api/whatsapp.server.ts#L84-L112) · [Webhook](../../src/routes/api/public/webhooks/whatsapp.ts#L35-L49)
- **Supabase Auth email:** password reset and `inviteUserByEmail`; provider/mail delivery configuration belongs to Supabase and is **UNVERIFIED**. [Reset flow](../../src/routes/index.tsx#L60-L71) · [staff invite](../../src/api/shop.functions.ts#L187-L196)
- **OAuth:** UI offers Google and Lovable OAuth via Lovable Cloud Auth; whether provider apps are enabled/configured in the project is **UNVERIFIED**. [OAuth UI](../../src/routes/index.tsx#L75-L79) · [adapter](../../src/integrations/lovable/index.ts#L1-L31)
- **Fonts:** Google Fonts stylesheet is loaded by the root document. [Root head](../../src/routes/__root.tsx#L76-L100)
- No payment, AI, analytics, or other outbound integration code was identified in the supplied routes/API manifest. This is an inspected-workspace finding, not proof about external platform add-ons. [Dependencies](../../package.json#L16-L88) · [route manifest](../../src/routeTree.gen.ts#L11-L55)

## Edge/auth notes

Supabase Edge Functions and `verify_jwt` declarations: **UNVERIFIED/not applicable in the supplied source**, because no function directory/config is present. `portal` uses public server functions protected by random tokens; the WhatsApp webhook is public but HMAC-verified; shop server functions require bearer JWT + CSRF middleware. [Portal](../../src/api/portal.functions.ts#L5-L20) · [webhook](../../src/routes/api/public/webhooks/whatsapp.ts#L18-L33) · [start](../../src/start.ts#L21-L31) · [auth middleware](../../src/integrations/supabase/auth-middleware.ts#L33-L90)
