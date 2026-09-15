import Link from "next/link";
import { CalendarDays, Clock3, TriangleAlert } from "lucide-react";
import { getCalendarData } from "@/lib/db/appointments";
import { calendarFiltersSchema } from "@/lib/validation/appointments";
import { addCalendarDays, dateTimeInDouala, todayInDouala } from "@/lib/dates";
import { formatDateFr, formatFcfa, formatTimeFr } from "@/lib/format";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointments/status";
import { AppointmentForm } from "./appointment-form";

export const dynamic = "force-dynamic";

const STATUS_CLASSES: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-800",
  confirmed: "bg-emerald-50 text-emerald-800",
  arrived: "bg-amber-50 text-amber-900",
  completed: "bg-stone-100 text-stone-700",
  cancelled: "bg-red-50 text-red-800",
  no_show: "bg-orange-50 text-orange-900",
};

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const rawDate = typeof searchParams?.date === "string" ? searchParams.date : todayInDouala();
  const parsed = calendarFiltersSchema.safeParse({
    date: rawDate,
    view: searchParams?.view,
    staffId: searchParams?.staff,
    serviceId: searchParams?.service,
    status: searchParams?.status,
  });
  const filters = parsed.success
    ? parsed.data
    : calendarFiltersSchema.parse({ date: todayInDouala() });
  const selectedClientId =
    typeof searchParams?.clientId === "string" ? searchParams.clientId : undefined;
  const data = await getCalendarData(filters, selectedClientId);
  const step = filters.view === "week" ? 7 : 1;
  const query = (date: string) =>
    `/appointments?${new URLSearchParams({ date, view: filters.view })}`;
  const initialStart =
    filters.date === todayInDouala()
      ? dateTimeInDouala(new Date(Date.now() + 30 * 60_000))
      : `${filters.date}T09:00`;
  return (
    <main className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">
            Planning du salon
          </p>
          <h1 className="mt-1 text-3xl font-black">Rendez-vous</h1>
          <p className="mt-2 text-sm text-stone-500">
            Agenda, arrivées, annulations et transformation en visites encaissées.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={query(addCalendarDays(filters.date, -step))}
            className="rounded-xl border bg-white px-4 py-2 font-bold"
          >
            ←
          </Link>
          <Link
            href={query(todayInDouala())}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"
          >
            Aujourd’hui
          </Link>
          <Link
            href={query(addCalendarDays(filters.date, step))}
            className="rounded-xl border bg-white px-4 py-2 font-bold"
          >
            →
          </Link>
        </div>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border bg-white p-5">
          <p className="flex items-center gap-2 text-sm text-stone-500">
            <Clock3 className="size-4" />À venir aujourd’hui
          </p>
          <p className="mt-2 text-3xl font-black">{data.todayUpcoming}</p>
        </article>
        <article className="rounded-2xl border bg-white p-5">
          <p className="flex items-center gap-2 text-sm text-stone-500">
            <TriangleAlert className="size-4" />
            En retard aujourd’hui
          </p>
          <p className="mt-2 text-3xl font-black">{data.todayLate}</p>
        </article>
      </div>
      <details
        className="rounded-2xl border bg-white p-5 shadow-sm"
        open={Boolean(selectedClientId)}
      >
        <summary className="cursor-pointer font-black">Planifier un rendez-vous</summary>
        <div className="mt-5">
          <AppointmentForm
            clients={data.clients}
            services={data.services}
            staff={data.staff}
            initialClientId={selectedClientId}
            initialStart={initialStart}
          />
        </div>
      </details>
      <form
        method="get"
        className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 xl:grid-cols-6"
      >
        <input
          type="date"
          name="date"
          className="rounded-xl border p-3"
          defaultValue={filters.date}
        />
        <select name="view" className="rounded-xl border p-3" defaultValue={filters.view}>
          <option value="day">Vue journée</option>
          <option value="week">Vue semaine</option>
        </select>
        <select name="staff" className="rounded-xl border p-3" defaultValue={filters.staffId ?? ""}>
          <option value="">Toute l’équipe</option>
          {data.staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
        <select
          name="service"
          className="rounded-xl border p-3"
          defaultValue={filters.serviceId ?? ""}
        >
          <option value="">Toutes les prestations</option>
          {data.services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
        <select name="status" className="rounded-xl border p-3" defaultValue={filters.status}>
          <option value="all">Tous les statuts</option>
          {Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="rounded-xl bg-emerald-950 px-4 py-3 font-bold text-white">
          Filtrer
        </button>
      </form>
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays className="size-5" />
          <h2 className="font-black">
            {filters.view === "day"
              ? formatDateFr(data.range.start)
              : `Semaine du ${formatDateFr(data.range.start)}`}
          </h2>
        </div>
        <div className="space-y-3">
          {data.appointments.map((appointment) => {
            const total = appointment.appointmentServices.reduce(
              (sum, line) => sum + line.price,
              0,
            );
            const paid = appointment.payments.reduce((sum, payment) => sum + payment.amount, 0);
            const paymentStatus =
              paid === 0 ? "Non payé" : paid >= total ? "Payé" : "Partiellement payé";
            return (
              <Link
                key={appointment.id}
                href={`/appointments/${appointment.id}`}
                className="grid gap-2 rounded-xl border p-4 hover:bg-stone-50 sm:grid-cols-[9rem_1fr_auto]"
              >
                <div>
                  <strong>{formatTimeFr(appointment.startTime)}</strong>
                  <p className="text-xs text-stone-500">
                    {formatDateFr(appointment.startTime)} · {appointment.durationMinutes} min
                  </p>
                </div>
                <div>
                  <p className="font-bold">
                    {appointment.client.name} · {appointment.staff.name}
                  </p>
                  <p className="text-sm text-stone-500">
                    {appointment.appointmentServices.map((line) => line.service.name).join(" · ")}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-bold ${STATUS_CLASSES[appointment.status]}`}
                  >
                    {APPOINTMENT_STATUS_LABELS[appointment.status]}
                  </span>
                  <p className="mt-2 text-sm font-bold">{formatFcfa(total)}</p>
                  <p className="text-xs text-stone-500">
                    {paymentStatus} · {formatFcfa(paid)} encaissé
                  </p>
                </div>
              </Link>
            );
          })}
          {!data.appointments.length && (
            <p className="py-12 text-center text-sm text-stone-500">
              Aucun rendez-vous pour cette sélection.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
