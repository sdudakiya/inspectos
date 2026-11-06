import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { milestoneTemplateFor, type TemplateKey } from "@/lib/whatsapp-templates";

type DbError = { message: string; details?: string; hint?: string };
export type FnResult<T> = { ok: true; data: T } | { ok: false; error: DbError };
const fail = (e: {
  message: string;
  details?: string | null;
  hint?: string | null;
}): { ok: false; error: DbError } => ({
  ok: false,
  error: { message: e.message, details: e.details ?? undefined, hint: e.hint ?? undefined },
});

async function shopOf(supabase: SupabaseClient<Database>, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("shop_id").eq("id", userId).maybeSingle();
  return data?.shop_id ?? null;
}

async function notifyMilestone(
  shopId: string,
  orderId: string,
  customerId: string,
  statusCode: string,
  isTerminal: boolean,
  userId: string,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: shop } = await supabaseAdmin
      .from("shops")
      .select("feature_flags")
      .eq("id", shopId)
      .single();
    const flags = (shop?.feature_flags ?? {}) as Record<string, unknown>;
    if (flags.whatsapp_milestones === false) return null;
    const template = milestoneTemplateFor(
      statusCode,
      isTerminal,
      (flags.milestone_templates ?? {}) as Record<string, string>,
    );
    if (!template) return null;
    const { sendTemplateMessage } = await import("./whatsapp.server");
    return await sendTemplateMessage({
      shopId,
      customerId,
      repairOrderId: orderId,
      template,
      senderUserId: userId,
    });
  } catch (err) {
    console.error("Milestone notification failed", err);
    return null;
  }
}

const transitionInput = z.object({
  orderId: z.string().uuid(),
  statusId: z.string().uuid(),
  expectedVersion: z.number().int().optional(),
  etaMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 30)
    .optional(),
  partsVendorId: z.string().uuid().optional(),
  qcSignoff: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
  technicianId: z.string().uuid().optional(),
  bayId: z.string().uuid().optional(),
});

export const transitionOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof transitionInput>) => transitionInput.parse(d))
  .handler(
    async ({ data, context }): Promise<FnResult<{ version: number; notified: string | null }>> => {
      const { data: res, error } = await context.supabase.rpc("transition_order", {
        p_order: data.orderId,
        p_status: data.statusId,
        p_expected_version: data.expectedVersion,
        p_eta_minutes: data.etaMinutes,
        p_parts_vendor: data.partsVendorId,
        p_qc_signoff: data.qcSignoff ?? false,
        p_notes: data.notes,
        p_technician: data.technicianId,
        p_bay: data.bayId,
      });
      if (error) return fail(error);
      const r = res as {
        version: number;
        statusCode: string;
        isTerminal: boolean;
        customerId: string;
      };
      const shopId = await shopOf(context.supabase, context.userId);
      const out = shopId
        ? await notifyMilestone(
            shopId,
            data.orderId,
            r.customerId,
            r.statusCode,
            r.isTerminal,
            context.userId,
          )
        : null;
      return {
        ok: true,
        data: {
          version: r.version,
          notified: out && out.status === "sent" ? "WhatsApp update sent" : null,
        },
      };
    },
  );

const quickAddInput = z.object({
  customer: z.object({
    id: z.string().uuid().optional(),
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    phoneMobile: z.string().max(20).optional(),
    email: z.string().email().max(255).optional().or(z.literal("")),
    whatsappOptIn: z.boolean().optional(),
  }),
  vehicle: z.object({
    id: z.string().uuid().optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    make: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    vin: z.string().max(17).optional(),
    licensePlate: z.string().max(20).optional(),
    odometerIn: z.number().int().min(0).optional(),
  }),
  concern: z.string().max(2000).optional(),
  keytag: z.string().max(50).optional(),
  waitType: z.enum(["waiting", "dropoff", "shuttle", "loaner", "tow"]).optional(),
  etaMinutes: z.number().int().min(0).optional(),
});

