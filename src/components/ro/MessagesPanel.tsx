import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CheckCheck, Clock, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { parseAppError } from "@/lib/errors";
import { formatPhone } from "@/lib/phone";
import { renderPreview } from "@/lib/whatsapp-templates";
import {
  ACTIVITY_PAGE_SIZE,
  fetchMessagesPage,
  vehicleLabel,
  type BoardOrder,
} from "@/lib/shop-data";
import { sendStatusUpdate } from "@/api/shop.functions";

const STATUS_ICON = {
  queued: Clock,
  sent: Check,
  delivered: CheckCheck,
  read: CheckCheck,
  failed: X,
  simulated: Clock,
} as const;

export function MessagesPanel({ order }: { order: BoardOrder }) {
  const { can, me } = useAuth();
  const qc = useQueryClient();
  const messagesResult = useInfiniteQuery({
    queryKey: ["messages", order.customer_id],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchMessagesPage(order.customer_id!, pageParam),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === ACTIVITY_PAGE_SIZE ? pages.length : undefined,
    enabled: can("messages.view"),
  });
  const messages = messagesResult.data?.pages.flat() ?? [];
  const [update, setUpdate] = useState("");
  const [busy, setBusy] = useState(false);

  const preview = renderPreview("status_update", {
    customer_name: order.customer_first_name ?? "",
    shop_name: me?.shop?.name ?? "",
    vehicle: vehicleLabel(order),
    update,
    shop_phone: me?.shop?.phone_number ?? "the shop",
  });

  async function toggleConsent(v: boolean) {
    const { error } = await supabase.rpc("set_whatsapp_consent", {
      p_customer: order.customer_id!,
      p_opt_in: v,
      p_source: "verbal",
    });
    if (error) return toast.error(parseAppError(error).message);
    qc.invalidateQueries({ queryKey: ["order", order.id] });
    qc.invalidateQueries({ queryKey: ["board"] });
  }

  async function send() {
    setBusy(true);
    try {
      const res = await sendStatusUpdate({
        data: { customerId: order.customer_id!, repairOrderId: order.id!, update },
      });
      if (!res.ok) return toast.error(parseAppError(res.error).message);
      if (res.data.status === "sent") {
        toast.success("Update sent");
        setUpdate("");
      } else if (res.data.status === "simulated") {
        toast.message(res.data.reason ?? "Simulation recorded; no WhatsApp message was sent.");
        setUpdate("");
      } else toast.error(res.data.reason ?? "Message not sent");
      qc.invalidateQueries({ queryKey: ["messages", order.customer_id] });
    } catch (error) {
      toast.error(parseAppError(error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!can("messages.view"))
    return (
      <p className="text-sm text-muted-foreground">You don't have access to customer messages.</p>
    );
  if (messagesResult.isError && !messagesResult.data) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <span>Could not load message history.</span>
        <Button size="sm" variant="secondary" onClick={() => void messagesResult.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-lg border bg-surface p-4">
        <div>
          <div className="font-medium">WhatsApp updates</div>
          <div className="text-xs text-muted-foreground">
            {formatPhone(order.customer_phone)} ·{" "}
            {order.whatsapp_opt_in ? "opted in" : "not opted in"}
          </div>
        </div>
        <Switch
          checked={!!order.whatsapp_opt_in}
          disabled={!can("customers.consent")}
          onCheckedChange={toggleConsent}
          aria-label="WhatsApp consent"
        />
      </div>

      {can("messages.send") && (
        <div className="space-y-2 rounded-lg border p-4">
          <div className="label-caps">Send a status update</div>
          <Input
            maxLength={300}
            placeholder="e.g. brakes are done, starting the alignment now"
            value={update}
            onChange={(e) => setUpdate(e.target.value)}
          />
          <p className="rounded bg-muted p-3 text-sm text-muted-foreground">{preview}</p>
          <Button onClick={send} disabled={busy || !update.trim() || !order.whatsapp_opt_in}>
            Send on WhatsApp
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {messages.map((m) => {
          const Icon = STATUS_ICON[m.delivery_status as keyof typeof STATUS_ICON] ?? Clock;
          return (
            <div key={m.id} className="rounded-md border bg-card p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="label-caps">{m.template_key.replace("_", " ")}</span>
                <span className="inline-flex items-center gap-1">
                  <Icon
                    className={
                      m.delivery_status === "failed"
                        ? "h-3.5 w-3.5 text-destructive"
                        : m.delivery_status === "read"
                          ? "h-3.5 w-3.5 text-info"
                          : "h-3.5 w-3.5"
                    }
                  />
                  {m.delivery_status} · {new Date(m.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-sm">{m.body}</p>
            </div>
          );
        })}
        {!messages.length && <p className="text-sm text-muted-foreground">No messages yet.</p>}
        {messagesResult.isFetchNextPageError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load older messages.
          </p>
        )}
        {messagesResult.hasNextPage && (
          <Button
            size="sm"
            variant="secondary"
            disabled={messagesResult.isFetchingNextPage}
            onClick={() => void messagesResult.fetchNextPage()}
          >
            {messagesResult.isFetchingNextPage
              ? "Loading…"
              : messagesResult.isFetchNextPageError
                ? "Retry loading older messages"
                : "Load older messages"}
          </Button>
        )}
      </div>
    </div>
  );
}
