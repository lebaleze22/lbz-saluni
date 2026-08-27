import { CalendarDays, Clock3, Filter, NotebookTabs, UserRound } from "lucide-react";
import { getRegisterPageData } from "@/lib/db/register";
import { AccessDeniedError } from "@/lib/db/auth";
import { todayInDouala } from "@/lib/dates";
import {
  formatDateFr,
  formatFcfa,
  formatTimeFr,
  PAYMENT_METHOD_LABELS,
  SOURCE_LABELS,
} from "@/lib/format";
import { QuickEntryForm } from "@/app/(admin)/register/quick-entry-form";
import { registerFiltersSchema } from "@/lib/validation/register";

export const dynamic = "force-dynamic";

function AccessMessage({ message }: { message: string }) {
  return (
    <main className="w-full px-4 py-20 text-center sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8">
        <h1 className="text-xl font-black text-amber-950">Accès au registre indisponible</h1>
        <p className="mt-2 text-sm text-amber-800">{message}</p>
      </div>
    </main>
  );
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: { date?: string; staff?: string };
}) {
  const parsedFilters = registerFiltersSchema.safeParse({
    date: searchParams?.date ?? todayInDouala(),
    staffId: searchParams?.staff || undefined,
  });
  const filters = parsedFilters.success
    ? parsedFilters.data
    : registerFiltersSchema.parse({ date: todayInDouala() });
  const { date, staffId: staffFilter } = filters;

  let data;
  try {
    data = await getRegisterPageData(date, staffFilter);
  } catch (error) {
    if (error instanceof AccessDeniedError) return <AccessMessage message={error.message} />;
    throw error;
  }

  const dayTotal = data.entries.reduce((sum, entry) => sum + (entry.payment?.amount ?? 0), 0);

  return (
    <main className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-800">
            Journal de caisse
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
            Registre d’activité
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">
            Enregistrez une visite en quelques secondes et suivez l’activité quotidienne du salon.
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400">
            Chiffre du jour
          </p>
          <p className="mt-1 text-2xl font-black text-emerald-950">{formatFcfa(dayTotal)}</p>
          <p className="mt-1 text-xs text-stone-500">
            {data.entries.length} visite(s) enregistrée(s)
          </p>
        </div>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[26rem_1fr]">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:sticky lg:top-5">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-100 text-emerald-900">
              <NotebookTabs className="size-4" />
            </span>
            <div>
              <h2 className="font-black">Saisie rapide</h2>
              <p className="text-xs text-stone-500">Nouvelle visite</p>
            </div>
          </div>
          {data.staff.length > 0 && data.services.length > 0 ? (
            <QuickEntryForm staff={data.staff} services={data.services} clients={data.clients} />
          ) : (
            <div className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Ajoutez au moins un membre du personnel et une prestation active avant de saisir une
              visite.
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-400">
                <CalendarDays className="size-4" /> Journée affichée
              </p>
              <h2 className="mt-1 text-xl font-black capitalize">
                {formatDateFr(new Date(`${date}T12:00:00+01:00`))}
              </h2>
            </div>
            <form method="get" className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="register-date">
                Date du registre
              </label>
              <input
                id="register-date"
                type="date"
                name="date"
                defaultValue={date}
                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-emerald-700"
              />
              <label className="sr-only" htmlFor="register-staff">
                Filtrer par personnel
              </label>
              <select
                id="register-staff"
                name="staff"
                defaultValue={staffFilter ?? ""}
                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-emerald-700"
              >
                <option value="">Toute l’équipe</option>
                {data.staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white"
              >
                <Filter className="size-4" /> Filtrer
              </button>
            </form>
          </div>

          {data.entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
              <Clock3 className="mx-auto size-8 text-stone-300" />
              <h3 className="mt-4 font-black">Aucune visite pour cette sélection</h3>
              <p className="mt-1 text-sm text-stone-500">
                Les visites saisies apparaîtront ici par ordre chronologique.
              </p>
            </div>
          ) : (
            <ol className="relative space-y-3 before:absolute before:bottom-5 before:left-[2.15rem] before:top-5 before:w-px before:bg-stone-200">
              {data.entries.map((entry) => (
                <li key={entry.id} className="relative grid grid-cols-[4.4rem_1fr] gap-3">
                  <time className="z-10 self-start rounded-xl border border-stone-200 bg-white px-2 py-2 text-center text-sm font-black text-emerald-950 shadow-sm">
                    {formatTimeFr(entry.startTime)}
                  </time>
                  <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <h3 className="flex items-center gap-2 font-black">
                          <UserRound className="size-4 text-stone-400" /> {entry.client.name}
                        </h3>
                        <p className="mt-1 text-xs text-stone-500">
                          {entry.staff.name} · {SOURCE_LABELS[entry.source]}
                          {entry.client.phone ? ` · ${entry.client.phone}` : ""}
                        </p>
                      </div>
                      {entry.payment && (
                        <div className="sm:text-right">
                          <p className="font-black text-emerald-950">
                            {formatFcfa(entry.payment.amount)}
                          </p>
                          <p className="text-xs text-stone-500">
                            {PAYMENT_METHOD_LABELS[entry.payment.method]}
                          </p>
                        </div>
                      )}
                    </div>
                    <ul className="mt-3 divide-y divide-stone-100 rounded-xl bg-stone-50 px-3">
                      {entry.services.map((service) => (
                        <li key={service.id} className="flex justify-between gap-4 py-2 text-sm">
                          <span className="text-stone-700">{service.name}</span>
                          <span className="font-bold text-stone-900">
                            {formatFcfa(service.price)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
