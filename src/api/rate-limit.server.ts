import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type RateLimitResult = "allowed" | "limited" | "unavailable";

function getRateLimitClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase URL or key for rate limiting");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Apply a shared fixed-window limit using a SHA-256 subject digest in Postgres.
 * The edge proxy must overwrite the forwarded-IP header used here.
 */
export async function checkRequestRateLimit(args: {
  request: Request;
  bucket: "portal_read" | "portal_authorize" | "whatsapp_webhook";
  subject?: string;
  windowSeconds: number;
  maxRequests: number;
}): Promise<RateLimitResult> {
  let supabase: ReturnType<typeof getRateLimitClient>;
  try {
    supabase = getRateLimitClient();
  } catch (error) {
    console.error("[RateLimit] Client initialization failed", {
      bucket: args.bucket,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return "unavailable";
  }
  const forwardedIp =
    args.request.headers.get("cf-connecting-ip") ??
    args.request.headers.get("x-real-ip") ??
    args.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const subjects = [`ip:${forwardedIp}`];
  if (args.subject) subjects.push(`subject:${args.subject}`);

  for (const subject of subjects) {
    try {
      const { data, error } = await supabase.rpc("consume_api_rate_limit", {
        p_bucket: args.bucket,
        p_subject: subject,
        p_window_seconds: args.windowSeconds,
        p_max_requests: args.maxRequests,
      });
      if (error) {
        console.error("[RateLimit] Database check failed", {
          bucket: args.bucket,
          code: error.code,
        });
        return "unavailable";
      }
      if (!data) return "limited";
    } catch (error) {
      console.error("[RateLimit] Client initialization failed", {
        bucket: args.bucket,
        errorName: error instanceof Error ? error.name : "unknown",
      });
      return "unavailable";
    }
  }
  return "allowed";
}
