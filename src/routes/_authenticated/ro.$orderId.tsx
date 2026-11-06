import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArrowLeft, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TransitionDialog } from "@/components/board/TransitionDialog";
import { InspectionPanel } from "@/components/ro/InspectionPanel";
import { MessagesPanel } from "@/components/ro/MessagesPanel";
import { useAuth } from "@/lib/auth-context";
import { parseAppError } from "@/lib/errors";
import { formatPhone } from "@/lib/phone";
import { etaState, formatDuration, useNow } from "@/lib/time";
import {
  ACTIVITY_PAGE_SIZE,
  baysQuery,
  fetchHistoryPage,
  orderQuery,
  staffQuery,
  statusesQuery,
  customerLabel,
  vehicleLabel,
} from "@/lib/shop-data";

export const Route = createFileRoute("/_authenticated/ro/$orderId")({
  head: () => ({
    meta: [
      { title: "Repair order — ShopOS" },
      {
        name: "description",
        content: "Repair order details, inspection, customer messages and history.",
      },
      { property: "og:title", content: "Repair order — ShopOS" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Repair order details, inspection, customer messages and history.",
      },
    ],
  }),
  component: OrderPage,
});

function OrderPage() {
  const { orderId } = Route.useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const now = useNow();
  const orderResult = useQuery(orderQuery(orderId));
  const statusesResult = useQuery(statusesQuery);
  const baysResult = useQuery(baysQuery);
  const staffResult = useQuery(staffQuery);
  const historyResult = useInfiniteQuery({
    queryKey: ["history", orderId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchHistoryPage(orderId, pageParam),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === ACTIVITY_PAGE_SIZE ? pages.length : undefined,
  });
  const { data: order, isLoading } = orderResult;
  const { data: statuses = [] } = statusesResult;
  const { data: bays = [] } = baysResult;
  const { data: staff = [] } = staffResult;
  const history = historyResult.data?.pages.flat() ?? [];
  const loadError =
    orderResult.isError || statusesResult.isError || baysResult.isError || staffResult.isError;
  const [moving, setMoving] = useState(false);

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (loadError) {
    return (
      <div
        role="alert"
        className="m-6 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <span>Could not load this repair order or its related shop data.</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            void Promise.all([
              orderResult.refetch(),
              statusesResult.refetch(),
              baysResult.refetch(),
              staffResult.refetch(),
              historyResult.refetch(),
            ])
          }
        >
          Retry
        </Button>
      </div>
    );
  }
  if (!order)
    return (
      <div className="p-6">
        Repair order not found.{" "}
        <Link to="/board" className="text-primary">
          Back to board
        </Link>
      </div>
    );

  const status = statuses.find((s) => s.id === order.current_status_id);
  const statusName = (id: unknown) => statuses.find((s) => s.id === id)?.label ?? "—";
  const eta = etaState(order.eta_due_at, now);
  const techs = staff.filter((s) => s.is_active && (s.role === "technician" || s.role === "owner"));

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link
        to="/board"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Board
      </Link>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <div className="font-mono text-sm font-bold text-primary">RO #{order.ro_number}</div>
          <h1 className="text-4xl font-bold">{customerLabel(order)}</h1>
          <p className="text-muted-foreground">
            {vehicleLabel(order)} {order.license_plate && `· ${order.license_plate}`}{" "}
            {order.vin && `· VIN ${order.vin}`} · {formatPhone(order.customer_phone)}
          </p>
          {order.concern && <p className="mt-2 max-w-2xl">{order.concern}</p>}
        </div>
        <div className="flex gap-2">
          {can("ro.transition") && (
            <Button onClick={() => setMoving(true)}>
              <ArrowRight /> Move
            </Button>
          )}
          {can("ro.archive") && (
            <Button
              variant="secondary"
              onClick={async () => {
                if (!confirm(`Archive RO #${order.ro_number}? It will leave the board.`)) return;
                const { error } = await supabase.rpc("archive_order", { p_order: order.id! });
                if (error) return toast.error(parseAppError(error).message);
                qc.invalidateQueries({ queryKey: ["board"] });
                navigate({ to: "/board" });
              }}
            >
              <Archive /> Archive
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Status">
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: status?.color_hex }}
            />
            {status?.label}
          </span>
        </Stat>
        <Stat label="In status">
          {formatDuration((now - new Date(order.status_updated_at!).getTime()) / 1000)}
        </Stat>
        <Stat label="Promised">{eta ? eta.label : "—"}</Stat>
        <Stat label="QC">{order.qc_status}</Stat>
        <Stat label="Bay">
          <Select
            value={order.bay_id ?? "none"}
            disabled={!can("ro.assign_bay")}
            onValueChange={async (v) => {
              const { error } = await supabase.rpc("assign_bay", {
                p_order: order.id!,
                p_bay: (v === "none" ? null : v) as string,
                p_expected_version: order.row_version!,
              });
              if (error) return toast.error(parseAppError(error).message);
              qc.invalidateQueries({ queryKey: ["order", orderId] });
            }}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No bay</SelectItem>
              {bays.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Stat>
        <Stat label="Technician">
          <Select
            value={order.assigned_technician_id ?? "none"}
            disabled={!can("ro.assign_bay")}
            onValueChange={async (v) => {
              const { error } = await supabase.rpc("assign_technician", {
                p_order: order.id!,
                p_tech: (v === "none" ? null : v) as string,
              });
              if (error) return toast.error(parseAppError(error).message);
              qc.invalidateQueries({ queryKey: ["order", orderId] });
            }}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {techs.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.first_name} {t.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Stat>
        <Stat label="Wait">{order.wait_type}</Stat>
        <Stat label="Key tag">{order.keytag ?? "—"}</Stat>
      </div>

      <Tabs defaultValue="inspection" className="mt-8">
        <TabsList>
          <TabsTrigger value="inspection">Inspection</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="inspection" className="mt-4">
          <InspectionPanel order={order} />
        </TabsContent>
        <TabsContent value="messages" className="mt-4">
          <MessagesPanel order={order} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          {historyResult.isError && !historyResult.data && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"
            >
              <span>Could not load repair-order history.</span>
              <Button size="sm" variant="secondary" onClick={() => void historyResult.refetch()}>
                Retry
              </Button>
            </div>
          )}
          <ol className="space-y-2">
            {history.map((h) => {
              const p = h.payload as Record<string, unknown>;
              return (
                <li key={h.id} className="flex gap-3 rounded-md border bg-card px-3 py-2 text-sm">
                  <span className="w-40 shrink-0 font-mono text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleString()}
                  </span>
                  <span className="flex-1">
                    {h.event_type === "STATUS_TRANSITION" ? (
                      <>
                        Moved from <b>{statusName(p.fromStatusId)}</b> to{" "}
                        <b>{statusName(p.toStatusId)}</b> after{" "}
                        {formatDuration(Number(p.durationSeconds ?? 0))}
                        {p.notes ? ` — ${p.notes}` : ""}
                      </>
                    ) : (
                      h.event_type.replace(/_/g, " ").toLowerCase()
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          {!history.length && !historyResult.isError && (
            <p className="text-sm text-muted-foreground">No history recorded yet.</p>
          )}
          {historyResult.isFetchNextPageError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              Could not load older history.
            </p>
          )}
          {historyResult.hasNextPage && (
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              disabled={historyResult.isFetchingNextPage}
              onClick={() => void historyResult.fetchNextPage()}
            >
              {historyResult.isFetchingNextPage
                ? "Loading…"
                : historyResult.isFetchNextPageError
                  ? "Retry loading older history"
                  : "Load older history"}
            </Button>
          )}
        </TabsContent>
      </Tabs>

      <TransitionDialog order={moving ? order : null} onClose={() => setMoving(false)} />
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-surface p-3">
      <div className="label-caps">{label}</div>
      <div className="mt-1 text-sm capitalize">{children}</div>
    </div>
  );
}
