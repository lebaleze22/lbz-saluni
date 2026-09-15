import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getClientDetail, getClientReferrers, CLIENT_HISTORY_PAGE_SIZE } from "@/lib/db/clients";
import { DISCOVERY_LABELS } from "@/lib/clients/discovery";
import {
  formatDateFr,
  formatTimeFr,
  formatFcfa,
  PAYMENT_METHOD_LABELS,
  SOURCE_LABELS,
} from "@/lib/format";
import { formatQuantity } from "@/lib/inventory/quantities";
import { Pagination } from "@/components/admin/pagination";
import { ClientForm, ClientStatusForm } from "../client-form";
import { ClientActivityForm } from "../activity-form";
import { ACTIVITY_LABELS } from "@/lib/validation/client-activity";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointments/status";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { page?: string; activityPage?: string; salePage?: string };
}) {
  if (!z.uuid().safeParse(params.id).success) notFound();
  const requested = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .catch(1)
    .parse(searchParams?.page ?? 1);
  const activityRequested = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .catch(1)
    .parse(searchParams?.activityPage ?? 1);
  const saleRequested = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .catch(1)
    .parse(searchParams?.salePage ?? 1);
  const data = await getClientDetail(params.id, requested, activityRequested, saleRequested);
  if (!data) notFound();
  const referrers = await getClientReferrers();
  const { client, visits, page, visitCount, totalPaid } = data;
  return (
    <main className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/clients" className="text-sm font-bold text-emerald-800 hover:underline">
        ← Tous les clients
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">
            Dossier client{client.isDeleted ? " · Archivé" : ""}
          </p>
          <h1 className="mt-1 text-3xl font-black">{client.name}</h1>
          <p className="mt-2 text-sm text-stone-500">
            {client.phone || "Téléphone non renseigné"}
            {client.email ? ` · ${client.email}` : ""}
          </p>
        </div>
        {!client.isDeleted && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/register?clientId=${client.id}`}
              className="rounded-xl bg-emerald-950 px-4 py-3 text-sm font-bold text-white"
            >
              Enregistrer une visite
            </Link>
            <Link
              href={`/appointments?clientId=${client.id}`}
              className="rounded-xl border border-emerald-900 bg-white px-4 py-3 text-sm font-bold text-emerald-950"
            >
              Planifier un rendez-vous
            </Link>
            <Link
              href={`/sales?clientId=${client.id}`}
              className="rounded-xl border border-emerald-900 bg-white px-4 py-3 text-sm font-bold text-emerald-950"
            >
              Vendre un produit
            </Link>
          </div>
        )}
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Visites enregistrées</p>
          <p className="mt-2 text-3xl font-black">{visitCount}</p>
        </article>
        <article className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Prestations encaissées</p>
          <p className="mt-2 text-3xl font-black">{formatFcfa(totalPaid)}</p>
        </article>
        <article className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Produits encaissés</p>
          <p className="mt-2 text-3xl font-black">{formatFcfa(data.retailPaid)}</p>
        </article>
      </div>
      {client.allergies && (
        <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-bold text-amber-950">Allergies et précautions signalées</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{client.allergies}</p>
        </aside>
      )}
      <section className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <h2 className="font-bold">Adresse</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">
            {[client.city, client.neighbourhood, client.addressDetails]
              .filter(Boolean)
              .join("\n") || "Adresse non renseignée."}
          </p>
        </div>
        <div>
          <h2 className="font-bold">Origine du client</h2>
          <p className="mt-2 text-sm">
            {DISCOVERY_LABELS[client.discoverySource as keyof typeof DISCOVERY_LABELS]}
          </p>
          <p className="whitespace-pre-wrap text-sm text-stone-600">{client.discoveryDetails}</p>
          {client.referredByClient && (
            <p className="mt-2 text-sm">
              Recommandé par{" "}
              <Link
                className="font-bold text-emerald-800 underline"
                href={`/clients/${client.referredByClient.id}`}
              >
                {client.referredByClient.name}
              </Link>
            </p>
          )}
          {client.referrerName && (
            <p className="mt-2 text-sm">Recommandé par {client.referrerName}</p>
          )}
        </div>
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Historique des rendez-vous</h2>
            <p className="text-sm text-stone-500">
              Planifiés, confirmés, arrivés, annulés ou absents.
            </p>
          </div>
          {!client.isDeleted && (
            <Link
              href={`/appointments?clientId=${client.id}`}
              className="text-sm font-bold text-emerald-800 underline"
            >
              Planifier
            </Link>
          )}
        </div>
        <div className="mt-4 space-y-3">
          {data.appointments.map((appointment) => (
            <Link
              key={appointment.id}
              href={`/appointments/${appointment.id}`}
              className="block rounded-xl border p-4 hover:bg-stone-50"
            >
              <strong>
                {formatDateFr(appointment.startTime)} · {formatTimeFr(appointment.startTime)}
              </strong>
              <p className="text-sm">
                {appointment.staff.name} · {APPOINTMENT_STATUS_LABELS[appointment.status]}
              </p>
              <p className="text-xs text-stone-500">
                {appointment.appointmentServices.map((line) => line.service.name).join(" · ")}
              </p>
              <p className="mt-1 text-xs font-semibold text-emerald-800">
                {(() => {
                  const total = appointment.appointmentServices.reduce(
                    (sum, line) => sum + line.price,
                    0,
                  );
                  const paid = appointment.payments.reduce(
                    (sum, payment) => sum + payment.amount,
                    0,
                  );
                  return paid === 0
                    ? "Non payé"
                    : paid >= total
                      ? `Payé · ${formatFcfa(paid)}`
                      : `Partiellement payé · ${formatFcfa(paid)} sur ${formatFcfa(total)}`;
                })()}
              </p>
            </Link>
          ))}
          {!data.appointments.length && (
            <p className="text-sm text-stone-500">Aucun rendez-vous enregistré.</p>
          )}
          {data.appointmentCount > data.appointments.length && (
            <p className="text-xs text-stone-500">
              Les 20 rendez-vous les plus récents sont affichés.
            </p>
          )}
        </div>
      </section>
      <section className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <h2 className="font-bold">Préférences du client</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">
            {client.preferences || "Aucune préférence renseignée."}
          </p>
        </div>
        <div>
          <h2 className="font-bold">Notes internes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">
            {client.notes || "Aucune note renseignée."}
          </p>
        </div>
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Journal de suivi</h2>
        <p className="mt-1 text-sm text-stone-500">
          Consultations, observations et évolution des préférences, avec la date et l’auteur.
        </p>
        <div className="mt-4 grid items-start gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            {data.activities.length ? (
              data.activities.map((activity) => (
                <article key={activity.id} className="rounded-xl border border-stone-200 p-4">
                  <h3 className="font-bold">
                    {ACTIVITY_LABELS[activity.kind as keyof typeof ACTIVITY_LABELS] ??
                      activity.kind}
                  </h3>
                  <p className="text-xs text-stone-500">
                    {formatDateFr(activity.occurredAt)} · {formatTimeFr(activity.occurredAt)} ·{" "}
                    {activity.author.fullName}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{activity.body}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-stone-500">Aucun suivi ajouté pour le moment.</p>
            )}
            <Pagination
              page={data.activityPage}
              total={data.activityCount}
              pageSize={20}
              href={(next) =>
                `/clients/${client.id}?page=${page}&activityPage=${next}&salePage=${data.retailPage}`
              }
            />
          </div>
          {!client.isDeleted && <ClientActivityForm clientId={client.id} />}
        </div>
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Produits achetés</h2>
            <p className="text-sm text-stone-500">Reçus de vente associés à cette fiche client.</p>
          </div>
          {!client.isDeleted && (
            <Link
              href={`/sales?clientId=${client.id}`}
              className="text-sm font-bold text-emerald-800 underline"
            >
              Enregistrer une vente
            </Link>
          )}
        </div>
        <div className="mt-4 space-y-3">
          {data.retailSales.length ? (
            data.retailSales.map((sale) => (
              <Link
                key={sale.id}
                href={`/sales/${sale.id}`}
                className="flex flex-wrap justify-between gap-3 rounded-xl border border-stone-200 p-4 hover:bg-stone-50"
              >
                <span>
                  <strong>{sale.productName}</strong> · {formatQuantity(sale.quantity.toString())}{" "}
                  {sale.unit}
                  <small className="mt-1 block text-stone-500">
                    {formatDateFr(sale.soldAt)} · {formatTimeFr(sale.soldAt)} ·{" "}
                    {PAYMENT_METHOD_LABELS[sale.method]}
                  </small>
                </span>
                <strong>{formatFcfa(sale.total)}</strong>
              </Link>
            ))
          ) : (
            <p className="text-sm text-stone-500">Aucun achat de produit associé à ce client.</p>
          )}
        </div>
        <Pagination
          page={data.retailPage}
          total={data.retailSaleCount}
          pageSize={20}
          href={(next) =>
            `/clients/${client.id}?page=${page}&activityPage=${data.activityPage}&salePage=${next}`
          }
        />
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">Historique des visites</h2>
          <p className="mt-1 text-xs text-stone-500">
            Prestations réalisées et produits consommés enregistrés au moment de chaque visite.
          </p>
          <div className="mt-5 space-y-4">
            {visits.length ? (
              visits.map((visit) => (
                <article key={visit.id} className="rounded-xl border border-stone-200 p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="font-bold">
                      {formatDateFr(visit.startTime)} · {formatTimeFr(visit.startTime)}
                    </h3>
                    <span className="font-black text-emerald-950">
                      {formatFcfa(visit.payments.reduce((sum, payment) => sum + payment.amount, 0))}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {visit.staff.name} · {SOURCE_LABELS[visit.source]} ·{" "}
                    {visit.payments
                      .map((payment) => PAYMENT_METHOD_LABELS[payment.method])
                      .join(" + ")}
                  </p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {visit.appointmentServices.map((line, index) => (
                      <li key={index} className="flex justify-between gap-3">
                        <span>{line.service.name}</span>
                        <span>{formatFcfa(line.price)}</span>
                      </li>
                    ))}
                  </ul>
                  {visit.stockMovements.length > 0 && (
                    <div className="mt-3 rounded-lg bg-stone-50 p-3">
                      <p className="text-xs font-bold uppercase text-stone-500">
                        Produits utilisés
                      </p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {visit.stockMovements.map((movement) => (
                          <li key={movement.id}>
                            {movement.productName} ·{" "}
                            {formatQuantity(movement.quantity.abs().toString())} {movement.unit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              ))
            ) : (
              <p className="py-10 text-center text-sm text-stone-500">
                Aucune visite enregistrée pour ce client.
              </p>
            )}
          </div>
          <Pagination
            page={page}
            total={visitCount}
            pageSize={CLIENT_HISTORY_PAGE_SIZE}
            href={(next) =>
              `/clients/${client.id}?page=${next}&activityPage=${data.activityPage}&salePage=${data.retailPage}`
            }
          />
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-lg font-black">Coordonnées et suivi</h2>
          {client.isDeleted ? (
            <div className="space-y-4 text-sm">
              {[
                ["Préférences", client.preferences],
                ["Notes internes", client.notes],
              ].map(([label, value]) => (
                <div key={label}>
                  <h3 className="font-bold">{label}</h3>
                  <p className="whitespace-pre-wrap text-stone-600">{value || "Non renseigné"}</p>
                </div>
              ))}
              <p className="text-stone-500">Restaurez la fiche pour modifier ses informations.</p>
            </div>
          ) : (
            <ClientForm client={client} referrers={referrers} />
          )}
          <div className="mt-6 border-t border-stone-200 pt-5">
            <p className="mb-3 text-xs text-stone-500">
              L’archivage retire le client de la saisie rapide et conserve son historique.
            </p>
            <ClientStatusForm id={client.id} archived={client.isDeleted} />
          </div>
        </section>
      </div>
    </main>
  );
}
