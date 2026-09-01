"use client";
import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Archive, BriefcaseBusiness, Loader2, Pencil, Plus, Power, RotateCcw } from "lucide-react";
import {
  changeJobTitleStatusAction,
  createJobTitleAction,
  type OwnerFormState,
  updateJobTitleAction,
} from "./actions";

type Title = {
  id: string;
  name: string;
  active: boolean;
  isDeleted: boolean;
  _count: { staffJobTitles: number };
};
const INITIAL: OwnerFormState = { success: false, message: "" };
const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";
function Button({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
      {pending ? "Patientez…" : label}
    </button>
  );
}
function Feedback({ state }: { state: OwnerFormState }) {
  return state.message ? (
    <p className={`text-xs font-semibold ${state.success ? "text-emerald-700" : "text-red-700"}`}>
      {state.message}
    </p>
  ) : null;
}
function Status({
  title,
  operation,
  label,
}: {
  title: Title;
  operation: "activate" | "deactivate" | "archive" | "restore";
  label: string;
}) {
  const [state, action] = useFormState(changeJobTitleStatusAction, INITIAL);
  const Icon = operation === "archive" ? Archive : operation === "restore" ? RotateCcw : Power;
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="id" value={title.id} />
      <input type="hidden" name="operation" value={operation} />
      <button className="flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold">
        <Icon className="size-3.5" />
        {label}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function JobTitleManager({ titles }: { titles: Title[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useFormState(createJobTitleAction, INITIAL);
  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state.success, state.submissionId]);
  return (
    <main className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-800">
          Configuration Owner
        </p>
        <h1 className="mt-1 text-3xl font-black">Postes</h1>
        <p className="mt-2 text-sm text-stone-500">
          Les libellés sont propres au salon et n’accordent aucune permission.
        </p>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-black">Nouveau poste</h2>
          <form ref={ref} action={action} className="space-y-4">
            <input
              name="name"
              required
              maxLength={120}
              placeholder="Ex. Coiffeuse"
              className={inputClass}
            />
            {state.errors?.name?.map((e) => (
              <p key={e} className="text-xs text-red-700">
                {e}
              </p>
            ))}
            <Feedback state={state} />
            <Button label="Ajouter" />
          </form>
        </section>
        <section className="space-y-3">
          {titles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center">
              <BriefcaseBusiness className="mx-auto size-8 text-stone-300" />
              <p className="mt-3 font-black">Aucun poste</p>
            </div>
          ) : (
            titles.map((title) => (
              <article
                key={title.id}
                className={`rounded-2xl border p-5 shadow-sm ${title.isDeleted ? "border-stone-200 bg-stone-100" : "border-stone-200 bg-white"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-black">{title.name}</h2>
                    <p className="text-xs text-stone-500">
                      {title._count.staffJobTitles} membre(s) ·{" "}
                      {title.isDeleted ? "Archivé" : title.active ? "Actif" : "Inactif"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {title.isDeleted ? (
                      <Status title={title} operation="restore" label="Restaurer" />
                    ) : (
                      <>
                        <Status
                          title={title}
                          operation={title.active ? "deactivate" : "activate"}
                          label={title.active ? "Désactiver" : "Activer"}
                        />
                        <Status title={title} operation="archive" label="Archiver" />
                      </>
                    )}
                  </div>
                </div>
                {!title.isDeleted && (
                  <details className="mt-4 rounded-xl bg-stone-50 p-4">
                    <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                      <Pencil className="size-4" />
                      Modifier
                    </summary>
                    <Edit title={title} />
                  </details>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
function Edit({ title }: { title: Title }) {
  const [state, action] = useFormState(updateJobTitleAction, INITIAL);
  return (
    <form action={action} className="mt-4 flex flex-col gap-3 sm:flex-row">
      <input type="hidden" name="id" value={title.id} />
      <input name="name" defaultValue={title.name} required className={inputClass} />
      <Button label="Enregistrer" />
      <Feedback state={state} />
    </form>
  );
}
