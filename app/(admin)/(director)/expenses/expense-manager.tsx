"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  Archive,
  CalendarDays,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Tags,
} from "lucide-react";
import { formatDateFr, formatFcfa } from "@/lib/format";
import {
  changeExpenseStatusAction,
  createExpenseAction,
  type ExpenseFormState,
  updateExpenseAction,
} from "@/app/(admin)/(director)/expenses/actions";

type ExpenseListItem = {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  occurredAt: Date;
  isDeleted: boolean;
  recordedBy: { name: string };
};

const INITIAL_STATE: ExpenseFormState = { success: false, message: "" };
const FIELD_CLASS =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";

function dateInputValue(date: Date): string {
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Douala",
  }).format(new Date(date));
}

function SubmitButton({ edit = false }: { edit?: boolean }) {
  const { pending } = useFormStatus();
  const Icon = edit ? Save : Plus;
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center justify-center gap-2 rounded-xl bg-emerald-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-65"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      {pending ? "Enregistrement…" : edit ? "Enregistrer les modifications" : "Ajouter la dépense"}
    </button>
  );
}

function Feedback({ state }: { state: ExpenseFormState }) {
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

function ExpenseFields({
  state,
  expense,
  defaultDate,
}: {
  state: ExpenseFormState;
  expense?: ExpenseListItem;
  defaultDate: string;
}) {
  return (
    <>
      <label className="block space-y-2 text-sm font-semibold text-stone-700">
        <span>Description</span>
        <input
          name="description"
          required
          maxLength={240}
          autoComplete="off"
          defaultValue={expense?.description}
          placeholder="Ex. Achat de shampoings"
          className={FIELD_CLASS}
        />
        <FieldErrors errors={state.errors?.description} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2 text-sm font-semibold text-stone-700">
          <span>Montant</span>
          <div className="relative">
            <input
              name="amount"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              defaultValue={expense?.amount}
              placeholder="Ex. 15000"
              className={`${FIELD_CLASS} pr-20`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">
              FCFA
            </span>
          </div>
          <FieldErrors errors={state.errors?.amount} />
        </label>

        <label className="block space-y-2 text-sm font-semibold text-stone-700">
          <span>Date</span>
          <input
            name="occurredAt"
            type="date"
            required
            defaultValue={expense ? dateInputValue(expense.occurredAt) : defaultDate}
            className={FIELD_CLASS}
          />
          <FieldErrors errors={state.errors?.occurredAt} />
        </label>
      </div>

      <label className="block space-y-2 text-sm font-semibold text-stone-700">
        <span>
          Catégorie <span className="font-normal text-stone-400">(optionnel)</span>
        </span>
        <input
          name="category"
          maxLength={120}
          autoComplete="off"
          defaultValue={expense?.category ?? ""}
          placeholder="Ex. Fournitures, loyer, transport"
          className={FIELD_CLASS}
        />
        <FieldErrors errors={state.errors?.category} />
      </label>
    </>
  );
}

function CreateExpenseForm({ defaultDate }: { defaultDate: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState(createExpenseAction, INITIAL_STATE);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.submissionId, state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <ExpenseFields state={state} defaultDate={defaultDate} />
      <Feedback state={state} />
      <SubmitButton />
    </form>
  );
}

function UpdateExpenseForm({
  expense,
  defaultDate,
}: {
  expense: ExpenseListItem;
  defaultDate: string;
}) {
  const [state, formAction] = useFormState(updateExpenseAction, INITIAL_STATE);
  return (
    <form action={formAction} className="mt-5 space-y-4 border-t border-stone-200 pt-5">
      <input type="hidden" name="id" value={expense.id} />
      <ExpenseFields state={state} expense={expense} defaultDate={defaultDate} />
      <Feedback state={state} />
      <SubmitButton edit />
    </form>
  );
}

function StatusButton({ expense }: { expense: ExpenseListItem }) {
  const [state, formAction] = useFormState(changeExpenseStatusAction, INITIAL_STATE);
  const operation = expense.isDeleted ? "restore" : "archive";
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={expense.id} />
      <input type="hidden" name="operation" value={operation} />
      <button
        type="submit"
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${
          expense.isDeleted
            ? "border-emerald-200 text-emerald-800 hover:bg-emerald-50"
            : "border-stone-200 text-stone-600 hover:bg-stone-50"
        }`}
      >
        {expense.isDeleted ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}
        {expense.isDeleted ? "Restaurer" : "Archiver"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ExpenseManager({ expenses }: { expenses: ExpenseListItem[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const today = dateInputValue(new Date());
  const currentExpenses = expenses.filter((expense) => !expense.isDeleted);
  const total = currentExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <main className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-800">
            Trésorerie du salon
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Dépenses</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Saisissez rapidement les sorties d’argent réelles. Elles alimentent automatiquement les
            rapports.
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-3 text-right shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Total affiché</p>
          <p className="mt-1 text-xl font-black text-stone-900">{formatFcfa(total)}</p>
        </div>
      </div>

      <div className="mt-7 grid w-full gap-6 xl:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
        <section className="h-fit rounded-2xl border border-stone-200 bg-white p-5 shadow-sm xl:sticky xl:top-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-900">
              <ReceiptText className="size-5" />
            </span>
            <div>
              <h2 className="font-black">Nouvelle dépense</h2>
              <p className="text-xs text-stone-400">Les quatre informations essentielles</p>
            </div>
          </div>
          <CreateExpenseForm defaultDate={today} />
        </section>

        <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-black">Historique</h2>
              <p className="mt-1 text-xs text-stone-400">
                {currentExpenses.length} dépense(s) active(s) ·{" "}
                {expenses.length - currentExpenses.length} archivée(s)
              </p>
            </div>
            <ReceiptText className="size-5 text-emerald-800" />
          </div>

          {expenses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-300 px-5 py-12 text-center">
              <ReceiptText className="mx-auto size-8 text-stone-300" />
              <p className="mt-3 text-sm font-bold text-stone-600">Aucune dépense enregistrée</p>
              <p className="mt-1 text-xs text-stone-400">
                La première apparaîtra ici immédiatement.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {expenses.map((expense) => (
                <article
                  key={expense.id}
                  className={`rounded-xl border p-4 ${
                    expense.isDeleted
                      ? "border-stone-200 bg-stone-50 opacity-75"
                      : "border-stone-200 bg-white"
                  }`}
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-stone-900">{expense.description}</h3>
                        {expense.isDeleted && (
                          <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[0.65rem] font-bold uppercase text-stone-600">
                            Archivée
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="size-3.5" />{" "}
                          {formatDateFr(new Date(expense.occurredAt))}
                        </span>
                        {expense.category && (
                          <span className="flex items-center gap-1.5">
                            <Tags className="size-3.5" /> {expense.category}
                          </span>
                        )}
                        <span>Saisi par {expense.recordedBy.name}</span>
                      </div>
                    </div>
                    <p className="shrink-0 text-lg font-black text-stone-950">
                      {formatFcfa(expense.amount)}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-start gap-2">
                    {!expense.isDeleted && (
                      <button
                        type="button"
                        onClick={() => setEditingId(editingId === expense.id ? null : expense.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
                      >
                        <Pencil className="size-3.5" />
                        {editingId === expense.id ? "Fermer" : "Modifier"}
                      </button>
                    )}
                    <StatusButton expense={expense} />
                  </div>

                  {editingId === expense.id && !expense.isDeleted && (
                    <UpdateExpenseForm expense={expense} defaultDate={today} />
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
