import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Permission, Role } from "./permissions";

export interface Me {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role | null;
  shop: {
    id: string;
    name: string;
    phone_number: string | null;
    feature_flags: Record<string, unknown>;
    timezone: string;
  } | null;
}

export interface AuthState {
  session: Session | null;
  me: Me | null;
  loading: boolean;
  can: (permission: Permission) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
