"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import Link from "next/link";
import { sellProduct } from "./actions";
import { retailTotal } from "@/lib/retail/total";
import { dateTimeInDouala, doualaInputToIso } from "@/lib/dates";
import { formatFcfa, PAYMENT_METHOD_LABELS } from "@/lib/format";
import {
  Field,
  FIELD_CLASS,
  INITIAL_MUTATION_STATE,
  FormFeedback,
  SubmitButton,
} from "@/components/admin/form-controls";

type Product = {
  id: string;
  name: string;
  unit: string;
  salePrice: number;
  stockQuantity: string;
};

export function SaleForm({
  products,
  clients,
  initialClientId,
}: {
  products: Product[];
  clients: { id: string; name: string; phone: string | null; email: string | null }[];
  initialClientId?: string;
}) {
  const [state, action] = useFormState(sellProduct, INITIAL_MUTATION_STATE);
  const [id, setId] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [date, setDate] = useState(() => dateTimeInDouala());
  useEffect(() => setId(crypto.randomUUID()), []);

  const product = products.find((row) => row.id === productId);
  let total = 0;
  try {
    if (product) total = retailTotal(quantity, product.salePrice);
  } catch {
    // The server returns the detailed validation message on submission.
  }

  if (state.success) {
    return (
      <div className="space-y-4">
        <FormFeedback state={state} />
        <Link
          href={`/sales/${state.recordId}`}
          className="block font-bold text-emerald-900 underline"
        >
          Ouvrir ou imprimer le reçu
        </Link>
        <a
          href="/sales"
          className="inline-block rounded-xl bg-emerald-950 px-4 py-3 font-bold text-white"
        >
          Nouvelle vente
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedUnitPrice" value={product?.salePrice ?? 0} />
      <input type="hidden" name="soldAt" value={doualaInputToIso(date)} />
      <Field label="Produit">
        <select
          name="productId"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          className={FIELD_CLASS}
          required
        >
          {products.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} · {formatFcfa(row.salePrice)} / {row.unit} · stock {row.stockQuantity}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-stone-500">
        Le prix vient de la fiche produit. Une vente correspond à un produit et peut utiliser une
        quantité fractionnaire de trois décimales maximum.
      </p>
      <Field label={`Quantité (${product?.unit ?? "unité"})`}>
        <input
          name="quantity"
          required
          inputMode="decimal"
          className={FIELD_CLASS}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </Field>
      <Field label="Client (optionnel)">
        <select name="clientId" defaultValue={initialClientId ?? ""} className={FIELD_CLASS}>
          <option value="">Vente sans fiche client</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name} · {client.phone || client.email || "Sans coordonnées"}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-stone-500">
        Les 100 fiches récemment modifiées sont proposées ici. Ouvrez un dossier client pour une
        sélection directe si la personne n’apparaît pas.
      </p>
      <Field label="Paiement reçu">
        <select name="method" className={FIELD_CLASS}>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([method, label]) => (
            <option key={method} value={method}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date et heure (Douala)">
        <input
          type="datetime-local"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className={FIELD_CLASS}
        />
      </Field>
      <p className="text-xl font-black">
        Total à encaisser : {total ? formatFcfa(total) : "Vérifiez la quantité et le prix"}
      </p>
      <p className="text-xs text-stone-500">
        Le total est arrondi au FCFA le plus proche. Confirmez après réception du paiement. Le stock
        sera déduit et la recette apparaîtra dans les rapports.
      </p>
      <FormFeedback state={state} />
      {id && <SubmitButton>Confirmer la vente payée</SubmitButton>}
    </form>
  );
}

export function PrintReceiptButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-xl bg-emerald-950 px-4 py-2 font-bold text-white print:hidden"
    >
      Imprimer le reçu
    </button>
  );
}
