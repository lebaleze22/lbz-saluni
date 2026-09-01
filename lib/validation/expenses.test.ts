import { describe, expect, it } from "vitest";
import { expenseInputSchema } from "./expenses";

describe("expenseInputSchema", () => {
  it("accepte une dépense avec une catégorie libre optionnelle", () => {
    const parsed = expenseInputSchema.parse({
      description: "  Achat de shampoings  ",
      amount: "15000",
      category: "  Fournitures  ",
      occurredAt: "2026-08-31",
    });

    expect(parsed).toEqual({
      description: "Achat de shampoings",
      amount: 15_000,
      category: "Fournitures",
      occurredAt: "2026-08-31",
    });
  });

  it("normalise une catégorie vide et refuse les montants ou dates invalides", () => {
    expect(
      expenseInputSchema.parse({
        description: "Loyer",
        amount: "250000",
        category: "  ",
        occurredAt: "2026-08-01",
      }).category,
    ).toBeUndefined();

    expect(
      expenseInputSchema.safeParse({
        description: "Loyer",
        amount: "0",
        category: "",
        occurredAt: "2026-02-30",
      }).success,
    ).toBe(false);
  });
});
