import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { parseAppError } from "@/lib/errors";
import { toE164 } from "@/lib/phone";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import {
  baysQuery,
  dviTemplatesQuery,
  normalizeDviCategories,
  staffQuery,
  statusesQuery,
  vendorsQuery,
  type Status,
} from "@/lib/shop-data";
import { inviteStaff } from "@/api/shop.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Shop settings — ShopOS" },
      {
        name: "description",
        content: "Configure your shop, status pipeline, bays, parts vendors and staff.",
      },
      { property: "og:title", content: "Shop settings — ShopOS" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Configure your shop, status pipeline, bays, parts vendors and staff.",
      },
    ],
  }),
  component: Settings,
});

const err = (e: unknown) => toast.error(parseAppError(e).message);

function Settings() {
  const { can } = useAuth();
  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Settings</h1>
      <Tabs defaultValue={can("settings.shop") ? "shop" : "staff"}>
        <TabsList>
          {can("settings.shop") && <TabsTrigger value="shop">Shop</TabsTrigger>}
          {can("settings.pipeline") && <TabsTrigger value="pipeline">Pipeline</TabsTrigger>}
          {can("settings.shop") && <TabsTrigger value="dvi">DVI templates</TabsTrigger>}
          {can("settings.shop") && <TabsTrigger value="bays">Bays & vendors</TabsTrigger>}
          <TabsTrigger value="staff">Staff</TabsTrigger>
        </TabsList>
        <TabsContent value="shop" className="mt-6">
          <ShopTab />
        </TabsContent>
        <TabsContent value="pipeline" className="mt-6">
          <PipelineTab />
        </TabsContent>
        <TabsContent value="dvi" className="mt-6">
          <DviTemplatesTab />
        </TabsContent>
        <TabsContent value="bays" className="mt-6">
          <BaysTab />
        </TabsContent>
        <TabsContent value="staff" className="mt-6">
          <StaffTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ShopTab() {
  const { me, refresh } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tz, setTz] = useState("");
  const [flags, setFlags] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (!me?.shop) return;
    setName(me.shop.name);
    setPhone(me.shop.phone_number ?? "");
    setTz(me.shop.timezone);
    setFlags(me.shop.feature_flags);
  }, [me?.shop]);

  async function save() {
    const e164 = phone ? toE164(phone) : null;
    if (phone && !e164) return toast.error("Enter a valid shop phone number");
    const { error } = await supabase
      .from("shops")
      .update({ name, phone_number: e164, timezone: tz, feature_flags: flags as never })
      .eq("id", me!.shop!.id);
    if (error) return err(error);
    toast.success("Shop saved");
    refresh();
  }

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <Label htmlFor="sn">Shop name</Label>
        <Input id="sn" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="sp">Shop phone (shown in customer messages)</Label>
        <Input id="sp" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="tz">Time zone</Label>
        <Input id="tz" value={tz} onChange={(e) => setTz(e.target.value)} />
      </div>
      <label className="flex items-center justify-between rounded-md border p-3 text-sm">
        <span>Require approved inspection before entering inspection-gated statuses</span>
        <Switch
          checked={!!flags.require_dvi}
          onCheckedChange={(v) => setFlags({ ...flags, require_dvi: v })}
        />
      </label>
      <label className="flex items-center justify-between rounded-md border p-3 text-sm">
        <span>Send automatic WhatsApp messages at check-in and when the vehicle is ready</span>
        <Switch
          checked={flags.whatsapp_milestones !== false}
          onCheckedChange={(v) => setFlags({ ...flags, whatsapp_milestones: v })}
        />
      </label>
      <Button onClick={save}>Save</Button>
    </div>
  );
}

