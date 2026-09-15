import Link from "next/link";
import { z } from "zod";
import { getServiceProductsData } from "@/lib/db/inventory";
import { formatQuantity } from "@/lib/inventory/quantities";
import { RecipeForm, RemoveRecipeForm } from "../inventory-forms";

export const dynamic = "force-dynamic";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams?: { serviceId?: string };
}) {
  const parsed = z.uuid().safeParse(searchParams?.serviceId);
  const { services, products, selected, recipes } = await getServiceProductsData(
    parsed.success ? parsed.data : undefined,
  );
  return (
    <main className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/inventory" className="text-sm font-bold text-emerald-800 hover:underline">
        ← Retour au stock
      </Link>
      <header>
        <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Configuration</p>
        <h1 className="mt-1 text-3xl font-black">Consommations par prestation</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
          Définissez la quantité de chaque produit utilisée pour une prestation. Le stock sera
          déduit à l’enregistrement des prochaines visites. Les visites déjà enregistrées sont
          conservées telles quelles.
        </p>
      </header>
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-5"
      >
        <label className="flex min-w-48 flex-1 flex-col gap-2 text-sm font-semibold">
          Prestation
          <select
            name="serviceId"
            defaultValue={selected?.id}
            className="rounded-xl border border-stone-300 bg-white px-3 py-3"
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
                {service.isDeleted ? " (archivée)" : !service.active ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!services.length}
          className="rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          Afficher
        </button>
      </form>
      {selected ? (
        <section className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-xl font-black">{selected.name}</h2>
          {!selected.isDeleted && selected.active && products.length > 0 && (
            <div className="rounded-xl bg-emerald-50 p-4">
              <h3 className="mb-3 font-bold text-emerald-950">Associer un produit</h3>
              <RecipeForm key={selected.id} serviceId={selected.id} products={products} />
            </div>
          )}
          {!products.length && (
            <p className="text-sm text-stone-500">
              Ajoutez d’abord un produit actif dans{" "}
              <Link className="underline" href="/inventory">
                le stock
              </Link>
              .
            </p>
          )}
          {recipes.length ? (
            recipes.map((recipe) => (
              <article key={recipe.id} className="space-y-4 rounded-xl border border-stone-200 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <Link
                    className="font-bold text-emerald-900 hover:underline"
                    href={`/inventory/${recipe.productId}`}
                  >
                    {recipe.product.name}
                  </Link>
                  <span className="text-sm font-semibold">
                    {formatQuantity(recipe.quantity)} {recipe.product.unit}
                  </span>
                </div>
                {!selected.isDeleted && selected.active && (
                  <details>
                    <summary className="cursor-pointer text-sm font-bold text-emerald-800">
                      Modifier la quantité
                    </summary>
                    <div className="mt-3">
                      <RecipeForm
                        serviceId={selected.id}
                        products={products.filter((product) => product.id === recipe.productId)}
                        recipe={recipe}
                      />
                    </div>
                  </details>
                )}
                <RemoveRecipeForm serviceId={selected.id} productId={recipe.productId} />
              </article>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-stone-500">
              Aucun produit consommé configuré pour cette prestation.
            </p>
          )}
        </section>
      ) : (
        <p className="rounded-2xl bg-white p-8 text-center text-stone-500">
          Créez une prestation pour configurer ses consommations.
        </p>
      )}
    </main>
  );
}
