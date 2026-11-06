import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type T = Database["public"]["Tables"];
export type Status = T["status_pipelines"]["Row"];
export type Bay = T["bays"]["Row"];
export type Vendor = T["parts_vendors"]["Row"];
export type DviTemplate = T["dvi_templates"]["Row"];
export type BoardOrder = Database["public"]["Views"]["board_orders"]["Row"];
export type DviTemplateCategory = { name: string; items: string[] };
type NormalizeCategoriesOptions = { mergeByName?: boolean };

function normalizeItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const maybeName = (item as { name?: unknown }).name;
        const maybeTitle = (item as { title?: unknown }).title;
        if (typeof maybeName === "string") return maybeName.trim();
        if (typeof maybeTitle === "string") return maybeTitle.trim();
      }
      return "";
    })
    .filter(Boolean);
}

function normalizeCategoryEntry(entry: unknown): DviTemplateCategory[] {
  if (!entry) return [];
  if (typeof entry === "string") {
    const name = entry.trim();
    return name ? [{ name, items: [] }] : [];
  }
  if (typeof entry !== "object") return [];

  const obj = entry as {
    name?: unknown;
    title?: unknown;
    category?: unknown;
    items?: unknown;
  };

  const explicitName =
    typeof obj.name === "string"
      ? obj.name.trim()
      : typeof obj.title === "string"
        ? obj.title.trim()
        : typeof obj.category === "string"
          ? obj.category.trim()
          : "";
  const explicitItems = normalizeItems(obj.items);
  const legacyItemTitle =
    typeof obj.category === "string" && typeof obj.title === "string"
      ? obj.title.trim()
      : typeof obj.category === "string" && typeof obj.name === "string"
        ? obj.name.trim()
        : "";
  const finalItems = explicitItems.length
    ? explicitItems
    : legacyItemTitle
      ? [legacyItemTitle]
      : [];
  if (explicitName) return [{ name: explicitName, items: finalItems }];

  // Legacy/object-map shape: { "Brakes": ["Pads", "Rotors"] }
  return Object.entries(entry as Record<string, unknown>)
    .map(([name, items]) => ({ name: name.trim(), items: normalizeItems(items) }))
    .filter((cat) => cat.name.length > 0);
}

export function normalizeDviCategories(
  raw: unknown,
  options: NormalizeCategoriesOptions = {},
): DviTemplateCategory[] {
  const { mergeByName = true } = options;
  const source = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const parsed = source.flatMap(normalizeCategoryEntry);
  if (!parsed.length) return [];

  if (!mergeByName) return parsed;

  // Keep category names distinct while merging duplicate names from mixed legacy payloads.
  const byName = new Map<string, string[]>();
  for (const cat of parsed) {
    if (!byName.has(cat.name)) byName.set(cat.name, []);
    const existing = byName.get(cat.name)!;
    for (const item of cat.items) {
      if (!existing.includes(item)) existing.push(item);
    }
  }

  return Array.from(byName.entries()).map(([name, items]) => ({ name, items }));
}

type Ok<Q> = Extract<Awaited<Q>, { error: null }> extends { data: infer D } ? D : never;
async function must<Q extends PromiseLike<{ data: unknown; error: unknown }>>(
  p: Q,
): Promise<Ok<Q>> {
  const { data, error } = await p;
  if (error) throw error;
  return data as Ok<Q>;
}

async function currentShopId(): Promise<string> {
  const shopId = await must(supabase.rpc("current_shop_id"));
  if (!shopId) throw new Error("This account is not assigned to an active shop.");
  return shopId;
}

