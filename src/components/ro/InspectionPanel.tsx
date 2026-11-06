import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Check, Copy, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { parseAppError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { PhotoMarkupDialog } from "@/components/ro/PhotoMarkupDialog";
import {
  dviQuery,
  dviTemplatesQuery,
  normalizeDviCategories,
  type BoardOrder,
} from "@/lib/shop-data";
import { sendInspection } from "@/api/shop.functions";

type Condition = "green" | "yellow" | "red";

const COND: Record<Condition, { label: string; cls: string }> = {
  green: { label: "Good", cls: "bg-success text-success-foreground" },
  yellow: { label: "Soon", cls: "bg-warning text-warning-foreground" },
  red: { label: "Now", cls: "bg-destructive text-destructive-foreground" },
};

async function compressImage(file: Blob, maxSide = 1600, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("Compression failed"))),
      "image/jpeg",
      quality,
    ),
  );
}

export function InspectionPanel({ order }: { order: BoardOrder }) {
  const { can, me } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(dviQuery(order.id!));
  const { data: templates = [] } = useQuery(dviTemplatesQuery);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["dvi", order.id] });

  useEffect(() => {
    if (!templates.length) {
      setTemplateId("");
      return;
    }
    const defaultTemplate = templates.find((tpl) => tpl.is_default);
    setTemplateId(defaultTemplate?.id ?? templates[0].id);
  }, [templates]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading inspection…</p>;

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">No inspection started for this vehicle yet.</p>
        {can("dvi.edit") && (
          <div className="mx-auto mt-4 max-w-md space-y-2 text-left">
            <label className="text-xs font-medium text-muted-foreground">Template</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select inspection template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.title}
                    {tpl.is_default ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              disabled={!templateId}
              onClick={async () => {
                const { error } = await supabase.rpc("dvi_start", {
                  p_order: order.id!,
                  p_template: templateId,
                });
                if (error) return toast.error(parseAppError(error).message);
                refresh();
              }}
            >
              Start inspection
            </Button>
            {!templates.length && (
              <p className="text-xs text-muted-foreground">
                Add at least one DVI template in Settings before starting an inspection.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const { dvi, template, items } = data;
  const locked = !!dvi.customer_authorized_at;
  const categories = normalizeDviCategories(template?.categories);
  const findItem = (cat: string, title: string) =>
    items.find((i) => i.category === cat && i.title === title);
  const customItems = items.filter(
    (i) => !categories.some((c) => c.name === i.category && c.items.includes(i.title)),
  );
  const customItemsByCategory = customItems.reduce<Record<string, typeof customItems>>(
    (acc, item) => {
      const key = item.category?.trim() || "Other findings";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {},
  );
  const totalCents = items.reduce((s, i) => s + Math.round(Number(i.estimated_cost ?? 0) * 100), 0);

  async function send() {
    setBusy(true);
    try {
      const res = await sendInspection({ data: { dviId: dvi.id } });
      if (!res.ok) return toast.error(parseAppError(res.error).message);
      setPortalUrl(res.data.portalUrl);
      toast.success("Inspection sent", {
        description:
          res.data.whatsapp === "sent"
            ? "Customer notified on WhatsApp"
            : (res.data.reason ?? "Share the link with the customer"),
      });
      refresh();
      qc.invalidateQueries({ queryKey: ["board"] });
    } catch (error) {
      toast.error(parseAppError(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-surface p-4">
        <div className="flex-1">
          <div className="label-caps">Inspection</div>
          <div className="font-medium">{template?.title}</div>
          <div className="text-xs text-muted-foreground">
            {items.length} findings · estimate ${(totalCents / 100).toFixed(2)}
            {dvi.sent_at && ` · sent ${new Date(dvi.sent_at).toLocaleString()}`}
            {dvi.customer_viewed_at && ` · viewed by customer`}
          </div>
        </div>
        {locked ? (
          <span className="inline-flex items-center gap-1.5 rounded bg-success/20 px-3 py-1.5 text-sm text-success">
            <Check className="h-4 w-4" /> Approved{" "}
            {new Date(dvi.customer_authorized_at!).toLocaleString()}
          </span>
        ) : (
          can("dvi.send") && (
            <Button onClick={send} disabled={busy || !items.length}>
              <Send /> {dvi.sent_at ? "Resend to customer" : "Send to customer"}
            </Button>
          )
        )}
      </div>
      {portalUrl && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
          <span className="flex-1 truncate font-mono">{portalUrl}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(portalUrl);
              toast.success("Link copied");
            }}
          >
            <Copy /> Copy
          </Button>
        </div>
      )}

      {categories.map((cat) => (
        <section key={cat.name}>
          <div className="mb-2 rounded-md border bg-primary/5 px-3 py-2">
            <div className="label-caps text-primary">Category</div>
            <h3 className="text-lg font-semibold uppercase tracking-wide">{cat.name}</h3>
          </div>
          <div className="space-y-2 border-l-2 border-muted pl-3">
            {cat.items.map((title) => (
              <ItemRow
                key={title}
                dviId={dvi.id}
                shopId={me?.shop?.id ?? ""}
                category={cat.name}
                title={title}
                item={findItem(cat.name, title)}
                locked={locked || !can("dvi.edit")}
                onSaved={refresh}
              />
            ))}
          </div>
        </section>
      ))}
      {Object.entries(customItemsByCategory).map(([categoryName, categoryItems]) => (
        <section key={categoryName}>
          <div className="mb-2 rounded-md border bg-primary/5 px-3 py-2">
            <div className="label-caps text-primary">Category</div>
            <h3 className="text-lg font-semibold uppercase tracking-wide">{categoryName}</h3>
          </div>
          <div className="space-y-2 border-l-2 border-muted pl-3">
            {categoryItems.map((i) => (
              <ItemRow
                key={i.id}
                dviId={dvi.id}
                shopId={me?.shop?.id ?? ""}
                category={i.category}
                title={i.title}
                item={i}
                locked={locked || !can("dvi.edit")}
                onSaved={refresh}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type Item = NonNullable<
  Awaited<ReturnType<NonNullable<ReturnType<typeof dviQuery>["queryFn"]>>>
>["items"][number];

function ItemRow({
  dviId,
  shopId,
  category,
  title,
  item,
  locked,
  onSaved,
}: {
  dviId: string;
  shopId: string;
  category: string;
  title: string;
  item?: Item;
  locked: boolean;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(item?.technician_notes ?? "");
  const [cost, setCost] = useState(item?.estimated_cost != null ? String(item.estimated_cost) : "");
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    setNotes(item?.technician_notes ?? "");
    setCost(item?.estimated_cost != null ? String(item.estimated_cost) : "");
  }, [item?.id, item?.technician_notes, item?.estimated_cost]);

  useEffect(() => {
    const media = item?.dvi_media ?? [];
    if (!media.length) return;
    supabase.storage
      .from("dvi-media")
      .createSignedUrls(
        media.map((m) => m.storage_key),
        3600,
      )
      .then(({ data }) => {
        const out: Record<string, string> = {};
        data?.forEach((d, i) => {
          const m = media[i];
          if (m && d.signedUrl) out[m.id] = d.signedUrl;
        });
        setPhotos(out);
      });
  }, [item?.dvi_media]);

  async function save(patch: { condition?: Condition; notes?: string; cost?: string }) {
    const condition = patch.condition ?? (item?.condition as Condition | undefined);
    if (!condition) return toast.message("Pick a condition first");
    const c = patch.cost ?? cost;
    const row = {
      id: item?.id,
      shop_id: shopId,
      dvi_id: dviId,
      category,
      title,
      condition,
      technician_notes: (patch.notes ?? notes) || null,
      estimated_cost: c ? Number(c) : null,
    };
    const { error } = await supabase.from("dvi_items").upsert(row);
    if (error) return toast.error(parseAppError(error).message);
    onSaved();
  }

  const [pending, setPending] = useState<File | null>(null);

  async function upload(file: Blob) {
    setPending(null);
    if (!item) return toast.message("Set a condition before adding photos");
    try {
      const blob = await compressImage(file);
      const key = `${shopId}/dvi/${dviId}/${item.id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("dvi-media")
        .upload(key, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { error } = await supabase.from("dvi_media").insert({
        shop_id: shopId,
        dvi_item_id: item.id,
        storage_key: key,
        content_type: "image/jpeg",
        byte_size: blob.size,
      });
      if (error) throw error;
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const cond = item?.condition as Condition | undefined;
  return (
    <div
      className={cn(
        "rounded-md border bg-card p-3",
        cond === "red" && "border-destructive/50",
        cond === "yellow" && "border-warning/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex-1 font-medium">{title}</span>
        <div className="flex gap-1">
          {(Object.keys(COND) as Condition[]).map((c) => (
            <button
              key={c}
              disabled={locked}
              onClick={() => save({ condition: c })}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-semibold transition-opacity",
                cond === c
                  ? COND[c].cls
                  : "bg-secondary text-secondary-foreground opacity-70 hover:opacity-100",
              )}
            >
              {COND[c].label}
            </button>
          ))}
        </div>
      </div>
      {item && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
          <Textarea
            rows={1}
            placeholder="Notes for the customer"
            value={notes}
            disabled={locked}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (item.technician_notes ?? "") && save({ notes })}
          />
          <Input
            inputMode="decimal"
            placeholder="Est. $"
            value={cost}
            disabled={locked}
            onChange={(e) => setCost(e.target.value)}
            onBlur={() =>
              cost !== (item.estimated_cost != null ? String(item.estimated_cost) : "") &&
              save({ cost })
            }
          />
          <label
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-secondary px-3 text-sm",
              locked && "pointer-events-none opacity-50",
            )}
          >
            <Camera className="h-4 w-4" /> Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const fl = e.target.files?.[0];
                e.target.value = "";
                if (fl) setPending(fl);
              }}
            />
          </label>
          <PhotoMarkupDialog file={pending} onCancel={() => setPending(null)} onDone={upload} />
        </div>
      )}
      {!!item?.dvi_media?.length && (
        <div className="mt-2 flex flex-wrap gap-2">
          {item.dvi_media.map((m) =>
            photos[m.id] ? (
              <div key={m.id} className="group relative">
                <img
                  src={photos[m.id]}
                  alt={title}
                  className="h-20 w-28 rounded object-cover"
                  loading="lazy"
                />
                {!locked && (
                  <button
                    className="absolute right-1 top-1 rounded bg-background/80 p-1 opacity-0 group-hover:opacity-100"
                    aria-label="Remove photo"
                    onClick={async () => {
                      await supabase.storage.from("dvi-media").remove([m.storage_key]);
                      await supabase.from("dvi_media").delete().eq("id", m.id);
                      onSaved();
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
