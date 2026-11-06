import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { parseAppError } from "@/lib/errors";
import {
  statusesQuery,
  vendorsQuery,
  baysQuery,
  staffQuery,
  boardQuery,
  customerLabel,
  type BoardOrder,
} from "@/lib/shop-data";
import { transitionOrder } from "@/api/shop.functions";

export function TransitionDialog({
  order,
  onClose,
}: {
  order: BoardOrder | null;
  onClose: () => void;
}) {
  const { data: statuses = [] } = useQuery(statusesQuery);
  const { data: vendors = [] } = useQuery(vendorsQuery);
  const { data: bays = [] } = useQuery(baysQuery);
  const { data: staff = [] } = useQuery(staffQuery);
  const { data: board = [] } = useQuery(boardQuery);
  const { can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tech, setTech] = useState("");
  const [bay, setBay] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [vendor, setVendor] = useState<string>("");
  const [qc_, setQc] = useState(false);
  const [eta, setEta] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order) return;
    const cur = statuses.find((s) => s.id === order.current_status_id);
    const next = statuses.find((s) => cur && s.step_order > cur.step_order);
    setTarget(next?.id ?? null);
    setVendor(order.parts_vendor_id ?? "");
    setQc(order.qc_status === "passed");
    setEta("");
    setNotes("");
    setTech(order.assigned_technician_id ?? "");
    setBay(order.bay_id ?? "");
  }, [order, statuses]);

  const tgt = useMemo(() => statuses.find((s) => s.id === target), [statuses, target]);
  const cur = useMemo(
    () => statuses.find((s) => s.id === order?.current_status_id),
    [statuses, order],
  );
  const startsLabor = tgt?.status_code === "IN_LABOR";
  const dviBlocked =
    cur?.status_code === "DVI_INSPECTION" &&
    !!tgt &&
    tgt.step_order > cur.step_order &&
    order?.dvi_status !== "sent" &&
    order?.dvi_status !== "approved";
  const techs = staff.filter((s) => s.is_active && s.role === "technician");
  const techOptions = techs.length ? techs : staff.filter((s) => s.is_active);
  const busyBays = new Set(
    board.filter((o) => o.id !== order?.id && o.bay_id).map((o) => o.bay_id),
  );
  const needsVendor = !!tgt?.requires_parts_vendor;
  const needsQc = !!tgt?.requires_qc_signoff && !!tgt?.is_terminal && order?.qc_status !== "passed";
  const askEta = tgt?.time_select_mode === 2 || tgt?.time_select_mode === 4;

  async function submit() {
    if (!order?.id || !tgt) return;
    setBusy(true);
    try {
      const res = await transitionOrder({
        data: {
          orderId: order.id,
          statusId: tgt.id,
          expectedVersion: order.row_version ?? undefined,
          etaMinutes: eta ? Number(eta) : undefined,
          partsVendorId: vendor || undefined,
          qcSignoff: qc_ || undefined,
          notes: notes || undefined,
          technicianId:
            startsLabor && tech && tech !== order.assigned_technician_id ? tech : undefined,
          bayId: startsLabor && bay && bay !== order.bay_id ? bay : undefined,
        },
      });
      if (!res.ok) {
        const e = parseAppError(res.error);
        toast.error(e.retryAfterSeconds ? `${e.message} (${e.retryAfterSeconds}s)` : e.message);
        if (e.code === "STALE_VERSION") qc.invalidateQueries({ queryKey: ["board"] });
        return;
      }
      toast.success(`RO #${order.ro_number} → ${tgt.label}`, {
        description: res.data.notified ?? undefined,
      });
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["order", order.id] });
      if (tgt.status_code === "DVI_INSPECTION") {
        // Jump straight into the inspection screen; it opens on the Inspection tab.
        onClose();
        navigate({ to: "/ro/$orderId", params: { orderId: order.id } });
        return;
      }
      onClose();
    } catch (error) {
      toast.error(parseAppError(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <DialogTitle className="font-display text-2xl">
            Move RO #{order?.ro_number}{" "}
            <span className="text-muted-foreground">· {order && customerLabel(order)}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="grid grid-cols-1 gap-1.5">
            {statuses.map((s) => {
              const current = s.id === order?.current_status_id;
              return (
                <Button
                  variant="ghost"
                  key={s.id}
                  disabled={current}
                  onClick={() => setTarget(s.id)}
                  className={cn(
                    "h-auto w-full items-center justify-start gap-3 whitespace-normal rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    target === s.id ? "border-primary bg-primary/10" : "hover:bg-accent",
                    current && "cursor-default opacity-50",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.color_hex }}
                  />
                  <span className="flex-1">{s.label}</span>
                  {current && <span className="label-caps">Current</span>}
                  {s.requires_parts_vendor && (
                    <span className="text-[10px] text-muted-foreground">vendor</span>
                  )}
                  {s.requires_qc_signoff && s.is_terminal && (
                    <span className="text-[10px] text-muted-foreground">QC</span>
                  )}
                </Button>
              );
            })}
          </div>

          {needsVendor && (
            <div>
              <Label>Parts vendor</Label>
              <Select value={vendor} onValueChange={setVendor}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors
                    .filter((v) => v.is_active)
                    .map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {dviBlocked && (
            <p
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            >
              Send the inspection to the customer before moving this order on. Open the order's
              Inspection tab to send it.
            </p>
          )}
          {startsLabor && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-primary/40 bg-primary/5 p-3">
              <p className="label-caps col-span-2">Assign work</p>
              <div>
                <Label>Technician *</Label>
                <Select value={tech} onValueChange={setTech}>
                  <SelectTrigger aria-invalid={!tech} className={cn(!tech && "border-destructive")}>
                    <SelectValue placeholder="Choose technician" />
                  </SelectTrigger>
                  <SelectContent>
                    {techOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!tech && <p className="mt-1 text-xs text-destructive">Required to start work.</p>}
              </div>
              <div>
                <Label>Bay</Label>
                <Select value={bay} onValueChange={setBay}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose bay" />
                  </SelectTrigger>
                  <SelectContent>
                    {bays.map((b) => (
                      <SelectItem key={b.id} value={b.id} disabled={busyBays.has(b.id)}>
                        {b.name}
                        {busyBays.has(b.id) ? " (occupied)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {needsQc && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={qc_}
                onCheckedChange={(v) => setQc(v === true)}
                disabled={!can("qc.signoff")}
              />
              Quality control passed (road test complete)
            </label>
          )}
          {askEta && (
            <div>
              <Label htmlFor="eta">Time estimate (minutes)</Label>
              <Input
                id="eta"
                type="number"
                min={0}
                placeholder={
                  tgt?.default_duration_minutes ? String(tgt.default_duration_minutes) : "Optional"
                }
                value={eta}
                onChange={(e) => setEta(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-5 py-4 sm:space-x-0">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-auto min-h-9 whitespace-normal"
            onClick={submit}
            disabled={
              !tgt ||
              busy ||
              (needsVendor && !vendor) ||
              (needsQc && !qc_) ||
              (startsLabor && !tech) ||
              dviBlocked
            }
          >
            Move to {tgt?.label ?? "…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