export const statusesQuery = queryOptions({
  queryKey: ["statuses"],
  queryFn: async () => {
    const shopId = await currentShopId();
    return must(
      supabase.from("status_pipelines").select("*").eq("shop_id", shopId).order("step_order"),
    );
  },
});
export const baysQuery = queryOptions({
  queryKey: ["bays"],
  queryFn: async () => {
    const shopId = await currentShopId();
    return must(supabase.from("bays").select("*").eq("shop_id", shopId).order("display_order"));
  },
});
export const vendorsQuery = queryOptions({
  queryKey: ["vendors"],
  queryFn: async () => {
    const shopId = await currentShopId();
    return must(supabase.from("parts_vendors").select("*").eq("shop_id", shopId).order("name"));
  },
});
export const staffQuery = queryOptions({
  queryKey: ["staff"],
  queryFn: async () => {
    const shopId = await currentShopId();
    const [profiles, roles] = await Promise.all([
      must(
        supabase
          .from("profiles")
          .select("id,first_name,last_name,email,is_active")
          .eq("shop_id", shopId)
          .order("first_name"),
      ),
      must(supabase.from("user_roles").select("user_id,role").eq("shop_id", shopId)),
    ]);
    const byUser = new Map(roles.map((r) => [r.user_id, r.role]));
    return profiles.map((p) => ({ ...p, role: byUser.get(p.id) ?? null }));
  },
});
export const boardQuery = queryOptions({
  queryKey: ["board"],
  queryFn: async () => {
    const shopId = await currentShopId();
    return must(
      supabase
        .from("board_orders")
        .select("*")
        .eq("shop_id", shopId)
        .eq("is_archived", false)
        .order("status_updated_at", { ascending: true }),
    );
  },
});
export const BOARD_PAGE_SIZE = 100;
export const fetchBoardPage = async (page: number) => {
  const shopId = await currentShopId();
  const start = page * BOARD_PAGE_SIZE;
  return must(
    supabase
      .from("board_orders")
      .select("*")
      .eq("shop_id", shopId)
      .eq("is_archived", false)
      .order("status_updated_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + BOARD_PAGE_SIZE - 1),
  );
};
export const orderQuery = (id: string) =>
  queryOptions({
    queryKey: ["order", id],
    queryFn: async () => {
      const shopId = await currentShopId();
      return must(
        supabase.from("board_orders").select("*").eq("shop_id", shopId).eq("id", id).maybeSingle(),
      );
    },
  });
export const dviQuery = (orderId: string) =>
  queryOptions({
    queryKey: ["dvi", orderId],
    queryFn: async () => {
      const shopId = await currentShopId();
      const dvi = await must(
        supabase
          .from("dvi_inspections")
          .select("*")
          .eq("shop_id", shopId)
          .eq("repair_order_id", orderId)
          .order("created_at")
          .limit(1)
          .maybeSingle(),
      );
      if (!dvi) return null;
      const [template, items] = await Promise.all([
        must(
          supabase
            .from("dvi_templates")
            .select("*")
            .eq("shop_id", shopId)
            .eq("id", dvi.template_id)
            .maybeSingle(),
        ),
        must(
          supabase
            .from("dvi_items")
            .select("*, dvi_media(*)")
            .eq("shop_id", shopId)
            .eq("dvi_id", dvi.id)
            .order("created_at"),
        ),
      ]);
      return { dvi, template, items };
    },
  });

export const dviTemplatesQuery = queryOptions({
  queryKey: ["dvi-templates"],
  queryFn: async () => {
    const shopId = await currentShopId();
    return must(
      supabase
        .from("dvi_templates")
        .select("*")
        .eq("shop_id", shopId)
        .order("is_default", { ascending: false })
        .order("title"),
    );
  },
});
export const ACTIVITY_PAGE_SIZE = 50;
export const fetchMessagesPage = async (customerId: string, page: number) => {
  const shopId = await currentShopId();
  const start = page * ACTIVITY_PAGE_SIZE;
  return must(
    supabase
      .from("messages")
      .select("*")
      .eq("shop_id", shopId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + ACTIVITY_PAGE_SIZE - 1),
  );
};
export const fetchHistoryPage = async (orderId: string, page: number) => {
  const shopId = await currentShopId();
  const start = page * ACTIVITY_PAGE_SIZE;
  return must(
    supabase
      .from("audit_events")
      .select("*")
      .eq("shop_id", shopId)
      .eq("repair_order_id", orderId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + ACTIVITY_PAGE_SIZE - 1),
  );
};

/** One subscription per signed-in app shell; refreshes board data when anyone in the shop changes it. */
export function useBoardRealtime(shopId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!shopId) return;
    const channel = supabase
      .channel(`shop-live-${shopId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "repair_orders", filter: `shop_id=eq.${shopId}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["board"] });
          const id = (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id;
          if (id) {
            qc.invalidateQueries({ queryKey: ["order", id] });
            qc.invalidateQueries({ queryKey: ["history", id] });
            qc.invalidateQueries({ queryKey: ["dvi", id] });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `shop_id=eq.${shopId}` },
        (payload) => {
          const cid = (payload.new as { customer_id?: string })?.customer_id;
          if (cid) qc.invalidateQueries({ queryKey: ["messages", cid] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dvi_inspections", filter: `shop_id=eq.${shopId}` },
        (payload) => {
          const rid = (payload.new as { repair_order_id?: string })?.repair_order_id;
          if (rid) qc.invalidateQueries({ queryKey: ["dvi", rid] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, shopId]);
}

export const vehicleLabel = (
  o: Pick<BoardOrder, "vehicle_year" | "vehicle_make" | "vehicle_model">,
) => [o.vehicle_year, o.vehicle_make, o.vehicle_model].filter(Boolean).join(" ");
export const customerLabel = (o: Pick<BoardOrder, "customer_first_name" | "customer_last_name">) =>
  [o.customer_first_name, o.customer_last_name].filter(Boolean).join(" ");
