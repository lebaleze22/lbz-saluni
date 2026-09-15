"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Result = {
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  total: number;
  preview: boolean;
  samples?: Array<{
    name: string;
    sku?: string;
    stockQuantity: string;
    action: "create" | "update" | "unchanged";
  }>;
};

const ACTION_LABELS = {
  create: "à créer",
  update: "à mettre à jour",
  unchanged: "inchangé",
};

export function InventoryTransferPanel() {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function upload(commit: boolean) {
    const selected = file.current?.files?.[0];
    if (!selected) {
      setErrors(["Sélectionnez un fichier."]);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const body = new FormData();
      body.set("file", selected);
      body.set("mode", commit ? "import" : "preview");
      const response = await fetch("/inventory/import", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) {
        setErrors([data.message, ...(data.errors ?? [])]);
        setResult(null);
      } else {
        setResult(data);
        if (commit) router.refresh();
      }
    } catch {
      setErrors(["La requête a échoué. Relancez la vérification avant de confirmer l’import."]);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer font-bold text-emerald-900">
        Importer le stock depuis CSV ou Excel
      </summary>
      <div className="mt-5 space-y-4">
        <p className="text-sm text-stone-600">
          CSV, XLSX ou XLS · 2 Mo maximum · 1 000 lignes · une seule feuille. Téléchargez le modèle
          et conservez tous ses en-têtes. Les montants sont en FCFA et les quantités peuvent
          contenir trois décimales.
        </p>
        <p className="text-sm text-stone-600">
          L’ID produit est prioritaire, puis le SKU. Sans correspondance, une nouvelle fiche est
          créée et son SKU est obligatoire. Le statut accepte active/actif ou archived/archivé. Le
          stock physique est la quantité totale constatée : tout écart produit un mouvement de
          comptage dans l’historique.
        </p>
        <p className="text-sm">
          <a
            className="font-bold text-emerald-800 underline"
            href="/inventory/template?format=xlsx"
          >
            Modèle Excel
          </a>{" "}
          ·{" "}
          <a className="font-bold text-emerald-800 underline" href="/inventory/template?format=csv">
            Modèle CSV
          </a>
        </p>
        <input
          ref={file}
          aria-label="Fichier de stock à importer"
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={busy}
          onChange={() => {
            setResult(null);
            setErrors([]);
          }}
          className="block w-full text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => upload(false)}
          className="rounded-xl border border-emerald-900 px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {busy ? "Traitement…" : "Vérifier le fichier"}
        </button>
        {result && (
          <div aria-live="polite" className="space-y-3 rounded-xl bg-emerald-50 p-4 text-sm">
            <p>
              {result.total} lignes · {result.created} {result.preview ? "à créer" : "créées"} ·{" "}
              {result.updated} {result.preview ? "à mettre à jour" : "mises à jour"} ·{" "}
              {result.unchanged} inchangées · {result.rejected} rejetées.
            </p>
            {result.preview && (
              <>
                <p className="font-bold">Aperçu des 10 premières lignes</p>
                <ul>
                  {result.samples?.map((row, index) => (
                    <li key={index}>
                      {row.name} · {row.sku || "Sans SKU"} · stock {row.stockQuantity} ·{" "}
                      {ACTION_LABELS[row.action]}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={busy || (!result.created && !result.updated)}
                  onClick={() => upload(true)}
                  className="rounded-xl bg-emerald-950 px-4 py-2 font-bold text-white disabled:opacity-50"
                >
                  Confirmer l’import atomique
                </button>
              </>
            )}
          </div>
        )}
        {!!errors.length && (
          <ul
            role="alert"
            className="max-h-64 overflow-auto rounded-xl bg-red-50 p-4 text-sm text-red-800"
          >
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
