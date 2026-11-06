import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderCard } from "@/components/board/OrderCard";
import { TransitionDialog } from "@/components/board/TransitionDialog";
import { QuickAddDialog } from "@/components/board/QuickAddDialog";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  baysQuery,
  fetchBoardPage,
  BOARD_PAGE_SIZE,
  statusesQuery,
  customerLabel,
  vehicleLabel,
  type BoardOrder,
} from "@/lib/shop-data";

export const Route = createFileRoute("/_authenticated/board")({
  head: () => ({
    meta: [
      { title: "Live board — ShopOS" },
      {
        name: "description",
        content: "Every repair order on the floor, by status, updating live.",
      },
      { property: "og:title", content: "Live board — ShopOS" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Every repair order on the floor, by status, updating live.",
      },
    ],
  }),
  component: Board,
});

const WAITS = ["all", "waiting", "dropoff", "shuttle", "loaner", "tow"] as const;

function Board() {
  const { can } = useAuth();
  const statusesResult = useQuery(statusesQuery);
  const ordersResult = useInfiniteQuery({
    queryKey: ["board", "pages"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchBoardPage(pageParam),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === BOARD_PAGE_SIZE ? pages.length : undefined,
  });
  const baysResult = useQuery(baysQuery);
  const { data: statuses = [], isLoading: ls } = statusesResult;
  const orders = useMemo(() => ordersResult.data?.pages.flat() ?? [], [ordersResult.data]);
  const lo = ordersResult.isLoading;
  const { data: bays = [] } = baysResult;
  const loadError = statusesResult.isError || ordersResult.isError || baysResult.isError;
  const [q, setQ] = useState("");
  const [wait, setWait] = useState<(typeof WAITS)[number]>("all");
  const [moving, setMoving] = useState<BoardOrder | null>(null);
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (wait !== "all" && o.wait_type !== wait) return false;
      if (!term) return true;
      return [o.ro_number, customerLabel(o), vehicleLabel(o), o.license_plate, o.customer_phone]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(term));
    });
  }, [orders, q, wait]);

  const byStatus = useMemo(() => {
    const m = new Map<string, BoardOrder[]>();
    for (const o of filtered)
      m.set(o.current_status_id!, [...(m.get(o.current_status_id!) ?? []), o]);
    return m;
  }, [filtered]);
  const bayById = useMemo(() => new Map(bays.map((b) => [b.id, b])), [bays]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h1 className="mr-2 text-2xl font-bold">Live board</h1>
        <span className="font-mono text-sm text-muted-foreground">
          {orders.length}
          {ordersResult.hasNextPage ? "+ loaded" : " open"}
        </span>
        <div className="relative ml-4 w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="RO, name, plate, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {WAITS.map((w) => (
            <button
              key={w}
              onClick={() => setWait(w)}
              className={cn(
                "rounded px-2.5 py-1 text-xs capitalize transition-colors",
                wait === w
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              {w === "dropoff" ? "drop-off" : w}
            </button>
          ))}
        </div>
        {can("ro.create") && (
          <Button className="ml-auto" onClick={() => setAdding(true)}>
            <Plus /> Check in
          </Button>
        )}
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm"
        >
          <span>Could not load shop data. The board may be incomplete.</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void Promise.all([
                statusesResult.refetch(),
                ordersResult.refetch(),
                baysResult.refetch(),
              ])
            }
          >
            Retry
          </Button>
        </div>
      )}

      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {ls || lo ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-full w-72 shrink-0" />
          ))
        ) : loadError && !statuses.length ? (
          <p role="alert" className="text-sm text-destructive">
            Status columns could not be loaded.
          </p>
        ) : (
          statuses.map((s) => {
            const list = byStatus.get(s.id) ?? [];
            return (
              <section key={s.id} className="flex w-72 shrink-0 flex-col rounded-lg bg-surface">
                <header className="flex items-center gap-2 border-b px-3 py-2.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.color_hex }}
                  />
                  <h2 className="flex-1 truncate text-base font-semibold uppercase tracking-wide">
                    {s.label}
                  </h2>
                  <span className="font-mono text-sm text-muted-foreground">{list.length}</span>
                </header>
                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  {list.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      bay={o.bay_id ? bayById.get(o.bay_id) : undefined}
                      onMove={setMoving}
                      canMove={can("ro.transition")}
                    />
                  ))}
                  {!list.length && (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                      No vehicles
                    </p>
                  )}
                </div>
              </section>
            );
          })
        )}
        {ordersResult.isFetchNextPageError && (
          <p role="alert" className="w-64 shrink-0 self-start text-sm text-destructive">
            Could not load more orders.
          </p>
        )}
        {ordersResult.hasNextPage && (
          <Button
            className="h-fit shrink-0"
            variant="secondary"
            disabled={ordersResult.isFetchingNextPage}
            onClick={() => void ordersResult.fetchNextPage()}
          >
            {ordersResult.isFetchingNextPage
              ? "Loading…"
              : ordersResult.isFetchNextPageError
                ? "Retry loading more"
                : "Load more orders"}
          </Button>
        )}
      </div>

      <TransitionDialog order={moving} onClose={() => setMoving(null)} />
      <QuickAddDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
