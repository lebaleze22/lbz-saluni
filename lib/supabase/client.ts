import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_AUTH_COOKIE } from "@/lib/supabase/config";

declare global {
  interface Window {
    __SALUNI_PUBLIC_AUTH__?: { url: string; anonKey: string };
  }
}

export function createClient() {
  const runtimeConfig = window.__SALUNI_PUBLIC_AUTH__;
  const url = runtimeConfig?.url || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = runtimeConfig?.anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("La configuration publique du service d'authentification est absente.");
  }

  return createBrowserClient(url, anonKey, { cookieOptions: { name: SUPABASE_AUTH_COOKIE } });
}
