"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
type Result = {
  added: number;
  skipped: number;
  total: number;
  preview: boolean;
  samples?: { name: string; phone?: string; email?: string; sex?: string }[];
};
export function ClientTransferPanel() {
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
      const response = await fetch("/clients/import", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) {
        setErrors([data.message, ...(data.errors ?? [])]);
        setResult(null);
      } else {
        setResult(data);
        if (commit) router.refresh();
      }
    } catch {
      setErrors([
        "La requête a échoué. Réessayez la prévisualisation pour vérifier les données avant de relancer l’import.",
      ]);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer font-bold text-emerald-900">
        Importer / exporter des clients
      </summary>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="font-bold">Importer un fichier</h2>
          <p className="text-sm text-stone-600">
            Le modèle inclut ville, quartier, adresse, source et recommandation. Sources : unknown,
            recommendation, search, social_media, walk_by, advertisement, other (ou leurs libellés
            français). Pour une recommandation, indiquez l’identifiant d’un client déjà présent dans
            ce salon, ou le nom de la personne. Les liens vers un client ne sont pas résolus à
            partir du seul nom.
          </p>
          <p className="text-sm text-stone-600">
            CSV, XLSX ou XLS · 2 Mo maximum · 1 000 lignes · une seule feuille. Nom obligatoire. Les
            doublons exacts sont ignorés, y compris les fiches archivées. Les fiches existantes ne
            sont pas modifiées.
          </p>
          <p className="text-sm">
            <a
              className="font-bold text-emerald-800 underline"
              href="/clients/export?template=1&format=xlsx"
            >
              Modèle Excel
            </a>{" "}
            ·{" "}
            <a
              className="font-bold text-emerald-800 underline"
              href="/clients/export?template=1&format=csv"
            >
              Modèle CSV
            </a>
          </p>
          <input
            ref={file}
            aria-label="Liste de clients à importer"
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
            disabled={busy}
            onClick={() => upload(false)}
            className="rounded-xl border border-emerald-900 px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            {busy ? "Traitement…" : "Vérifier le fichier"}
          </button>
          {result && (
            <div aria-live="polite" className="space-y-3 rounded-xl bg-emerald-50 p-4 text-sm">
              <p>
                {result.total} lignes · {result.added} {result.preview ? "à ajouter" : "ajoutées"} ·{" "}
                {result.skipped} doublons ignorés.
              </p>
              {result.preview && (
                <>
                  <p className="font-bold">Aperçu des 10 premières lignes</p>
                  <ul>
                    {result.samples?.map((row, index) => (
                      <li key={index}>
                        {row.name} · {row.phone || "Sans téléphone"} · {row.email || "Sans e-mail"}{" "}
                        · {row.sex || "Sexe non renseigné"}
                      </li>
                    ))}
                  </ul>
                  <button
                    disabled={busy || !result.added}
                    onClick={() => upload(true)}
                    className="rounded-xl bg-emerald-950 px-4 py-2 font-bold text-white disabled:opacity-50"
                  >
                    Confirmer l’import
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
        </section>
        <section className="space-y-3">
          <h2 className="font-bold">Exporter les fiches</h2>
          <p className="text-sm text-stone-600">
            Toutes les fiches de la sélection ci-dessous, avec coordonnées, préférences, allergies
            et notes internes. Les filtres de recherche de la page ne s’appliquent pas. L’historique
            des visites reste dans le dossier client.
          </p>
          <form action="/clients/export" method="get" className="flex flex-wrap gap-3">
            <select name="status" aria-label="Fiches à exporter" className="rounded-xl border p-2">
              <option value="active">Fiches actives</option>
              <option value="archived">Fiches archivées</option>
              <option value="all">Toutes les fiches</option>
            </select>
            <select name="format" aria-label="Format d’export" className="rounded-xl border p-2">
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV (.csv)</option>
            </select>
            <button className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-bold text-white">
              Télécharger
            </button>
          </form>
        </section>
      </div>
    </details>
  );
}
