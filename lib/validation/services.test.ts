import { describe, expect, it } from "vitest";
import { serviceInputSchema, serviceStatusSchema } from "./services";

const CATEGORY_ID = "7cd9a8e4-b350-4a03-b1a7-904ba3ddb07e";

describe("validation des prestations", () => {
  it("normalise une prestation avec une catégorie existante", () => {
    expect(
      serviceInputSchema.parse({
        name: "  Coupe femme  ",
        defaultPrice: "12500",
        categoryId: CATEGORY_ID,
        newCategory: "",
      }),
    ).toEqual({
      name: "Coupe femme",
      defaultPrice: 12_500,
      categoryId: CATEGORY_ID,
      newCategory: undefined,
    });
  });

  it("accepte la création inline d'une catégorie", () => {
    expect(
      serviceInputSchema.parse({
        name: "Balayage",
        defaultPrice: "20000",
        categoryId: "",
        newCategory: "  Coloration  ",
      }).newCategory,
    ).toBe("Coloration");
  });

  it.each([
    { name: "", defaultPrice: "5000", categoryId: CATEGORY_ID, newCategory: "" },
    { name: "Tresses", defaultPrice: "0", categoryId: CATEGORY_ID, newCategory: "" },
    { name: "Tresses", defaultPrice: "2500.5", categoryId: CATEGORY_ID, newCategory: "" },
    { name: "Tresses", defaultPrice: "2500", categoryId: "", newCategory: "" },
    {
      name: "Tresses",
      defaultPrice: "2500",
      categoryId: CATEGORY_ID,
      newCategory: "Coiffure",
    },
  ])("refuse une prestation invalide", (input) => {
    expect(serviceInputSchema.safeParse(input).success).toBe(false);
  });

  it("limite les mutations d'état aux opérations prévues", () => {
    expect(serviceStatusSchema.safeParse({ id: CATEGORY_ID, operation: "archive" }).success).toBe(
      true,
    );
    expect(serviceStatusSchema.safeParse({ id: CATEGORY_ID, operation: "delete" }).success).toBe(
      false,
    );
  });
});
