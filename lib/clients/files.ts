import * as XLSX from "xlsx";
import { clientInputSchema, type ClientInput } from "../validation/clients";
import { DISCOVERY_LABELS } from "./discovery";

export const CLIENT_FILE_LIMIT = 2 * 1024 * 1024;
export const CLIENT_ROW_LIMIT = 1000;
export const CLIENT_COLUMNS = [
  "Nom",
  "Téléphone",
  "Email",
  "Sexe",
  "Préférences",
  "Allergies",
  "Notes",
  "Ville",
  "Quartier",
  "Adresse",
  "Source",
  "Détails source",
  "ID client recommandant",
  "Nom recommandant",
];
const fields = [
  "name",
  "phone",
  "email",
  "sex",
  "preferences",
  "allergies",
  "notes",
  "city",
  "neighbourhood",
  "addressDetails",
  "discoverySource",
  "discoveryDetails",
  "referredByClientId",
  "referrerName",
] as const;
const aliases: Record<string, string> = {
  nom: "name",
  name: "name",
  telephone: "phone",
  phone: "phone",
  email: "email",
  sexe: "sex",
  sex: "sex",
  preferences: "preferences",
  allergies: "allergies",
  notes: "notes",
  ville: "city",
  city: "city",
  quartier: "neighbourhood",
  neighbourhood: "neighbourhood",
  neighborhood: "neighbourhood",
  adresse: "addressDetails",
  address: "addressDetails",
  addressdetails: "addressDetails",
  source: "discoverySource",
  discoverysource: "discoverySource",
  detailssource: "discoveryDetails",
  discoverydetails: "discoveryDetails",
  idclientrecommandant: "referredByClientId",
  referredbyclientid: "referredByClientId",
  nomrecommandant: "referrerName",
  referrername: "referrerName",
};
export class ClientFileError extends Error {}
const headerKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

export function parseClientFile(bytes: Uint8Array, filename: string) {
  if (!/\.(csv|xlsx|xls)$/i.test(filename))
    throw new ClientFileError("Utilisez un fichier CSV, XLSX ou XLS.");
  if (!bytes.length || bytes.length > CLIENT_FILE_LIMIT)
    throw new ClientFileError("Le fichier doit contenir des données et ne pas dépasser 2 Mo.");
  let workbook: XLSX.WorkBook;
  try {
    const csv = /\.csv$/i.test(filename);
    let source: Uint8Array | string = bytes;
    if (csv) {
      try {
        source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
      } catch {
        source = new TextDecoder("windows-1252").decode(bytes);
      }
    }
    workbook = XLSX.read(source, {
      type: csv ? "string" : "array",
      raw: true,
      sheetRows: CLIENT_ROW_LIMIT + 2,
      cellFormula: true,
    });
  } catch {
    throw new ClientFileError(
      "Le fichier est illisible ou protégé. Enregistrez-le en CSV ou Excel standard.",
    );
  }
  if (workbook.SheetNames.length !== 1)
    throw new ClientFileError("Le fichier doit contenir une seule feuille de clients.");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (sheet["!ref"] && XLSX.utils.decode_range(sheet["!ref"]).e.c > 49)
    throw new ClientFileError("Le fichier contient trop de colonnes. Utilisez le modèle.");
  for (const [key, cell] of Object.entries(sheet)) {
    if (!key.startsWith("!") && cell.f)
      throw new ClientFileError("Remplacez les formules par leurs valeurs avant l’import.");
  }
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: true,
  });
  if (
    rows.length > CLIENT_ROW_LIMIT + 1 ||
    (sheet["!fullref"] && XLSX.utils.decode_range(sheet["!fullref"]).e.r > CLIENT_ROW_LIMIT)
  )
    throw new ClientFileError("Limitez chaque import à 1 000 clients.");
  const originalHeaders = rows.shift() ?? [];
  const headers = originalHeaders.map((value) => aliases[headerKey(String(value))]);
  if (originalHeaders.some((value, index) => String(value).trim() && !headers[index]))
    throw new ClientFileError(
      "Une colonne est inconnue. Utilisez les en-têtes du modèle téléchargeable.",
    );
  if (!headers.includes("name"))
    throw new ClientFileError("La colonne Nom est obligatoire. Utilisez le modèle proposé.");
  const recognized = headers.filter(Boolean);
  if (new Set(recognized).size !== recognized.length)
    throw new ClientFileError("Une colonne client est présente plusieurs fois.");
  const clients: ClientInput[] = [];
  const errors: string[] = [];
  rows.forEach((row, index) => {
    if (row.every((value) => !String(value).trim())) return;
    const data: Record<string, string> = {};
    headers.forEach((key, column) => {
      if (key)
        data[key] = String(row[column] ?? "")
          .trim()
          .replace(/^'(?=[=+@\-])/, "");
    });
    if (data.sex)
      data.sex =
        ({ f: "femme", female: "femme", m: "homme", male: "homme" } as Record<string, string>)[
          data.sex.toLowerCase()
        ] ?? data.sex.toLowerCase();
    if (data.discoverySource) {
      const source = Object.entries(DISCOVERY_LABELS).find(
        ([key, label]) =>
          headerKey(data.discoverySource) === headerKey(key) ||
          headerKey(data.discoverySource) === headerKey(label),
      );
      if (source) data.discoverySource = source[0];
    }
    const parsed = clientInputSchema.safeParse(data);
    if (!parsed.success)
      errors.push(
        `Ligne ${index + 2} : ${parsed.error.issues.map((issue) => `${issue.path.join(".")} — ${issue.message}`).join(" ; ")}`,
      );
    else clients.push(parsed.data);
  });
  if (!clients.length && !errors.length)
    throw new ClientFileError("Le fichier ne contient aucun client.");
  return { clients, errors };
}

export function exportClientFile(
  clients: Array<Partial<Record<(typeof fields)[number], string | null>>>,
  format: "csv" | "xlsx",
) {
  const values = [
    CLIENT_COLUMNS,
    ...clients.map((client) => fields.map((key) => client[key] ?? "")),
  ];
  if (format === "csv") {
    // Neutralize spreadsheet formulas in CSV. XLSX cells below are explicit strings.
    const csv = values
      .map((row) =>
        row
          .map((value) => {
            const safe = /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
            return `"${safe.replace(/"/g, '""')}"`;
          })
          .join(";"),
      )
      .join("\r\n");
    return new TextEncoder().encode(`\uFEFF${csv}`);
  }
  const sheet = XLSX.utils.aoa_to_sheet(values);
  sheet["!cols"] = [28, 22, 32, 12, 45, 40, 50, 22, 24, 40, 24, 40, 40, 28].map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: sheet["!ref"] ?? "A1:G1" };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Clients");
  return new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}
