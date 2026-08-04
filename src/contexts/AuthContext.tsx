import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, usernameToEmail } from "../lib/supabaseClient";
import type { Restaurant, UserRole } from "../types/database";

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  role: UserRole | null;
  restaurant: Restaurant | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshRestaurant: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  const role = (session?.user.user_metadata?.role as UserRole | undefined) ?? null;

  async function loadRestaurant(userId: string) {
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("auth_user_id", userId)
      .maybeSingle();
    setRestaurant((data as Restaurant | null) ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user && session.user.user_metadata?.role === "restaurant") {
      loadRestaurant(session.user.id);
    } else {
      setRestaurant(null);
    }
  }, [session]);

  async function login(username: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) {
      throw new Error("Usuario o contraseña incorrectos.");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  async function refreshRestaurant() {
    if (session?.user) {
      await loadRestaurant(session.user.id);
    }
  }

  return (
    <AuthContext.Provider
      value={{ loading, session, role, restaurant, login, logout, refreshRestaurant }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
