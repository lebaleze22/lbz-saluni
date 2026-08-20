"use client";

import { useEffect } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8">
        <CircleAlert className="mx-auto size-9 text-red-700" />
        <h1 className="mt-4 text-xl font-black text-red-950">Une erreur technique est survenue</h1>
        <p className="mt-2 text-sm leading-6 text-red-800">
          Les données n’ont pas pu être chargées. Vous pouvez réessayer sans perdre les informations
          déjà enregistrées.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-red-900 px-4 py-2.5 text-sm font-bold text-white"
        >
          <RotateCcw className="size-4" /> Réessayer
        </button>
      </div>
    </main>
  );
}
