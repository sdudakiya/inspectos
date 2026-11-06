import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Car, Search, UserRound, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toE164 } from "@/lib/phone";
import { parseAppError } from "@/lib/errors";
import { validateCheckin, type CheckinFields } from "@/lib/checkin-validation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { quickAddOrder } from "@/api/shop.functions";

const empty = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  optIn: false,
  year: "",
  make: "",
  model: "",
  vin: "",
  plate: "",
  odometer: "",
  concern: "",
  keytag: "",
  waitType: "dropoff",
  eta: "",
};
type Form = typeof empty;
type Customer = {
  id: string;
  first_name: string;
  last_name: string;
  phone_mobile: string;
  email: string | null;
  whatsapp_opt_in: boolean;
};
type Vehicle = {
  id: string;
  year: number;
  make: string;
  model: string;
  license_plate: string | null;
  vin: string | null;
};

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function Field({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-err`} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function QuickAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useAuth();
  const shopId = me?.shop?.id;
  const [f, setF] = useState<Form>(empty);
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicleId, setVehicleId] = useState<string | "new">("new");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const term = useDebounced(search.trim());

  const { data: matches = [] } = useQuery({
    queryKey: ["customer-search", shopId, term],
    enabled: !!shopId && term.length >= 2 && !customer,
    queryFn: async () => {
      const safe = term.replace(/[%,()]/g, "");
      const digits = safe.replace(/\D/g, "");
      const ors = [`first_name.ilike.%${safe}%`, `last_name.ilike.%${safe}%`];
      if (digits.length >= 3) ors.push(`phone_mobile.ilike.%${digits}%`);
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, phone_mobile, email, whatsapp_opt_in")
        .eq("shop_id", shopId!)
        .or(ors.join(","))
        .limit(6);
      if (error) throw error;
      return data as Customer[];
    },
  });

  const { data: garage = [] } = useQuery({
    queryKey: ["customer-vehicles", shopId, customer?.id],
    enabled: !!shopId && !!customer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, year, make, model, license_plate, vin")
        .eq("shop_id", shopId!)
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Vehicle[];
    },
  });

  useEffect(() => {
    setVehicleId(garage[0]?.id ?? "new");
  }, [garage]);

  const [proceedAnyway, setProceedAnyway] = useState(false);
  useEffect(() => {
    setProceedAnyway(false);
  }, [vehicleId]);
  const { data: activeRo } = useQuery({
    queryKey: ["vehicle-active-ro", shopId, vehicleId],
    enabled: open && !!shopId && vehicleId !== "new",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repair_orders")
        .select("id, ro_number, status_pipelines!inner(label, is_terminal)")
        .eq("shop_id", shopId!)
        .eq("vehicle_id", vehicleId)
        .eq("is_archived", false)
        .eq("status_pipelines.is_terminal", false)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const r = data?.[0] as unknown as
        { id: string; ro_number: string; status_pipelines: { label: string } } | undefined;
      return r ? { id: r.id, roNumber: r.ro_number, status: r.status_pipelines.label } : null;
    },
  });
  const blockedByActive = !!activeRo && vehicleId !== "new" && !proceedAnyway;

  const errors = useMemo(
    () =>
      validateCheckin(f as unknown as CheckinFields, {
        existingCustomer: !!customer,
        existingVehicle: vehicleId !== "new",
      }),
    [f, customer, vehicleId],
  );
  const show = (k: keyof Form) =>
    submitted || touched[k] ? (errors as Record<string, string | undefined>)[k] : undefined;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });
  const inp = (k: keyof Form) => ({
    id: `qa-${k}`,
    value: f[k] as string,
    onChange: set(k),
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
    "aria-invalid": !!show(k),
    "aria-describedby": show(k) ? `qa-${k}-err` : undefined,
    className: cn(show(k) && "border-destructive focus-visible:ring-destructive"),
  });

  function reset() {
    setF(empty);
    setTouched({});
    setSubmitted(false);
    setSearch("");
    setCustomer(null);
    setVehicleId("new");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length || blockedByActive) return;
    setBusy(true);
    try {
      const res = await quickAddOrder({
        data: {
          customer: customer
            ? { id: customer.id }
            : {
                firstName: f.firstName.trim(),
                lastName: f.lastName.trim(),
                phoneMobile: toE164(f.phone)!,
                email: f.email.trim(),
                whatsappOptIn: f.optIn,
              },
          vehicle:
            vehicleId !== "new"
              ? { id: vehicleId, odometerIn: f.odometer ? Number(f.odometer) : undefined }
              : {
                  year: Number(f.year),
                  make: f.make.trim(),
                  model: f.model.trim(),
                  vin: f.vin.trim() || undefined,
                  licensePlate: f.plate.trim() || undefined,
                  odometerIn: f.odometer ? Number(f.odometer) : undefined,
                },
          concern: f.concern.trim() || undefined,
          keytag: f.keytag.trim() || undefined,
          waitType: f.waitType as "dropoff",
          etaMinutes: f.eta ? Number(f.eta) : undefined,
        },
      });
      if (!res.ok) return toast.error(parseAppError(res.error).message);
      toast.success("Vehicle checked in", { description: res.data.notified ?? undefined });
      qc.invalidateQueries({ queryKey: ["board"] });
      reset();
      onClose();
      navigate({ to: "/ro/$orderId", params: { orderId: res.data.orderId } });
    } catch (error) {
      toast.error(parseAppError(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Check in a vehicle</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="label-caps mb-2">Customer</legend>
            {customer ? (
              <div className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
                <UserRound className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <div className="font-medium">
                    {customer.first_name} {customer.last_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {customer.phone_mobile}
                    {customer.email ? ` · ${customer.email}` : ""}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCustomer(null);
                    setVehicleId("new");
                  }}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    aria-label="Find returning customer"
                    placeholder="Returning customer? Search name or phone"
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {term.length >= 2 && matches.length > 0 && (
                    <div
                      role="listbox"
                      className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-raised"
                    >
                      {matches.map((c) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          key={c.id}
                          onClick={() => {
                            setCustomer(c);
                            setSearch("");
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="font-medium">
                            {c.first_name} {c.last_name}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {c.phone_mobile}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="qa-firstName" label="First name" error={show("firstName")}>
                    <Input {...inp("firstName")} />
                  </Field>
                  <Field id="qa-lastName" label="Last name" error={show("lastName")}>
                    <Input {...inp("lastName")} />
                  </Field>
                  <Field id="qa-phone" label="Mobile phone" error={show("phone")}>
                    <Input {...inp("phone")} inputMode="tel" placeholder="(555) 123-4567" />
                  </Field>
                  <Field id="qa-email" label="Email (optional)" error={show("email")}>
                    <Input {...inp("email")} type="email" />
                  </Field>
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={f.optIn}
                      onCheckedChange={(v) => setF({ ...f, optIn: v === true })}
                    />
                    Customer agreed to receive WhatsApp updates
                  </label>
                </div>
              </>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="label-caps mb-2">Vehicle</legend>
            {customer && garage.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {garage.map((v) => (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => setVehicleId(v.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm",
                      vehicleId === v.id ? "border-primary bg-primary/10" : "hover:bg-accent",
                    )}
                  >
                    <Car className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">
                      {v.year} {v.make} {v.model}
                    </span>
                    {v.license_plate && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {v.license_plate}
                      </span>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setVehicleId("new")}
                  className={cn(
                    "rounded-md border border-dashed px-3 py-2 text-left text-sm",
                    vehicleId === "new" ? "border-primary bg-primary/10" : "hover:bg-accent",
                  )}
                >
                  + Add another vehicle
                </button>
              </div>
            )}
            {activeRo && vehicleId !== "new" && (
              <div
                role="alert"
                className="space-y-2 rounded-md border border-primary/50 bg-primary/10 p-3 text-sm"
              >
                <p className="font-medium">
                  This vehicle already has an open repair order: RO #{activeRo.roNumber} (
                  {activeRo.status}).
                </p>
                <p className="text-muted-foreground">
                  Add new work to that order instead of opening a second one.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      reset();
                      onClose();
                      navigate({ to: "/ro/$orderId", params: { orderId: activeRo.id } });
                    }}
                  >
                    Open RO #{activeRo.roNumber}
                  </Button>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={proceedAnyway}
                      onCheckedChange={(v) => setProceedAnyway(v === true)}
                      aria-label="Open a second repair order anyway"
                    />
                    Open a second order anyway
                  </label>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              {vehicleId === "new" && (
                <>
                  <Field id="qa-year" label="Year" error={show("year")}>
                    <Input {...inp("year")} inputMode="numeric" maxLength={4} />
                  </Field>
                  <Field id="qa-make" label="Make" error={show("make")}>
                    <Input {...inp("make")} />
                  </Field>
                  <Field id="qa-model" label="Model" error={show("model")}>
                    <Input {...inp("model")} />
                  </Field>
                  <Field id="qa-plate" label="Plate" error={show("plate")}>
                    <Input {...inp("plate")} />
                  </Field>
                  <Field id="qa-vin" label="VIN" error={show("vin")}>
                    <Input
                      {...inp("vin")}
                      maxLength={17}
                      className={cn("uppercase", show("vin") && "border-destructive")}
                    />
                  </Field>
                </>
              )}
              <Field id="qa-odometer" label="Odometer" error={show("odometer")}>
                <Input {...inp("odometer")} inputMode="numeric" />
              </Field>
            </div>
          </fieldset>

          <fieldset className="grid grid-cols-3 gap-3">
            <legend className="label-caps mb-2">Visit</legend>
            <div className="col-span-3">
              <Label htmlFor="qa-c">Concern</Label>
              <Textarea id="qa-c" rows={2} value={f.concern} onChange={set("concern")} />
            </div>
            <div>
              <Label>Wait type</Label>
              <Select value={f.waitType} onValueChange={(v) => setF({ ...f, waitType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="waiting">Waiting</SelectItem>
                  <SelectItem value="dropoff">Drop-off</SelectItem>
                  <SelectItem value="shuttle">Shuttle</SelectItem>
                  <SelectItem value="loaner">Loaner</SelectItem>
                  <SelectItem value="tow">Tow-in</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="qa-k">Key tag</Label>
              <Input id="qa-k" value={f.keytag} onChange={set("keytag")} />
            </div>
            <Field id="qa-eta" label="Promised in (min)" error={show("eta")}>
              <Input {...inp("eta")} inputMode="numeric" />
            </Field>
          </fieldset>
          {submitted && Object.keys(errors).length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              Fix the highlighted fields to check in.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || blockedByActive}>
              {busy ? "Checking in…" : "Check in"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
