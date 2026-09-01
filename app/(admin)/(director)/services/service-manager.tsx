"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  Archive,
  CircleDollarSign,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { formatFcfa } from "@/lib/format";
import { groupByServiceCategory } from "@/lib/services/group-by-category";
import {
  changeServiceStatusAction,
  createServiceAction,
  type ServiceFormState,
  updateServiceAction,
} from "@/app/(admin)/(director)/services/actions";

type CategoryOption = { id: string; name: string };
type ServiceListItem = {
  id: string;
  name: string;
  defaultPrice: number;
  active: boolean;
  isDeleted: boolean;
  category: CategoryOption | null;
};

const NEW_CATEGORY = "__new__";
const INITIAL_STATE: ServiceFormState = { success: false, message: "" };
const FIELD_CLASS =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";

function SubmitButton({
  label,
  pendingLabel,
  icon = "save",
}: {
  label: string;
  pendingLabel: string;
  icon?: "save" | "add";
}) {
  const { pending } = useFormStatus();
  const Icon = icon === "add" ? Plus : Save;
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center justify-center gap-2 rounded-xl bg-emerald-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-65"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      {pending ? pendingLabel : label}
    </button>
  );
}

function Feedback({ state }: { state: ServiceFormState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.success ? "status" : "alert"}
      className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${
        state.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
      }`}
    >
      {state.message}
    </p>
  );
}

function FieldErrors({ errors }: { errors?: string[] }) {
  return errors?.map((error) => (
    <span key={error} className="block text-xs font-medium text-red-700">
      {error}
    </span>
  ));
}

function CategoryFields({
  categories,
  state,
  initialCategoryId,
  resetKey,
}: {
  categories: CategoryOption[];
  state: ServiceFormState;
  initialCategoryId?: string;
  resetKey?: number;
}) {
  const defaultChoice = initialCategoryId || categories[0]?.id || NEW_CATEGORY;
  const [choice, setChoice] = useState(defaultChoice);

  useEffect(() => {
    setChoice(initialCategoryId || categories[0]?.id || NEW_CATEGORY);
  }, [categories, initialCategoryId, resetKey]);

  return (
    <div className="space-y-4">
      <input type="hidden" name="categoryId" value={choice === NEW_CATEGORY ? "" : choice} />
      <label className="block space-y-2 text-sm font-semibold text-stone-700">
        <span>Catégorie</span>
        <select
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          className={FIELD_CLASS}
          required
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
          <option value={NEW_CATEGORY}>+ Nouvelle catégorie</option>
        </select>
        <FieldErrors errors={state.errors?.categoryId} />
      </label>
      {choice === NEW_CATEGORY && (
        <label className="block space-y-2 text-sm font-semibold text-stone-700">
          <span>Nom de la nouvelle catégorie</span>
          <input
            name="newCategory"
            required
            maxLength={120}
            autoComplete="off"
            placeholder="Ex. Coloration"
            className={FIELD_CLASS}
          />
          <FieldErrors errors={state.errors?.newCategory} />
        </label>
      )}
    </div>
  );
}

function CreateServiceForm({ categories }: { categories: CategoryOption[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState(createServiceAction, INITIAL_STATE);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.submissionId, state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <label className="block space-y-2 text-sm font-semibold text-stone-700">
        <span>Nom de la prestation</span>
        <input
          name="name"
          required
          maxLength={120}
          autoComplete="off"
          placeholder="Ex. Coupe femme"
          className={FIELD_CLASS}
        />
        <FieldErrors errors={state.errors?.name} />
      </label>

      <CategoryFields categories={categories} state={state} resetKey={state.submissionId} />

      <label className="block space-y-2 text-sm font-semibold text-stone-700">
        <span>Prix de référence</span>
        <div className="relative">
          <input
            name="defaultPrice"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
            placeholder="Ex. 10000"
            className={`${FIELD_CLASS} pr-20`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">
            FCFA
          </span>
        </div>
        <FieldErrors errors={state.errors?.defaultPrice} />
      </label>

      <Feedback state={state} />
      <SubmitButton label="Ajouter la prestation" pendingLabel="Ajout…" icon="add" />
    </form>
  );
}

function UpdateServiceForm({
  service,
  categories,
}: {
  service: ServiceListItem;
  categories: CategoryOption[];
}) {
  const [state, formAction] = useFormState(updateServiceAction, INITIAL_STATE);
  return (
    <form
      action={formAction}
      className="mt-4 grid gap-4 border-t border-stone-200 pt-4 sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={service.id} />
      <label className="space-y-2 text-sm font-semibold text-stone-700">
        <span>Nom</span>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={service.name}
          className={FIELD_CLASS}
        />
        <FieldErrors errors={state.errors?.name} />
      </label>
      <label className="space-y-2 text-sm font-semibold text-stone-700">
        <span>Prix de référence</span>
        <div className="relative">
          <input
            name="defaultPrice"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
            defaultValue={service.defaultPrice}
            className={`${FIELD_CLASS} pr-20`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">
            FCFA
          </span>
        </div>
        <FieldErrors errors={state.errors?.defaultPrice} />
      </label>
      <div className="sm:col-span-2">
        <CategoryFields
          categories={categories}
          state={state}
          initialCategoryId={service.category?.id}
          resetKey={state.submissionId}
        />
      </div>
      <div className="space-y-3 sm:col-span-2">
        <Feedback state={state} />
        <SubmitButton label="Enregistrer les modifications" pendingLabel="Enregistrement…" />
      </div>
    </form>
  );
}

function StatusForm({
  id,
  operation,
  label,
  tone = "neutral",
}: {
  id: string;
  operation: "activate" | "deactivate" | "archive" | "restore";
  label: string;
  tone?: "neutral" | "danger" | "success";
}) {
  const [state, formAction] = useFormState(changeServiceStatusAction, INITIAL_STATE);
  const Icon = operation === "archive" ? Archive : operation === "restore" ? RotateCcw : Power;
  const toneClass = {
    neutral: "border-stone-300 text-stone-700 hover:border-emerald-700 hover:text-emerald-900",
    danger: "border-red-200 text-red-700 hover:bg-red-50",
    success: "border-emerald-200 text-emerald-800 hover:bg-emerald-50",
  }[tone];
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="operation" value={operation} />
      <StatusSubmitButton label={label} icon={Icon} toneClass={toneClass} />
      <Feedback state={state} />
    </form>
  );
}

function StatusSubmitButton({
  label,
  icon: Icon,
  toneClass,
}: {
  label: string;
  icon: typeof Power;
  toneClass: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-bold transition disabled:cursor-wait disabled:opacity-60 ${toneClass}`}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {pending ? "Mise à jour…" : label}
    </button>
  );
}

