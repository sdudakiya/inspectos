<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## ShopOS architecture (rebuilt from github.com/sdudakiya/ShopOs, Vue/Express)
- The status-transition dialog has a viewport-capped flex layout with a scrolling body and fixed header/footer. Why: assignment fields must never push the actions off-screen.
- Every shop-scoped table has `shop_id`; RLS uses `current_shop_id()` and `has_permission()`. Why: one database serves many shops and must never leak across them.
- Roles live in `user_roles`; the role→permission map is `public.role_permissions()` and is mirrored in `src/lib/permissions.ts` for UI only. Why: the database is the enforcement point; keep both in sync.
- Order mutations (check-in, status change, bays, inspection send, consent) go through SECURITY DEFINER SQL functions that raise `CODE` as the message, text in DETAIL and JSON extras in HINT; `src/lib/errors.ts` parses them. Why: row locks and guard order stay atomic in one transaction.
- `repair_orders` and `dvi_inspections` are read-only to clients; never add direct write policies for them. Why: guards (cooldown, versions, QC) would be bypassed.
- Server functions live in `src/api/*.functions.ts` (not `src/server/`, which the client import guard blocks); WhatsApp sending is `src/api/whatsapp.server.ts` and falls back to a fake provider without Meta credentials.
- Customer portal access is a random token whose SHA-256 is stored; only `portal_resolve`/`portal_authorize` (service role) read it.
- New sign-ups create a new shop seeded by `seed_shop()`, unless their email is in `staff_invites`. Why: mirrors the source app's tenancy without trusting user-supplied metadata for shop membership.
- tsconfig turns off `exactOptionalPropertyTypes`, `noImplicitReturns` and `noPropertyAccessFromIndexSignature`. Why: they fight generated database types and event handlers.
