import { Link } from "@tanstack/react-router";
import { ArrowRight, Car, ClipboardCheck, MessageCircle, Timer, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { etaState, formatDuration, useNow } from "@/lib/time";
import { customerLabel, vehicleLabel, type Bay, type BoardOrder } from "@/lib/shop-data";

const WAIT_LABEL: Record<string, string> = {
  waiting: "Waiting",
  dropoff: "Drop-off",
  shuttle: "Shuttle",
  loaner: "Loaner",
  tow: "Tow-in",
};
const DVI_LABEL: Record<string, string> = {
  not_started: "DVI Not sent",
  in_progress: "DVI In progress",
  sent: "DVI Sent",
  approved: "DVI Approved",
};

export function OrderCard({
  order,
  bay,
  onMove,
  canMove,
}: {
  order: BoardOrder;
  bay?: Bay | undefined;
  onMove: (o: BoardOrder) => void;
  canMove: boolean;
}) {
  const now = useNow();
  const inStatus = order.status_updated_at
    ? (now - new Date(order.status_updated_at).getTime()) / 1000
    : 0;
  const eta = etaState(order.eta_due_at, now);
  const dviStatus = order.dvi_status ?? "not_started";
  if (!order.id) return null;

  return (
    <div
      className={cn(
        "group relative rounded-md border bg-card p-3 shadow-raised transition-colors hover:border-primary/50",
        eta?.tone === "late" && "border-destructive/60",
      )}
    >
      <Link to="/ro/$orderId" params={{ orderId: order.id }} className="block">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-xs font-bold text-primary">RO #{order.ro_number}</div>
            <div className="mt-0.5 font-medium leading-tight">{customerLabel(order)}</div>
          </div>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-secondary-foreground">
            {WAIT_LABEL[order.wait_type ?? "dropoff"]}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Car className="h-3.5 w-3.5" />
          <span className="truncate">{vehicleLabel(order)}</span>
          {order.license_plate && (
            <span className="font-mono text-[11px]">· {order.license_plate}</span>
          )}
        </div>
        {order.concern && (
          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{order.concern}</p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono">
            <Timer className="h-3 w-3" />
            {formatDuration(inStatus)}
          </span>
          {eta && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono",
                eta.tone === "late" && "bg-destructive/20 text-destructive",
                eta.tone === "soon" && "bg-warning/20 text-warning",
                eta.tone === "ok" && "bg-muted text-muted-foreground",
              )}
            >
              {eta.label}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
              dviStatus === "approved"
                ? "bg-success/20 text-success"
                : dviStatus === "sent"
                  ? "bg-info/20 text-info"
                  : "bg-warning/20 text-warning",
            )}
          >
            <ClipboardCheck className="h-3 w-3" />
            {DVI_LABEL[dviStatus] ?? DVI_LABEL.not_started}
          </span>
          {bay && (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <Warehouse className="h-3 w-3" />
              {bay.name}
            </span>
          )}
          {order.whatsapp_opt_in && (
            <MessageCircle className="h-3 w-3 text-success" aria-label="WhatsApp opted in" />
          )}
        </div>
      </Link>
      {canMove && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onMove(order)}
          className="absolute bottom-2 right-2 h-6 w-6 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus:opacity-100"
          aria-label={`Move RO ${order.ro_number}`}
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
