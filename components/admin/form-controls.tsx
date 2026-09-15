"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { MutationState } from "@/lib/actions/state";

export const FIELD_CLASS =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-stone-100";
export const INITIAL_MUTATION_STATE: MutationState = { success: false, message: "" };

export function SubmitButton({
  children,
  secondary = false,
}: {
  children: React.ReactNode;
  secondary?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-wait disabled:opacity-60 ${secondary ? "border border-stone-300 bg-white text-stone-700" : "bg-emerald-950 text-white hover:bg-emerald-900"}`}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Enregistrement…" : children}
    </button>
  );
}

export function FormFeedback({ state }: { state: MutationState }) {
  if (!state.message) return null;
  return (
    <div
      role={state.success ? "status" : "alert"}
      className={`rounded-xl p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}
    >
      <p className="font-semibold">{state.message}</p>
      {state.errors && (
        <ul className="mt-1 list-inside list-disc">
          {Array.from(new Set(Object.values(state.errors).flat().filter(Boolean))).map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm font-semibold text-stone-700">
      <span>{label}</span>
      {children}
    </label>
  );
}
