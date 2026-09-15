import Link from "next/link";
import { z } from "zod";
import { getRetailPage } from "@/lib/db/retail";
import { formatFcfa, formatDateFr, formatTimeFr, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { Pagination } from "@/components/admin/pagination";
import { SaleForm } from "./sale-form";

export const dynamic = "force-dynamic";

export default async function SalesPage({
  searchParams,
}: {
  searchParams?: { page?: string; clientId?: string };
}) {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .catch(1)
    .parse(searchParams?.page ?? 1);
  const clientId = z.uuid().optional().catch(undefined).parse(searchParams?.clientId);
  const data = await getRetailPage(page, clientId);
  return (
    <main className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Encaissement</p>
        <h1 className="mt-1 text-3xl font-black">Ventes de produits</h1>
        <p className="mt-2 text-sm text-stone-500">
          Paiements, reçus et déduction automatique du stock.
        </p>
      </header>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-lg font-black">Nouvelle vente</h2>
          {data.products.length ? (
            <SaleForm products={data.products} clients={data.clients} initialClientId={clientId} />
          ) : (
            <p className="text-sm text-stone-600">
              Aucun produit actif, en stock et doté d’un prix de vente. Complétez d’abord le
              catalogue dans{" "}
              <Link className="font-bold underline" href="/inventory">
                Stock
              </Link>
              .
            </p>
          )}
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">
            Historique des ventes{clientId ? " du client" : ""}
          </h2>
          {clientId && (
            <Link href="/sales" className="text-sm text-emerald-800 underline">
              Afficher toutes les ventes
            </Link>
          )}
          <div className="mt-4 space-y-3">
            {data.sales.map((sale) => (
              <Link
                href={`/sales/${sale.id}`}
                key={sale.id}
                className="block rounded-xl border border-stone-200 p-4 hover:bg-stone-50"
              >
                <p className="font-bold">
                  {sale.productName} · {sale.quantity.toString()} {sale.unit}
                </p>
                <p className="text-sm">
                  {formatFcfa(sale.total)} · {PAYMENT_METHOD_LABELS[sale.method]}
                </p>
                <p className="text-xs text-stone-500">
                  {formatDateFr(sale.soldAt)} · {formatTimeFr(sale.soldAt)} ·{" "}
                  {sale.client?.name || "Sans fiche client"}
                </p>
              </Link>
            ))}
            {!data.sales.length && (
              <p className="text-sm text-stone-500">Aucune vente enregistrée.</p>
            )}
          </div>
          <Pagination
            page={data.page}
            total={data.total}
            pageSize={25}
            href={(next) => `/sales?page=${next}${clientId ? `&clientId=${clientId}` : ""}`}
          />
        </section>
      </div>
    </main>
  );
}