function ServiceCard({
  service,
  categories,
}: {
  service: ServiceListItem;
  categories: CategoryOption[];
}) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-900">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-stone-950">{service.name}</h3>
              <span
                className={`rounded-full px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-wide ${
                  service.active ? "bg-emerald-100 text-emerald-900" : "bg-stone-100 text-stone-500"
                }`}
              >
                {service.active ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-stone-600">
              <CircleDollarSign className="size-4 text-stone-400" aria-hidden="true" />
              {formatFcfa(service.defaultPrice)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <StatusForm
            id={service.id}
            operation={service.active ? "deactivate" : "activate"}
            label={service.active ? "Désactiver" : "Activer"}
          />
          <StatusForm id={service.id} operation="archive" label="Archiver" tone="danger" />
        </div>
      </div>
      <details className="mt-4 rounded-xl bg-stone-50 p-4">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-stone-700 transition hover:text-emerald-900">
          <Pencil className="size-3.5" aria-hidden="true" /> Modifier les informations
        </summary>
        <UpdateServiceForm service={service} categories={categories} />
      </details>
    </article>
  );
}

export function ServiceManager({
  services,
  categories,
}: {
  services: ServiceListItem[];
  categories: CategoryOption[];
}) {
  const availableServices = services.filter((service) => !service.isDeleted);
  const archivedServices = services.filter((service) => service.isDeleted);
  const activeCount = availableServices.filter((service) => service.active).length;
  const serviceGroups = groupByServiceCategory(availableServices);
  const archivedGroups = groupByServiceCategory(archivedServices);

  return (
    <main className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-800">
            Catalogue du salon
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Prestations</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Gérez les prestations par catégorie et leur prix de référence pour le registre.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl border border-stone-200 bg-white px-5 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Actives</p>
            <p className="mt-1 text-2xl font-black text-emerald-950">{activeCount}</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white px-5 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Catégories</p>
            <p className="mt-1 text-2xl font-black text-stone-900">{categories.length}</p>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:sticky lg:top-5">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-100 text-emerald-900">
              <Plus className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-black">Nouvelle prestation</h2>
              <p className="text-xs text-stone-500">Ajout au catalogue</p>
            </div>
          </div>
          <CreateServiceForm categories={categories} />
        </section>

        <div className="min-w-0 space-y-8">
          {serviceGroups.length ? (
            serviceGroups.map((group) => (
              <section key={group.id} aria-labelledby={`category-${group.id}`}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-stone-200 text-stone-600">
                    <FolderOpen className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id={`category-${group.id}`} className="text-xl font-black">
                      {group.name}
                    </h2>
                    <p className="text-xs text-stone-500">{group.items.length} prestation(s)</p>
                  </div>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {group.items.map((service) => (
                    <ServiceCard key={service.id} service={service} categories={categories} />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
              <Sparkles className="mx-auto size-8 text-stone-300" aria-hidden="true" />
              <h3 className="mt-4 font-black">Aucune prestation au catalogue</h3>
              <p className="mt-1 text-sm text-stone-500">
                Ajoutez la première prestation pour débloquer la saisie dans le registre.
              </p>
            </div>
          )}

          {archivedGroups.length > 0 && (
            <section className="rounded-2xl border border-stone-200 bg-stone-100/70 p-5">
              <h2 className="text-sm font-black uppercase tracking-wider text-stone-500">
                Prestations archivées
              </h2>
              <div className="mt-5 space-y-6">
                {archivedGroups.map((group) => (
                  <div key={group.id}>
                    <h3 className="mb-2 text-sm font-black text-stone-700">{group.name}</h3>
                    <div className="space-y-2">
                      {group.items.map((service) => (
                        <article
                          key={service.id}
                          className="flex flex-col justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center"
                        >
                          <div>
                            <h4 className="font-bold text-stone-700">{service.name}</h4>
                            <p className="mt-0.5 text-xs text-stone-400">
                              {formatFcfa(service.defaultPrice)} · Inactive
                            </p>
                          </div>
                          <StatusForm
                            id={service.id}
                            operation="restore"
                            label="Restaurer"
                            tone="success"
                          />
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
