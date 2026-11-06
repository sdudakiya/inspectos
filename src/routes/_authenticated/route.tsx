import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, LogOut, Settings, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS } from "@/lib/permissions";
import { useBoardRealtime } from "@/lib/shop-data";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/" });
  },
  component: AppShell,
});

function AppShell() {
  const { me, can, signOut } = useAuth();
  const navigate = useNavigate();
  useBoardRealtime(me?.shop?.id);

  const nav = [
    { to: "/board", label: "Board", icon: LayoutGrid, show: true },
    { to: "/bays", label: "BayWatch", icon: Warehouse, show: true },
    {
      to: "/settings",
      label: "Settings",
      icon: Settings,
      show: can("settings.shop") || can("staff.manage"),
    },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-sidebar/95 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-4">
          <Link to="/board" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded bg-primary font-display text-base font-bold text-primary-foreground">
              S
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-bold tracking-wide">ShopOS</div>
              <div className="-mt-1 text-[11px] text-muted-foreground">{me?.shop?.name ?? "…"}</div>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            {nav
              .filter((n) => n.show)
              .map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                  activeProps={{ className: "bg-sidebar-accent text-foreground" }}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </Link>
              ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm">
                {[me?.firstName, me?.lastName].filter(Boolean).join(" ") || me?.email}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {me?.role ? ROLE_LABELS[me.role] : ""}
              </div>
            </div>
            <button
              aria-label="Sign out"
              className="rounded-md p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              onClick={async () => {
                await signOut();
                navigate({ to: "/" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
