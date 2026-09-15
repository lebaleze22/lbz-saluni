"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ArrowLeft, BadgeCheck, Loader2, UserPlus } from "lucide-react";
import { createStaffAction } from "../actions";
import type { OwnerFormState } from "../../job-titles/actions";

type Title = { id: string; name: string };
type Sex = "" | "femme" | "homme";
type PayType = "fixed_salary" | "commission";

const INITIAL: OwnerFormState = { success: false, message: "" };
const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="flex items-center justify-center gap-2 rounded-xl bg-emerald-950 px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
      {pending ? "Création…" : "Créer le membre"}
    </button>
  );
}

function Errors({ errors }: { errors?: string[] }) {
  return errors?.map((error) => (
    <span key={error} className="block text-xs text-red-700">
      {error}
    </span>
  ));
}

export function NewStaffForm({ titles }: { titles: Title[] }) {
  const [role, setRole] = useState("none");
  const [sex, setSex] = useState<Sex>("");
  const [payType, setPayType] = useState<PayType>("fixed_salary");
  const [selectedTitleIds, setSelectedTitleIds] = useState<string[]>([]);
  const [primaryTitleId, setPrimaryTitleId] = useState("");
  const [newTitleIsPrimary, setNewTitleIsPrimary] = useState(false);
  const [state, action] = useFormState(createStaffAction, INITIAL);

  function toggleTitle(id: string) {
    setSelectedTitleIds((current) => {
      if (current.includes(id)) {
        const remaining = current.filter((item) => item !== id);
        if (primaryTitleId === id) setPrimaryTitleId(remaining[0] ?? "");
        return remaining;
      }
      if (!primaryTitleId && !newTitleIsPrimary) setPrimaryTitleId(id);
      return [...current, id];
    });
  }

  function chooseExistingPrimary(id: string) {
    setPrimaryTitleId(id);
    setNewTitleIsPrimary(false);
  }

  return (
    <main className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/staff"
        className="inline-flex items-center gap-2 text-sm font-bold text-stone-600"
      >
        <ArrowLeft className="size-4" />
        Retour à l’équipe
      </Link>

      <div className="mt-6 w-full">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-800">
          Gestion Owner
        </p>
        <h1 className="mt-1 text-3xl font-black">Nouveau membre</h1>
        <p className="mt-2 text-sm text-stone-500">
          Renseignez le profil administratif, les postes et le mode de rémunération.
        </p>

        <form action={action} className="mt-8 space-y-6">
          <input type="hidden" name="sex" value={sex} />
          <input type="hidden" name="jobTitleIds" value={JSON.stringify(selectedTitleIds)} />
          <input type="hidden" name="primaryJobTitleId" value={primaryTitleId} />
          <input
            type="hidden"
            name="newJobTitleIsPrimary"
            value={newTitleIsPrimary ? "true" : "false"}
          />

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="font-black">Identité et coordonnées</h2>
            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-2 text-sm font-bold text-stone-700">
                Nom complet
                <input name="name" required className={inputClass} />
                <Errors errors={state.errors?.name} />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm font-bold text-stone-700">
                  Sexe <span className="font-normal text-stone-400">(optionnel)</span>
                </legend>
                <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1">
                  {(
                    [
                      ["femme", "Femme"],
                      ["homme", "Homme"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={sex === value}
                      onClick={() => setSex((current) => (current === value ? "" : value))}
                      className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                        sex === value ? "bg-white text-emerald-950 shadow-sm" : "text-stone-500"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="space-y-2 text-sm font-bold text-stone-700">
                Téléphone
                <input name="phone" type="tel" className={inputClass} />
                <Errors errors={state.errors?.phone} />
              </label>

              <label className="space-y-2 text-sm font-bold text-stone-700">
                Résidence
                <input name="residence" className={inputClass} />
                <Errors errors={state.errors?.residence} />
              </label>

              <label className="space-y-2 text-sm font-bold text-stone-700">
                Type de pièce
                <select name="idType" defaultValue="" className={inputClass}>
                  <option value="">Non renseigné</option>
                  <option value="cni">CNI</option>
                  <option value="passeport">Passeport</option>
                </select>
                <Errors errors={state.errors?.idType} />
              </label>

              <label className="space-y-2 text-sm font-bold text-stone-700">
                Numéro de pièce
                <input name="idNumber" autoComplete="off" className={inputClass} />
                <Errors errors={state.errors?.idNumber} />
              </label>

              <label className="space-y-2 text-sm font-bold text-stone-700">
                Années d’expérience
                <input
                  name="yearsOfExperience"
                  type="number"
                  min={0}
                  max={80}
                  inputMode="numeric"
                  className={inputClass}
                />
                <Errors errors={state.errors?.yearsOfExperience} />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <div>
              <h2 className="font-black">Postes</h2>
              <p className="mt-1 text-sm text-stone-500">
                Sélectionnez plusieurs postes si nécessaire, puis marquez-en un comme principal.
              </p>
            </div>

            {titles.length > 0 ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {titles.map((title) => {
                  const selected = selectedTitleIds.includes(title.id);
                  const primary = primaryTitleId === title.id;
                  return (
                    <div
                      key={title.id}
                      className={`rounded-xl border p-4 transition ${
                        selected ? "border-emerald-700 bg-emerald-50" : "border-stone-200"
                      }`}
                    >
                      <label className="flex cursor-pointer items-center gap-3 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleTitle(title.id)}
                          className="size-4 accent-emerald-800"
                        />
                        {title.name}
                      </label>
                      {selected && (
                        <button
                          type="button"
                          onClick={() => chooseExistingPrimary(title.id)}
                          className={`mt-3 flex items-center gap-1.5 text-xs font-bold ${
                            primary ? "text-emerald-800" : "text-stone-500"
                          }`}
                        >
                          <BadgeCheck className="size-4" />
                          {primary ? "Poste principal" : "Définir comme principal"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-stone-50 p-4 text-sm text-stone-500">
                Aucun poste existant. Créez le premier ci-dessous.
              </p>
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <label className="space-y-2 text-sm font-bold text-stone-700">
                Nouveau poste <span className="font-normal text-stone-400">(optionnel)</span>
                <input name="newJobTitle" placeholder="Ex. Coloriste" className={inputClass} />
                <Errors errors={state.errors?.newJobTitle} />
              </label>
              <label className="flex min-h-12 items-center gap-2 rounded-xl border border-stone-200 px-4 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={newTitleIsPrimary}
                  onChange={(event) => {
                    setNewTitleIsPrimary(event.target.checked);
                    if (event.target.checked) setPrimaryTitleId("");
                  }}
                  className="size-4 accent-emerald-800"
                />
                Poste principal
              </label>
            </div>
            <Errors
              errors={[
                ...(state.errors?.jobTitleIds ?? []),
                ...(state.errors?.primaryJobTitleId ?? []),
              ]}
            />
          </section>

          <section className="grid gap-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6 lg:grid-cols-2">
            <div>
              <h2 className="font-black">Rémunération</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-bold text-stone-700">
                  Type de paie
                  <select
                    name="payType"
                    value={payType}
                    onChange={(event) => setPayType(event.target.value as PayType)}
                    className={inputClass}
                  >
                    <option value="fixed_salary">Salaire fixe</option>
                    <option value="commission">Commission</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-bold text-stone-700">
                  {payType === "fixed_salary" ? "Salaire mensuel (FCFA)" : "Taux de commission (%)"}
                  <input
                    name="payAmount"
                    type="number"
                    required
                    min={payType === "fixed_salary" ? 1 : 0.01}
                    max={payType === "commission" ? 100 : undefined}
                    step={payType === "fixed_salary" ? 1 : 0.01}
                    inputMode="decimal"
                    className={inputClass}
                  />
                  <Errors errors={state.errors?.payAmount} />
                </label>
              </div>
            </div>

            <div>
              <h2 className="font-black">Accès à l’application</h2>
              <label className="mt-5 block space-y-2 text-sm font-bold text-stone-700">
                Rôle système
                <select
                  name="systemRole"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className={inputClass}
                >
                  <option value="none">Aucun accès</option>
                  <option value="manager" disabled>
                    Manager (bientôt disponible)
                  </option>
                  <option value="director">Director</option>
                </select>
              </label>
              {role !== "none" && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-bold text-stone-700">
                    E-mail
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="off"
                      className={inputClass}
                    />
                    <Errors errors={state.errors?.email} />
                  </label>
                  <label className="space-y-2 text-sm font-bold text-stone-700">
                    Mot de passe
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={10}
                      autoComplete="new-password"
                      className={inputClass}
                    />
                    <Errors errors={state.errors?.password} />
                  </label>
                </div>
              )}
            </div>
          </section>

          {state.message && (
            <p
              role="alert"
              aria-live="polite"
              className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                state.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
              }`}
            >
              {state.message}
            </p>
          )}
          <Submit />
        </form>
      </div>
    </main>
  );
}
