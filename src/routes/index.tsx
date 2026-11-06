import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import shopFloor from "@/assets/shop-floor.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ShopOS — Sign in to your repair shop" },
      {
        name: "description",
        content:
          "Sign in to ShopOS to run your live repair order board, inspections and customer approvals.",
      },
      { property: "og:title", content: "ShopOS — Sign in to your repair shop" },
      {
        property: "og:description",
        content: "Live repair order board, inspections, customer approvals and WhatsApp updates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignIn,
});

type Mode = "signin" | "signup" | "reset";

function SignIn() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    shopName: "",
  });

  useEffect(() => {
    if (!loading && session) navigate({ to: "/board" });
  }, [loading, session, navigate]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            emailRedirectTo: `${window.location.origin}/board`,
            data: {
              first_name: form.firstName,
              last_name: form.lastName,
              shop_name: form.shopName,
            },
          },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("If that email has an account, a reset link is on its way.");
        setMode("signin");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error(result.error.message ?? "Sign-in failed");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <img
          src={shopFloor}
          alt="Repair shop floor at night with a car on a lift"
          width={1024}
          height={1280}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-2 bg-hazard opacity-80" />
        <div className="absolute bottom-12 left-12 right-12">
          <p className="label-caps text-primary">Repair shop operations</p>
          <h1 className="mt-3 text-6xl font-bold leading-[0.95] text-foreground">
            Every car on the floor.
            <br />
            Every minute accounted for.
          </h1>
          <p className="mt-4 max-w-md text-muted-foreground">
            Live board, digital inspections, signed customer approvals and WhatsApp updates — in one
            place.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-glow px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary font-display text-lg font-bold text-primary-foreground">
              S
            </div>
            <span className="font-display text-2xl font-bold tracking-wide">ShopOS</span>
          </div>
          <h2 className="text-3xl font-bold">
            {mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Set up your shop"
                : "Reset password"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Creates an empty shop with a starter pipeline, bays, vendors, and inspection template. Invited staff join their shop automatically."
              : mode === "reset"
                ? "Moved over from the old ShopOS? Enter your email to choose a new password."
                : "Welcome back to the floor."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="fn">First name</Label>
                    <Input id="fn" required value={form.firstName} onChange={set("firstName")} />
                  </div>
                  <div>
                    <Label htmlFor="ln">Last name</Label>
                    <Input id="ln" required value={form.lastName} onChange={set("lastName")} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="shop">Shop name</Label>
                  <Input
                    id="shop"
                    placeholder="Ignored if you were invited"
                    value={form.shopName}
                    onChange={set("shopName")}
                  />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={set("email")}
              />
            </div>
            {mode !== "reset" && (
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setMode("reset")}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={form.password}
                  onChange={set("password")}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset link"}
            </Button>
          </form>

          {mode !== "reset" && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or{" "}
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                <Button variant="secondary" className="w-full" onClick={() => oauth("google")}>
                  Continue with Google
                </Button>
                <button
                  type="button"
                  className="lovable-auth-button w-full"
                  onClick={() => oauth("lovable")}
                >
                  Continue with Lovable
                </button>
              </div>
            </>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                New shop or invited?{" "}
                <button className="text-primary hover:underline" onClick={() => setMode("signup")}>
                  Create an account
                </button>
              </>
            ) : (
              <button className="text-primary hover:underline" onClick={() => setMode("signin")}>
                Back to sign in
              </button>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
