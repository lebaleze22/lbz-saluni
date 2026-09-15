import Link from "next/link";
import { Package, TriangleAlert } from "lucide-react";
import { getInventoryPageData, INVENTORY_PAGE_SIZE } from "@/lib/db/inventory";
import { inventoryFiltersSchema } from "@/lib/validation/inventory";
import { formatFcfa } from "@/lib/format";
import { formatQuantity } from "@/lib/inventory/quantities";
import { Pagination } from "@/components/admin/pagination";
import { ProductForm } from "./inventory-forms";
import { InventoryTransferPanel } from "./inventory-transfer-panel";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const parsed = inventoryFiltersSchema.safeParse(searchParams ?? {});
  const filters = parsed.success ? parsed.data : inventoryFiltersSchema.parse({});
  const { products, total, page, activeCount, lowCount } = await getInventoryPageData(filters);
  return (
    <main className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">
            Produits et consommations
          </p>
          <h1 className="mt-1 text-3xl font-black">Stock</h1>
          <p className="mt-2 text-sm text-stone-500">
            Suivez les quantités disponibles et chaque mouvement de produit.
          </p>
        </div>
        <Link
          href="/inventory/recipes"
          className="rounded-xl bg-emerald-950 px-4 py-3 text-sm font-bold text-white"
        >
          Consommations par prestation
        </Link>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="flex items-center gap-2 text-sm text-stone-500">
            <Package className="size-4" />
            Produits actifs
          </p>
          <p className="mt-2 text-3xl font-black">{activeCount}</p>
        </article>
        <Link
          href="/inventory?status=low"
          className={`rounded-2xl border p-5 ${lowCount ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"}`}
        >
          <p className="flex items-center gap-2 text-sm text-stone-600">
            <TriangleAlert className="size-4" />
            Stock au seuil ou en dessous
          </p>
          <p className="mt-2 text-3xl font-black">{lowCount}</p>
        </Link>
      </div>
      <details className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer font-bold text-emerald-900">Ajouter un produit</summary>
        <div className="mt-5 max-w-3xl">
          <ProductForm />
        </div>
      </details>
      <InventoryTransferPanel />
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4"
      >
        <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-semibold">
          Rechercher
          <input
            name="q"
            maxLength={120}
            defaultValue={filters.q}
            className="rounded-xl border border-stone-300 px-3 py-3"
            placeholder="Nom ou référence"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          État
          <select
            className="rounded-xl border border-stone-300 bg-white px-3 py-3"
            name="status"
            defaultValue={filters.status}
          >
            <option value="active">Produits actifs</option>
            <option value="low">Stock bas</option>
            <option value="archived">Archivés</option>
          </select>
        </label>
        <button className="rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white">
          Filtrer
        </button>
      </form>
      {products.length ? (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-100 text-xs uppercase text-stone-500">
              <tr>
                <th className="p-4">Produit</th>
                <th className="p-4">Stock</th>
                <th className="p-4">Seuil</th>
                <th className="p-4">Coût / unité</th>
                <th className="p-4">Prix / unité</th>
                <th className="p-4">État</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-stone-50">
                  <td className="p-4">
                    <Link
                      href={`/inventory/${product.id}`}
                      className="font-bold text-emerald-900 hover:underline"
                    >
                      {product.name}
                    </Link>
                    <p className="mt-1 text-xs text-stone-500">{product.sku || "Sans référence"}</p>
                  </td>
                  <td className="p-4 font-bold">
                    {formatQuantity(product.stockQuantity)} {product.unit}
                  </td>
                  <td className="p-4">
                    {formatQuantity(product.lowStockThreshold)} {product.unit}
                  </td>
                  <td className="p-4">{formatFcfa(product.costPrice)}</td>
                  <td className="p-4">{formatFcfa(product.salePrice)}</td>
                  <td className="p-4">
                    <span
                      className={`whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold ${product.isDeleted ? "bg-stone-100 text-stone-600" : Number(product.stockQuantity) <= Number(product.lowStockThreshold) ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}
                    >
                      {product.isDeleted
                        ? "Archivé"
                        : Number(product.stockQuantity) <= Number(product.lowStockThreshold)
                          ? "Stock bas"
                          : "Disponible"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <Package className="mx-auto size-8 text-stone-300" />
          <h2 className="mt-4 font-bold">Aucun produit pour cette sélection</h2>
          <p className="mt-2 text-sm text-stone-500">
            Ajoutez vos produits pour commencer le suivi du stock.
          </p>
        </div>
      )}
      <Pagination
        page={page}
        total={total}
        pageSize={INVENTORY_PAGE_SIZE}
        href={(next) => `/inventory?${new URLSearchParams({ ...filters, page: String(next) })}`}
      />
    </main>
  );
}
