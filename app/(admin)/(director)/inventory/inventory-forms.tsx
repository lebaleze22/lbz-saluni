"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import {
  Field,
  FIELD_CLASS,
  FormFeedback,
  INITIAL_MUTATION_STATE,
  SubmitButton,
} from "@/components/admin/form-controls";
import {
  createProductAction,
  updateProductAction,
  moveStockAction,
  changeProductStatusAction,
  saveServiceProductAction,
  removeServiceProductAction,
} from "./actions";

type ProductFields = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  costPrice: number;
  salePrice: number;
  lowStockThreshold: string;
};

export function ProductForm({ product }: { product?: ProductFields }) {
  const [state, action] = useFormState(
    product ? updateProductAction : createProductAction,
    INITIAL_MUTATION_STATE,
  );
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success && !product) form.current?.reset();
  }, [state.success, state.submissionId, product]);
  return (
    <form ref={form} action={action} className="space-y-4">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom du produit">
          <input
            className={FIELD_CLASS}
            name="name"
            required
            maxLength={120}
            defaultValue={product?.name}
          />
        </Field>
        <Field label="Référence (optionnelle)">
          <input
            className={FIELD_CLASS}
            name="sku"
            maxLength={60}
            defaultValue={product?.sku ?? ""}
            placeholder="Ex. SHAMP-001"
          />
        </Field>
        <Field label="Unité de stock">
          <select className={FIELD_CLASS} name="unit" defaultValue={product?.unit ?? "unité"}>
            <option value="unité">Unité</option>
            <option value="ml">Millilitre (ml)</option>
            <option value="g">Gramme (g)</option>
          </select>
        </Field>
        <Field label="Seuil d’alerte">
          <input
            className={FIELD_CLASS}
            name="lowStockThreshold"
            type="number"
            min="0"
            max="999999999.999"
            step="0.001"
            required
            defaultValue={product?.lowStockThreshold ?? "0"}
          />
        </Field>
        <Field label="Coût par unité de stock (FCFA)">
          <input
            className={FIELD_CLASS}
            name="costPrice"
            type="number"
            min={0}
            max={2147483647}
            step={1}
            required
            defaultValue={product?.costPrice ?? 0}
          />
        </Field>
        <Field label="Prix de vente par unité (FCFA)">
          <input
            className={FIELD_CLASS}
            name="salePrice"
            type="number"
            min={0}
            max={2147483647}
            step={1}
            required
            defaultValue={product?.salePrice ?? 0}
          />
        </Field>
        {!product && (
          <Field label="Stock initial">
            <input
              className={FIELD_CLASS}
              name="initialStock"
              type="number"
              min="0"
              max="999999999.999"
              step="0.001"
              required
              defaultValue="0"
            />
          </Field>
        )}
      </div>
      <p className="text-xs text-stone-500">
        Utilisez la même unité pour le stock, le seuil et les consommations. Exemple : un flacon de
        500 ml entre comme 500 ml en stock.
      </p>
      <FormFeedback state={state} />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton>{product ? "Enregistrer le produit" : "Créer le produit"}</SubmitButton>
        {state.success && state.recordId && !product && (
          <Link
            className="text-sm font-bold text-emerald-800 underline"
            href={`/inventory/${state.recordId}`}
          >
            Ouvrir le produit
          </Link>
        )}
      </div>
    </form>
  );
}

export function StockMovementForm({ productId, unit }: { productId: string; unit: string }) {
  const [type, setType] = useState("restock");
  const [state, action] = useFormState(moveStockAction, INITIAL_MUTATION_STATE);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) form.current?.reset();
  }, [state.success, state.submissionId]);
  return (
    <form ref={form} action={action} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      <Field label="Mouvement">
        <select
          className={FIELD_CLASS}
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="restock">Réapprovisionnement</option>
          <option value="sale">Sortie exceptionnelle (sans encaissement)</option>
          <option value="adjustment">Comptage physique / correction</option>
        </select>
      </Field>
      <Field
        label={`${type === "adjustment" ? "Stock total réellement compté" : "Quantité du mouvement"} (${unit})`}
      >
        <input
          className={FIELD_CLASS}
          name="quantity"
          type="number"
          min={type === "adjustment" ? "0" : "0.001"}
          max="999999999.999"
          step="0.001"
          required
        />
      </Field>
      <Field label="Motif">
        <textarea
          className={FIELD_CLASS}
          name="reason"
          rows={2}
          required
          minLength={3}
          maxLength={500}
          placeholder="Ex. Livraison fournisseur, vente comptoir, écart de comptage…"
        />
      </Field>
      {type === "adjustment" && (
        <p className="text-xs text-stone-500">
          Saisissez le stock total constaté. L’écart sera calculé et conservé dans l’historique.
        </p>
      )}
      {type === "sale" && (
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          Cette opération retire du stock sans recette. Pour une vente payée, utilisez plutôt{" "}
          <a href="/sales" className="font-bold underline">
            Ventes de produits
          </a>
          , qui crée un reçu et ajoute l’encaissement aux rapports.
        </div>
      )}
      <FormFeedback state={state} />
      <SubmitButton>Enregistrer le mouvement</SubmitButton>
    </form>
  );
}

export function ProductStatusForm({ id, archived }: { id: string; archived: boolean }) {
  const [state, action] = useFormState(changeProductStatusAction, INITIAL_MUTATION_STATE);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="operation" value={archived ? "restore" : "archive"} />
      <SubmitButton secondary>
        {archived ? "Restaurer le produit" : "Archiver le produit"}
      </SubmitButton>
      <FormFeedback state={state} />
    </form>
  );
}

export function RecipeForm({
  serviceId,
  products,
  recipe,
}: {
  serviceId: string;
  products: { id: string; name: string; unit: string }[];
  recipe?: { productId: string; quantity: string };
}) {
  const [state, action] = useFormState(saveServiceProductAction, INITIAL_MUTATION_STATE);
  const [selected, setSelected] = useState(recipe?.productId ?? products[0]?.id ?? "");
  const unit = products.find((product) => product.id === selected)?.unit ?? "";
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="serviceId" value={serviceId} />
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
        <Field label="Produit">
          <select
            className={FIELD_CLASS}
            name="productId"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            required
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.unit})
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Quantité (${unit})`}>
          <input
            className={FIELD_CLASS}
            name="quantity"
            type="number"
            min="0.001"
            max="999999999.999"
            step="0.001"
            required
            defaultValue={recipe?.quantity ?? ""}
          />
        </Field>
        <SubmitButton>{recipe ? "Modifier" : "Associer"}</SubmitButton>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}

export function RemoveRecipeForm({
  serviceId,
  productId,
}: {
  serviceId: string;
  productId: string;
}) {
  const [state, action] = useFormState(removeServiceProductAction, INITIAL_MUTATION_STATE);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="productId" value={productId} />
      <SubmitButton secondary>Retirer l’association</SubmitButton>
      <FormFeedback state={state} />
    </form>
  );
}
