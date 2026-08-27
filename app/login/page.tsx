"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Scissors, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const LOGIN_ERROR = "E-mail ou mot de passe incorrect";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") ?? "").trim();
      const password = String(formData.get("password") ?? "");
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(LOGIN_ERROR);
        setIsSubmitting(false);
        return;
      }

      router.replace("/register");
      router.refresh();
    } catch {
      setError(LOGIN_ERROR);
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-stone-50 text-stone-950 lg:grid-cols-[minmax(22rem,0.9fr)_minmax(30rem,1.1fr)]">
      <section className="relative isolate flex min-h-64 overflow-hidden bg-emerald-950 px-6 py-10 text-white sm:px-10 lg:min-h-screen lg:px-14 lg:py-14">
        <div
          className="absolute inset-0 -z-10 opacity-30"
          aria-hidden="true"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 18%, rgba(110, 231, 183, 0.5), transparent 28%), radial-gradient(circle at 82% 78%, rgba(217, 249, 157, 0.25), transparent 30%)",
          }}
        />
        <div className="flex w-full flex-col justify-between gap-12">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-white text-emerald-950 shadow-lg shadow-black/10">
              <Scissors className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-black tracking-[0.18em]">LEBALEZE</p>
              <p className="text-xs text-emerald-100/75">Gestion du salon</p>
            </div>
          </div>

          <div className="max-w-lg lg:pb-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">
              Espace de gestion
            </p>
            <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Votre salon, organisé au même endroit.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-emerald-50/75 sm:text-base">
              Retrouvez le registre d’activité et les rapports de Caprice D&apos;Ebène dans un
              espace réservé à la gestion du salon.
            </p>
          </div>

          <div className="hidden items-center gap-2 text-xs font-semibold text-emerald-100/70 lg:flex">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Session sécurisée par Supabase Auth
          </div>
        </div>
      </section>

      <section className="flex items-center px-6 py-12 sm:px-12 lg:px-20 xl:px-28">
        <div className="w-full max-w-xl">
          <div className="mb-10">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-800">
              Connexion
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Bonjour SIRE</h2>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              Saisissez vos identifiants pour accéder à l’administration du salon.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-bold text-stone-800">
                Adresse e-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="vous@exemple.com"
                className="h-14 w-full rounded-xl border border-stone-300 bg-white px-4 text-base outline-none transition placeholder:text-stone-400 focus:border-emerald-800 focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-bold text-stone-800">
                Mot de passe
              </label>
              <div className="relative">
                <LockKeyhole
                  className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-stone-400"
                  aria-hidden="true"
                />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="h-14 w-full rounded-xl border border-stone-300 bg-white pl-11 pr-4 text-base outline-none transition focus:border-emerald-800 focus:ring-4 focus:ring-emerald-100"
                />
              </div>
            </div>

            {error && (
              <p
                role="alert"
                aria-live="polite"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-950 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-900 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-wait disabled:opacity-70"
            >
              {isSubmitting ? "Connexion en cours…" : "Se connecter"}
              {!isSubmitting && <ArrowRight className="size-4" aria-hidden="true" />}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
