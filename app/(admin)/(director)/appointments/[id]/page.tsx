import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getAppointment } from "@/lib/db/appointments";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointments/status";
import { formatDateFr, formatFcfa, formatTimeFr, PAYMENT_METHOD_LABELS } from "@/lib/format";
import {
  AppointmentCheckoutForm,
  AppointmentPaymentForm,
  AppointmentStatusForm,
} from "../status-forms";
import { todayInDouala } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function AppointmentPage({ params }: { params: { id: string } }) {
  if (!z.uuid().safeParse(params.id).success) notFound();
  const appointment = await getAppointment(params.id);
  if (!appointment) notFound();
  const total = appointment.appointmentServices.reduce((sum, line) => sum + line.price, 0);
  const paid = appointment.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(0, total - paid);
  const paymentLabel = paid === 0 ? "Non payé" : balance === 0 ? "Payé" : "Partiellement payé";
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <Link
        href={`/appointments?date=${todayInDouala(appointment.startTime)}`}
        className="font-bold text-emerald-800 underline"
      >
        ← Agenda
      </Link>
      <header className="rounded-2xl border bg-white p-6">
        <p className="text-sm font-bold uppercase text-emerald-800">
          {APPOINTMENT_STATUS_LABELS[appointment.status]}
        </p>
        <h1 className="mt-1 text-3xl font-black">{appointment.client.name}</h1>
        <p className="mt-2">
          {formatDateFr(appointment.startTime)} · {formatTimeFr(appointment.startTime)} ·{" "}
          {appointment.durationMinutes} minutes
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="font-black">Détails</h2>
          <p className="mt-3">
            Personnel : <strong>{appointment.staff.name}</strong>
          </p>
          <p>
            Client :{" "}
            <Link
              href={`/clients/${appointment.client.id}`}
              className="font-bold text-emerald-800 underline"
            >
              {appointment.client.name}
            </Link>
            {appointment.client.phone ? ` · ${appointment.client.phone}` : ""}
          </p>
          <ul className="mt-5 space-y-2">
            {appointment.appointmentServices.map((line) => (
              <li key={line.id} className="flex justify-between gap-3">
                <span>{line.service.name}</span>
                <strong>{formatFcfa(line.price)}</strong>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t pt-4 text-xl font-black">Total prévu : {formatFcfa(total)}</p>
          <div className="mt-3 rounded-xl bg-stone-50 p-4 text-sm">
            <p>
              <strong>{paymentLabel}</strong>
            </p>
            <p>
              Encaissé : {formatFcfa(paid)} · Solde : {formatFcfa(balance)}
            </p>
          </div>
          {appointment.notes && (
            <div className="mt-5 rounded-xl bg-stone-50 p-4">
              <h3 className="font-bold">Notes internes</h3>
              <p className="whitespace-pre-wrap text-sm">{appointment.notes}</p>
            </div>
          )}
          <p className="mt-5 text-xs text-stone-500">Créé par {appointment.createdBy.fullName}</p>
          {appointment.payments.map((payment) => (
            <p key={payment.id} className="mt-2 text-sm font-bold text-emerald-800">
              {payment.purpose === "advance" ? "Acompte" : "Solde"} {formatFcfa(payment.amount)} ·{" "}
              {PAYMENT_METHOD_LABELS[payment.method]}
            </p>
          ))}
        </section>
        <aside className="space-y-4">
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="mb-3 font-black">Changer le statut</h2>
            <AppointmentStatusForm id={appointment.id} status={appointment.status} />
          </section>
          {(["scheduled", "confirmed", "arrived"] as string[]).includes(appointment.status) && (
            <AppointmentPaymentForm id={appointment.id} balance={balance} />
          )}
          {appointment.status === "arrived" && (
            <AppointmentCheckoutForm id={appointment.id} balance={balance} />
          )}
        </aside>
      </div>
    </main>
  );
}
