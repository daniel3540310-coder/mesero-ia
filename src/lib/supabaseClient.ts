import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan las variables de entorno VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
      "En local, defínelas en .env. En Vercel, en Project Settings → Environment Variables."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const INTERNAL_EMAIL_DOMAIN = "mesero.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
}
