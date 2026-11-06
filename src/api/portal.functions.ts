import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isPortalTokenValid } from "@/lib/portal-token";
import type { Database } from "@/integrations/supabase/types";

// Public (customer) endpoints. The unguessable token is the credential; it is
// hashed and checked in the database before any data is returned.
const tokenSchema = z.string().refine(isPortalTokenValid, "Invalid portal token");

function getPortalSupabaseClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase URL or publishable key for portal access");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const getPortal = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const request = getRequest();
    const { checkRequestRateLimit } = await import("./rate-limit.server");
    const rateLimit = await checkRequestRateLimit({
      request,
      bucket: "portal_read",
      subject: data.token,
      windowSeconds: 900,
      maxRequests: 120,
    });
    if (rateLimit === "limited")
      return { ok: false as const, message: "Too many requests. Please try again later." };
    if (rateLimit === "unavailable" && process.env.NODE_ENV === "production")
      return {
        ok: false as const,
        message: "The inspection is temporarily unavailable. Please try again shortly.",
      };

    const supabase = getPortalSupabaseClient();
    const { data: payload, error } = await supabase.rpc("portal_get", {
      p_token: data.token,
    });
    if (error) {
      console.error("[Portal] portal_get failed", { code: error.code, message: error.message });
      return {
        ok: false as const,
        message: "The inspection is temporarily unavailable. Please try again shortly.",
      };
    }
    if (!payload) return { ok: false as const, message: "This link is not valid or has expired." };
    return { ok: true as const, ...(payload as Record<string, unknown>) };
  });

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const authorizeInput = z.object({
  token: tokenSchema,
  decisions: z
    .array(z.object({ itemId: z.string().uuid(), approved: z.boolean() }))
    .max(200)
    .superRefine((decisions, ctx) => {
      const seen = new Set<string>();
      decisions.forEach((decision, index) => {
        if (seen.has(decision.itemId)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "itemId"],
            message: "Each finding can be decided only once",
          });
        }
        seen.add(decision.itemId);
      });
    }),
  signatureDataUrl: z.string().startsWith("data:image/png;base64,").max(300_000),
  consentText: z.string().min(10).max(2000),
});

export const authorizePortal = createServerFn({ method: "POST" })
  .validator((d: z.infer<typeof authorizeInput>) => authorizeInput.parse(d))
  .handler(async ({ data }) => {
    const request = getRequest();
    const { checkRequestRateLimit } = await import("./rate-limit.server");
    const rateLimit = await checkRequestRateLimit({
      request,
      bucket: "portal_authorize",
      subject: data.token,
      windowSeconds: 3600,
      maxRequests: 5,
    });
    if (rateLimit === "limited")
      return { ok: false as const, message: "Too many approval attempts. Please try again later." };
    if (rateLimit === "unavailable" && process.env.NODE_ENV === "production")
      return {
        ok: false as const,
        message: "Approval is temporarily unavailable. Please try again shortly.",
      };

    const b64 = data.signatureDataUrl.slice("data:image/png;base64,".length);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (
      bytes.length < 100 ||
      bytes.length > 200_000 ||
      !PNG_MAGIC.every((b, i) => bytes[i] === b)
    ) {
      return { ok: false as const, message: "Signature image is not valid. Please sign again." };
    }
    const supabase = getPortalSupabaseClient();
    const req = request;
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const { data: res, error } = await supabase.rpc("portal_authorize_public", {
      p_token: data.token,
      p_decisions: data.decisions,
      p_signature_data_url: data.signatureDataUrl,
      p_ip: ip,
      p_ua: req.headers.get("user-agent") ?? "",
      p_consent: data.consentText,
    });
    if (error) {
      const msg =
        error.message === "PORTAL_ALREADY_AUTHORIZED"
          ? "This inspection has already been authorized."
          : (error.details ?? "Could not record your approval.");
      return { ok: false as const, message: msg };
    }
    const r = res as { approvedTotalCents: number; declinedCount: number };
    return {
      ok: true as const,
      approvedTotalCents: r.approvedTotalCents,
      declinedCount: r.declinedCount,
    };
  });
