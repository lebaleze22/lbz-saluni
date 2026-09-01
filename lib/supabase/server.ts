import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_AUTH_COOKIE } from "@/lib/supabase/config";

export function createClient() {
  const cookieStore = cookies();

  // SUPABASE_INTERNAL_URL : uniquement pour la stack locale
  // (docker-compose.local.yml, docs/architecture/017-stack-locale-caprice.md).
  // NEXT_PUBLIC_SUPABASE_URL doit être joignable depuis le NAVIGATEUR (inliné dans le
  // bundle client) — en local, c'est l'URL publique de nginx (ex. http://localhost),
  // qui résout vers CE CONTENEUR lui-même si on l'utilise depuis du code serveur
  // s'exécutant dans un AUTRE conteneur (core-api). SUPABASE_INTERNAL_URL, quand
  // défini, pointe plutôt vers nginx par son nom de service Docker (http://nginx),
  // joignable depuis n'importe quel conteneur du même réseau. Non défini sur
  // Supabase Cloud/le VPS (docker-compose.yml) : NEXT_PUBLIC_SUPABASE_URL y est déjà
  // joignable aussi bien du navigateur que du serveur, aucun changement de comportement.
  const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;

  return createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { name: SUPABASE_AUTH_COOKIE },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // set() appelé depuis un Server Component : ignoré si un middleware
          // rafraîchit déjà les sessions utilisateur.
        }
      },
    },
  });
}
