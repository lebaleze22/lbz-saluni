"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-white hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:cursor-wait disabled:opacity-60"
      aria-label={isPending ? "Déconnexion en cours" : "Se déconnecter"}
    >
      <LogOut className="size-4" aria-hidden="true" />
      <span className="hidden md:inline">{isPending ? "Déconnexion…" : "Déconnexion"}</span>
    </button>
  );
}
