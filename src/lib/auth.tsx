import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { can as canRole, type Role } from "./permissions";
import { AuthContext, type AuthState, type Me } from "./auth-context";

async function loadMe(session: Session | null): Promise<Me | null> {
  if (!session) return null;
  const uid = session.user.id;
  const [{ data: profile }, { data: role }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name,last_name,email,shop_id")
      .eq("id", uid)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle(),
  ]);
  let shop: Me["shop"] = null;
  if (profile?.shop_id) {
    const { data } = await supabase
      .from("shops")
      .select("id,name,phone_number,feature_flags,timezone")
      .eq("id", profile.shop_id)
      .maybeSingle();
    if (data)
      shop = { ...data, feature_flags: (data.feature_flags ?? {}) as Record<string, unknown> };
  }
  return {
    userId: uid,
    email: profile?.email ?? session.user.email ?? "",
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    role: (role?.role as Role) ?? null,
    shop,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let currentUserId: string | null = null;
    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      const nextUserId = nextSession?.user.id ?? null;
      if (nextUserId !== currentUserId) {
        currentUserId = nextUserId;
        setMe(null);
        setLoading(true);
        void queryClient.cancelQueries();
        queryClient.clear();
      }
      setSession(nextSession);
      const requestedUserId = nextUserId;
      // Defer reads out of the auth callback, as Supabase recommends.
      setTimeout(() => {
        loadMe(nextSession)
          .then((loaded) => {
            if (active && currentUserId === requestedUserId) {
              setMe(loaded);
              setLoading(false);
            }
          })
          .catch((error: unknown) => {
            if (active && currentUserId === requestedUserId) {
              console.error("Could not load signed-in shop profile", error);
              setMe(null);
              setLoading(false);
            }
          });
      }, 0);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      applySession(s);
    });
    supabase.auth
      .getSession()
      .then(({ data }) => {
        applySession(data.session);
      })
      .catch((error: unknown) => {
        if (active) {
          console.error("Could not restore the Supabase session", error);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value: AuthState = {
    session,
    me,
    loading,
    can: (p) => canRole(me?.role, p),
    refresh: async () => setMe(await loadMe(session)),
    signOut: async () => {
      await supabase.auth.signOut();
      queryClient.clear();
      setMe(null);
      setSession(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
