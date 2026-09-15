import { describe, expect, it } from "vitest";
import { registerEntrySchema } from "./register";

const validEntry = {
  clientName: "Nadia",
  phone: "",
  sex: "femme",
  staffId: "7cd9a8e4-b350-4a03-b1a7-904ba3ddb07e",
  source: "walk_in",
  startTime: "2026-08-28T10:00:00+01:00",
  services: [
    {
      serviceId: "91b3a8e4-b350-4a03-b1a7-904ba3ddb07e",
      price: 13_500,
    },
  ],
  paymentAmount: 13_500,
  paymentMethod: "cash",
};

describe("validation du registre", () => {
  it("accepte une identité client explicite et refuse un montant hors capacité PostgreSQL", () => {
    expect(
      registerEntrySchema.parse({ ...validEntry, clientId: validEntry.staffId }).clientId,
    ).toBe(validEntry.staffId);
    expect(
      registerEntrySchema.safeParse({
        ...validEntry,
        services: [{ ...validEntry.services[0], price: 2147483648 }],
        paymentAmount: 2147483648,
      }).success,
    ).toBe(false);
  });
  it("conserve le prix modifié pour la ligne de visite", () => {
    const parsed = registerEntrySchema.parse(validEntry);
    expect(parsed.services[0].price).toBe(13_500);
  });

  it("accepte un sexe client optionnel", () => {
    expect(registerEntrySchema.safeParse({ ...validEntry, sex: "" }).success).toBe(true);
    expect(registerEntrySchema.parse(validEntry).sex).toBe("femme");
  });
  it("sépare une visite payée d’un rendez-vous avec acompte facultatif", () => {
    expect(registerEntrySchema.parse(validEntry).entryMode).toBe("completed_visit");
    expect(
      registerEntrySchema.safeParse({
        ...validEntry,
        entryMode: "appointment",
        paymentAmount: 0,
        paymentMethod: "",
      }).success,
    ).toBe(true);
    expect(
      registerEntrySchema.safeParse({
        ...validEntry,
        entryMode: "appointment",
        paymentAmount: 14_000,
      }).success,
    ).toBe(false);
  });
});
