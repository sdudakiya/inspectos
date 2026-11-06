import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { isPortalTokenValid } from "@/lib/portal-token";
import { authorizePortal, getPortal } from "@/api/portal.functions";

export const Route = createFileRoute("/portal/$token")({
  loader: ({ params }) => {
    if (!isPortalTokenValid(params.token)) {
      return { ok: false as const, message: "This link is not valid or has expired." };
    }
    return getPortal({ data: { token: params.token } });
  },
  head: () => ({
    meta: [
      { title: "Your vehicle inspection — ShopOS" },
      {
        name: "description",
        content: "Review your vehicle inspection and approve recommended work.",
      },
      { property: "og:title", content: "Your vehicle inspection — ShopOS" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Review your vehicle inspection and approve recommended work.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Portal,
});

const COND = {
  red: {
    label: "Needs attention now",
    cls: "bg-destructive/15 text-destructive border-destructive/40",
  },
  yellow: { label: "Recommended soon", cls: "bg-warning/15 text-warning border-warning/40" },
  green: { label: "Looks good", cls: "bg-success/15 text-success border-success/40" },
} as const;

const CONSENT =
  "I authorize the shop to perform the work I approved above at the estimated prices, and I understand that additional work requires my further approval.";

function Portal() {
  const data = Route.useLoaderData();
  const { token } = Route.useParams();
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [agree, setAgree] = useState(false);
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ total: number; declined: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!data.ok) return;
    const init: Record<string, boolean> = {};
    data.items
      .filter((i) => i.condition !== "green")
      .forEach((i) => (init[i.id] = i.customerApproved ?? i.condition === "red"));
    setDecisions(init);
  }, [data]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    let drawing = false;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const down = (e: PointerEvent) => {
      drawing = true;
      const [x, y] = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      c.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drawing) return;
      const [x, y] = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      setSigned(true);
    };
    const up = () => (drawing = false);
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
    };
  }, [data.ok]);

  if (!data.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div>
          <h1 className="text-3xl font-bold">Link unavailable</h1>
          <p className="mt-2 text-muted-foreground">{data.message}</p>
        </div>
      </div>
    );
  }

  const recommended = data.items.filter((i) => i.condition !== "green");
  const good = data.items.filter((i) => i.condition === "green");
  const recommendedByCategory = recommended.reduce<Record<string, typeof recommended>>(
    (acc, item) => {
      const key = item.category?.trim() || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {},
  );
  const goodByCategory = good.reduce<Record<string, typeof good>>((acc, item) => {
    const key = item.category?.trim() || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const approvedTotal = recommended.reduce(
    (s, i) => s + (decisions[i.id] ? (i.estimatedCostCents ?? 0) : 0),
    0,
  );
  const authorized = !!data.authorizedAt || !!done;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await authorizePortal({
        data: {
          token,
          decisions: recommended.map((i) => ({ itemId: i.id, approved: !!decisions[i.id] })),
          signatureDataUrl: canvas.current!.toDataURL("image/png"),
          consentText: CONSENT,
        },
      });
      if (!res.ok) return setError(res.message);
      setDone({ total: res.approvedTotalCents, declined: res.declinedCount });
    } catch (submitError) {
      setError(
        (submitError as Error).message || "Could not record your approval. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="border-b bg-surface px-5 py-5">
        <div className="mx-auto max-w-xl">
          <div className="label-caps text-primary">{data.shop.name}</div>
          <h1 className="mt-1 text-3xl font-bold">
            Hi {data.customerName}, here's your {data.vehicle}
          </h1>
          <p className="text-sm text-muted-foreground">Inspection for RO #{data.roNumber}</p>
          {data.shop.phone && (
            <a
              href={`tel:${data.shop.phone}`}
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary"
            >
              <Phone className="h-4 w-4" /> Call the shop
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-5 pt-6">
        {authorized ? (
          <div className="rounded-lg border border-success/40 bg-success/10 p-5">
            <Check className="h-6 w-6 text-success" />
            <h2 className="mt-2 text-2xl font-bold">Thank you — approval received</h2>
            {done && (
              <p className="text-sm text-muted-foreground">
                Approved ${(done.total / 100).toFixed(2)} · {done.declined} item(s) declined. The
                shop has been notified.
              </p>
            )}
          </div>
        ) : null}

        {recommended.length > 0 && (
          <section>
            <h2 className="mb-3 text-xl font-bold">Recommended work</h2>
            <div className="space-y-3">
              {Object.entries(recommendedByCategory).map(([categoryName, categoryItems]) => (
                <div key={categoryName} className="space-y-2">
                  <div className="rounded-md border bg-primary/5 px-3 py-2">
                    <div className="label-caps text-primary">Category</div>
                    <h3 className="text-base font-semibold uppercase tracking-wide">
                      {categoryName}
                    </h3>
                  </div>
                  <div className="space-y-2 border-l-2 border-muted pl-3">
                    {categoryItems.map((i) => (
                      <div
                        key={i.id}
                        className={cn("rounded-lg border p-4", COND[i.condition].cls)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide">
                              {COND[i.condition].label}
                            </div>
                            <div className="text-lg font-semibold text-foreground">{i.title}</div>
                          </div>
                          {i.estimatedCostCents != null && (
                            <div className="font-mono text-lg text-foreground">
                              ${(i.estimatedCostCents / 100).toFixed(2)}
                            </div>
                          )}
                        </div>
                        {i.notes && <p className="mt-2 text-sm text-foreground">{i.notes}</p>}
                        {i.media.length > 0 && (
                          <div className="mt-3 flex gap-2 overflow-x-auto">
                            {i.media.map((m) => (
                              <img
                                key={m.id}
                                src={m.url!}
                                alt={i.title}
                                className="h-28 w-36 shrink-0 rounded object-cover"
                                loading="lazy"
                              />
                            ))}
                          </div>
                        )}
                        {!authorized && (
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              variant={decisions[i.id] ? "default" : "secondary"}
                              onClick={() => setDecisions({ ...decisions, [i.id]: true })}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant={decisions[i.id] === false ? "destructive" : "secondary"}
                              onClick={() => setDecisions({ ...decisions, [i.id]: false })}
                            >
                              Decline
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {good.length > 0 && (
          <section>
            <h2 className="mb-3 text-xl font-bold">Checked and looking good</h2>
            <div className="space-y-3">
              {Object.entries(goodByCategory).map(([categoryName, categoryItems]) => (
                <div key={categoryName} className="space-y-2">
                  <div className="rounded-md border bg-primary/5 px-3 py-2">
                    <div className="label-caps text-primary">Category</div>
                    <h3 className="text-base font-semibold uppercase tracking-wide">
                      {categoryName}
                    </h3>
                  </div>
                  <ul className="grid grid-cols-1 gap-1.5 border-l-2 border-muted pl-3 text-sm">
                    {categoryItems.map((i) => (
                      <li key={i.id} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-success" /> {i.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {!authorized && (
          <section className="space-y-4 rounded-lg border bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <span className="label-caps">Approved total</span>
              <span className="font-mono text-2xl font-bold">
                ${(approvedTotal / 100).toFixed(2)}
              </span>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm">Sign below</span>
                <button
                  className="text-xs text-primary"
                  onClick={() => {
                    const c = canvas.current!;
                    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
                    setSigned(false);
                  }}
                >
                  Clear
                </button>
              </div>
              <canvas
                ref={canvas}
                className="h-36 w-full touch-none rounded-md bg-foreground"
                aria-label="Signature pad"
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={agree}
                onCheckedChange={(v) => setAgree(v === true)}
                className="mt-0.5"
              />
              <span>{CONSENT}</span>
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              className="w-full"
              size="lg"
              disabled={!agree || !signed || busy}
              onClick={submit}
            >
              Submit approval
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
