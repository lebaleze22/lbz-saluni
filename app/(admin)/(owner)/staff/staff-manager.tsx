"use client";
import Link from "next/link";
import { useState } from "react";
import { useFormState } from "react-dom";
import { Archive, Pencil, Plus, Power, RotateCcw, UserRound } from "lucide-react";
import { changeStaffStatusAction, updateStaffAction } from "./actions";
import type { OwnerFormState } from "../job-titles/actions";

type Title = { id: string; name: string };
type Member = {
  id: string;
  name: string;
  systemRole: "none" | "director" | "manager";
  active: boolean;
  isDeleted: boolean;
  userId: string | null;
  jobTitles: Array<{ isPrimary: boolean; jobTitle: Title }>;
  user: { email: string } | null;
};
const INITIAL: OwnerFormState = { success: false, message: "" };
const ROLE = { none: "Aucun accès", director: "Director", manager: "Manager" };
const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-700";
function Feedback({ state }: { state: OwnerFormState }) {
  return state.message ? (
    <p className={`text-xs font-semibold ${state.success ? "text-emerald-700" : "text-red-700"}`}>
      {state.message}
    </p>
  ) : null;
}
function Status({
  member,
  operation,
  label,
}: {
  member: Member;
  operation: "activate" | "deactivate" | "archive" | "restore";
  label: string;
}) {
  const [state, action] = useFormState(changeStaffStatusAction, INITIAL);
  const Icon = operation === "archive" ? Archive : operation === "restore" ? RotateCcw : Power;
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="id" value={member.id} />
      <input type="hidden" name="operation" value={operation} />
      <button className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold">
        <Icon className="size-3.5" />
        {label}
      </button>
      <Feedback state={state} />
    </form>
  );
}
function Edit({ member, titles }: { member: Member; titles: Title[] }) {
  const [state, action] = useFormState(updateStaffAction, INITIAL);
  const [selectedTitleIds, setSelectedTitleIds] = useState(() =>
    member.jobTitles.map(({ jobTitle }) => jobTitle.id),
  );
  const [primaryTitleId, setPrimaryTitleId] = useState(
    member.jobTitles.find(({ isPrimary }) => isPrimary)?.jobTitle.id ?? "",
  );

  function toggleTitle(id: string) {
    setSelectedTitleIds((current) => {
      if (current.includes(id)) {
        if (primaryTitleId === id) setPrimaryTitleId("");
        return current.filter((item) => item !== id);
      }
      return [...current, id];
    });
  }

  return (
    <form action={action} className="mt-4 space-y-4 border-t border-stone-200 pt-4">
      <input type="hidden" name="id" value={member.id} />
      <input type="hidden" name="jobTitleIds" value={JSON.stringify(selectedTitleIds)} />
      <input type="hidden" name="primaryJobTitleId" value={primaryTitleId} />
      <label className="space-y-1 text-xs font-bold text-stone-600">
        Nom
        <input name="name" required defaultValue={member.name} className={inputClass} />
      </label>
      <fieldset>
        <legend className="text-xs font-bold text-stone-600">Postes et poste principal</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {titles.map((title) => {
            const selected = selectedTitleIds.includes(title.id);
            return (
              <div key={title.id} className="rounded-lg border border-stone-200 bg-white p-3">
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleTitle(title.id)}
                    className="accent-emerald-800"
                  />
                  {title.name}
                </label>
                {selected && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-stone-500">
                    <input
                      type="radio"
                      checked={primaryTitleId === title.id}
                      onChange={() => setPrimaryTitleId(title.id)}
                      className="accent-emerald-800"
                    />
                    Principal
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
      <div className="space-y-2">
        <button className="rounded-xl bg-emerald-950 px-4 py-3 text-sm font-bold text-white">
          Enregistrer
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function StaffManager({ members, titles }: { members: Member[]; titles: Title[] }) {
  return (
    <main className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-800">
            Gestion Owner
          </p>
          <h1 className="mt-1 text-3xl font-black">Équipe</h1>
          <p className="mt-2 text-sm text-stone-500">
            Gérez les membres, leurs postes et leur accès système.
          </p>
        </div>
        <Link
          href="/staff/nouveau"
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-950 px-5 py-3 text-sm font-bold text-white"
        >
          <Plus className="size-4" />
          Nouveau membre
        </Link>
      </div>
      {members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-20 text-center">
          <UserRound className="mx-auto size-9 text-stone-300" />
          <h2 className="mt-4 font-black">Aucun membre</h2>
          <p className="mt-1 text-sm text-stone-500">
            Ajoutez un membre pour débloquer le registre.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {members.map((member) => (
            <article
              key={member.id}
              className={`rounded-2xl border p-5 shadow-sm ${member.isDeleted ? "bg-stone-100" : "bg-white"}`}
            >
              <div className="flex flex-col justify-between gap-4 sm:flex-row">
                <div className="flex gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-900">
                    <UserRound className="size-4" />
                  </span>
                  <div>
                    <h2 className="font-black">{member.name}</h2>
                    <p className="text-xs text-stone-500">
                      {member.jobTitles.length > 0
                        ? member.jobTitles
                            .map(
                              ({ jobTitle, isPrimary }) =>
                                `${jobTitle.name}${isPrimary ? " (principal)" : ""}`,
                            )
                            .join(", ")
                        : "Sans poste"}{" "}
                      · {ROLE[member.systemRole]}
                    </p>
                    {member.user && (
                      <p className="mt-1 text-xs text-stone-400">{member.user.email}</p>
                    )}
                    <span className="mt-2 inline-block rounded-full bg-stone-100 px-2 py-1 text-[0.68rem] font-black uppercase">
                      {member.isDeleted ? "Archivé" : member.active ? "Actif" : "Inactif"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {member.isDeleted ? (
                    <Status member={member} operation="restore" label="Restaurer" />
                  ) : (
                    <>
                      <Status
                        member={member}
                        operation={member.active ? "deactivate" : "activate"}
                        label={member.active ? "Désactiver" : "Activer"}
                      />
                      <Status member={member} operation="archive" label="Archiver" />
                    </>
                  )}
                </div>
              </div>
              {!member.isDeleted && (
                <details className="mt-4 rounded-xl bg-stone-50 p-4">
                  <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                    <Pencil className="size-4" />
                    Modifier
                  </summary>
                  <Edit member={member} titles={titles} />
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
