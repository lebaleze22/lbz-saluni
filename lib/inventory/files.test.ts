import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  exportInventoryTemplate,
  INVENTORY_COLUMNS,
  InventoryFileError,
  parseInventoryFile,
} from "./files";

const csv = (rows: string[][]) =>
  new TextEncoder().encode(
    rows.map((row) => row.map((cell) => `"${cell}"`).join(";")).join("\r\n"),
  );

const validRow = ["", "SHAMP-01", "Shampooing", "ml", "15", "25", "100", "750.5", "actif"];

describe("inventory import files", () => {
  it("parses French CSV headers, units, status, money and fractional stock", () => {
    const parsed = parseInventoryFile(csv([INVENTORY_COLUMNS, validRow]), "stock.csv");
    expect(parsed.errors).toEqual([]);
    expect(parsed.products).toEqual([
      {
        id: undefined,
        sku: "SHAMP-01",
        name: "Shampooing",
        unit: "ml",
        costPrice: 15,
        salePrice: 25,
        lowStockThreshold: "100.000",
        stockQuantity: "750.500",
        status: "active",
      },
    ]);
  });

  it("accepts Excel and rejects formulas", () => {
    const sheet = XLSX.utils.aoa_to_sheet([INVENTORY_COLUMNS, validRow]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Stock");
    const bytes = new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    expect(parseInventoryFile(bytes, "stock.xlsx").products[0].name).toBe("Shampooing");

    sheet.E2 = { t: "n", f: "10+5", v: 15 };
    const formulaBytes = new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    expect(() => parseInventoryFile(formulaBytes, "stock.xlsx")).toThrow("formules");
  });

  it("reports invalid and duplicate rows without accepting them", () => {
    const parsed = parseInventoryFile(
      csv([
        INVENTORY_COLUMNS,
        validRow,
        validRow,
        ["", "BAD", "", "litre", "-1", "x", "0", "-2", "maybe"],
      ]),
      "stock.csv",
    );
    expect(parsed.products).toHaveLength(1);
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors[0]).toContain("dupliquée");
    expect(parsed.errors[1]).toContain("Ligne 4");
  });

  it("requires the complete model and a supported file", () => {
    expect(() => parseInventoryFile(csv([["Nom"], ["Produit"]]), "stock.csv")).toThrow(
      "colonnes du modèle",
    );
    expect(() => parseInventoryFile(new Uint8Array([1]), "stock.txt")).toThrow(InventoryFileError);
  });

  it("generates valid CSV and Excel templates", () => {
    const csvTemplate = new TextDecoder().decode(exportInventoryTemplate("csv"));
    expect(csvTemplate).toContain("Stock physique");
    const workbook = XLSX.read(exportInventoryTemplate("xlsx"), { type: "array" });
    expect(workbook.SheetNames).toEqual(["Stock"]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Stock, { header: 1 })[0]).toEqual(
      INVENTORY_COLUMNS,
    );
  });
});
