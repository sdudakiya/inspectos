import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Warehouse } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { parseAppError } from "@/lib/errors";
import { formatDuration, useNow } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  baysQuery,
  boardQuery,
  statusesQuery,
  customerLabel,
  vehicleLabel,
  type Bay,
  type BoardOrder,
} from "@/lib/shop-data";

export const Route = createFileRoute("/_authenticated/bays")({
  head: () => ({
    meta: [
      { title: "BayWatch — ShopOS" },
      { name: "description", content: "See which bays are busy and assign vehicles to open bays." },
      { property: "og:title", content: "BayWatch — ShopOS" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "See which bays are busy and assign vehicles to open bays.",
      },
    ],
  }),
  component: BayWatch,
});

function BayWatch() {
  const { can } = useAuth();
  const baysResult = useQuery(baysQuery);
  const ordersResult = useQuery(boardQuery);
  const statusesResult = useQuery(statusesQuery);
  const { data: bays = [], isPending: bp } = baysResult;
  const { data: orders = [], isPending: op } = ordersResult;
  const { data: statuses = [], isPending: sp } = statusesResult;
  const loading = bp || op || sp;
  const loadError = baysResult.isError || ordersResult.isError || statusesResult.isError;
  const now = useNow();
  const [assigning, setAssigning] = useState<Bay | null>(null);
  const qc = useQueryClient();

  const terminal = useMemo(
    () => new Set(statuses.filter((s) => s.is_terminal).map((s) => s.id)),
    [statuses],
  );
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const active = orders.filter((o) => !terminal.has(o.current_status_id!));
  const occupant = (bayId: string) => active.find((o) => o.bay_id === bayId);
  const unassigned = active.filter((o) => !o.bay_id);

  async function assign(order: BoardOrder, bayId: string | null) {
    const { error } = await supabase.rpc("assign_bay", {
      p_order: order.id!,
      p_bay: bayId as string,
      p_expected_version: order.row_version!,
    });
    if (error) return toast.error(parseAppError(error).message);
    toast.success(bayId ? `RO #${order.ro_number} assigned` : `RO #${order.ro_number} released`);
    qc.invalidateQueries({ queryKey: ["board"] });
    setAssigning(null);
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">BayWatch</h1>
          {loading ? (
            <Skeleton className="mt-1 h-4 w-64" />
          ) : (
            <p className="text-sm text-muted-foreground">
              {bays.filter((b) => occupant(b.id)).length} of {bays.length} bays busy ·{" "}
              {unassigned.length} vehicles waiting for a bay
            </p>
          )}
        </div>
      </div>
      {loadError && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <span>Could not load bay or repair-order data.</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void Promise.all([
                baysResult.refetch(),
                ordersResult.refetch(),
                statusesResult.refetch(),
              ])
            }
          >
            Retry
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading &&
          Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              data-testid="bay-skeleton"
              className="rounded-lg border border-dashed bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="mt-4 h-3 w-16" />
              <Skeleton className="mt-2 h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-40" />
              <Skeleton className="mt-4 h-8 w-full" />
            </div>
          ))}
        {!loading &&
          !loadError &&
          bays.map((b) => {
            const o = occupant(b.id);
            const st = o ? statusById.get(o.current_status_id!) : null;
            return (
              <div
                key={b.id}
                className={cn(
                  "relative overflow-hidden rounded-lg border bg-card p-4 shadow-raised",
                  o ? "border-primary/40" : "border-dashed",
                )}
              >
                {o && <div className="absolute inset-x-0 top-0 h-1 bg-hazard" />}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Warehouse className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-xl font-bold">{b.name}</h2>
                  </div>
                  <span className="label-caps">{b.bay_type}</span>
                </div>
                {o ? (
                  <div className="mt-3">
                    <Link
                      to="/ro/$orderId"
                      params={{ orderId: o.id! }}
                      className="block hover:underline"
                    >
                      <div className="font-mono text-xs font-bold text-primary">
                        RO #{o.ro_number}
                      </div>
                      <div className="font-medium">{customerLabel(o)}</div>
                      <div className="text-sm text-muted-foreground">{vehicleLabel(o)}</div>
                    </Link>
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      {st && (
                        <span
                          className="rounded px-1.5 py-0.5"
                          style={{ backgroundColor: `${st.color_hex}33`, color: st.color_hex }}
                        >
                          {st.label}
                        </span>
                      )}
                      <span className="font-mono text-muted-foreground">
                        {formatDuration((now - new Date(o.status_updated_at!).getTime()) / 1000)}
                      </span>
                    </div>
                    {can("ro.assign_bay") && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-3 w-full"
                        onClick={() => assign(o, null)}
                      >
                        Release bay
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="mt-3">
                    <p className="text-sm text-muted-foreground">Open</p>
                    {can("ro.assign_bay") && (
                      <Button
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => setAssigning(b)}
                        disabled={!unassigned.length}
                      >
                        Assign vehicle
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        {!loading && loadError && (
          <p className="col-span-full text-sm text-destructive">
            Bay availability is unavailable until the queries succeed.
          </p>
        )}
      </div>

      <Dialog open={!!assigning} onOpenChange={(o) => !o && setAssigning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Assign to {assigning?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-1.5 overflow-y-auto">
            {unassigned.map((o) => (
              <button
                key={o.id}
                onClick={() => assigning && assign(o, assigning.id)}
                className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left hover:bg-accent"
              >
                <span className="font-mono text-xs font-bold text-primary">#{o.ro_number}</span>
                <span className="flex-1">
                  {customerLabel(o)} ·{" "}
                  <span className="text-muted-foreground">{vehicleLabel(o)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {statusById.get(o.current_status_id!)?.label}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
