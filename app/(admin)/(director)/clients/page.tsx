import Link from "next/link";
import { UsersRound, ArrowUpRight, Search } from "lucide-react";
import { getClientsPageData, getClientReferrers, CLIENT_PAGE_SIZE } from "@/lib/db/clients";
import { DISCOVERY_LABELS } from "@/lib/clients/discovery";
import { clientFiltersSchema } from "@/lib/validation/clients";
import { formatDateFr } from "@/lib/format";
import { Pagination } from "@/components/admin/pagination";
import { ClientForm } from "./client-form";
import { ClientTransferPanel } from "./transfer-panel";

export const dynamic = "force-dynamic";
const field = "rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const parsed = clientFiltersSchema.safeParse(searchParams ?? {});
  const filters = parsed.success ? parsed.data : clientFiltersSchema.parse({});
  const { clients, total, page } = await getClientsPageData(filters);
  const referrers = await getClientReferrers();
  const href = (nextPage: number) =>
    `/clients?${new URLSearchParams({ ...filters, days: String(filters.days), page: String(nextPage) })}`;
  return (
    <main className="w-full space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">
            Relation client
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Clients</h1>
          <p className="mt-2 text-sm text-stone-500">
            Retrouvez les coordonnées, préférences et visites de votre clientèle.
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-bold text-emerald-950">
          <UsersRound className="size-5" />
          {total} client(s)
        </span>
      </header>
      <ClientTransferPanel />
      <details className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer font-bold text-emerald-900">Ajouter un client</summary>
        <div className="mt-5 max-w-3xl">
          <ClientForm referrers={referrers} />
        </div>
      </details>
      <section
        className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
        aria-label="Filtres clients"
      >
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-semibold">
            Rechercher
            <input
              className={field}
              name="q"
              defaultValue={filters.q}
              maxLength={120}
              placeholder="Nom, téléphone ou e-mail"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Fiches
            <select className={field} name="status" defaultValue={filters.status}>
              <option value="active">Actives</option>
              <option value="archived">Archivées</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Visites
            <select className={field} name="segment" defaultValue={filters.segment}>
              <option value="all">Tous les clients</option>
              <option value="recent">Visite récente</option>
              <option value="inactive">À relancer</option>
              <option value="never">Jamais venus</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Source
            <select name="discoverySource" defaultValue={filters.discoverySource} className={field}>
              <option value="all">Toutes les sources</option>
              {Object.entries(DISCOVERY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-32 flex-col gap-1.5 text-sm font-semibold">
            Seuil (jours)
            <input
              className={field}
              name="days"
              type="number"
              min={1}
              max={3650}
              defaultValue={filters.days}
            />
          </label>
          <button className="flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white">
            <Search className="size-4" />
            Filtrer
          </button>
        </form>
        <p className="mt-3 text-xs text-stone-500">
          « À relancer » : déjà venus, mais aucune visite depuis au moins {filters.days} jours.
          Aucun message n’est envoyé automatiquement.
        </p>
      </section>
      {clients.length ? (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-100 text-xs uppercase text-stone-500">
              <tr>
                <th className="p-4">Client</th>
                <th className="p-4">Coordonnées</th>
                <th className="p-4">Source</th>
                <th className="p-4">Visites</th>
                <th className="p-4">Dernière visite</th>
                <th className="p-4">
                  <span className="sr-only">Fiche</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-stone-50">
                  <td className="p-4 font-bold">
                    <Link
                      className="text-emerald-900 hover:underline"
                      href={`/clients/${client.id}`}
                    >
                      {client.name}
                    </Link>
                  </td>
                  <td className="p-4 text-stone-600">
                    <p>{client.phone || "—"}</p>
                    <p className="text-xs">{client.email}</p>
                  </td>
                  <td className="p-4">
                    {DISCOVERY_LABELS[client.discoverySource as keyof typeof DISCOVERY_LABELS]}
                  </td>
                  <td className="p-4">{client._count.appointments}</td>
                  <td className="p-4">
                    {client.appointments[0]
                      ? formatDateFr(client.appointments[0].startTime)
                      : "Aucune visite"}
                  </td>
                  <td className="p-4">
                    <Link
                      aria-label={`Ouvrir la fiche de ${client.name}`}
                      href={`/clients/${client.id}`}
                    >
                      <ArrowUpRight className="size-5 text-emerald-800" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <UsersRound className="mx-auto size-8 text-stone-300" />
          <h2 className="mt-4 font-bold">Aucun client pour cette sélection</h2>
          <p className="mt-2 text-sm text-stone-500">Ajoutez une fiche ou ajustez les filtres.</p>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={CLIENT_PAGE_SIZE} href={href} />
    </main>
  );
}
