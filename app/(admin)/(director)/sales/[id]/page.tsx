import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getRetailReceipt } from "@/lib/db/retail";
import { formatFcfa, formatDateFr, formatTimeFr, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { PrintReceiptButton } from "../sale-form";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: { id: string } }) {
  if (!z.uuid().safeParse(params.id).success) notFound();
  const data = await getRetailReceipt(params.id);
  if (!data) notFound();
  const { sale, salon } = data;
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-6">
      <div className="flex justify-between print:hidden">
        <Link href="/sales" className="font-bold text-emerald-900">
          ← Ventes
        </Link>
        <PrintReceiptButton />
      </div>
      <article className="space-y-5 rounded-2xl border border-stone-200 bg-white p-8 print:border-0 print:p-0">
        <header>
          <p className="text-sm uppercase">{salon}</p>
          <h1 className="text-2xl font-black">Reçu de vente produit</h1>
          <p className="break-all text-xs text-stone-500">Référence : {sale.id}</p>
          <p>
            {formatDateFr(sale.soldAt)} · {formatTimeFr(sale.soldAt)}
          </p>
        </header>
        <p>Client : {sale.client?.name || "Sans fiche client"}</p>
        <div className="border-y border-stone-200 py-5">
          <p className="font-bold">{sale.productName}</p>
          <p>
            {sale.quantity.toString()} {sale.unit} × {formatFcfa(sale.unitPrice)}
          </p>
        </div>
        <p className="text-2xl font-black">Payé : {formatFcfa(sale.total)}</p>
        <p>{PAYMENT_METHOD_LABELS[sale.method]}</p>
        <p className="text-xs text-stone-500">Enregistré par {sale.recordedBy.fullName}</p>
      </article>
    </main>
  );
}
