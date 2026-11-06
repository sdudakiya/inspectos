// Server-only WhatsApp sending. Uses Meta Cloud API when credentials are set,
// otherwise an explicit mock result. External delivery requires WHATSAPP_MODE=live.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  TEMPLATES,
  buildComponents,
  renderPreview,
  shouldSendLiveWhatsApp,
  type TemplateKey,
} from "@/lib/whatsapp-templates";

export interface SendArgs {
  shopId: string;
  customerId: string;
  repairOrderId: string | null;
  template: TemplateKey;
  senderUserId: string | null;
  extraVars?: Record<string, string>;
}

export type SendOutcome =
  | { status: "sent" | "queued" | "simulated"; messageId: string; reason?: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; messageId?: string; reason: string };

export async function sendTemplateMessage(args: SendArgs): Promise<SendOutcome> {
  const def = TEMPLATES[args.template];
  const { data: customer } = await supabaseAdmin
    .from("customers")
    .select("id, shop_id, first_name, phone_mobile, whatsapp_opt_in")
    .eq("id", args.customerId)
    .eq("shop_id", args.shopId)
    .maybeSingle();
  if (!customer) return { status: "skipped", reason: "Customer not found" };
  if (!customer.whatsapp_opt_in)
    return { status: "skipped", reason: "Customer has not opted in to WhatsApp" };

  const { data: shop } = await supabaseAdmin
    .from("shops")
    .select("name, phone_number, whatsapp_phone_number_id")
    .eq("id", args.shopId)
    .single();

  let vehicle = "vehicle";
  if (args.repairOrderId) {
    const { data: ro } = await supabaseAdmin
      .from("board_orders")
      .select("vehicle_year, vehicle_make, vehicle_model")
      .eq("id", args.repairOrderId)
      .maybeSingle();
    if (ro)
      vehicle = [ro.vehicle_year, ro.vehicle_make, ro.vehicle_model].filter(Boolean).join(" ");
  }

  if (def.dedupe === "once" && args.repairOrderId) {
    const { data: prior } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("repair_order_id", args.repairOrderId)
      .eq("template_key", args.template)
      .neq("delivery_status", "failed")
      .neq("delivery_status", "simulated")
      .limit(1);
    if (prior && prior.length) return { status: "skipped", reason: "Already sent for this order" };
  }

  const vars: Record<string, string> = {
    customer_name: customer.first_name,
    shop_name: shop?.name ?? "your shop",
    vehicle,
    shop_phone: shop?.phone_number ?? "the shop",
    ...args.extraVars,
  };
  for (const v of def.vars) {
    if (!vars[v] || !String(vars[v]).trim())
      return { status: "failed", reason: `Missing template value: ${v}` };
  }
  const publicVars = Object.fromEntries(
    Object.entries(vars).filter(([k]) => !def.secretVars?.includes(k)),
  );
  const body = renderPreview(args.template, publicVars);

  const { data: msg, error } = await supabaseAdmin
    .from("messages")
    .insert({
      shop_id: args.shopId,
      customer_id: customer.id,
      repair_order_id: args.repairOrderId,
      sender_user_id: args.senderUserId,
      template_key: args.template,
      template_vars: publicVars,
      body,
    })
    .select("id")
    .single();
  if (error || !msg)
    return { status: "failed", reason: error?.message ?? "Could not record message" };

  if (!shouldSendLiveWhatsApp(process.env.WHATSAPP_MODE)) {
    const { error: simulatedError } = await supabaseAdmin
      .from("messages")
      .update({ delivery_status: "simulated", provider_message_id: `simulated-${msg.id}` })
      .eq("id", msg.id);
    if (simulatedError) {
      console.error("Could not record simulated WhatsApp message", simulatedError.code);
      return {
        status: "failed",
        messageId: msg.id,
        reason: "Could not record the simulated message.",
      };
    }
    return {
      status: "simulated",
      messageId: msg.id,
      reason: "Simulation only; no WhatsApp message was sent.",
    };
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = shop?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    await supabaseAdmin
      .from("messages")
      .update({ delivery_status: "failed", error_code: "MISSING_CREDENTIALS" })
      .eq("id", msg.id);
    return {
      status: "failed",
      messageId: msg.id,
      reason: "Live WhatsApp mode is missing provider credentials.",
    };
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: customer.phone_mobile.replace(/^\+/, ""),
        type: "template",
        template: {
          name: def.metaName,
          language: { code: def.language },
          components: buildComponents(args.template, vars),
        },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number };
      messages?: Array<{ id: string }>;
    };
    const providerId = data.messages?.[0]?.id;
    if (!res.ok || !providerId) {
      console.error(`WhatsApp send failed [${res.status}]: ${JSON.stringify(data)}`);
      await supabaseAdmin
        .from("messages")
        .update({ delivery_status: "failed", error_code: String(data.error?.code ?? res.status) })
        .eq("id", msg.id);
      return {
        status: "failed",
        messageId: msg.id,
        reason: data.error?.message ?? `WhatsApp returned ${res.status}`,
      };
    }
    await supabaseAdmin
      .from("messages")
      .update({ delivery_status: "sent", provider_message_id: providerId })
      .eq("id", msg.id);
    return { status: "sent", messageId: msg.id };
  } catch (err) {
    await supabaseAdmin
      .from("messages")
      .update({ delivery_status: "failed", error_code: "NETWORK" })
      .eq("id", msg.id);
    return { status: "failed", messageId: msg.id, reason: (err as Error).message };
  }
}
