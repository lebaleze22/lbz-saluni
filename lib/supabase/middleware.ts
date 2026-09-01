import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { SUPABASE_AUTH_COOKIE } from "@/lib/supabase/config";

// Rafraîchit la session Supabase à chaque requête. Appelé depuis le
// middleware.ts racine — ne contient aucune logique de routage applicatif.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Voir lib/supabase/server.ts pour le rôle de SUPABASE_INTERNAL_URL (stack locale
  // uniquement, docs/architecture/017-stack-locale-caprice.md).
  const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const supabase = createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { name: SUPABASE_AUTH_COOKIE },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}
