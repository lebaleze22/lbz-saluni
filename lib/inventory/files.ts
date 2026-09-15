import * as XLSX from "xlsx";
import { inventoryImportRowSchema, type InventoryImportRow } from "../validation/inventory-import";

export const INVENTORY_FILE_LIMIT = 2 * 1024 * 1024;
export const INVENTORY_ROW_LIMIT = 1000;
export const INVENTORY_COLUMNS = [
  "ID produit",
  "SKU",
  "Nom",
  "Unité",
  "Prix coût FCFA",
  "Prix vente FCFA",
  "Seuil stock bas",
  "Stock physique",
  "Statut",
];

const fields = [
  "id",
  "sku",
  "name",
  "unit",
  "costPrice",
  "salePrice",
  "lowStockThreshold",
  "stockQuantity",
  "status",
] as const;
const requiredFields = fields.slice(2);
const aliases: Record<string, (typeof fields)[number]> = {
  idproduit: "id",
  productid: "id",
  id: "id",
  sku: "sku",
  reference: "sku",
  nom: "name",
  name: "name",
  unite: "unit",
  unit: "unit",
  prixcoutfcfa: "costPrice",
  costprice: "costPrice",
  prixventefcfa: "salePrice",
  saleprice: "salePrice",
  seuilstockbas: "lowStockThreshold",
  lowstockthreshold: "lowStockThreshold",
  stockphysique: "stockQuantity",
  stock: "stockQuantity",
  stockquantity: "stockQuantity",
  statut: "status",
  status: "status",
};

export class InventoryFileError extends Error {}

const headerKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizeUnit = (value: string) => {
  const key = headerKey(value);
  if (["unite", "unit", "piece", "pieces"].includes(key)) return "unité";
  if (["ml", "millilitre", "millilitres"].includes(key)) return "ml";
  if (["g", "gramme", "grammes"].includes(key)) return "g";
  return value.toLowerCase();
};

const normalizeStatus = (value: string) => {
  const key = headerKey(value);
  if (["active", "actif", "actifs"].includes(key)) return "active";
  if (["archived", "archive", "archives"].includes(key)) return "archived";
  return value.toLowerCase();
};

export function parseInventoryFile(bytes: Uint8Array, filename: string) {
  if (!/\.(csv|xlsx|xls)$/i.test(filename))
    throw new InventoryFileError("Utilisez un fichier CSV, XLSX ou XLS.");
  if (!bytes.length || bytes.length > INVENTORY_FILE_LIMIT)
    throw new InventoryFileError("Le fichier doit contenir des données et ne pas dépasser 2 Mo.");
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
      sheetRows: INVENTORY_ROW_LIMIT + 2,
      cellFormula: true,
    });
  } catch {
    throw new InventoryFileError(
      "Le fichier est illisible ou protégé. Enregistrez-le en CSV ou Excel standard.",
    );
  }
  if (workbook.SheetNames.length !== 1)
    throw new InventoryFileError("Le fichier doit contenir une seule feuille de stock.");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (sheet["!ref"] && XLSX.utils.decode_range(sheet["!ref"]).e.c > 29)
    throw new InventoryFileError("Le fichier contient trop de colonnes. Utilisez le modèle.");
  for (const [key, cell] of Object.entries(sheet)) {
    if (!key.startsWith("!") && cell.f)
      throw new InventoryFileError("Remplacez les formules par leurs valeurs avant l’import.");
  }
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: true,
  });
  if (
    rows.length > INVENTORY_ROW_LIMIT + 1 ||
    (sheet["!fullref"] && XLSX.utils.decode_range(sheet["!fullref"]).e.r > INVENTORY_ROW_LIMIT)
  )
    throw new InventoryFileError("Limitez chaque import à 1 000 produits.");

  const originalHeaders = rows.shift() ?? [];
  const headers = originalHeaders.map((value) => aliases[headerKey(String(value))]);
  if (originalHeaders.some((value, index) => String(value).trim() && !headers[index]))
    throw new InventoryFileError(
      "Une colonne est inconnue. Utilisez les en-têtes du modèle téléchargeable.",
    );
  const recognized = headers.filter(Boolean);
  if (new Set(recognized).size !== recognized.length)
    throw new InventoryFileError("Une colonne de stock est présente plusieurs fois.");
  const missing = requiredFields.filter((field) => !headers.includes(field));
  if (missing.length)
    throw new InventoryFileError(
      "Toutes les colonnes du modèle, sauf ID produit et SKU, sont obligatoires.",
    );

  const products: InventoryImportRow[] = [];
  const errors: string[] = [];
  const fingerprints = new Set<string>();
  rows.forEach((row, index) => {
    if (row.every((value) => !String(value).trim())) return;
    const data: Record<string, string> = {};
    headers.forEach((key, column) => {
      if (key)
        data[key] = String(row[column] ?? "")
          .trim()
          .replace(/^'(?=[=+@\-])/, "");
    });
    if (data.unit) data.unit = normalizeUnit(data.unit);
    if (data.status) data.status = normalizeStatus(data.status);
    const parsed = inventoryImportRowSchema.safeParse(data);
    if (!parsed.success) {
      errors.push(
        `Ligne ${index + 2} : ${parsed.error.issues.map((issue) => `${issue.path.join(".")} — ${issue.message}`).join(" ; ")}`,
      );
      return;
    }
    const fingerprint = JSON.stringify(parsed.data);
    if (fingerprints.has(fingerprint)) {
      errors.push(`Ligne ${index + 2} : cette ligne est dupliquée dans le fichier.`);
      return;
    }
    fingerprints.add(fingerprint);
    products.push(parsed.data);
  });
  if (!products.length && !errors.length)
    throw new InventoryFileError("Le fichier ne contient aucun produit.");
  return { products, errors };
}

export function exportInventoryTemplate(format: "csv" | "xlsx") {
  const values = [INVENTORY_COLUMNS];
  if (format === "csv") {
    const csv = values.map((row) => row.map((value) => `"${value}"`).join(";")).join("\r\n");
    return new TextEncoder().encode(`\uFEFF${csv}`);
  }
  const sheet = XLSX.utils.aoa_to_sheet(values);
  sheet["!cols"] = [38, 18, 30, 14, 18, 18, 18, 18, 16].map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: sheet["!ref"] ?? "A1:I1" };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Stock");
  return new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}