export const quickAddOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof quickAddInput>) => quickAddInput.parse(d))
  .handler(
    async ({ data, context }): Promise<FnResult<{ orderId: string; notified: string | null }>> => {
      const { data: orderId, error } = await context.supabase.rpc("quick_add_order", {
        p: data as never,
      });
      if (error) return fail(error);
      const { data: ro } = await context.supabase
        .from("repair_orders")
        .select("customer_id, shop_id, current_status_id")
        .eq("id", orderId)
        .single();
      let notified: string | null = null;
      if (ro) {
        const { data: st } = await context.supabase
          .from("status_pipelines")
          .select("status_code,is_terminal")
          .eq("id", ro.current_status_id)
          .single();
        if (st) {
          const out = await notifyMilestone(
            ro.shop_id,
            orderId as string,
            ro.customer_id,
            st.status_code,
            st.is_terminal,
            context.userId,
          );
          notified = out && out.status === "sent" ? "Check-in message sent on WhatsApp" : null;
        }
      }
      return { ok: true, data: { orderId: orderId as string, notified } };
    },
  );

const sendInput = z.object({
  customerId: z.string().uuid(),
  repairOrderId: z.string().uuid().nullable(),
  update: z.string().min(1).max(300),
});

export const sendStatusUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof sendInput>) => sendInput.parse(d))
  .handler(async ({ data, context }): Promise<FnResult<{ status: string; reason?: string }>> => {
    const { data: allowed } = await context.supabase.rpc("has_permission", {
      _perm: "messages.send",
    });
    if (!allowed) return { ok: false, error: { message: "FORBIDDEN" } };
    const shopId = await shopOf(context.supabase, context.userId);
    if (!shopId) return { ok: false, error: { message: "UNAUTHENTICATED" } };
    const { sendTemplateMessage } = await import("./whatsapp.server");
    const out = await sendTemplateMessage({
      shopId,
      customerId: data.customerId,
      repairOrderId: data.repairOrderId,
      template: "status_update" as TemplateKey,
      senderUserId: context.userId,
      extraVars: { update: data.update },
    });
    return {
      ok: true,
      data: { status: out.status, reason: "reason" in out ? out.reason : undefined },
    };
  });

export const sendInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { dviId: string }) => z.object({ dviId: z.string().uuid() }).parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<FnResult<{ portalUrl: string; whatsapp: string; reason?: string }>> => {
      const { data: res, error } = await context.supabase.rpc("dvi_send", { p_dvi: data.dviId });
      if (error) return fail(error);
      const r = res as { token: string; repairOrderId: string; customerId: string };
      const origin = new URL(getRequest().url).origin;
      const portalUrl = `${origin}/portal/${r.token}`;
      const shopId = await shopOf(context.supabase, context.userId);
      let whatsapp = "skipped";
      let reason: string | undefined;
      if (shopId) {
        try {
          const { sendTemplateMessage } = await import("./whatsapp.server");
          const out = await sendTemplateMessage({
            shopId,
            customerId: r.customerId,
            repairOrderId: r.repairOrderId,
            template: "dvi_ready",
            senderUserId: context.userId,
            extraVars: { portal_token: r.token },
          });
          whatsapp = out.status;
          reason = "reason" in out ? out.reason : undefined;
        } catch (err) {
          whatsapp = "skipped";
          reason =
            "WhatsApp is not configured on this environment; share the inspection link with the customer.";
          console.warn("Inspection link sent without WhatsApp notification", err);
        }
      }
      return { ok: true, data: { portalUrl, whatsapp, reason } };
    },
  );

const inviteInput = z.object({
  email: z.string().email().max(255),
  firstName: z.string().max(100),
  lastName: z.string().max(100),
  role: z.enum(["owner", "advisor", "technician", "parts_specialist"]),
});

export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof inviteInput>) => inviteInput.parse(d))
  .handler(async ({ data, context }): Promise<FnResult<{ emailed: boolean }>> => {
    const shopId = await shopOf(context.supabase, context.userId);
    if (!shopId) return { ok: false, error: { message: "UNAUTHENTICATED" } };
    // RLS only allows this insert for people with staff.manage in their own shop.
    const { error } = await context.supabase.from("staff_invites").insert({
      shop_id: shopId,
      email: data.email.toLowerCase(),
      first_name: data.firstName,
      last_name: data.lastName,
      role: data.role,
      invited_by: context.userId,
    });
    if (error) return fail(error);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = new URL(getRequest().url).origin;
    const { error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: `${origin}/reset-password`,
      data: { first_name: data.firstName, last_name: data.lastName },
    });
    if (invErr) console.error("Invite email failed", invErr.message);
    return { ok: true, data: { emailed: !invErr } };
  });
