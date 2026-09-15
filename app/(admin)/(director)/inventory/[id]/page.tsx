import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getProductDetail, MOVEMENT_PAGE_SIZE } from "@/lib/db/inventory";
import { formatDateFr, formatTimeFr } from "@/lib/format";
import { formatQuantity } from "@/lib/inventory/quantities";
import { Pagination } from "@/components/admin/pagination";
import { ProductForm, ProductStatusForm, StockMovementForm } from "../inventory-forms";

export const dynamic = "force-dynamic";
const movementLabels = {
  restock: "Réapprovisionnement",
  sale: "Sortie exceptionnelle / vente",
  adjustment: "Comptage / correction",
  consumption: "Prestation",
};

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { page?: string };
}) {
  if (!z.uuid().safeParse(params.id).success) notFound();
  const requested = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .catch(1)
    .parse(searchParams?.page ?? 1);
  const data = await getProductDetail(params.id, requested);
  if (!data) notFound();
  const { product, movements, recipes, total, page } = data;
  const low = Number(product.stockQuantity) <= Number(product.lowStockThreshold);
  return (
    <main className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/inventory" className="text-sm font-bold text-emerald-800 hover:underline">
        ← Tous les produits
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">
            Fiche produit{product.isDeleted ? " · Archivée" : ""}
          </p>
          <h1 className="mt-1 text-3xl font-black">{product.name}</h1>
          <p className="mt-2 text-sm text-stone-500">{product.sku || "Sans référence"}</p>
        </div>
        <div
          className={`rounded-2xl border px-6 py-4 ${low && !product.isDeleted ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"}`}
        >
          <p className="text-xs font-bold uppercase text-stone-500">Stock disponible</p>
          <p className="mt-1 text-3xl font-black">
            {formatQuantity(product.stockQuantity)}{" "}
            <span className="text-base">{product.unit}</span>
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Seuil : {formatQuantity(product.lowStockThreshold)} {product.unit}
          </p>
        </div>
      </header>
      {!product.isDeleted && (
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="mb-5 text-lg font-black">Enregistrer un mouvement</h2>
            <StockMovementForm productId={product.id} unit={product.unit} />
          </section>
          <details className="rounded-2xl border border-stone-200 bg-white p-5">
            <summary className="cursor-pointer text-lg font-black">Informations du produit</summary>
            <div className="mt-5">
              <ProductForm product={product} />
            </div>
          </details>
        </div>
      )}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-black">Consommations par prestation</h2>
        {recipes.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {recipes.map((recipe) => (
              <li key={recipe.id} className="flex flex-wrap justify-between gap-2">
                <Link
                  className="font-semibold text-emerald-800 hover:underline"
                  href={`/inventory/recipes?serviceId=${recipe.service.id}`}
                >
                  {recipe.service.name}
                </Link>
                <span>
                  {formatQuantity(recipe.quantity)} {product.unit} / prestation
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-stone-500">
            Ce produit n’est encore associé à aucune prestation.
          </p>
        )}
        <Link
          href="/inventory/recipes"
          className="mt-4 inline-block text-sm font-bold text-emerald-800 underline"
        >
          Configurer les consommations
        </Link>
      </section>
      <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-black">Historique des mouvements</h2>
        <p className="mt-1 text-xs text-stone-500">
          Les mouvements sont conservés. Une correction se fait par un nouveau comptage motivé.
        </p>
        {movements.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-100 text-xs uppercase text-stone-500">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Mouvement / motif</th>
                  <th className="p-3">Quantité</th>
                  <th className="p-3">Stock après</th>
                  <th className="p-3">Enregistré par</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="p-3 text-xs">
                      {formatDateFr(movement.createdAt)}
                      <br />
                      {formatTimeFr(movement.createdAt)}
                    </td>
                    <td className="max-w-sm p-3">
                      <p className="font-semibold">{movementLabels[movement.type]}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-stone-500">
                        {movement.reason}
                      </p>
                      {movement.appointment && (
                        <Link
                          className="mt-1 block text-xs font-bold text-emerald-800 underline"
                          href={`/clients/${movement.appointment.clientId}`}
                        >
                          Historique du client
                        </Link>
                      )}
                    </td>
                    <td
                      className={`whitespace-nowrap p-3 font-bold ${Number(movement.quantity) < 0 ? "text-amber-800" : "text-emerald-800"}`}
                    >
                      {Number(movement.quantity) > 0 ? "+" : ""}
                      {formatQuantity(movement.quantity)} {movement.unit}
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {formatQuantity(movement.balanceAfter)} {movement.unit}
                    </td>
                    <td className="p-3">{movement.recordedBy.fullName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-stone-500">Aucun mouvement enregistré.</p>
        )}
        <Pagination
          page={page}
          total={total}
          pageSize={MOVEMENT_PAGE_SIZE}
          href={(next) => `/inventory/${product.id}?page=${next}`}
        />
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="mb-2 font-bold">Archivage</h2>
        <p className="mb-4 text-sm text-stone-500">
          Un produit doit avoir un stock nul et aucune consommation associée pour être archivé.
        </p>
        <ProductStatusForm id={product.id} archived={product.isDeleted} />
      </section>
    </main>
  );
}