function PipelineTab() {
  const statusesResult = useQuery(statusesQuery);
  const { data: statuses = [] } = statusesResult;
  const qc = useQueryClient();
  if (statusesResult.isError) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <span>Could not load pipeline settings.</span>
        <Button size="sm" variant="secondary" onClick={() => void statusesResult.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  async function update(s: Status, patch: Partial<Status>) {
    const { error } = await supabase.from("status_pipelines").update(patch).eq("id", s.id);
    if (error) return err(error);
    qc.invalidateQueries({ queryKey: ["statuses"] });
  }
  return (
    <div className="space-y-2">
      <p className="mb-3 text-sm text-muted-foreground">
        Rules apply when an order moves <i>into</i> the status.
      </p>
      {statuses.map((s) => (
        <div
          key={s.id}
          className="grid grid-cols-[2rem_1fr_6rem_6rem] items-center gap-3 rounded-md border bg-card p-3 text-sm"
        >
          <input
            type="color"
            aria-label="Color"
            value={s.color_hex}
            onChange={(e) => update(s, { color_hex: e.target.value })}
            className="h-7 w-7 cursor-pointer rounded bg-transparent"
          />
          <div>
            <Input
              defaultValue={s.label}
              onBlur={(e) => e.target.value !== s.label && update(s, { label: e.target.value })}
            />
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <Toggle
                label="Needs vendor"
                on={s.requires_parts_vendor}
                set={(v) => update(s, { requires_parts_vendor: v })}
              />
              <Toggle
                label="Needs QC"
                on={s.requires_qc_signoff}
                set={(v) => update(s, { requires_qc_signoff: v })}
              />
              <Toggle
                label="Needs approved DVI"
                on={s.requires_dvi_complete}
                set={(v) => update(s, { requires_dvi_complete: v })}
              />
              <Toggle
                label="Final step"
                on={s.is_terminal}
                set={(v) => update(s, { is_terminal: v })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Cooldown s</Label>
            <Input
              type="number"
              min={0}
              defaultValue={s.cooldown_seconds}
              onBlur={(e) =>
                Number(e.target.value) !== s.cooldown_seconds &&
                update(s, { cooldown_seconds: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Default min</Label>
            <Input
              type="number"
              min={0}
              defaultValue={s.default_duration_minutes}
              onBlur={(e) =>
                Number(e.target.value) !== s.default_duration_minutes &&
                update(s, { default_duration_minutes: Number(e.target.value) })
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <Switch checked={on} onCheckedChange={set} className="scale-75" /> {label}
    </label>
  );
}

type EditableCategory = { name: string; items: string[] };

function DviTemplatesTab() {
  const { me } = useAuth();
  const templatesResult = useQuery(dviTemplatesQuery);
  const { data: templates = [] } = templatesResult;
  const qc = useQueryClient();
  const shopId = me?.shop?.id ?? "";
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [categories, setCategories] = useState<EditableCategory[]>([]);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!templates.length) {
      setSelectedId("");
      return;
    }
    if (!selectedId || !templates.some((tpl) => tpl.id === selectedId)) {
      const preferred = templates.find((tpl) => tpl.is_default) ?? templates[0];
      setSelectedId(preferred.id);
    }
  }, [selectedId, templates]);

  const selected = templates.find((tpl) => tpl.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setTitle("");
      setCategories([]);
      setIsDefault(false);
      return;
    }
    setTitle(selected.title);
    setCategories(normalizeDviCategories(selected.categories, { mergeByName: false }));
    setIsDefault(selected.is_default);
  }, [selected]);

  async function createTemplate() {
    if (!shopId) return;
    const initialCategories: EditableCategory[] = [{ name: "General", items: ["Visual check"] }];
    const { data, error } = await supabase
      .from("dvi_templates")
      .insert({
        shop_id: shopId,
        title: "New inspection template",
        categories: initialCategories,
        is_default: templates.length === 0,
      })
      .select("id")
      .single();
    if (error) return err(error);
    await qc.invalidateQueries({ queryKey: ["dvi-templates"] });
    if (data?.id) setSelectedId(data.id);
    toast.success("Template created");
  }

  async function saveTemplate() {
    if (!selected || !shopId) return;
    const nextCategories = categories
      .map((cat) => ({
        name: cat.name.trim(),
        items: cat.items.map((item) => item.trim()).filter(Boolean),
      }))
      .filter((cat) => cat.name && cat.items.length);
    if (!title.trim()) return toast.error("Template title is required");
    if (!nextCategories.length) {
      return toast.error("Add at least one category with at least one item");
    }
    if (isDefault) {
      const { error: defaultErr } = await supabase
        .from("dvi_templates")
        .update({ is_default: false })
        .eq("shop_id", shopId)
        .neq("id", selected.id);
      if (defaultErr) return err(defaultErr);
    }
    const { error } = await supabase
      .from("dvi_templates")
      .update({ title: title.trim(), categories: nextCategories, is_default: isDefault })
      .eq("id", selected.id);
    if (error) return err(error);
    await qc.invalidateQueries({ queryKey: ["dvi-templates"] });
    toast.success("Template saved");
  }

  async function removeTemplate() {
    if (!selected) return;
    const { error } = await supabase.from("dvi_templates").delete().eq("id", selected.id);
    if (error) return err(error);
    await qc.invalidateQueries({ queryKey: ["dvi-templates"] });
    toast.success("Template deleted");
  }

  function updateCategoryName(index: number, name: string) {
    setCategories((prev) => prev.map((cat, i) => (i === index ? { ...cat, name } : cat)));
  }

  function updateItem(index: number, itemIndex: number, value: string) {
    setCategories((prev) =>
      prev.map((cat, i) =>
        i === index
          ? {
              ...cat,
              items: cat.items.map((item, j) => (j === itemIndex ? value : item)),
            }
          : cat,
      ),
    );
  }

  if (templatesResult.isError) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <span>Could not load DVI templates.</span>
        <Button size="sm" variant="secondary" onClick={() => void templatesResult.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Templates are shop-specific and define the items technicians see in each inspection.
      </p>
      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        <div className="space-y-2">
          <Button onClick={createTemplate} className="w-full" variant="secondary">
            New template
          </Button>
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => setSelectedId(tpl.id)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm ${selectedId === tpl.id ? "border-primary bg-primary/10" : "bg-card"}`}
            >
              <div className="font-medium">{tpl.title}</div>
              {tpl.is_default && <div className="label-caps mt-1">default</div>}
            </button>
          ))}
        </div>

        {selected ? (
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <Label htmlFor="dvi-title">Template name</Label>
              <Input
                id="dvi-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Template name"
              />
            </div>
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span>Use as default for new inspections</span>
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            </label>

            <div className="space-y-3">
              {categories.map((cat, index) => (
                <div key={`${index}-${cat.name}`} className="rounded-md border bg-card p-3">
                  <div className="mb-1 label-caps text-primary">Category {index + 1}</div>
                  <div className="mb-3 flex items-start gap-2 rounded-md border bg-primary/5 p-2">
                    <Input
                      className="font-semibold"
                      value={cat.name}
                      onChange={(e) => updateCategoryName(index, e.target.value)}
                      placeholder="Category name"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setCategories((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Items
                  </div>
                  <div className="space-y-2 border-l-2 border-muted pl-3">
                    {cat.items.map((item, itemIndex) => (
                      <div key={`${itemIndex}-${item}`} className="flex gap-2">
                        <Input
                          value={item}
                          onChange={(e) => updateItem(index, itemIndex, e.target.value)}
                          placeholder="Inspection item"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setCategories((prev) =>
                              prev.map((entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      items: entry.items.filter((_, j) => j !== itemIndex),
                                    }
                                  : entry,
                              ),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    onClick={() =>
                      setCategories((prev) =>
                        prev.map((entry, i) =>
                          i === index ? { ...entry, items: [...entry.items, ""] } : entry,
                        ),
                      )
                    }
                  >
                    Add item
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setCategories((prev) => [...prev, { name: "", items: [""] }])}
              >
                Add category
              </Button>
              <Button onClick={saveTemplate}>Save template</Button>
              <Button variant="destructive" onClick={removeTemplate}>
                Delete template
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            Create a template to configure shop DVI items.
          </div>
        )}
      </div>
    </div>
  );
}

function BaysTab() {
  const { me } = useAuth();
  const baysResult = useQuery(baysQuery);
  const vendorsResult = useQuery(vendorsQuery);
  const { data: bays = [] } = baysResult;
  const { data: vendors = [] } = vendorsResult;
  const qc = useQueryClient();
  const [bayName, setBayName] = useState("");
  const [bayType, setBayType] = useState("general");
  const [vendorName, setVendorName] = useState("");
  const shopId = me?.shop?.id ?? "";

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {(baysResult.isError || vendorsResult.isError) && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm md:col-span-2"
        >
          <span>Could not load bay or vendor settings.</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void Promise.all([baysResult.refetch(), vendorsResult.refetch()])}
          >
            Retry
          </Button>
        </div>
      )}
      <section>
        <h2 className="mb-3 text-xl font-bold">Bays</h2>
        <div className="space-y-1.5">
          {bays.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
            >
              <span className="flex-1">{b.name}</span>
              <span className="label-caps">{b.bay_type}</span>
              <button
                aria-label={`Delete ${b.name}`}
                onClick={async () => {
                  const { error } = await supabase.from("bays").delete().eq("id", b.id);
                  if (error) return err(error);
                  qc.invalidateQueries({ queryKey: ["bays"] });
                }}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await supabase.from("bays").insert({
              shop_id: shopId,
              name: bayName.trim(),
              bay_type: bayType,
              display_order: bays.length + 1,
            });
            if (error) return err(error);
            setBayName("");
            qc.invalidateQueries({ queryKey: ["bays"] });
          }}
        >
          <Input
            required
            placeholder="New bay name"
            value={bayName}
            onChange={(e) => setBayName(e.target.value)}
          />
          <Select value={bayType} onValueChange={setBayType}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["general", "lift", "alignment", "wash"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit">Add</Button>
        </form>
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">Parts vendors</h2>
        <div className="space-y-1.5">
          {vendors.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
            >
              <span className="flex-1">{v.name}</span>
              <Switch
                checked={v.is_active}
                onCheckedChange={async (on) => {
                  const { error } = await supabase
                    .from("parts_vendors")
                    .update({ is_active: on })
                    .eq("id", v.id);
                  if (error) return err(error);
                  qc.invalidateQueries({ queryKey: ["vendors"] });
                }}
                aria-label="Active"
              />
            </div>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await supabase
              .from("parts_vendors")
              .insert({ shop_id: shopId, name: vendorName.trim() });
            if (error) return err(error);
            setVendorName("");
            qc.invalidateQueries({ queryKey: ["vendors"] });
          }}
        >
          <Input
            required
            placeholder="Vendor name"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
          />
          <Button type="submit">Add</Button>
        </form>
      </section>
    </div>
  );
}

function StaffTab() {
  const { can, me } = useAuth();
  const staffResult = useQuery(staffQuery);
  const { data: staff = [] } = staffResult;
  const invitesResult = useQuery({
    queryKey: ["invites", me?.shop?.id],
    enabled: can("staff.manage") && !!me?.shop?.id,
    queryFn: async () =>
      (
        await supabase
          .from("staff_invites")
          .select("*")
          .eq("shop_id", me!.shop!.id)
          .order("created_at")
      ).data ?? [],
  });
  const { data: invites = [], refetch } = invitesResult;
  const qc = useQueryClient();
  type InviteRole = "advisor" | "technician" | "parts_specialist" | "owner";
  const [f, setF] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "advisor" as InviteRole,
  });
  const [inviteBusy, setInviteBusy] = useState(false);

  return (
    <div className="space-y-6">
      {(staffResult.isError || invitesResult.isError) && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <span>Could not load staff or invite data.</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void Promise.all([staffResult.refetch(), invitesResult.refetch()])}
          >
            Retry
          </Button>
        </div>
      )}
      <div className="space-y-1.5">
        {staff.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm"
          >
            <span className="flex-1">
              {s.first_name} {s.last_name}{" "}
              <span className="text-muted-foreground">· {s.email}</span>
            </span>
            <span className="label-caps">{s.role ? ROLE_LABELS[s.role as Role] : ""}</span>
            {can("staff.manage") && s.id !== me?.userId && (
              <Switch
                checked={s.is_active}
                aria-label="Active"
                onCheckedChange={async (on) => {
                  const { error } = await supabase.rpc("set_staff_active", {
                    p_user_id: s.id,
                    p_active: on,
                  });
                  if (error) return err(error);
                  qc.invalidateQueries({ queryKey: ["staff"] });
                }}
              />
            )}
          </div>
        ))}
        {invites.map((i) => (
          <div
            key={i.id}
            className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
          >
            <span className="flex-1">
              {i.first_name} {i.last_name} · {i.email}
            </span>
            <span className="label-caps">invited · {ROLE_LABELS[i.role as Role]}</span>
          </div>
        ))}
      </div>
      {can("staff.manage") && (
        <form
          className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setInviteBusy(true);
            try {
              const res = await inviteStaff({ data: f });
              if (!res.ok) return err(res.error);
              toast.success(
                res.data.emailed
                  ? "Invitation emailed"
                  : "Invite saved — ask them to sign up with this email",
              );
              setF({ email: "", firstName: "", lastName: "", role: "advisor" });
              refetch();
              qc.invalidateQueries({ queryKey: ["staff"] });
            } catch (error) {
              err(error);
            } finally {
              setInviteBusy(false);
            }
          }}
        >
          <div className="label-caps sm:col-span-2">Invite a team member</div>
          <Input
            required
            placeholder="First name"
            value={f.firstName}
            onChange={(e) => setF({ ...f, firstName: e.target.value })}
          />
          <Input
            required
            placeholder="Last name"
            value={f.lastName}
            onChange={(e) => setF({ ...f, lastName: e.target.value })}
          />
          <Input
            required
            type="email"
            placeholder="Email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
          <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as InviteRole })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["advisor", "technician", "parts_specialist", "owner"] as Role[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" className="sm:col-span-2" disabled={inviteBusy}>
            {inviteBusy ? "Sending…" : "Send invite"}
          </Button>
        </form>
      )}
    </div>
  );
}
