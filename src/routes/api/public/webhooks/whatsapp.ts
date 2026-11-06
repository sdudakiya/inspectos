import { createFileRoute } from "@tanstack/react-router";

// Meta WhatsApp Cloud API: webhook verification handshake + delivery receipts.
const PROGRESSION: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };
const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

async function readBodyWithinLimit(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return body + decoder.decode();
    bytes += value.byteLength;
    if (bytes > MAX_WEBHOOK_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
}

async function verifySignature(raw: string, header: string | null, secret: string | undefined) {
  if (!header || !secret || !header.startsWith("sha256=")) return false;
  const expected = header.slice(7);
  if (expected.length !== 64) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const actual = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const verify = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
        if (
          verify &&
          url.searchParams.get("hub.mode") === "subscribe" &&
          url.searchParams.get("hub.verify_token") === verify
        ) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const { checkRequestRateLimit } = await import("@/api/rate-limit.server");
        const rateLimit = await checkRequestRateLimit({
          request,
          bucket: "whatsapp_webhook",
          windowSeconds: 60,
          maxRequests: 1200,
        });
        if (rateLimit === "limited")
          return Response.json({ error: "Too many webhook requests" }, { status: 429 });
        if (rateLimit === "unavailable")
          return Response.json({ error: "Webhook temporarily unavailable" }, { status: 503 });

        const contentLength = Number(request.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }
        const raw = await readBodyWithinLimit(request);
        if (raw === null) return Response.json({ error: "Payload too large" }, { status: 413 });
        if (
          !(await verifySignature(
            raw,
            request.headers.get("x-hub-signature-256"),
            process.env.WHATSAPP_APP_SECRET,
          ))
        ) {
          return Response.json({ error: "Invalid signature" }, { status: 401 });
        }

        let payload: {
          entry?: Array<{
            changes?: Array<{
              field?: string;
              value?: {
                statuses?: Array<{
                  id?: string;
                  status?: string;
                  errors?: Array<{ code?: number }>;
                }>;
              };
            }>;
          }>;
        };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("OK");
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        for (const entry of payload.entry ?? []) {
          for (const change of entry.changes ?? []) {
            if (change.field !== "messages") continue;
            for (const st of change.value?.statuses ?? []) {
              if (!st.id || !st.status) continue;
              const { data: msg } = await supabaseAdmin
                .from("messages")
                .select("id, shop_id, delivery_status")
                .eq("provider_message_id", st.id)
                .maybeSingle();
              if (!msg) continue;
              const { error: dup } = await supabaseAdmin.from("webhook_events").insert({
                provider: "whatsapp",
                event_id: `${st.id}:${st.status}`,
                shop_id: msg.shop_id,
                payload: st as never,
                processed_at: new Date().toISOString(),
              });
              if (dup) continue; // already processed
              if (st.status === "failed") {
                await supabaseAdmin
                  .from("messages")
                  .update({
                    delivery_status: "failed",
                    error_code: st.errors?.[0]?.code ? String(st.errors[0].code) : null,
                  })
                  .eq("id", msg.id);
              } else if (
                (PROGRESSION[st.status] ?? -1) > (PROGRESSION[msg.delivery_status] ?? -1)
              ) {
                await supabaseAdmin
                  .from("messages")
                  .update({ delivery_status: st.status })
                  .eq("id", msg.id);
              }
            }
          }
        }
        return new Response("OK");
      },
    },
  },
});
