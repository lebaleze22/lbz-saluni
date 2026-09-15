import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { exportClientFile, parseClientFile } from "./files";
const client = {
  name: "Grâce; N.",
  phone: "+237 699112233",
  email: "grace@example.com",
  sex: "femme",
  notes: 'Ligne 1\n"Ligne 2"',
  preferences: "Tresses",
  allergies: "Aucune signalée",
};
describe("client CSV and Excel files", () => {
  it("round-trips address, source and external referrer details in both formats", () => {
    const complete = {
      ...client,
      city: "Douala",
      neighbourhood: "Bonapriso",
      addressDetails: "Rue 12\nPrès du marché",
      discoverySource: "recommendation",
      discoveryDetails: "Conseil d’une amie",
      referrerName: "Alice",
    };
    for (const format of ["csv", "xlsx"] as const) {
      const parsed = parseClientFile(exportClientFile([complete], format), `clients.${format}`);
      expect(parsed.errors).toEqual([]);
      expect(parsed.clients[0]).toMatchObject(complete);
    }
    const parsed = parseClientFile(
      new TextEncoder().encode("Nom;Source;Ville\nAlice;Google / recherche;Douala"),
      "clients.csv",
    );
    expect(parsed.clients[0]).toMatchObject({ city: "Douala", discoverySource: "search" });
  });
  for (const format of ["csv", "xlsx"] as const)
    it(`round-trips ${format} with accents, phones and multiline notes`, () => {
      const result = parseClientFile(exportClientFile([client], format), `clients.${format}`);
      expect(result.errors).toEqual([]);
      expect(result.clients).toEqual([client]);
    });
  it("accepts comma CSV and reports physical row numbers for invalid data", () => {
    const parsed = parseClientFile(
      new TextEncoder().encode("name,email,sex\nAlice,alice@example.com,F\nBob,invalid,M"),
      "clients.csv",
    );
    expect(parsed.clients[0].sex).toBe("femme");
    expect(parsed.errors[0]).toContain("Ligne 3");
  });
  it("accepts UTF-8 French headers with or without a BOM", () => {
    const content =
      "Nom;Source;Détails source;Nom recommandant\nAlice;Recommandation;Cliente fidèle;Bob";
    for (const prefix of ["", "\uFEFF"]) {
      const parsed = parseClientFile(new TextEncoder().encode(prefix + content), "clients.csv");
      expect(parsed.errors).toEqual([]);
      expect(parsed.clients[0]).toMatchObject({
        name: "Alice",
        discoveryDetails: "Cliente fidèle",
        referrerName: "Bob",
      });
    }
  });
  it("rejects formulas, unknown columns and too many rows", () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["Nom"], ["Alice"]]);
    sheet.A2 = { t: "s", f: '"Alice"', v: "Alice" };
    XLSX.utils.book_append_sheet(book, sheet, "Clients");
    expect(() =>
      parseClientFile(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), "clients.xlsx"),
    ).toThrow("formules");
    expect(() =>
      parseClientFile(new TextEncoder().encode("Nom,telephonee\nAlice,123"), "clients.csv"),
    ).toThrow("inconnue");
    expect(() =>
      parseClientFile(new TextEncoder().encode("Nom\n" + "Alice\n".repeat(1001)), "clients.csv"),
    ).toThrow("1 000");
  });
  it("exports formula-like text safely", () => {
    const csv = new TextDecoder().decode(exportClientFile([{ name: '=HYPERLINK("bad")' }], "csv"));
    expect(csv).toContain("'=HYPERLINK");
    const book = XLSX.read(exportClientFile([{ name: "=1+1" }], "xlsx"), { type: "array" });
    expect(book.Sheets.Clients.A2).toMatchObject({ t: "s", v: "=1+1" });
    expect(book.Sheets.Clients.A2.f).toBeUndefined();
  });
});
